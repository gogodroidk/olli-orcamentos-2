/**
 * Política única de canais para e-mail, push e notificações dentro do OLLI.
 *
 * Este módulo é puro: não pede permissão, não grava preferências e não envia
 * nada. Ele transforma preferências + contexto em uma decisão determinística,
 * para que o app e o Worker possam compartilhar as mesmas regras sem criar
 * notificações duplicadas ou ignorar o horário silencioso.
 */

export type NotificationChannel = 'in_app' | 'email' | 'push' | 'web_push';
export type NotificationKind = 'security' | 'operational' | 'education' | 'engagement';

export interface NotificationPreferences {
  /** E-mails necessários à conta não podem ser desligados por marketing. */
  emailTransactional: boolean;
  emailEducation: boolean;
  push: boolean;
  webPush: boolean;
  inApp: boolean;
  quietStartHour: number;
  quietEndHour: number;
  maxEngagementPerDay: number;
  engagementSunday: boolean;
}

export interface NotificationEvaluation {
  allowed: boolean;
  reason:
    | 'allowed'
    | 'channel_disabled'
    | 'quiet_hours'
    | 'daily_cap'
    | 'sunday_quiet'
    | 'invalid_preferences'
    | 'invalid_context';
}

export interface NotificationContext {
  channel: NotificationChannel;
  kind: NotificationKind;
  now: Date;
  engagementSentToday?: number;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = Object.freeze({
  emailTransactional: true,
  emailEducation: false,
  push: false,
  webPush: false,
  inApp: true,
  quietStartHour: 20,
  quietEndHour: 7,
  maxEngagementPerDay: 2,
  engagementSunday: false,
});

const NOTIFICATION_CHANNELS = new Set<NotificationChannel>(['in_app', 'email', 'push', 'web_push']);
const NOTIFICATION_KINDS = new Set<NotificationKind>(['security', 'operational', 'education', 'engagement']);

function preferenciasValidas(p: NotificationPreferences | null | undefined): p is NotificationPreferences {
  return !!p
    && typeof p.emailTransactional === 'boolean'
    && typeof p.emailEducation === 'boolean'
    && typeof p.push === 'boolean'
    && typeof p.webPush === 'boolean'
    && typeof p.inApp === 'boolean'
    && typeof p.engagementSunday === 'boolean'
    && Number.isInteger(p.quietStartHour)
    && p.quietStartHour >= 0 && p.quietStartHour <= 23
    && Number.isInteger(p.quietEndHour)
    && p.quietEndHour >= 0 && p.quietEndHour <= 23
    && Number.isInteger(p.maxEngagementPerDay)
    && p.maxEngagementPerDay >= 0 && p.maxEngagementPerDay <= 20;
}

function contextoValido(context: NotificationContext | null | undefined): context is NotificationContext {
  return !!context
    && NOTIFICATION_CHANNELS.has(context.channel)
    && NOTIFICATION_KINDS.has(context.kind)
    && context.now instanceof Date
    && !Number.isNaN(context.now.getTime())
    && (context.engagementSentToday === undefined
      || (Number.isInteger(context.engagementSentToday) && context.engagementSentToday >= 0));
}

function emHorarioSilencioso(hour: number, inicio: number, fim: number): boolean {
  if (inicio === fim) return false;
  if (inicio < fim) return hour >= inicio && hour < fim;
  return hour >= inicio || hour < fim;
}

function canalLigado(channel: NotificationChannel, p: NotificationPreferences, kind: NotificationKind): boolean {
  if (channel === 'in_app') return p.inApp;
  if (channel === 'push') return p.push;
  if (channel === 'web_push') return p.webPush;
  if (kind === 'security' || kind === 'operational') return p.emailTransactional;
  return p.emailEducation;
}

/** Avalia uma tentativa sem efeitos externos e com motivo auditável. */
export function avaliarNotificacao(
  context: NotificationContext,
  preferences: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
): NotificationEvaluation {
  if (!preferenciasValidas(preferences)) return { allowed: false, reason: 'invalid_preferences' };
  if (!contextoValido(context)) return { allowed: false, reason: 'invalid_context' };
  if (!canalLigado(context.channel, preferences, context.kind)) {
    return { allowed: false, reason: 'channel_disabled' };
  }

  const hour = context.now.getHours();
  const domingo = context.now.getDay() === 0;
  const engagement = context.kind === 'education' || context.kind === 'engagement';

  if (engagement && domingo && !preferences.engagementSunday) {
    return { allowed: false, reason: 'sunday_quiet' };
  }
  if (engagement && emHorarioSilencioso(hour, preferences.quietStartHour, preferences.quietEndHour)) {
    return { allowed: false, reason: 'quiet_hours' };
  }
  if (engagement && (context.engagementSentToday ?? 0) >= preferences.maxEngagementPerDay) {
    return { allowed: false, reason: 'daily_cap' };
  }
  return { allowed: true, reason: 'allowed' };
}
