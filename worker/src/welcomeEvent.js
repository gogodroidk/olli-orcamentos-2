/**
 * Contrato puro para transformar uma confirmação de e-mail em pedido de
 * boas-vindas.
 *
 * Não grava em banco e não envia mensagem. A integração futura deve persistir
 * este objeto em uma outbox transacional, usando `idempotencyKey` como chave
 * única e mantendo o tenant vindo do contexto autenticado — nunca do payload do
 * webhook.
 */

export const WELCOME_EVENT_VERSION = '2026-08-31.v1';
export const WELCOME_TEMPLATE_VERSION = 'boas_vindas.v1';

function texto(v, limite) {
  return typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, limite) : '';
}

function emailSeguro(v) {
  const normalizado = texto(v, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado) ? normalizado : '';
}

function isoSeguro(v) {
  if (typeof v !== 'string' || !v.trim()) return '';
  const data = new Date(v);
  return Number.isNaN(data.getTime()) ? '' : data.toISOString();
}

function idSeguro(v, fallback) {
  const id = texto(v, 160).replace(/[^a-zA-Z0-9._:-]/g, '-');
  return id || fallback;
}

function obrigatorio(condicao, codigo) {
  if (!condicao) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
}

/**
 * Decide se a confirmação pode abrir um item de outbox.
 * `jaEnviado` e `jaPendente` representam consultas da camada persistente; esta
 * função apenas mantém a regra de deduplicação testável e sem efeitos colaterais.
 */
export function decidirWelcome({ confirmado, jaEnviado = false, jaPendente = false } = {}) {
  if (!confirmado) return { enfileirar: false, motivo: 'email_nao_confirmado' };
  if (jaEnviado) return { enfileirar: false, motivo: 'ja_enviado' };
  if (jaPendente) return { enfileirar: false, motivo: 'ja_pendente' };
  return { enfileirar: true, motivo: 'novo_evento' };
}

/**
 * Cria o evento a partir de confirmação + contexto confiável.
 * O `tenantId` do payload é deliberadamente ignorado; quando existir, somente
 * `contexto.tenantId` entra no evento. Contas sem organização ainda podem ter
 * welcome user-level com `tenantId: null`.
 */
export function criarEventoBoasVindas(confirmacao = {}, contexto = {}) {
  const userId = texto(contexto.userId, 120);
  const email = emailSeguro(confirmacao.email);
  const confirmadoEm = isoSeguro(confirmacao.confirmedAt || confirmacao.confirmadoEm);
  const nome = texto(confirmacao.nome || confirmacao.name, 120) || 'profissional';
  const tenantId = texto(contexto.tenantId, 120) || null;
  const confirmado = confirmacao.confirmado === true || confirmacao.confirmed === true || !!confirmadoEm;

  obrigatorio(userId, 'contexto_usuario_obrigatorio');
  obrigatorio(confirmado, 'email_nao_confirmado');
  obrigatorio(email, 'email_invalido');
  obrigatorio(confirmadoEm, 'confirmed_at_invalido');
  if (confirmacao.userId && texto(confirmacao.userId, 120) !== userId) {
    obrigatorio(false, 'usuario_contexto_divergente');
  }

  const eventId = idSeguro(confirmacao.eventId || confirmacao.event_id, `email-confirmed:${userId}:${confirmadoEm}`);
  return Object.freeze({
    eventId,
    type: 'email.welcome.requested',
    version: WELCOME_EVENT_VERSION,
    template: 'boas_vindas',
    templateVersion: WELCOME_TEMPLATE_VERSION,
    purpose: 'account_onboarding',
    userId,
    tenantId,
    recipient: email,
    name: nome,
    confirmedAt: confirmadoEm,
    idempotencyKey: `welcome:${userId}:${WELCOME_TEMPLATE_VERSION}`,
    source: idSeguro(confirmacao.source || confirmacao.origem, 'supabase.auth'),
  });
}
