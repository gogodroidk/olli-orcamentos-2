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
import { brParaYmd } from "@/olli/datas";
import type { AgendamentoRow, OrcamentoRow, ReciboRow } from "./helpers";
import { valorOrcamento } from "./helpers";

/** Proposta VIVA na mão do cliente — ainda pode virar dinheiro. */
export const STATUS_EM_JOGO = ["enviado", "visualizado", "em_negociacao", "aguardando_assinatura"] as const;

/** Proposta GANHA — o dinheiro é seu, falta entrar. */
export const STATUS_A_RECEBER = ["aprovado", "convertido"] as const;

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

/** Valor de um recibo: coluna → blob. `null` = não sei (não vira zero). */
export function valorRecibo(r: ReciboRow): number | null {
	const candidatos = [r.valor_recebido, r.dados?.valorRecebido];
	for (const c of candidatos) {
		if (typeof c === "number" && Number.isFinite(c)) return c;
	}
	return null;
}

/**
 * Ganho mas ainda não pago: Σ(valor do orçamento aprovado/convertido) − Σ(recibos dele).
 *
 * O saldo é calculado POR ORÇAMENTO e travado em 0 no piso. Sem esse trava-piso, um
 * cliente que pagou a mais num serviço (troco, gorjeta, valor arredondado) abateria a
 * dívida de OUTRO cliente e o dono cobraria de menos — dinheiro que some da tela.
 */
export function calcularAReceber(orcamentos: OrcamentoRow[], recibos: ReciboRow[]): SomaAReceber {
	// Quanto já entrou por orçamento.
	const recebidoPorOrc = new Map<string, number>();
	for (const r of recibos) {
		const orcId = (r.orcamento_id ?? r.dados?.orcamentoId ?? "").trim();
		if (!orcId) continue; // recibo avulso (sem orçamento) não abate ninguém
		const v = valorRecibo(r);
		if (v === null) continue;
		recebidoPorOrc.set(orcId, (recebidoPorOrc.get(orcId) ?? 0) + v);
	}

	let total = 0;
	let itens = 0;
	let semValor = 0;
	let jaRecebido = 0;
	let quitados = 0;

	for (const o of orcamentos) {
		if (!aReceber.has(slug(o.status))) continue;
		const v = valorOrcamento(o);
		if (v === null) {
			semValor++;
			continue;
		}
		const pago = recebidoPorOrc.get((o.id ?? "").trim()) ?? 0;
		jaRecebido += Math.min(pago, v);
		const saldo = Math.max(0, v - pago);
		if (saldo <= 0) {
			quitados++;
			continue;
		}
		total += saldo;
		itens++;
	}

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

export interface Parado {
	id: string;
	numero: string;
	cliente: string;
	/** Telefone cru do blob (pode ser vazio → sem WhatsApp possível). */
	telefone: string;
	valor: number | null;
	status: string;
	/** Dias inteiros desde a última mexida no orçamento. */
	dias: number;
}

/** Última mexida (atualizado_em → criado_em). NaN quando nenhuma data é legível. */
function ultimaMexida(o: OrcamentoRow): number {
	for (const iso of [o.atualizado_em, o.dados?.atualizadoEm, o.criado_em, o.dados?.criadoEm]) {
		if (!iso) continue;
		const t = new Date(iso).getTime();
		if (Number.isFinite(t)) return t;
	}
	return Number.NaN;
}

/**
 * Orçamentos ENVIADOS/VISUALIZADOS esquecidos há mais de `minDias`. É a lista que
 * faz o dono ganhar dinheiro: proposta na mão do cliente, sem resposta, sem cobrança.
 * Mais parado primeiro. Sem data legível → fica de fora (não inventamos "0 dias").
 */
export function listarParados(orcamentos: OrcamentoRow[], minDias = 3, agora: Date = new Date()): Parado[] {
	const parados: Parado[] = [];
	for (const o of orcamentos) {
		const s = slug(o.status);
		if (s !== "enviado" && s !== "visualizado") continue;
		const t = ultimaMexida(o);
		if (!Number.isFinite(t)) continue;
		const dias = Math.floor((agora.getTime() - t) / 86_400_000);
		if (dias < minDias) continue;
		parados.push({
			id: (o.id ?? "").trim(),
			numero: (o.numero ?? o.dados?.numero ?? "").trim(),
			cliente: (o.cliente_nome ?? o.dados?.clienteNome ?? "").trim() || "Cliente não informado",
			telefone: (o.dados?.clienteTelefone ?? "").trim(),
			valor: valorOrcamento(o),
			status: s,
			dias,
		});
	}
	return parados.sort((a, b) => b.dias - a.dias);
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
 * não dá para um celular brasileiro plausível. Devolver `null` é obrigatório: um
 * link montado com número torto abre uma conversa com um DESCONHECIDO.
 */
export function numeroWhatsapp(telefone: string): string | null {
	let d = (telefone ?? "").replace(/\D/g, "");
	if (!d) return null;
	if (d.startsWith("0")) d = d.replace(/^0+/, ""); // "0 11 9..." (operadora)
	if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d; // já veio com país
	if (d.length === 10 || d.length === 11) return `55${d}`; // DDD + fixo/celular
	return null;
}

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
