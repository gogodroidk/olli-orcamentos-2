/** Regra pura e compartilhável do plano pago + concessão administrativa. */
export type PlanoEfetivoId = 'gratis' | 'pro' | 'empresa';

export interface LinhaAssinaturaEfetiva {
  plano: string | null;
  status: string | null;
  current_period_end: string | null;
  admin_plano_override?: string | null;
  admin_override_ativo?: boolean | null;
  admin_override_ate?: string | null;
}

export interface PlanoEfetivoDerivado {
  planoContratado: PlanoEfetivoId;
  planoEfetivo: PlanoEfetivoId;
  pagamentoAtivo: boolean;
  overrideAtivo: boolean;
  origem: 'gratis' | 'pagamento' | 'admin';
  validoAte?: string;
}

export const STATUS_PAGOS = new Set(['active', 'trialing', 'past_due']);

const PESO: Record<PlanoEfetivoId, number> = { gratis: 0, pro: 1, empresa: 2 };

export function normalizarPlano(valor: unknown): PlanoEfetivoId {
  return valor === 'empresa' ? 'empresa' : valor === 'pro' ? 'pro' : 'gratis';
}

function dataAindaVale(valor: unknown, agoraMs: number, vazioVale: boolean): boolean {
  if (valor == null || valor === '') return vazioVale;
  if (typeof valor !== 'string') return false;
  const epoch = Date.parse(valor);
  return Number.isFinite(epoch) && epoch >= agoraMs;
}

/**
 * O override nunca rebaixa um plano pago: vence apenas quando é válido e tem
 * peso maior. Assim o admin pode liberar Empresa para um Pro, sem corromper a
 * assinatura do gateway e sem transformar Empresa pago em Pro manual.
 */
export function derivarPlanoEfetivo(
  linha: LinhaAssinaturaEfetiva,
  agoraMs = Date.now(),
): PlanoEfetivoDerivado {
  const planoContratado = normalizarPlano(linha.plano);
  const pagamentoAtivo =
    typeof linha.status === 'string' &&
    STATUS_PAGOS.has(linha.status) &&
    dataAindaVale(linha.current_period_end, agoraMs, true);
  const planoPago: PlanoEfetivoId = pagamentoAtivo ? planoContratado : 'gratis';

  const planoManual = normalizarPlano(linha.admin_plano_override);
  const overrideAtivo =
    linha.admin_override_ativo === true &&
    planoManual !== 'gratis' &&
    dataAindaVale(linha.admin_override_ate, agoraMs, true);

  if (overrideAtivo && PESO[planoManual] > PESO[planoPago]) {
    return {
      planoContratado,
      planoEfetivo: planoManual,
      pagamentoAtivo,
      overrideAtivo: true,
      origem: 'admin',
      validoAte: linha.admin_override_ate || undefined,
    };
  }

  return {
    planoContratado,
    planoEfetivo: planoPago,
    pagamentoAtivo,
    overrideAtivo,
    origem: pagamentoAtivo ? 'pagamento' : 'gratis',
    validoAte: pagamentoAtivo ? linha.current_period_end || undefined : undefined,
  };
}
