/**
 * Sentry OLLI — exceção SEGURADA pelo nosso código chega ao Sentry, e sem PII.
 *
 *     node scripts/teste-sentry-captura.ts
 *
 * O defeito (auditoria 29/09, item 5): o ErrorBoundary do app, o errorElement do
 * painel e os catch que viram 502/500 no Worker (IA, webhook Stripe) seguravam a
 * exceção — então o ouvinte global do SDK nunca a via. O usuário via "Algo deu
 * errado" e o Sentry ficava em silêncio.
 *
 * 1) A porta `capturarExcecao` (src/services/sentryCaptura.ts), com um SDK falso
 *    que monta o evento como o de verdade e o passa pelo MESMO `beforeSend`
 *    (limparEventoSentry) que as três frentes configuram.
 * 2) As fronteiras de erro e os catch estão ligados na porta (contrato estático:
 *    App.tsx, ErrorBoundary, painel e Worker não são importáveis pelo node).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  capturarExcecao,
  conectarSentry,
  montarTagsCaptura,
  resetarCapturaParaTeste,
  type ClienteSentry,
} from '../src/services/sentryCaptura.ts';
import { limparEventoSentry } from '../src/services/sentryScrub.ts';

console.log('\nSentry OLLI — captura de exceção segurada, com redator de PII');

type Enviado = Record<string, unknown>;

/**
 * SDK falso: monta o evento no formato do Sentry (exception.values + tags) com os
 * campos que um SDK real anexa sozinho (user, contexts, request) e aplica o
 * beforeSend das frentes. `enviados` é o que sairia pela rede.
 */
function sdkFalso(): ClienteSentry & { enviados: Enviado[] } {
  const enviados: Enviado[] = [];
  return {
    enviados,
    captureException(erro, contexto) {
      const e = erro instanceof Error ? erro : new Error(String(erro));
      const evento = {
        exception: { values: [{ type: e.name, value: e.message, stacktrace: { frames: [{ filename: 'app:///index.bundle' }] } }] },
        tags: contexto?.tags ?? {},
        user: { email: 'cliente@exemplo.com', ip_address: '200.1.2.3' },
        contexts: { react: { componentStack: 'at ClienteCard (Pessoa Real)' } },
        request: { method: 'post', url: 'https://app.olliorcamentos.online/orcamentos?token=abc#x', data: { prompt: 'privado' } },
      };
      enviados.push(limparEventoSentry(evento));
      return 'id-falso';
    },
  };
}

// ── 1. antes do SDK: fica na fila, e não se perde ─────────────────────────────
resetarCapturaParaTeste();
capturarExcecao(new Error('quebrou no boot'), { origem: 'boot' });
const sdk = sdkFalso();
assert.equal(sdk.enviados.length, 0);
conectarSentry(sdk);
assert.equal(sdk.enviados.length, 1, 'a fila é despejada ao conectar');
assert.deepEqual(sdk.enviados[0].tags, { origem: 'boot' });
console.log('  ok   erro anterior ao SDK espera na fila e sai ao conectar');

// ── 2. depois do SDK: vai direto, com tags e SEM PII ──────────────────────────
const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMTExMTExMSJ9', 'assinatura_falsa_12345678'].join('.');
capturarExcecao(
  new Error(`render falhou p/ cliente@exemplo.com CPF 123.456.789-09 tel (11) 99999-8888 Bearer ${jwt}`),
  { origem: 'error-boundary', tela: 'OrcamentoDetalhe' },
);
assert.equal(sdk.enviados.length, 2);
const evento = sdk.enviados[1];
const serializado = JSON.stringify(evento);
for (const proibido of ['cliente@exemplo.com', '123.456.789-09', '99999-8888', jwt, '200.1.2.3', 'Pessoa Real', 'privado', 'token=abc']) {
  assert.equal(serializado.includes(proibido), false, `não pode sobreviver: ${proibido}`);
}
assert.deepEqual(evento.tags, { origem: 'error-boundary', tela: 'OrcamentoDetalhe' }, 'tags de diagnóstico sobrevivem ao redator');
assert.equal('user' in evento, false);
assert.equal('contexts' in evento, false);
assert.match(serializado, /render falhou/, 'a mensagem continua útil para diagnóstico');
console.log('  ok   exceção segurada chega com origem/tela e sai sem e-mail, CPF, telefone, JWT, IP ou corpo');

// ── 3. tags: só as 4 chaves, curtas e sem query ───────────────────────────────
assert.deepEqual(
  montarTagsCaptura({ origem: 'rota-painel', rota: '/orcamentos/abc?email=x@y.com#f', tipo: 'x'.repeat(200) }),
  { origem: 'rota-painel', rota: '/orcamentos/abc', tipo: 'x'.repeat(64) },
);
assert.deepEqual(montarTagsCaptura({ origem: 'ia', tela: '' }), { origem: 'ia' });
assert.deepEqual(montarTagsCaptura(undefined), {});
const comLixo = { origem: 'webhook', payload: 'corpo do pix' } as unknown as Parameters<typeof montarTagsCaptura>[0];
assert.deepEqual(montarTagsCaptura(comLixo), { origem: 'webhook' }, 'chave fora do contrato não vira tag');
console.log('  ok   tags: só origem/tela/rota/tipo, sem query/fragmento, até 64 caracteres');

