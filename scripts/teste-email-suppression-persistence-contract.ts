import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMAIL_SUPPRESSION_PERSISTENCE_VERSION,
  prepararPersistenciaSupressaoEmail,
} from '../worker/src/emailSuppressionPersistenceContract.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nE-mail OLLI — contrato de persistência de supressão');

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const FINGERPRINT = 'a'.repeat(64);
const NOW = '2026-09-04T22:00:00.000Z';
const binding = (overrides: Record<string, unknown> = {}) => ({
  authority: 'trusted_suppression_binding',
  tenantId: TENANT,
  userId: USER,
  recipientFingerprint: FINGERPRINT,
  fingerprintKeyId: 'suppression-hmac-v1',
  ...overrides,
});
const context = (expectedRevision = 0, overrides: Record<string, unknown> = {}) => ({
  expectedRevision,
  now: NOW,
  ...overrides,
});
const event = (
  eventId: string,
  type: string,
  occurredAt = '2026-09-04T21:00:00.000Z',
  consentVersion: string | null = null,
) => ({ eventId, type, occurredAt, consentVersion });
const execute = (overrides: Record<string, unknown> = {}) => prepararPersistenciaSupressaoEmail({
  binding: binding(),
  event: event('evt-hard-01', 'hard_bounce'),
  context: context(),
  persistedState: null,
  persistedEvent: null,
  ...overrides,
} as any);

checar('versão de persistência é explícita', EMAIL_SUPPRESSION_PERSISTENCE_VERSION === '2026-09-04.v1');
const first = execute();
checar('primeiro evento gera plano atômico', first.applied && !first.replayed && first.writeMode === 'atomic_compare_and_set_and_event_append');
checar('primeiro evento avança revisão uma vez', first.expectedRevision === 0 && first.nextRevision === 1 && first.state.revision === 1);
checar('hard bounce é persistido fail-closed', first.state.hardBounce && first.state.temporarilySuppressedUntil === null);
checar('escopo preserva tenant, usuário e key id', first.scope.tenantId === TENANT && first.scope.userId === USER && first.scope.fingerprintKeyId === 'suppression-hmac-v1');
checar('evento recebe hash SHA-256 estável', /^[a-f0-9]{64}$/.test(first.event.eventHash));
checar('resultado profundo relevante é imutável', Object.isFrozen(first) && Object.isFrozen(first.scope) && Object.isFrozen(first.state) && Object.isFrozen(first.event));
checar('resultado não contém endereço, token ou segredo', !/@|token|secret|senha/i.test(JSON.stringify(first)));

const replay = execute({
  persistedState: first.state,
  persistedEvent: { eventId: first.event.eventId, eventHash: first.event.eventHash },
  context: context(0),
});
checar('replay idêntico é no-op mesmo com revisão esperada antiga', !replay.applied && replay.replayed && replay.writeMode === 'no_op');
checar('replay não avança revisão', replay.nextRevision === 1 && replay.state.revision === 1);
checar('replay divergente falha fechado', erroCodigo(() => execute({
  persistedState: first.state,
  persistedEvent: { eventId: first.event.eventId, eventHash: 'b'.repeat(64) },
})) === 'evento_replay_divergente');

const initial = execute({ event: event('evt-optin', 'resubscribe', '2026-09-04T20:00:00.000Z', 'consent-v1') });
checar('resubscribe persiste consentimento explícito', initial.state.educationalOptIn && !initial.state.unsubscribed && initial.state.consentVersion === 'consent-v1');
const unsubscribe = execute({
  event: event('evt-unsubscribe', 'unsubscribe', '2026-09-04T21:30:00.000Z'),
  persistedState: initial.state,
  context: context(1),
});
checar('unsubscribe revoga opt-in e avança CAS', unsubscribe.state.unsubscribed && !unsubscribe.state.educationalOptIn && unsubscribe.nextRevision === 2);

let softState: any = execute({ event: event('evt-soft-1', 'soft_bounce', '2026-09-04T19:00:00.000Z') }).state;
softState = execute({
  event: event('evt-soft-2', 'soft_bounce', '2026-09-04T20:00:00.000Z'),
  persistedState: softState,
  context: context(1),
}).state;
softState = execute({
  event: event('evt-soft-3', 'soft_bounce', '2026-09-04T21:00:00.000Z'),
  persistedState: softState,
  context: context(2),
}).state;
checar('terceiro soft bounce abre supressão temporária', softState.softBounceCount === 3 && softState.temporarilySuppressedUntil === '2026-09-11T21:00:00.000Z');
const recovered = execute({
  event: event('evt-delivery-ok', 'delivery_succeeded', '2026-09-04T21:30:00.000Z'),
  persistedState: softState,
  context: context(3),
});
checar('delivery_succeeded zera apenas falha temporária', recovered.state.softBounceCount === 0 && recovered.state.temporarilySuppressedUntil === null);

