/**
 * O DINHEIRO — as contas do painel Início.
 *
 * Funções PURAS (recebem as linhas, devolvem números). Motivo: uma conta de caixa
 * tem que ser auditável e testável sem React, e nenhuma delas pode "chutar".
 *
 * ═══ REGRAS QUE ESTAS CONTAS OBEDECEM ═══
 * 1. NÃO SEI ≠ ZERO. Toda soma devolve, junto do total, quantas linhas ficaram de
 *    fora por falta de dado (`semValor`, `semData`). A tela mostra esse aviso. Um
 *    "R$ 0,00" silencioso em cima de dado faltante é mentira sobre o caixa do dono.
 * 2. RECIBO: a data de recebimento sai do BLOB (`dados.dataRecebimento`, DD/MM/AAAA).
 *    A coluna `data_recebimento` está CORROMPIDA por um bug do app (grava DD/MM/AAAA
 *    cru numa coluna timestamptz com DateStyle ISO,MDY → 10/07 vira 7 de outubro).
 *    Ver o comentário em `webapp/src/olli/datas.ts`.
 * 3. A lixeira já foi filtrada lá atrás (`useOlliList` só traz `excluido_em IS NULL`).
 */
import type { Orcamento } from "@dominio";
import {
	contarRascunhosEsquecidos,
	type DinheiroParadoLinha,
	listarDinheiroParado as listarDinheiroParadoRegra,
	listarPropostasParadas,
	type PropostaParada,
	type RadarDinheiroResultado,
	STATUS_A_RECEBER,
	STATUS_EM_JOGO,
	valorRecibo,
} from "@radar-dinheiro";
import { brParaYmd } from "@/olli/datas";
import { numeroWhatsAppBR } from "../../../../../src/utils/telefoneWhatsapp";
import type { AgendamentoRow, OrcamentoRow, ReciboRow } from "./helpers";
import { valorOrcamento } from "./helpers";

/**
 * AS REGRAS DOS RADARES MORAM EM `src/services/radarDinheiro.ts` (alias `@radar-dinheiro`).
 *
 * Desde 30/09/2026 o resumo diário por e-mail (worker) calcula o mesmo "dinheiro
 * parado" que esta tela mostra — e o e-mail manda o dono para cá. Duas cópias da
 * conta (uma aqui, outra no servidor) garantiriam, um dia, um e-mail dizendo
 * "R$ 2.340 parado" e um painel dizendo R$ 1.900. Por isso a regra saiu deste arquivo
 * e virou módulo puro compartilhado; aqui ficam só os tipos da tela e as contas que
 * são SÓ do painel (em jogo, recebido no mês, taxa de aprovação).
 *
 * `STATUS_EM_JOGO` continua sendo a `STATUS_PROPOSTA_ENVIADA` do app (o módulo
 * compartilhado a importa de `src/types`), e `STATUS_A_RECEBER` = aprovado/convertido.
 */
export { STATUS_A_RECEBER, STATUS_EM_JOGO, valorRecibo };

const slug = (s?: string | null) => (s ?? "").trim().toLowerCase();

const emJogo = new Set<string>(STATUS_EM_JOGO);
const aReceber = new Set<string>(STATUS_A_RECEBER);

/** Resultado de uma soma em dinheiro: total + rastro do que ficou de fora. */
export interface Soma {
	total: number;
	/** Quantos documentos entraram na conta. */
	itens: number;
	/** Quantos ficaram de FORA por não ter valor legível (nunca somados como zero). */
	semValor: number;
}

/* ─────────────────────────  1. EM JOGO  ───────────────────────── */

/** Soma dos orçamentos que estão com o cliente e ainda podem ser aprovados. */
export function calcularEmJogo(orcamentos: OrcamentoRow[]): Soma {
	let total = 0;
	let itens = 0;
	let semValor = 0;
	for (const o of orcamentos) {
		if (!emJogo.has(slug(o.status))) continue;
		const v = valorOrcamento(o);
		if (v === null) {
			semValor++;
			continue;
		}
		total += v;
		itens++;
	}
	return { total, itens, semValor };
}

/* ─────────────────────────  2. A RECEBER  ───────────────────────── */

export interface SomaAReceber extends Soma {
	/** Quanto desses orçamentos ganhos JÁ entrou (soma dos recibos deles). */
	jaRecebido: number;
	/** Orçamentos ganhos já quitados (saldo zero) — não aparecem no "a receber". */
	quitados: number;
}

/** Uma linha do dinheiro parado: um orçamento GANHO que ainda não foi pago por inteiro.
 *  `dados` é o blob do orçamento — alimenta a MESMA função de mensagem do celular. */
