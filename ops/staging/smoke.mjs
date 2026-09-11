#!/usr/bin/env node

/** Smoke remoto do Worker staging sem dados de negócio ou side effects. */
const baseUrl = (process.env.OLLI_STAGING_WORKER_URL ||
  'https://olli-diagnostico-staging.igoreluisa.workers.dev').replace(/\/$/, '');
const checks = [
  { name: 'health', method: 'GET', path: '/', status: 200 },
  { name: 'cors-preflight', method: 'OPTIONS', path: '/', status: 204 },
  { name: 'resend-method-gate', method: 'GET', path: '/resend/webhook', status: 405 },
  { name: 'ia-actions-method-gate', method: 'GET', path: '/ia/acoes/', status: 405 },
  { name: 'ia-importacao-method-gate', method: 'GET', path: '/ia/importacao/preview', status: 405 },
  { name: 'admin-login-shell', method: 'GET', path: '/admin', status: 200 },
];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const results = [];
for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, { method: check.method, redirect: 'manual' });
  const body = await response.text();
  assert(response.status === check.status, `${check.name}: esperado HTTP ${check.status}, recebido ${response.status}`);
  if (check.name === 'health') {
    const payload = JSON.parse(body);
    assert(payload.ok === true, 'health: payload sem ok=true');
    assert(payload.service === 'olli-diagnostico', 'health: serviço divergente');
    assert(payload.ia === 'off', 'health: staging não está com IA pública desligada');
  }
  if (check.name === 'admin-login-shell') assert(body.includes('noindex,nofollow'), 'admin: shell não está noindex');
  results.push({ name: check.name, status: response.status });
}
const url = new URL(baseUrl);
assert(url.hostname.endsWith('.workers.dev'), `isolamento: URL inesperada para staging (${url.hostname})`);
console.log(JSON.stringify({ ok: true, baseUrl, isolation: 'workers.dev/no-production-routes', checks: results, sideEffects: 'none' }, null, 2));
