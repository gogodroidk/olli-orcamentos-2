/**
 * Operação do painel: churn, conversão, busca, lista de orçamentos e lote.
 *
 *     node worker/scripts/teste-admin-operacao.js
 * Exit 0 = passou; 1 = falhou.
 *
 * Erro de leitura não vira zero. Cortesia e conta interna não entram no churn.
 * Lote não apaga conta e recusa a ação na própria conta do admin.
 */
import assert from 'node:assert/strict';
import { adminHtml } from '../src/adminPagina.js';
import { handleAdmin } from '../src/admin.js';
import { contextoContasInternas } from '../src/assinaturasPagantes.js';
import {
  buscarUsuarios,
  celulaCsv,
  consultaOrcamentos,
  csvOrcamentos,
  normalizarFiltroSalvo,
  normalizarTermo,
  resumirChurn,
  resumirConversaoPorPlano,
  resumirVencendo,
  validarLote,
} from '../src/adminOperacao.js';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}

const DIA = 86400000;
const agora = Date.parse('2026-11-04T15:00:00Z');
const ADMIN = '11111111-1111-4111-8111-111111111111';
const SUP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U1 = 'b0000000-0000-4000-8000-000000000001';
const U2 = 'b0000000-0000-4000-8000-000000000002';
const U3 = 'b0000000-0000-4000-8000-000000000003';
const U4 = 'b0000000-0000-4000-8000-000000000004';
const fim = (diasAtras) => new Date(agora - diasAtras * DIA).toISOString();
const ctx = contextoContasInternas({ emailsDono: ['dono@exemplo.test'] });

function linha(userId, extra) {
  return {
    user_id: userId,
    plano: 'pro',
    status: 'canceled',
    current_period_end: fim(6),
    stripe_subscription_id: 'sub_real1',
    stripe_customer_id: 'cus_real1',
    mp_preapproval_id: null,
    revenuecat_transacao_id: null,
    admin_plano_override: null,
    admin_override_ativo: false,
    admin_override_ate: null,
    ...extra,
  };
}

const usuariosChurn = [
  { id: ADMIN, email: 'dono@exemplo.test' },
  { id: U1, email: 'fulano.ficticio@exemplo.invalid' },
  { id: U2, email: 'ciclana.ficticia@exemplo.invalid' },
  { id: U3, email: 'beltrano.ficticio@exemplo.invalid' },
  { id: U4, email: 'delta.ficticio@exemplo.invalid' },
];

console.log('Painel ADM — operação (churn, busca, lote)');

await caso('termo tira curinga e ponto; a busca de e-mail ainda acha', () => {
  assert.equal(normalizarTermo('  100% off.*  '), '100 off');
  assert.equal(consultaOrcamentos({ termo: '100% off' }).includes('%'), false);
  assert.equal(consultaOrcamentos({ termo: '100% off' }).includes('excluido_em=is.null'), true);
  assert.equal(consultaOrcamentos({ termo: '100% off' }).includes('*100 off*'), true);
  const hits = buscarUsuarios(
    [{ id: U1, email: 'fulano.ficticio@exemplo.invalid', nome: 'FULANO FICTICIO', empresa: '' }],
    'fulano.fict',
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, U1);
});

await caso('churn conta Pix e cartão reais e deixa de fora cortesia, interna e quem ainda está no período', () => {
  const assinaturas = [
    linha(U1),
    linha(ADMIN),
    linha(U2, { stripe_subscription_id: 'comp_manual', stripe_customer_id: null }),
    linha(U3, { status: 'active', current_period_end: fim(-20) }),
    linha(U4, { stripe_subscription_id: null, stripe_customer_id: null, mp_preapproval_id: 'preapproval-ficticio' }),
    linha('c0000000-0000-4000-8000-000000000005', { stripe_subscription_id: 'nao-e-stripe', stripe_customer_id: null, plano: 'empresa' }),
    linha('c0000000-0000-4000-8000-000000000006', { current_period_end: fim(-5) }),
    linha('c0000000-0000-4000-8000-000000000007', { current_period_end: fim(40) }),
    linha('c0000000-0000-4000-8000-000000000008', { plano: 'empresa', current_period_end: fim(4) }),
  ];
  const usuarios = usuariosChurn.concat([
    { id: 'c0000000-0000-4000-8000-000000000005', email: 'echo.ficticio@exemplo.invalid' },
    { id: 'c0000000-0000-4000-8000-000000000006', email: 'foxtrot.ficticio@exemplo.invalid' },
    { id: 'c0000000-0000-4000-8000-000000000007', email: 'golf.ficticio@exemplo.invalid' },
    { id: 'c0000000-0000-4000-8000-000000000008', email: 'hotel.ficticio@exemplo.invalid' },
  ]);
  const r = resumirChurn({ assinaturas, usuarios, contexto: ctx, agoraMs: agora });
  assert.equal(r.estado, 'ok');
  assert.equal(r.contas, 3);
  assert.deepEqual(r.porPlano, { pro: 2, empresa: 1 });
});

