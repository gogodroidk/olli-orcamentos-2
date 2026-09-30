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
 * A LEITURA (que linha do Supabase conta como parada, como serviço concluído) também
 * não é espelho: mora em `src/services/radarDinheiro.ts` (alias `@radar-dinheiro`), o
 * módulo puro que este painel E o resumo diário por e-mail (worker) leem. Os "Clientes
 * para lembrar" deste painel são `listarClientesParaLembrarDasLinhas` — a MESMA função
 * que conta os clientes para lembrar no e-mail das 7h; o número do e-mail e o do
 * cartão são um só (teste de paridade em `worker/scripts/teste-resumo-dinheiro-policy.js`).
 *
 * ⚠️ NOTA DE MANUTENÇÃO: o app converte o SQLite em "serviços concluídos" em
 * `servicosConcluidos` (src/services/radarClientes.ts); o painel e o e-mail, em
 * `servicosConcluidosDasLinhas` (radarDinheiro.ts). Quem mexer num mexe no outro.
 */
import type { Empresa } from "@dominio";
import { listarClientesParaLembrarDasLinhas } from "@radar-dinheiro";
import { type CobrancaPronta, prepararCobranca } from "../../../../../src/utils/cobrancaCliente";
import { type ClienteParaLembrar, mensagemLembrete } from "../../../../../src/utils/posVenda";
import { type DinheiroParado, numeroWhatsapp } from "./financeiro";
import type { AgendamentoRow, OrcamentoRow, ReciboRow } from "./helpers";

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
 * Clientes na hora de ser lembrados — a MESMA regra do celular (`utils/posVenda.ts`),
 * com a MESMA leitura das linhas do Supabase que o resumo diário por e-mail usa
 * (`listarClientesParaLembrarDasLinhas`, `@radar-dinheiro`).
 */
export function listarParaLembrar(entrada: EntradaParaLembrar, agora: Date = new Date()): ClienteParaLembrar[] {
	return listarClientesParaLembrarDasLinhas(entrada, agora);
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
