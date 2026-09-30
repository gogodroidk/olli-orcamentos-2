import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_IMPORTS = new Set(['node:crypto']);

function listFiles(directory, extension) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fullPath, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) files.push(fullPath);
  }
  return files.sort();
}

test('pacote de execução permanece offline, sem ambiente, subprocesso, runtime ou dependência externa', () => {
  const executionFiles = [
    ...listFiles(join(ROOT, 'contracts'), '.mjs'),
    ...listFiles(join(ROOT, 'fixtures'), '.mjs'),
  ];
  const forbiddenPatterns = [
    [/\bfetch\s*\(/, 'fetch'],
    [/\bprocess\.env\b/, 'process.env'],
    [/node:(?:http|https|net|tls|dgram|child_process|worker_threads)/, 'rede/processo'],
    [/\b(?:eval|Function)\s*\(/, 'avaliação dinâmica'],
    [/\b(?:supabase|openrouter|axios|expo|react-native)\b/i, 'integração/runtime externo'],
    [/\.\.\/\.\.\/\.\.\/(?:src|web|webapp|worker|supabase)\//i, 'import de runtime'],
  ];

  for (const file of executionFiles) {
    const source = readFileSync(file, 'utf8');
    for (const [pattern, label] of forbiddenPatterns) {
      assert.equal(pattern.test(source), false, `${file} introduziu ${label}`);
    }
    for (const match of source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)) {
      const specifier = match[2];
      assert.equal(specifier.startsWith('.') || ALLOWED_IMPORTS.has(specifier), true, `${file} importa ${specifier}`);
    }
  }

  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(Object.hasOwn(packageJson, 'dependencies'), false);
  assert.equal(Object.hasOwn(packageJson, 'devDependencies'), false);
});

test('fixtures são sintéticas e não carregam identificadores pessoais usuais', () => {
  const source = readFileSync(join(ROOT, 'fixtures', 'synthetic.mjs'), 'utf8');
  assert.equal(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(source), false, 'fixture contém e-mail');
  assert.equal(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(source), false, 'fixture contém possível CPF');
  assert.equal(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/.test(source), false, 'fixture contém possível CNPJ');
  assert.equal(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/.test(source), false, 'fixture contém possível telefone');
  assert.equal(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source), false, 'fixture contém chave privada');
});

test('schemas não possuem defaults/examples com autoridade ou dado real', () => {
  for (const file of listFiles(join(ROOT, 'schemas'), '.json')) {
    const source = readFileSync(file, 'utf8');
    const schema = JSON.parse(source);
    assert.equal(Object.hasOwn(schema, 'examples'), false);
    assert.equal(Object.hasOwn(schema, 'default'), false);
    assert.equal(/actor_user_id|service_role|access_token|refresh_token/i.test(source), false, `${file} contém autoridade/segredo`);
  }
});
