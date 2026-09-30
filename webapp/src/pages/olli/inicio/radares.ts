/**
 * OS RADARES DO PAINEL — a ponte para as MESMAS palavras e o MESMO Pix do celular,
 * mais a regra do cliente que esfriou.
 *
 * ═══ O QUE FOI REUSADO DE VERDADE (não é cópia) ═══
 * Os arquivos de radar do app (`src/services/radarCobranca.ts`, `radarClientes.ts`,
 * `radarFollowUp.ts`) NÃO podem ser importados aqui: cada um deles abre o SQLite do
 * aparelho (`database/database.ts` → expo-sqlite) e o `radarClientes` ainda lê
 * AsyncStorage. São services de leitura local; a fonte do painel é o Supabase.
 *
 * O que dentro deles é PURO foi importado, não reescrito:
 *   • `montarMensagemCobranca`  ─┐ `src/utils/mensagensOrcamento.ts` — as MESMAS
 *   • `montarMensagemReconquista`┘  frases que saem do celular. Se o texto mudar lá,
 *                                   muda aqui no mesmo commit; não há dois tons de voz.
 *   • `gerarPixCopiaECola` ......... `src/utils/pixBrCode.ts` — o BR Code do Pix é
 *                                    montado pelo MESMO código (um dígito errado e o
 *                                    banco recusa; ter duas implementações seria
 *                                    garantir que uma delas cobra errado um dia).
 *   • `STATUS_PROPOSTA_ENVIADA` .... via `@dominio` (ver `financeiro.ts`).
 * O precedente desse import cruzado é `webapp/src/olli/pdf/imprimirOrcamento.ts`, que
 * já puxa o gerador de PDF do app. Estes três módulos são TypeScript puro (só
 * `Intl` e string) — não arrastam react-native, então nem stub do Vite precisam.
 *
 * A LEITURA (que linha conta como parada, como esfriada) deixou de ser espelho em
 * 30/09/2026: mora em `src/services/radarDinheiro.ts` (alias `@radar-dinheiro`), o
 * módulo puro que este painel, o resumo diário por e-mail (worker) e os limiares do
 * app (`radarFollowUp.ts`, `radarClientes.ts`) leem. Quem mexer numa regra de radar
 * mexe lá, e as três pontas mudam juntas.
 */
import type { Empresa } from "@dominio";
import { LIMIAR_CLIENTE_SUMIDO_DIAS, listarClientesSumidos } from "@radar-dinheiro";
import { montarMensagemCobranca, montarMensagemReconquista } from "../../../../../src/utils/mensagensOrcamento";
import { gerarPixCopiaECola } from "../../../../../src/utils/pixBrCode";
import { type DinheiroParado, numeroWhatsapp } from "./financeiro";
import type { AgendamentoRow, OrcamentoRow, ReciboRow } from "./helpers";

/* ═════════════════  1. COBRAR O DINHEIRO PARADO (1 toque)  ═════════════════ */

/**
 * O link de WhatsApp que cobra um orçamento aprovado — com o Pix já dentro do texto.
 *
 * `null` (botão não aparece) em dois casos, os dois de propósito:
 *   • telefone que não vira um celular BR plausível — `numeroWhatsapp` já recusa;
 *     um `wa.me` com número torto abre conversa com um DESCONHECIDO;
 *   • orçamento sem o blob `dados` — sem ele não dá para chamar a função de mensagem
 *     do app, e inventar um texto parecido aqui recriaria o problema que este arquivo
 *     existe para evitar. (Na prática os dois andam juntos: o telefone mora no blob.)
 *
 * O Pix Copia e Cola só entra quando o orçamento NÃO tem pagamento nenhum ainda
 * (`jaPago === 0`). Com pagamento parcial, o código do app embute o valor CHEIO —
 * mandar isso para quem já pagou o sinal é pedir dinheiro a mais. Sem Pix, a própria
 * `montarMensagemCobranca` cai no fecho padrão ("qualquer dúvida sobre forma de
 * pagamento, é só me chamar"), que continua verdadeiro.
 */
