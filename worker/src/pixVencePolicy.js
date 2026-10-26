/**
 * Decisão PURA do lembrete "seu Pix do plano vence em ~3 h" (P0-08, 26/10/2026).
 *
 * Gatilho → mensagem:
 *   - gatilho: cobrança Pix do plano gravada em `webhook_events` (origem `pix_cobranca`, #223), sem
 *     pagamento visto, não substituída por um Pix mais novo da mesma conta, vencendo entre 1 h e 4 h
 *     a partir de agora. A rodada é de hora em hora, das 8h às 19h de Brasília: de dia, a primeira
 *     rodada que pega a cobrança cai entre 3 h e 4 h antes do vencimento. A ÚLTIMA rodada (19h) estica
 *     a janela até 09:00 do dia seguinte, para quem vence de madrugada também ser avisado (na véspera);
 *   - mensagem: UM e-mail por cobrança, com a hora real do vencimento e o caminho para gerar outro Pix.
 *
 * Sem rede, sem e-mail e sem nome: o candidato traz só o necessário. O banco reconfere tudo sob a
 * trava (`enqueue_lembrete_email`, ramo `pix_vence`) antes de enfileirar.
 */

export const PIX_VENCE_POLICY_VERSION = '2026-10-26.v1';
/** Janela (em horas antes do vencimento) em que o lembrete pode sair. */
export const PIX_VENCE_MIN_HORAS = 1;
export const PIX_VENCE_MAX_HORAS = 4;
/** Planos que o Pix vende hoje (chaves de `PLANO_PIX`, worker/src/mercadopago.js; o teste confere). */
export const PIX_VENCE_PLANOS = Object.freeze(['pro_mensal', 'pro_anual', 'empresa_mensal', 'empresa_anual']);

const HORA_MS = 3600e3;
const OFFSET_BRASILIA_MS = -3 * HORA_MS;
/** A partir desta hora de Brasília a rodada é a última do dia (igual a `private.pix_vence_limite` no banco). */
export const PIX_VENCE_HORA_ULTIMA_RODADA = 19;
/** Até que horas da manhã seguinte a última rodada do dia avisa. */
export const PIX_VENCE_MANHA_SEGUINTE = 9;

/** Vencimento mais distante que esta rodada avisa: agora + 4 h, ou 09:00 de amanhã na última rodada do dia. */
export function limiteDoAviso(agora) {
  const b = new Date(agora.getTime() + OFFSET_BRASILIA_MS);
  if (b.getUTCHours() < PIX_VENCE_HORA_ULTIMA_RODADA) return new Date(agora.getTime() + PIX_VENCE_MAX_HORAS * HORA_MS);
  const amanha = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + 1, PIX_VENCE_MANHA_SEGUINTE);
  return new Date(amanha - OFFSET_BRASILIA_MS);
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** id da cobrança na AbacatePay (ex.: `pix_char_…`); cabe na chave de idempotência do banco. */
export const COBRANCA_ID_RE = /^[A-Za-z0-9_-]{4,120}$/;

const data = (v) => {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

function decisao(motivo, pedido = null) {
  return Object.freeze({ version: PIX_VENCE_POLICY_VERSION, avisar: pedido !== null, motivo, pedido });
}

/**
 * @param c {{ userId, cobrancaId, plano, expiraEm, pago: boolean, superada: boolean,
 *            suprimido: boolean, avisadoEm }}
 */
export function decidirPixVence(c, { agora } = {}) {
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) return decisao('agora_invalido');
  if (!c || typeof c !== 'object' || !UUID_RE.test(c.userId ?? '') || !COBRANCA_ID_RE.test(c.cobrancaId ?? '')) {
    return decisao('candidato_invalido');
  }
  if (!PIX_VENCE_PLANOS.includes(c.plano)) return decisao('plano_invalido');
  const expira = data(c.expiraEm);
  if (!expira) return decisao('data_ilegivel'); // nunca vira "vence já" por chute
  if (typeof c.pago !== 'boolean' || typeof c.superada !== 'boolean' || typeof c.suprimido !== 'boolean') {
    return decisao('candidato_invalido');
  }
  if (c.pago) return decisao('pago');
  if (c.superada) return decisao('superada');
  if (c.suprimido) return decisao('suprimido');
  if (c.avisadoEm) return decisao('ja_avisado');
  const falta = expira.getTime() - agora.getTime();
  if (falta <= PIX_VENCE_MIN_HORAS * HORA_MS) return decisao('perto_demais');
  if (expira.getTime() > limiteDoAviso(agora).getTime()) return decisao('cedo');
  return decisao('pix_vence', Object.freeze({
    userId: c.userId,
    template: 'lembrete_reengajamento',
    templateVersion: 'lembrete_reengajamento.v1',
    purpose: 'reengagement_reminder',
    idempotencyKey: `reengajamento:${c.userId}:pix_vence:${c.cobrancaId}`,
    dados: Object.freeze({ tipo: 'pix_vence', cobrancaId: c.cobrancaId, plano: c.plano, expiraEm: expira.toISOString() }),
  }));
}

/** Lote: vence primeiro sai primeiro, no máximo 1 por conta, no máximo `teto`. Motivos sem PII. */
export function selecionarPixVence(candidatos, { agora, teto }) {
  const motivos = {};
  const pedidos = [];
  const contas = new Set();
  const ordenados = [...(Array.isArray(candidatos) ? candidatos : [])].sort(
    (a, b) => (data(a?.expiraEm)?.getTime() ?? Infinity) - (data(b?.expiraEm)?.getTime() ?? Infinity),
  );
  for (const c of ordenados) {
    const d = decidirPixVence(c, { agora });
    let m = d.motivo;
    if (d.avisar) {
      if (contas.has(c.userId)) m = 'uma_por_conta';
      else if (pedidos.length >= teto) m = 'teto_da_rodada';
      else { contas.add(c.userId); pedidos.push(d.pedido); }
    }
    motivos[m] = (motivos[m] || 0) + 1;
  }
  return Object.freeze({ pedidos: Object.freeze(pedidos), motivos: Object.freeze(motivos) });
}
