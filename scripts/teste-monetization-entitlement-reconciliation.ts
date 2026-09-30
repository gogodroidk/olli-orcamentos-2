import {
  ENTITLEMENT_PLANS,
  ENTITLEMENT_STATUSES,
  MONETIZATION_ENTITLEMENT_VERSION,
  reconciliarEntitlementMonetizacao,
} from '../worker/src/monetizationEntitlementReconciliation.js';
import {
  criarEstadoTrial,
  criarEventoMonetizacao,
  iniciarTrial,
  tornarTrialElegivel,
} from '../worker/src/monetizationEvents.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nMonetização OLLI — reconciliação local de entitlement e trial');

const NOW = '2026-09-10T12:00:00.000Z';
const snapshot = (overrides: Record<string, unknown> = {}) => ({
  authority: 'server_entitlement_snapshot',
  tenantId: 'tenant-01',
  revision: 7,
  plan: 'free',
  status: 'active',
  effectiveAt: '2026-09-01T00:00:00.000Z',
  validUntil: '2026-10-01T00:00:00.000Z',
  ...overrides,
});
const reconciliar = (overrides: Record<string, unknown> = {}) => reconciliarEntitlementMonetizacao({
  tenantId: 'tenant-01',
  now: NOW,
  entitlementSnapshot: snapshot(),
  ...overrides,
} as any);
const payment = (type: 'payment.checkout_started' | 'payment.approved' | 'payment.cancelled' | 'subscription.renewed') => criarEventoMonetizacao({
  type,
  tenantId: 'tenant-01',
  actorKey: 'actor-hmac-01',
  occurredAt: '2026-09-10T10:00:00.000Z',
  dedupeKey: 'payment-001',
  variant: 'contextual_trial',
  metadata: type === 'subscription.renewed'
    ? { provider: 'unknown', plan: 'pro_monthly', cycle: 2 }
    : { provider: 'unknown', plan: 'pro_monthly' },
});

const initialTrial = criarEstadoTrial({ tenantId: 'tenant-01' });
const eligibleTrial = tornarTrialElegivel(initialTrial, {
  tenantId: 'tenant-01',
  trigger: 'first_pdf',
  occurredAt: '2026-09-01T12:00:00.000Z',
}).state;
const activeTrial = iniciarTrial(eligibleTrial, {
  tenantId: 'tenant-01',
  trialId: 'trial-01',
  startedAt: '2026-09-01T12:00:00.000Z',
}).state;
const trialLedger = (state = activeTrial, overrides: Record<string, unknown> = {}) => ({
  authority: 'server_trial_ledger',
  revision: 3,
  state,
  ...overrides,
});
const clientClaim = (overrides: Record<string, unknown> = {}) => ({
  authority: 'client_cache',
  tenantId: 'tenant-01',
  entitlementRevision: 7,
  plan: 'free',
  capturedAt: '2026-09-10T11:00:00.000Z',
  validUntil: '2026-09-10T13:00:00.000Z',
  ...overrides,
});

checar('versão do reconciliador é explícita', MONETIZATION_ENTITLEMENT_VERSION === '2026-09-01.v1');
checar('planos efetivos são fechados', ENTITLEMENT_PLANS.join(',') === 'free,pro,empresa');
checar('status autoritativos são fechados', ENTITLEMENT_STATUSES.join(',') === 'active,past_due,cancelled,unknown');

const gratuito = reconciliar();
checar('snapshot free ativo mantém acesso gratuito', gratuito.effectivePlan === 'free' && !gratuito.canUseProFeatures && gratuito.reason === 'free_entitlement_active');
checar('saída é imutável e preserva dados', Object.isFrozen(gratuito) && gratuito.dataDisposition === 'preserve');
checar('saída não expõe provider, e-mail ou conteúdo', !('provider' in gratuito) && !('email' in gratuito) && !('payload' in gratuito));

const pro = reconciliar({ entitlementSnapshot: snapshot({ plan: 'pro' }) });
checar('snapshot Pro ativo é a fonte autoritativa', pro.effectivePlan === 'pro' && pro.canUseProFeatures && pro.source === 'server_entitlement_snapshot' && !pro.temporary);
const empresa = reconciliar({ entitlementSnapshot: snapshot({ plan: 'empresa' }) });
checar('snapshot Empresa ativo libera apenas o nível declarado', empresa.effectivePlan === 'empresa' && empresa.canUseEmpresaFeatures);

