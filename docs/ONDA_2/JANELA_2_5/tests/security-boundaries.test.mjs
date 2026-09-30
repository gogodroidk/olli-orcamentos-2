import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compareShadow,
  createProjectionEvent,
  projectV2ToLegacy,
} from '../shadow/increment-a-shadow-pilot.mjs';

import {
  FIXTURE_CLIENT_A,
  FIXTURE_ORG_A,
  FIXTURE_SCOPE_CLIENT_A,
  SHADOW_OBSERVED_AT,
  createShadowPilotFixture,
} from '../fixtures/shadow-pilot-fixture.mjs';

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

test('núcleo e fixture não acessam rede, ambiente, subprocesso ou runtime', async () => {
  const sources = [
    await text('shadow/increment-a-shadow-pilot.mjs'),
    await text('fixtures/shadow-pilot-fixture.mjs'),
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

test('imports ficam restritos a node:crypto, J2.1 e pacote local', async () => {
  const files = {
    'shadow/increment-a-shadow-pilot.mjs': [
      'node:crypto',
      '../../JANELA_2_1/contracts/tenancy-contract.mjs',
    ],
    'fixtures/shadow-pilot-fixture.mjs': [
      '../shadow/increment-a-shadow-pilot.mjs',
      '../../JANELA_2_1/fixtures/synthetic.mjs',
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
  const source = await text('fixtures/shadow-pilot-fixture.mjs');
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

test('relatórios, métricas e política não expõem escopo, payload ou PII', () => {
  const { metrics, policyStore } = createShadowPilotFixture();
  const report = compareShadow({
    scope: FIXTURE_SCOPE_CLIENT_A,
    canonical: FIXTURE_CLIENT_A,
    legacy: projectV2ToLegacy('client', FIXTURE_CLIENT_A),
    observed_at: SHADOW_OBSERVED_AT,
  });
  metrics.observe(report);
  const serialized = JSON.stringify({
    report,
    metrics: metrics.snapshot(),
    policy: policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A),
  });
  for (const forbiddenValue of [
    FIXTURE_ORG_A,
    FIXTURE_CLIENT_A.client_id,
    FIXTURE_CLIENT_A.display_name,
  ]) {
    assert.equal(serialized.includes(forbiddenValue), false, forbiddenValue);
  }
  for (const forbiddenKey of [
    'organization_id',
    'aggregate_id',
    'display_name',
    'client_id',
    'payload',
    'event_id',
    'device',
    'actor',
    'lease',
    'message',
    'stack',
  ]) {
    assert.equal(serialized.includes(forbiddenKey), false, forbiddenKey);
  }
});

test('cutover não aceita match fabricado sem projeção interna', () => {
  const { policyStore } = createShadowPilotFixture();
  policyStore.enableShadow(FIXTURE_SCOPE_CLIENT_A, 1);
  const before = policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  assert.throws(
    () => policyStore.cutoverToV2(FIXTURE_SCOPE_CLIENT_A, {
      expected_policy_version: 2,
      canonical_version: 999,
      projection_version: 999,
      shadow_status: 'match',
    }),
    (error) => error?.code === 'validation_failed',
  );
  assert.deepEqual(policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A), before);
});

test('comparação shadow é read-only e nunca repara as entradas', () => {
  const canonical = structuredClone(FIXTURE_CLIENT_A);
  const legacy = structuredClone(projectV2ToLegacy('client', FIXTURE_CLIENT_A));
  const canonicalBefore = structuredClone(canonical);
  const legacyBefore = structuredClone(legacy);
  const report = compareShadow({
    scope: FIXTURE_SCOPE_CLIENT_A,
    canonical,
    legacy: { ...legacy, display_name: 'Valor Sintético Divergente' },
    observed_at: SHADOW_OBSERVED_AT,
  });
  assert.equal(report.status, 'field_mismatch');
  assert.deepEqual(canonical, canonicalBefore);
  assert.deepEqual(legacy, legacyBefore);
});

test('núcleo não escreve logs nem serializa erro bruto', async () => {
  const source = await text('shadow/increment-a-shadow-pilot.mjs');
  for (const forbidden of [
    'console.log',
    'console.error',
    'error.message',
    'error.stack',
    'JSON.stringify(error)',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.match(source, /safe_result/);
  assert.match(source, /cutover_pending_outbox/);
});

test('prova de cutover válida depende da projeção atual do store', () => {
  const { policyStore, projectionStore } = createShadowPilotFixture();
  projectionStore.apply(createProjectionEvent(
    'client',
    FIXTURE_CLIENT_A,
    'event-security-cutover-v1',
  ));
  policyStore.enableShadow(FIXTURE_SCOPE_CLIENT_A, 1);
  const result = policyStore.cutoverToV2(FIXTURE_SCOPE_CLIENT_A, {
    expected_policy_version: 2,
  });
  assert.equal(result.policy.active_writer, 'v2');
  assert.equal(result.shadow_report.status, 'match');
});
