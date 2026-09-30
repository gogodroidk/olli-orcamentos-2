import {
  EMAIL_SUPPRESSION_OUTBOX_VERSION,
  reservarEmailComSupressao,
} from '../worker/src/emailSuppressionOutboxContract.js';
import {
  aplicarEventoSupressaoEmail,
  criarEstadoSupressaoEmail,
} from '../worker/src/emailSuppressionPolicy.js';
import {
  criarItemEmailOutbox,
  marcarEnviando,
  marcarFalha,
} from '../worker/src/emailOutbox.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nE-mail OLLI — composição supressão e reserva da outbox');

const TENANT = 'tenant-01';
const RECIPIENT = 'a'.repeat(64);
const NOW = '2026-09-10T12:00:00.000Z';
const binding = (overrides: Record<string, unknown> = {}) => ({
  authority: 'trusted_delivery_binding',
  tenantId: TENANT,
  recipientFingerprint: RECIPIENT,
  eventId: 'email-confirmed:user-01',
  idempotencyKey: 'welcome:user-01:boas_vindas.v1',
  ...overrides,
});
const context = (kind = 'operational', overrides: Record<string, unknown> = {}) => ({
  tenantId: TENANT,
  recipientFingerprint: RECIPIENT,
  kind,
  now: NOW,
  ...overrides,
});
const outbox = () => criarItemEmailOutbox({
  eventId: 'email-confirmed:user-01',
  idempotencyKey: 'welcome:user-01:boas_vindas.v1',
  template: 'boas_vindas',
  templateVersion: 'boas_vindas.v1',
  purpose: 'account_onboarding',
  recipient: 'pessoa@example.test',
}, { agora: '2026-09-10T11:00:00.000Z' });
const initialSuppression = () => criarEstadoSupressaoEmail({
  tenantId: TENANT,
  recipientFingerprint: RECIPIENT,
  createdAt: '2026-09-01T00:00:00.000Z',
});
const applySuppression = (state: any, event: any) => aplicarEventoSupressaoEmail(state, event, {
  tenantId: TENANT,
  recipientFingerprint: RECIPIENT,
  expectedRevision: state.revision,
  now: NOW,
}).state;
const event = (eventId: string, type: string, occurredAt: string, consentVersion: string | null = null) => ({
  eventId,
  type,
  occurredAt,
  consentVersion,
});
const reserve = (overrides: Record<string, unknown> = {}) => reservarEmailComSupressao({
  suppressionState: initialSuppression(),
  outboxItem: outbox(),
  binding: binding(),
  context: context(),
  ...overrides,
} as any);

checar('versão da composição é explícita', EMAIL_SUPPRESSION_OUTBOX_VERSION === '2026-09-01.v1');
const allowed = reserve();
checar('welcome operacional elegível chega a sending', allowed.reserve && allowed.reason === 'reserved' && allowed.outboxStatus === 'sending');
checar('reserva incrementa exatamente uma tentativa', allowed.attempts === 1 && allowed.claimedItem.attempts === 1);
checar('item reservado preserva eventId e idempotência', allowed.claimedItem.eventId === allowed.eventId && allowed.claimedItem.idempotencyKey === allowed.idempotencyKey);
checar('resultado e item são imutáveis', Object.isFrozen(allowed) && Object.isFrozen(allowed.claimedItem));
checar('composição não inventa provider', !('provider' in allowed) && !('providerId' in allowed));

const educationDenied = reserve({ context: context('education') });
checar('educação sem opt-in é negada antes da tentativa', !educationDenied.reserve && educationDenied.reason === 'consent_required' && educationDenied.attempts === 0);
checar('negação não expõe item nem destinatário', !('claimedItem' in educationDenied) && !JSON.stringify(educationDenied).includes('pessoa@example.test'));
const optedIn = applySuppression(initialSuppression(), event('evt-optin', 'resubscribe', '2026-09-02T00:00:00.000Z', 'consent-v1'));
const educationAllowed = reserve({ suppressionState: optedIn, context: context('education') });
checar('educação com opt-in explícito pode ser reservada', educationAllowed.reserve && educationAllowed.suppressionRevision === 1);

