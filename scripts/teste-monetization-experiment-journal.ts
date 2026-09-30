import {
  MONETIZATION_JOURNAL_VERSION,
  criarJournalExperimentoMonetizacao,
  registrarEventoExperimentoMonetizacao,
  resumirJournalExperimentoMonetizacao,
} from '../worker/src/monetizationExperimentJournal.js';
import { criarEventoMonetizacao } from '../worker/src/monetizationEvents.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nMonetização OLLI — journal local do experimento');

const TENANT = 'tenant-01';
const ACTOR = 'actor-hmac-01';
const assignment = (variant = 'contextual_trial', overrides: Record<string, unknown> = {}) => ({
  authority: 'server_experiment_assignment',
  experimentId: 'pro-value-v1',
  variant,
  ...overrides,
});
const event = (
  type: any,
  minute: number,
  dedupeKey: string,
  metadata: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) => ({
  ...criarEventoMonetizacao({
    type,
    tenantId: TENANT,
    actorKey: ACTOR,
    occurredAt: `2026-09-01T12:${String(minute).padStart(2, '0')}:00.000Z`,
    dedupeKey,
    variant: 'contextual_trial',
    metadata,
  }),
  ...overrides,
});
const recordAt = (minute: number) => `2026-09-01T13:${String(minute).padStart(2, '0')}:00.000Z`;
const append = (state: any, evento: any, minute: number, overrides: Record<string, unknown> = {}) => registrarEventoExperimentoMonetizacao(
  state,
  evento,
  {
    tenantId: TENANT,
    actorKey: ACTOR,
    expectedRevision: state.revision,
    recordedAt: recordAt(minute),
    ...overrides,
  },
);

checar('versão do journal é explícita', MONETIZATION_JOURNAL_VERSION === '2026-09-01.v1');
const initial = criarJournalExperimentoMonetizacao({
  tenantId: TENANT,
  actorKey: ACTOR,
  assignment: assignment(),
  createdAt: '2026-09-01T11:00:00.000Z',
});
checar('assignment servidor fica fixo no estado', initial.experimentId === 'pro-value-v1' && initial.variant === 'contextual_trial');
checar('estado inicial é imutável e vazio', Object.isFrozen(initial) && Object.isFrozen(initial.entries) && initial.revision === 0);
checar('estado não contém e-mail, provider ou conteúdo', !('email' in initial) && !('provider' in initial) && !('payload' in initial));

const sequence = [
  event('signup.completed', 0, 'signup-1', { channel: 'facebook' }),
  event('quote.created', 1, 'quote-1', { count: 1 }),
  event('pdf.shared', 2, 'pdf-1', { delivery: 'whatsapp' }),
  event('pro.preview.viewed', 3, 'preview-1', { feature: 'brand' }),
  event('pro.cta.clicked', 4, 'cta-1', { feature: 'brand' }),
  event('trial.eligible', 5, 'eligible-1', { trigger: 'first_pdf' }),
  event('trial.started', 6, 'trial-start-1', { trialId: 'trial-01' }),
  event('trial.ended', 7, 'trial-end-1', { trialId: 'trial-01', converted: true }),
  event('payment.checkout_started', 8, 'checkout-1', { provider: 'unknown', plan: 'pro_monthly' }),
  event('payment.approved', 9, 'payment-1', { provider: 'unknown', plan: 'pro_monthly' }),
  event('subscription.renewed', 10, 'renewal-1', { provider: 'unknown', plan: 'pro_monthly', cycle: 2 }),
];
let state = initial;
sequence.forEach((item, index) => { state = append(state, item, index).state; });
checar('append cresce revisão uma vez por evento', state.revision === sequence.length && state.entries.length === sequence.length);
checar('entries guardam hash e métrica, não metadata/provider', state.entries.every((entry: any) => /^[a-f0-9]{64}$/.test(entry.eventHash) && !('metadata' in entry) && !('provider' in entry)));
checar('quote preserva somente contador necessário', state.entries.find((entry: any) => entry.type === 'quote.created')?.metricValue === 1);
checar('renovação preserva somente ciclo necessário', state.entries.find((entry: any) => entry.type === 'subscription.renewed')?.metricValue === 2);

