/**
 * Política pura para o pré-prompt de permissão de notificações.
 *
 * A função decide se a UI pode explicar o benefício e oferecer a ação. Ela não
 * chama Notification.requestPermission, Expo Notifications, service worker ou
 * qualquer API do sistema.
 */

export type NotificationPermissionChannel = 'push' | 'web_push';
export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';
export type NotificationPreferenceState = 'unset' | 'enabled' | 'disabled';
export type NotificationValueMilestone =
  | 'none'
  | 'first_quote_created'
  | 'first_pdf_generated'
  | 'return_after_value';

export interface NotificationPermissionPromptInput {
  channel: NotificationPermissionChannel;
  permissionState: NotificationPermissionState;
  capabilityAvailable: boolean;
  preferenceState: NotificationPreferenceState;
  onboardingCompleted: boolean;
  sessionNumber: number;
  valueMilestone: NotificationValueMilestone;
  promptExposureCount: number;
  lastDismissedAt: Date | null;
  now: Date;
}

export type NotificationPermissionPromptReason =
  | 'eligible'
  | 'invalid_context'
  | 'unsupported'
  | 'already_granted'
  | 'system_denied'
  | 'user_disabled'
  | 'onboarding_protected'
  | 'value_not_reached'
  | 'cooldown'
  | 'exposure_limit';

export interface NotificationPermissionPromptCopy {
  title: string;
  body: string;
  primaryAction: string;
  secondaryAction: string;
  settingsHint: string;
}

export interface NotificationPermissionPromptDecision {
  version: string;
  offerPrompt: boolean;
  reason: NotificationPermissionPromptReason;
  channel: NotificationPermissionChannel | null;
  copy: NotificationPermissionPromptCopy | null;
}

export const NOTIFICATION_PERMISSION_PROMPT_POLICY_VERSION = '2026-09-01.v1';
export const NOTIFICATION_PERMISSION_PROMPT_MAX_EXPOSURES = 2;
export const NOTIFICATION_PERMISSION_PROMPT_COOLDOWN_DAYS = 30;

const INPUT_KEYS = Object.freeze([
  'channel',
  'permissionState',
  'capabilityAvailable',
  'preferenceState',
  'onboardingCompleted',
  'sessionNumber',
  'valueMilestone',
  'promptExposureCount',
  'lastDismissedAt',
  'now',
]);
const CHANNELS = new Set<NotificationPermissionChannel>(['push', 'web_push']);
const PERMISSION_STATES = new Set<NotificationPermissionState>(['unsupported', 'default', 'granted', 'denied']);
const PREFERENCE_STATES = new Set<NotificationPreferenceState>(['unset', 'enabled', 'disabled']);
const VALUE_MILESTONES = new Set<NotificationValueMilestone>([
  'none',
  'first_quote_created',
  'first_pdf_generated',
  'return_after_value',
]);
const COOLDOWN_MS = NOTIFICATION_PERMISSION_PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

function chavesExatas(valor: unknown): valor is Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return false;
  const recebidas = Object.keys(valor).sort();
  const esperadas = [...INPUT_KEYS].sort();
  return recebidas.length === esperadas.length
    && recebidas.every((chave, indice) => chave === esperadas[indice]);
}

function dataValida(valor: unknown): valor is Date {
  return valor instanceof Date && !Number.isNaN(valor.getTime());
}

function contextoValido(valor: unknown): valor is NotificationPermissionPromptInput {
  if (!chavesExatas(valor)) return false;
  const input = valor as unknown as NotificationPermissionPromptInput;
  return CHANNELS.has(input.channel)
    && PERMISSION_STATES.has(input.permissionState)
    && typeof input.capabilityAvailable === 'boolean'
    && PREFERENCE_STATES.has(input.preferenceState)
    && typeof input.onboardingCompleted === 'boolean'
    && Number.isInteger(input.sessionNumber)
    && input.sessionNumber >= 1
    && VALUE_MILESTONES.has(input.valueMilestone)
    && Number.isInteger(input.promptExposureCount)
    && input.promptExposureCount >= 0
    && (input.lastDismissedAt === null || dataValida(input.lastDismissedAt))
    && dataValida(input.now)
    && (input.lastDismissedAt === null || input.lastDismissedAt.getTime() <= input.now.getTime());
}

function decidir(
  reason: NotificationPermissionPromptReason,
  channel: NotificationPermissionChannel | null,
  copy: NotificationPermissionPromptCopy | null = null,
): NotificationPermissionPromptDecision {
  return Object.freeze({
    version: NOTIFICATION_PERMISSION_PROMPT_POLICY_VERSION,
    offerPrompt: reason === 'eligible',
    reason,
    channel,
    copy: copy ? Object.freeze(copy) : null,
  });
}

function copyContextual(channel: NotificationPermissionChannel): NotificationPermissionPromptCopy {
  const destino = channel === 'push' ? 'no celular' : 'neste computador';
  return {
    title: 'Acompanhe seus orçamentos importantes',
    body: `Ative as notificações ${destino} para receber avisos essenciais da conta e atualizações importantes dos seus orçamentos.`,
    primaryAction: 'Ativar notificações',
    secondaryAction: 'Agora não',
    settingsHint: 'Você pode mudar essa escolha depois em Conta > Notificações.',
  };
}

/** Decide apenas a exibição do pré-prompt explicativo. */
export function avaliarPromptPermissaoNotificacao(
  input: NotificationPermissionPromptInput,
): NotificationPermissionPromptDecision {
  if (!contextoValido(input)) return decidir('invalid_context', null);
  if (!input.capabilityAvailable || input.permissionState === 'unsupported') {
    return decidir('unsupported', input.channel);
  }
  if (input.permissionState === 'granted') return decidir('already_granted', input.channel);
  if (input.permissionState === 'denied') return decidir('system_denied', input.channel);
  if (input.preferenceState === 'disabled') return decidir('user_disabled', input.channel);
  if (!input.onboardingCompleted || input.sessionNumber === 1) {
    return decidir('onboarding_protected', input.channel);
  }
  if (input.valueMilestone === 'none') return decidir('value_not_reached', input.channel);
  if (input.promptExposureCount >= NOTIFICATION_PERMISSION_PROMPT_MAX_EXPOSURES) {
    return decidir('exposure_limit', input.channel);
  }
  if (input.lastDismissedAt
    && input.now.getTime() - input.lastDismissedAt.getTime() < COOLDOWN_MS) {
    return decidir('cooldown', input.channel);
  }
  return decidir('eligible', input.channel, copyContextual(input.channel));
}

