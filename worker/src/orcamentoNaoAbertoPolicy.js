/**
 * Decisão PURA da régua "orçamento enviado e NÃO ABERTO em 2 dias" (Z-123 / Z-52).
 *
 * Gatilho → mensagem → humano:
 *   - gatilho: link público enviado há 48 h–7 dias, nunca aberto (`visualizado_em` nulo),
 *     sem resposta e não revogado;
 *   - mensagem: aviso AO PRESTADOR (nunca ao cliente final), uma vez por orçamento;
 *   - humano: o prestador reenvia/chama o cliente pelo WhatsApp. A OLLI não escreve ao cliente.
 *
 * Sem rede, sem e-mail e sem nome do cliente: o candidato traz só o necessário.
 */

export const NAO_ABERTO_POLICY_VERSION = '2026-10-25.v1';
export const NAO_ABERTO_MIN_HORAS = 48;
export const NAO_ABERTO_MAX_DIAS = 7;
/** No máximo estes avisos por conta por dia (soma com o teto de 1 e-mail/24 h do banco). */
export const NAO_ABERTO_MAX_POR_CONTA_DIA = 1;

const HORA_MS = 3600e3;
const DIA_MS = 24 * HORA_MS;
const OFFSET_BRASILIA_MS = -3 * HORA_MS;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

const data = (v) => {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

function decisao(motivo, pedido = null) {
  return Object.freeze({ version: NAO_ABERTO_POLICY_VERSION, avisar: pedido !== null, motivo, pedido });
}

/** 8h–18h de Brasília (mesma janela dos freios da D-0050; o aviso é ao prestador, mas não acorda ninguém). */
export function dentroDaJanela(agora) {
  const h = new Date(agora.getTime() + OFFSET_BRASILIA_MS).getUTCHours();
  return h >= 8 && h < 18;
}

/**
 * @param c {{ userId, token, enviadoEm, visualizadoEm, respondidoEm, revogadoEm, avisadoEm,
 *            membroDeEquipe: boolean, suprimido: boolean }}
 */
export function decidirNaoAberto(c, { agora } = {}) {
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) return decisao('agora_invalido');
  if (!c || typeof c !== 'object' || !UUID_RE.test(c.userId ?? '') || !TOKEN_RE.test(c.token ?? '')) return decisao('candidato_invalido');
  const enviado = data(c.enviadoEm);
  if (!enviado) return decisao('data_ilegivel'); // nunca vira "2 dias" por chute
  if (typeof c.suprimido !== 'boolean' || typeof c.membroDeEquipe !== 'boolean') return decisao('candidato_invalido');
  if (c.suprimido) return decisao('suprimido');
  if (c.membroDeEquipe) return decisao('membro_de_equipe');
  if (c.visualizadoEm || c.respondidoEm || c.revogadoEm) return decisao('ja_aberto_ou_encerrado');
  if (c.avisadoEm) return decisao('ja_avisado');
  if (!dentroDaJanela(agora)) return decisao('fora_da_janela');
  const idade = agora.getTime() - enviado.getTime();
  if (idade < NAO_ABERTO_MIN_HORAS * HORA_MS) return decisao('cedo');
  if (idade > NAO_ABERTO_MAX_DIAS * DIA_MS) return decisao('tarde');
  return decisao('nao_aberto_48h', Object.freeze({
    userId: c.userId,
    template: 'lembrete_reengajamento',
    templateVersion: 'lembrete_reengajamento.v1',
    purpose: 'reengagement_reminder',
    idempotencyKey: `reengajamento:${c.userId}:nao_aberto:${c.token}`,
    dados: Object.freeze({ tipo: 'nao_aberto', token: c.token, enviadoEm: enviado.toISOString() }),
  }));
}

/** Lote: mais antigo primeiro, no máximo 1 por conta, no máximo `teto` no total. Motivos sem PII. */
export function selecionarNaoAbertos(candidatos, { agora, teto }) {
  const motivos = {};
  const pedidos = [];
  const contas = new Set();
  const ordenados = [...(Array.isArray(candidatos) ? candidatos : [])].sort(
    (a, b) => (data(a?.enviadoEm)?.getTime() ?? Infinity) - (data(b?.enviadoEm)?.getTime() ?? Infinity),
  );
  for (const c of ordenados) {
    const d = decidirNaoAberto(c, { agora });
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
