/**
 * Painel ADMIN (super-admin do SaaS) — servido pelo Worker.
 *
 *   GET  /admin                          → SPA web (login + dashboard)
 *   GET  /admin/api/metrics              → métricas do negócio (+ sparkline)
 *   GET  /admin/api/users                → todos os usuários
 *   GET  /admin/api/user?id=<uid>        → dados completos de um usuário
 *   POST /admin/api/user/ban?id=<uid>    → bloquear
 *   POST /admin/api/user/unban?id=<uid>  → desbloquear
 *   POST /admin/api/user/reset?email=    → enviar e-mail de redefinição ao usuário
 *   POST /admin/api/user/delete?id=<uid> → excluir (conta + dados via cascade)
 *   POST /admin/api/me/password          → trocar a própria senha (do admin)
 *   GET  /admin/api/funil?semanas=12     → funil de receita por coorte semanal (sem PII)
 *   POST /admin/api/funil/exclusao?id=   → tirar/devolver uma conta interna do funil
 *   GET  /admin/api/creditos-troca       → pedidos de crédito de troca (ver creditoTroca.js)
 *   GET  /admin/api/creditos-troca/comprovante?id= → URL assinada do print do pedido
 *   POST /admin/api/creditos-troca/decidir → aprovar (Pro 1..3 meses) ou recusar com motivo
 *
 * Segurança: toda rota /admin/api exige JWT validado pelo Supabase. O e-mail
 * ADMIN_EMAIL é o owner de recuperação; administradores adicionais vivem em
 * public.admin_memberships com RBAC. Ações críticas exigem AAL2/TOTP e deixam
 * trilha append-only. Só depois disso o Worker usa SERVICE_ROLE, nunca o browser.
 */

import { getAssinatura, cancelarAssinaturaStripe } from './conta.js';
import { derivarEntitlement } from './entitlement.js';
import {
  ADMIN_DATA_POLICY_VERSION,
  camposAdmin,
  podeLerDadosAdmin,
  projetarEmpresa,
  projetarLinhas,
  selectAdminDataset,
} from './adminDataPolicy.js';
import { montarFunil, semanasFunil } from './funilReceita.js';
import { CREDITO_TROCA_MESES_MAX, decidirPedidoTroca, listarPedidosTroca, urlComprovante } from './creditoTroca.js';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// NUNCA hardcode um e-mail de admin. A env é apenas o owner de recuperação;
// memberships adicionais são consultadas no banco e falham fechado.
function adminEmail(env) {
  const raw = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  return raw || null;
}

function jwtPayload(token) {
  try {
    const parte = String(token || '').split('.')[1];
    if (!parte) return null;
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parte.length / 4) * 4, '=');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

async function requireAdmin(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    if (!u || !u.id) return null;
    const payload = jwtPayload(token) || {};
    const aal = payload.aal === 'aal2' ? 'aal2' : 'aal1';

    // Recuperação do dono: a env continua sendo a raiz de confiança e permite
    // entrar mesmo se a tabela de memberships estiver indisponível/corrompida.
    const bootstrap = adminEmail(env);
    if (bootstrap && String(u.email || '').trim().toLowerCase() === bootstrap) {
      return { ...u, papel: 'owner', aal, bootstrap: true };
    }

    const mr = await fetch(
      `${env.SUPABASE_URL}/rest/v1/admin_memberships?user_id=eq.${encodeURIComponent(u.id)}` +
        '&ativo=eq.true&select=papel&limit=1',
      { headers: svc(env) },
    );
    if (!mr.ok) return null;
    const membros = await mr.json().catch(() => null);
    if (!Array.isArray(membros) || !membros.length) return null;
    const papel = membros[0] && membros[0].papel;
    if (!['owner', 'admin', 'financeiro', 'suporte', 'leitura'].includes(papel)) return null;
    return { ...u, papel, aal, bootstrap: false };
  } catch {
    return null;
  }
}

function svc(env, extra = {}) {
  return { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...extra };
}

async function rest(env, path) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: svc(env) });
    if (!r.ok) return [];
    const j = await r.json().catch(() => []);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

// `rest()` acima devolve [] em qualquer falha — serve para listas de apoio, mas
// NÃO para número de negócio: "não consegui ler" viraria "zero". Este helper
// devolve os três estados explicitamente.
async function lerEstado(env, path, init = {}) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: svc(env, init.body ? { 'Content-Type': 'application/json' } : {}),
    });
    if (!r.ok) return { ok: false, status: r.status };
    const dados = await r.json().catch(() => undefined);
    if (!Array.isArray(dados)) return { ok: false, status: 502 };
    return { ok: true, dados };
  } catch {
    return { ok: false, status: 0 };
  }
}

const PAPEIS = {
  leitura: 1,
  suporte: 2,
  financeiro: 2,
  admin: 3,
  owner: 4,
};

function pode(user, permissao) {
  if (!user || !user.papel) return false;
  if (permissao === 'detalhe') return ['suporte', 'financeiro', 'admin', 'owner'].includes(user.papel);
  if (permissao === 'financeiro') return ['financeiro', 'admin', 'owner'].includes(user.papel);
  if (permissao === 'suporte') return ['suporte', 'admin', 'owner'].includes(user.papel);
  return (PAPEIS[user.papel] || 0) >= (PAPEIS[permissao] || 99);
}

function motivoValido(v) {
  const texto = typeof v === 'string' ? v.trim() : '';
  return texto.length >= 3 && texto.length <= 500 ? texto : null;
}

