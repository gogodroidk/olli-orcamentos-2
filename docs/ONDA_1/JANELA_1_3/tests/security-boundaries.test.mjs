import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_NODE_IMPORTS = new Set(['node:crypto', 'node:sqlite']);

function listMjs(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listMjs(path));
    else if (entry.isFile() && entry.name.endsWith('.mjs')) files.push(path);
  }
  return files.sort();
}

test('laboratório permanece offline, sem segredo, subprocesso ou dependência externa', () => {
  const productionLikeFiles = [
    ...listMjs(join(ROOT, 'fixtures')),
    ...listMjs(join(ROOT, 'spikes')),
  ];
  const forbiddenPatterns = [
    [/\bfetch\s*\(/, 'fetch'],
    [/\bprocess\.env\b/, 'process.env'],
    [/node:(?:http|https|net|tls|dgram|child_process)/, 'API de rede/processo'],
    [/\b(?:eval|Function)\s*\(/, 'avaliação dinâmica'],
    [/\b(?:axios|supabase|openrouter)\b/i, 'integração externa'],
  ];

  for (const path of productionLikeFiles) {
    const source = readFileSync(path, 'utf8');
    for (const [pattern, label] of forbiddenPatterns) {
      assert.equal(pattern.test(source), false, `${path} introduziu ${label}`);
    }
    for (const match of source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)) {
      const specifier = match[2];
      assert.equal(
        specifier.startsWith('.') || ALLOWED_NODE_IMPORTS.has(specifier),
        true,
        `${path} importa dependência não permitida: ${specifier}`,
      );
    }
  }

  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(Object.hasOwn(packageJson, 'dependencies'), false);
  assert.equal(Object.hasOwn(packageJson, 'devDependencies'), false);

  const fixtureSource = readFileSync(join(ROOT, 'fixtures', 'synthetic.mjs'), 'utf8');
  assert.equal(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(fixtureSource), false, 'fixture contém e-mail');
  assert.equal(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(fixtureSource), false, 'fixture contém possível CPF');
  assert.equal(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/.test(fixtureSource), false, 'fixture contém possível CNPJ');
});
