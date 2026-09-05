/**
 * Política pura de cadência para lembretes educativos de ativação.
 *
 * Gera apenas um candidato sem conteúdo ou destinatário. Preferências,
 * supressão, quiet hours e entrega continuam sendo avaliadas pelos contratos
 * downstream; este módulo não envia e-mail ou notificação.
 */

export const ONBOARDING_REMINDER_POLICY_VERSION = '2026-09-01.v1';
export const ONBOARDING_REMINDER_MAX_TOTAL = 3;
export const ONBOARDING_REMINDER_MAX_EMAIL = 2;
export const ONBOARDING_REMINDER_MIN_INTERVAL_HOURS = 48;

const INPUT_KEYS = Object.freeze([
  'tenantId',
  'actorKey',
  'accountState',
  'progressStage',
  'verifiedAt',
  'now',
  'educationConsent',
  'history',
]);
const CONSENT_KEYS = Object.freeze(['optedIn', 'version', 'recordedAt']);
const HISTORY_KEYS = Object.freeze(['reminderKey', 'window', 'channels', 'decidedAt', 'emailConsentVersion']);
const ACCOUNT_STATES = Object.freeze(['active', 'suspended', 'deleted']);
const PROGRESS_STAGES = Object.freeze([
  'verified_no_profile',
  'profile_complete_no_quote',
  'quote_started',
  'first_quote_complete',
]);
const WINDOWS = Object.freeze([
  Object.freeze({ id: 'activation_day_1', afterHours: 24, template: 'onboarding_first_steps' }),
  Object.freeze({ id: 'activation_day_3', afterHours: 72, template: 'onboarding_create_first_quote' }),
  Object.freeze({ id: 'activation_day_7', afterHours: 168, template: 'onboarding_last_nudge' }),
]);
const WINDOW_IDS = new Set(WINDOWS.map((item) => item.id));
const CHANNELS = new Set(['in_app', 'email']);
const MIN_INTERVAL_MS = ONBOARDING_REMINDER_MIN_INTERVAL_HOURS * 60 * 60 * 1000;

function objeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function chavesExatas(valor, esperadas) {
  if (!objeto(valor)) return false;
  const recebidas = Object.keys(valor).sort();
  const lista = [...esperadas].sort();
  return recebidas.length === lista.length && recebidas.every((chave, indice) => chave === lista[indice]);
}

function idSeguro(valor) {
  return typeof valor === 'string' && /^[a-zA-Z0-9._:-]{1,160}$/.test(valor);
}

function dataValida(valor) {
  return valor instanceof Date && !Number.isNaN(valor.getTime());
}

function consentimentoValido(consentimento, now) {
  if (!chavesExatas(consentimento, CONSENT_KEYS) || typeof consentimento.optedIn !== 'boolean') return false;
  if (consentimento.optedIn) {
    return idSeguro(consentimento.version)
      && dataValida(consentimento.recordedAt)
      && consentimento.recordedAt.getTime() <= now.getTime();
  }
  return consentimento.version === null && consentimento.recordedAt === null;
}

function historicoValido(history, input) {
  if (!Array.isArray(history) || history.length > ONBOARDING_REMINDER_MAX_TOTAL) return false;
  const keys = new Set();
  const windows = new Set();
  let anterior = input.verifiedAt.getTime();
  for (const entry of history) {
    if (!chavesExatas(entry, HISTORY_KEYS)
      || !idSeguro(entry.reminderKey)
      || !WINDOW_IDS.has(entry.window)
      || !Array.isArray(entry.channels)
      || entry.channels.length < 1
      || entry.channels.length > 2
      || entry.channels.some((channel) => !CHANNELS.has(channel))
      || new Set(entry.channels).size !== entry.channels.length
      || !entry.channels.includes('in_app')
      || (entry.window === 'activation_day_1' && entry.channels.includes('email'))
      || !dataValida(entry.decidedAt)
      || entry.decidedAt.getTime() < anterior
      || entry.decidedAt.getTime() > input.now.getTime()
      || keys.has(entry.reminderKey)
      || windows.has(entry.window)) return false;
    const temEmail = entry.channels.includes('email');
    if (temEmail !== idSeguro(entry.emailConsentVersion)) return false;
    if (!temEmail && entry.emailConsentVersion !== null) return false;
    keys.add(entry.reminderKey);
    windows.add(entry.window);
    anterior = entry.decidedAt.getTime();
  }
  return true;
}

function resultado(reason, candidate = null) {
  return Object.freeze({
    version: ONBOARDING_REMINDER_POLICY_VERSION,
    schedule: reason === 'eligible',
    reason,
    candidate,
  });
}

function contextoValido(input) {
  return chavesExatas(input, INPUT_KEYS)
    && idSeguro(input.tenantId)
    && idSeguro(input.actorKey)
    && ACCOUNT_STATES.includes(input.accountState)
    && PROGRESS_STAGES.includes(input.progressStage)
    && dataValida(input.verifiedAt)
    && dataValida(input.now)
    && input.verifiedAt.getTime() <= input.now.getTime()
    && consentimentoValido(input.educationConsent, input.now);
}

/** Seleciona, no máximo, um candidato por avaliação. */
export function avaliarLembreteAtivacao(input = {}) {
  if (!contextoValido(input)) return resultado('invalid_context');
  if (!historicoValido(input.history, input)) return resultado('invalid_history');
  if (input.accountState !== 'active') return resultado('account_inactive');
  if (input.progressStage === 'first_quote_complete') return resultado('activation_complete');
  if (input.history.length >= ONBOARDING_REMINDER_MAX_TOTAL) return resultado('cadence_exhausted');

  const elapsedHours = (input.now.getTime() - input.verifiedAt.getTime()) / (60 * 60 * 1000);
  const unlocked = WINDOWS.filter((item) => elapsedHours >= item.afterHours);
  if (!unlocked.length) return resultado('too_early');

  const selected = [...unlocked].reverse().find((item) => !input.history.some((entry) => entry.window === item.id));
  if (!selected) return resultado('window_already_decided');

  const last = input.history[input.history.length - 1];
  if (last && input.now.getTime() - last.decidedAt.getTime() < MIN_INTERVAL_MS) {
    return resultado('cooldown');
  }

  const emailsDecided = input.history.filter((entry) => entry.channels.includes('email')).length;
  const emailEligible = selected.id !== 'activation_day_1'
    && input.educationConsent.optedIn
    && emailsDecided < ONBOARDING_REMINDER_MAX_EMAIL;
  const channels = Object.freeze(emailEligible ? ['in_app', 'email'] : ['in_app']);
  const reminderKey = `onboarding:${input.tenantId}:${input.actorKey}:${selected.id}:${ONBOARDING_REMINDER_POLICY_VERSION}`;
  const candidate = Object.freeze({
    eventId: reminderKey,
    idempotencyKey: reminderKey,
    kind: 'education',
    window: selected.id,
    template: selected.template,
    requestedChannels: channels,
    emailConsentVersion: emailEligible ? input.educationConsent.version : null,
    unsubscribeScope: emailEligible ? 'email_education' : null,
  });
  return resultado('eligible', candidate);
}

