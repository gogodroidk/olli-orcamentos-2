import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const defaultRoot = path.resolve(moduleDirectory, '..');

export const artifactPaths = Object.freeze({
  packageJson: 'package.json',
  readme: 'README.md',
  gaps: 'GAPS_TO_GATEWAY.md',
  up: 'sql/001_increment_a_up.sql',
  rollback: 'sql/001_increment_a_rollback.sql',
  bootstrap: 'harness/000_bootstrap_local.sql',
  fixtures: 'harness/010_fixtures.sql',
  assertions: 'harness/020_assertions.sql',
  rollbackAssertions: 'harness/030_rollback_assertions.sql',
  syntaxParser: 'scripts/validate-postgres-syntax.py',
  runner: 'scripts/run-local-postgres.mjs',
});

function normalizeSql(value) {
  return value
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function issue(errors, code, file, message) {
  errors.push({ code, file, message });
}

function requireMatch(errors, file, text, pattern, code, message) {
  if (!pattern.test(text)) {
    issue(errors, code, file, message);
  }
}

function forbidMatch(errors, file, text, pattern, code, message) {
  if (pattern.test(text)) {
    issue(errors, code, file, message);
  }
}

export function readArtifacts(root = defaultRoot, overrides = {}) {
  return Object.fromEntries(
    Object.entries(artifactPaths).map(([key, relativePath]) => {
      const value = Object.hasOwn(overrides, key)
        ? overrides[key]
        : fs.readFileSync(path.join(root, relativePath), 'utf8');
      return [key, value];
    }),
  );
}

export function validateTexts(texts) {
  const errors = [];
  const up = normalizeSql(texts.up);
  const rollback = normalizeSql(texts.rollback);
  const bootstrap = normalizeSql(texts.bootstrap);
  const assertions = normalizeSql(texts.assertions);
  const rollbackAssertions = normalizeSql(texts.rollbackAssertions);
  const runner = texts.runner;
  const fixtures = texts.fixtures;

  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /^begin;.*commit;$/s,
    'UP_TRANSACTION',
    'A migration deve possuir fronteira transacional explícita.',
  );

  const tables = [
    'organizations',
    'organization_memberships',
    'clients',
    'locations',
    'command_ledger',
  ];

  for (const table of tables) {
    const escaped = table.replaceAll('_', '\\_');
    requireMatch(
      errors,
      artifactPaths.up,
      up,
      new RegExp(`create table if not exists olli_v2\\.${table} \\\(`),
      `TABLE_${table.toUpperCase()}`,
      `Tabela obrigatória ausente: ${table}.`,
    );
    requireMatch(
      errors,
      artifactPaths.up,
      up,
      new RegExp(`alter table olli_v2\\.${table} enable row level security;`),
      `RLS_ENABLE_${table.toUpperCase()}`,
      `RLS não foi habilitada em ${table}.`,
    );
    requireMatch(
      errors,
      artifactPaths.up,
      up,
      new RegExp(`alter table olli_v2\\.${table} force row level security;`),
      `RLS_FORCE_${table.toUpperCase()}`,
      `RLS não foi forçada em ${table}.`,
    );

    const tablePolicyCount = [
      ...up.matchAll(
        new RegExp(
          `create policy [a-z0-9_]+ on olli_v2\\.${escaped} for (select|insert|update|delete)`,
          'g',
        ),
      ),
    ].length;
    if (tablePolicyCount !== 4) {
      issue(
        errors,
        `POLICY_MATRIX_${table.toUpperCase()}`,
        artifactPaths.up,
        `${table} deve ter exatamente quatro policies explícitas; atual=${tablePolicyCount}.`,
      );
    }

    for (const operation of ['select', 'insert', 'update', 'delete']) {
      const operationCount = [
        ...up.matchAll(
          new RegExp(
            `create policy [a-z0-9_]+ on olli_v2\\.${escaped} for ${operation}`,
            'g',
          ),
        ),
      ].length;
      if (operationCount !== 1) {
        issue(
          errors,
          `POLICY_${operation.toUpperCase()}_${table.toUpperCase()}`,
          artifactPaths.up,
          `${table} deve ter exatamente uma policy FOR ${operation.toUpperCase()}; atual=${operationCount}.`,
        );
      }
    }

    requireMatch(
      errors,
      artifactPaths.up,
      up,
      new RegExp(
        `create policy [a-z0-9_]+ on olli_v2\\.${escaped} for insert to authenticated with check \\\(false\\\);`,
      ),
      `POLICY_DENY_INSERT_${table.toUpperCase()}`,
      `INSERT direto deve falhar fechado em ${table}.`,
    );
    requireMatch(
      errors,
      artifactPaths.up,
      up,
      new RegExp(
        `create policy [a-z0-9_]+ on olli_v2\\.${escaped} for update to authenticated using \\\(false\\\) with check \\\(false\\\);`,
      ),
      `POLICY_DENY_UPDATE_${table.toUpperCase()}`,
      `UPDATE direto deve falhar fechado em ${table}.`,
    );
    requireMatch(
      errors,
      artifactPaths.up,
      up,
      new RegExp(
        `create policy [a-z0-9_]+ on olli_v2\\.${escaped} for delete to authenticated using \\\(false\\\);`,
      ),
      `POLICY_DENY_DELETE_${table.toUpperCase()}`,
      `DELETE direto deve falhar fechado em ${table}.`,
    );
  }

  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /constraint locations_client_same_organization_fk foreign key \(organization_id, client_id\) references olli_v2\.clients \(organization_id, id\)/,
    'CO_TENANCY_FK',
    'A FK composta de locations deve preservar organization_id + client_id.',
  );
  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /constraint command_ledger_org_idempotency_unique unique \(organization_id, idempotency_key\)/,
    'IDEMPOTENCY_SCOPE',
    'A chave idempotente deve ser única por organização.',
  );
  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /locations_organization_client_idx on olli_v2\.locations \(organization_id, client_id\)/,
    'FK_INDEX_LOCATION_CLIENT',
    'A FK composta de locations precisa de índice de suporte.',
  );
  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /organization_memberships_user_org_active_idx on olli_v2\.organization_memberships \(user_id, organization_id\) where status = 'active'/,
    'MEMBERSHIP_LOOKUP_INDEX',
    'A consulta de membership ativa precisa de índice alinhado.',
  );
  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /constraint organization_memberships_capabilities_unique check/,
    'MEMBERSHIP_CAPABILITIES_UNIQUE',
    'Capabilities devem preservar a semântica uniqueItems do contrato J2.1.',
  );
  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /constraint command_ledger_expected_version_shape check/,
    'EXPECTED_VERSION_CONSTRAINT',
    'A matriz create/update de expected_version deve ser constraint de banco.',
  );
  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /constraint command_ledger_result_shape check/,
    'RESULT_SHAPE_CONSTRAINT',
    'Estados/resultados do ledger devem falhar fechado.',
  );
  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /payload_hash ~ '\^\[0-9a-f\]\{64\}\$'/,
    'PAYLOAD_HASH_CONSTRAINT',
    'O hash do comando deve ser SHA-256 hexadecimal minúsculo.',
  );

  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /create or replace function olli_v2\.has_capability[\s\S]*security invoker[\s\S]*set search_path = ''/,
    'SECURITY_INVOKER_HARDENING',
    'O helper deve usar SECURITY INVOKER e search_path vazio.',
  );
  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /membership\.user_id = \(select auth\.uid\(\)\)/,
    'ACTOR_FROM_SESSION',
    'A membership deve comparar o ator derivado de auth.uid().',
  );
  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /revoke all on function olli_v2\.has_capability\(uuid, text\) from public;/,
    'FUNCTION_REVOKE_PUBLIC',
    'O helper não pode manter EXECUTE público.',
  );
  const securityDefinerCount = [
    ...up.matchAll(/\bsecurity definer\b/g),
  ].length;
  if (securityDefinerCount !== 0) {
    issue(
      errors,
      'SECURITY_DEFINER_COUNT',
      artifactPaths.up,
      `Esta fatia não precisa de SECURITY DEFINER; atual=${securityDefinerCount}.`,
    );
  }
  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /grant execute on function olli_v2\.has_capability\(uuid, text\) to authenticated;/,
    'FUNCTION_MINIMAL_GRANT',
    'O helper deve conceder somente o uso autenticado necessário.',
  );

  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /revoke all on all tables in schema olli_v2 from authenticated;/,
    'TABLE_REVOKE_BASELINE',
    'Privilégios de tabela devem partir de revoke-all.',
  );
  requireMatch(
    errors,
    artifactPaths.up,
    up,
    /grant select on table olli_v2\.organizations, olli_v2\.organization_memberships, olli_v2\.clients, olli_v2\.locations to authenticated;/,
    'READ_GRANT_ALLOWLIST',
    'Somente as quatro tabelas de leitura podem ser concedidas ao authenticated.',
  );
  forbidMatch(
    errors,
    artifactPaths.up,
    up,
    /grant\s+(all|insert|update|delete|truncate|references|trigger)[\s\S]*?to authenticated/,
    'DIRECT_WRITE_GRANT',
    'Authenticated não pode receber escrita direta nesta fatia.',
  );
  forbidMatch(
    errors,
    artifactPaths.up,
    up,
    /\b(drop\s+(schema|table)|disable\s+row\s+level\s+security|grant\s+all|service_role)\b/,
    'UNSAFE_UP_SQL',
    'A migration aditiva contém operação destrutiva, bypass ou grant amplo.',
  );

  requireMatch(
    errors,
    artifactPaths.rollback,
    rollback,
    /^begin;.*v2_commands_enabled = false.*commit;$/s,
    'ROLLBACK_KILL_SWITCH',
    'O rollback deve desligar o caminho V2 dentro de transação.',
  );
  requireMatch(
    errors,
    artifactPaths.rollback,
    rollback,
    /revoke all on all tables in schema olli_v2 from authenticated;/,
    'ROLLBACK_REVOKE_TABLES',
    'O rollback deve remover grants de tabela do authenticated.',
  );
  for (const table of tables) {
    requireMatch(
      errors,
      artifactPaths.rollback,
      rollback,
      new RegExp(`alter table olli_v2\\.${table} force row level security;`),
      `ROLLBACK_RLS_${table.toUpperCase()}`,
      `Rollback deve manter RLS forçada em ${table}.`,
    );
  }
  forbidMatch(
    errors,
    artifactPaths.rollback,
    rollback,
    /\b(drop\s+(schema|table)|truncate|delete\s+from|disable\s+row\s+level\s+security|grant)\b/,
    'UNSAFE_ROLLBACK_SQL',
    'Rollback compensatório não pode apagar dados, desligar RLS ou ampliar grants.',
  );

  requireMatch(
    errors,
    artifactPaths.bootstrap,
    bootstrap,
    /create or replace function auth\.uid\(\)[\s\S]*current_setting\('request\.jwt\.claim\.sub', true\)/,
    'LOCAL_AUTH_STUB',
    'Bootstrap local deve derivar auth.uid() da claim de sessão sintética.',
  );
  requireMatch(
    errors,
    artifactPaths.bootstrap,
    bootstrap,
    /current_database\(\)[\s\S]*\^olli_/,
    'LOCAL_DATABASE_GUARD',
    'Bootstrap SQL deve recusar banco sem prefixo olli_.',
  );
  requireMatch(
    errors,
    artifactPaths.bootstrap,
    bootstrap,
    /(inet_server_addr\(\)|server_address)[\s\S]*127\.0\.0\.0\/8[\s\S]*::1/,
    'LOCAL_SERVER_GUARD',
    'Bootstrap SQL deve recusar servidor fora de loopback.',
  );
  forbidMatch(
    errors,
    artifactPaths.bootstrap,
    bootstrap,
    /security definer|dblink|postgres_fdw|http[s]?:\/\//,
    'UNSAFE_LOCAL_BOOTSTRAP',
    'Bootstrap local não pode elevar função nem acessar rede.',
  );

  const fixtureChecks = [
    {
      pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
      code: 'FIXTURE_EMAIL',
      message: 'Fixture contém formato de e-mail.',
    },
    {
      pattern: /\b(cpf|cnpj|telefone|celular|endereço|endereco)\b/i,
      code: 'FIXTURE_PII_LABEL',
      message: 'Fixture contém campo pessoal proibido.',
    },
    {
      pattern: /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|senha|secret)\b/i,
      code: 'FIXTURE_SECRET',
      message: 'Fixture contém rótulo de segredo.',
    },
    {
      pattern: /https?:\/\//i,
      code: 'FIXTURE_URL',
      message: 'Fixture não pode carregar URL externa.',
    },
  ];
  for (const check of fixtureChecks) {
    forbidMatch(
      errors,
      artifactPaths.fixtures,
      fixtures,
      check.pattern,
      check.code,
      check.message,
    );
  }

  requireMatch(
    errors,
    artifactPaths.assertions,
    assertions,
    /foreign_key_violation/,
    'ASSERT_CROSS_TENANT',
    'Harness deve testar violação de co-tenancy.',
  );
  requireMatch(
    errors,
    artifactPaths.assertions,
    assertions,
    /unique_violation/,
    'ASSERT_IDEMPOTENCY_CONFLICT',
    'Harness deve testar conflito de chave idempotente.',
  );
  requireMatch(
    errors,
    artifactPaths.assertions,
    assertions,
    /membership revogada não autoriza leitura/,
    'ASSERT_REVOKED',
    'Harness deve provar revogação fail-closed.',
  );
  requireMatch(
    errors,
    artifactPaths.rollbackAssertions,
    rollbackAssertions,
    /rollback deve preservar ledger idempotente/,
    'ASSERT_ROLLBACK_LEDGER',
    'Harness deve provar preservação do ledger no rollback.',
  );

  requireMatch(
    errors,
    artifactPaths.runner,
    runner,
    /validateLocalDatabaseUrl/,
    'RUNNER_URL_GUARD',
    'Executor deve validar a URL antes de chamar psql.',
  );
  requireMatch(
    errors,
    artifactPaths.runner,
    runner,
    /allowedHosts/,
    'RUNNER_HOST_ALLOWLIST',
    'Executor deve possuir allowlist de loopback.',
  );
  requireMatch(
    errors,
    artifactPaths.runner,
    runner,
    /\^olli_/,
    'RUNNER_DATABASE_PREFIX',
    'Executor deve exigir banco descartável com prefixo olli_.',
  );
  requireMatch(
    errors,
    artifactPaths.syntaxParser,
    texts.syntaxParser,
    /from pglast import parse_sql/,
    'POSTGRES_PARSER',
    'O recibo gramatical deve usar o parser PostgreSQL pglast.',
  );
  forbidMatch(
    errors,
    artifactPaths.syntaxParser,
    texts.syntaxParser,
    /socket|urllib|requests|psycopg|subprocess/,
    'POSTGRES_PARSER_NETWORK',
    'O parser gramatical deve permanecer offline e sem subprocesso.',
  );
  forbidMatch(
    errors,
    artifactPaths.runner,
    runner,
    /dotenv|process\.env\.(database_url|postgres_url|supabase|pgurl)/i,
    'RUNNER_ENV_DATABASE',
    'Executor não pode descobrir destino em .env/variável de conexão.',
  );
  requireMatch(
    errors,
    artifactPaths.runner,
    runner,
    /!key\.toUpperCase\(\)\.startsWith\('PG'\)/,
    'RUNNER_PG_ENV_STRIP',
    'Executor deve remover variáveis PG* herdadas antes de montar o ambiente local.',
  );

  let parsedPackage;
  try {
    parsedPackage = JSON.parse(texts.packageJson);
  } catch {
    issue(
      errors,
      'PACKAGE_JSON_PARSE',
      artifactPaths.packageJson,
      'package.json inválido.',
    );
  }
  if (parsedPackage) {
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      if (
        parsedPackage[field]
        && Object.keys(parsedPackage[field]).length > 0
      ) {
        issue(
          errors,
          'PACKAGE_EXTERNAL_DEPENDENCY',
          artifactPaths.packageJson,
          `${field} deve permanecer vazio/ausente.`,
        );
      }
    }
  }

  requireMatch(
    errors,
    artifactPaths.readme,
    texts.readme,
    /POSTGRES_EXECUTION_NOT_RUN/,
    'README_EVIDENCE_LEVEL',
    'README deve declarar explicitamente que PostgreSQL ainda não foi executado.',
  );
  requireMatch(
    errors,
    artifactPaths.gaps,
    texts.gaps,
    /comparar `payload_hash`/,
    'GATE_IDEMPOTENCY_SEMANTICS',
    'Os gates devem reservar comparação/replay semântico ao gateway.',
  );
  requireMatch(
    errors,
    artifactPaths.gaps,
    texts.gaps,
    /comparar a versão persistida com `expected_version`/,
    'GATE_OPTIMISTIC_LOCKING',
    'Os gates devem reservar comparação atômica de versão ao gateway.',
  );

  return {
    ok: errors.length === 0,
    errors,
    checkedFiles: Object.keys(artifactPaths).length,
    requiredTables: tables.length,
  };
}

export function validateArtifacts(root = defaultRoot, overrides = {}) {
  return validateTexts(readArtifacts(root, overrides));
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = validateArtifacts();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}
