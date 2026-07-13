#!/usr/bin/env node
/**
 * Repara o `olli-diagnostico` depois que o Workers Build por Git o derruba.
 *
 * ENQUANTO o Workers Build por Git não for desativado no dashboard (passo humano —
 * a API de builds recusa o token), TODO push na `main` republica este worker como
 * um servidor de ASSETS (sem módulo JS, sem bindings, sem secrets): `GET /` passa a
 * devolver o HTML do site e o webhook da Stripe vira 404. Este script desfaz isso.
 *
 * Ordem que importa: `wrangler deploy` PRIMEIRO (ele apaga os secrets), secrets
 * DEPOIS. Rode a partir de worker/:  node reparar.mjs
 *
 * Nada de segredo é impresso. Lê o cofre e a Management API do Supabase.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const COFRE = 'C:\\Users\\ADMIN\\Desktop\\CONFIG CLAUDE\\credenciais-locais.env';
const env = {};
for (const linha of readFileSync(COFRE, 'utf8').split(/\r?\n/)) {
  if (!linha || linha.startsWith('#') || !linha.includes('=')) continue;
  const i = linha.indexOf('=');
  env[linha.slice(0, i).trim()] = linha.slice(i + 1).trim().replace(/^"|"$/g, '');
}
const TOK = env.CLOUDFLARE_API_TOKEN;
const ACC = env.CLOUDFLARE_ACCOUNT_ID;
const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACC}/workers/scripts/olli-diagnostico`;

async function cf(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { Authorization: `Bearer ${TOK}`, ...(opts.headers || {}) },
  });
  return { status: r.status, body: await r.text() };
}

// 1) DEPLOY (apaga os secrets — por isso vem antes)
console.log('[1] wrangler deploy…');
execFileSync('npx', ['wrangler', 'deploy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, CLOUDFLARE_API_TOKEN: TOK, CLOUDFLARE_ACCOUNT_ID: ACC },
});

// 2) SERVICE_ROLE via Management API do Supabase
const supTok = env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_MANAGEMENT_TOKEN || env.SUPABASE_PAT;
let serviceRole = null;
if (supTok) {
  const r = await fetch('https://api.supabase.com/v1/projects/yiaeplqinnnnniyvwtls/api-keys?reveal=true', {
    headers: { Authorization: `Bearer ${supTok}`, 'User-Agent': 'Mozilla/5.0' },
  });
  if (r.ok) serviceRole = (await r.json()).find((k) => k.name === 'service_role')?.api_key;
}

// 3) SECRETS (depois do deploy)
const secrets = [
  ['SUPABASE_SERVICE_ROLE_KEY', serviceRole],
  ['STRIPE_SECRET_KEY', env.STRIPE_SECRET_KEY],
  ['STRIPE_WEBHOOK_SECRET', env.OLLI_STRIPE_WEBHOOK_SECRET],
  ['GEMINI_API_KEY', env.OLLI_GEMINI_API_KEY],
  // Fail-closed (mesma regra que admin.js aplica em runtime): se o cofre não tem
  // OLLI_ADMIN_EMAIL, NÃO restaura com um e-mail fixo — um fallback hardcoded aqui
  // já concedeu o painel de TODOS os tenants a esse e-mail sempre que o cofre
  // faltasse. `valor` undefined cai no "SEM VALOR NO COFRE" do loop abaixo (avisa
  // e segue) em vez de recriar o secret com um valor fixo.
  ['ADMIN_EMAIL', env.OLLI_ADMIN_EMAIL],
  ['OLLI_ROUTES_API_KEY', env.OLLI_ROUTES_API_KEY],
  // Pix AbacatePay: chave da API (v2) + secret do webhook (a defesa real do
  // /abacate/webhook — o mesmo valor precisa estar registrado no dashboard da
  // AbacatePay como ?webhookSecret=). Ambos vêm do cofre.
  ['ABACATEPAY_API_KEY', env.ABACATEPAY_API_KEY],
  ['ABACATE_WEBHOOK_SECRET', env.ABACATE_WEBHOOK_SECRET],
  // Mercado Pago (gateway único de produção): access token da conta + secret do
  // webhook (o "Assinatura secreta" configurado no painel do MP, usado no HMAC do
  // x-signature). Ambos vêm do cofre.
  ['MP_ACCESS_TOKEN', env.MP_ACCESS_TOKEN],
  ['MP_WEBHOOK_SECRET', env.MP_WEBHOOK_SECRET],
];
console.log('[2] secrets…');
for (const [nome, valor] of secrets) {
  if (!valor) { console.log(`    ${nome.padEnd(28)} SEM VALOR NO COFRE`); continue; }
  const { status } = await cf('/secrets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, text: valor, type: 'secret_text' }),
  });
  console.log(`    ${nome.padEnd(28)} ${status === 200 ? 'ok' : 'HTTP ' + status} (${valor.length} chars)`);
}

// 4) PROVA (após propagação)
console.log('[3] aguardando propagação (35s)…');
await new Promise((r) => setTimeout(r, 35000));
const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/126';
const health = await fetch('https://diagnostico.olliorcamentos.online/', { headers: { 'User-Agent': UA } });
const j = await health.json().catch(() => ({}));
console.log(`    GET /  -> ia:${j.ia}  (esperado: on)`);
const o = await fetch('https://diagnostico.olliorcamentos.online/o/abcdefghijklmnopqrstuvwxyz012345', { headers: { 'User-Agent': UA } });
console.log(`    GET /o/<inexistente> -> ${o.status} (esperado 404; 503 = service_role faltando)`);

console.log('\nSe ia:off ou /o/ deu 503, espere mais 30s e rode de novo só a prova.');
console.log('LEMBRETE: isto se repete a cada push na main até o Workers Build por Git ser DESATIVADO no dashboard.');