async function auditar(env, actor, { acao, targetUserId = null, motivo, antes = null, depois = null, requestId = null }) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/admin_audit_log`, {
      method: 'POST',
      headers: svc(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({
        actor_user_id: actor.id,
        actor_role: actor.papel,
        acao,
        target_user_id: targetUserId,
        motivo,
        antes,
        depois,
        request_id: requestId || null,
      }),
    });
    return r.ok || r.status === 409;
  } catch {
    return false;
  }
}

function exigir(user, permissao, { aal2 = false } = {}) {
  if (!pode(user, permissao)) return json({ ok: false, erro: 'sem_permissao' }, 403);
  if (aal2 && user.aal !== 'aal2') return json({ ok: false, erro: 'mfa_necessario' }, 403);
  return null;
}

// ─── caixa de feedback + erros (tabela public.feedback) ──────
async function feedbackList(env) {
  const rows = await rest(env, 'feedback?select=id,user_id,tipo,mensagem,contexto,resolvido,criado_em&order=criado_em.desc&limit=300');
  return json({ ok: true, feedback: rows });
}
async function feedbackResolve(env, id, resolvido) {
  if (!id) return json({ ok: false, erro: 'sem_id' }, 400);
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/feedback?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: svc(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ resolvido: !!resolvido }),
    });
    return json({ ok: r.ok });
  } catch {
    return json({ ok: false }, 500);
  }
}

async function listAuthUsers(env) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    try {
      const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: svc(env) });
      if (!r.ok) break;
      const j = await r.json().catch(() => null);
      const arr = Array.isArray(j) ? j : (j && Array.isArray(j.users) ? j.users : []);
      out.push(...arr);
      if (arr.length < 200) break;
    } catch {
      break;
    }
  }
  return out;
}

const ATIVIDADE_DIA = 86400000;
const ATIVIDADE_MAX_ROWS = 10000;

function agruparAtividade(rows) {
  const porUsuario = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.user_id) continue;
    const atual = porUsuario.get(row.user_id) || [];
    atual.push(row);
    porUsuario.set(row.user_id, atual);
  }
  return porUsuario;
}

function resumirAtividade(user, rows, agora = Date.now()) {
  const eventos = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.criado_em)
    .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
  const limite30 = agora - 30 * ATIVIDADE_DIA;
  const limite7 = agora - 7 * ATIVIDADE_DIA;
  const ultimos30 = eventos.filter((row) => Date.parse(row.criado_em) >= limite30);
  const ultimos7 = eventos.filter((row) => Date.parse(row.criado_em) >= limite7);
  const diasAtivos30 = new Set(ultimos30.map((row) => String(row.criado_em).slice(0, 10))).size;
  const ultimoUso = eventos[0]?.criado_em || user?.last_sign_in_at || null;
  const ultimoMs = ultimoUso ? Date.parse(ultimoUso) : NaN;
  let frequencia = 'nunca';
  if (Number.isFinite(ultimoMs)) {
    if (diasAtivos30 >= 8 || ultimos7.length >= 4) frequencia = 'frequente';
    else if (agora - ultimoMs <= 30 * ATIVIDADE_DIA) frequencia = 'ativo';
    else frequencia = 'inativo';
  }
  return {
    logins: eventos.filter((row) => row.evento === 'login').length,
    atividades: eventos.length,
    atividades30: ultimos30.length,
    diasAtivos30,
    ultimoUso,
    frequencia,
  };
}

async function listarAtividades(env) {
  return rest(
    env,
    `user_activity_log?select=user_id,id,evento,plataforma,criado_em&order=criado_em.desc&limit=${ATIVIDADE_MAX_ROWS}`,
  );
}

// ─── handlers ────────────────────────────────────────────────
async function metrics(env) {
  const [users, orcs, clientes, agend, atividades] = await Promise.all([
    listAuthUsers(env),
    rest(env, 'orcamentos?select=valor_total,status,criado_em'),
    rest(env, 'clientes?select=id'),
    rest(env, 'agendamentos?select=id'),
    listarAtividades(env),
  ]);
  const now = Date.now();
  const DAY = 86400000;
  const aprovados = orcs.filter((o) => o.status === 'aprovado');
  const faturamento = aprovados.reduce((s, o) => s + (Number(o.valor_total) || 0), 0);
  const ticket = aprovados.length ? faturamento / aprovados.length : 0;
  const conversao = orcs.length ? Math.round((aprovados.length / orcs.length) * 100) : 0;
  const ativos = users.filter((u) => u.last_sign_in_at).length;
  const novos7 = users.filter((u) => u.created_at && now - new Date(u.created_at).getTime() < 7 * DAY).length;
  const novos30 = users.filter((u) => u.created_at && now - new Date(u.created_at).getTime() < 30 * DAY).length;
  // sparkline: cadastros por dia nos últimos 14 dias (índice 13 = hoje)
  const spark = new Array(14).fill(0);
  for (const u of users) {
    if (!u.created_at) continue;
    const d = Math.floor((now - new Date(u.created_at).getTime()) / DAY);
    if (d >= 0 && d < 14) spark[13 - d]++;
  }
  const porUsuario = agruparAtividade(atividades);
  const resumos = users.map((u) => resumirAtividade(u, porUsuario.get(u.id), now));
  const atividade30 = atividades.filter((row) => row && Date.parse(row.criado_em) >= now - 30 * DAY);
  return json({
    ok: true, usuarios: users.length, ativos, novos7, novos30,
    orcamentos: orcs.length, aprovados: aprovados.length, conversao,
    clientes: clientes.length, agendamentos: agend.length, faturamento, ticket, spark,
    usando30: resumos.filter((item) => item.atividades30 > 0).length,
    frequentes: resumos.filter((item) => item.frequencia === 'frequente').length,
    nuncaUsaram: resumos.filter((item) => item.frequencia === 'nunca').length,
    logins30: atividade30.filter((row) => row.evento === 'login').length,
    atividade30: atividade30.length,
    atividadeLimitada: atividades.length >= ATIVIDADE_MAX_ROWS,
  });
}

async function users(env) {
  const [auth, empresas, orcs, assinaturas, atividades] = await Promise.all([
    listAuthUsers(env),
    rest(env, 'empresa?select=user_id,dados'),
    rest(env, 'orcamentos?select=user_id,status,valor_total'),
    rest(env, 'assinaturas?select=user_id,plano,status,current_period_end,admin_plano_override,admin_override_ativo,admin_override_ate'),
    listarAtividades(env),
  ]);
  const empByUser = new Map();
  for (const e of empresas) empByUser.set(e.user_id, (e.dados && e.dados.nome) || '');
  const cnt = new Map();
  const fat = new Map();
  const plano = new Map();
  for (const a of assinaturas) plano.set(a.user_id, derivarEntitlement(a));
  for (const o of orcs) {
    cnt.set(o.user_id, (cnt.get(o.user_id) || 0) + 1);
    if (o.status === 'aprovado') fat.set(o.user_id, (fat.get(o.user_id) || 0) + (Number(o.valor_total) || 0));
  }
  const porUsuario = agruparAtividade(atividades);
  const lista = auth.map((u) => ({
    id: u.id,
    email: u.email || '',
    nome: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '',
    empresa: empByUser.get(u.id) || '',
    criadoEm: u.created_at || '',
    ultimoAcesso: u.last_sign_in_at || '',
    bloqueado: !!(u.banned_until && new Date(u.banned_until) > new Date()),
    orcamentos: cnt.get(u.id) || 0,
    faturamento: fat.get(u.id) || 0,
    plano: (plano.get(u.id) || {}).plano || 'gratis',
    planoOrigem: (plano.get(u.id) || {}).origem || 'gratis',
    ...resumirAtividade(u, porUsuario.get(u.id)),
  }));
  lista.sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  return json({ ok: true, users: lista });
}

async function userDetail(env, id, actor) {
  if (!id) return json({ ok: false, erro: 'sem_id' }, 400);
  const enc = encodeURIComponent(id);
  const papel = actor && actor.papel;
  const ler = (dataset) => podeLerDadosAdmin(papel, dataset);
  const consultar = (dataset, base, sufixo = '') => {
    const select = selectAdminDataset(papel, dataset);
    if (!select) return Promise.resolve([]);
    return rest(env, `${base}&select=${select}${sufixo}`);
  };
  const assinaturaSelect = camposAdmin(papel, 'assinatura');
  const podeFaturas = ['financeiro', 'admin', 'owner'].includes(papel);
  // O customer id é uma dependência interna para listar faturas autorizadas;
  // ele nunca é devolvido pela projeção ao navegador.
  if (assinaturaSelect.length && podeFaturas && !assinaturaSelect.includes('stripe_customer_id')) assinaturaSelect.push('stripe_customer_id');
  const [empresaArr, orcamentosBrutos, clientesBrutos, agendaBruta, recibosBrutos, assinaturaArr, creditosBrutos, usosIaBrutos, auditoriaBruta, atividadeBruta, funilLeitura] = await Promise.all([
    ler('empresa') ? rest(env, `empresa?user_id=eq.${enc}&select=dados`) : Promise.resolve([]),
    consultar('orcamentos', `orcamentos?user_id=eq.${enc}`, '&order=criado_em.desc&limit=100'),
    consultar('clientes', `clientes?user_id=eq.${enc}`),
    consultar('agenda', `agendamentos?user_id=eq.${enc}`, '&order=inicio.desc&limit=50'),
    consultar('recibos', `recibos?user_id=eq.${enc}`, '&order=criado_em.desc&limit=50'),
    assinaturaSelect.length
      ? rest(env, `assinaturas?user_id=eq.${enc}&select=${assinaturaSelect.join(',')}&limit=1`)
      : Promise.resolve([]),
    consultar('creditos', `credit_ledger?user_id=eq.${enc}`, '&order=criado_em.desc&limit=100'),
    consultar('usosIa', `ia_uso_gratis?user_id=eq.${enc}`, '&order=criado_em.desc&limit=100'),
    consultar('auditoria', `admin_audit_log?target_user_id=eq.${enc}`, '&order=criado_em.desc&limit=100'),
    consultar('atividade', `user_activity_log?user_id=eq.${enc}`, '&order=criado_em.desc&limit=200'),
    lerEstado(env, `funil_exclusoes?user_id=eq.${enc}&select=motivo&limit=1`),
  ]);
  const assinaturaInterna = assinaturaArr[0] || null;
  const faturas = podeFaturas && assinaturaInterna && assinaturaInterna.stripe_customer_id
    ? await listarFaturasStripeAdmin(env, assinaturaInterna.stripe_customer_id)
    : [];
  const empresa = empresaArr[0] ? projetarEmpresa(papel, empresaArr[0]) : null;
  const orcamentos = projetarLinhas(papel, 'orcamentos', orcamentosBrutos);
  const clientes = projetarLinhas(papel, 'clientes', clientesBrutos);
  const agenda = projetarLinhas(papel, 'agenda', agendaBruta);
  const recibos = projetarLinhas(papel, 'recibos', recibosBrutos);
  const creditos = projetarLinhas(papel, 'creditos', creditosBrutos);
  const usosIa = projetarLinhas(papel, 'usosIa', usosIaBrutos);
  const auditoria = projetarLinhas(papel, 'auditoria', auditoriaBruta);
  const atividade = projetarLinhas(papel, 'atividade', atividadeBruta);
  const assinatura = projetarLinhas(papel, 'assinatura', assinaturaArr)[0] || null;
  if (assinatura && assinaturaInterna) {
    assinatura.stripeVinculado = !!assinaturaInterna.stripe_subscription_id;
    assinatura.mercadoPagoVinculado = !!assinaturaInterna.mp_preapproval_id;
  }
  return json({
    ok: true,
    politicaDados: { versao: ADMIN_DATA_POLICY_VERSION, papel },
    empresa,
    orcamentos,
    clientes,
    agenda,
    recibos,
    assinatura,
    entitlement: assinaturaInterna ? derivarEntitlement(assinaturaInterna) : { plano: 'gratis', origem: 'gratis' },
    creditos,
    saldoCreditos: creditos.length ? creditos.reduce((s, x) => s + (Number(x.delta) || 0), 0) : null,
    usosIa,
    faturas,
    auditoria,
    atividade,
    // Lista interna do funil: 'interna' | 'no_funil' | 'indisponivel' (não sei
    // nunca vira "está no funil" — o painel desabilita o botão).
    funil: !funilLeitura.ok
      ? { estado: 'indisponivel' }
      : funilLeitura.dados.length
        ? { estado: 'interna', motivo: String(funilLeitura.dados[0].motivo || '') }
        : { estado: 'no_funil' },
  });
}

function textoRelatorio(valor, limite = 500) {
  return String(valor ?? '').replace(/[\r\n]+/g, ' ').slice(0, limite);
}

async function userReport(env, id, actor, motivo) {
  const razao = motivoValido(motivo);
  if (!id) return json({ ok: false, erro: 'sem_id' }, 400);
  if (!razao) return json({ ok: false, erro: 'motivo_invalido' }, 400);
  const detalheResponse = await userDetail(env, id, actor);
  if (!detalheResponse.ok) return detalheResponse;
  const detalhe = await detalheResponse.json().catch(() => null);
  if (!detalhe || !detalhe.ok) return json({ ok: false, erro: 'detalhe_indisponivel' }, 502);
  const alvo = (await listAuthUsers(env)).find((user) => user.id === id);
  if (!alvo) return json({ ok: false, erro: 'usuario_nao_encontrado' }, 404);
  const linhas = [
    'OLLI — relatório operacional de usuário',
    `Gerado em: ${new Date().toISOString()}`,
    `E-mail: ${textoRelatorio(alvo.email)}`,
    `ID: ${textoRelatorio(id, 80)}`,
    `Cadastro: ${textoRelatorio(alvo.created_at || '—')}`,
    `Último login Auth: ${textoRelatorio(alvo.last_sign_in_at || '—')}`,
    `Plano: ${textoRelatorio(detalhe.entitlement?.plano || 'gratis')}`,
    `Saldo de créditos: ${textoRelatorio(detalhe.saldoCreditos ?? '—')}`,
    `Orçamentos: ${detalhe.orcamentos.length}`,
    `Clientes: ${detalhe.clientes.length}`,
    `Agenda: ${detalhe.agenda.length}`,
    `Recibos: ${detalhe.recibos.length}`,
    `Usos IA resumidos: ${detalhe.usosIa.length}`,
    '',
    'Atividade recente (máximo 200 eventos):',
    ...(detalhe.atividade.length
      ? detalhe.atividade.map((item) => `${textoRelatorio(item.criado_em)} | ${textoRelatorio(item.evento, 40)} | ${textoRelatorio(item.plataforma, 20)}`)
      : ['nenhum evento registrado']),
  ];
  const auditado = await auditar(env, actor, {
    acao: 'usuario_relatorio_txt',
    targetUserId: id,
    motivo: razao,
    depois: { formato: 'txt', eventos: detalhe.atividade.length },
  });
  if (!auditado) return json({ ok: false, erro: 'auditoria_indisponivel' }, 503);
  const base = textoRelatorio(alvo.email || id, 80).replace(/[^a-z0-9._-]/gi, '_');
  return new Response(`${linhas.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="olli-usuario-${base || 'relatorio'}.txt"`,
    },
  });
}

async function listarFaturasStripeAdmin(env, customerId) {
  if (!env.STRIPE_SECRET_KEY || !customerId) return [];
  try {
    const r = await fetch(
      `https://api.stripe.com/v1/invoices?customer=${encodeURIComponent(customerId)}&limit=24`,
      { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } },
    );
    if (!r.ok) return [];
    const body = await r.json().catch(() => null);
    if (!body || !Array.isArray(body.data)) return [];
    return body.data.map((inv) => ({
      id: inv.id,
      criadoEm: typeof inv.created === 'number' ? new Date(inv.created * 1000).toISOString() : null,
      valorCentavos: typeof inv.amount_paid === 'number' && inv.amount_paid > 0
        ? inv.amount_paid
        : (typeof inv.total === 'number' ? inv.total : 0),
      moeda: typeof inv.currency === 'string' ? inv.currency : 'brl',
      status: inv.status || null,
      pago: inv.status === 'paid',
      recibo: inv.hosted_invoice_url || inv.invoice_pdf || null,
    }));
  } catch {
    return [];
  }
}

async function setBan(env, id, ban, actor, body = {}) {
  if (!id) return json({ ok: false, erro: 'sem_id' }, 400);
  const motivo = motivoValido(body.motivo);
  if (!motivo) return json({ ok: false, erro: 'motivo_invalido' }, 400);
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: svc(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ban_duration: ban ? '876000h' : 'none' }),
    });
    if (!r.ok) return json({ ok: false, erro: 'falha_auth' }, 502);
    const auditoria = await auditar(env, actor, {
      acao: ban ? 'usuario_bloqueado' : 'usuario_desbloqueado',
      targetUserId: id,
      motivo,
      depois: { bloqueado: ban },
      requestId: body.requestId,
    });
    return json({ ok: true, auditoria });
  } catch { return json({ ok: false, erro: 'falha' }, 502); }
}

/**
 * Exclui um usuário. Reusa as MESMAS funções de conta.js — não uma segunda cópia.
 *
 * O admin reintroduzia o bug que /conta/excluir foi escrito para impedir: apagava
 * `auth.users` sem cancelar a assinatura na Stripe. Resultado: o cartão do cliente
 * segue sendo cobrado sem nenhuma conta pela qual cancelar, e os webhooks seguintes
 * batem em FK órfã, fazendo a Stripe reenviar em loop.
 *
 * Três estados da leitura da assinatura importam: existe / não existe / NÃO SEI.
 * "Não sei" (rede fora) bloqueia — nunca destrói dado sob incerteza.
 */
async function deleteUser(env, id, actor, body = {}) {
  if (!id) return json({ ok: false, erro: 'sem_id' }, 400);
  const motivo = motivoValido(body.motivo);
  if (!motivo || body.confirmacao !== 'EXCLUIR') {
    return json({ ok: false, erro: 'confirmacao_invalida' }, 400);
  }

  const assinatura = await getAssinatura(env, id);
  if (assinatura && assinatura.error) {
    return json({ ok: false, erro: 'assinatura_indeterminada' }, 502);
  }
  if (assinatura && assinatura.stripe_subscription_id) {
    const r = await cancelarAssinaturaStripe(env, assinatura.stripe_subscription_id);
    if (r !== 'ok') return json({ ok: false, erro: 'falha_cancelamento' }, 502);
  }

  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', headers: svc(env) });
    // 404 = já não existe (idempotente). Falha real vira 502, não um 200 com ok:false.
    if (r.ok || r.status === 404) {
      const auditoria = await auditar(env, actor, {
        acao: 'usuario_excluido', targetUserId: id, motivo,
        depois: { excluido: true }, requestId: body.requestId,
      });
      return json({ ok: true, auditoria });
    }
    return json({ ok: false, erro: 'falha_exclusao' }, 502);
  } catch { return json({ ok: false, erro: 'falha' }, 502); }
}

async function resetUserPassword(env, email, actor, body = {}) {
  if (!email) return json({ ok: false, erro: 'sem_email' }, 400);
  const motivo = motivoValido(body.motivo);
  if (!motivo) return json({ ok: false, erro: 'motivo_invalido' }, 400);
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!r.ok) return json({ ok: false, erro: 'falha_reset' }, 502);
    const auditoria = await auditar(env, actor, {
      acao: 'reset_senha_enviado', motivo, depois: { email }, requestId: body.requestId,
    });
    return json({ ok: true, auditoria });
  } catch { return json({ ok: false, erro: 'falha' }, 502); }
}

