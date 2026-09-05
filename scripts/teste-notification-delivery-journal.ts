import {
  orquestrarEntregaNotificacao,
} from '../src/services/notificationDeliveryOrchestrator.ts';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../src/services/notificationPolicy.ts';
import {
  NOTIFICATION_DELIVERY_JOURNAL_VERSION,
  criarEstadoJournalEntrega,
  listarCanaisEntregues,
  projetarJournalEntrega,
  registrarPlanoEntrega,
  registrarResultadoEntrega,
} from '../worker/src/notificationDeliveryJournal.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nNotificações OLLI — journal de decisão e resultado');

const TENANT = 'tenant-01';
const ACTOR = 'actor-fingerprint-01';
const CREATED = '2026-09-01T12:00:00.000Z';
const DECIDED = '2026-09-01T12:01:00.000Z';
const event = {
  eventId: 'notification-event-01',
  tenantId: TENANT,
  actorKey: ACTOR,
  kind: 'operational' as const,
  requestedChannels: ['email', 'web_push', 'push', 'in_app'] as const,
  createdAt: new Date('2026-09-01T12:00:30.000Z'),
};
const plan = orquestrarEntregaNotificacao({
  event: { ...event, requestedChannels: [...event.requestedChannels] },
  context: {
    tenantId: TENANT,
    actorKey: ACTOR,
    now: new Date(DECIDED),
    engagementSentToday: 0,
    deliveredChannels: [],
  },
  preferences: DEFAULT_NOTIFICATION_PREFERENCES,
  capabilities: { in_app: true, email: true, push: true, web_push: true },
});
const context = (operationId: string, expectedRevision: number, now: string, overrides: Record<string, unknown> = {}) => ({
  tenantId: TENANT,
  actorKey: ACTOR,
  expectedRevision,
  operationId,
  now,
  ...overrides,
});
const outcome = (channel: string, status: string, failureCode: string | null = null, overrides: Record<string, unknown> = {}) => ({
  eventId: event.eventId,
  channel,
  status,
  failureCode,
  ...overrides,
});

checar('versão explícita', NOTIFICATION_DELIVERY_JOURNAL_VERSION === '2026-09-01.v1');
const initial = criarEstadoJournalEntrega({ tenantId: TENANT, actorKey: ACTOR, createdAt: CREATED });
checar('estado inicial revisionado e vazio', initial.revision === 0 && initial.entries.length === 0 && initial.operations.length === 0);
checar('estado inicial profundamente imutável', Object.isFrozen(initial) && Object.isFrozen(initial.entries) && Object.isFrozen(initial.operations));
checar('estado não contém destinatário, token ou provider', !/(recipient|email|token|provider|content|body)/i.test(JSON.stringify(initial)));

const planned = registrarPlanoEntrega(initial, plan, context('op-plan-01', 0, DECIDED));
checar('plano cria uma revisão e quatro decisões', planned.state.revision === 1 && planned.state.entries.length === 4);
checar('canais selecionados ficam planned', planned.state.entries.filter((item: any) => item.status === 'planned').length === 2);
checar('canais negados ficam skipped', planned.state.entries.filter((item: any) => item.status === 'skipped').length === 2);
checar('journal preserva motivos auditáveis', planned.state.entries.some((item: any) => item.decisionReason === 'channel_disabled'));
checar('estado original permanece vazio', initial.revision === 0 && initial.entries.length === 0);
checar('resultado da operação é imutável', Object.isFrozen(planned) && Object.isFrozen(planned.state) && planned.state.entries.every(Object.isFrozen));

const replayPlan = registrarPlanoEntrega(planned.state, plan, context('op-plan-01', 0, DECIDED));
checar('replay idêntico do plano é idempotente', replayPlan.idempotent && replayPlan.state === planned.state);
const divergentPlan = { ...plan, eventId: 'notification-event-02' };
checar('replay divergente do plano falha fechado', erroCodigo(() => registrarPlanoEntrega(planned.state, divergentPlan, context('op-plan-01', 0, DECIDED))) === 'operation_replay_divergente');

const delivered = registrarResultadoEntrega(
  planned.state,
  outcome('in_app', 'delivered'),
  context('op-result-in-app', 1, '2026-09-01T12:02:00.000Z'),
);
checar('resultado entregue avança revisão', delivered.state.revision === 2);
checar('entrega terminal não guarda erro', delivered.state.entries.find((item: any) => item.channel === 'in_app').status === 'delivered' && delivered.state.entries.find((item: any) => item.channel === 'in_app').failureCode === null);
const deliveredChannels = listarCanaisEntregues(delivered.state, { tenantId: TENANT, actorKey: ACTOR, eventId: event.eventId });
checar('projeção retorna canal entregue para deduplicação', Object.isFrozen(deliveredChannels) && deliveredChannels.join(',') === 'in_app');

const failed = registrarResultadoEntrega(
  delivered.state,
  outcome('email', 'failed', 'provider_unavailable'),
  context('op-result-email', 2, '2026-09-01T12:03:00.000Z'),
);
checar('falha terminal é categorizada sem resposta externa', failed.state.entries.find((item: any) => item.channel === 'email').status === 'failed' && failed.state.entries.find((item: any) => item.channel === 'email').failureCode === 'provider_unavailable');
checar('falha não entra em canais entregues', listarCanaisEntregues(failed.state, { tenantId: TENANT, actorKey: ACTOR, eventId: event.eventId }).join(',') === 'in_app');
const replayOutcome = registrarResultadoEntrega(failed.state, outcome('email', 'failed', 'provider_unavailable'), context('op-result-email', 2, '2026-09-01T12:03:00.000Z'));
checar('replay idêntico do resultado é idempotente', replayOutcome.idempotent && replayOutcome.state === failed.state);
checar('replay divergente do resultado falha fechado', erroCodigo(() => registrarResultadoEntrega(failed.state, outcome('email', 'delivered'), context('op-result-email', 2, '2026-09-01T12:03:00.000Z'))) === 'operation_replay_divergente');

