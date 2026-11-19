// P2-2 e webhook: instalar 2 vezes e --desfazer volta ao ORIGINAL da 1ª vez (hash), tira ficha.mjs e reverte o webhook.
// Tudo em pasta temporária (FICHA_DEST) e Chatwoot falso; nada toca /home/igor/chatwoot-central.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const sh = promisify(execFile);
const aqui = dirname(fileURLToPath(import.meta.url));
const h = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const ARQ = ['cw.mjs', 'acordador.mjs', 'registrar-webhook.mjs'];

async function cenario(fn, extraEnv = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'inst-ficha-'));
  const dest = join(raiz, 'agentes'); mkdirSync(dest);
  for (const f of ARQ) writeFileSync(join(dest, f), `// ORIGINAL ${f}\n`);
  const webhooks = [{ id: 7, url: 'http://172.20.0.1:3013/chatwoot/segredo-de-teste', subscriptions: ['message_created', 'conversation_updated'] }];
  const patches = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', () => {
      const m = req.url.match(/\/webhooks(?:\/(\d+))?$/);
      if (req.method === 'GET') return res.writeHead(200).end(JSON.stringify({ payload: { webhooks } }));
      if (req.method === 'PATCH' && m?.[1]) { const w = webhooks.find((x) => x.id === Number(m[1])); w.subscriptions = JSON.parse(b).webhook.subscriptions; patches.push(w.subscriptions); return res.writeHead(200).end('{}'); }
      res.writeHead(404).end();
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const env = { ...process.env, FICHA_DEST: dest, CHATWOOT_URL: `http://127.0.0.1:${srv.address().port}`, CHATWOOT_TOKEN_ADMIN: 'token-de-teste',
    CHATWOOT_ACORDADOR_SEGREDO: 'segredo-de-teste', ACORDADOR_HOST: '172.20.0.1', CREDENCIAIS_ENV: join(raiz, 'nao-existe.env'), ...extraEnv };
  const rodar = (...a) => sh('sh', [join(aqui, 'instalar-ficha.sh'), ...a], { env }).then((r) => ({ out: r.stdout + r.stderr }), (e) => ({ out: `${e.stdout}${e.stderr}`, cod: e.code }));
  try { await fn({ dest, rodar, webhooks, patches }); } finally { srv.close(); rmSync(raiz, { recursive: true, force: true }); }
}

test('instalar 2 vezes e --desfazer volta ao original da 1ª vez (hash dos arquivos), sem ficha.mjs, webhook revertido', async () => {
  await cenario(async ({ dest, rodar, webhooks, patches }) => {
    const hashes = Object.fromEntries(ARQ.map((f) => [f, h(join(dest, f))]));
    await rodar(); const apos1 = h(join(dest, 'cw.mjs'));
    assert.notEqual(apos1, hashes['cw.mjs']); assert.ok(existsSync(join(dest, 'ficha.mjs')));
    await new Promise((r) => setTimeout(r, 1100)); // backup datado distinto
    await rodar(); // 2ª instalação: o ORIGINAL não pode ser sobrescrito
    const orig = `${dest}.bak-ficha-ORIGINAL`;
    for (const f of ARQ) assert.equal(h(join(orig, f)), hashes[f], `ORIGINAL de ${f} intacto após 2ª instalação`);
    assert.ok(!existsSync(join(orig, 'ficha.mjs')));
    assert.ok(readdirSync(join(dest, '..')).filter((n) => /agentes\.bak-ficha-\d/.test(n)).length >= 2, 'cópias datadas de auditoria');
    const r = await rodar('--desfazer'); assert.equal(r.cod, undefined, r.out); assert.match(r.out, /desfeito/);
    for (const f of ARQ) assert.equal(h(join(dest, f)), hashes[f], `${f} voltou ao original da 1ª vez`);
    assert.ok(!existsSync(join(dest, 'ficha.mjs')));
    assert.deepEqual(webhooks[0].subscriptions, ['message_created']); assert.equal(patches.length, 1);
    assert.doesNotMatch(r.out, /segredo-de-teste|token-de-teste/); // nada de segredo impresso
  });
});
test('--desfazer sem backup ORIGINAL recusa', async () => {
  await cenario(async ({ rodar }) => { const r = await rodar('--desfazer'); assert.equal(r.cod, 1); assert.match(r.out, /sem backup ORIGINAL/); });
});
test('webhook inalcançável: --desfazer imprime o PATCH exato (sem segredo) e ainda restaura os arquivos', async () => {
  await cenario(async ({ dest, rodar }) => {
    const h0 = h(join(dest, 'cw.mjs')); await rodar();
    const r = await rodar('--desfazer');
    assert.match(r.out, /webhook NÃO revertido/); assert.match(r.out, /curl -X PATCH .*accounts\/2\/webhooks\/<ID/);
    assert.equal(h(join(dest, 'cw.mjs')), h0); assert.ok(!existsSync(join(dest, 'ficha.mjs')));
    assert.doesNotMatch(r.out, /segredo-de-teste|token-de-teste/);
  }, { CHATWOOT_URL: 'http://127.0.0.1:1' });
});
test('o comando de PATCH documentado existe no script e na receita, sem segredo', () => {
  const sc = readFileSync(join(aqui, 'instalar-ficha.sh'), 'utf8');
  assert.match(sc, /curl -X PATCH .*webhooks\/<ID/); assert.ok(sc.includes('\\"subscriptions\\":[\\"message_created\\"]'));
  assert.doesNotMatch(sc, /CHATWOOT_ACORDADOR_SEGREDO=[0-9a-f]{8}/);
});