export function linkCobranca(item: DinheiroParado, empresa: Empresa | null): string | null {
	const num = numeroWhatsapp(item.telefone);
	if (!num) return null;
	const orc = item.dados;
	if (!orc) return null;

	const chave = (orc.chavePix || empresa?.chavePix || "").trim();
	const pix =
		chave && item.jaPago === 0
			? gerarPixCopiaECola({
					chave,
					valor: orc.valorTotal,
					nome: empresa?.nome ?? "",
					cidade: empresa?.cidade ?? "",
					txid: orc.numero,
				})
			: "";

	// `dias === null` (nenhuma data legível) entra como 0: é o tom MAIS leve da
	// mensagem do app ("posso te ajudar a fechar o pagamento?"). Chutar "12 dias"
	// para um orçamento sem data seria acusar o cliente de um atraso que não sabemos.
	const texto = montarMensagemCobranca(orc, item.dias ?? 0, pix || undefined);
	return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}

/* ═════════════════  2. O CLIENTE QUE ESFRIOU  ═════════════════ */

/** Linha enxuta de `clientes` (o radar só precisa de quem é e como falar com ele). */
export interface ClienteRow {
	id?: string | null;
	nome?: string | null;
	telefone?: string | null;
}

export interface ClienteEsfriando {
	id: string;
	nome: string;
	telefone: string;
	/** ISO da última interação real (nunca vazio: sem interação o cliente não entra). */
	ultimaInteracao: string;
	/** Meses arredondados desde então — é o número que entra na mensagem. */
	meses: number;
	dias: number;
}

/** Colunas mínimas de `agendamentos` para o radar (nada de blob). */
export const COLUNAS_AGENDA_RADAR = "cliente_id, status, inicio, fim";
/** Colunas mínimas de `clientes` para o radar. */
export const COLUNAS_CLIENTES_RADAR = "id, nome, telefone";

/** Limiar de dias sem contato (~5 meses) — o MESMO de `radarClientes.ts`, lido de `@radar-dinheiro`. */
export const DIAS_ESFRIANDO = LIMIAR_CLIENTE_SUMIDO_DIAS;

export interface EntradaEsfriando {
	clientes: ClienteRow[];
	orcamentos: OrcamentoRow[];
	agendamentos: AgendamentoRow[];
	recibos: ReciboRow[];
	/** Mapa clienteId → ISO até quando ficou adiado no celular. Vazio = ninguém adiado. */
	adiados: Record<string, string>;
}

/**
 * Clientes que JÁ FORAM ATENDIDOS e sumiram há >= 150 dias — quem sumiu há mais tempo
 * primeiro. É `listarClientesSumidos` de `src/services/radarDinheiro.ts`: mesmo limiar
 * e mesmo conjunto de status de interação do `radarClientes.ts` do celular (aprovado,
 * enviado, aguardando_assinatura — sem 'visualizado'/'em_negociacao'), agendamento
 * CONCLUÍDO, recibo pela data de recebimento do BLOB convertida de DD/MM/AAAA (aqui o
 * painel acerta onde o celular lê MM/DD — a única diferença, e ela só pode tirar
 * cliente do radar, nunca inventar um). Cliente sem nenhuma interação nunca entra.
 * Respeita o "adiar" feito no celular (`extras_sync`/'radar.snooze'); o painel só lê.
 * O resumo diário por e-mail conta os sumidos com esta mesma função.
 */
export function listarEsfriando(entrada: EntradaEsfriando, agora: Date = new Date()): ClienteEsfriando[] {
	return listarClientesSumidos(entrada, agora);
}

/**
 * O link de WhatsApp que reconquista o cliente — texto vindo da MESMA
 * `montarMensagemReconquista` do app. `null` quando o telefone não permite (mesma
 * regra do botão de cobrança).
 *
 * O nome do prestador entra igual ao app: `nomePrestador`, caindo para `nome` da
 * empresa. Sem empresa carregada, a mensagem sai sem o nome (é o que o celular faz
 * quando o cache dele está vazio) — nunca com um nome chutado.
 */
export function linkReconquista(item: ClienteEsfriando, empresa: Empresa | null): string | null {
	const num = numeroWhatsapp(item.telefone);
	if (!num) return null;
	const quem = (empresa?.nomePrestador || empresa?.nome || "").trim() || null;
	return `https://wa.me/${num}?text=${encodeURIComponent(montarMensagemReconquista(item.nome, item.meses, quem))}`;
}