checar('novo resultado terminal falha fechado', erroCodigo(() => registrarResultadoEntrega(failed.state, outcome('email', 'failed', 'timeout'), context('op-result-email-02', 3, '2026-09-01T12:04:00.000Z'))) === 'resultado_terminal');
checar('canal skipped não aceita resultado', erroCodigo(() => registrarResultadoEntrega(failed.state, outcome('push', 'delivered'), context('op-result-push', 3, '2026-09-01T12:04:00.000Z'))) === 'canal_nao_selecionado');
checar('canal ausente não aceita resultado', erroCodigo(() => registrarResultadoEntrega(failed.state, outcome('web_push', 'delivered', null, { eventId: 'evento-ausente' }), context('op-result-missing', 3, '2026-09-01T12:04:00.000Z'))) === 'canal_nao_planejado');
checar('resultado delivered rejeita failureCode', erroCodigo(() => registrarResultadoEntrega(planned.state, outcome('in_app', 'delivered', 'erro'), context('op-invalid-delivered', 1, '2026-09-01T12:02:00.000Z'))) === 'outcome_failure_code_invalido');
checar('resultado failed exige failureCode', erroCodigo(() => registrarResultadoEntrega(planned.state, outcome('email', 'failed'), context('op-invalid-failed', 1, '2026-09-01T12:02:00.000Z'))) === 'outcome_failure_code_invalido');

checar('tenant divergente falha fechado', erroCodigo(() => registrarPlanoEntrega(initial, plan, context('op-tenant', 0, DECIDED, { tenantId: 'tenant-02' }))) === 'tenant_divergente');
checar('ator divergente falha fechado', erroCodigo(() => registrarPlanoEntrega(initial, plan, context('op-actor', 0, DECIDED, { actorKey: 'actor-02' }))) === 'actor_divergente');
checar('revisão divergente falha fechado', erroCodigo(() => registrarPlanoEntrega(initial, plan, context('op-revision', 1, DECIDED))) === 'revision_divergente');
checar('relógio regressivo falha fechado', erroCodigo(() => registrarPlanoEntrega(initial, plan, context('op-clock', 0, '2026-09-01T11:59:59.000Z'))) === 'clock_regressivo');
checar('contexto com campo extra falha fechado', erroCodigo(() => registrarPlanoEntrega(initial, plan, { ...context('op-extra', 0, DECIDED), provider: 'x' } as any)) === 'context_campos_invalidos');
checar('plano com PII/campo extra falha fechado', erroCodigo(() => registrarPlanoEntrega(initial, { ...plan, recipient: 'x@example.test' } as any, context('op-pii', 0, DECIDED))) === 'plan_campos_invalidos');
checar('resultado com campo extra falha fechado', erroCodigo(() => registrarResultadoEntrega(planned.state, { ...outcome('in_app', 'delivered'), providerId: 'x' } as any, context('op-outcome-extra', 1, '2026-09-01T12:02:00.000Z'))) === 'outcome_campos_invalidos');

const duplicateDecisions = { ...plan, decisions: [...plan.decisions, plan.decisions[0]] };
checar('decisões duplicadas falham fechado', erroCodigo(() => registrarPlanoEntrega(initial, duplicateDecisions as any, context('op-duplicate', 0, DECIDED))) === 'plan_decisions_invalidas');
const selectedDivergent = { ...plan, selectedChannels: ['email', 'in_app'] };
checar('selectedChannels divergente da prioridade falha fechado', erroCodigo(() => registrarPlanoEntrega(initial, selectedDivergent as any, context('op-selected', 0, DECIDED))) === 'plan_selected_divergente');

const projection = projetarJournalEntrega(failed.state, { tenantId: TENANT, actorKey: ACTOR });
checar('projeção omite índice interno de operações', !('operations' in projection) && projection.entries.length === 4);
checar('projeção é profundamente imutável', Object.isFrozen(projection) && Object.isFrozen(projection.entries) && projection.entries.every(Object.isFrozen));
checar('projeção não contém PII/provider/conteúdo', !/(recipient|emailAddress|token|providerId|content|body)/i.test(JSON.stringify(projection)));
checar('projeção de outro tenant falha fechado', erroCodigo(() => projetarJournalEntrega(failed.state, { tenantId: 'tenant-02', actorKey: ACTOR })) === 'tenant_divergente');
checar('projeção de outro ator falha fechado', erroCodigo(() => listarCanaisEntregues(failed.state, { tenantId: TENANT, actorKey: 'actor-02', eventId: event.eventId })) === 'actor_divergente');

const tampered = { ...failed.state, revision: 99 };
checar('estado adulterado falha fechado', erroCodigo(() => projetarJournalEntrega(tampered, { tenantId: TENANT, actorKey: ACTOR })) === 'state_revision_divergente');

if (falhas) {
  console.error('\nFALHOU: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(1);
}
console.log('\nPASSOU: ' + ok + ' ok, 0 falhas');