async function changeOwnPassword(request, env, senha, actor) {
  if (!senha || String(senha).length < 8) return json({ ok: false, erro: 'senha_curta' }, 400);
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: senha }),
    });
    if (!r.ok) return json({ ok: false, erro: 'falha_senha' }, 502);
    const auditoria = await auditar(env, actor, {
      acao: 'senha_admin_alterada', targetUserId: actor.id,
      motivo: 'Alteração solicitada pelo próprio administrador',
      depois: { senhaAlterada: true },
    });
    return json({ ok: true, auditoria });
  } catch { return json({ ok: false, erro: 'falha' }, 502); }
}

async function setPlanoManual(env, actor, id, body = {}) {
  if (!id) return json({ ok: false, erro: 'sem_id' }, 400);
  const motivo = motivoValido(body.motivo);
  const ativo = body.ativo !== false;
  const plano = body.plano === 'empresa' ? 'empresa' : body.plano === 'pro' ? 'pro' : null;
  if (!motivo || (ativo && !plano)) return json({ ok: false, erro: 'dados_invalidos' }, 400);

  let ate = null;
  if (ativo && body.ate) {
    const t = Date.parse(body.ate);
    const max = Date.now() + 10 * 366 * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(t) || t <= Date.now() || t > max) {
      return json({ ok: false, erro: 'vigencia_invalida' }, 400);
    }
    ate = new Date(t).toISOString();
  }
  const requestId = typeof body.requestId === 'string' && body.requestId.length >= 16
    ? body.requestId.slice(0, 128)
    : crypto.randomUUID();
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/admin_set_plano_override`, {
      method: 'POST',
      headers: svc(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        p_actor: actor.id,
        p_actor_role: actor.papel,
        p_target: id,
        p_plano: plano,
        p_ativo: ativo,
        p_ate: ate,
        p_motivo: motivo,
        p_request_id: requestId,
      }),
    });
    if (!r.ok) return json({ ok: false, erro: 'falha_entitlement' }, 502);
    const assinatura = await r.json().catch(() => null);
    return json({ ok: true, assinatura, entitlement: assinatura ? derivarEntitlement(assinatura) : null });
  } catch {
    return json({ ok: false, erro: 'falha_entitlement' }, 502);
  }
}

async function adminsList(env) {
  const [memberships, auth] = await Promise.all([
    rest(env, 'admin_memberships?select=user_id,papel,ativo,criado_em,atualizado_em&order=criado_em.asc'),
    listAuthUsers(env),
  ]);
  const emails = new Map(auth.map((u) => [u.id, u.email || '']));
  return json({
    ok: true,
    admins: memberships.map((m) => ({ ...m, email: emails.get(m.user_id) || '' })),
    bootstrapEmail: adminEmail(env) || null,
  });
}

async function setAdminMembership(env, actor, body = {}) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const papel = ['admin', 'financeiro', 'suporte', 'leitura'].includes(body.papel) ? body.papel : null;
  const ativo = body.ativo !== false;
  const motivo = motivoValido(body.motivo);
  if (!email || !papel || !motivo) return json({ ok: false, erro: 'dados_invalidos' }, 400);
  if (email === adminEmail(env)) return json({ ok: false, erro: 'owner_bootstrap_protegido' }, 409);

  const auth = await listAuthUsers(env);
  const alvo = auth.find((u) => String(u.email || '').trim().toLowerCase() === email);
  if (!alvo) return json({ ok: false, erro: 'usuario_nao_encontrado' }, 404);

  try {
    const requestId = typeof body.requestId === 'string' && body.requestId.length >= 16
      ? body.requestId.slice(0, 128)
      : crypto.randomUUID();
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/admin_set_membership`, {
      method: 'POST',
      headers: svc(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        p_actor: actor.id,
        p_actor_role: actor.papel,
        p_target: alvo.id,
        p_papel: papel,
        p_ativo: ativo,
        p_motivo: motivo,
        p_request_id: requestId,
      }),
    });
    if (!r.ok) return json({ ok: false, erro: 'falha_admin' }, 502);
    const admin = await r.json().catch(() => null);
    return json({ ok: true, admin });
  } catch {
    return json({ ok: false, erro: 'falha_admin' }, 502);
  }
}

async function auditList(env) {
  const rows = await rest(
    env,
    'admin_audit_log?select=id,actor_user_id,actor_role,acao,target_user_id,motivo,criado_em&order=criado_em.desc&limit=300',
  );
  return json({ ok: true, auditoria: rows });
}

// ─── funil de receita ────────────────────────────────────────
// Contas internas: o ADMIN_EMAIL (dono) vai como parâmetro; o resto vem da
// tabela funil_exclusoes e das regras automáticas do SQL. Nenhum e-mail fixo aqui.
function emailsForaDoFunil(env) {
  const dono = adminEmail(env);
  return dono ? [dono] : [];
}

async function funil(env, semanasParam) {
  const semanas = semanasFunil(semanasParam);
  const emails = emailsForaDoFunil(env);
  const [coortes, exclusoes] = await Promise.all([
    lerEstado(env, 'rpc/admin_funil_coortes', {
      method: 'POST',
      body: JSON.stringify({ p_emails_excluidos: emails, p_semanas: semanas }),
    }),
    lerEstado(env, 'rpc/admin_funil_exclusoes', {
      method: 'POST',
      body: JSON.stringify({ p_emails_excluidos: emails }),
    }),
  ]);
  // 404 = migration do funil ainda não aplicada. Qualquer falha é "não sei":
  // o painel mostra indisponível, nunca uma tabela de zeros.
  if (!coortes.ok || !exclusoes.ok) {
    const semMigration = coortes.status === 404 || exclusoes.status === 404;
    return json({ ok: false, erro: semMigration ? 'funil_sem_migration' : 'funil_indisponivel' }, 503);
  }
  try {
    return json({ ok: true, geradoEm: new Date().toISOString(), ...montarFunil(coortes.dados, exclusoes.dados, semanas) });
  } catch {
    return json({ ok: false, erro: 'funil_invalido' }, 502);
  }
}

async function setExclusaoFunil(env, actor, id, body = {}) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, erro: 'sem_id' }, 400);
  const motivo = motivoValido(body.motivo);
  if (!motivo || motivo.length > 200) return json({ ok: false, erro: 'motivo_invalido' }, 400);
  const excluir = body.excluir === true;
  const enc = encodeURIComponent(id);
  try {
    const r = excluir
      ? await fetch(`${env.SUPABASE_URL}/rest/v1/funil_exclusoes`, {
        method: 'POST',
        headers: svc(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ user_id: id, motivo, criado_por: actor.id }),
      })
      : await fetch(`${env.SUPABASE_URL}/rest/v1/funil_exclusoes?user_id=eq.${enc}`, {
        method: 'DELETE',
        headers: svc(env, { Prefer: 'return=minimal' }),
      });
    // 409 = já estava na lista (índice único): o estado pedido já vale.
    if (!r.ok && !(excluir && r.status === 409)) return json({ ok: false, erro: 'falha_funil' }, 502);
  } catch {
    return json({ ok: false, erro: 'falha_funil' }, 502);
  }
  const auditoria = await auditar(env, actor, {
    acao: excluir ? 'funil_conta_interna_marcada' : 'funil_conta_interna_desmarcada',
    targetUserId: id,
    motivo,
    depois: { foraDoFunil: excluir },
    requestId: body.requestId,
  });
  return json({ ok: true, auditoria });
}

// ─── roteador ────────────────────────────────────────────────
export async function handleAdmin(request, env, url) {
  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return new Response(adminHtml(env, nonce), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        // Mesma defesa em profundidade do link.js/stripe.js: o painel usa
        // script/style inline (sem framework) + fetch same-origin para
        // /admin/api e para o Supabase Auth (login).
        'Content-Security-Policy':
          `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' https://fonts.googleapis.com; ` +
          "font-src https://fonts.gstatic.com; img-src 'self' data: " +
          // Prévia do comprovante do crédito de troca (URL assinada de 5 min do Storage).
          (env.SUPABASE_URL || '') +
          "; connect-src 'self' " +
          (env.SUPABASE_URL || '') +
          "; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
    });
  }
  if (url.pathname.startsWith('/admin/api/')) {
    // Rate limit por IP ANTES de qualquer validação de credencial: barra
    // força bruta/varredura de token contra este painel (é a única rota do
    // worker que dá acesso total a dados de TODOS os usuários). Roda antes de
    // requireAdmin para não gastar 1 chamada a /auth/v1/user por tentativa.
    if (!env.ADMIN_RL) return json({ ok: false, erro: 'limite_admin_indisponivel' }, 503);
    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
      const { success } = await env.ADMIN_RL.limit({ key: ip });
      if (!success) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
    } catch {
      return json({ ok: false, erro: 'limite_admin_indisponivel' }, 503);
    }
    const user = await requireAdmin(request, env);
    if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
    const id = url.searchParams.get('id');
    const p = url.pathname;
    const m = request.method;
    const body = m === 'POST' ? await request.json().catch(() => ({})) : {};
    let gate;
    if (m === 'GET' && p === '/admin/api/me') {
      return json({ ok: true, user: { id: user.id, email: user.email, papel: user.papel, aal: user.aal } });
    }
    // Métricas, listas globais, feedback, administradores e auditoria são dados
    // de governança/PII. O gate explícito exige papel suficiente E AAL2 antes de
    // qualquer consulta service-role; uma senha AAL1 nunca abre a visão de todos
    // os tenants, mesmo para um owner de recuperação.
    if (m === 'GET' && p === '/admin/api/metrics') {
      if ((gate = exigir(user, 'admin', { aal2: true }))) return gate;
      return metrics(env);
    }
    if (m === 'GET' && p === '/admin/api/users') {
      if ((gate = exigir(user, 'admin', { aal2: true }))) return gate;
      return users(env);
    }
    if (m === 'GET' && p === '/admin/api/user') {
      if ((gate = exigir(user, 'detalhe', { aal2: true }))) return gate;
      return userDetail(env, id, user);
    }
    if (m === 'GET' && p === '/admin/api/user/report') {
      if ((gate = exigir(user, 'admin', { aal2: true }))) return gate;
      return userReport(env, id, user, url.searchParams.get('motivo'));
    }
    if (m === 'POST' && p === '/admin/api/user/ban') {
      if ((gate = exigir(user, 'suporte', { aal2: true }))) return gate;
      return setBan(env, id, true, user, body);
    }
    if (m === 'POST' && p === '/admin/api/user/unban') {
      if ((gate = exigir(user, 'suporte', { aal2: true }))) return gate;
      return setBan(env, id, false, user, body);
    }
    if (m === 'POST' && p === '/admin/api/user/delete') {
      if ((gate = exigir(user, 'owner', { aal2: true }))) return gate;
      return deleteUser(env, id, user, body);
    }
    if (m === 'POST' && p === '/admin/api/user/reset') {
      if ((gate = exigir(user, 'suporte'))) return gate;
      return resetUserPassword(env, url.searchParams.get('email'), user, body);
    }
    if (m === 'POST' && p === '/admin/api/user/plan') {
      if ((gate = exigir(user, 'financeiro', { aal2: true }))) return gate;
      return setPlanoManual(env, user, id, body);
    }
    // Funil: agregado de todos os tenants (sem PII) — mesmo gate das métricas.
    if (m === 'GET' && p === '/admin/api/funil') {
      return exigir(user, 'admin', { aal2: true }) || funil(env, url.searchParams.get('semanas'));
    }
    if (m === 'POST' && p === '/admin/api/funil/exclusao') {
      return exigir(user, 'admin', { aal2: true }) || setExclusaoFunil(env, user, id, body);
    }
    // Crédito de troca: concessão de plano → mesmo gate do "Conceder Pro" manual
    // (financeiro/admin/owner + AAL2). Ver o comprovante também exige isso: é
    // documento pessoal do prestador.
    if (m === 'GET' && p === '/admin/api/creditos-troca') {
      return exigir(user, 'financeiro', { aal2: true })
        || listarPedidosTroca(env, { status: url.searchParams.get('status'), listarUsuarios: () => listAuthUsers(env) });
    }
    if (m === 'GET' && p === '/admin/api/creditos-troca/comprovante') {
      return exigir(user, 'financeiro', { aal2: true }) || urlComprovante(env, id);
    }
    if (m === 'POST' && p === '/admin/api/creditos-troca/decidir') {
      return exigir(user, 'financeiro', { aal2: true }) || decidirPedidoTroca(env, user, body);
    }
    if (m === 'GET' && p === '/admin/api/feedback') {
      if ((gate = exigir(user, 'suporte', { aal2: true }))) return gate;
      return feedbackList(env);
    }
    if (m === 'POST' && p === '/admin/api/feedback/resolve') {
      if ((gate = exigir(user, 'suporte', { aal2: true }))) return gate;
      return feedbackResolve(env, id, url.searchParams.get('resolvido') === '1');
    }
    if (m === 'GET' && p === '/admin/api/admins') {
      if ((gate = exigir(user, 'owner', { aal2: true }))) return gate;
      return adminsList(env);
    }
    if (m === 'POST' && p === '/admin/api/admins') {
      if ((gate = exigir(user, 'owner', { aal2: true }))) return gate;
      return setAdminMembership(env, user, body);
    }
    if (m === 'GET' && p === '/admin/api/audit') {
      if ((gate = exigir(user, 'admin', { aal2: true }))) return gate;
      return auditList(env);
    }
    if (m === 'POST' && p === '/admin/api/me/password') {
      return changeOwnPassword(request, env, body && body.senha, user);
    }
    return json({ ok: false, erro: 'nao_encontrado' }, 404);
  }
  return json({ ok: false, erro: 'nao_encontrado' }, 404);
}

