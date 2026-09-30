// @ts-ignore -- Node 24 type-stripping exige a extensão .ts neste contrato local.
import { DEFAULT_NOTIFICATION_PREFERENCES, avaliarNotificacao, type NotificationChannel, type NotificationEvaluation, type NotificationKind, type NotificationPreferences } from './notificationPolicy.ts';

/**
 * Contrato puro de decisão cross-channel do OLLI Orçamentos.
 *
 * O módulo não pede permissão ao sistema, não registra token, não persiste e
 * não chama provider. Ele apenas produz uma decisão determinística e
 * auditável para um adapter confiável executar em outra camada.
 */

export const NOTIFICATION_DELIVERY_ORCHESTRATOR_VERSION = '2026-09-01.v1';

export interface NotificationDeliveryEvent {
  eventId: string;
  tenantId: string;
  actorKey: string;
  kind: NotificationKind;
  requestedChannels: NotificationChannel[];
  createdAt: Date;
}

export interface NotificationDeliveryContext {
  tenantId: string;
  actorKey: string;
  now: Date;
  engagementSentToday: number;
  deliveredChannels: NotificationChannel[];
}

export interface NotificationChannelCapabilities {
  in_app: boolean;
  email: boolean;
  push: boolean;
  web_push: boolean;
}

export type NotificationDeliveryReason =
  | NotificationEvaluation['reason']
  | 'already_delivered'
  | 'capability_unavailable'
  | 'channel_limit';

export interface NotificationChannelDecision {
  channel: NotificationChannel;
  selected: boolean;
  reason: NotificationDeliveryReason;
}

export interface NotificationDeliveryPlan {
  version: typeof NOTIFICATION_DELIVERY_ORCHESTRATOR_VERSION;
  eventId: string;
  kind: NotificationKind;
  selectedChannels: readonly NotificationChannel[];
  decisions: readonly Readonly<NotificationChannelDecision>[];
}

const CHANNEL_PRIORITY: readonly NotificationChannel[] = Object.freeze([
  'in_app',
  'push',
  'web_push',
  'email',
]);
const CHANNELS = new Set<NotificationChannel>(CHANNEL_PRIORITY);
const KINDS = new Set<NotificationKind>(['security', 'operational', 'education', 'engagement']);
const EVENT_KEYS = Object.freeze([
  'eventId',
  'tenantId',
  'actorKey',
  'kind',
  'requestedChannels',
  'createdAt',
]);
const CONTEXT_KEYS = Object.freeze([
  'tenantId',
  'actorKey',
  'now',
  'engagementSentToday',
  'deliveredChannels',
]);
const CAPABILITY_KEYS = Object.freeze(['in_app', 'email', 'push', 'web_push']);
const PREFERENCE_KEYS = Object.freeze([
  'emailTransactional',
  'emailEducation',
  'push',
  'webPush',
  'inApp',
  'quietStartHour',
  'quietEndHour',
  'maxEngagementPerDay',
  'engagementSunday',
]);
const MAX_CHANNELS_BY_KIND: Readonly<Record<NotificationKind, number>> = Object.freeze({
  security: 2,
  operational: 2,
  education: 1,
  engagement: 1,
});

function exigir(condicao: unknown, codigo: string): asserts condicao {
  if (!condicao) {
    const erro = new Error(codigo) as Error & { codigo?: string };
    erro.codigo = codigo;
    throw erro;
  }
}

function objeto(value: unknown, codigo: string): Record<string, unknown> {
  exigir(!!value && typeof value === 'object' && !Array.isArray(value), codigo);
  return value as Record<string, unknown>;
}

function chavesExatas(value: unknown, keys: readonly string[], codigo: string): void {
  const record = objeto(value, codigo);
  const atuais = Object.keys(record).sort();
  const esperadas = [...keys].sort();
  exigir(
    atuais.length === esperadas.length && atuais.every((key, index) => key === esperadas[index]),
    codigo,
  );
}

function idSeguro(value: unknown, codigo: string, max = 256): string {
  exigir(
    typeof value === 'string'
      && value.length > 0
      && value.length <= max
      && /^[a-zA-Z0-9._:-]+$/.test(value),
    codigo,
  );
  return value;
}

function dataValida(value: unknown, codigo: string): Date {
  exigir(value instanceof Date && !Number.isNaN(value.getTime()), codigo);
  return value;
}

