import {
  EMAIL_MESSAGE_KINDS,
  EMAIL_SOFT_BOUNCE_LIMIT,
  EMAIL_SOFT_BOUNCE_SUPPRESSION_DAYS,
  EMAIL_SUPPRESSION_EVENT_TYPES,
  EMAIL_SUPPRESSION_VERSION,
  aplicarEventoSupressaoEmail,
  avaliarEntregaEmail,
  criarEstadoSupressaoEmail,
} from '../worker/src/emailSuppressionPolicy.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nE-mail OLLI — política local de supressão e consentimento');

const TENANT = 'tenant-01';
const RECIPIENT = 'a'.repeat(64);
const NOW = '2026-09-10T12:00:00.000Z';
const evento = (eventId: string, type: string, occurredAt: string, consentVersion: string | null = null) => ({
  eventId,
  type,
  occurredAt,
  consentVersion,
});
const aplicar = (state: any, event: any, overrides: Record<string, unknown> = {}) => aplicarEventoSupressaoEmail(
  state,
  event,
  {
    tenantId: TENANT,
    recipientFingerprint: RECIPIENT,
    expectedRevision: state.revision,
    now: NOW,
    ...overrides,
  },
);
const avaliar = (state: any, kind: string, now = NOW, overrides: Record<string, unknown> = {}) => avaliarEntregaEmail(
  state,
  { tenantId: TENANT, recipientFingerprint: RECIPIENT, kind, now, ...overrides } as any,
);

checar('versão é explícita', EMAIL_SUPPRESSION_VERSION === '2026-09-01.v1');
checar('eventos são fechados', EMAIL_SUPPRESSION_EVENT_TYPES.join(',') === 'hard_bounce,soft_bounce,complaint,unsubscribe,resubscribe,delivery_succeeded');
checar('finalidades são fechadas', EMAIL_MESSAGE_KINDS.join(',') === 'security,operational,education,engagement');
checar('soft bounce usa limite e janela explícitos', EMAIL_SOFT_BOUNCE_LIMIT === 3 && EMAIL_SOFT_BOUNCE_SUPPRESSION_DAYS === 7);

const inicial = criarEstadoSupressaoEmail({
  tenantId: TENANT,
  recipientFingerprint: RECIPIENT.toUpperCase(),
  createdAt: '2026-09-01T00:00:00.000Z',
});
checar('estado inicial normaliza fingerprint sem guardar e-mail', inicial.recipientFingerprint === RECIPIENT && !('email' in inicial));
checar('estado inicial é imutável e sem opt-in educativo', Object.isFrozen(inicial) && Object.isFrozen(inicial.processedEvents) && !inicial.educationalOptIn);
checar('welcome operacional não depende de marketing', avaliar(inicial, 'operational').allowed === true);
checar('educação começa bloqueada por consentimento', !avaliar(inicial, 'education').allowed && avaliar(inicial, 'education').reason === 'consent_required');

const optIn = aplicar(inicial, evento('evt-optin', 'resubscribe', '2026-09-02T00:00:00.000Z', 'consent-v1'));
checar('reconsentimento explícito habilita educação', optIn.applied && optIn.state.educationalOptIn && avaliar(optIn.state, 'education').allowed);
checar('consentimento fica versionado', optIn.state.consentVersion === 'consent-v1');
checar('reconsentimento sem versão falha fechado', erroCodigo(() => aplicar(inicial, evento('evt-bad-optin', 'resubscribe', '2026-09-02T00:00:00Z'))) === 'consent_version_obrigatoria');

const unsub = aplicar(optIn.state, evento('evt-unsub', 'unsubscribe', '2026-09-03T00:00:00.000Z'));
checar('descadastro bloqueia educação e engajamento', !avaliar(unsub.state, 'education').allowed && !avaliar(unsub.state, 'engagement').allowed);
checar('descadastro não bloqueia welcome operacional', avaliar(unsub.state, 'operational').allowed);
checar('motivo de descadastro é auditável', avaliar(unsub.state, 'education').reason === 'unsubscribed');

const complaint = aplicar(optIn.state, evento('evt-complaint', 'complaint', '2026-09-03T00:00:00.000Z'));
checar('complaint bloqueia operacional e educação', !avaliar(complaint.state, 'operational').allowed && !avaliar(complaint.state, 'education').allowed);
checar('complaint preserva somente segurança estrita', avaliar(complaint.state, 'security').allowed);
const complaintOptIn = aplicar(complaint.state, evento('evt-complaint-optin', 'resubscribe', '2026-09-04T00:00:00.000Z', 'consent-v2'));
checar('reconsentimento não apaga complaint', complaintOptIn.state.complaint && !avaliar(complaintOptIn.state, 'education').allowed);

const hard = aplicar(inicial, evento('evt-hard', 'hard_bounce', '2026-09-02T00:00:00.000Z'));
checar('hard bounce bloqueia inclusive segurança', !avaliar(hard.state, 'security').allowed && avaliar(hard.state, 'security').reason === 'hard_bounce');
const hardSuccess = aplicar(hard.state, evento('evt-hard-success', 'delivery_succeeded', '2026-09-03T00:00:00.000Z'));
checar('sucesso posterior não apaga hard bounce', hardSuccess.state.hardBounce && !avaliar(hardSuccess.state, 'operational').allowed);
const hardOptIn = aplicar(hard.state, evento('evt-hard-optin', 'resubscribe', '2026-09-03T00:00:00.000Z', 'consent-v3'));
checar('opt-in posterior não apaga hard bounce', hardOptIn.state.hardBounce && !avaliar(hardOptIn.state, 'education').allowed);