// ── 4. best-effort: SDK que lança não derruba quem reporta; fila tem teto ────
conectarSentry({ captureException() { throw new Error('sdk quebrado'); } });
assert.doesNotThrow(() => capturarExcecao(new Error('x'), { origem: 'ia' }));
resetarCapturaParaTeste();
for (let i = 0; i < 50; i++) capturarExcecao(new Error(`loop ${i}`), { origem: 'error' });
const contador = sdkFalso();
conectarSentry(contador);
assert.equal(contador.enviados.length, 20, 'loop de erro antes do SDK não vira vazamento de memória');
resetarCapturaParaTeste();
console.log('  ok   SDK quebrado não lança; fila limitada a 20');

// ── 5. contrato: cada fronteira/catch está ligado na porta ────────────────────
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
// CRLF → LF: com core.autocrlf o checkout no Windows vem em CRLF e as âncoras abaixo usam \n.
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8').replace(/\r\n/g, '\n');
/** Trecho de `fonte` entre `inicio` e o próximo `fim` (para amarrar a chamada ao bloco certo). */
function trecho(fonte: string, inicio: string, fim: string): string {
  const i = fonte.indexOf(inicio);
  assert.notEqual(i, -1, `âncora ausente: ${inicio}`);
  const j = fonte.indexOf(fim, i + inicio.length);
  return fonte.slice(i, j === -1 ? undefined : j);
}
/**
 * `primeiro` aparece em `fonte` e ANTES de `depois`. Os dois têm de existir:
 * comparar `indexOf` cru passa em silêncio quando a chamada some (-1 < qualquer).
 */
function vemAntes(fonte: string, primeiro: string, depois: string, msg: string): void {
  const a = fonte.indexOf(primeiro);
  const b = fonte.indexOf(depois);
  assert.notEqual(a, -1, `${msg} — ausente: ${primeiro}`);
  assert.notEqual(b, -1, `${msg} — ausente: ${depois}`);
  assert.ok(a < b, msg);
}

const app = ler('App.tsx');
vemAntes(app, 'Sentry.init(', 'conectarSentry(Sentry)', 'App: conecta DEPOIS do Sentry.init');
assert.match(trecho(app, '} catch (e) {\n        // Erro técnico', 'finally'), /capturarExcecao\(e, \{ origem: 'boot' \}\)/, 'App: catch do boot reporta');

const boundaryApp = ler('src/components/ErrorBoundary.tsx');
assert.match(trecho(boundaryApp, 'componentDidCatch(', 'resetar ='), /capturarExcecao\(erro, \{ origem: 'error-boundary'/, 'app: ErrorBoundary reporta');

const main = ler('webapp/src/main.tsx');
vemAntes(main, 'Sentry.init(', 'conectarSentry(Sentry)', 'painel: conecta DEPOIS do Sentry.init');
assert.match(ler('webapp/src/routes/components/error-boundary.tsx'), /capturarExcecao\(error, \{ origem: "rota-painel"/, 'painel: errorElement reporta');
assert.match(trecho(ler('webapp/src/components/lazy/chunk-boundary.tsx'), 'componentDidCatch(', 'recarregar'), /capturarExcecao\(erro, \{ origem: "chunk-boundary"/, 'painel: ChunkBoundary reporta');
assert.match(ler('webapp/vite.config.ts'), /"@sentry-captura": sentryCapturaFonte/, 'painel: alias no Vite (import de valor)');
assert.match(ler('webapp/tsconfig.json'), /"@sentry-captura": \["\.\.\/src\/services\/sentryCaptura\.ts"\]/, 'painel: alias no tsconfig');

const worker = ler('worker/src/index.js');
vemAntes(worker, 'conectarSentry(Sentry)', 'export default Sentry.withSentry(', 'worker: conecta antes do withSentry');
assert.match(trecho(worker, "const overloaded = !!(e && e.overloaded);", 'return json('), /capturarExcecao\(e, \{ origem: 'ia'/, 'worker: catch da IA (502) reporta');
assert.match(trecho(ler('worker/src/stripe.js'), "console.error('[olli-stripe] webhook falhou:'", 'return json('), /capturarExcecao\(e, \{ origem: 'webhook'/, 'worker: catch do webhook Stripe (500) reporta');
assert.match(trecho(ler('worker/src/resendWebhook.js'), '} catch (error) {\n    // 500 segurado', 'return response('), /capturarExcecao\(error, \{ origem: 'webhook'/, 'worker: catch do webhook Resend (500) reporta');
console.log('  ok   app (ErrorBoundary + boot), painel (rota + chunk) e worker (IA + webhooks) ligados na porta');

console.log('PASSOU: exceção segurada chega ao Sentry nas 3 frentes, com o redator de PII no caminho.');
