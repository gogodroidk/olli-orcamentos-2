/**
 * Faturamento e demais números de ORÇAMENTO do painel ADM em 3 estados (worker/src/admin.js → metrics).
 *
 *     node worker/scripts/teste-admin-faturamento.js
 * Exit 0 = passou; 1 = falhou.
 *
 * P0 da casa "erro nunca vira vazio": metrics() lia os orçamentos com rest(), que engole a falha e devolve [] — e o painel
 * mostrava "R$ 0,00" / "0 orçamentos" / "0% de ativação" como se fossem verdade. Agora a leitura é lerEstado (3 estados):
 * falha (HTTP 500, 404, corpo que não é lista, rede fora) = `orcamentosEstado:'indisponivel'` e TODO número derivado dos
 * orçamentos é `null` — nunca zero. O que não depende dos orçamentos (contas, novos, atividade) segue saindo.
 */
import assert from 'node:assert/strict';
import { adminHtml } from '../src/adminPagina.js';
import { handleAdmin } from '../src/admin.js';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}

const ADMIN = '11111111-1111-4111-8111-111111111111';
const U1 = 'b0000000-0000-4000-8000-000000000001';
const U2 = 'b0000000-0000-4000-8000-000000000002';
const agora = Date.now();
const iso = (d) => new Date(agora - d * 86400000).toISOString();
const USUARIOS = [
  { id: U1, email: 'um@exemplo.test', created_at: iso(1), last_sign_in_at: iso(0), app_metadata: { provider: 'email' }, user_metadata: {} },
  { id: U2, email: 'dois@exemplo.test', created_at: iso(9), last_sign_in_at: null, app_metadata: { provider: 'email' }, user_metadata: {} },
];
const ORCAMENTOS = [
  { user_id: U1, status: 'aprovado', valor_total: 1000, criado_em: iso(1) },
  { user_id: U1, status: 'aprovado', valor_total: 500, criado_em: iso(1) },
  { user_id: U2, status: 'rascunho', valor_total: 80, criado_em: iso(3) },
];

const env = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_ANON_KEY: 'anon-publica',
  SUPABASE_SERVICE_ROLE_KEY: 'service-secreta',
  ADMIN_EMAIL: 'dono@exemplo.test',
  ADMIN_RL: { limit: async () => ({ success: true }) },
};
const token = () => {
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc({ aal: 'aal2', sub: ADMIN })}.x`;
};

const originalFetch = globalThis.fetch;
let modo = 'ok';
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: ADMIN, email: 'dono@exemplo.test' }), { status: 200 });
  if (url.includes('/auth/v1/admin/users')) return Response.json({ users: USUARIOS });
  if (url.includes('/rest/v1/orcamentos')) {
    if (modo === 'http500') return new Response('{}', { status: 500 });
    if (modo === 'http404') return new Response('{"code":"42P01"}', { status: 404 });
    if (modo === 'nao_lista') return Response.json({ message: 'JWT expired' });
    if (modo === 'rede') throw new TypeError('fetch failed');
    return Response.json(ORCAMENTOS);
  }
  if (url.includes('/rest/v1/funil_exclusoes') || url.includes('/rest/v1/admin_memberships') || url.includes('/rest/v1/assinaturas')) return Response.json([]);
  return Response.json([]);
};

async function metrics() {
  const url = new URL('https://api.exemplo/admin/api/metrics');
  const r = await handleAdmin(new Request(url, { headers: { Authorization: `Bearer ${token()}` } }), env, url);
  return { status: r.status, body: await r.json() };
}

const DERIVADOS = ['orcamentos', 'aprovados', 'conversao', 'faturamento', 'ticket', 'ativados', 'nuncaOrcaram', 'taxaAtivacao'];

console.log('Painel ADM — números de orçamento em 3 estados');
try {
  await caso('leitura OK: os números saem certos e o estado é "ok"', async () => {
    modo = 'ok';
    const { status, body: m } = await metrics();
    assert.equal(status, 200);
    assert.equal(m.orcamentosEstado, 'ok');
    assert.deepEqual([m.orcamentos, m.aprovados, m.conversao, m.faturamento, m.ticket], [3, 2, 67, 1500, 750]);
    assert.deepEqual([m.ativados, m.nuncaOrcaram, m.taxaAtivacao], [2, 0, 100]);
  });

  for (const falha of ['http500', 'http404', 'nao_lista', 'rede']) {
    await caso(`leitura dos orçamentos falhou (${falha}): TUDO derivado vira null e o estado é "indisponivel" — nunca zero`, async () => {
      modo = falha;
      const { status, body: m } = await metrics();
      assert.equal(status, 200, 'o painel continua respondendo (o resto dos números não depende dos orçamentos)');
      assert.equal(m.orcamentosEstado, 'indisponivel');
      for (const campo of DERIVADOS) assert.equal(m[campo], null, `${campo} deveria ser null, veio ${JSON.stringify(m[campo])}`);
      assert.equal(m.faturamento === 0, false, 'faturamento NUNCA pode virar R$ 0 por falha de leitura');
      assert.equal(m.usuarios, 2, 'o que não depende dos orçamentos segue saindo');
      assert.equal(m.novos7, 1);
    });
  }

  await caso('um orçamento realmente ZERADO ainda é zero (não confundir "nenhum" com "não sei")', async () => {
    modo = 'ok';
    const antes = ORCAMENTOS.splice(0, ORCAMENTOS.length); // base sem nenhum orçamento, leitura OK
    try {
      const { body: m } = await metrics();
      assert.equal(m.orcamentosEstado, 'ok');
      assert.deepEqual([m.orcamentos, m.aprovados, m.faturamento, m.ativados, m.taxaAtivacao], [0, 0, 0, 0, 0]);
      assert.equal(m.nuncaOrcaram, 2);
    } finally {
      ORCAMENTOS.push(...antes);
    }
  });

  await caso('a página trata o estado indisponível nos 4 cartões e na lista "Precisa de você" (script compila)', () => {
    const html = adminHtml({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a'.repeat(30) }, 'nonce123', { trocaMesesMax: 12, creditosAjusteMax: 100 });
    const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]).filter((t) => t.length > 1000).join('\n');
    assert.doesNotThrow(() => new Function(script), 'o script da página precisa compilar');
    assert.equal((script.match(/orcamentosEstado[!=]=='indisponivel'/g) ?? []).length >= 5, true, 'os 4 cartões e o alerta tratam o estado');
    assert.ok(script.includes("v:'indisponível'"), 'o cartão diz "indisponível", não um número');
    assert.ok(script.includes('não é R$ 0,00: a leitura falhou'));
  });
} finally {
  globalThis.fetch = originalFetch;
}
console.log(`\nPASSOU: ${ok} casos — números de orçamento do painel ADM em 3 estados`);
