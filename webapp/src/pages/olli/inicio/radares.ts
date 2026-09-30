/**
 * OS RADARES DO PAINEL — a ponte para as MESMAS palavras, o MESMO Pix e a MESMA regra
 * de pós-venda do celular.
 *
 * ═══ O QUE FOI REUSADO DE VERDADE (não é cópia) ═══
 * Os arquivos de radar do app (`src/services/radarCobranca.ts`, `radarClientes.ts`,
 * `radarFollowUp.ts`) NÃO podem ser importados aqui: cada um deles abre o SQLite do
 * aparelho (`database/database.ts` → expo-sqlite) e lê AsyncStorage. São services de
 * leitura local; a fonte do painel é o Supabase.
 *
 * O que dentro deles é REGRA foi extraído para módulos PUROS e é importado aqui:
 *   • `prepararCobranca` ........... `src/utils/cobrancaCliente.ts` — a mensagem de
 *                                    cobrança E o Pix Copia e Cola (chave reconhecida,
 *                                    conferência EMV+CRC, saldo em pagamento parcial).
 *                                    Um dígito errado e o banco recusa; ter duas
 *                                    implementações seria garantir que uma cobra errado.
 *   • `listarClientesParaLembrar` .. `src/utils/posVenda.ts` — quem está na hora de
 *   • `mensagemLembrete`            lembrar (intervalo do ofício, lembrete recente não
 *                                    insiste) e o texto em nome do prestador.
 * O precedente desse import cruzado é `webapp/src/olli/pdf/imprimirOrcamento.ts`, que
 * já puxa o gerador de PDF do app. Estes módulos são TypeScript puro (só `Intl` e
 * string) — não arrastam react-native.
 *
 * O que SOBROU aqui é só a LEITURA: converter as linhas do Supabase nos mesmos sinais
 * que o app lê do SQLite (orçamento aprovado/convertido, agendamento concluído, recibo).
 *
 * ⚠️ NOTA DE MANUTENÇÃO: quem mexer em `servicosConcluidos` (src/services/radarClientes.ts)
 * precisa mexer em `servicosDasLinhas` abaixo no mesmo commit — a regra é compartilhada,
 * a leitura não.
 */
import type { Empresa } from "@dominio";
import { type CobrancaPronta, prepararCobranca } from "../../../../../src/utils/cobrancaCliente";
import {
	type ClienteParaLembrar,
	listarClientesParaLembrar,
	mensagemLembrete,
	msDe,
	msDoRecibo,
	retornoDoOficio,
	type ServicoConcluido,
} from "../../../../../src/utils/posVenda";
import { type DinheiroParado, numeroWhatsapp } from "./financeiro";
import type { AgendamentoRow, OrcamentoRow, ReciboRow } from "./helpers";

const slug = (s?: string | null) => (s ?? "").trim().toLowerCase();

/* ═════════════════  1. COBRAR O DINHEIRO PARADO (1 toque)  ═════════════════ */

/**
 * A cobrança pronta de uma linha do dinheiro parado — texto + Pix pelo MESMO código
 * do celular. `null` quando o orçamento não tem o blob `dados` (sem ele não dá para
 * chamar a função de mensagem do app; inventar um texto parecido aqui recriaria o
 * problema que este arquivo existe para evitar).
 *
 * Com pagamento parcial, o Pix leva o SALDO (`item.saldo`) e a mensagem diz quanto
 * falta — nunca o valor cheio para quem já pagou o sinal.
 */
export function cobrancaDoItem(item: DinheiroParado, empresa: Empresa | null): CobrancaPronta | null {
	if (!item.dados) return null;
	// `dias === null` (nenhuma data legível) entra como 0: é o tom MAIS leve da
	// mensagem do app. Chutar "12 dias" para um orçamento sem data seria acusar o
	// cliente de um atraso que não sabemos.
	return prepararCobranca({
		orcamento: item.dados,
		empresa,
		diasParado: item.dias ?? 0,
		valorEmAberto: item.saldo,
	});
}

/**
 * O link de WhatsApp que cobra um orçamento aprovado — com o Pix já dentro do texto.
 *
 * `null` (botão não aparece) quando o telefone não vira um celular BR plausível
 * (`numeroWhatsapp` recusa; um `wa.me` com número torto abre conversa com um
 * DESCONHECIDO) ou quando não há blob `dados` (ver `cobrancaDoItem`).
 */