const soft1 = aplicar(inicial, evento('evt-soft-1', 'soft_bounce', '2026-09-02T00:00:00.000Z'));
const soft2 = aplicar(soft1.state, evento('evt-soft-2', 'soft_bounce', '2026-09-03T00:00:00.000Z'));
const soft3 = aplicar(soft2.state, evento('evt-soft-3', 'soft_bounce', '2026-09-04T00:00:00.000Z'));
checar('primeiro e segundo soft bounce não criam supressão', soft1.state.temporarilySuppressedUntil === null && soft2.state.temporarilySuppressedUntil === null);
checar('terceiro soft bounce cria supressão de sete dias', soft3.state.softBounceCount === 3 && soft3.state.temporarilySuppressedUntil === '2026-09-11T00:00:00.000Z');
checar('janela de soft bounce bloqueia qualquer entrega', !avaliar(soft3.state, 'security', '2026-09-10T00:00:00.000Z').allowed);
checar('fim exato da janela volta a permitir operacional', avaliar(soft3.state, 'operational', '2026-09-11T00:00:00.000Z').allowed);
const softSuccess = aplicar(soft3.state, evento('evt-soft-success', 'delivery_succeeded', '2026-09-10T00:00:00.000Z'));
checar('entrega bem-sucedida zera apenas o soft bounce', softSuccess.state.softBounceCount === 0 && softSuccess.state.temporarilySuppressedUntil === null && !softSuccess.state.hardBounce);

checar('revisão cresce uma vez por evento novo', soft3.state.revision === 3 && soft3.state.processedEvents.length === 3);
const replay = aplicarEventoSupressaoEmail(
  soft1.state,
  evento('evt-soft-1', 'soft_bounce', '2026-09-02T00:00:00.000Z'),
  { tenantId: TENANT, recipientFingerprint: RECIPIENT, expectedRevision: 0, now: NOW },
);
checar('replay idêntico é idempotente mesmo com revisão antiga', !replay.applied && replay.replayed && replay.state === soft1.state);
checar('replay divergente falha fechado', erroCodigo(() => aplicarEventoSupressaoEmail(
  soft1.state,
  evento('evt-soft-1', 'hard_bounce', '2026-09-02T00:00:00.000Z'),
  { tenantId: TENANT, recipientFingerprint: RECIPIENT, expectedRevision: 1, now: NOW },
)) === 'evento_replay_divergente');
checar('revisão incorreta falha fechado', erroCodigo(() => aplicarEventoSupressaoEmail(
  inicial,
  evento('evt-stale', 'soft_bounce', '2026-09-02T00:00:00.000Z'),
  { tenantId: TENANT, recipientFingerprint: RECIPIENT, expectedRevision: 1, now: NOW },
)) === 'revision_divergente');
checar('evento futuro falha fechado', erroCodigo(() => aplicar(inicial, evento('evt-future', 'soft_bounce', '2026-09-11T00:00:00.000Z'))) === 'evento_futuro');
checar('evento anterior ao estado falha fechado', erroCodigo(() => aplicar(optIn.state, evento('evt-old', 'unsubscribe', '2026-09-01T00:00:00.000Z'))) === 'clock_regressivo');
checar('tenant divergente falha fechado', erroCodigo(() => aplicar(inicial, evento('evt-tenant', 'unsubscribe', '2026-09-02T00:00:00.000Z'), { tenantId: 'tenant-02' })) === 'tenant_divergente');
checar('destinatário divergente falha fechado', erroCodigo(() => avaliarEntregaEmail(inicial, { tenantId: TENANT, recipientFingerprint: 'b'.repeat(64), kind: 'security', now: NOW })) === 'recipient_divergente');
checar('fingerprint inválida é rejeitada', erroCodigo(() => criarEstadoSupressaoEmail({ tenantId: TENANT, recipientFingerprint: 'email@real.test', createdAt: NOW })) === 'recipient_fingerprint_invalido');
checar('campo extra com endereço é rejeitado', erroCodigo(() => aplicar(inicial, { ...evento('evt-pii', 'unsubscribe', '2026-09-02T00:00:00.000Z'), email: 'x@y.test' })) === 'evento_campos_invalidos');
checar('estado com PII/campo extra é rejeitado', erroCodigo(() => avaliar({ ...inicial, email: 'x@y.test' }, 'security')) === 'estado_campos_invalidos');
checar('índice de idempotência adulterado é rejeitado', erroCodigo(() => avaliar({ ...soft1.state, processedEvents: [{ eventId: 'evt-soft-1', eventHash: 'curto' }] }, 'security')) === 'estado_processed_event_hash_invalido');
checar('consentVersion fora de resubscribe é rejeitada', erroCodigo(() => aplicar(inicial, evento('evt-consent-bad', 'unsubscribe', '2026-09-02T00:00:00.000Z', 'consent-v1'))) === 'consent_version_nao_permitida');
checar('kind desconhecido é rejeitado', erroCodigo(() => avaliar(inicial, 'marketing')) === 'message_kind_invalido');
checar('estado original não é mutado', inicial.revision === 0 && inicial.processedEvents.length === 0 && !inicial.educationalOptIn);
checar('saída não expõe provider, corpo ou endereço', !('provider' in soft3.state) && !('body' in soft3.state) && !('email' in soft3.state));

const deterministicA = avaliar(optIn.state, 'education');
const deterministicB = avaliar(optIn.state, 'education');
checar('mesmo estado produz decisão determinística', JSON.stringify(deterministicA) === JSON.stringify(deterministicB));

if (falhas) {
  console.error('\nFALHOU: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(1);
}
console.log('\nPASSOU: ' + ok + ' ok, 0 falhas');
