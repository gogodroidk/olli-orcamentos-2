import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChildEnvironment,
  buildPlan,
  parseArguments,
  safePlanSummary,
  validateLocalDatabaseUrl,
} from '../scripts/run-local-postgres.mjs';

test('aceita somente URL PostgreSQL de loopback e banco olli_*', () => {
  const local = validateLocalDatabaseUrl(
    'postgresql://local_user:local_pass@127.0.0.1:5544/olli_ephemeral',
  );
  assert.deepEqual(local, {
    host: '127.0.0.1',
    port: '5544',
    database: 'olli_ephemeral',
    username: 'local_user',
    password: 'local_pass',
  });
});

test('aceita localhost sem credencial e usa porta padrão', () => {
  const local = validateLocalDatabaseUrl(
    'postgresql://localhost/olli_test',
  );
  assert.equal(local.host, 'localhost');
  assert.equal(local.port, '5432');
  assert.equal(local.database, 'olli_test');
  assert.equal(local.password, '');
});

test('rejeita host remoto mesmo com banco descartável', () => {
  assert.throws(
    () => validateLocalDatabaseUrl(
      'postgresql://db.example.invalid/olli_ephemeral',
    ),
    /loopback/,
  );
});

test('rejeita banco administrativo ou sem prefixo olli_', () => {
  assert.throws(
    () => validateLocalDatabaseUrl('postgresql://localhost/postgres'),
    /começar com olli_/,
  );
  assert.throws(
    () => validateLocalDatabaseUrl('postgresql://localhost/template1'),
    /começar com olli_/,
  );
});

test('rejeita query string que poderia alterar o destino', () => {
  assert.throws(
    () => validateLocalDatabaseUrl(
      'postgresql://localhost/olli_ephemeral?host=remote',
    ),
    /Query string/,
  );
});

test('plano tem ordem determinística e inclui rollback por último', () => {
  const plan = buildPlan();
  assert.deepEqual(
    plan.map((entry) => entry.relativePath),
    [
      'harness/000_bootstrap_local.sql',
      'sql/001_increment_a_up.sql',
      'harness/010_fixtures.sql',
      'harness/020_assertions.sql',
      'sql/001_increment_a_rollback.sql',
      'harness/030_rollback_assertions.sql',
    ],
  );
});

test('modo plan não imprime senha', () => {
  const { connection, planOnly } = parseArguments([
    '--database-url',
    'postgresql://local_user:private_value@localhost/olli_ephemeral',
    '--plan',
  ]);
  assert.equal(planOnly, true);
  const serialized = JSON.stringify(safePlanSummary(connection));
  assert.equal(serialized.includes('private_value'), false);
  assert.equal(serialized.includes('password'), true);
  assert.equal(serialized.includes('false'), true);
});

test('executor remove variáveis PG* herdadas antes de remontar o destino local', () => {
  const connection = validateLocalDatabaseUrl(
    'postgresql://local_user:private_value@localhost/olli_ephemeral',
  );
  const environment = buildChildEnvironment(connection, {
    PATH: 'C:\\Windows\\System32',
    PGHOST: 'db.example.invalid',
    PGDATABASE: 'production',
    PGOPTIONS: '-c search_path=public',
    PGSERVICE: 'danger',
    PGPASSWORD: 'old-secret',
  });
  assert.equal(environment.PATH, 'C:\\Windows\\System32');
  assert.equal(environment.PGHOST, 'localhost');
  assert.equal(environment.PGPORT, '5432');
  assert.equal(environment.PGDATABASE, 'olli_ephemeral');
  assert.equal(environment.PGUSER, 'local_user');
  assert.equal(environment.PGOPTIONS, undefined);
  assert.equal(environment.PGSERVICE, '');
  assert.equal(environment.PGPASSWORD, 'private_value');
});

test('argumento desconhecido falha fechado', () => {
  assert.throws(
    () => parseArguments([
      '--database-url',
      'postgresql://localhost/olli_ephemeral',
      '--execute-remotely',
    ]),
    /desconhecido/,
  );
});
