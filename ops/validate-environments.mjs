import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('./olli-environments.json', import.meta.url), 'utf8'));
const requiredEnvironments = ['local', 'staging', 'production'];
const requiredStages = [
  'local-quality',
  'staging-schema',
  'staging-worker',
  'staging-smoke',
  'security-review',
  'human-approval',
  'production-worker',
  'production-web',
  'post-deploy-health',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.schemaVersion === 1, 'schemaVersion precisa ser 1');
assert(manifest.product === 'OLLI Orçamentos', 'marca canônica divergente');
for (const name of requiredEnvironments) {
  assert(manifest.environments?.[name], `ambiente ausente: ${name}`);
}
assert(JSON.stringify(manifest.promotionOrder) === JSON.stringify(requiredStages), 'ordem de promoção divergente');
assert(manifest.environments.staging.supabaseProjectRef !== manifest.environments.production.supabaseProjectRef, 'staging não pode apontar para produção');
assert(manifest.environments.staging.cloudflareWorker !== manifest.environments.production.cloudflareWorker, 'Worker staging não pode ser o de produção');
assert(manifest.environments.staging.cloudflareRoutes.length === 0, 'staging não pode declarar rota pública de produção');
assert(manifest.environments.staging.acceptedReal === false, 'staging começa sem aceite real');
assert(manifest.environments.production.acceptedReal === false, 'produção não pode ser aceita por configuração');
assert(manifest.environments.staging.baselineStatus !== 'ready', 'baseline staging não pode ser promovido sem revisão');
assert(manifest.environments.staging.requiredSecretNames.every((name) => /^[A-Z0-9_]+$/.test(name)), 'secret name inválido');
for (const required of ['SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY', 'RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
  assert(manifest.environments.staging.requiredSecretNames.includes(required), `secret de runtime ausente no contrato: ${required}`);
}

console.log('Environment manifest: OK');
console.log(`Promotion stages: ${manifest.promotionOrder.join(' -> ')}`);
console.log(`Staging Supabase: ${manifest.environments.staging.supabaseProjectRef} (${manifest.environments.staging.supabaseRegion})`);
console.log(`Production remains gated: acceptedReal=${manifest.environments.production.acceptedReal}`);