const checkout = reconciliar({ paymentEvent: payment('payment.checkout_started') });
checar('checkout iniciado não concede Pro', checkout.effectivePlan === 'free' && !checkout.canUseProFeatures && checkout.paymentSignalObserved);
const aprovadoSemEntitlement = reconciliar({ paymentEvent: payment('payment.approved') });
checar('pagamento aprovado isolado nunca concede plano', aprovadoSemEntitlement.effectivePlan === 'free' && aprovadoSemEntitlement.reconcileRequired && aprovadoSemEntitlement.reason === 'payment_pending_entitlement');
const renovadoSemEntitlement = reconciliar({ paymentEvent: payment('subscription.renewed') });
checar('renovação isolada também não concede plano', renovadoSemEntitlement.effectivePlan === 'free' && renovadoSemEntitlement.reconcileRequired);
const aprovadoComEntitlement = reconciliar({
  entitlementSnapshot: snapshot({ plan: 'pro' }),
  paymentEvent: payment('payment.approved'),
});
checar('pagamento consistente não substitui snapshot Pro', aprovadoComEntitlement.effectivePlan === 'pro' && aprovadoComEntitlement.source === 'server_entitlement_snapshot' && !aprovadoComEntitlement.reconcileRequired);
const cancelamentoPendente = reconciliar({
  entitlementSnapshot: snapshot({ plan: 'pro' }),
  paymentEvent: payment('payment.cancelled'),
});
checar('cancelamento divergente preserva snapshot e pede reconciliação', cancelamentoPendente.effectivePlan === 'pro' && cancelamentoPendente.reconcileRequired && cancelamentoPendente.reason === 'cancellation_pending_entitlement');

const trial = reconciliar({ trialLedger: trialLedger() });
checar('trial servidor ativo libera Pro temporário', trial.effectivePlan === 'pro' && trial.temporary && trial.source === 'server_trial_ledger');
checar('trial usa exatamente o fim do ledger', trial.validUntil === activeTrial.endsAt && !trial.reconcileRequired);
const trialComPagamento = reconciliar({
  trialLedger: trialLedger(),
  paymentEvent: payment('payment.approved'),
});
checar('pagamento pendente não é a fonte do Pro durante trial', trialComPagamento.effectivePlan === 'pro' && trialComPagamento.source === 'server_trial_ledger' && trialComPagamento.reconcileRequired);
const overlap = reconciliar({
  entitlementSnapshot: snapshot({ plan: 'pro' }),
  trialLedger: trialLedger(),
});
checar('snapshot pago vence overlap sem ampliar privilégio', overlap.effectivePlan === 'pro' && overlap.source === 'server_entitlement_snapshot' && overlap.reconcileRequired);

const expiredTrial = reconciliar({
  now: activeTrial.endsAt,
  trialLedger: trialLedger(),
});
checar('trial expirado falha fechado e pede fechamento do ledger', expiredTrial.effectivePlan === 'free' && expiredTrial.reconcileRequired && expiredTrial.reason === 'trial_expired_requires_ledger_close');
const futureTrialState = Object.freeze({
  ...activeTrial,
  startedAt: '2026-09-11T12:00:00.000Z',
  endsAt: '2026-09-25T12:00:00.000Z',
});
const futureTrial = reconciliar({ trialLedger: trialLedger(futureTrialState as any) });
checar('trial futuro não libera acesso', futureTrial.effectivePlan === 'free' && futureTrial.reason === 'trial_from_future');
const eligibleOnly = reconciliar({ trialLedger: trialLedger(eligibleTrial) });
checar('mera elegibilidade não libera Pro', eligibleOnly.effectivePlan === 'free' && !eligibleOnly.canUseProFeatures);
const convertedWithoutEntitlement = reconciliar({
  trialLedger: trialLedger(Object.freeze({
    ...activeTrial,
    state: 'converted',
    endedAt: '2026-09-05T12:00:00.000Z',
    convertedAt: '2026-09-05T12:00:00.000Z',
  }) as any),
});
checar('trial convertido sem entitlement pede reconciliação', convertedWithoutEntitlement.effectivePlan === 'free' && convertedWithoutEntitlement.reason === 'converted_trial_without_entitlement');

const upgradeCliente = reconciliar({ clientClaim: clientClaim({ plan: 'empresa' }) });
checar('cache cliente não promove plano', upgradeCliente.effectivePlan === 'free' && upgradeCliente.clientClaimDisposition === 'ignored_upgrade' && upgradeCliente.reason === 'client_upgrade_ignored');
const claimAtrasado = reconciliar({
  entitlementSnapshot: snapshot({ plan: 'pro' }),
  clientClaim: clientClaim({ entitlementRevision: 6, plan: 'free' }),
});
checar('cache antigo não rebaixa snapshot servidor', claimAtrasado.effectivePlan === 'pro' && claimAtrasado.clientClaimDisposition === 'matched_or_lower');
const claimAhead = reconciliar({ clientClaim: clientClaim({ entitlementRevision: 8, plan: 'pro' }) });
checar('revisão cliente à frente falha fechado', claimAhead.effectivePlan === 'free' && claimAhead.reconcileRequired && claimAhead.reason === 'client_revision_ahead');
const claimExpired = reconciliar({
  clientClaim: clientClaim({ capturedAt: '2026-09-09T10:00:00.000Z', validUntil: '2026-09-09T11:00:00.000Z' }),
});
checar('cache expirado é ignorado', claimExpired.effectivePlan === 'free' && claimExpired.clientClaimDisposition === 'expired');

