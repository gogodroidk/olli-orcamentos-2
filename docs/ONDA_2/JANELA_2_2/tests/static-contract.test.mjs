import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readArtifacts,
  validateTexts,
} from '../scripts/validate-static.mjs';

function codes(result) {
  return new Set(result.errors.map((error) => error.code));
}

test('baseline estática satisfaz todos os invariantes declarados', () => {
  const result = validateTexts(readArtifacts());
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.checkedFiles, 11);
  assert.equal(result.requiredTables, 5);
});

test('validador detecta RLS forçada ausente', () => {
  const texts = readArtifacts();
  texts.up = texts.up.replace(
    'alter table olli_v2.clients force row level security;',
    '',
  );
  const result = validateTexts(texts);
  assert.equal(result.ok, false);
  assert.equal(codes(result).has('RLS_FORCE_CLIENTS'), true);
});

test('validador detecta FK de co-tenancy enfraquecida', () => {
  const texts = readArtifacts();
  texts.up = texts.up.replace(
    'foreign key (organization_id, client_id)',
    'foreign key (client_id)',
  );
  const result = validateTexts(texts);
  assert.equal(result.ok, false);
  assert.equal(codes(result).has('CO_TENANCY_FK'), true);
});

test('validador detecta policy de escrita que deixa de falhar fechado', () => {
  const texts = readArtifacts();
  texts.up = texts.up.replace(
    `create policy clients_insert_via_gateway_only
  on olli_v2.clients
  for insert
  to authenticated
  with check (false);`,
    `create policy clients_insert_via_gateway_only
  on olli_v2.clients
  for insert
  to authenticated
  with check (true);`,
  );
  const result = validateTexts(texts);
  assert.equal(result.ok, false);
  assert.equal(codes(result).has('POLICY_DENY_INSERT_CLIENTS'), true);
});

test('validador rejeita grant amplo ao papel autenticado', () => {
  const texts = readArtifacts();
  texts.up += '\ngrant all on all tables in schema olli_v2 to authenticated;\n';
  const result = validateTexts(texts);
  assert.equal(result.ok, false);
  assert.equal(codes(result).has('DIRECT_WRITE_GRANT'), true);
  assert.equal(codes(result).has('UNSAFE_UP_SQL'), true);
});

test('validador rejeita rollback que desliga RLS', () => {
  const texts = readArtifacts();
  texts.rollback += '\nalter table olli_v2.clients disable row level security;\n';
  const result = validateTexts(texts);
  assert.equal(result.ok, false);
  assert.equal(codes(result).has('UNSAFE_ROLLBACK_SQL'), true);
});

test('validador rejeita PII ou segredo em fixture', () => {
  const texts = readArtifacts();
  texts.fixtures += "\nselect 'contato@empresa.example', 'access_token';\n";
  const result = validateTexts(texts);
  assert.equal(result.ok, false);
  assert.equal(codes(result).has('FIXTURE_EMAIL'), true);
  assert.equal(codes(result).has('FIXTURE_SECRET'), true);
});

test('validador rejeita dependência npm externa', () => {
  const texts = readArtifacts();
  const packageJson = JSON.parse(texts.packageJson);
  packageJson.dependencies = { pg: '1.0.0' };
  texts.packageJson = JSON.stringify(packageJson);
  const result = validateTexts(texts);
  assert.equal(result.ok, false);
  assert.equal(codes(result).has('PACKAGE_EXTERNAL_DEPENDENCY'), true);
});
