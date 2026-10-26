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
 * DEPOIS. Rode a partir de worker/:  node reparar.mjs  [--dry-run] [--forcar]
 *
 * Nada de segredo é impresso. Lê o cofre e a Management API do Supabase.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Cofre local (ARSENAL). OLLI_COFRE sobrepõe; o padrão segue a pasta do usuário, então vale no
// Linux (/home/igor/...) e no Windows antigo (C:\\Users\\ADMIN\\...) sem caminho fixo.
// --dry-run: só confere o cofre e lista os secrets que seriam restaurados (sem deploy, sem PUT).
const COFRE = process.env.OLLI_COFRE || join(homedir(), 'Desktop', 'CONFIG CLAUDE', 'credenciais-locais.env');
const DRY_RUN = process.argv.includes('--dry-run');
if (!existsSync(COFRE)) {
  console.error(`Cofre não encontrado: ${COFRE} (defina OLLI_COFRE). Nada foi feito.`);
  process.exit(1);
}
const env = {};
for (const linha of readFileSync(COFRE, 'utf8').split(/\r?\n/)) {
  if (!linha || linha.startsWith('#') || !linha.includes('=')) continue;
  const i = linha.indexOf('=');
  env[linha.slice(0, i).trim()] = linha.slice(i + 1).trim().replace(/^"|"$/g, '');
}
// O que não está no cofre pode vir do ambiente (~/.config/olli/env.sh, carregado pelo ~/.profile):
// é onde mora o SUPABASE_ACCESS_TOKEN no Linux. O cofre continua tendo prioridade.
for (const [k, v] of Object.entries(process.env)) if (!(k in env) && v) env[k] = v;
// Token Cloudflare: o do cofre pode não ter acesso ao worker (26/10: "No access to the specified
// resource"); o do ambiente (env.sh) tem. Usa o primeiro par token+conta que LÊ os secrets do
// worker. Sem nenhum, aborta ANTES do deploy: deploy sem conseguir repor secrets derruba o worker.
const pares = [
  [process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID, 'ambiente'],
  [env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_ACCOUNT_ID, 'cofre'],
].filter(([t, a]) => t && a);
let TOK, ACC, BASE, atuais;
for (const [t, a, origem] of pares) {
  const base = `https://api.cloudflare.com/client/v4/accounts/${a}/workers/scripts/olli-diagnostico`;
  const r = await fetch(base + '/secrets', { headers: { Authorization: `Bearer ${t}` } });
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.success) {
    [TOK, ACC, BASE] = [t, a, base];
    atuais = new Set(j.result.map((s) => s.name));
    console.log(`[0] token Cloudflare do ${origem}: lê ${atuais.size} secrets do worker`);
    break;
  }
  console.log(`[0] token Cloudflare do ${origem}: HTTP ${r.status} ${j.errors?.[0]?.message || ''}`);
}
if (!TOK) {
  console.error('Nenhum token Cloudflare com acesso ao olli-diagnostico. Nada foi feito.');
  process.exit(1);
}

async function cf(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { Authorization: `Bearer ${TOK}`, ...(opts.headers || {}) },
  });
  return { status: r.status, body: await r.text() };
}

// 1) DEPLOY (apaga os secrets — por isso vem antes)
if (!DRY_RUN) {
console.log('[1] wrangler deploy…');
execFileSync('npx', ['wrangler', 'deploy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, CLOUDFLARE_API_TOKEN: TOK, CLOUDFLARE_ACCOUNT_ID: ACC },
});
}

// 2) SERVICE_ROLE via Management API do Supabase
const supTok = env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_MANAGEMENT_TOKEN || env.SUPABASE_PAT;
let serviceRole = null;
if (supTok) {
  const r = await fetch('https://api.supabase.com/v1/projects/yiaeplqinnnnniyvwtls/api-keys?reveal=true', {
    headers: { Authorization: `Bearer ${supTok}`, 'User-Agent': 'Mozilla/5.0' },
  });
  if (r.ok) serviceRole = (await r.json()).find((k) => k.name === 'service_role')?.api_key;
}