// ─── símbolo OLLI (mono, p/ reuso no HTML) ───────────────────
const SYM = '<svg viewBox="0 0 64 64" width="100%" height="100%"><defs><linearGradient id="og" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3FD8EA"/><stop offset="1" stop-color="#0B6FCE"/></linearGradient></defs><path d="M22 49 L12 59.5 L30 50 Z" fill="url(#og)"/><rect x="9" y="8" width="46" height="44" rx="14.5" fill="url(#og)"/><rect x="13" y="11.5" width="38" height="15" rx="9" fill="#fff" opacity="0.1"/><rect x="20" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5"/><rect x="35.5" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5"/><path d="M19 41 l6.6 6.9 l16 -15" fill="none" stroke="#EAFEFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function adminHtml(env, nonce) {
  const SB = JSON.stringify(env.SUPABASE_URL);
  const ANON = JSON.stringify(env.SUPABASE_ANON_KEY);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex,nofollow"/>
<title>OLLI · Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Spectral:wght@600;700&display=swap" rel="stylesheet">
<style>
 *{box-sizing:border-box;margin:0;padding:0}
 :root{--blue:#0B6FCE;--cy:#34C6D9;--cyl:#7FE9F5;--deep:#0A2547;--bg:#0A1626;--surf:#101F33;--surf2:#0C1B2E;--line:rgba(255,255,255,.08);--line2:rgba(127,233,245,.28);--mut:rgba(226,232,240,.6);--mut2:rgba(226,232,240,.4);--ok:#2BE39A;--warn:#F7B23B;--dng:#FF6B6B}
 body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:radial-gradient(1200px 700px at 50% -12%,#0E2742,var(--bg)) fixed;color:#fff;min-height:100vh;-webkit-font-smoothing:antialiased}
 @keyframes up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
 @keyframes fade{from{opacity:0}to{opacity:1}}
 @keyframes pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
 .wrap{max-width:1120px;margin:0 auto;padding:22px}
 .sym{width:34px;height:34px;flex-shrink:0}
 .hidden{display:none!important}
 /* LOGIN */
 .login{max-width:380px;margin:9vh auto;background:var(--surf);border:1px solid var(--line);border-radius:22px;padding:30px;animation:pop .4s cubic-bezier(.22,1,.36,1) both;box-shadow:0 24px 60px rgba(0,0,0,.4)}
 .login .sym{width:54px;height:54px}
 .login h1{font-size:21px;font-weight:800;margin:14px 0 3px}.login p{color:var(--mut);font-size:13px;margin-bottom:20px}
 label{font-size:12px;font-weight:700;color:var(--mut)}
 input{width:100%;margin:6px 0 14px;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:13px;color:#fff;font-size:15px;font-family:inherit;transition:border-color .15s}
 input:focus{outline:none;border-color:var(--line2)}
 .btn{border:none;border-radius:13px;padding:13px 16px;font-family:inherit;font-size:15px;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--blue),var(--cy));cursor:pointer;transition:transform .12s,filter .12s;width:100%}
 .btn:active{transform:scale(.98)}.btn:hover{filter:brightness(1.06)}
 .btn.sm{width:auto;padding:9px 14px;font-size:13px;border-radius:11px}
 .btn.ghost{background:transparent;border:1px solid var(--line2);color:var(--cyl)}
 .btn.soft{background:rgba(255,255,255,.06);border:1px solid var(--line);color:#fff}
 .btn.danger{background:transparent;border:1px solid rgba(255,107,107,.4);color:var(--dng)}
 .err{color:var(--dng);font-size:13px;min-height:18px;margin-top:2px}
 /* TOPBAR */
 .top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:22px;animation:fade .4s both}
 .top .brand{display:flex;align-items:center;gap:11px}.top .brand b{font-size:17px;font-weight:800;letter-spacing:2px}
 .top .brand span{font-size:11px;color:var(--mut2);display:block;letter-spacing:.5px;margin-top:-2px}
 .top .right{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;min-width:0}.who{font-size:12.5px;color:var(--mut);margin-right:4px;overflow-wrap:anywhere}
 .badge{display:inline-flex;align-items:center;min-height:28px;border:1px solid var(--line2);border-radius:999px;padding:4px 10px;color:var(--cyl);font-size:11px;font-weight:800}
 select{width:100%;margin:6px 0 14px;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:13px;color:#fff;font:inherit}
 /* CARDS */
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:13px;margin-bottom:16px}
 .card{background:linear-gradient(160deg,var(--surf),var(--surf2));border:1px solid var(--line);border-radius:18px;padding:17px;animation:up .45s cubic-bezier(.22,1,.36,1) both;position:relative;overflow:hidden}
 .card .ic{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:rgba(127,233,245,.1);border:1px solid var(--line2);font-size:15px}
 .card .v{font-family:'Spectral',serif;font-size:28px;font-weight:700;line-height:1}.card .v.ok{color:var(--ok)}
 .card .l{font-size:12px;color:var(--mut);margin-top:6px}
 .card .d{font-size:11px;font-weight:700;margin-top:3px}.d.up{color:var(--ok)}.d.flat{color:var(--mut2)}
 .spark{display:flex;align-items:flex-end;gap:3px;height:42px;margin-top:8px}
 .spark .b{flex:1;background:linear-gradient(180deg,var(--cyl),var(--blue));border-radius:3px;min-height:3px;opacity:.85}
 /* SECTION */
 .sec-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:22px 0 12px;flex-wrap:wrap}
 h2{font-size:16px;font-weight:800}
 .search{position:relative}.search input{margin:0;width:240px;padding:9px 12px 9px 32px}
 .search .mag{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--mut2);font-size:14px}
 /* TABLE */
 .tbl{background:var(--surf);border:1px solid var(--line);border-radius:16px;overflow:hidden;animation:up .5s both}
 table{width:100%;border-collapse:collapse}
 th,td{text-align:left;padding:12px 14px;font-size:13px;border-bottom:1px solid var(--line)}
 th{color:var(--mut2);font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;font-weight:800}
 tr:last-child td{border-bottom:none}
 tr.row{cursor:pointer;transition:background .12s}tr.row:hover{background:rgba(127,233,245,.05)}
 .u{display:flex;align-items:center;gap:10px}
 .av{width:34px;height:34px;border-radius:11px;background:linear-gradient(140deg,var(--blue),var(--cy));display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0}
 .uem{font-weight:600}.ues{font-size:11.5px;color:var(--mut2)}
 .pill{font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;display:inline-block}
 .pill.on{background:rgba(43,227,154,.15);color:var(--ok)}.pill.off{background:rgba(255,107,107,.15);color:var(--dng)}
 .muted{color:var(--mut2)}
 .empty{text-align:center;color:var(--mut);padding:40px 16px;font-size:14px}
 .skel{height:14px;border-radius:6px;background:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.1),rgba(255,255,255,.05));background-size:200% 100%;animation:sh 1.2s infinite}
 @keyframes sh{from{background-position:200% 0}to{background-position:-200% 0}}
 /* FUNIL */
 .funil{overflow-x:auto}
 .funil table{min-width:760px}
 .funil th,.funil td{text-align:right;padding:10px 12px;white-space:nowrap}
 .funil th:first-child,.funil td:first-child{text-align:left}
 .funil td b{font-family:'Spectral',serif;font-size:16px;font-weight:700}
 .funil td small{display:block;font-size:11px;color:var(--mut2);margin-top:2px}
 .funil td small.bom{color:var(--ok)}.funil td small.fraco{color:var(--warn)}
 .funil tr.tot td{background:rgba(127,233,245,.05)}
 .funil tr.tempo td{color:var(--mut);font-size:12px}
 .nota{font-size:12px;color:var(--mut2);margin-top:8px;line-height:1.5}
 /* MODAL */
 .ov{position:fixed;inset:0;background:rgba(5,12,22,.74);display:none;align-items:flex-start;justify-content:center;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));overflow:auto;z-index:20;animation:fade .2s both}
 .ov.show{display:flex}
 .modal{background:var(--surf);border:1px solid var(--line);border-radius:20px;max-width:660px;width:100%;max-height:calc(100dvh - 24px);overflow:auto;padding:24px;padding-bottom:max(24px,env(safe-area-inset-bottom));animation:pop .3s cubic-bezier(.22,1,.36,1) both}
 .mhead{display:flex;align-items:center;gap:12px;margin-bottom:6px}
 .modal h3{font-size:19px;font-weight:800}.modal .sub{color:var(--mut);font-size:12.5px;margin:2px 0 4px}
 .mfaError{color:#ff9c9c;background:rgba(255,76,76,.1);border:1px solid rgba(255,120,120,.35);border-radius:10px;padding:10px 12px;margin-top:12px;font-size:13px;line-height:1.45}
 .mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:9px;margin:14px 0}
 .mc{background:var(--surf2);border:1px solid var(--line);border-radius:12px;padding:11px}.mc .v{font-family:'Spectral',serif;font-size:19px;font-weight:700}.mc .l{font-size:10.5px;color:var(--mut2);text-transform:uppercase;letter-spacing:.4px;margin-top:2px}
 .sec h4{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--mut2);margin:14px 0 6px}
 .li{display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:7px 0;border-bottom:1px solid var(--line)}.li:last-child{border:none}
 .acts{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap}
 .mfaGate{margin:20px 0;padding:26px;border:1px solid var(--line2);border-radius:18px;background:linear-gradient(135deg,rgba(11,111,206,.16),rgba(52,198,217,.08));text-align:center}
 .mfaGate h2{font-size:18px;margin-bottom:8px}.mfaGate p{max-width:560px;margin:0 auto;color:var(--mut);font-size:13px;line-height:1.55}
 .mfaGate .btn{width:auto;margin-top:16px}
 .field{margin-top:6px}
 /* TOAST */
 .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--surf);border:1px solid var(--line2);border-radius:13px;padding:12px 18px;font-size:13.5px;font-weight:600;opacity:0;transition:all .25s;z-index:40;box-shadow:0 14px 34px rgba(0,0,0,.4)}
 .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
 .toast.ok{border-color:rgba(43,227,154,.5)}.toast.err{border-color:rgba(255,107,107,.5)}
 @media(max-width:620px){.top{align-items:flex-start;flex-direction:column}.top .right{justify-content:flex-start;width:100%}.search input{width:160px}th.hideSm,td.hideSm{display:none}.modal{border-radius:16px;padding:18px;max-height:calc(100dvh - 16px)}}
