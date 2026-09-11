import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMAIL_OUTBOX_MAX_ATTEMPTS,
  criarItemEmailOutbox,
  marcarEnviando,
} from '../worker/src/emailOutbox.js';
import {
  RESEND_OUTBOX_OUTCOME_VERSION,
  aplicarResultadoResendNaOutbox,
} from '../worker/src/resendOutboxOutcomeContract.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nE-mail OLLI — composição do resultado Resend com outbox');

const templateItem = () => criarItemEmailOutbox({
  eventId: 'email-confirmed:user-01',
  idempotencyKey: 'welcome:user-01:boas_vindas.v1',
  template: 'boas_vindas',
  templateVersion: 'boas_vindas.v1',
  purpose: 'account_onboarding',
  recipient: 'pessoa@example.test',
}, { agora: '2026-09-02T15:00:00.000Z' });
const sendingItem = (agora = '2026-09-02T15:00:01.000Z') => marcarEnviando(templateItem(), { agora });
const apply = (claimedItem: any, result: any, agora = '2026-09-02T15:00:02.000Z') => aplicarResultadoResendNaOutbox({ claimedItem, result, agora });
const reaplicarProjecaoNaOutbox = (item: any, projection: any) => ({
  ...item,
  status: projection.status,
  attempts: projection.attempts,
  nextAttemptAt: projection.nextAttemptAt,
  providerId: projection.providerId,
  errorCode: projection.errorCode,
  updatedAt: projection.updatedAt,
});
const successResult = { ok: true, providerId: 'resend-synthetic-001', code: 'accepted', retryable: false };
const retryResult = { ok: false, code: 'provider_unavailable', retryable: true };
const terminalResult = { ok: false, code: 'provider_auth_rejected', retryable: false };

checar('versão da composição é explícita', RESEND_OUTBOX_OUTCOME_VERSION === '2026-09-02.v1');
const sending = sendingItem();
const success = apply(sending, successResult);
checar('sucesso projeta sent com providerId', success.applied && success.status === 'sent' && success.providerId === 'resend-synthetic-001' && success.errorCode === null && success.nextAttemptAt === null);
checar('projeção tem chaves exatas e é imutável', JSON.stringify(Object.keys(success).sort()) === JSON.stringify(['applied', 'attempts', 'errorCode', 'nextAttemptAt', 'providerId', 'status', 'updatedAt', 'version']) && Object.isFrozen(success));
checar('sucesso não retorna destinatário, body, header ou segredo', !JSON.stringify(success).includes('pessoa@example.test') && !/(body|headers|authorization|apiKey)/i.test(JSON.stringify(success)));
checar('item original permanece sending e sem resultado', sending.status === 'sending' && sending.providerId === null && sending.errorCode === null);
checar('sucesso sem providerId falha fechado', erroCodigo(() => apply(sending, { ...successResult, providerId: '' })) === 'provider_id_invalido');
checar('resultado success com campo extra falha fechado', erroCodigo(() => apply(sending, { ...successResult, recipient: 'PII@example.test' })) === 'resultado_sucesso_campos_invalidos');
checar('resultado success com código não aceito falha fechado', erroCodigo(() => apply(sending, { ...successResult, code: 'provider_unavailable' })) === 'resultado_sucesso_codigo_invalido');

const failed = apply(sendingItem(), retryResult);
checar('falha transitória agenda retry e preserva backoff', failed.applied && failed.status === 'failed' && failed.errorCode === 'provider_unavailable' && failed.providerId === null && failed.nextAttemptAt === '2026-09-02T15:01:02.000Z');
const retriedInput = reaplicarProjecaoNaOutbox(sendingItem(), failed);
const sentAfterRetry = aplicarResultadoResendNaOutbox({ claimedItem: marcarEnviando(retriedInput, { agora: failed.nextAttemptAt }), result: successResult, agora: '2026-09-02T15:01:03.000Z' });
checar('retry elegível pode terminar em sent', sentAfterRetry.status === 'sent' && sentAfterRetry.attempts === 2);