export type DinheiroParado = DinheiroParadoLinha<Orcamento>;

/** O radar de dinheiro parado inteiro: a lista + os totais que a tela mostra. */
export interface RadarDinheiro extends SomaAReceber, RadarDinheiroResultado<Orcamento> {}

/**
 * O RADAR DE DINHEIRO PARADO — orçamento ganho que ainda não virou dinheiro no bolso.
 *
 * A regra (aprovado OU convertido com SALDO > 0, abatendo recibos por orçamento, com
 * trava-piso; OS concluída tira do radar; mais parado primeiro) está documentada em
 * `listarDinheiroParado` de `src/services/radarDinheiro.ts` — é a MESMA função que o
 * resumo diário por e-mail usa no servidor. O superconjunto em relação ao celular
 * (`radarCobranca.ts`: aprovado sem recibo) continua de propósito: pagamento parcial
 * é dinheiro parado, e o painel nunca mostra menos que o app.
 */
export function listarDinheiroParado(
	orcamentos: OrcamentoRow[],
	recibos: ReciboRow[],
	agora: Date = new Date(),
	orcamentosFinalizados: ReadonlySet<string> = new Set(),
): RadarDinheiro {
	return listarDinheiroParadoRegra(orcamentos, recibos, agora, orcamentosFinalizados);
}

/**
 * Ganho mas ainda não pago: Σ(valor do orçamento aprovado/convertido) − Σ(recibos dele).
 *
 * Derivado de `listarDinheiroParado` de propósito: o KPI "A receber" e o radar de
 * dinheiro parado são o MESMO dinheiro, e agora saem da mesma passagem de código —
 * não há como um dizer R$ 2.340 e o outro R$ 1.900 na mesma tela.
 */
export function calcularAReceber(orcamentos: OrcamentoRow[], recibos: ReciboRow[], orcamentosFinalizados: ReadonlySet<string> = new Set()): SomaAReceber {
	const { total, itens, semValor, jaRecebido, quitados } = listarDinheiroParado(orcamentos, recibos, new Date(), orcamentosFinalizados);
	return { total, itens, semValor, jaRecebido, quitados };
}

/* ─────────────────────────  3. RECEBIDO NO MÊS  ───────────────────────── */

export interface SomaRecebida extends Soma {
	/** Recibos sem data legível no blob — NÃO entram na conta e são anunciados. */
	semData: number;
}

/** 'DD/MM/AAAA' do BLOB → 'YYYY-MM' (ou null quando a data não é confiável). */
function competencia(r: ReciboRow): string | null {
	const br = r.dados?.dataRecebimento;
	if (!br) return null;
	const ymd = brParaYmd(br);
	return ymd ? ymd.slice(0, 7) : null;
}

/** Dinheiro que ENTROU no mês de referência (default: mês corrente). */
export function calcularRecebidoNoMes(recibos: ReciboRow[], ref: Date = new Date()): SomaRecebida {
	const alvo = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
	let total = 0;
	let itens = 0;
	let semValor = 0;
	let semData = 0;

	for (const r of recibos) {
		const comp = competencia(r);
		if (comp === null) {
			semData++;
			continue;
		}
		if (comp !== alvo) continue;
		const v = valorRecibo(r);
		if (v === null) {
			semValor++;
			continue;
		}
		total += v;
		itens++;
	}
	return { total, itens, semValor, semData };
}

/* ─────────────────────────  4. TAXA DE APROVAÇÃO  ───────────────────────── */

export interface TaxaAprovacao {
	/** 0–100. `null` = não houve proposta no período (vazio de VERDADE, não erro). */
	taxa: number | null;
	aprovados: number;
	/** Denominador: propostas que SAÍRAM do rascunho no período (foram ao cliente). */
	propostas: number;
	dias: number;
}

/**
 * Das propostas criadas nos últimos N dias e efetivamente enviadas ao cliente
 * (status ≠ rascunho), quantas foram aprovadas/convertidas.
 *
 * Rascunho fica FORA do denominador de propósito: um orçamento que nunca saiu da
 * gaveta não foi recusado por ninguém — contá-lo afundaria a taxa e faria o dono
 * achar que vende mal quando na verdade só não enviou.
 */
export function calcularTaxaAprovacao(orcamentos: OrcamentoRow[], dias = 30, agora: Date = new Date()): TaxaAprovacao {
	const limite = agora.getTime() - dias * 86_400_000;
	let aprovados = 0;
	let propostas = 0;

	for (const o of orcamentos) {
		const criado = o.criado_em ? new Date(o.criado_em).getTime() : Number.NaN;
		if (!Number.isFinite(criado) || criado < limite) continue;
		const s = slug(o.status);
		if (!s || s === "rascunho") continue;
		propostas++;
		if (aReceber.has(s)) aprovados++;
	}

	return {
		taxa: propostas > 0 ? (aprovados / propostas) * 100 : null,
		aprovados,
		propostas,
		dias,
	};
}