</style></head>
<body>
<div class="wrap">
 <div id="loginView" class="login">
  <div class="sym">${SYM}</div>
  <h1>Painel Admin OLLI</h1><p>Acesso restrito ao super-admin.</p>
  <label>E-mail</label><input id="email" type="email" autocomplete="username" placeholder="voce@email.com"/>
  <label>Senha</label><input id="senha" type="password" autocomplete="current-password" placeholder="sua senha"/>
  <button class="btn" id="loginBtn">Entrar</button>
  <div class="err" id="loginErr"></div>
 </div>

 <div id="dashView" class="hidden">
  <div class="top">
   <div class="brand"><div class="sym">${SYM}</div><div><b>OLLI ADMIN</b><span>painel do dono</span></div></div>
   <div class="right"><span class="who" id="who"></span><span class="badge" id="mfaState">AAL1</span><button class="btn soft sm" id="mfaBtn">Segurança</button><button class="btn soft sm hidden" id="adminsBtn">Administradores</button><button class="btn soft sm hidden" id="auditBtn">Auditoria</button><button class="btn soft sm" id="pwdBtn">Trocar senha</button><button class="btn ghost sm" id="refreshBtn" aria-label="Atualizar">Atualizar</button><button class="btn ghost sm" id="logoutBtn">Sair</button></div>
  </div>
  <div id="mfaGate" class="mfaGate hidden" role="alert">
   <h2>Confirme o segundo fator para abrir os dados</h2>
   <p>Este painel reúne informações de todos os clientes. A senha sozinha não libera métricas, usuários, feedback ou auditoria. Ative ou confirme o MFA para continuar.</p>
   <button class="btn" id="mfaGateBtn">Ativar ou confirmar MFA</button>
  </div>
  <div id="protectedContent" class="hidden">
   <div class="cards" id="cards"></div>
   <div class="sec-head"><h2>Funil de receita <span class="muted" id="funilSub"></span></h2></div>
   <div class="tbl funil" id="funilBox" aria-live="polite"></div>
   <div class="nota" id="funilNota"></div>
   <div class="sec-head"><h2>Crédito de troca <span class="muted" id="tcount"></span></h2><div id="tfilters" style="display:flex;gap:8px;flex-wrap:wrap"></div></div>
   <div class="tbl" id="trocaBox" aria-live="polite"></div>
   <div class="nota">Quem já pagou outro app manda o comprovante pelo app ("Vim de outro app"). Confira o print antes de aprovar: libera o Pro por até ${CREDITO_TROCA_MESES_MAX} meses, 1 vez por conta, e fica na auditoria.</div>
   <div class="sec-head">
    <h2>Usuários <span class="muted" id="ucount"></span></h2>
    <div class="search"><span class="mag">⌕</span><input id="usearch" placeholder="Buscar por e-mail ou empresa…"/></div>
   </div>
   <div class="tbl"><table><thead><tr><th>Usuário</th><th class="hideSm">Empresa</th><th>Plano</th><th>Uso</th><th>Orç.</th><th class="hideSm">Faturamento</th><th class="hideSm">Cadastro</th><th>Status</th></tr></thead><tbody id="urows"></tbody></table></div>
   <div class="sec-head"><h2>Feedback & Erros <span class="muted" id="fcount"></span></h2></div>
   <div id="ffilters" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"></div>
   <div id="frows"></div>
  </div>
 </div>
</div>

<div class="ov" id="ov"><div class="modal" id="modal"></div></div>
<div class="toast" id="toast"></div>

