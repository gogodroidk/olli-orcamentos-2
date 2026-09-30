import {
  NOTIFICATION_DELIVERY_ORCHESTRATOR_VERSION,
  orquestrarEntregaNotificacao,
} from '../src/services/notificationDeliveryOrchestrator.ts';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationChannel,
  type NotificationKind,
} from '../src/services/notificationPolicy.ts';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nNotificações OLLI — orquestração cross-channel');

const TENANT = 'tenant-01';
const ACTOR = 'actor-fingerprint-01';
const NOW = new Date(2026, 8, 8, 12, 0, 0, 0);
const channels: NotificationChannel[] = ['email', 'web_push', 'push', 'in_app'];
const event = (kind: NotificationKind = 'operational', overrides: Record<string, unknown> = {}) => ({
  eventId: 'notification-event-01',
  tenantId: TENANT,
  actorKey: ACTOR,
  kind,
  requestedChannels: channels,
  createdAt: new Date(NOW.getTime() - 60_000),
  ...overrides,
});
const context = (overrides: Record<string, unknown> = {}) => ({
  tenantId: TENANT,
  actorKey: ACTOR,
  now: NOW,
  engagementSentToday: 0,
  deliveredChannels: [] as NotificationChannel[],
  ...overrides,
});
const capabilities = (overrides: Record<string, unknown> = {}) => ({
  in_app: true,
  email: true,
  push: true,
  web_push: true,
  ...overrides,
});
const preferences = (overrides: Record<string, unknown> = {}) => ({
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  ...overrides,
});
const plan = (overrides: Record<string, unknown> = {}) => orquestrarEntregaNotificacao({
  event: event(),
  context: context(),
  preferences: preferences(),
  capabilities: capabilities(),
  ...overrides,
} as any);

checar('versão explícita', NOTIFICATION_DELIVERY_ORCHESTRATOR_VERSION === '2026-09-01.v1');
const operational = plan();
checar('operacional padrão seleciona in-app e e-mail', JSON.stringify(operational.selectedChannels) === JSON.stringify(['in_app', 'email']));
checar('prioridade fixa independe da ordem solicitada', operational.decisions.map((item) => item.channel).join(',') === 'in_app,push,web_push,email');
checar('push desabilitado é auditável', operational.decisions.find((item) => item.channel === 'push')?.reason === 'channel_disabled');
checar('web push desabilitado é auditável', operational.decisions.find((item) => item.channel === 'web_push')?.reason === 'channel_disabled');
checar('plano e coleções são imutáveis', Object.isFrozen(operational) && Object.isFrozen(operational.decisions) && Object.isFrozen(operational.selectedChannels) && operational.decisions.every(Object.isFrozen));
checar('saída não inclui conteúdo, token ou provider', !/(content|body|token|provider|recipient|emailAddress)/i.test(JSON.stringify(operational)));

const allEnabled = preferences({ push: true, webPush: true });
const security = plan({ event: event('security'), preferences: allEnabled });
checar('segurança seleciona no máximo dois canais', security.selectedChannels.length === 2);
checar('segurança respeita prioridade in-app e push', security.selectedChannels.join(',') === 'in_app,push');
checar('terceiro canal elegível recebe channel_limit', security.decisions.find((item) => item.channel === 'web_push')?.reason === 'channel_limit');

const engagement = plan({ event: event('engagement'), preferences: preferences({ emailEducation: true, push: true, webPush: true }) });
checar('engajamento seleciona no máximo um canal', engagement.selectedChannels.length === 1 && engagement.selectedChannels[0] === 'in_app');
checar('demais canais de engajamento recebem limite', engagement.decisions.filter((item) => item.reason === 'channel_limit').length === 3);
const education = plan({ event: event('education'), preferences: preferences({ emailEducation: true }) });
checar('educação opt-in seleciona um canal', education.selectedChannels.length === 1 && education.selectedChannels[0] === 'in_app');

const noInApp = plan({ capabilities: capabilities({ in_app: false }) });
checar('capability ausente bloqueia mesmo canal preferido', noInApp.decisions[0].reason === 'capability_unavailable' && noInApp.selectedChannels.join(',') === 'email');
const delivered = plan({ context: context({ deliveredChannels: ['in_app', 'email'] }) });
checar('canais já entregues não são selecionados novamente', delivered.selectedChannels.length === 0 && delivered.decisions.filter((item) => item.reason === 'already_delivered').length === 2);

