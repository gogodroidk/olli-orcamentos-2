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
 * O que SOBROU e teve de ser espelhado é só a LEITURA (que linha conta como parada,
 * como esfriada) — e cada espelho carrega, no comentário, de onde veio a regra e onde
 * ele difere. Ver `listarDinheiroParado` em `financeiro.ts` e `listarEsfriando` abaixo.
 *
 * ⚠️ NOTA DE MANUTENÇÃO: o aviso gêmeo deste, do lado do app (`src/services/radar*.ts`),
 * não pôde ser escrito — `src/` está fora do alcance de quem escreveu este arquivo.
 * Quem mexer na regra de QUALQUER radar do app precisa passar por aqui.
 */
import type { Empresa } from "@dominio";
import { brParaYmd } from "@/olli/datas";
import { montarMensagemCobranca, montarMensagemReconquista } from "../../../../../src/utils/mensagensOrcamento";
import { gerarPixCopiaECola } from "../../../../../src/utils/pixBrCode";
import { type DinheiroParado, numeroWhatsapp } from "./financeiro";
import type { AgendamentoRow, OrcamentoRow, ReciboRow } from "./helpers";

const MS_POR_DIA = 86_400_000;

const slug = (s?: string | null) => (s ?? "").trim().toLowerCase();

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

/** Limiar de dias sem contato (~5 meses) — o MESMO `DIAS_LIMIAR` de `radarClientes.ts`. */
export const DIAS_ESFRIANDO = 150;

/**
 * Status de orçamento que contam como interação com o cliente.
 *
 * ESPELHO LITERAL de `radarClientes.ts` (`mapaUltimaInteracao`): lá são exatamente
 * 'aprovado', 'enviado' e 'aguardando_assinatura'. Repare que NÃO é a mesma lista de
 * `STATUS_PROPOSTA_ENVIADA` — 'visualizado' e 'em_negociacao' ficam de fora. Pode
 * parecer descuido do app, mas espelhar é o certo aqui: se o painel incluísse os dois,
 * um cliente sumido há 6 meses apareceria "quente" no computador e "frio" no celular,
 * e o dono não saberia em qual acreditar. Mudar isso é decisão de produto, e tem que
 * mudar nos DOIS lados no mesmo commit.
 */
const STATUS_INTERACAO = new Set(["aprovado", "enviado", "aguardando_assinatura"]);

/** ms da data, ou `null` quando não dá para ler (nunca vira "hoje" nem 1970). */
function ms(iso?: string | null): number | null {
	if (!iso) return null;
	const t = new Date(iso).getTime();
	return Number.isFinite(t) ? t : null;
}

/**
 * Quando o dinheiro deste recibo entrou, em ms.
 *
 * A data honesta do recibo é `dados.dataRecebimento`, em DD/MM/AAAA (ver
 * `webapp/src/olli/datas.ts`). O app faz `new Date('10/07/2026')` direto nessa string
 * e o JavaScript lê MM/DD — 10 de julho vira 7 de outubro, e a "última interação"
 * salta meses. Aqui convertemos antes (`brParaYmd`), então o painel acerta onde o
 * celular erra. É a única diferença deliberada em relação a `radarClientes.ts`, e ela
 * só pode empurrar um cliente para FORA do radar (data mais recente), nunca inventar
 * um cliente esfriado que não existe.
 */
function msRecibo(r: ReciboRow): number | null {
	const br = r.dados?.dataRecebimento;
	if (br) {
		const ymd = brParaYmd(br);
		if (ymd) return ms(ymd);
	}
	return ms(r.criado_em ?? r.dados?.criadoEm);
}

/** Maior ms entre os dados (ignorando nulos). */
function maisRecente(...valores: (number | null)[]): number | null {
	let melhor: number | null = null;
	for (const v of valores) {
		if (v === null) continue;
		if (melhor === null || v > melhor) melhor = v;
	}
	return melhor;
}

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
 * primeiro. Espelho de `clientesParaReconquistar` (`src/services/radarClientes.ts`):
 * mesmo limiar, mesmas três fontes de "última interação" (orçamento enviado/aprovado/
 * aguardando assinatura pelo `criadoEm`, agendamento CONCLUÍDO pelo fim, recibo), e a
 * mesma trava que importa: cliente sem NENHUMA interação nunca entra — é lead frio,
 * não manutenção perdida.
 *
 * Respeita o "adiar" feito no celular (`extras_sync`, chave `radar.snooze`) para o
 * painel não ressuscitar o cliente que o dono acabou de tirar do radar no aparelho. O
 * painel só LÊ esse mapa; adiar continua sendo do app (lá o adiamento é escrito e
 * sincronizado).
 */
export function listarEsfriando(entrada: EntradaEsfriando, agora: Date = new Date()): ClienteEsfriando[] {
	const { clientes, orcamentos, agendamentos, recibos, adiados } = entrada;

	const ultima = new Map<string, number>();
	const registrar = (clienteId?: string | null, quando?: number | null) => {
		const id = (clienteId ?? "").trim();
		if (!id || quando === null || quando === undefined) return;
		const atual = ultima.get(id);
		if (atual === undefined || quando > atual) ultima.set(id, quando);
	};

	for (const o of orcamentos) {
		if (!STATUS_INTERACAO.has(slug(o.status))) continue;
		registrar(o.cliente_id ?? o.dados?.clienteId, ms(o.criado_em ?? o.dados?.criadoEm));
	}
	for (const a of agendamentos) {
		if (slug(a.status) !== "concluido") continue;
		registrar(a.cliente_id, maisRecente(ms(a.fim), ms(a.inicio)));
	}
	for (const r of recibos) {
		registrar(r.cliente_id ?? r.dados?.clienteId, msRecibo(r));
	}

	const agoraMs = agora.getTime();
	const resultado: ClienteEsfriando[] = [];

	for (const c of clientes) {
		const id = (c.id ?? "").trim();
		if (!id) continue;
		const quando = ultima.get(id);
		if (quando === undefined) continue; // nunca interagiu → lead frio, fora do radar

		const ate = ms(adiados[id]);
		if (ate !== null && ate > agoraMs) continue; // adiado no celular, ainda vigente

		const dias = Math.floor((agoraMs - quando) / MS_POR_DIA);
		if (dias < DIAS_ESFRIANDO) continue;

		resultado.push({
			id,
			nome: (c.nome ?? "").trim() || "Cliente sem nome",
			telefone: (c.telefone ?? "").trim(),
			ultimaInteracao: new Date(quando).toISOString(),
			// Mesmo arredondamento do app (`mesesEntre`): dias/30, piso de 1 mês.
			meses: Math.max(1, Math.round(dias / 30)),
			dias,
		});
	}

	// Sumido há mais tempo primeiro — a mesma ordem do celular.
	return resultado.sort((a, b) => b.dias - a.dias);
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