<script nonce="${nonce}">
const SB=${SB}, ANON=${ANON};
let TOKEN=sessionStorage.getItem('olli_admin_tok')||'', REFRESH=sessionStorage.getItem('olli_admin_refresh')||'', ALLUSERS=[], MET=null, ME=null;
const $=id=>document.getElementById(id);
function show(v){$('loginView').classList.toggle('hidden',v!=='login');$('dashView').classList.toggle('hidden',v!=='dash');}
function mostrarGateMfa(){show('dash');$('mfaGate').classList.remove('hidden');$('protectedContent').classList.add('hidden');}
function liberarDados(){ $('mfaGate').classList.add('hidden');$('protectedContent').classList.remove('hidden'); }
function el(t,p){const e=document.createElement(t);if(p)Object.assign(e,p);for(let i=2;i<arguments.length;i++){const k=arguments[i];if(k!=null)e.append(k.nodeType?k:document.createTextNode(k));}return e;}
function toast(msg,kind){const t=$('toast');t.textContent=msg;t.className='toast show '+(kind||'');setTimeout(()=>{t.className='toast '+(kind||'');},2600);}
function fmtBRL(n){return 'R$ '+(Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtNum(n){return (Number(n)||0).toLocaleString('pt-BR');}
function fmtDate(s){if(!s)return '—';const d=new Date(s);return isNaN(d)?'—':d.toLocaleDateString('pt-BR');}
function initials(s){return (s||'?').trim().charAt(0).toUpperCase();}
async function api(path,opts){
 const r=await fetch('/admin/api/'+path,{...opts,headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json',...(opts&&opts.headers||{})}});
 const j=await r.json().catch(()=>({ok:false,erro:'resposta_invalida'}));
 if(r.status===401){logout();throw new Error('401');}
 if(!r.ok||j.ok===false){const e=new Error(j.erro||('http_'+r.status));e.codigo=j.erro;e.status=r.status;throw e;}
 return j;
}

async function login(){
 $('loginErr').textContent='';
 const email=$('email').value.trim(),senha=$('senha').value;
 if(!email||!senha){$('loginErr').textContent='Preencha e-mail e senha.';return;}
 $('loginBtn').textContent='Entrando…';$('loginBtn').disabled=true;
 try{
  const r=await fetch(SB+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json',apikey:ANON},body:JSON.stringify({email,password:senha})});
  const j=await r.json();
  if(!j.access_token){$('loginErr').textContent='E-mail ou senha incorretos.';return;}
  TOKEN=j.access_token;
  REFRESH=j.refresh_token||'';
  sessionStorage.setItem('olli_admin_tok',TOKEN);
  if(REFRESH)sessionStorage.setItem('olli_admin_refresh',REFRESH);else sessionStorage.removeItem('olli_admin_refresh');
  $('who').textContent=email;
  await carregarIdentidade();
  const fatores=await listarFatoresMfa();
  if(ME&&ME.aal!=='aal2'){
   mostrarGateMfa();
   if(fatores.length)await abrirDesafioMfa(fatores[0]);
  }else await loadDash();
 }catch(e){$('loginErr').textContent='Entrou, mas não consegui carregar a verificação em duas etapas. '+String(e&&e.message||'Tente novamente.').slice(0,180);}
 finally{$('loginBtn').textContent='Entrar';$('loginBtn').disabled=false;}
}
function logout(){TOKEN='';REFRESH='';ME=null;sessionStorage.removeItem('olli_admin_tok');sessionStorage.removeItem('olli_admin_refresh');show('login');}

async function carregarIdentidade(){
 const j=await api('me');ME=j.user||null;
 if(!ME)return;
 $('who').textContent=(ME.email||'')+' · '+ME.papel;
 $('mfaState').textContent=ME.aal==='aal2'?'MFA ativo':'MFA pendente';
 $('mfaState').style.color=ME.aal==='aal2'?'var(--ok)':'var(--warn)';
 $('adminsBtn').classList.toggle('hidden',ME.papel!=='owner');
 $('auditBtn').classList.toggle('hidden',!['owner','admin'].includes(ME.papel));
 if(ME.aal!=='aal2'){
  $('adminsBtn').classList.add('hidden');
  $('auditBtn').classList.add('hidden');
 }
}

async function renovarSessao(){
 if(!REFRESH)return false;
 try{
  const r=await fetch(SB+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:ANON,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:REFRESH})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.access_token)return false;
  TOKEN=j.access_token;REFRESH=j.refresh_token||REFRESH;
  sessionStorage.setItem('olli_admin_tok',TOKEN);sessionStorage.setItem('olli_admin_refresh',REFRESH);
  return true;
 }catch{return false;}
}

async function authFetch(path,opts={},retry=true){
 const body=opts&&opts.body;
 const headers={apikey:ANON,Authorization:'Bearer '+TOKEN,...(body?{'Content-Type':'application/json'}:{}),...(opts&&opts.headers||{})};
 const r=await fetch(SB+'/auth/v1/'+path,{...opts,headers});
 if(r.status===401&&retry&&await renovarSessao())return authFetch(path,opts,false);
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(j.msg||j.message||j.error_description||'Falha de autenticação');
 return j;
}

async function listarFatoresMfa(){
 // O endpoint GET /auth/v1/factors não lista fatores no GoTrue atual. O SDK
 // oficial implementa listFactors() sobre getUser() e lê user.factors; POST
 // /factors continua reservado ao cadastro de um novo fator TOTP.
 const j=await authFetch('user');
 const todos=Array.isArray(j&&j.factors)?j.factors:[];
 return todos.filter((f,i,a)=>f&&f.factor_type==='totp'&&f.status==='verified'&&a.findIndex(x=>x.id===f.id)===i);
}

function aplicarSessaoMfa(j){
 const token=j&&j.access_token;
 if(typeof token!=='string'||!token)throw new Error('A verificação não devolveu uma sessão válida.');
 TOKEN=token;REFRESH=j.refresh_token||REFRESH;sessionStorage.setItem('olli_admin_tok',TOKEN);if(REFRESH)sessionStorage.setItem('olli_admin_refresh',REFRESH);
}

async function verificarFator(factorId,code){
 const ch=await authFetch('factors/'+encodeURIComponent(factorId)+'/challenge',{method:'POST',body:'{}'});
 const v=await authFetch('factors/'+encodeURIComponent(factorId)+'/verify',{method:'POST',body:JSON.stringify({challenge_id:ch.id,code})});
 aplicarSessaoMfa(v);
 await carregarIdentidade();
}

async function abrirDesafioMfa(fator){
 const d=$('modal');d.innerHTML='';
 d.append(el('h3',{},'Confirme o segundo fator'),el('div',{className:'sub'},'Abra o aplicativo autenticador em que você cadastrou “OLLI Admin” e digite o código atual de 6 números. Ele muda aproximadamente a cada 30 segundos.'));
 const code=el('input',{inputMode:'numeric',autocomplete:'one-time-code',enterKeyHint:'done',pattern:'[0-9]*',maxLength:6,placeholder:'000000',ariaLabel:'Código MFA'}),err=el('div',{className:'mfaError',role:'alert'});err.hidden=true;d.append(code,err);
 const acts=el('div',{className:'acts'}),save=el('button',{className:'btn sm'},'Verificar');
 save.disabled=true;
 code.oninput=()=>{code.value=code.value.replace(/\\D/g,'').slice(0,6);save.disabled=code.value.length!==6;err.hidden=true;err.textContent='';};
 code.onkeydown=e=>{if(e.key==='Enter'&&!save.disabled){e.preventDefault();save.click();}};
 save.onclick=async()=>{const valor=code.value.trim();err.hidden=true;err.textContent='';if(!/^\\d{6}$/.test(valor)){err.textContent='Digite os 6 números do código atual.';err.hidden=false;code.focus();return;}save.disabled=true;try{await verificarFator(fator.id,valor);modalClose();toast('MFA confirmado.','ok');await loadDash();}catch(e){err.textContent=String(e&&e.message||'Código inválido.').slice(0,240);err.hidden=false;code.select();}finally{save.disabled=code.value.length!==6;}};
 const ajuda=el('button',{className:'btn ghost sm',type:'button'},'Perdi acesso ao autenticador');
 ajuda.onclick=()=>{err.textContent='O fator antigo precisa ser removido com uma recuperação administrativa auditada e, depois, cadastrado novamente. Nenhum dado é liberado sem essa confirmação.';err.hidden=false;};
 acts.append(el('button',{className:'btn ghost sm',onclick:()=>{modalClose();mostrarGateMfa();}},'Continuar sem dados'),ajuda,save);d.append(acts);$('ov').classList.add('show');code.focus();
}

async function abrirSeguranca(){
 const existentes=await listarFatoresMfa();
 if(existentes.length){await abrirDesafioMfa(existentes[0]);return;}
 const d=$('modal');d.innerHTML='';d.append(el('h3',{},'Ativar verificação em duas etapas'),el('div',{className:'sub'},'Use Google Authenticator, Authy, 1Password ou outro aplicativo TOTP. Cadastre também um segundo fator de reserva depois.'));
 try{
  const f=await authFetch('factors',{method:'POST',body:JSON.stringify({factor_type:'totp',friendly_name:'OLLI Admin'})});
  const qr=f&&f.totp&&f.totp.qr_code;
  if(qr){d.append(el('img',{src:qr,alt:'QR Code para cadastrar o OLLI Admin no autenticador',style:'display:block;width:220px;height:220px;margin:18px auto;background:#fff;padding:10px;border-radius:14px'}));}
  if(f&&f.totp&&f.totp.secret)d.append(el('div',{className:'sub',style:'word-break:break-all'},'Chave manual: '+f.totp.secret));
  const code=el('input',{inputMode:'numeric',autocomplete:'one-time-code',enterKeyHint:'done',pattern:'[0-9]*',maxLength:6,placeholder:'Código de 6 dígitos'});d.append(code);
  const acts=el('div',{className:'acts'}),save=el('button',{className:'btn sm'},'Ativar MFA');
  save.onclick=async()=>{save.disabled=true;try{await verificarFator(f.id,code.value.trim());modalClose();toast('MFA ativado.','ok');await loadDash();}catch(e){toast(e.message||'Não consegui verificar.','err');}finally{save.disabled=false;}};
  acts.append(el('button',{className:'btn ghost sm',onclick:modalClose},'Cancelar'),save);d.append(acts);
 }catch(e){d.append(el('div',{className:'err'},e.message||'Não consegui iniciar o MFA.'));}
 $('ov').classList.add('show');
}

function card(icon,val,label,delta,deltaCls,ok){
 const c=el('div',{className:'card'});c.append(el('div',{className:'ic'},icon),el('div',{className:'v'+(ok?' ok':'')},String(val)),el('div',{className:'l'},label));
 if(delta)c.append(el('div',{className:'d '+(deltaCls||'flat')},delta));return c;
}
function sparkCard(spark){
 const c=el('div',{className:'card'});c.append(el('div',{className:'ic'},'📈'));
 const mx=Math.max(1,...spark);const bars=el('div',{className:'spark'});
 spark.forEach(v=>{const b=el('div',{className:'b'});b.style.height=Math.round(v/mx*100)+'%';bars.append(b);});
 c.append(bars,el('div',{className:'l'},'Cadastros · 14 dias'));return c;
}
function renderCards(m){
 const c=$('cards');c.innerHTML='';
 c.append(
  card('👤',fmtNum(m.usuarios),'Usuários',m.novos7?('+'+m.novos7+' esta semana'):'—',m.novos7?'up':'flat'),
  card('⚡',fmtNum(m.ativos),'Já acessaram'),
  card('🟢',fmtNum(m.usando30),'Usando · 30 dias',m.frequentes?fmtNum(m.frequentes)+' frequentes':'—',m.frequentes?'up':'flat'),
  card('🔑',fmtNum(m.logins30),'Logins · 30 dias',m.atividade30?fmtNum(m.atividade30)+' eventos':'—',m.atividade30?'up':'flat'),
  card('📄',fmtNum(m.orcamentos),'Orçamentos',m.aprovados+' aprovados',m.aprovados?'up':'flat'),
  card('🎯',m.conversao+'%','Conversão'),
  card('🧾',fmtBRL(m.ticket),'Ticket médio'),
  card('💰',fmtBRL(m.faturamento),'Faturamento',null,null,true),
  sparkCard(m.spark||[]),
 );
}
function renderUsers(list){
 const tb=$('urows');tb.innerHTML='';
 if(!list.length){tb.append(el('tr',{},el('td',{colSpan:8},el('div',{className:'empty'},'Nenhum usuário encontrado.'))));return;}
 for(const x of list){
  const tr=el('tr',{className:'row'});tr.onclick=()=>openUser(x);
  const u=el('div',{className:'u'});u.append(el('div',{className:'av'},initials(x.nome||x.email)),el('div',{},el('div',{className:'uem'},x.email||'—'),el('div',{className:'ues'},x.nome||'sem nome')));
  tr.append(
   el('td',{},u),
   el('td',{className:'hideSm '+(x.empresa?'':'muted')},x.empresa||'(sem empresa)'),
   el('td',{},el('span',{className:'pill '+(x.plano==='gratis'?'off':'on')},x.plano+(x.planoOrigem==='admin'?' · manual':''))),
   el('td',{},el('span',{className:'pill '+(x.frequencia==='frequente'||x.frequencia==='ativo'?'on':'off')},x.frequencia||'nunca')),
   el('td',{},String(x.orcamentos)),
   el('td',{className:'hideSm muted'},x.faturamento?fmtBRL(x.faturamento):'—'),
   el('td',{className:'hideSm muted'},fmtDate(x.criadoEm)),
   el('td',{},el('span',{className:'pill '+(x.bloqueado?'off':'on')},x.bloqueado?'bloqueado':'ativo')),
  );
  tb.append(tr);
 }
}
function applySearch(){const q=$('usearch').value.trim().toLowerCase();renderUsers(!q?ALLUSERS:ALLUSERS.filter(u=>(u.email||'').toLowerCase().includes(q)||(u.empresa||'').toLowerCase().includes(q)||(u.frequencia||'').toLowerCase().includes(q)));}

// ── Feedback & Erros ──
let ALLFB=[], FBFILTER='abertos';
const TIPO_FB={feedback:['💬','#0B6FCE'],sugestao:['💡','#F7B23B'],bug:['🐞','#E5484D'],elogio:['⭐','#2BD787'],erro:['⛔','#E5484D'],pulso:['📊','#8B5CF6'],denuncia:['🚩','#FF3B30']};
// O tipo REAL do produto vive em contexto.origem (a coluna tipo tem CHECK
// constraint no banco e colapsa tipos novos). Linha antiga nao tem origem: cai
// no f.tipo. Ver src/services/feedback.ts.
function tipoFb(f){const o=f&&f.contexto&&f.contexto.origem;return(o&&TIPO_FB[o])?o:f.tipo;}
function emailDe(uid){const u=ALLUSERS.find(x=>x.id===uid);return u?(u.email||u.nome||'usuário'):(uid?('id '+String(uid).slice(0,8)):'anônimo');}
function renderFbFilters(){
 const box=$('ffilters');if(!box)return;box.innerHTML='';
 const abertos=ALLFB.filter(f=>!f.resolvido).length,erros=ALLFB.filter(f=>f.tipo==='erro'&&!f.resolvido).length;
 const denuncias=ALLFB.filter(f=>tipoFb(f)==='denuncia'&&!f.resolvido).length;
 $('fcount').textContent='('+abertos+' abertos'+(erros?' · '+erros+' erros':'')+(denuncias?' · 🚩 '+denuncias+' denúncias':'')+')';
 const opts=[['abertos','Não resolvidos'],['todos','Todos'],['denuncia','🚩 Denúncias'],['erro','⛔ Erros'],['bug','🐞 Bugs'],['sugestao','💡 Sugestões'],['feedback','💬 Feedback'],['pulso','📊 Pulso']];
 for(const o of opts){const b=el('button',{className:'btn '+(FBFILTER===o[0]?'soft sm':'ghost sm'),onclick:()=>{FBFILTER=o[0];renderFbFilters();renderFeedback();}},o[1]);box.append(b);}
}
function renderFeedback(){
 const box=$('frows');if(!box)return;box.innerHTML='';
 let list=ALLFB.slice();
 if(FBFILTER==='abertos')list=list.filter(f=>!f.resolvido);
 else if(FBFILTER!=='todos')list=list.filter(f=>tipoFb(f)===FBFILTER);
 if(!list.length){box.append(el('div',{className:'empty'},'Nada por aqui. 🎉'));return;}
 for(const f of list){
  const t=tipoFb(f),meta=TIPO_FB[t]||['💬','#8aa'],ctx=f.contexto||{};
  // denúncia (conteúdo de IA sinalizado) tem destaque próprio — não pode passar
  // batida no meio do resto da caixa de feedback.
  const destaque=t==='denuncia'&&!f.resolvido;
  const item=el('div',{style:'border:1px solid '+(destaque?meta[1]+'66':'#ffffff14')+';border-radius:14px;padding:14px;margin-bottom:10px;background:'+(destaque?meta[1]+'14':'#ffffff08')+(f.resolvido?';opacity:.5':'')});
  const head=el('div',{style:'display:flex;align-items:center;gap:8px;margin-bottom:7px;flex-wrap:wrap'});
  head.append(el('span',{style:'font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;background:'+meta[1]+'22;color:'+meta[1]},meta[0]+' '+t));
  const bits=[ctx.nota?('nota '+ctx.nota+'/5'):null,ctx.tela,ctx.plano,ctx.versao?('v'+ctx.versao):null,ctx.plataforma].filter(Boolean).join(' · ');
  head.append(el('span',{className:'muted',style:'font-size:12px;flex:1'},bits));
  head.append(el('span',{className:'muted',style:'font-size:12px'},fmtDate(f.criado_em)));
  item.append(head);
  item.append(el('div',{style:'font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word'},f.mensagem||''));
  const foot=el('div',{style:'display:flex;align-items:center;gap:10px;margin-top:9px'});
  foot.append(el('span',{className:'muted',style:'font-size:12px;flex:1'},emailDe(f.user_id)));
  if(ctx.stack)foot.append(el('button',{className:'btn ghost sm',onclick:()=>alert(ctx.stack)},'ver stack'));
  foot.append(el('button',{className:'btn '+(f.resolvido?'ghost':'soft')+' sm',onclick:()=>fbResolve(f)},f.resolvido?'reabrir':'resolver'));
  item.append(foot);box.append(item);
 }
}
async function fbResolve(f){
 try{await api('feedback/resolve?id='+encodeURIComponent(f.id)+'&resolvido='+(f.resolvido?'0':'1'),{method:'POST'});f.resolvido=!f.resolvido;renderFbFilters();renderFeedback();toast(f.resolvido?'Resolvido ✓':'Reaberto','ok');}catch(e){toast('Falha.','err');}
}

// ── Funil de receita ──
// Três estados: carregando | erro (diz que NÃO sabe — nunca mostra zeros) | valor.
const ERRO_FUNIL={funil_sem_migration:'a migration do funil ainda não foi aplicada no banco.',funil_indisponivel:'o banco não respondeu.',funil_invalido:'o banco respondeu num formato inesperado.',sem_permissao:'seu papel não pode ver o funil.',mfa_necessario:'confirme o MFA para ver o funil.'};
function fmtHoras(h){if(h==null)return '—';if(h<1)return Math.round(h*60)+' min';if(h<48)return (h<10?h.toLocaleString('pt-BR',{maximumFractionDigits:1}):Math.round(h))+' h';return (h/24).toLocaleString('pt-BR',{maximumFractionDigits:1})+' d';}
function celFunil(c,ordem){
 const td=el('td');
 if(!c){td.append(el('b',{},'—'));return td;}
 td.append(el('b',{},fmtNum(c.contas)));
 if(ordem>1){const t=c.taxa;td.append(el('small',{className:t==null?'':(t>=50?'bom':(t<20?'fraco':''))},t==null?'—':t+'% do anterior'));}
 return td;
}
function renderFunil(f){
 const box=$('funilBox');box.innerHTML='';
 $('funilSub').textContent='(cadastros das últimas '+f.semanas+' semanas)';
 if(f.vazio){box.append(el('div',{className:'empty'},'Nenhum cadastro nesta janela.'));$('funilNota').textContent=notaExclusao(f);return;}
 const tb=el('table'),th=el('thead'),hr=el('tr');
 hr.append(el('th',{},'Coorte'));for(const d of f.degraus)hr.append(el('th',{},d.rotulo));th.append(hr);tb.append(th);
 const body=el('tbody');
 const tot=el('tr',{className:'tot'});tot.append(el('td',{},el('b',{},'Todas')));f.total.forEach((c,i)=>tot.append(celFunil(c,f.degraus[i].ordem)));body.append(tot);
 const tempo=el('tr',{className:'tempo'});tempo.append(el('td',{},'Tempo mediano desde o degrau anterior'));f.total.forEach((c,i)=>tempo.append(el('td',{},i===0?'':fmtHoras(c&&c.medianaHorasAnterior))));body.append(tempo);
 for(const co of f.coortes){const tr=el('tr');tr.append(el('td',{},'sem. '+fmtDate(co.semana+'T12:00:00')));co.degraus.forEach((c,i)=>tr.append(celFunil(c,f.degraus[i].ordem)));body.append(tr);}
 tb.append(body);box.append(tb);
 $('funilNota').textContent='Conversão = dos que chegaram ao degrau anterior, quantos chegaram a este. Coorte = semana do cadastro (segunda a domingo, horário de Brasília). Para contas anteriores à ativação do funil, as datas de "perfil", "enviado", "aprovado" e "pagou" são aproximadas. '+notaExclusao(f);
}
function notaExclusao(f){
 if(!f.contasExcluidas)return 'Nenhuma conta interna fora do funil.';
 return 'Fora do funil: '+f.contasExcluidas+' conta(s) interna(s) — '+f.exclusoes.map(e=>e.rotulo+' '+e.contas).join(' · ')+'.';
}
async function carregarFunil(){
 const box=$('funilBox');box.innerHTML='';$('funilNota').textContent='';
 box.append(el('div',{className:'empty'},'Carregando funil…'));
 try{renderFunil(await api('funil?semanas=12'));}
 catch(e){if(String(e.message)==='401')return;box.innerHTML='';box.append(el('div',{className:'empty'},'Funil indisponível: '+(ERRO_FUNIL[e.codigo]||'não consegui ler os dados.')+' Nenhum número foi zerado — a leitura falhou.'));}
}

// ─── crédito de troca (conferência manual; concessão de acesso, não venda) ───
let TROCA=[],TROCA_FILTRO='pendente',TROCA_MAX=${CREDITO_TROCA_MESES_MAX};
const ERRO_TROCA={credito_troca_sem_migration:'a migration do crédito de troca ainda não foi aplicada.',credito_troca_indisponivel:'não consegui ler os pedidos.',sem_permissao:'seu papel não permite ver pedidos.',mfa_necessario:'confirme o MFA em Segurança.'};
const ERRO_DECISAO={pedido_ja_decidido:'Este pedido já foi decidido. Atualize a lista.',meses_invalidos:'Escolha um período válido.',motivo_invalido:'Motivo entre 3 e 500 caracteres.',pedido_inexistente:'Pedido não encontrado.'};
const ST_TROCA={pendente:'em análise',aprovado:'aprovado',recusado:'recusado'};
function dataSimples(d){return d?fmtDate(String(d).slice(0,10)+'T12:00:00'):'—';}
function renderTrocaFiltros(){const box=$('tfilters');box.innerHTML='';[['pendente','Em análise'],['','Todos']].forEach(f=>box.append(el('button',{className:'btn sm '+(TROCA_FILTRO===f[0]?'':'ghost'),onclick:()=>{TROCA_FILTRO=f[0];carregarTroca();}},f[1])));}
async function carregarTroca(){
 const box=$('trocaBox');renderTrocaFiltros();box.innerHTML='';box.append(el('div',{className:'empty'},'Carregando pedidos…'));
 try{const j=await api('creditos-troca'+(TROCA_FILTRO?'?status='+TROCA_FILTRO:''));TROCA=j.pedidos||[];TROCA_MAX=j.mesesMax||TROCA_MAX;renderTroca();}
 catch(e){if(String(e.message)==='401')return;box.innerHTML='';$('tcount').textContent='';box.append(el('div',{className:'empty'},'Pedidos indisponíveis: '+(ERRO_TROCA[e.codigo]||'não consegui ler os dados.')+' Isso não quer dizer que não há pedidos.'));}
}
function renderTroca(){
 const box=$('trocaBox');box.innerHTML='';$('tcount').textContent='('+TROCA.length+')';
 if(!TROCA.length){box.append(el('div',{className:'empty'},TROCA_FILTRO==='pendente'?'Nenhum pedido em análise.':'Nenhum pedido ainda.'));return;}
 const t=el('table'),hd=el('thead'),tr=el('tr');['Prestador','App anterior','Vence lá','Pedido','Situação',''].forEach((h,i)=>tr.append(el('th',{className:(i===2||i===3)?'hideSm':''},h)));hd.append(tr);t.append(hd);
 const tb=el('tbody');
 for(const p of TROCA){
  const sit=p.status==='aprovado'?(p.meses_concedidos+(p.meses_concedidos===1?' mês':' meses')+' · até '+fmtDate(p.concedido_ate)+(p.aviso_email_em?' · e-mail enviado':'')):p.status==='recusado'?(p.motivo_recusa||''):'aguardando conferência';
  const acts=el('td');acts.append(el('button',{className:'btn ghost sm',onclick:()=>openTroca(p)},p.status==='pendente'?'Conferir':'Ver'));
  const row=el('tr');
  row.append(el('td',{},el('div',{className:'uem'},p.email||('id '+String(p.user_id).slice(0,8))),p.observacao?el('div',{className:'ues'},p.observacao):null),el('td',{},p.app_anterior),el('td',{className:'hideSm'},dataSimples(p.vence_em)),el('td',{className:'hideSm'},fmtDate(p.criado_em)),el('td',{},el('span',{className:'pill '+(p.status==='recusado'?'off':'on')},ST_TROCA[p.status]||p.status),el('div',{className:'ues'},sit)),acts);
  tb.append(row);
 }
 t.append(tb);box.append(t);
}
function openTroca(p){
 const d=$('modal');d.innerHTML='';$('ov').classList.add('show');
 d.append(el('h3',{},'Crédito de troca · '+p.app_anterior),el('div',{className:'sub'},(p.email||p.user_id)+' · pedido em '+fmtDate(p.criado_em)+(p.vence_em?' · vence lá em '+dataSimples(p.vence_em):'')));
 if(p.observacao)d.append(el('div',{className:'li'},el('span',{},'Observação'),el('span',{className:'muted'},p.observacao)));
 const prev=el('div',{style:'margin:14px 0;min-height:60px'},el('p',{className:'muted'},'Carregando comprovante…'));d.append(prev);
 api('creditos-troca/comprovante?id='+encodeURIComponent(p.id)).then(j=>{prev.innerHTML='';prev.append(el('img',{src:j.url,alt:'Comprovante enviado pelo prestador',style:'max-width:100%;max-height:60vh;border-radius:12px;border:1px solid var(--line);display:block'}),el('a',{href:j.url,target:'_blank',rel:'noopener noreferrer',style:'color:var(--cyl);font-size:13px;display:inline-block;margin-top:8px'},'Abrir em nova aba (vale 5 min)'));}).catch(e=>{if(String(e.message)==='401')return;prev.innerHTML='';prev.append(el('p',{className:'err'},'Não consegui abrir o comprovante ('+(e.codigo||'erro')+'). Não aprove sem conferir.'));});
 const acts=el('div',{className:'acts'});acts.append(el('button',{className:'btn soft sm',onclick:modalClose},'Fechar'));
 if(p.status==='pendente'){
  const meses=el('select');for(let i=1;i<=TROCA_MAX;i++)meses.append(el('option',{value:String(i),selected:i===(p.mesesSugeridos||TROCA_MAX)},i+(i===1?' mês':' meses')+' de Pro'));
  const motivo=el('input',{placeholder:'Motivo (vai para a auditoria; na recusa, o prestador lê)'});
  d.append(el('div',{className:'sub'},'Concessão de acesso, não venda: o gateway não é tocado. Nunca rebaixa um plano maior nem encurta uma vigência maior. 1 vez por conta.'),el('label',{},'Liberar por'),meses,el('label',{},'Motivo'),motivo);
  const aprovar=el('button',{className:'btn sm'},'Aprovar'),recusar=el('button',{className:'btn danger sm'},'Recusar');
  const decidir=async ok=>{
   const m=motivo.value.trim()||(ok?'Comprovante conferido':'');
   if(m.length<3){toast('Na recusa, escreva o motivo para o prestador.','err');return;}
   if(!confirm(ok?('Liberar Pro por '+meses.value+(meses.value==='1'?' mês':' meses')+' para '+(p.email||'este prestador')+'? É 1 vez por conta.'):'Recusar este pedido? O prestador vai ler o motivo.'))return;
   aprovar.disabled=true;recusar.disabled=true;
   try{
    const j=await api('creditos-troca/decidir',{method:'POST',body:JSON.stringify({id:p.id,aprovar:ok,meses:ok?Number(meses.value):null,motivo:m,requestId:crypto.randomUUID()})});
    modalClose();
    const em=j.aviso&&j.aviso.email;
    const aviso=em==='enviado'?'E-mail enviado.':em==='desligado'?'E-mail desligado; o prestador vê no app.':'E-mail não saiu; o prestador vê no app.';
    toast(ok?('Aprovado: '+(j.planoEfetivo||'pro')+' até '+(j.acessoAte?fmtDate(j.acessoAte):'sem data final')+'. '+aviso):'Pedido recusado.','ok');
    await carregarTroca();
   }catch(e){toast(ERRO_DECISAO[e.codigo]||mensagemErro(e),'err');}
   finally{aprovar.disabled=false;recusar.disabled=false;}
  };
  aprovar.onclick=()=>decidir(true);recusar.onclick=()=>decidir(false);
  acts.append(recusar,aprovar);
 }
 d.append(acts);
}

async function loadDash(){
 if(!ME||ME.aal!=='aal2'){mostrarGateMfa();return;}
 liberarDados();
 carregarFunil();
 carregarTroca();
 show('dash');$('cards').innerHTML='';$('urows').innerHTML='';
 for(let i=0;i<6;i++){const c=el('div',{className:'card'});c.append(el('div',{className:'skel',style:'width:60%;height:24px'}),el('div',{className:'skel',style:'width:40%;margin-top:10px'}));$('cards').append(c);}
 try{
  const [m,u,fb]=await Promise.all([api('metrics'),api('users'),api('feedback').catch(()=>({feedback:[]}))]);
  MET=m;ALLUSERS=u.users||[];
  renderCards(m);$('ucount').textContent='('+ALLUSERS.length+')';applySearch();
  ALLFB=(fb&&fb.feedback)||[];renderFbFilters();renderFeedback();
 }catch(e){if(String(e.message)!=='401')toast('Erro ao carregar.','err');}
}

function modalClose(){$('ov').classList.remove('show');}
async function downloadUserReport(x){
 const motivo=prompt('Informe o motivo do relatório TXT (fica na auditoria):');
 if(!motivo||motivo.trim().length<3)return;
 try{
  const url='/admin/api/user/report?id='+encodeURIComponent(x.id)+'&motivo='+encodeURIComponent(motivo.trim());
  const r=await fetch(url,{headers:{Authorization:'Bearer '+TOKEN}});
  if(r.status===401){logout();return;}
  if(!r.ok){const j=await r.json().catch(()=>({}));toast(j.erro||'Não consegui gerar o relatório.','err');return;}
  const blob=await r.blob(),link=document.createElement('a'),href=URL.createObjectURL(blob);
  link.href=href;link.download='olli-usuario-relatorio.txt';document.body.append(link);link.click();link.remove();URL.revokeObjectURL(href);toast('Relatório TXT baixado.','ok');
 }catch{toast('Falha ao gerar o relatório.','err');}
}
async function openUser(x){
 const ov=$('ov'),d=$('modal');d.innerHTML='<p class="muted">Carregando…</p>';ov.classList.add('show');
 try{
  const det=await api('user?id='+encodeURIComponent(x.id));
  d.innerHTML='';
  const head=el('div',{className:'mhead'});head.append(el('div',{className:'av',style:'width:44px;height:44px;border-radius:14px;font-size:18px'},initials(x.nome||x.email)),el('div',{},el('h3',{},x.email||'—'),el('div',{className:'sub'},(det.empresa&&det.empresa.nome?det.empresa.nome:'(sem empresa)'))));
  d.append(head);
  d.append(el('div',{className:'sub'},'Cadastro '+fmtDate(x.criadoEm)+' · último acesso '+fmtDate(x.ultimoAcesso)+' · '+(x.bloqueado?'BLOQUEADO':'ativo')));
  const aprov=det.orcamentos.filter(o=>o.status==='aprovado');
  const fat=aprov.reduce((s,o)=>s+(Number(o.valor_total)||0),0);
  const ent=det.entitlement||{plano:'gratis',origem:'gratis'};
  const mini=el('div',{className:'mini'});
  [['Plano',ent.plano+(ent.origem==='admin'?' · manual':'')],['Frequência',x.frequencia||'nunca'],['Logins registrados',x.logins??0],['Último uso',fmtDate(x.ultimoUso)],['Saldo',String(det.saldoCreditos||0)+' créditos'],['IA grátis',String((det.usosIa||[]).length)+' usos'],['Orçamentos',det.orcamentos.length],['Aprovados',aprov.length],['Faturamento',fmtBRL(fat)],['Clientes',det.clientes.length],['Agenda',det.agenda.length],['Recibos',det.recibos.length]].forEach(p=>{const c=el('div',{className:'mc'});c.append(el('div',{className:'v'},String(p[1])),el('div',{className:'l'},p[0]));mini.append(c);});
  d.append(mini);
  const mk=(title,rows)=>{const s=el('div',{className:'sec'});s.append(el('h4',{},title));if(!rows.length){s.append(el('div',{className:'muted',style:'font-size:13px'},'nenhum'));}else rows.forEach(r=>s.append(el('div',{className:'li'},el('span',{},r[0]),el('span',{className:'muted'},r[1]))));return s;};
  d.append(mk('Orçamentos recentes',det.orcamentos.slice(0,10).map(o=>['Nº'+o.numero+' · '+(o.cliente_nome||''),fmtBRL(o.valor_total)+' · '+o.status])));
  const ass=det.assinatura;
  d.append(mk('Assinatura e concessão',ass?[
   ['Plano do gateway',(ass.plano||'—')+' · '+(ass.status||'—')],
   ['Vigência',fmtDate(ass.current_period_end)],
   ['Override manual',ass.admin_override_ativo?((ass.admin_plano_override||'—')+' até '+(ass.admin_override_ate?fmtDate(ass.admin_override_ate):'revogação')):'inativo'],
   ['Mercado Pago',ass.mercadoPagoVinculado?'vinculado':'—'],
   ['Stripe',ass.stripeVinculado?'vinculada':'—'],
  ]:[['Estado','Sem assinatura; plano Grátis']]))
  d.append(mk('Faturas Stripe',det.faturas.slice(0,12).map(f=>[fmtDate(f.criadoEm)+' · '+(f.status||'—'),fmtBRL((f.valorCentavos||0)/100)])));
  d.append(mk('Créditos recentes',det.creditos.slice(0,12).map(c=>[(Number(c.delta)>0?'+':'')+c.delta+' · '+c.origem,fmtDate(c.criado_em)])));
  d.append(mk('Auditoria administrativa',det.auditoria.slice(0,10).map(a=>[a.acao+' · '+a.motivo,fmtDate(a.criado_em)])));
  d.append(mk('Atividade registrada',det.atividade.slice(0,30).map(a=>[a.evento+' · '+a.plataforma,fmtDate(a.criado_em)])));
  d.append(mk('Clientes',det.clientes.slice(0,10).map(c=>[c.nome||'—',c.telefone||''])));
  d.append(mk('Agenda',det.agenda.slice(0,8).map(a=>[a.titulo||'—',fmtDate(a.inicio)+' · '+a.status])));
  const acts=el('div',{className:'acts'});
  acts.append(el('button',{className:'btn soft sm',onclick:modalClose},'Fechar'));
  acts.append(el('button',{className:'btn ghost sm',onclick:()=>openPlanForm(x,'pro',true)},'Conceder Pro'));
  acts.append(el('button',{className:'btn ghost sm',onclick:()=>openPlanForm(x,'empresa',true)},'Conceder Empresa'));
  if(ass&&ass.admin_override_ativo)acts.append(el('button',{className:'btn ghost sm',onclick:()=>openPlanForm(x,null,false)},'Revogar plano manual'));
  const fe=(det.funil&&det.funil.estado)||'indisponivel';
  const podeFunil=['owner','admin'].includes(ME&&ME.papel);
  if(podeFunil&&fe==='indisponivel')acts.append(el('button',{className:'btn ghost sm',disabled:true,title:'Não consegui ler a lista de contas internas'},'Funil: estado indisponível'));
  else if(podeFunil)acts.append(el('button',{className:'btn ghost sm',onclick:()=>setFunil(x,fe!=='interna')},fe==='interna'?'Devolver ao funil':'Tirar do funil (conta interna)'));
  acts.append(el('button',{className:'btn ghost sm',onclick:()=>act(x,'reset')},'Enviar reset de senha'));
  acts.append(el('button',{className:'btn ghost sm',onclick:()=>downloadUserReport(x)},'Baixar relatório TXT'));
  acts.append(el('button',{className:'btn ghost sm',onclick:()=>act(x,x.bloqueado?'unban':'ban')},x.bloqueado?'Desbloquear':'Bloquear'));
  acts.append(el('button',{className:'btn danger sm',onclick:()=>act(x,'delete')},'Excluir conta'));
  d.append(acts);
 }catch(e){d.innerHTML='<p class="muted">Erro ao carregar.</p>';}
}
async function act(x,a){
 const motivo=prompt('Informe o motivo desta ação (fica na auditoria):');if(!motivo||motivo.trim().length<3)return;
 const requestId=crypto.randomUUID();
 if(a==='reset'){try{await api('user/reset?email='+encodeURIComponent(x.email),{method:'POST',body:JSON.stringify({motivo,requestId})});toast('Reset enviado para '+x.email,'ok');}catch(e){toast(mensagemErro(e),'err');}return;}
 const msg={ban:'Bloquear '+x.email+'?',unban:'Desbloquear '+x.email+'?',delete:'EXCLUIR '+x.email+' e TODOS os dados? Não tem volta.'}[a];
 if(!confirm(msg))return;
 const confirmacao=a==='delete'?prompt('Digite EXCLUIR para confirmar:'):undefined;
 if(a==='delete'&&confirmacao!=='EXCLUIR')return;
 try{await api('user/'+a+'?id='+encodeURIComponent(x.id),{method:'POST',body:JSON.stringify({motivo,requestId,confirmacao})});modalClose();toast(a==='delete'?'Conta excluída':'Feito','ok');await loadDash();}catch(e){toast(mensagemErro(e),'err');}
}

async function setFunil(x,excluir){
 const motivo=prompt(excluir?'Por que esta conta é interna? (ex.: conta de teste do dono)':'Por que esta conta volta ao funil?');if(!motivo||motivo.trim().length<3)return;
 try{await api('funil/exclusao?id='+encodeURIComponent(x.id),{method:'POST',body:JSON.stringify({excluir,motivo:motivo.trim().slice(0,200),requestId:crypto.randomUUID()})});toast(excluir?'Conta fora do funil.':'Conta de volta ao funil.','ok');await openUser(x);carregarFunil();}catch(e){toast(mensagemErro(e),'err');}
}

function mensagemErro(e){
 if(e&&e.codigo==='mfa_necessario')return 'Confirme o MFA em Segurança antes desta ação.';
 if(e&&e.codigo==='sem_permissao')return 'Seu papel não permite esta ação.';
 return (e&&e.message&&e.message!=='falha_entitlement')?e.message:'Não consegui concluir a ação.';
}

function openPlanForm(x,plano,ativo){
 const d=$('modal');d.innerHTML='';d.append(el('h3',{},ativo?('Conceder '+plano.toUpperCase()):'Revogar plano manual'),el('div',{className:'sub'},'A assinatura do gateway não será alterada. A mudança fica registrada na auditoria.'));
 const motivo=el('input',{placeholder:'Motivo obrigatório (ex.: cortesia comercial)'});d.append(el('label',{},'Motivo'),motivo);
 let dias=null;
 if(ativo){dias=el('input',{type:'number',min:'1',max:'3650',placeholder:'Dias de vigência (vazio = até revogar)'});d.append(el('label',{},'Vigência'),dias);}
 const acts=el('div',{className:'acts'}),save=el('button',{className:'btn sm'},ativo?'Conceder':'Revogar');
 save.onclick=async()=>{const m=motivo.value.trim();if(m.length<3){toast('Informe um motivo.','err');return;}let ate=null;if(ativo&&dias.value){const n=Number(dias.value);if(!Number.isInteger(n)||n<1||n>3650){toast('Use entre 1 e 3650 dias.','err');return;}ate=new Date(Date.now()+n*86400000).toISOString();}save.disabled=true;try{await api('user/plan?id='+encodeURIComponent(x.id),{method:'POST',body:JSON.stringify({plano,ativo,ate,motivo:m,requestId:crypto.randomUUID()})});modalClose();toast('Plano atualizado.','ok');await loadDash();}catch(e){toast(mensagemErro(e),'err');}finally{save.disabled=false;}};
 acts.append(el('button',{className:'btn ghost sm',onclick:()=>openUser(x)},'Cancelar'),save);d.append(acts);
}

async function openAdmins(){
 const d=$('modal');d.innerHTML='<p class="muted">Carregando administradores…</p>';$('ov').classList.add('show');
 try{
  const j=await api('admins');d.innerHTML='';d.append(el('h3',{},'Administradores'),el('div',{className:'sub'},'O e-mail raiz continua protegido. Outros acessos têm papel explícito e podem ser revogados.'));
  if(j.bootstrapEmail)d.append(el('div',{className:'li'},el('span',{},j.bootstrapEmail),el('span',{className:'pill on'},'owner · raiz')));
  for(const a of j.admins){const row=el('div',{className:'li'}),left=el('span',{},(a.email||a.user_id)+' · '+a.papel),right=el('span',{});right.append(el('span',{className:'pill '+(a.ativo?'on':'off')},a.ativo?'ativo':'revogado'));if(a.ativo)right.append(' ',el('button',{className:'btn danger sm',onclick:()=>salvarAdmin(a.email,a.papel,false)},'Revogar'));row.append(left,right);d.append(row);}
  d.append(el('h4',{style:'margin-top:20px'},'Adicionar ou atualizar'));
  const email=el('input',{type:'email',placeholder:'e-mail de uma conta OLLI existente'}),papel=el('select');['admin','financeiro','suporte','leitura'].forEach(p=>papel.append(el('option',{value:p},p)));
  const motivo=el('input',{placeholder:'Motivo obrigatório'});d.append(email,papel,motivo);
  const acts=el('div',{className:'acts'}),save=el('button',{className:'btn sm'},'Salvar acesso');save.onclick=()=>salvarAdmin(email.value,papel.value,true,motivo.value);
  acts.append(el('button',{className:'btn ghost sm',onclick:modalClose},'Fechar'),save);d.append(acts);
 }catch(e){d.innerHTML='';d.append(el('p',{className:'err'},mensagemErro(e)),el('button',{className:'btn ghost sm',onclick:modalClose},'Fechar'));}
}

async function salvarAdmin(email,papel,ativo,motivoInformado){
 const motivo=(motivoInformado||prompt('Informe o motivo desta alteração:')||'').trim();if(motivo.length<3)return;
 try{await api('admins',{method:'POST',body:JSON.stringify({email:email.trim(),papel,ativo,motivo,requestId:crypto.randomUUID()})});toast(ativo?'Acesso administrativo salvo.':'Acesso revogado.','ok');await openAdmins();}catch(e){toast(mensagemErro(e),'err');}
}

async function openAudit(){
 const d=$('modal');d.innerHTML='<p class="muted">Carregando auditoria…</p>';$('ov').classList.add('show');
 try{const j=await api('audit');d.innerHTML='';d.append(el('h3',{},'Auditoria administrativa'),el('div',{className:'sub'},'Últimas 300 ações; registros não podem ser alterados ou apagados.'));for(const a of j.auditoria){d.append(el('div',{className:'li'},el('span',{},a.acao+' · '+a.motivo),el('span',{className:'muted'},a.actor_role+' · '+fmtDate(a.criado_em))));}d.append(el('button',{className:'btn ghost sm',onclick:modalClose,style:'margin-top:16px'},'Fechar'));}catch(e){d.innerHTML='';d.append(el('p',{className:'err'},mensagemErro(e)),el('button',{className:'btn ghost sm',onclick:modalClose,style:'margin-top:16px'},'Fechar'));}
}

function openPwd(){
 const d=$('modal');d.innerHTML='';
 d.append(el('h3',{},'Trocar minha senha'));
 d.append(el('div',{className:'sub'},'Mínimo 8 caracteres.'));
 const i1=el('input',{type:'password',placeholder:'nova senha',className:'field'}),i2=el('input',{type:'password',placeholder:'repetir nova senha'});
 d.append(i1,i2);
 const acts=el('div',{className:'acts'});
 acts.append(el('button',{className:'btn soft sm',onclick:modalClose},'Cancelar'));
 const save=el('button',{className:'btn sm',onclick:async()=>{
  if(i1.value.length<8){toast('Senha muito curta (mín. 8).','err');return;}
  if(i1.value!==i2.value){toast('As senhas não batem.','err');return;}
  save.disabled=true;save.textContent='Salvando…';
  try{const j=await api('me/password',{method:'POST',body:JSON.stringify({senha:i1.value})});if(j.ok){modalClose();toast('Senha alterada ✓','ok');}else{toast('Não consegui alterar.','err');}}catch(e){toast('Falha.','err');}
  finally{save.disabled=false;save.textContent='Salvar';}
 }},'Salvar');
 acts.append(save);d.append(acts);
 $('ov').classList.add('show');
}

$('loginBtn').onclick=login;
$('senha').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
$('logoutBtn').onclick=logout;
$('refreshBtn').onclick=loadDash;
$('mfaBtn').onclick=abrirSeguranca;
$('mfaGateBtn').onclick=abrirSeguranca;
$('adminsBtn').onclick=openAdmins;
$('auditBtn').onclick=openAudit;
$('pwdBtn').onclick=openPwd;
$('usearch').addEventListener('input',applySearch);
$('ov').onclick=e=>{if(e.target===$('ov'))modalClose();};
if(TOKEN){(async()=>{try{await carregarIdentidade();const fatores=await listarFatoresMfa();if(ME&&ME.aal!=='aal2'){mostrarGateMfa();if(fatores.length)await abrirDesafioMfa(fatores[0]);}else await loadDash();}catch(e){logout();}})();}else{show('login');}
</script>
</body></html>`;
}