function canaisValidos(value: unknown, codigo: string, vazioPermitido: boolean): NotificationChannel[] {
  exigir(Array.isArray(value), codigo);
  exigir(vazioPermitido || value.length > 0, codigo);
  exigir(value.length <= CHANNEL_PRIORITY.length, codigo);
  exigir(value.every((channel) => CHANNELS.has(channel)), codigo);
  exigir(new Set(value).size === value.length, codigo);
  return [...value] as NotificationChannel[];
}

function validarPreferencias(value: unknown): NotificationPreferences {
  chavesExatas(value, PREFERENCE_KEYS, 'preferences_campos_invalidos');
  return value as NotificationPreferences;
}

function validarCapabilities(value: unknown): NotificationChannelCapabilities {
  chavesExatas(value, CAPABILITY_KEYS, 'capabilities_campos_invalidos');
  const capabilities = value as NotificationChannelCapabilities;
  exigir(CAPABILITY_KEYS.every((key) => typeof capabilities[key as NotificationChannel] === 'boolean'), 'capabilities_invalidas');
  return capabilities;
}

function ordenarCanais(channels: NotificationChannel[]): NotificationChannel[] {
  const requested = new Set(channels);
  return CHANNEL_PRIORITY.filter((channel) => requested.has(channel));
}

export function orquestrarEntregaNotificacao({
  event,
  context,
  preferences = DEFAULT_NOTIFICATION_PREFERENCES,
  capabilities,
}: {
  event: NotificationDeliveryEvent;
  context: NotificationDeliveryContext;
  preferences?: NotificationPreferences;
  capabilities: NotificationChannelCapabilities;
}): NotificationDeliveryPlan {
  chavesExatas(event, EVENT_KEYS, 'event_campos_invalidos');
  chavesExatas(context, CONTEXT_KEYS, 'context_campos_invalidos');
  const validatedPreferences = validarPreferencias(preferences);
  const validatedCapabilities = validarCapabilities(capabilities);

  const eventId = idSeguro(event.eventId, 'event_id_invalido', 512);
  const eventTenant = idSeguro(event.tenantId, 'event_tenant_invalido');
  const eventActor = idSeguro(event.actorKey, 'event_actor_invalido');
  exigir(KINDS.has(event.kind), 'event_kind_invalido');
  const requestedChannels = canaisValidos(event.requestedChannels, 'requested_channels_invalidos', false);
  const createdAt = dataValida(event.createdAt, 'event_created_at_invalido');

  const contextTenant = idSeguro(context.tenantId, 'context_tenant_invalido');
  const contextActor = idSeguro(context.actorKey, 'context_actor_invalido');
  const now = dataValida(context.now, 'context_now_invalido');
  exigir(Number.isInteger(context.engagementSentToday) && context.engagementSentToday >= 0, 'engagement_count_invalido');
  const deliveredChannels = canaisValidos(context.deliveredChannels, 'delivered_channels_invalidos', true);

  exigir(eventTenant === contextTenant, 'tenant_divergente');
  exigir(eventActor === contextActor, 'actor_divergente');
  exigir(createdAt.getTime() <= now.getTime(), 'event_no_futuro');

  const delivered = new Set(deliveredChannels);
  const selected: NotificationChannel[] = [];
  const decisions: Readonly<NotificationChannelDecision>[] = [];
  const maxChannels = MAX_CHANNELS_BY_KIND[event.kind];

  for (const channel of ordenarCanais(requestedChannels)) {
    let decision: NotificationChannelDecision;
    if (delivered.has(channel)) {
      decision = { channel, selected: false, reason: 'already_delivered' };
    } else if (!validatedCapabilities[channel]) {
      decision = { channel, selected: false, reason: 'capability_unavailable' };
    } else {
      const evaluation = avaliarNotificacao({
        channel,
        kind: event.kind,
        now,
        engagementSentToday: context.engagementSentToday,
      }, validatedPreferences);
      if (!evaluation.allowed) {
        decision = { channel, selected: false, reason: evaluation.reason };
      } else if (selected.length >= maxChannels) {
        decision = { channel, selected: false, reason: 'channel_limit' };
      } else {
        selected.push(channel);
        decision = { channel, selected: true, reason: 'allowed' };
      }
    }
    decisions.push(Object.freeze(decision));
  }

  return Object.freeze({
    version: NOTIFICATION_DELIVERY_ORCHESTRATOR_VERSION,
    eventId,
    kind: event.kind,
    selectedChannels: Object.freeze([...selected]),
    decisions: Object.freeze([...decisions]),
  });
}