/* ─────────────────────────  PARADOS / COBRAR  ───────────────────────── */

export type Parado = PropostaParada;

/**
 * Propostas JÁ ENVIADAS ao cliente e esquecidas há `minDias` ou mais — o degrau ANTES
 * do dinheiro parado. É `listarPropostasParadas` de `src/services/radarDinheiro.ts`
 * (o mesmo limiar de 3 dias do `radarFollowUp.ts` do celular, o mesmo proxy
 * `atualizado_em → criado_em`, a mesma `STATUS_PROPOSTA_ENVIADA`) — e é a mesma conta
 * que o resumo diário por e-mail faz no servidor.
 */
export function listarParados(orcamentos: OrcamentoRow[], minDias = 3, agora: Date = new Date()): Parado[] {
	return listarPropostasParadas(orcamentos, minDias, agora);
}

/**
 * Rascunhos que o dono montou e nunca mandou (mexidos há `minDias` ou mais). Não são
 * "parados" de cobrar — o cliente nem viu —, mas a tela não pode afirmar "nada parado"
 * com eles na gaveta. Regra única em `src/services/radarDinheiro.ts`.
 */
export function contarRascunhos(orcamentos: OrcamentoRow[], minDias = 3, agora: Date = new Date()): number {
	return contarRascunhosEsquecidos(orcamentos, minDias, agora);
}

/* ─────────────────────────  WHATSAPP  ───────────────────────── */

/**
 * Cor da marca WhatsApp e o texto que passa AA em cima dela. Branco sobre #25D366
 * dá 2,0:1 (reprova); este escuro dá 7,7:1. Constante única para o painel não
 * reinventar (e errar de novo) a cada botão de "ação WhatsApp".
 */
export const WHATSAPP_VERDE = "#25D366";
export const WHATSAPP_TEXTO = "#0A2547";

/**
 * Telefone BR → número do wa.me (55 + DDD + número), ou `null` quando o telefone
 * não dá para um telefone brasileiro plausível. Devolver `null` é obrigatório: um
 * link montado com número torto abre uma conversa com um DESCONHECIDO.
 *
 * É a regra ÚNICA do app (`src/utils/telefoneWhatsapp.ts`), reexportada com o nome
 * que o painel já usa — painel e celular mandam para o MESMO número.
 */
export const numeroWhatsapp: (telefone: unknown) => string | null = numeroWhatsAppBR;

/** Texto de cobrança EDUCADA — quem manda é o dono, com um toque, sem constranger. */
export function textoCobranca(p: Parado, empresa?: string): string {
	const primeiro = p.cliente.split(/\s+/)[0];
	const trata = primeiro && primeiro !== "Cliente" ? `Olá, ${primeiro}!` : "Olá!";
	const quem = empresa?.trim() ? ` Aqui é da ${empresa.trim()}.` : "";
	const doc = p.numero ? ` o orçamento ${p.numero}` : " o orçamento que enviei";
	return (
		`${trata}${quem} Tudo bem?\n\n` +
		`Passando para saber se você conseguiu ver${doc}. ` +
		"Se tiver alguma dúvida ou quiser ajustar algo, é só me falar — fico à disposição.\n\n" +
		"Obrigado!"
	);
}

/** URL pronta do WhatsApp, ou `null` se o telefone não permite. */
export function linkWhatsapp(p: Parado, empresa?: string): string | null {
	const num = numeroWhatsapp(p.telefone);
	if (!num) return null;
	return `https://wa.me/${num}?text=${encodeURIComponent(textoCobranca(p, empresa))}`;
}

/* ─────────────────────────  HOJE (agenda)  ───────────────────────── */

/** Compromissos de HOJE (fuso local), cancelados fora, mais cedo primeiro. */
export function agendamentosDeHoje(rows: AgendamentoRow[], agora: Date = new Date()): AgendamentoRow[] {
	const chave = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
	const hoje = chave(agora);
	return rows
		.filter((a) => {
			if (slug(a.status) === "cancelado") return false;
			if (!a.inicio) return false;
			const d = new Date(a.inicio);
			return !Number.isNaN(d.getTime()) && chave(d) === hoje;
		})
		.sort((a, b) => new Date(a.inicio ?? 0).getTime() - new Date(b.inicio ?? 0).getTime());
}

/** Rótulo do filtro de status para a URL da lista (`/orcamentos?status=a,b`). */
export function paramStatus(statuses: readonly string[]): string {
	return statuses.join(",");
}