const quietNow = new Date(2026, 8, 8, 22, 0, 0, 0);
const quiet = plan({ event: event('engagement'), context: context({ now: quietNow }), preferences: preferences({ emailEducation: true, push: true, webPush: true }) });
checar('horário silencioso bloqueia engajamento', quiet.selectedChannels.length === 0 && quiet.decisions.every((item) => item.reason === 'quiet_hours'));
const sundayNow = new Date(2026, 8, 6, 12, 0, 0, 0);
const sunday = plan({ event: event('education', { createdAt: new Date(sundayNow.getTime() - 1000) }), context: context({ now: sundayNow }), preferences: preferences({ emailEducation: true }) });
checar(
  'domingo silencioso bloqueia canais educativos habilitados',
  sunday.selectedChannels.length === 0
    && sunday.decisions.filter((item) => item.reason === 'sunday_quiet').length === 2
    && sunday.decisions.filter((item) => item.reason === 'channel_disabled').length === 2,
);
const cap = plan({ event: event('engagement'), context: context({ engagementSentToday: 2 }), preferences: preferences({ emailEducation: true, push: true, webPush: true }) });
checar('cap diário bloqueia engajamento', cap.decisions.every((item) => item.reason === 'daily_cap'));

const repeatedA = plan();
const repeatedB = plan();
checar('mesma entrada produz plano determinístico', JSON.stringify(repeatedA) === JSON.stringify(repeatedB));
checar('input não é mutado', channels.join(',') === 'email,web_push,push,in_app');

checar('evento rejeita campo extra/PII', erroCodigo(() => plan({ event: { ...event(), email: 'x@example.test' } })) === 'event_campos_invalidos');
checar('contexto rejeita campo extra', erroCodigo(() => plan({ context: { ...context(), provider: 'x' } })) === 'context_campos_invalidos');
checar('capabilities rejeitam campo extra', erroCodigo(() => plan({ capabilities: { ...capabilities(), fcm: true } })) === 'capabilities_campos_invalidos');
checar('preferências rejeitam campo extra', erroCodigo(() => plan({ preferences: { ...preferences(), marketing: true } })) === 'preferences_campos_invalidos');
checar('tenant divergente falha fechado', erroCodigo(() => plan({ context: context({ tenantId: 'tenant-02' }) })) === 'tenant_divergente');
checar('ator divergente falha fechado', erroCodigo(() => plan({ context: context({ actorKey: 'actor-02' }) })) === 'actor_divergente');
checar('evento futuro falha fechado', erroCodigo(() => plan({ event: event('operational', { createdAt: new Date(NOW.getTime() + 1000) }) })) === 'event_no_futuro');
checar('kind inválido falha fechado', erroCodigo(() => plan({ event: event('operational', { kind: 'marketing' }) })) === 'event_kind_invalido');
checar('canal solicitado inválido falha fechado', erroCodigo(() => plan({ event: event('operational', { requestedChannels: ['sms'] }) })) === 'requested_channels_invalidos');
checar('canal solicitado duplicado falha fechado', erroCodigo(() => plan({ event: event('operational', { requestedChannels: ['email', 'email'] }) })) === 'requested_channels_invalidos');
checar('lista solicitada vazia falha fechado', erroCodigo(() => plan({ event: event('operational', { requestedChannels: [] }) })) === 'requested_channels_invalidos');
checar('histórico duplicado falha fechado', erroCodigo(() => plan({ context: context({ deliveredChannels: ['email', 'email'] }) })) === 'delivered_channels_invalidos');
checar('contador negativo falha fechado', erroCodigo(() => plan({ context: context({ engagementSentToday: -1 }) })) === 'engagement_count_invalido');
checar('capability não booleana falha fechado', erroCodigo(() => plan({ capabilities: capabilities({ push: 'yes' }) })) === 'capabilities_invalidas');
checar('preferência inválida vira decisão fail-closed', plan({ preferences: preferences({ maxEngagementPerDay: 99 }) }).decisions.every((item) => item.reason === 'invalid_preferences'));

if (falhas) {
  console.error('\nFALHOU: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(1);
}
console.log('\nPASSOU: ' + ok + ' ok, 0 falhas');
