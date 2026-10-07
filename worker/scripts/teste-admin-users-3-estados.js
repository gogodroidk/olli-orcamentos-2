/**
 * Lista de usuários do painel ADM em 3 estados (worker/src/admin.js → users).
 *
 *     node worker/scripts/teste-admin-users-3-estados.js
 * Exit 0 = passou; 1 = falhou.
 *
 * P0 da casa "erro nunca vira vazio": users() lia empresa, orçamentos e assinaturas com rest(), que devolve [] em QUALQUER
 * falha. Se as assinaturas não carregavam, TODO usuário saía plano:'gratis' (e o segmento Pagantes ficava vazio); se os
 * orçamentos não carregavam, todos saíam faturamento:0 e "Nunca orçaram". Agora cada fonte é lida por lerEstado:
 * fonte ilegível => os campos dela vão `null` e `fontes.<fonte>:'indisponivel'`; a página mostra aviso e não classifica
 * ninguém como grátis / sem orçamento. As outras fontes seguem saindo.
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
const PAGANTE = 'b0000000-0000-4000-8000-000000000001';
const GRATIS = 'b0000000-0000-4000-8000-000000000002';
const agora = Date.now();
const iso = (d) => new Date(agora - d * 86400000).toISOString();
const futuro = new Date(agora + 20 * 86400000).toISOString();
const USUARIOS = [
  { id: PAGANTE, email: 'pagante@exemplo.test', created_at: iso(40), last_sign_in_at: iso(1), app_metadata: { provider: 'email' }, user_metadata: {} },
  { id: GRATIS, email: 'gratis@exemplo.test', created_at: iso(3), last_sign_in_at: iso(1), app_metadata: { provider: 'email' }, user_metadata: {} },
];
const EMPRESAS = [{ user_id: PAGANTE, dados: { nome: 'Frio Bom', cidade: 'Santos', estado: 'SP' } }];
const ORCAMENTOS = [
  { user_id: PAGANTE, status: 'aprovado', valor_total: 1000 },
  { user_id: PAGANTE, status: 'aprovado', valor_total: 500 },
];
const ASSINATURAS = [
  { user_id: PAGANTE, plano: 'pro', status: 'active', current_period_end: futuro, stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1' },
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
// falha por fonte: { empresa: 'http500' | 'nao_lista' | 'rede' | undefined, ... }
let falha = {};
function responder(fonte, dados) {
  const modo = falha[fonte];
  if (modo === 'http500') return new Response('{}', { status: 500 });
  if (modo === 'http404') return new Response('{"code":"42P01"}', { status: 404 });
  if (modo === 'nao_lista') return Response.json({ message: 'JWT expired' });
  if (modo === 'rede') throw new TypeError('fetch failed');
  return Response.json(dados);
}
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: ADMIN, email: 'dono@exemplo.test' }), { status: 200 });
  if (url.includes('/auth/v1/admin/users')) return Response.json({ users: USUARIOS });
  if (url.includes('/rest/v1/empresa')) return responder('empresa', EMPRESAS);
  if (url.includes('/rest/v1/orcamentos')) return responder('orcamentos', ORCAMENTOS);
  if (url.includes('/rest/v1/assinaturas')) return responder('assinaturas', ASSINATURAS);
  return Response.json([]);
};

async function usuarios() {
  const url = new URL('https://api.exemplo/admin/api/users');
  const r = await handleAdmin(new Request(url, { headers: { Authorization: `Bearer ${token()}` } }), env, url);
  const body = await r.json();
  return { status: r.status, body, por: (id) => body.users.find((u) => u.id === id) };
}

console.log('Painel ADM — lista de usuários em 3 estados');
try {
  await caso('tudo legível: plano, orçamentos e faturamento saem certos e fontes = ok', async () => {
    falha = {};
    const { status, body, por } = await usuarios();
    assert.equal(status, 200);
    assert.deepEqual(body.fontes, { empresa: 'ok', orcamentos: 'ok', assinaturas: 'ok' });
    const p = por(PAGANTE);
    assert.deepEqual([p.plano, p.planoOrigem, p.orcamentos, p.aprovados, p.faturamento, p.empresa], ['pro', 'pagamento', 2, 2, 1500, 'Frio Bom']);
    const g = por(GRATIS);
    assert.deepEqual([g.plano, g.planoOrigem, g.orcamentos, g.faturamento], ['gratis', 'gratis', 0, 0]);
  });

  for (const modo of ['http500', 'http404', 'nao_lista', 'rede']) {
    await caso(`assinaturas falhou (${modo}): plano/origem null para TODOS, nunca 'gratis'; o resto segue`, async () => {
      falha = { assinaturas: modo };
      const { status, body, por } = await usuarios();
      assert.equal(status, 200);
      assert.deepEqual(body.fontes, { empresa: 'ok', orcamentos: 'ok', assinaturas: 'indisponivel' });
      for (const id of [PAGANTE, GRATIS]) {
        const u = por(id);
        assert.equal(u.plano, null, 'plano deveria ser null');
        assert.equal(u.planoOrigem, null, 'planoOrigem deveria ser null');
        assert.notEqual(u.plano, 'gratis');
      }
      assert.equal(por(PAGANTE).faturamento, 1500, 'orçamentos legíveis continuam saindo');
      assert.equal(por(PAGANTE).empresa, 'Frio Bom');
    });

    await caso(`orçamentos falhou (${modo}): orçamentos/aprovados/faturamento null, nunca 0; o plano segue`, async () => {
      falha = { orcamentos: modo };
      const { body, por } = await usuarios();
      assert.deepEqual(body.fontes, { empresa: 'ok', orcamentos: 'indisponivel', assinaturas: 'ok' });
      for (const id of [PAGANTE, GRATIS]) {
        const u = por(id);
        assert.equal(u.orcamentos, null);
        assert.equal(u.aprovados, null);
        assert.equal(u.faturamento, null);
      }
      assert.equal(por(PAGANTE).planoOrigem, 'pagamento', 'assinaturas legíveis continuam saindo');
    });

    await caso(`empresa falhou (${modo}): a fonte é sinalizada e o resto segue`, async () => {
      falha = { empresa: modo };
      const { body, por } = await usuarios();
      assert.deepEqual(body.fontes, { empresa: 'indisponivel', orcamentos: 'ok', assinaturas: 'ok' });
      assert.equal(por(PAGANTE).planoOrigem, 'pagamento');
      assert.equal(por(PAGANTE).faturamento, 1500);
    });
  }

  await caso('as três fontes fora ao mesmo tempo: tudo indisponível, painel responde 200 e a lista de contas segue', async () => {
    falha = { empresa: 'http500', orcamentos: 'http500', assinaturas: 'http500' };
    const { status, body } = await usuarios();
    assert.equal(status, 200);
    assert.deepEqual(body.fontes, { empresa: 'indisponivel', orcamentos: 'indisponivel', assinaturas: 'indisponivel' });
    assert.equal(body.users.length, 2);
    assert.equal(body.users.some((u) => u.plano === 'gratis' || u.faturamento === 0), false);
  });

  await caso('"nenhum orçamento / nenhuma assinatura" REAL (leitura OK, tabela vazia) continua sendo grátis e zero', async () => {
    falha = {};
    const o = ORCAMENTOS.splice(0, ORCAMENTOS.length);
    const a = ASSINATURAS.splice(0, ASSINATURAS.length);
    try {
      const { body, por } = await usuarios();
      assert.deepEqual(body.fontes, { empresa: 'ok', orcamentos: 'ok', assinaturas: 'ok' });
      assert.deepEqual([por(PAGANTE).plano, por(PAGANTE).orcamentos, por(PAGANTE).faturamento], ['gratis', 0, 0]);
    } finally {
      ORCAMENTOS.push(...o);
      ASSINATURAS.push(...a);
    }
  });

  await caso('a página: compila, mostra "plano indisponível", aviso por fonte e não conta segmentos sem fonte', () => {
    const html = adminHtml({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a'.repeat(30) }, 'nonce123', { trocaMesesMax: 12, creditosAjusteMax: 100 });
    const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]).filter((t) => t.length > 1000).join('\n');
    assert.doesNotThrow(() => new Function(script), 'o script da página precisa compilar');
    assert.ok(script.includes('plano indisponível'), 'pílula do plano sem leitura');
    assert.ok(script.includes("FONTES[f[0]]==='indisponivel'"), 'aviso por fonte');
    assert.ok(script.includes('fonteIndisp(s[0])'), 'segmentos dependentes de fonte ilegível não são contados');
    assert.ok(script.includes("u=>u.orcamentos===0"), '"Nunca orçaram" só vale com orçamento === 0 (null = não sei)');
    assert.equal(script.includes("u=>!u.orcamentos"), false, 'nunca pode voltar a tratar null como "nunca orçou"');
  });
} finally {
  globalThis.fetch = originalFetch;
}
console.log(`\nPASSOU: ${ok} casos — lista de usuários do painel ADM em 3 estados`);
