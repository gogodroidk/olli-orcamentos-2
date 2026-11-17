import assert from 'node:assert/strict';
import { limparBreadcrumbSentry, limparEventoSentry, redigirTextoSentry } from '../src/services/sentryScrub.ts';

console.log('\nSentry OLLI — redator de PII antes da rede');

const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMTExMTExMSJ9', 'assinatura_falsa_12345678'].join('.');
const original = {
  message: `Falha para cliente@exemplo.com, CPF 123.456.789-09, tel (11) 99999-8888, Bearer ${jwt}`,
  request: {
    method: 'post',
    url: 'https://app.olliorcamentos.online/orcamentos?id=123.456.789-09#segredo',
    headers: { authorization: `Bearer ${jwt}`, cookie: 'sessao=segredo' },
    data: { cliente: 'Pessoa Real', prompt: 'conteúdo privado' },
  },
  user: { email: 'cliente@exemplo.com', id: '111' },
  extra: { payload: 'orçamento completo' },
  contexts: { cliente: { nome: 'Pessoa Real' } },
  exception: { values: [{ type: 'Error', value: `token ${jwt} de cliente@exemplo.com` }] },
  breadcrumbs: [
    { category: 'ui.input', message: 'Rua particular, 10' },
    { category: 'console', message: 'cliente@exemplo.com' },
    { category: 'navigation', message: 'indo para /planos?email=cliente@exemplo.com', data: { token: jwt } },
  ],
};

const limpo = limparEventoSentry(original);
const serializado = JSON.stringify(limpo);
for (const proibido of ['cliente@exemplo.com', '123.456.789-09', '99999-8888', jwt, 'Pessoa Real', 'conteúdo privado', 'sessao=segredo', '?email=', '?id=', '#segredo']) {
  assert.equal(serializado.includes(proibido), false, `não pode sobreviver: ${proibido}`);
}
assert.equal('user' in limpo, false);
assert.equal('extra' in limpo, false);
assert.equal('contexts' in limpo, false);
assert.deepEqual(limpo.request, { method: 'POST', url: 'https://app.olliorcamentos.online/orcamentos' });
assert.equal((limpo.breadcrumbs as unknown[]).length, 1, 'input e console são descartados');
assert.equal(original.user.email, 'cliente@exemplo.com', 'o redator não muta o evento original');
assert.equal(limparBreadcrumbSentry({ category: 'ui.click', message: 'Cliente João' }), null);
assert.match(redigirTextoSentry('veja https://host.test/x?token=abc'), /^veja https:\/\/host\.test\/x$/);

// Regressão 29/09: "ex-CEP-tion" casava com a chave sensível `cep` e o evento
// inteiro chegava ao Sentry SEM exception; e com teto de profundidade 6 cada
// linha do stack virava "[TRUNCATED]". Redigir não pode apagar o diagnóstico.
const excecao = (limpo.exception as { values: Array<{ type: string; value: string }> }).values[0];
assert.equal(excecao.type, 'Error', 'exception sobrevive ao redator');
assert.equal(excecao.value, 'token [REDACTED_JWT] de [REDACTED_EMAIL]', 'mensagem da exceção chega redigida, não apagada');
const frames = Array.from({ length: 60 }, (_, i) => ({ filename: `app:///f${i}.js`, function: `fn${i}`, lineno: i, in_app: true }));
const comStack = limparEventoSentry({
  exception: { values: [{ type: 'TypeError', value: 'x', stacktrace: { frames }, mechanism: { type: 'onerror', handled: false } }] },
});
const framesLimpos = (comStack.exception as { values: Array<{ stacktrace: { frames: Array<Record<string, unknown>> } }> }).values[0].stacktrace.frames;
assert.equal(framesLimpos.length, 50, 'stack longo é cortado em 50 frames');
assert.deepEqual(framesLimpos.at(-1), { filename: 'app:///f59.js', function: 'fn59', lineno: 59, in_app: true }, 'o frame que quebrou (o último) fica, com arquivo/função/linha intactos');
assert.equal(JSON.stringify(framesLimpos).includes('[TRUNCATED]'), false, 'nenhuma linha do stack vira [TRUNCATED]');
// Cadeia de `cause` (LinkedErrors do SDK): `mechanism.exception_id` também casa
// com `cep`; sem ele o `parent_id` do filho apontava para um id inexistente.
const cadeia = limparEventoSentry({
  exception: {
    values: [
      { type: 'TypeError', value: 'interno', mechanism: { type: 'chained', source: 'cause', exception_id: 1, parent_id: 0 } },
      { type: 'Error', value: 'externo', mechanism: { type: 'auto.core.linked_errors', exception_id: 0 } },
    ],
  },
});
const mecanismos = (cadeia.exception as { values: Array<{ mechanism: Record<string, unknown> }> }).values.map((v) => v.mechanism);
assert.deepEqual(mecanismos, [
  { type: 'chained', source: 'cause', exception_id: 1, parent_id: 0 },
  { type: 'auto.core.linked_errors', exception_id: 0 },
], 'exception_id/parent_id da cadeia de cause sobrevivem ao redator');
const aninhado = limparEventoSentry({ diagnostico: { exception: { value: 'x' } } }).diagnostico as Record<string, unknown>;
assert.equal('exception' in aninhado, false, 'fora da raiz, `exception` continua sendo descartada');

console.log('PASSOU: PII, autenticação, corpos, contexto, query e breadcrumbs sensíveis removidos; exceção e stack preservados.');

// CQ-APP-13-B: transação sem contexts.trace é rejeitada pelo Sentry (invalid_transaction).
{
  const transacao = {
    type: 'transaction', transaction: 'Home', start_timestamp: 1, timestamp: 2,
    contexts: {
      trace: { trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16), op: 'navigation', status: 'ok', data: { email: 'cliente@exemplo.com' } },
      os: { name: 'Android', version: '14' },
      cliente: { nome: 'Pessoa Real' },
      device: { model: 'Pixel 7', name: 'Celular do João' },
    },
  };
  const t = limparEventoSentry(transacao) as Record<string, any>;
  assert.equal(t.contexts.trace.trace_id, 'a'.repeat(32));
  assert.equal(t.contexts.trace.span_id, 'b'.repeat(16));
  assert.equal(t.contexts.trace.op, 'navigation');
  assert.equal(t.contexts.os.name, 'Android');
  assert.equal(t.contexts.device.model, 'Pixel 7');
  const ser = JSON.stringify(t);
  for (const proibido of ['cliente@exemplo.com', 'Pessoa Real', 'Celular do João']) assert.equal(ser.includes(proibido), false, proibido);
  console.log('  ✓ transação mantém contexts.trace (sem PII)');
}