const summary = resumirJournalExperimentoMonetizacao(state, { tenantId: TENANT, actorKey: ACTOR });
checar('resumo conta sinais do funil', summary.signals.previewViews === 1 && summary.signals.ctaClicks === 1 && summary.signals.trialsStarted === 1 && summary.signals.paymentsApproved === 1);
checar('denominadores são explícitos', summary.denominators.ctaRate === 1 && summary.denominators.trialStartRate === 1 && summary.denominators.secondCycleRate === 1);
checar('sequência coerente não cria anomalia', summary.anomalies.length === 0 && !summary.reconcileRequired);
checar('resumo nunca concede entitlement nem valida receita', !summary.entitlementGranted && !summary.conversionValidated && summary.evidenceBoundary === 'analytics_signal_only');
checar('resumo e objetos internos são imutáveis', Object.isFrozen(summary) && Object.isFrozen(summary.signals) && Object.isFrozen(summary.denominators) && Object.isFrozen(summary.anomalies));

const firstEvent = sequence[0];
const firstState = append(initial, firstEvent, 0).state;
const replay = registrarEventoExperimentoMonetizacao(firstState, firstEvent, {
  tenantId: TENANT,
  actorKey: ACTOR,
  expectedRevision: 0,
  recordedAt: recordAt(1),
});
checar('replay idêntico é idempotente mesmo com revisão antiga', !replay.appended && replay.replayed && replay.state === firstState);
checar('replay divergente falha fechado', erroCodigo(() => registrarEventoExperimentoMonetizacao(
  firstState,
  { ...firstEvent, occurredAt: '2026-09-01T12:00:01.000Z' },
  { tenantId: TENANT, actorKey: ACTOR, expectedRevision: 1, recordedAt: recordAt(1) },
)) === 'evento_replay_divergente');
checar('revisão antiga em evento novo falha fechado', erroCodigo(() => registrarEventoExperimentoMonetizacao(
  firstState,
  sequence[1],
  { tenantId: TENANT, actorKey: ACTOR, expectedRevision: 0, recordedAt: recordAt(1) },
)) === 'revision_divergente');
checar('recordedAt regressivo falha fechado', erroCodigo(() => registrarEventoExperimentoMonetizacao(
  firstState,
  sequence[1],
  { tenantId: TENANT, actorKey: ACTOR, expectedRevision: 1, recordedAt: '2026-09-01T12:59:00Z' },
)) === 'recorded_at_regressivo');
checar('evento posterior à ingestão falha fechado', erroCodigo(() => registrarEventoExperimentoMonetizacao(
  initial,
  sequence[10],
  { tenantId: TENANT, actorKey: ACTOR, expectedRevision: 0, recordedAt: '2026-09-01T12:05:00.000Z' },
)) === 'evento_futuro');
checar('tenant de contexto divergente falha fechado', erroCodigo(() => append(initial, firstEvent, 0, { tenantId: 'tenant-02' })) === 'tenant_divergente');
checar('ator de contexto divergente falha fechado', erroCodigo(() => append(initial, firstEvent, 0, { actorKey: 'actor-hmac-02' })) === 'actor_divergente');
const crossTenantEvent = criarEventoMonetizacao({
  type: 'signup.completed',
  tenantId: 'tenant-02',
  actorKey: ACTOR,
  occurredAt: '2026-09-01T12:00:00.000Z',
  dedupeKey: 'signup-cross-tenant',
  variant: 'contextual_trial',
  metadata: { channel: 'facebook' },
});
checar('tenant do evento divergente falha fechado', erroCodigo(() => append(initial, crossTenantEvent, 0)) === 'evento_tenant_divergente');
checar('ator do evento divergente falha fechado', erroCodigo(() => append(initial, { ...firstEvent, actorKey: 'actor-hmac-02' }, 0)) === 'evento_actor_divergente');
checar('variante do evento divergente falha fechado', erroCodigo(() => append(initial, { ...firstEvent, variant: 'control' }, 0)) === 'evento_variant_divergente');
checar('campo extra com PII é rejeitado', erroCodigo(() => append(initial, { ...firstEvent, email: 'x@y.test' }, 0)) === 'evento_campos_invalidos');
checar('metadata extra é rejeitada', erroCodigo(() => append(initial, { ...firstEvent, metadata: { channel: 'facebook', name: 'Pessoa' } }, 0)) === 'evento_metadata_invalida');
const longTenant = 't'.repeat(100);
const longState = criarJournalExperimentoMonetizacao({
  tenantId: longTenant,
  actorKey: ACTOR,
  assignment: assignment(),
  createdAt: '2026-09-01T11:00:00Z',
});
const longIdEvent = criarEventoMonetizacao({
  type: 'signup.completed',
  tenantId: longTenant,
  actorKey: ACTOR,
  occurredAt: '2026-09-01T12:00:00.000Z',
  dedupeKey: 'd'.repeat(160),
  variant: 'contextual_trial',
  metadata: { channel: 'organic' },
});
checar('journal aceita ID canônico longo produzido pelo contrato', longIdEvent.eventId.length > 200 && registrarEventoExperimentoMonetizacao(
  longState,
  longIdEvent,
  { tenantId: longTenant, actorKey: ACTOR, expectedRevision: 0, recordedAt: recordAt(0) },
).appended);
checar('assignment do cliente é rejeitado', erroCodigo(() => criarJournalExperimentoMonetizacao({ tenantId: TENANT, actorKey: ACTOR, assignment: assignment('control', { authority: 'client_assignment' }), createdAt: '2026-09-01T11:00:00Z' })) === 'assignment_nao_autoritativo');