const cancelled = reconciliar({ entitlementSnapshot: snapshot({ plan: 'pro', status: 'cancelled' }) });
checar('cancelamento autoritativo volta ao free preservando dados', cancelled.effectivePlan === 'free' && !cancelled.reconcileRequired && cancelled.dataDisposition === 'preserve');
const pastDue = reconciliar({ entitlementSnapshot: snapshot({ plan: 'pro', status: 'past_due' }) });
checar('past_due sem política de grace não mantém Pro', pastDue.effectivePlan === 'free' && pastDue.reconcileRequired);
const unknown = reconciliar({ entitlementSnapshot: snapshot({ plan: 'pro', status: 'unknown' }) });
checar('status desconhecido falha fechado', unknown.effectivePlan === 'free' && unknown.reason === 'snapshot_status_unknown');
const expiredSnapshot = reconciliar({ entitlementSnapshot: snapshot({ validUntil: NOW }) });
checar('snapshot expirado não concede acesso', expiredSnapshot.effectivePlan === 'free' && expiredSnapshot.reason === 'snapshot_expired');
const futureSnapshot = reconciliar({ entitlementSnapshot: snapshot({ effectiveAt: '2026-09-11T00:00:00.000Z' }) });
checar('snapshot futuro não concede acesso', futureSnapshot.effectivePlan === 'free' && futureSnapshot.reason === 'snapshot_not_effective');
const inconsistentFree = reconciliar({ entitlementSnapshot: snapshot({ status: 'cancelled' }) });
checar('free com status de cobrança inconsistente pede reconciliação', inconsistentFree.effectivePlan === 'free' && inconsistentFree.reconcileRequired && inconsistentFree.reason === 'snapshot_free_status_inconsistent');

const crossTenantSnapshot = reconciliar({ entitlementSnapshot: snapshot({ tenantId: 'tenant-02' }) });
checar('snapshot de outro tenant falha fechado', crossTenantSnapshot.effectivePlan === 'free' && crossTenantSnapshot.reason === 'snapshot_tenant_mismatch');
const crossTenantTrial = reconciliar({
  trialLedger: trialLedger(Object.freeze({ ...activeTrial, tenantId: 'tenant-02' }) as any),
});
checar('trial de outro tenant falha fechado', crossTenantTrial.effectivePlan === 'free' && crossTenantTrial.reason === 'trial_tenant_mismatch');
const crossTenantPayment = reconciliar({
  paymentEvent: Object.freeze({ ...payment('payment.approved'), tenantId: 'tenant-02' }),
});
checar('evento de outro tenant falha fechado', crossTenantPayment.effectivePlan === 'free' && crossTenantPayment.reason === 'payment_tenant_mismatch');
const crossTenantClaim = reconciliar({ clientClaim: clientClaim({ tenantId: 'tenant-02' }) });
checar('cache de outro tenant falha fechado', crossTenantClaim.effectivePlan === 'free' && crossTenantClaim.reason === 'client_claim_tenant_mismatch');

checar('snapshot com PII/campo extra é rejeitado', erroCodigo(() => reconciliar({ entitlementSnapshot: { ...snapshot(), email: 'x@y.test' } })) === 'snapshot_campos_invalidos');
checar('claim com conteúdo extra é rejeitado', erroCodigo(() => reconciliar({ clientClaim: { ...clientClaim(), quoteText: 'segredo' } })) === 'client_claim_campos_invalidos');
checar('trial não autoritativo é rejeitado', erroCodigo(() => reconciliar({ trialLedger: trialLedger(activeTrial, { authority: 'client_trial' }) })) === 'trial_ledger_nao_autoritativo');
checar('plano desconhecido é rejeitado', erroCodigo(() => reconciliar({ entitlementSnapshot: snapshot({ plan: 'vip' }) })) === 'snapshot_plano_invalido');
checar('revisão negativa é rejeitada', erroCodigo(() => reconciliar({ entitlementSnapshot: snapshot({ revision: -1 }) })) === 'snapshot_revision_invalida');
checar('janela invertida é rejeitada', erroCodigo(() => reconciliar({ entitlementSnapshot: snapshot({ effectiveAt: '2026-10-02T00:00:00Z' }) })) === 'snapshot_janela_invalida');
checar('relógio inválido é rejeitado', erroCodigo(() => reconciliar({ now: 'não-é-data' })) === 'agora_invalido');

const repetidoA = reconciliar({ entitlementSnapshot: snapshot({ plan: 'pro' }), clientClaim: clientClaim() });
const repetidoB = reconciliar({ entitlementSnapshot: snapshot({ plan: 'pro' }), clientClaim: clientClaim() });
checar('mesma entrada produz saída determinística', JSON.stringify(repetidoA) === JSON.stringify(repetidoB));

if (falhas) {
  console.error('\nFALHOU: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(1);
}
console.log('\nPASSOU: ' + ok + ' ok, 0 falhas');
