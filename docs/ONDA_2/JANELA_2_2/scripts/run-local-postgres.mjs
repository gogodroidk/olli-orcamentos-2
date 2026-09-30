import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDirectory, '..');

export const allowedHosts = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]);

const orderedFiles = Object.freeze([
  'harness/000_bootstrap_local.sql',
  'sql/001_increment_a_up.sql',
  'harness/010_fixtures.sql',
  'harness/020_assertions.sql',
  'sql/001_increment_a_rollback.sql',
  'harness/030_rollback_assertions.sql',
]);

export function validateLocalDatabaseUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new Error('--database-url é obrigatório.');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL PostgreSQL inválida.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Somente postgres:// ou postgresql:// é permitido.');
  }
  if (!allowedHosts.has(parsed.hostname)) {
    throw new Error('Somente host de loopback é permitido.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Query string e fragmento não são permitidos.');
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/^olli_[a-z0-9_]+$/i.test(database)) {
    throw new Error('O banco descartável deve começar com olli_.');
  }

  const port = parsed.port || '5432';
  const numericPort = Number(port);
  if (
    !Number.isInteger(numericPort)
    || numericPort < 1
    || numericPort > 65535
  ) {
    throw new Error('Porta PostgreSQL inválida.');
  }

  return Object.freeze({
    host: parsed.hostname.replace(/^\[|\]$/g, ''),
    port,
    database,
    username: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
  });
}

export function buildPlan(root = packageRoot) {
  return orderedFiles.map((relativePath) => ({
    relativePath,
    absolutePath: path.join(root, relativePath),
  }));
}

export function parseArguments(argv) {
  let databaseUrl = null;
  let planOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--database-url') {
      if (databaseUrl !== null || index + 1 >= argv.length) {
        throw new Error('Uso inválido de --database-url.');
      }
      databaseUrl = argv[index + 1];
      index += 1;
    } else if (argument === '--plan') {
      planOnly = true;
    } else {
      throw new Error(`Argumento desconhecido: ${argument}`);
    }
  }

  return {
    connection: validateLocalDatabaseUrl(databaseUrl),
    planOnly,
  };
}

export function buildChildEnvironment(
  connection,
  baseEnvironment = process.env,
) {
  const inheritedWithoutPostgres = Object.fromEntries(
    Object.entries(baseEnvironment).filter(
      ([key]) => !key.toUpperCase().startsWith('PG'),
    ),
  );
  const environment = {
    ...inheritedWithoutPostgres,
    PGHOST: connection.host,
    PGPORT: connection.port,
    PGDATABASE: connection.database,
    PGSSLMODE: 'disable',
    PGSERVICE: '',
    PGSERVICEFILE: '',
    PGPASSFILE: '',
    PGPASSWORD: connection.password,
  };

  if (connection.username) {
    environment.PGUSER = connection.username;
  } else {
    delete environment.PGUSER;
  }
  return environment;
}

function assertPsqlAvailable() {
  const probe = spawnSync('psql', ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (probe.error || probe.status !== 0) {
    throw new Error(
      'psql não está disponível; POSTGRES_EXECUTION=NOT_RUN.',
    );
  }
  return (probe.stdout || '').trim();
}

export function runPlan(connection, plan = buildPlan()) {
  const psqlVersion = assertPsqlAvailable();
  const environment = buildChildEnvironment(connection);

  for (const entry of plan) {
    const result = spawnSync(
      'psql',
      [
        '--no-psqlrc',
        '--no-password',
        '--set',
        'ON_ERROR_STOP=1',
        '--file',
        entry.absolutePath,
      ],
      {
        cwd: packageRoot,
        env: environment,
        stdio: 'inherit',
        windowsHide: true,
      },
    );
    if (result.error || result.status !== 0) {
      throw new Error(
        `Falha no arquivo ${entry.relativePath}; exit=${result.status ?? 'spawn-error'}.`,
      );
    }
  }

  return {
    ok: true,
    psqlVersion,
    filesExecuted: plan.length,
    postgresExecution: 'PASS',
    rollbackAssertions: 'PASS',
  };
}

export function safePlanSummary(connection, plan = buildPlan()) {
  return {
    mode: 'PLAN_ONLY',
    target: {
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username || '(default-local-user)',
    },
    files: plan.map((entry) => entry.relativePath),
    passwordPrinted: false,
  };
}

export function main(argv = process.argv.slice(2)) {
  const { connection, planOnly } = parseArguments(argv);
  const plan = buildPlan();

  if (planOnly) {
    console.log(JSON.stringify(safePlanSummary(connection, plan), null, 2));
    return;
  }

  const result = runPlan(connection, plan);
  console.log(JSON.stringify(result, null, 2));
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
