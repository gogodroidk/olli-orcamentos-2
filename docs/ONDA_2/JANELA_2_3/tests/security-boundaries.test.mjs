import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  readdirSync,
} from 'node:fs';
import {
  dirname,
  join,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles() {
  return [
    ...readdirSync(join(ROOT, 'gateway'))
      .filter((name) => name.endsWith('.mjs'))
      .map((name) => join(ROOT, 'gateway', name)),
    ...readdirSync(join(ROOT, 'fixtures'))
      .filter((name) => name.endsWith('.mjs'))
      .map((name) => join(ROOT, 'fixtures', name)),
  ];
}

test('pacote não possui dependência externa', () => {
  const packageJson = JSON.parse(
    readFileSync(join(ROOT, 'package.json'), 'utf8'),
  );
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
  ]) {
    assert.equal(
      Object.keys(packageJson[field] ?? {}).length,
      0,
      `${field} deve permanecer vazio`,
    );
  }
});

test('gateway não acessa rede, ambiente, subprocesso, runtime ou Supabase', () => {
  const source = sourceFiles()
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  for (const forbidden of [
    /\bfetch\s*\(/,
    /https?:\/\//,
    /node:(?:http|https|net|tls|dns|child_process)/,
    /process\.env/,
    /\.env\b/,
    /supabase/i,
    /service_role/i,
    /[\\/]src[\\/]/,
    /[\\/]worker[\\/]/,
  ]) {
    assert.equal(
      forbidden.test(source),
      false,
      `superfície proibida encontrada: ${forbidden}`,
    );
  }
});

test('único contrato externo consumido é o pacote local J2.1', () => {
  const source = readFileSync(
    join(ROOT, 'gateway', 'increment-a-gateway.mjs'),
    'utf8',
  );
  const imports = [
    ...source.matchAll(/from\s+['"]([^'"]+)['"]/g),
  ].map((match) => match[1]);
  assert.deepEqual(imports, [
    '../../JANELA_2_1/contracts/tenancy-contract.mjs',
  ]);
});

test('fixtures não contêm PII, URL ou rótulo de segredo', () => {
  const source = readFileSync(
    join(ROOT, 'fixtures', 'gateway-fixture.mjs'),
    'utf8',
  );
  for (const forbidden of [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /\b(cpf|cnpj|telefone|celular|endereço|endereco)\b/i,
    /https?:\/\//i,
    /\b(api[_-]?key|access[_-]?token|password|senha|secret)\b/i,
  ]) {
    assert.equal(forbidden.test(source), false);
  }
});

test('fronteira confiável possui allowlist mínima e não aceita role', () => {
  const source = readFileSync(
    join(ROOT, 'gateway', 'increment-a-gateway.mjs'),
    'utf8',
  );
  assert.match(
    source,
    /TRUSTED_CONTEXT_KEYS = Object\.freeze\(\['session_user_id'\]\)/,
  );
  assert.doesNotMatch(
    source,
    /trustedContext\.(?:role|membership|capabilities|organization_id)/,
  );
});

test('ledger local não persiste o payload integral', () => {
  const source = readFileSync(
    join(ROOT, 'gateway', 'increment-a-gateway.mjs'),
    'utf8',
  );
  const recordLedgerBody = source.match(
    /function recordLedger\([\s\S]*?\n}\n\nexport class/,
  )?.[0];
  assert.ok(recordLedgerBody);
  assert.doesNotMatch(recordLedgerBody, /payload\s*:/);
  assert.match(recordLedgerBody, /command_hash/);
  assert.match(recordLedgerBody, /safe_result/);
});