const terminal = apply(sendingItem(), terminalResult);
checar('falha terminal vai para dead-letter', terminal.status === 'dead_letter' && terminal.nextAttemptAt === null && terminal.errorCode === 'provider_auth_rejected');
checar('falha terminal não expõe provider', !JSON.stringify(terminal).includes('resend') && !JSON.stringify(terminal).includes('pessoa@example.test'));

let at: any = sendingItem('2026-09-02T16:00:01.000Z');
for (let i = 1; i <= EMAIL_OUTBOX_MAX_ATTEMPTS; i++) {
  const failedProjection = apply(at, retryResult, new Date(Date.parse('2026-09-02T16:00:00.000Z') + (i * 86_400_000)).toISOString());
  at = reaplicarProjecaoNaOutbox(at, failedProjection);
  if (at.status === 'failed') at = marcarEnviando(at, { agora: at.nextAttemptAt });
}
checar('teto de cinco tentativas termina em dead-letter', at.status === 'dead_letter' && at.attempts === EMAIL_OUTBOX_MAX_ATTEMPTS && at.nextAttemptAt === null);

checar('item pending não pode receber resultado', erroCodigo(() => apply(templateItem(), successResult)) === 'outbox_nao_reservada');
checar('item com campo extra falha fechado', erroCodigo(() => apply({ ...sending, secret: 'nao' }, successResult)) === 'outbox_campos_invalidos');
checar('item com providerId preexistente falha fechado', erroCodigo(() => apply({ ...sending, providerId: 'ja-enviado' }, successResult)) === 'outbox_resultado_preexistente');
checar('item com código anterior não allowlistado falha fechado', erroCodigo(() => apply({ ...sending, errorCode: 'john.doe.example.com' }, successResult)) === 'outbox_error_code_invalido');
checar('tentativa fora do teto falha fechado', erroCodigo(() => apply({ ...sending, attempts: EMAIL_OUTBOX_MAX_ATTEMPTS + 1 }, successResult)) === 'outbox_tentativa_invalida');
checar('resultado failure com código desconhecido falha fechado', erroCodigo(() => apply(sending, { ok: false, code: 'mensagem externa', retryable: true })) === 'resultado_codigo_invalido');
checar('código terminal não pode ser marcado retryable', erroCodigo(() => apply(sending, { ...terminalResult, retryable: true })) === 'resultado_retry_inconsistente');
checar('código transitório não pode ser marcado terminal', erroCodigo(() => apply(sending, { ...retryResult, retryable: false })) === 'resultado_retry_inconsistente');
checar('retryable não booleano falha fechado', erroCodigo(() => apply(sending, { ok: false, code: 'provider_timeout', retryable: 'sim' })) === 'resultado_retry_invalido');
checar('resultado com campo PII extra falha fechado', erroCodigo(() => apply(sending, { ...retryResult, email: 'pessoa@example.test' })) === 'resultado_falha_campos_invalidos');
checar('agora inválido falha fechado', erroCodigo(() => aplicarResultadoResendNaOutbox({ claimedItem: sending, result: successResult, agora: 'nao-e-data' })) === 'agora_invalido');
checar('entrada incompleta falha fechado', erroCodigo(() => aplicarResultadoResendNaOutbox({ claimedItem: sending, result: successResult } as any)) === 'outcome_envelope_campos_invalidos');
checar('mesma entrada produz projeção determinística', JSON.stringify(apply(sendingItem(), successResult)) === JSON.stringify(apply(sendingItem(), successResult)));

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const source = fs.readFileSync(path.join(repoRoot, 'worker', 'src', 'resendOutboxOutcomeContract.js'), 'utf8');
checar('composição não contém fallback de rede global', !/globalThis\.fetch|\bfetch\s*\(/.test(source));
checar('composição não entra no runtime', ['index.js', 'equipe.js', 'email.js'].every((file) => !fs.readFileSync(path.join(repoRoot, 'worker', 'src', file), 'utf8').includes('resendOutboxOutcomeContract')));

if (falhas) {
  console.error('\nFALHOU: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(1);
}
console.log('\nPASSOU: ' + ok + ' ok, 0 falhas');