checar('tenant divergente é recusado', erroCodigo(() => execute({
  persistedState: { ...first.state, tenantId: '33333333-3333-4333-8333-333333333333' },
})) === 'tenant_divergente');
checar('usuário divergente é recusado', erroCodigo(() => execute({
  persistedState: { ...first.state, userId: '33333333-3333-4333-8333-333333333333' },
})) === 'user_divergente');
checar('fingerprint divergente é recusada', erroCodigo(() => execute({
  persistedState: { ...first.state, recipientFingerprint: 'c'.repeat(64) },
})) === 'recipient_divergente');
checar('rotação de chave implícita é recusada', erroCodigo(() => execute({
  persistedState: { ...first.state, fingerprintKeyId: 'suppression-hmac-v2' },
})) === 'fingerprint_key_divergente');
checar('binding precisa ser autoritativo', erroCodigo(() => execute({ binding: binding({ authority: 'client' }) })) === 'binding_nao_autoritativo');
checar('UUID inválido é recusado', erroCodigo(() => execute({ binding: binding({ userId: 'user-01' }) })) === 'binding_user_invalido');
checar('fingerprint precisa ter 64 hex', erroCodigo(() => execute({ binding: binding({ recipientFingerprint: 'pessoa@example.test' }) })) === 'binding_fingerprint_invalido');
checar('payload extra falha por chaves exatas', erroCodigo(() => prepararPersistenciaSupressaoEmail({
  binding: binding(), event: event('evt-1', 'hard_bounce'), context: context(), persistedState: null, persistedEvent: null, email: 'x@y.test',
} as any)) === 'entrada_campos_invalidos');
checar('campo extra no binding falha por chaves exatas', erroCodigo(() => execute({ binding: binding({ email: 'x@y.test' }) })) === 'binding_campos_invalidos');
checar('evento sem milissegundos UTC é recusado', erroCodigo(() => execute({ event: event('evt-1', 'hard_bounce', '2026-09-04T21:00:00Z') })) === 'evento_occurred_at_invalido');
checar('evento futuro é recusado', erroCodigo(() => execute({ event: event('evt-1', 'hard_bounce', '2026-09-05T21:00:00.000Z') })) === 'evento_futuro');
checar('CAS divergente falha fechado', erroCodigo(() => execute({ persistedState: first.state, context: context(0), event: event('evt-next', 'complaint', '2026-09-04T21:30:00.000Z') })) === 'revision_divergente');
checar('evento persistido exige estado', erroCodigo(() => execute({ persistedEvent: { eventId: 'evt-hard-01', eventHash: first.event.eventHash } })) === 'persisted_event_sem_estado');
checar('eventId consultado precisa coincidir', erroCodigo(() => execute({
  persistedState: first.state,
  persistedEvent: { eventId: 'evt-outro', eventHash: first.event.eventHash },
})) === 'persisted_event_id_divergente');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = path.join(root, 'docs', 'ONDA_3', 'JANELA_3_3_EMAIL_PERSISTENCIA', '20260904_email_suppression.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const lower = sql.toLowerCase();
checar('draft SQL está fora de supabase/migrations', !sqlPath.toLowerCase().includes(`${path.sep}supabase${path.sep}migrations${path.sep}`));
checar('draft avisa para não aplicar', /local_only[\s\S]*n[aã]o aplicar/i.test(sql));
checar('duas tabelas de estado e eventos estão definidas', lower.includes('create table public.email_suppression_states') && lower.includes('create table public.email_suppression_events'));
checar('RLS está habilitada e forçada nas duas tabelas', (lower.match(/enable row level security/g) || []).length >= 2 && (lower.match(/force row level security/g) || []).length >= 2);
checar('anon e authenticated perdem privilégios', lower.includes('revoke all on table public.email_suppression_states from anon, authenticated') && lower.includes('revoke all on table public.email_suppression_events from anon, authenticated'));
checar('RPC usa security invoker e search_path vazio', lower.includes('security invoker') && lower.includes("set search_path = ''"));
checar('execução pública das RPCs é revogada', lower.includes('revoke execute on function public.record_email_suppression_event') && lower.includes('from public, anon, authenticated'));
checar('somente service_role recebe execução', lower.includes('grant execute on function public.record_email_suppression_event') && lower.includes('to service_role'));
checar('CAS e lock de linha estão explícitos', lower.includes('for update') && lower.includes('revision_divergente'));
checar('replay divergente está fail-closed', lower.includes('evento_replay_divergente') && lower.includes('event_hash'));
checar('isolamento inclui tenant e usuário', lower.includes('tenant_id') && lower.includes('user_id') && lower.includes('unique (tenant_id, user_id)'));
checar('fingerprint nunca é endereço bruto', lower.includes('recipient_fingerprint') && lower.includes("^[a-f0-9]{64}$") && !lower.includes('recipient_email'));
checar('retenção não reativa envio automaticamente', lower.includes('não expira automaticamente') && lower.includes('purge_email_suppression_scope'));
checar('draft não contém DDL destrutivo amplo', !/\b(drop table|truncate|drop schema)\b/i.test(sql));

if (falhas) {
  console.error('\nFALHOU: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(1);
}
console.log('\nPASSOU: ' + ok + ' ok, 0 falhas');