const hard = applySuppression(initialSuppression(), event('evt-hard', 'hard_bounce', '2026-09-02T00:00:00.000Z'));
const hardDenied = reserve({ suppressionState: hard });
checar('hard bounce nega welcome antes da tentativa', !hardDenied.reserve && hardDenied.reason === 'hard_bounce' && hardDenied.attempts === 0);
const complaint = applySuppression(initialSuppression(), event('evt-complaint', 'complaint', '2026-09-02T00:00:00.000Z'));
checar('complaint nega operacional', !reserve({ suppressionState: complaint }).reserve && reserve({ suppressionState: complaint }).reason === 'complaint');
checar('complaint permite somente segurança estrita', reserve({ suppressionState: complaint, context: context('security') }).reserve);
let soft = initialSuppression();
soft = applySuppression(soft, event('evt-soft-1', 'soft_bounce', '2026-09-02T00:00:00.000Z'));
soft = applySuppression(soft, event('evt-soft-2', 'soft_bounce', '2026-09-03T00:00:00.000Z'));
soft = applySuppression(soft, event('evt-soft-3', 'soft_bounce', '2026-09-04T00:00:00.000Z'));
const softDenied = reserve({ suppressionState: soft });
checar('supressão temporária nega antes da tentativa', !softDenied.reserve && softDenied.reason === 'soft_bounce_suppression' && softDenied.attempts === 0);

checar('binding não autoritativo falha fechado', erroCodigo(() => reserve({ binding: binding({ authority: 'client_binding' }) })) === 'binding_nao_autoritativo');
checar('binding com e-mail/campo extra é rejeitado', erroCodigo(() => reserve({ binding: { ...binding(), email: 'x@y.test' } })) === 'binding_campos_invalidos');
checar('contexto com campo extra é rejeitado', erroCodigo(() => reserve({ context: { ...context(), provider: 'resend' } })) === 'contexto_campos_invalidos');
checar('tenant binding/contexto divergente falha fechado', erroCodigo(() => reserve({ context: context('operational', { tenantId: 'tenant-02' }) })) === 'binding_tenant_divergente');
checar('fingerprint binding/contexto divergente falha fechado', erroCodigo(() => reserve({ context: context('operational', { recipientFingerprint: 'b'.repeat(64) }) })) === 'binding_recipient_divergente');
checar('tenant binding/supressão divergente falha fechado', erroCodigo(() => reserve({ binding: binding({ tenantId: 'tenant-02' }), context: context('operational', { tenantId: 'tenant-02' }) })) === 'tenant_divergente');
checar('fingerprint binding/supressão divergente falha fechado', erroCodigo(() => reserve({ binding: binding({ recipientFingerprint: 'b'.repeat(64) }), context: context('operational', { recipientFingerprint: 'b'.repeat(64) }) })) === 'recipient_divergente');
checar('eventId divergente falha fechado', erroCodigo(() => reserve({ binding: binding({ eventId: 'outro-evento' }) })) === 'outbox_event_divergente');
checar('idempotencyKey divergente falha fechado', erroCodigo(() => reserve({ binding: binding({ idempotencyKey: 'outra-chave' }) })) === 'outbox_idempotency_divergente');

const sending = marcarEnviando(outbox(), { agora: '2026-09-10T11:00:01.000Z' });
const failed = marcarFalha(sending, { codigo: 'provider_unavailable', agora: '2026-09-10T11:00:02.000Z' });
checar('retry antes da janela continua falhando fechado', erroCodigo(() => reserve({ outboxItem: failed, context: context('operational', { now: '2026-09-10T11:00:30.000Z' }) })) === 'retry_ainda_nao_elegivel');
const retried = reserve({ outboxItem: failed, context: context('operational', { now: failed.nextAttemptAt }) });
checar('retry elegível respeita contador da outbox', retried.reserve && retried.attempts === 2);
checar('item já sending não é reservado de novo', erroCodigo(() => reserve({ outboxItem: sending })) === 'transicao_invalida');

checar('input original não é mutado', outbox().status === 'pending' && initialSuppression().revision === 0);
const repeatedA = reserve();
const repeatedB = reserve();
checar('mesma entrada produz decisão determinística', JSON.stringify(repeatedA) === JSON.stringify(repeatedB));

if (falhas) {
  console.error('\nFALHOU: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(1);
}
console.log('\nPASSOU: ' + ok + ' ok, 0 falhas');
