import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

async function text(relativePath) {
  return readFile(path.join(ROOT, relativePath), 'utf8');
}

test('pacote não possui dependência externa', async () => {
  const packageJson = JSON.parse(await text('package.json'));
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    assert.equal(packageJson[field], undefined);
  }
  assert.equal(packageJson.private, true);
});

test('núcleo não acessa rede, ambiente, subprocesso, runtime ou Supabase', async () => {
  const sources = [
    await text('outbox/increment-a-outbox.mjs'),
    await text('fixtures/outbox-fixture.mjs'),
  ].join('\n');
  const forbidden = [
    /\bfetch\s*\(/,
    /\bWebSocket\b/,
    /node:(?:http|https|net|tls|dgram|dns|child_process|worker_threads)/,
    /process\.env/,
    /\bexec(?:File|Sync)?\s*\(/,
    /\bspawn(?:Sync)?\s*\(/,
    /\bsupabase\b/i,
    /(?:^|[/'"`])src[\\/]/m,
    /(?:^|[/'"`])worker[\\/]/m,
    /(?:^|[/'"`])webapp?[\\/]/m,
  ];
  for (const pattern of forbidden) {
    assert.equal(pattern.test(sources), false, String(pattern));
  }
});

test('imports de produção ficam restritos ao contrato J2.1, gateway J2.3 e pacote local', async () => {
  const files = {
    'outbox/increment-a-outbox.mjs': [
      '../../JANELA_2_1/contracts/tenancy-contract.mjs',
    ],
    'fixtures/outbox-fixture.mjs': [
      '../outbox/increment-a-outbox.mjs',
      '../../JANELA_2_3/fixtures/gateway-fixture.mjs',
    ],
  };
  for (const [relativePath, allowed] of Object.entries(files)) {
    const source = await text(relativePath);
    const imports = [...new Set(
      [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
        .map((match) => match[1]),
    )];
    assert.deepEqual(imports.sort(), [...allowed].sort());
  }
});

test('fixture permanece sintética e não contém PII ou segredo aparente', async () => {
  const source = await text('fixtures/outbox-fixture.mjs');
  const forbidden = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
    /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/,
    /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+\b/,
    /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
    /https?:\/\//i,
  ];
  for (const pattern of forbidden) {
    assert.equal(pattern.test(source), false, String(pattern));
  }
});

test('falhas não persistem mensagem bruta nem escrevem logs', async () => {
  const source = await text('outbox/increment-a-outbox.mjs');
  for (const forbidden of [
    'error.message',
    'error.stack',
    'console.log',
    'console.error',
    'JSON.stringify(error)',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.match(source, /unclassified_failure/);
  assert.match(source, /TRANSIENT_CODES/);
});

test('autoridade do ator é derivada somente do contexto confiável', async () => {
  const source = await text('outbox/increment-a-outbox.mjs');
  assert.match(
    source,
    /const TRUSTED_CONTEXT_KEYS = Object\.freeze\(\['session_user_id'\]\)/,
  );
  assert.match(source, /enqueued_by_user_id: sessionUserId/);
  assert.doesNotMatch(source, /command\.actor_user_id/);
  assert.doesNotMatch(source, /command\.role/);
  assert.doesNotMatch(source, /command\.membership/);
});

test('projeções seguras não incluem payload, ator ou lease token', async () => {
  const source = await text('outbox/increment-a-outbox.mjs');
  const safeItemBody = source.match(
    /function safeItem\(record\) \{([\s\S]*?)\n\}/,
  )?.[1];
  assert.ok(safeItemBody);
  for (const forbidden of [
    'record.command.payload',
    'enqueued_by_user_id',
    'lease_id',
    'command_hash',
  ]) {
    assert.equal(safeItemBody.includes(forbidden), false, forbidden);
  }
});