await caso('vencendo é pagante real com fim nos próximos 7 dias', () => {
  const assinaturas = [
    linha(U1, { status: 'active', current_period_end: fim(-3) }),
    linha(U2, { status: 'active', current_period_end: fim(-40) }),
    linha(ADMIN, { status: 'active', current_period_end: fim(-3) }),
    linha(U3, { status: 'canceled', current_period_end: fim(-3) }),
    linha(U4, { status: 'active', current_period_end: fim(-2), stripe_subscription_id: 'comp_manual', stripe_customer_id: null }),
  ];
  const r = resumirVencendo({ assinaturas, usuarios: usuariosChurn, contexto: ctx, agoraMs: agora });
  assert.equal(r.contas, 1);
});

await caso('conversão: cancelado vira grátis; orçamento ilegível não zera a taxa de pagamento', () => {
  const assinaturas = [
    linha(U1),
    linha(U2, { status: 'active', current_period_end: fim(-10) }),
    linha(U3, { status: 'active', plano: 'empresa', current_period_end: fim(-10) }),
    linha(ADMIN, { status: 'active', current_period_end: fim(-10) }),
  ];
  const usuarios = usuariosChurn.slice(0, 4);
  const com = resumirConversaoPorPlano({
    usuarios, assinaturas, orcamentos: [{ user_id: U2 }], contexto: ctx, agoraMs: agora,
  });
  assert.equal(com.ativacao, 'ok');
  assert.equal(com.pagos, 2);
  assert.equal(com.taxaPago, 67);
  assert.equal(com.planos.find((p) => p.plano === 'gratis').contas, 1);
  assert.equal(com.planos.find((p) => p.plano === 'pro').taxaAtivacao, 100);
  const sem = resumirConversaoPorPlano({
    usuarios, assinaturas, orcamentos: null, contexto: ctx, agoraMs: agora,
  });
  assert.equal(sem.ativacao, 'indisponivel');
  assert.equal(sem.pagos, 2);
  assert.equal(sem.planos.every((p) => p.taxaAtivacao === null), true);
});

