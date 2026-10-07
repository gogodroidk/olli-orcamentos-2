/**
 * Contas INTERNAS no painel ADM — o que o worker faz (worker/src/admin.js + contasInternas.js).
 *
 *     node worker/scripts/teste-contas-internas-admin.js
 * Exit 0 = passou; 1 = falhou.
 *
 * O SQL (prévia, confirmação, salvaguarda, desfazer) é provado em Postgres real em scripts/teste-contas-internas.ts.
 * Aqui se prende o que o worker faz com ele:
 *  - métricas e lista: conta interna NÃO entra em nenhum número; lista de internas ilegível = escopo
 *    'indeterminado' (nunca "só clientes" em silêncio);
 *  - a receita continua vendo as internas (plano delas cai em "manuais", não some);
 *  - rotas de organização exigem MFA, validam o corpo, repassam a CONFIRMAÇÃO e o autor ao banco, auditam,
 *    e recusa por prévia desatualizada NÃO audita nem marca.
 */
import assert from 'node:assert/strict';
import { handleAdmin } from '../src/admin.js';
import { montarPreviaOrg, particionarContas, soDeClientes, validarPedidoOrg } from '../src/contasInternas.js';
import { contextoContasInternas } from '../src/assinaturasPagantes.js';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}

const ADMIN = '11111111-1111-4111-8111-111111111111';
const IGOR = 'a0000000-0000-4000-8000-000000000001';
const LUISA = 'a0000000-0000-4000-8000-000000000002';
const CLI1 = 'b0000000-0000-4000-8000-000000000001';
const CLI2 = 'b0000000-0000-4000-8000-000000000002';
const DONO_ENV = 'c0000000-0000-4000-8000-000000000003'; // e-mail = ADMIN_EMAIL (interna "dono")
const ORG = 'd0000000-0000-4000-8000-000000000001';

const agora = Date.now();
const iso = (d) => new Date(agora - d * 86400000).toISOString();
const USUARIOS = [
  { id: IGOR, email: 'igor@interno.test', created_at: iso(2), last_sign_in_at: iso(1), app_metadata: { provider: 'email' }, user_metadata: {}, email_confirmed_at: iso(2) },
  { id: LUISA, email: 'luisa@interno.test', created_at: iso(3), last_sign_in_at: iso(1), app_metadata: { provider: 'email' }, user_metadata: {}, email_confirmed_at: iso(3) },
  { id: CLI1, email: 'cliente1@exemplo.test', created_at: iso(1), last_sign_in_at: iso(0), app_metadata: { provider: 'google' }, user_metadata: {}, email_confirmed_at: iso(1) },
  { id: CLI2, email: 'cliente2@exemplo.test', created_at: iso(10), last_sign_in_at: null, app_metadata: { provider: 'email' }, user_metadata: {}, email_confirmed_at: iso(10) },
  { id: DONO_ENV, email: 'dono@exemplo.test', created_at: iso(20), last_sign_in_at: iso(1), app_metadata: { provider: 'email' }, user_metadata: {}, email_confirmed_at: iso(20) },
];
const ORCAMENTOS = [
  { user_id: IGOR, status: 'aprovado', valor_total: 1000, criado_em: iso(1) },
  { user_id: IGOR, status: 'rascunho', valor_total: 50, criado_em: iso(1) },
  { user_id: LUISA, status: 'aprovado', valor_total: 2000, criado_em: iso(1) },
  { user_id: CLI1, status: 'aprovado', valor_total: 300, criado_em: iso(0) },
  { user_id: CLI2, status: 'rascunho', valor_total: 80, criado_em: iso(5) },
];
const CLIENTES_CRM = [{ id: 'x1', user_id: IGOR }, { id: 'x2', user_id: IGOR }, { id: 'x3', user_id: CLI1 }];
const ATIVIDADES = [
  { user_id: IGOR, id: 1, evento: 'login', plataforma: 'web', criado_em: iso(0) },
  { user_id: CLI1, id: 2, evento: 'login', plataforma: 'web', criado_em: iso(0) },
];
// Igor tem um plano PAGO de teste (Pix do dono): não é receita.
const ASSINATURAS = [{ user_id: IGOR, plano: 'pro', status: 'active', current_period_end: new Date(agora + 20 * 86400000).toISOString(), stripe_subscription_id: 'sub_real_1', stripe_customer_id: 'cus_1' }];

