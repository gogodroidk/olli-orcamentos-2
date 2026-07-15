/**
 * ASSINATURA — leitura e derivação do plano, espelho de `src/services/assinatura.ts`
 * (função `getResumoAssinatura`) e de `src/services/planos.ts` (`derivarPlano`).
 *
 * Por que não importamos aquele arquivo: ele puxa `AsyncStorage` e o client Supabase
 * do React Native. E `PlanoId` não vive em `src/types` (não dá para trazer por
 * `@dominio`). Então a REGRA é copiada — literalmente, com a fonte anotada.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * A REGRA QUE NÃO PODE SER QUEBRADA: ERRO ≠ "GRÁTIS"
 * ═══════════════════════════════════════════════════════════════════════════════
 * Uma falha de rede/RLS não é uma resposta. Se a leitura falhar e a tela mostrar
 * "Você está no plano Grátis", ela REBAIXA quem paga: o assinante abre o painel,
 * vê a página de vendas e conclui que perdeu o que comprou. Por isso o estado de
 * ERRO é um estado próprio, com "Tentar de novo" — e só uma resposta que AFIRMA
 * não haver linha de assinatura (`data === null`) devolve "Grátis".
 */

/** Cópia de `PlanoId` (src/services/planos.ts). */
export type PlanoId = "gratis" | "pro" | "empresa";

/**
 * Status da assinatura que contam como PAGO — cópia de `STATUS_PAGOS`
 * (src/services/planos.ts e assinatura.ts). `past_due` está aqui de propósito: a
 * cobrança falhou, mas o acesso continua durante a retentativa (não se corta o
 * serviço de quem só teve um cartão recusado).
 */
const STATUS_PAGOS = new Set(["active", "trialing", "past_due"]);

/** A linha de `public.assinaturas` — só as 3 colunas que o app tem grant para ler. */
export interface LinhaAssinatura {
	plano: string | null;
	status: string | null;
	current_period_end: string | null;
}

export interface ResumoAssinatura {
	/** O plano que vale AGORA (considera status e vencimento). */
	planoEfetivo: PlanoId;
	/** O plano que a linha registra (pode estar cancelado/vencido). */
	planoContratado: PlanoId;
	/** Status bruto do provedor (active/trialing/past_due/canceled/…). */
	status?: string;
	/** Fim do período atual / próxima cobrança (ISO). */
	proximaCobranca?: string;
	/** Pago e vigente agora. */
	ativo: boolean;
	/** Pago, porém a última cobrança FALHOU (past_due) — acesso mantido, mas tem que resolver. */
	pagamentoFalhou: boolean;
}

function mapearPlano(v: unknown): PlanoId {
	return v === "empresa" ? "empresa" : v === "pro" ? "pro" : "gratis";
}

/** Sem linha na tabela = nunca assinou = Grátis de verdade (resposta válida, não erro). */
export const SEM_ASSINATURA: ResumoAssinatura = {
	planoEfetivo: "gratis",
	planoContratado: "gratis",
	ativo: false,
	pagamentoFalhou: false,
};

/**
 * Deriva o estado exibível da linha. Cópia de `getResumoAssinatura`: status pago +
 * período ainda não vencido = ativo. Assinatura vencida cujo status ninguém atualizou
 * NÃO conta como paga (o webhook pode ter falhado; a data é a verdade).
 */
export function derivar(linha: LinhaAssinatura): ResumoAssinatura {
	const status = typeof linha.status === "string" ? linha.status : undefined;
	const proximaCobranca = typeof linha.current_period_end === "string" ? linha.current_period_end : undefined;
	const planoContratado = mapearPlano(linha.plano);

	let pago = !!status && STATUS_PAGOS.has(status);
	if (pago && proximaCobranca) {
		const fim = Date.parse(proximaCobranca);
		if (!Number.isNaN(fim) && fim < Date.now()) pago = false;
	}

	return {
		planoEfetivo: pago ? planoContratado : "gratis",
		planoContratado,
		status,
		proximaCobranca,
		ativo: pago,
		pagamentoFalhou: pago && status === "past_due",
	};
}