const anomalyJournal = criarJournalExperimentoMonetizacao({ tenantId: TENANT, actorKey: ACTOR, assignment: assignment(), createdAt: '2026-09-01T11:00:00Z' });
const anomalyEvents = [
  event('pro.cta.clicked', 0, 'cta-anomaly', { feature: 'ai' }),
  event('trial.started', 1, 'trial-anomaly', { trialId: 'trial-02' }),
  event('trial.ended', 2, 'trial-end-anomaly', { trialId: 'trial-02', converted: true }),
  event('payment.approved', 3, 'payment-anomaly', { provider: 'unknown', plan: 'pro_monthly' }),
  event('subscription.renewed', 4, 'renewal-anomaly', { provider: 'unknown', plan: 'pro_monthly', cycle: 2 }),
];
let anomalyState = anomalyJournal;
anomalyEvents.forEach((item, index) => { anomalyState = append(anomalyState, item, index).state; });
const anomalySummary = resumirJournalExperimentoMonetizacao(anomalyState, { tenantId: TENANT, actorKey: ACTOR });
checar('CTA sem preview é marcado', anomalySummary.anomalies.includes('cta_without_prior_preview'));
checar('trial sem elegibilidade é marcado', anomalySummary.anomalies.includes('trial_started_without_eligibility'));
checar('pagamento sem checkout é marcado', anomalySummary.anomalies.includes('payment_without_checkout'));
checar('anomalia exige reconciliação sem conceder plano', anomalySummary.reconcileRequired && !anomalySummary.entitlementGranted);

const quoteJournal = criarJournalExperimentoMonetizacao({ tenantId: TENANT, actorKey: ACTOR, assignment: assignment(), createdAt: '2026-09-01T11:00:00Z' });
let quoteState = append(quoteJournal, event('quote.created', 0, 'quote-3', { count: 3 }), 0).state;
quoteState = append(quoteState, event('quote.created', 1, 'quote-2', { count: 2 }), 1).state;
const quoteSummary = resumirJournalExperimentoMonetizacao(quoteState, { tenantId: TENANT, actorKey: ACTOR });
checar('regressão de contador é marcada sem perder maior valor', quoteSummary.anomalies.includes('quote_count_regression') && quoteSummary.latestQuoteCount === 3);
checar('resumo rejeita tenant divergente', erroCodigo(() => resumirJournalExperimentoMonetizacao(state, { tenantId: 'tenant-02', actorKey: ACTOR })) === 'tenant_divergente');
checar('resumo rejeita ator divergente', erroCodigo(() => resumirJournalExperimentoMonetizacao(state, { tenantId: TENANT, actorKey: 'actor-hmac-02' })) === 'actor_divergente');
checar('estado original permanece vazio', initial.revision === 0 && initial.entries.length === 0);
const repeatedA = resumirJournalExperimentoMonetizacao(state, { tenantId: TENANT, actorKey: ACTOR });
const repeatedB = resumirJournalExperimentoMonetizacao(state, { tenantId: TENANT, actorKey: ACTOR });
checar('mesmo journal produz resumo determinístico', JSON.stringify(repeatedA) === JSON.stringify(repeatedB));

if (falhas) {
  console.error('\nFALHOU: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(1);
}
console.log('\nPASSOU: ' + ok + ' ok, 0 falhas');
