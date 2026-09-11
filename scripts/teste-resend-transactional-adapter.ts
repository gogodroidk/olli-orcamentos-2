import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RESEND_EMAILS_ENDPOINT,
  RESEND_TRANSACTIONAL_ADAPTER_VERSION,
  criarResendTransactionalAdapter,
} from '../worker/src/resendTransactionalAdapter.js';
import { criarItemEmailOutbox, marcarEnviando } from '../worker/src/emailOutbox.js';
import { renderizarEmailBoasVindas } from '../worker/src/welcomeEmailTemplate.js';
import { WELCOME_TEMPLATE_VERSION } from '../worker/src/welcomeEvent.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}
async function erroCodigoAsync(fn: () => Promise<unknown>) {
  try { await fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nE-mail OLLI — adapter Resend transacional isolado');

const evento = {
  eventId: 'email-confirmed:user-001:2026-09-02',
  idempotencyKey: 'welcome:user-001:boas_vindas.v1',
  recipient: 'pessoa@example.test',
  template: 'boas_vindas',
  templateVersion: WELCOME_TEMPLATE_VERSION,
  purpose: 'account_onboarding',
};
const itemPending = criarItemEmailOutbox(evento, { agora: '2026-09-02T12:00:00.000Z' });
const claimedItem = marcarEnviando(itemPending, { agora: '2026-09-02T12:00:01.000Z' });
const rendered = renderizarEmailBoasVindas({
  eventId: evento.eventId,
  template: evento.template,
  templateVersion: evento.templateVersion,
  purpose: evento.purpose,
  appUrl: 'https://app.example.test/orcamentos/novo',
  supportUrl: 'https://support.example.test/olli',
  logoUrl: 'https://assets.example.test/olli/logo.png',
});
const message = {
  eventId: rendered.eventId,
  template: rendered.template,
  templateVersion: rendered.templateVersion,
  purpose: rendered.purpose,
  kind: rendered.kind,
  subject: rendered.subject,
  html: rendered.html,
  text: rendered.text,
};
const delivery = { claimedItem, message };
const configBase = {
  apiKey: 're_synthetic_never_real',
  from: 'OLLI Orçamentos <welcome@synthetic.invalid>',
  replyTo: 'support@synthetic.invalid',
};
const factory = (transport: (request: any) => Promise<any>) => criarResendTransactionalAdapter({
  ...configBase,
  transport,
});

checar('versão e endpoint são explícitos', RESEND_TRANSACTIONAL_ADAPTER_VERSION === '2026-09-02.v2' && RESEND_EMAILS_ENDPOINT === 'https://api.resend.com/emails');
checar('configuração ausente falha fechado', erroCodigo(() => criarResendTransactionalAdapter()) === 'config_campos_invalidos');
checar('api key ausente falha fechado', erroCodigo(() => criarResendTransactionalAdapter({ ...configBase, apiKey: '', transport: async () => null })) === 'api_key_invalida');
checar('api key grande demais não é truncada silenciosamente', erroCodigo(() => criarResendTransactionalAdapter({ ...configBase, apiKey: 'x'.repeat(513), transport: async () => null })) === 'api_key_invalida');
checar('remetente ausente falha fechado', erroCodigo(() => criarResendTransactionalAdapter({ ...configBase, from: '', transport: async () => null })) === 'remetente_invalido');
checar('injeção de header no remetente é rejeitada', erroCodigo(() => criarResendTransactionalAdapter({ ...configBase, from: 'OLLI <welcome@synthetic.invalid>\nBcc: outro@example.test', transport: async () => null })) === 'remetente_invalido');
checar('reply-to ausente falha fechado', erroCodigo(() => criarResendTransactionalAdapter({ ...configBase, replyTo: '', transport: async () => null })) === 'reply_to_invalido');
checar('transporte ausente falha fechado', erroCodigo(() => criarResendTransactionalAdapter({ ...configBase, transport: null })) === 'transporte_obrigatorio');
checar('config com campo extra falha fechado', erroCodigo(() => criarResendTransactionalAdapter({ ...configBase, transport: async () => null, endpoint: 'https://outro.invalid' })) === 'config_campos_invalidos');

const originalFetch = globalThis.fetch;
let chamadasFetchGlobal = 0;
globalThis.fetch = (async () => {
  chamadasFetchGlobal++;
  throw new Error('fetch_global_proibido');
}) as typeof fetch;

const requisicoes: any[] = [];
const adapter = factory(async (request) => {
  requisicoes.push(request);
  return { status: 200, body: { id: 'resend-synthetic-001', ignored: 'nao_publicar' } };
});
const success = await adapter.entregar(delivery);

globalThis.fetch = originalFetch;

checar('adapter é imutável e versionado', Object.isFrozen(adapter) && adapter.version === RESEND_TRANSACTIONAL_ADAPTER_VERSION);
checar('sucesso público tem somente campos sanitizados', JSON.stringify(Object.keys(success).sort()) === JSON.stringify(['code', 'ok', 'providerId', 'retryable']) && success.ok && success.code === 'accepted' && success.retryable === false);
checar('resultado de sucesso é imutável', Object.isFrozen(success));
checar('transporte injetado é chamado exatamente uma vez', requisicoes.length === 1);
checar('fetch global nunca é chamado', chamadasFetchGlobal === 0);
checar('request usa endpoint, método e idempotência corretos', requisicoes[0].endpoint === RESEND_EMAILS_ENDPOINT && requisicoes[0].method === 'POST' && requisicoes[0].headers['Idempotency-Key'] === evento.idempotencyKey);
const payload = JSON.parse(requisicoes[0].body);
checar('payload usa remetente e reply-to explícitos', payload.from === configBase.from && payload.reply_to === configBase.replyTo);
checar('payload preserva HTML e texto transacionais', payload.to[0] === evento.recipient && payload.html === rendered.html && payload.text === rendered.text);
checar('resultado público não contém segredo, destinatário, body ou headers', !JSON.stringify(success).includes(configBase.apiKey) && !JSON.stringify(success).includes(evento.recipient) && !/(body|headers|authorization)/i.test(JSON.stringify(success)));

const resposta = async (status: number, body: any = { message: 'erro externo com dado que nao pode sair' }) => factory(async () => ({ status, body })).entregar(delivery);
const badRequest = await resposta(400);
checar('4xx comum é terminal e sanitizado', !badRequest.ok && badRequest.code === 'provider_request_rejected' && badRequest.retryable === false && Object.keys(badRequest).length === 3);
const authRejected = await resposta(401);
checar('auth rejeitada é terminal sem expor provider', !authRejected.ok && authRejected.code === 'provider_auth_rejected' && authRejected.retryable === false);
const invalidIdempotent = await resposta(409, { name: 'invalid_idempotent_request', message: 'payload externo sensível' });
checar('idempotência com payload divergente é terminal e sanitizada', !invalidIdempotent.ok && invalidIdempotent.code === 'provider_idempotency_conflict' && invalidIdempotent.retryable === false && !JSON.stringify(invalidIdempotent).includes('sensível'));
const concurrentIdempotent = await resposta(409, { name: 'concurrent_idempotent_requests', message: 'requisição externa em curso' });
checar('idempotência concorrente é retentável e sanitizada', !concurrentIdempotent.ok && concurrentIdempotent.code === 'provider_idempotency_in_progress' && concurrentIdempotent.retryable === true && !JSON.stringify(concurrentIdempotent).includes('externa'));
const resourceLocked = await resposta(409, { name: 'resource_locked', message: 'recurso externo bloqueado' });
checar('recurso bloqueado é retentável e sanitizado', !resourceLocked.ok && resourceLocked.code === 'provider_resource_locked' && resourceLocked.retryable === true && !JSON.stringify(resourceLocked).includes('externo'));
const unknownConflict = await resposta(409, { name: 'future_conflict', message: 'erro externo desconhecido' });
checar('409 desconhecido falha de modo conservador e retentável', !unknownConflict.ok && unknownConflict.code === 'provider_conflict_unknown' && unknownConflict.retryable === true && !JSON.stringify(unknownConflict).includes('desconhecido'));
const rateLimited = await resposta(429);
checar('429 é retentável sem alegar cota do Codex', !rateLimited.ok && rateLimited.code === 'provider_rate_limited' && rateLimited.retryable === true);
const unavailable = await resposta(503);
checar('5xx é retentável e sanitizado', !unavailable.ok && unavailable.code === 'provider_unavailable' && unavailable.retryable === true);

const timeoutError: any = new Error('corpo externo que nao pode sair');
timeoutError.name = 'AbortError';
const timeout = await factory(async () => { throw timeoutError; }).entregar(delivery);
checar('timeout vira código seguro', !timeout.ok && timeout.code === 'transport_timeout' && timeout.retryable === true && !JSON.stringify(timeout).includes('corpo externo'));
const transportError = await factory(async () => { throw new Error('Bearer segredo e PII'); }).entregar(delivery);
checar('erro de transporte não vaza mensagem', !transportError.ok && transportError.code === 'transport_error' && transportError.retryable === true && !JSON.stringify(transportError).includes('segredo'));
const malformed = await factory(async () => ({ status: '200', body: { id: 'x' } })).entregar(delivery);
checar('resposta malformada falha fechado', !malformed.ok && malformed.code === 'provider_response_invalid' && malformed.retryable === true);
const responseWithHeaders = await factory(async () => ({ status: 200, body: { id: 'x' }, headers: { authorization: 'segredo' } })).entregar(delivery);
checar('resposta com campos externos extras é rejeitada', !responseWithHeaders.ok && responseWithHeaders.code === 'provider_response_invalid');
const successWithoutId = await factory(async () => ({ status: 200, body: {} })).entregar(delivery);
checar('2xx sem provider id não é marcado como enviado', !successWithoutId.ok && successWithoutId.code === 'provider_response_invalid');

checar('item pending não pode ser despachado', await erroCodigoAsync(() => adapter.entregar({ claimedItem: itemPending, message })) === 'outbox_nao_reservada');
checar('campo extra no DTO é rejeitado', await erroCodigoAsync(() => adapter.entregar({ ...delivery, recipient: evento.recipient } as any)) === 'delivery_campos_invalidos');
checar('campo extra com PII na mensagem é rejeitado', await erroCodigoAsync(() => adapter.entregar({ claimedItem, message: { ...message, email: evento.recipient } } as any)) === 'message_campos_invalidos');
checar('eventId divergente é rejeitado', await erroCodigoAsync(() => adapter.entregar({ claimedItem, message: { ...message, eventId: 'email-confirmed:outro' } })) === 'message_event_divergente');
checar('subject com CRLF é rejeitado', await erroCodigoAsync(() => adapter.entregar({ claimedItem, message: { ...message, subject: 'Assunto\nforjado' } })) === 'subject_invalido');
checar('idempotência grande demais não é truncada', await erroCodigoAsync(() => adapter.entregar({ claimedItem: { ...claimedItem, idempotencyKey: 'x'.repeat(241) }, message })) === 'idempotency_key_invalida');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const adapterSource = fs.readFileSync(path.join(repoRoot, 'worker', 'src', 'resendTransactionalAdapter.js'), 'utf8');
checar('adapter não contém fallback de rede global', !/globalThis\.fetch|\bfetch\s*\(/.test(adapterSource));
const runtimeFiles = ['index.js', 'equipe.js', 'email.js'];
checar('adapter não está importado no runtime', runtimeFiles.every((file) => !fs.readFileSync(path.join(repoRoot, 'worker', 'src', file), 'utf8').includes('resendTransactionalAdapter')));

if (falhas) {
  console.error('\nFALHOU: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(1);
}
console.log('\nPASSOU: ' + ok + ' ok, 0 falhas');