const env = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_ANON_KEY: 'anon-publica',
  SUPABASE_SERVICE_ROLE_KEY: 'service-secreta',
  ADMIN_EMAIL: ' Dono@Exemplo.test ',
  ADMIN_RL: { limit: async () => ({ success: true }) },
};
function token(aal) {
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc({ aal, sub: ADMIN })}.x`;
}

const originalFetch = globalThis.fetch;
let modo = 'ok';
let chamadas = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const metodo = init.method || 'GET';
  const corpo = init.body ? JSON.parse(String(init.body)) : null;
  if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: ADMIN, email: 'dono@exemplo.test' }), { status: 200 });
  if (url.includes('/auth/v1/admin/users')) return Response.json({ users: USUARIOS });
  if (url.includes('/rest/v1/')) chamadas.push({ url, metodo, corpo });
  const rest = (nome) => url.includes(`/rest/v1/${nome}`);
  if (rest('orcamentos')) return Response.json(ORCAMENTOS);
  if (rest('clientes')) return Response.json(CLIENTES_CRM);
  if (rest('agendamentos')) return Response.json([{ id: 'ag1', user_id: IGOR }, { id: 'ag2', user_id: CLI1 }]);
  if (rest('user_activity_log')) return Response.json(ATIVIDADES);
  if (rest('assinaturas')) return Response.json(ASSINATURAS);
  if (rest('funil_exclusoes')) {
    if (modo === 'lista_fora') return new Response('{}', { status: 500 });
    return Response.json([{ user_id: IGOR, email: null }, { user_id: LUISA, email: null }]);
  }
  if (rest('admin_memberships')) return Response.json([]);
  if (rest('organizacoes_internas')) {
    if (modo === 'sem_migration') return new Response('{"code":"42P01"}', { status: 404 });
    return Response.json([]);
  }
  if (rest('organizacoes')) return Response.json([{ id: ORG, nome: 'GR Tech', owner_user_id: IGOR, criado_em: iso(30) }]);
  if (rest('organizacao_membros')) return Response.json([{ org_id: ORG, user_id: IGOR, ativo: true }, { org_id: ORG, user_id: LUISA, ativo: true }, { org_id: ORG, user_id: CLI2, ativo: false }]);
  if (url.endsWith('/rest/v1/rpc/admin_previa_org_interna')) {
    if (modo === 'org_inexistente') return Response.json({ ok: false, erro: 'org_inexistente' });
    return Response.json({
      ok: true, org_id: ORG, nome: 'GR Tech', ja_marcada: false, total_membros: 3, serao_marcadas: 2, preservadas: 1, ja_internas: 0,
      marcar_ids: [IGOR, LUISA], preservadas_ids: [CLI1],
    });
  }
  if (url.endsWith('/rest/v1/rpc/admin_marcar_org_interna')) {
    if (modo === 'previa_mudou') return Response.json({ ok: false, erro: 'previa_mudou', serao_marcadas: 3 });
    return Response.json({ ok: true, marcadas: corpo.p_confirmar, preservadas: 1 });
  }
  if (url.endsWith('/rest/v1/rpc/admin_desmarcar_org_interna')) return Response.json({ ok: true, estava_marcada: true, desmarcadas: 2 });
  if (rest('admin_audit_log')) return new Response(null, { status: 201 });
  return Response.json([]);
};

async function chamar(metodo, path, body, aal = 'aal2') {
  const url = new URL(`https://api.exemplo/admin/api/${path}`);
  const r = await handleAdmin(new Request(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${token(aal)}`, 'Content-Type': 'application/json' },
    body: metodo === 'POST' ? JSON.stringify(body || {}) : undefined,
  }), env, url);
  return { status: r.status, body: await r.json() };
}
const get = (p, aal) => chamar('GET', p, null, aal);
const post = (p, b, aal) => chamar('POST', p, b, aal);

console.log('Contas internas — módulo puro');
await caso('particionarContas: interna por id, por e-mail do dono e por lista; lista ilegível = indeterminado, ninguém marcado', () => {
  const ctx = contextoContasInternas({ emailsDono: ['dono@exemplo.test'], exclusoes: [{ user_id: IGOR }], admins: [{ user_id: LUISA }] });
  const p = particionarContas(USUARIOS, ctx, true);
  assert.deepEqual(p.internas.map((u) => u.id).sort(), [DONO_ENV, IGOR, LUISA].sort());
  assert.deepEqual(p.clientes.map((u) => u.id).sort(), [CLI1, CLI2].sort());
  assert.equal(p.escopo, 'confirmado');
  const sem = particionarContas(USUARIOS, ctx, false);
  assert.equal(sem.escopo, 'indeterminado');
  assert.equal(sem.internas.length, 0);
  assert.equal(sem.clientes.length, USUARIOS.length);
  assert.deepEqual(soDeClientes([{ user_id: IGOR }, { user_id: CLI1 }], new Set([IGOR])), [{ user_id: CLI1 }]);
});
await caso('validarPedidoOrg: marcar exige id, confirmação numérica e motivo; desfazer só id', () => {
  assert.equal(validarPedidoOrg({ id: 'x', interna: true, confirmar: 2, motivo: 'equipe' }).erro, 'sem_id');
  assert.equal(validarPedidoOrg({ id: ORG, interna: true, motivo: 'equipe' }).erro, 'confirmacao_obrigatoria');
  assert.equal(validarPedidoOrg({ id: ORG, interna: true, confirmar: '2', motivo: 'equipe' }).erro, 'confirmacao_obrigatoria');
  assert.equal(validarPedidoOrg({ id: ORG, interna: true, confirmar: 2, motivo: 'x' }).erro, 'motivo_invalido');
  assert.deepEqual(validarPedidoOrg({ id: ORG, interna: true, confirmar: 2, motivo: ' equipe ' }), { id: ORG, interna: true, confirmar: 2, motivo: 'equipe' });
  assert.deepEqual(validarPedidoOrg({ id: ORG, interna: false }), { id: ORG, interna: false, confirmar: null, motivo: '' });
  assert.equal(validarPedidoOrg(null).erro, 'payload_invalido');
});
await caso('montarPreviaOrg: ids viram e-mail; formato estranho do banco = null (nunca prévia torta)', () => {
  const mapa = new Map([[IGOR, 'igor@interno.test']]);
  const p = montarPreviaOrg({ ok: true, org_id: ORG, nome: 'GR', ja_marcada: false, total_membros: 2, serao_marcadas: 1, preservadas: 0, ja_internas: 1, marcar_ids: [IGOR], preservadas_ids: [] }, mapa);
  assert.deepEqual(p.marcar, [{ id: IGOR, email: 'igor@interno.test' }]);
  assert.equal(montarPreviaOrg({ ok: true, serao_marcadas: 'dois' }, mapa), null);
  assert.equal(montarPreviaOrg({ ok: false }, mapa), null);
  assert.equal(montarPreviaOrg({ ok: true, org_id: ORG, total_membros: 1, serao_marcadas: -1, preservadas: 0, ja_internas: 0 }, mapa), null);
});

console.log('\nContas internas — métricas e lista');
try {
  await caso('métricas: internas (lista e e-mail do dono) FORA de contas, orçamentos, clientes, atividade e agenda', async () => {
    modo = 'ok';
    const r = await get('metrics');
    assert.equal(r.status, 200);
    const m = r.body;
    assert.equal(m.escopo, 'confirmado');
    assert.equal(m.internasLegiveis, true);
    assert.equal(m.usuarios, 2, 'só CLI1 e CLI2 são clientes');
    assert.equal(m.contasInternas, 3, 'igor, luisa e o dono (ADMIN_EMAIL)');
    assert.equal(m.orcamentos, 2, 'só os 2 orçamentos dos clientes');
    assert.equal(m.aprovados, 1);
    assert.equal(m.faturamento, 300, 'o faturamento de 3.000 das internas não entra');
    assert.equal(m.clientes, 1, 'CRM: só o cliente final do CLI1');
    assert.equal(m.agendamentos, 1);
    assert.equal(m.ativados, 2, 'ativação conta só contas de cliente com orçamento');
    assert.equal(m.dau, 1, 'só o login do cliente');
    assert.equal(m.taxaAtivacao, 100);
    assert.ok(!JSON.stringify(m).includes('@'), 'nenhum e-mail na resposta de métricas');
  });
  await caso('receita: o plano pago da conta interna NÃO é pagante nem MRR, e continua aparecendo em "manuais"', async () => {
    const r = await get('metrics');
    assert.equal(r.body.receita.estado, 'ok');
    assert.equal(r.body.receita.pagantes, 0);
    assert.equal(r.body.receita.mrrEstimado, 0);
    assert.equal(r.body.receita.manuais, 1, 'a assinatura do Igor segue visível como plano liberado');
  });
  await caso('lista de internas ILEGÍVEL: escopo indeterminado, números incluem todas e o painel é avisado (não finge "só clientes")', async () => {
    modo = 'lista_fora';
    const r = await get('metrics');
    assert.equal(r.status, 200);
    assert.equal(r.body.escopo, 'indeterminado');
    assert.equal(r.body.internasLegiveis, false);
    assert.equal(r.body.contasInternas, 0);
    assert.equal(r.body.usuarios, USUARIOS.length);
    assert.equal(r.body.receita.estado, 'indisponivel', 'sem a lista a receita continua escondida (fail-closed)');
    modo = 'ok';
  });
  await caso('GET users: cada conta diz se é interna e por quê; lista ilegível = ninguém marcado e aviso', async () => {
    const r = await get('users');
    const por = Object.fromEntries(r.body.users.map((u) => [u.id, u]));
    assert.deepEqual([por[IGOR].interna, por[LUISA].interna, por[DONO_ENV].interna, por[CLI1].interna, por[CLI2].interna], [true, true, true, false, false]);
    assert.equal(por[DONO_ENV].internaMotivo, 'dono');
    assert.equal(por[IGOR].internaMotivo, 'lista_interna');
    assert.equal(por[CLI1].internaMotivo, '');
    assert.equal(r.body.contasInternasLegiveis, true);
    modo = 'lista_fora';
    const fora = await get('users');
    assert.equal(fora.body.contasInternasLegiveis, false);
    assert.ok(fora.body.users.every((u) => u.interna === false), 'sem a lista ninguém é afirmado como interno');
    assert.equal(fora.body.users.length, USUARIOS.length, 'a lista de contas continua inteira');
    modo = 'ok';
  });

  console.log('\nContas internas — organizações');
  await caso('rotas de organização exigem MFA (AAL2) e AAL1 não chega ao banco', async () => {
    chamadas = [];
    for (const [m, p, b] of [['GET', 'orgs'], ['GET', `org/previa?id=${ORG}`], ['POST', 'org/interna', { id: ORG, interna: true, confirmar: 2, motivo: 'equipe' }]]) {
      const r = await chamar(m, p, b, 'aal1');
      assert.equal(r.status, 403, `${m} ${p}`);
      assert.equal(r.body.erro, 'mfa_necessario');
    }
    assert.equal(chamadas.length, 0);
  });
  await caso('GET orgs: nome, dono (e-mail), membros ATIVOS e se é interna; sem migration = 503 dizendo o motivo', async () => {
    const r = await get('orgs');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.orgs, [{ id: ORG, nome: 'GR Tech', dono: 'igor@interno.test', membros: 2, interna: false, motivo: '', marcadaEm: null }]);
    modo = 'sem_migration';
    const sem = await get('orgs');
    assert.equal(sem.status, 503);
    assert.equal(sem.body.erro, 'orgs_sem_migration');
    modo = 'ok';
  });
  await caso('prévia: pede ao banco, devolve "N serão marcadas" com e-mails, e org inexistente = 404', async () => {
    chamadas = [];
    const r = await get(`org/previa?id=${ORG}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.previa.seraoMarcadas, 2);
    assert.equal(r.body.previa.preservadas, 1);
    assert.deepEqual(r.body.previa.marcar.map((x) => x.email).sort(), ['igor@interno.test', 'luisa@interno.test']);
    assert.deepEqual(r.body.previa.preservar.map((x) => x.email), ['cliente1@exemplo.test']);
    assert.deepEqual(chamadas.find((c) => c.url.endsWith('/rpc/admin_previa_org_interna')).corpo, { p_org_id: ORG });
    assert.equal((await get('org/previa?id=abc')).status, 400);
    modo = 'org_inexistente';
    assert.equal((await get(`org/previa?id=${ORG}`)).status, 404);
    modo = 'ok';
  });
  await caso('marcar: valida o corpo ANTES de tocar no banco (sem confirmação / motivo curto / id ruim)', async () => {
    chamadas = [];
    assert.equal((await post('org/interna', { id: ORG, interna: true, motivo: 'equipe' })).body.erro, 'confirmacao_obrigatoria');
    assert.equal((await post('org/interna', { id: ORG, interna: true, confirmar: 2, motivo: 'x' })).body.erro, 'motivo_invalido');
    assert.equal((await post('org/interna', { id: 'abc', interna: true, confirmar: 2, motivo: 'equipe' })).body.erro, 'sem_id');
    assert.equal(chamadas.length, 0);
  });
  await caso('marcar: repassa a CONFIRMAÇÃO, o motivo e o AUTOR ao banco e deixa auditoria', async () => {
    chamadas = [];
    const r = await post('org/interna', { id: ORG, interna: true, confirmar: 2, motivo: 'equipe do Igor e da GR Tech', requestId: 'req-org-000000001' });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.ok, r.body.marcadas, r.body.preservadas, r.body.auditoria], [true, 2, 1, true]);
    const rpc = chamadas.find((c) => c.url.endsWith('/rpc/admin_marcar_org_interna'));
    assert.deepEqual(rpc.corpo, { p_org_id: ORG, p_confirmar: 2, p_motivo: 'equipe do Igor e da GR Tech', p_por: ADMIN });
    const audit = chamadas.find((c) => c.url.endsWith('/rest/v1/admin_audit_log'));
    assert.equal(audit.corpo.acao, 'org_interna_marcada');
    assert.equal(audit.corpo.actor_user_id, ADMIN);
    assert.equal(audit.corpo.motivo, 'equipe do Igor e da GR Tech');
    assert.deepEqual(audit.corpo.depois, { orgId: ORG, marcadas: 2, preservadas: 1, jaMarcada: false });
  });
  await caso('marcar com prévia DESATUALIZADA: 409, devolve o número novo, NADA é auditado como marcado', async () => {
    modo = 'previa_mudou';
    chamadas = [];
    const r = await post('org/interna', { id: ORG, interna: true, confirmar: 2, motivo: 'equipe' });
    assert.equal(r.status, 409);
    assert.deepEqual([r.body.ok, r.body.erro, r.body.seraoMarcadas], [false, 'previa_mudou', 3]);
    assert.equal(chamadas.some((c) => c.url.endsWith('/rest/v1/admin_audit_log')), false, 'recusa não vira "marcada" na auditoria');
    modo = 'ok';
  });
  await caso('desfazer em 1 passo: chama o banco, audita "desmarcada" e não pede confirmação numérica', async () => {
    chamadas = [];
    const r = await post('org/interna', { id: ORG, interna: false, motivo: 'engano', requestId: 'req-org-000000002' });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.ok, r.body.desmarcadas, r.body.estavaMarcada], [true, 2, true]);
    assert.deepEqual(chamadas.find((c) => c.url.endsWith('/rpc/admin_desmarcar_org_interna')).corpo, { p_org_id: ORG });
    assert.equal(chamadas.find((c) => c.url.endsWith('/rest/v1/admin_audit_log')).corpo.acao, 'org_interna_desmarcada');
  });
} finally {
  globalThis.fetch = originalFetch;
}
console.log(`\nPASSOU: ${ok} casos — contas internas no painel ADM`);
