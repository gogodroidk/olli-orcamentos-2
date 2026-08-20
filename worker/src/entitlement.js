/** Regra server-side do plano efetivo; nunca mistura override com pagamento. */
const STATUS_PAGOS = new Set(['active', 'trialing', 'past_due']);
const PESO = { gratis: 0, pro: 1, empresa: 2 };

function plano(valor) {
  return valor === 'empresa' ? 'empresa' : valor === 'pro' ? 'pro' : 'gratis';
}

function vigente(valor, agoraMs, vazioVale) {
  if (valor == null || valor === '') return vazioVale;
  if (typeof valor !== 'string') return false;
  const t = Date.parse(valor);
  return Number.isFinite(t) && t >= agoraMs;
}

export function derivarEntitlement(row, agoraMs = Date.now()) {
  const planoContratado = plano(row && row.plano);
  const pagamentoAtivo = !!row
    && typeof row.status === 'string'
    && STATUS_PAGOS.has(row.status)
    && vigente(row.current_period_end, agoraMs, true);
  const pago = pagamentoAtivo ? planoContratado : 'gratis';

  const manual = plano(row && row.admin_plano_override);
  const overrideAtivo = !!row
    && row.admin_override_ativo === true
    && manual !== 'gratis'
    && vigente(row.admin_override_ate, agoraMs, true);

  if (overrideAtivo && PESO[manual] > PESO[pago]) {
    return { plano: manual, origem: 'admin', pagamentoAtivo, overrideAtivo: true };
  }
  return {
    plano: pago,
    origem: pagamentoAtivo ? 'pagamento' : 'gratis',
    pagamentoAtivo,
    overrideAtivo,
  };
}