export function linkCobranca(item: DinheiroParado, empresa: Empresa | null): string | null {
	const num = numeroWhatsapp(item.telefone);
	if (!num) return null;
	const cobranca = cobrancaDoItem(item, empresa);
	if (!cobranca) return null;
	return `https://wa.me/${num}?text=${encodeURIComponent(cobranca.texto)}`;
}

/* ═════════════════  2. CLIENTES PARA LEMBRAR (pós-venda)  ═════════════════ */

/** Linha enxuta de `clientes` (o radar só precisa de quem é e como falar com ele). */
export interface ClienteRow {
	id?: string | null;
	nome?: string | null;
	telefone?: string | null;
}

/** Colunas mínimas de `agendamentos` para o radar (nada de blob). */
export const COLUNAS_AGENDA_RADAR = "cliente_id, status, inicio, fim";
/** Colunas mínimas de `clientes` para o radar. */
export const COLUNAS_CLIENTES_RADAR = "id, nome, telefone";

export interface EntradaParaLembrar {
	clientes: ClienteRow[];
	orcamentos: OrcamentoRow[];
	agendamentos: AgendamentoRow[];
	recibos: ReciboRow[];
	/** clienteId → ISO até quando ficou adiado no celular (`radar.snooze`). */
	adiados: Record<string, string>;
	/** clienteId → ISO do último lembrete enviado (celular OU painel, `posvenda.lembrados`). */
	lembrados: Record<string, string>;
	/** Ofícios da empresa (define o intervalo e o serviço citado na mensagem). */
	verticais: Empresa["verticais"];
}

/**
 * As linhas do Supabase viradas nos MESMOS sinais de "serviço concluído" que o app lê
 * do SQLite (ver `servicosConcluidos` em `src/services/radarClientes.ts`):
 *  • orçamento aprovado ou convertido — data da aprovação ≈ última escrita;
 *  • agendamento CONCLUÍDO — pelo fim (ou início);
 *  • recibo não estornado — pela data do recebimento em DD/MM/AAAA (lida sem trocar
 *    dia e mês, `msDoRecibo`), caindo para a criação.
 */
export function servicosDasLinhas(entrada: Pick<EntradaParaLembrar, "orcamentos" | "agendamentos" | "recibos">): ServicoConcluido[] {
	const servicos: ServicoConcluido[] = [];
	for (const o of entrada.orcamentos) {
		const st = slug(o.status);
		if (st !== "aprovado" && st !== "convertido") continue;
		servicos.push({
			clienteId: o.cliente_id ?? o.dados?.clienteId,
			quando: msDe(o.dados?.atualizadoEm ?? o.atualizado_em ?? o.criado_em ?? o.dados?.criadoEm),
		});
	}
	for (const a of entrada.agendamentos) {
		if (slug(a.status) !== "concluido") continue;
		servicos.push({ clienteId: a.cliente_id, quando: msDe(a.fim) ?? msDe(a.inicio) });
	}
	for (const r of entrada.recibos) {
		if (r.dados?.estornadoEm) continue;
		servicos.push({
			clienteId: r.cliente_id ?? r.dados?.clienteId,
			quando: msDoRecibo(r.dados?.dataRecebimento, r.criado_em ?? r.dados?.criadoEm),
		});
	}
	return servicos;
}

/** Clientes na hora de ser lembrados — a MESMA regra do celular (`utils/posVenda.ts`). */
export function listarParaLembrar(entrada: EntradaParaLembrar, agora: Date = new Date()): ClienteParaLembrar[] {
	return listarClientesParaLembrar({
		clientes: entrada.clientes,
		servicos: servicosDasLinhas(entrada),
		mesesIntervalo: retornoDoOficio(entrada.verticais).meses,
		lembrados: entrada.lembrados,
		adiados: entrada.adiados,
		agora,
	});
}

/**
 * O link de WhatsApp que lembra o cliente da manutenção — texto da MESMA
 * `mensagemLembrete` do app, em nome do prestador (`nomePrestador`, caindo para o
 * nome da empresa; sem empresa carregada, sai sem o nome — nunca com um nome chutado).
 * `null` quando o telefone não permite.
 */
export function linkLembrete(item: ClienteParaLembrar, empresa: Empresa | null): string | null {
	const num = numeroWhatsapp(item.telefone);
	if (!num) return null;
	const quem = (empresa?.nomePrestador || empresa?.nome || "").trim() || null;
	return `https://wa.me/${num}?text=${encodeURIComponent(mensagemLembrete(item, empresa?.verticais, quem))}`;
}