await caso('lote recusa ação inválida, motivo curto e mais de 25 contas', () => {
  assert.equal(validarLote({ acao: 'excluir', ids: [U1], motivo: 'nao pode' }).erro, 'acao_invalida');
  assert.equal(validarLote({ acao: 'bloquear', ids: [U1], motivo: 'ab' }).erro, 'motivo_invalido');
  assert.equal(validarLote({ acao: 'bloquear', ids: [], motivo: 'motivo valido' }).erro, 'sem_ids');
  const muitos = Array.from({ length: 26 }, (_, i) => `d0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
  assert.equal(validarLote({ acao: 'bloquear', ids: muitos, motivo: 'motivo valido' }).erro, 'lote_grande');
  const okLote = validarLote({ acao: 'nota', ids: [U1, U1], motivo: 'nota de exemplo', requestId: 'r'.repeat(90) });
  assert.equal(okLote.erro, undefined);
  assert.deepEqual(okLote.ids, [U1]);
  assert.equal(okLote.requestId.length, 80);
});

await caso('CSV de orçamento neutraliza fórmula', () => {
  const csv = csvOrcamentos([{ id: 'orc-1', user_id: U1, numero: '=1+1', cliente_nome: 'FULANO', valor_total: 10, status: 'rascunho', criado_em: '2026-11-01' }]);
  assert.equal(csv.split('\r\n')[0], 'id;user_id;numero;cliente_nome;valor_total;status;criado_em');
  assert.equal(celulaCsv('=1+1'), `"'=1+1"`);
  assert.equal(csv.includes(`"'=1+1"`), true);
});

await caso('filtro salvo para no oitavo', () => {
  const cheios = Array.from({ length: 8 }, (_, i) => ({ nome: `f${i}` }));
  assert.equal(normalizarFiltroSalvo({ nome: 'Pagantes novos', seg: 'pagantes', ordem: 'cadastro', escopo: 'clientes', busca: '' }, cheios).erro, 'limite_filtros');
  const um = normalizarFiltroSalvo({ nome: 'Pagantes novos', seg: 'pagantes', ordem: 'cadastro', escopo: 'clientes', busca: 'fulano' }, []);
  assert.equal(um.filtro.nome, 'Pagantes novos');
});

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
const USUARIOS = [
  { id: ADMIN, email: 'dono@exemplo.test', created_at: fim(30), user_metadata: { full_name: 'DONO' } },
  { id: U1, email: 'fulano.ficticio@exemplo.invalid', created_at: fim(20), user_metadata: { full_name: 'FULANO FICTICIO' } },
  { id: U2, email: 'ciclana.ficticia@exemplo.invalid', created_at: fim(3), user_metadata: { full_name: 'CICLANA FICTICIA' } },
];
const ASSINATURAS = [
  linha(ADMIN),
  linha(U1),
  linha(U2, { status: 'active', current_period_end: fim(-3) }),
];
const ORCS = [
  { id: 'orc-ficticio-111', user_id: U1, numero: '111', cliente_nome: 'CLIENTE FICTICIO', valor_total: 111.11, status: 'aprovado', criado_em: fim(2) },
];

const originalFetch = globalThis.fetch;
let modo = 'ok';
const chamadas = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const method = init.method || 'GET';
  chamadas.push({ url, method, body: init.body || '' });
  if (url.endsWith('/auth/v1/user')) {
    if (modo === 'suporte') return Response.json({ id: SUP, email: 'suporte.ficticio@exemplo.invalid' });
    return Response.json({ id: ADMIN, email: 'dono@exemplo.test' });
  }
  if (url.includes('/auth/v1/admin/users')) {
    if (method === 'PUT') return Response.json({ id: 'ok' });
    return Response.json({ users: USUARIOS });
  }
  if (url.includes('/rest/v1/orcamentos')) {
    if (modo === 'orc500') return new Response('{}', { status: 500 });
    return Response.json(ORCS);
  }
  if (url.includes('/rest/v1/assinaturas')) {
    if (modo === 'assinaturas500') return new Response('{}', { status: 500 });
    return Response.json(ASSINATURAS);
  }
  if (url.includes('/rest/v1/admin_memberships') && url.includes('select=papel')) {
    return Response.json([{ papel: 'suporte' }]);
  }
  if (url.includes('/rest/v1/admin_audit_log')) return new Response(null, { status: 201 });
  return Response.json([]);
};

async function chamar(path, { method = 'GET', body } = {}) {
  const url = new URL(`https://api.exemplo${path}`);
  const r = await handleAdmin(new Request(url, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, url);
  return { status: r.status, body: await r.json() };
}

try {
  await caso('busca curta é 400; busca acha conta e orçamento sem curinga solto', async () => {
    modo = 'ok';
    const curta = await chamar('/admin/api/busca?q=f');
    assert.equal(curta.status, 400);
    assert.equal(curta.body.erro, 'busca_curta');
    chamadas.length = 0;
    const r = await chamar('/admin/api/busca?q=ful%25ano');
    assert.equal(r.status, 200);
    assert.equal(r.body.usuarios.some((u) => u.id === U1), true);
    assert.equal(r.body.orcamentos.some((o) => o.id === 'orc-ficticio-111' && o.cliente_nome === 'CLIENTE FICTICIO'), true);
    const consultas = chamadas.filter((c) => c.url.includes('/rest/v1/orcamentos')).map((c) => c.url);
    assert.equal(consultas.some((u) => u.includes('%')), false);
    assert.equal(consultas.some((u) => u.includes('*fulano*')), true);
  });

  await caso('suporte não abre a busca global', async () => {
    modo = 'suporte';
    const r = await chamar('/admin/api/busca?q=fulano');
    assert.equal(r.status, 403);
    assert.equal(r.body.erro, 'sem_permissao');
  });

  await caso('orçamentos ilegíveis viram 502, não lista vazia', async () => {
    modo = 'orc500';
    const r = await chamar('/admin/api/orcamentos?status=aprovado');
    assert.equal(r.status, 502);
    assert.equal(r.body.erro, 'orcamentos_indisponiveis');
    assert.equal(r.body.orcamentos, undefined);
  });

  await caso('assinatura ilegível esconde churn e conversão', async () => {
    modo = 'assinaturas500';
    const r = await chamar('/admin/api/metrics');
    assert.equal(r.status, 200);
    assert.equal(r.body.operacao.churn.estado, 'indisponivel');
    assert.equal(r.body.operacao.vencendo.estado, 'indisponivel');
    assert.equal(r.body.operacao.conversaoPorPlano.estado, 'indisponivel');
    assert.equal(r.body.operacao.churn.contas, undefined);
  });

  await caso('métricas contam o churn do cliente e não o do dono', async () => {
    modo = 'ok';
    const r = await chamar('/admin/api/metrics');
    assert.equal(r.status, 200);
    assert.equal(r.body.operacao.churn.estado, 'ok');
    assert.equal(r.body.operacao.churn.contas, 1);
    assert.equal(r.body.operacao.vencendo.contas, 1);
    assert.equal(r.body.operacao.conversaoPorPlano.pagos, 1);
  });

  await caso('lote sem motivo é 400; a própria conta é recusada; uma conta vai ao bloqueio e à trilha', async () => {
    modo = 'ok';
    const sem = await chamar('/admin/api/users/lote', { method: 'POST', body: { acao: 'bloquear', ids: [U1] } });
    assert.equal(sem.status, 400);
    assert.equal(sem.body.erro, 'motivo_invalido');
    chamadas.length = 0;
    const eu = await chamar('/admin/api/users/lote', {
      method: 'POST', body: { acao: 'bloquear', ids: [ADMIN], motivo: 'nao bloquear a si', requestId: 'req-lote-admin-teste' },
    });
    assert.equal(eu.status, 200);
    assert.deepEqual(eu.body.feitos, []);
    assert.equal(eu.body.falhas[0].erro, 'autoacao_proibida');
    assert.equal(chamadas.some((c) => c.method === 'PUT'), false);
    chamadas.length = 0;
    const um = await chamar('/admin/api/users/lote', {
      method: 'POST', body: { acao: 'bloquear', ids: [U1], motivo: 'bloqueio de teste', requestId: 'req-lote-um-teste', dias: 7 },
    });
    assert.equal(um.status, 200);
    assert.deepEqual(um.body.feitos, [U1]);
    assert.deepEqual(um.body.falhas, []);
    const put = chamadas.find((c) => c.method === 'PUT' && c.url.includes(U1));
    assert.ok(put);
    assert.equal(JSON.parse(put.body).ban_duration, '168h');
    const trilhas = chamadas.filter((c) => c.url.includes('/rest/v1/admin_audit_log')).map((c) => JSON.parse(c.body).acao);
    assert.equal(trilhas.includes('usuario_bloqueado'), true);
    assert.equal(trilhas.includes('usuarios_acao_lote'), true);
  });

  await caso('a prévia fictícia compila e mostra a operação nova', () => {
    const html = adminHtml(
      { SUPABASE_URL: 'https://exemplo.invalid', SUPABASE_ANON_KEY: 'anon-ficticia' },
      'ab'.repeat(16),
      { previa: true, trocaMesesMax: 3, creditosAjusteMax: 5000 },
    );
    const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]).join('\n');
    assert.doesNotThrow(() => new Function(script));
    assert.equal(html.includes('"previa":true'), true);
    assert.equal(script.includes('Saíram em 30 dias'), true);
    assert.equal(script.includes('Viraram pagantes'), true);
    assert.equal(script.includes('users/lote'), true);
    assert.equal(script.includes('abrirBusca'), true);
    assert.equal(script.includes('olli_admin_filtros_v1'), true);
    assert.equal(script.includes('PRÉVIA · DADOS FICTÍCIOS'), true);
  });
} finally {
  globalThis.fetch = originalFetch;
}

console.log(`\nPASSOU: ${ok} casos — operação do painel ADM`);