// 2b) RESEND_WEBHOOK_SECRET: o cofre não guarda; lê o signing secret do webhook via API do Resend.
// Sem ele /resend/webhook responde 503 (bounce/complaint não chegam).
let resendWebhookSecret = env.RESEND_WEBHOOK_SECRET || null;
if (!resendWebhookSecret && env.RESEND_API_KEY_LEITURA) {
  const r = await fetch('https://api.resend.com/webhooks/4452c68a-9716-497e-9772-7f1a3e87b39d', {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY_LEITURA}` },
  });
  if (r.ok) resendWebhookSecret = (await r.json()).signing_secret || null;
}

// 3) SECRETS (depois do deploy)
const secrets = [
  ['SUPABASE_SERVICE_ROLE_KEY', serviceRole],
  ['STRIPE_SECRET_KEY', env.STRIPE_SECRET_KEY],
  ['STRIPE_WEBHOOK_SECRET', env.OLLI_STRIPE_WEBHOOK_SECRET],
  // Chave EXCLUSIVA do OLLI. Não reutiliza OPENROUTER_API_KEY do cérebro/CCR:
  // uma automação não deve ampliar o raio de impacto da outra.
  ['OPENROUTER_API_KEY', env.OLLI_OPENROUTER_API_KEY],
  // Mantida apenas para rollback deliberado com AI_PROVIDER=gemini.
  ['GEMINI_API_KEY', env.OLLI_GEMINI_API_KEY],
  // Fail-closed (mesma regra que admin.js aplica em runtime): se o cofre não tem
  // OLLI_ADMIN_EMAIL, NÃO restaura com um e-mail fixo — um fallback hardcoded aqui
  // já concedeu o painel de TODOS os tenants a esse e-mail sempre que o cofre
  // faltasse. `valor` undefined cai no "SEM VALOR NO COFRE" do loop abaixo (avisa
  // e segue) em vez de recriar o secret com um valor fixo.
  ['ADMIN_EMAIL', env.OLLI_ADMIN_EMAIL],
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
  // Send Email Hook do Supabase Auth (`v1,whsec_...`): o MESMO valor gravado em
  // hook_send_email_secrets no Supabase. Sem ele, /auth/email-hook responde 503
  // e nenhum e-mail de login/cadastro/recuperação sai.
  ['SEND_EMAIL_HOOK_SECRET', env.SEND_EMAIL_HOOK_SECRET],
  ['RESEND_WEBHOOK_SECRET', resendWebhookSecret],
  // Link de descadastro dos e-mails (HMAC); sem ele o link sai inválido.
  ['EMAIL_DESCADASTRO_SECRET', env.EMAIL_DESCADASTRO_SECRET],
  // Chave de ENVIO da Resend (a de LEITURA só serve para o 2b acima).
  ['RESEND_API_KEY', env.RESEND_API_KEY_ENVIO],
  // Service account olli-play-verify: o cofre guarda o CAMINHO do JSON; o secret é o conteúdo.
  // Arquivo ausente = sem valor (nunca envia o caminho como se fosse o JSON).
  ['PLAY_SA_JSON', env.OLLI_PLAY_VERIFY_SA_JSON && existsSync(env.OLLI_PLAY_VERIFY_SA_JSON)
    ? readFileSync(env.OLLI_PLAY_VERIFY_SA_JSON, 'utf8').trim() : null],
  ['PLAY_TESTE_PERMITIDOS', env.PLAY_TESTE_PERMITIDOS],
];
if (env.OLLI_PLAY_VERIFY_SA_JSON && !existsSync(env.OLLI_PLAY_VERIFY_SA_JSON)) {
  console.log(`    PLAY_SA_JSON: arquivo do cofre não existe (${env.OLLI_PLAY_VERIFY_SA_JSON})`);
}
// Só repõe o que FALTA no worker agora (depois do deploy); o que já está lá não é sobrescrito,
// para um mapeamento errado do cofre não trocar um secret bom. --forcar regrava todos.
const FORCAR = process.argv.includes('--forcar');
async function lerAtuais() {
  const j = await cf('/secrets').then((r) => JSON.parse(r.body)).catch(() => ({}));
  return j.success ? new Set(j.result.map((s) => s.name)) : null;
}
if (!DRY_RUN) {
  // A lista de antes do deploy não vale mais: se a releitura falhar, repõe TUDO que tem valor
  // (pior caso = regravar um secret igual; o contrário deixaria o worker sem nenhum).
  atuais = await lerAtuais();
  if (!atuais) {
    console.log('    releitura de /secrets falhou depois do deploy: repondo todos os que têm valor');
    atuais = new Set();
  }
}
const cobertos = new Set(secrets.map(([nome]) => nome));
const fora = [...atuais].filter((n) => !cobertos.has(n));
if (fora.length) console.log(`    no worker e FORA desta lista (não repostos): ${fora.join(', ')}`);
console.log('[2] secrets…');
for (const [nome, valor] of secrets) {
  if (atuais.has(nome) && !FORCAR) { console.log(`    ${nome.padEnd(28)} já no worker (mantido)${valor ? '' : ' — SEM VALOR NO COFRE'}`); continue; }
  if (!valor) { console.log(`    ${nome.padEnd(28)} ${atuais.has(nome) ? 'SEM VALOR NO COFRE (mantido)' : 'FALTA NO WORKER E SEM VALOR NO COFRE'}`); if (!atuais.has(nome)) process.exitCode = 1; continue; }
  if (DRY_RUN) { console.log(`    ${nome.padEnd(28)} seria reposto (${valor.length} chars) — dry-run, não enviado`); continue; }
  const { status } = await cf('/secrets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, text: valor, type: 'secret_text' }),
  });
  console.log(`    ${nome.padEnd(28)} ${status === 200 ? 'ok' : 'HTTP ' + status} (${valor.length} chars)`);
  if (status !== 200) process.exitCode = 1;
}

if (DRY_RUN) {
  console.log(`\nDry-run: cofre ${COFRE} lido; nenhum deploy nem secret enviado.`);
  process.exit(0);
}

// Conferência: todo secret que tem valor no cofre precisa estar no worker agora.
const depois = await lerAtuais();
const faltando = depois ? secrets.filter(([nome, valor]) => valor && !depois.has(nome)).map(([n]) => n) : ['(releitura falhou)'];
if (faltando.length) {
  console.log(`    FALTANDO no worker depois da reposição: ${faltando.join(', ')}`);
  process.exitCode = 1;
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
if (j.ia !== 'on' || o.status !== 404) process.exitCode = 1;

console.log('\nSe ia:off ou /o/ deu 503, espere mais 30s e rode de novo só a prova.');
console.log('LEMBRETE: isto se repete a cada push na main até o Workers Build por Git ser DESATIVADO no dashboard.');
