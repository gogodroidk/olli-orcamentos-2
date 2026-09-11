import {
  EMAIL_OUTBOX_MAX_ATTEMPTS,
  EMAIL_OUTBOX_STATES,
  criarItemEmailOutbox,
  estadoTerminal,
  marcarEnviado,
  marcarEnviando,
  marcarFalha,
} from '../worker/src/emailOutbox.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nE-mail OLLI — outbox local e retry limitado');

checar('estados previstos são fechados', EMAIL_OUTBOX_STATES.join(',') === 'pending,sending,sent,failed,dead_letter');
checar('teto de tentativas é explícito', EMAIL_OUTBOX_MAX_ATTEMPTS === 5);

const base = {
  eventId: 'email-confirmed:user-01',
  idempotencyKey: 'welcome:user-01:boas_vindas.v1',
  template: 'boas_vindas',
  templateVersion: 'boas_vindas.v1',
  purpose: 'account_onboarding',
  recipient: 'Pessoa@Exemplo.com',
  respostaDoProvider: 'não deve entrar',
};
const item = criarItemEmailOutbox(base, { agora: '2026-08-31T12:00:00.000Z' });
checar('item nasce pendente e normalizado', item.status === 'pending' && item.recipient === 'pessoa@exemplo.com' && item.attempts === 0);
checar('item não guarda corpo/resposta do provider', !('html' in item) && !('texto' in item) && !('respostaDoProvider' in item));
checar('item começa elegível', item.nextAttemptAt === '2026-08-31T12:00:00.000Z');

const enviando = marcarEnviando(item, { agora: '2026-08-31T12:00:01.000Z' });
checar('claim incrementa tentativa', enviando.status === 'sending' && enviando.attempts === 1);
const falhou = marcarFalha(enviando, { codigo: '429\r\nsegredo', agora: '2026-08-31T12:00:02.000Z' });
checar('falha agenda retry', falhou.status === 'failed' && falhou.nextAttemptAt === '2026-08-31T12:01:02.000Z');
checar('erro fica categorizado sem CRLF', falhou.errorCode === '429_segredo');
checar('retry antes da hora falha fechado', erroCodigo(() => marcarEnviando(falhou, { agora: '2026-08-31T12:00:30.000Z' })) === 'retry_ainda_nao_elegivel');

const retry = marcarEnviando(falhou, { agora: '2026-08-31T12:01:02.000Z' });
const enviado = marcarEnviado(retry, { providerId: 'msg-01', agora: '2026-08-31T12:01:03.000Z' });
checar('retry elegível pode ser reservado', retry.status === 'sending' && retry.attempts === 2);
checar('sucesso é terminal e limpa retry', enviado.status === 'sent' && enviado.providerId === 'msg-01' && enviado.nextAttemptAt === null && estadoTerminal(enviado));
checar('sucesso não pode ser reaberto', erroCodigo(() => marcarEnviando(enviado, { agora: '2026-08-31T12:02:00.000Z' })) === 'transicao_invalida');

let atual: any = item;
for (let i = 0; i < EMAIL_OUTBOX_MAX_ATTEMPTS; i++) {
  const sending = marcarEnviando(atual, { agora: new Date(Date.parse('2026-08-31T13:00:00.000Z') + i * 86_400_000).toISOString() });
  atual = marcarFalha(sending, { codigo: 'provider_unavailable', agora: new Date(Date.parse('2026-08-31T13:00:01.000Z') + i * 86_400_000).toISOString() });
}
checar('quinto erro vai para dead-letter', atual.status === 'dead_letter' && atual.nextAttemptAt === null && estadoTerminal(atual));
checar('dead-letter não tenta novamente', erroCodigo(() => marcarEnviando(atual, { agora: '2026-09-10T00:00:00.000Z' })) === 'transicao_invalida');
checar('destinatário inválido falha fechado', erroCodigo(() => criarItemEmailOutbox({ ...base, recipient: 'sem-email' }, { agora: '2026-08-31T12:00:00Z' })) === 'destinatario_invalido');

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
