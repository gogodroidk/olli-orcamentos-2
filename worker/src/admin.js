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
 *   Sessão e aparelho confiável (adminSessao.js):
 *   POST /admin/api/sessao | /sessao/renovar | /sessao/sair  → refresh token em cookie HttpOnly
 *   POST /admin/api/aparelho/confiar     → lembrar este aparelho por 30 dias (só com TOTP)
 *   GET  /admin/api/aparelhos            → aparelhos lembrados do próprio admin
 *   POST /admin/api/aparelhos/revogar?id=<uuid>|todos
 *
 *   Ferramentas de conta (adminFerramentas.js):
 *   POST /admin/api/user/creditos?id=    → adicionar/remover créditos (livro-razão, origem 'ajuste')
 *   POST /admin/api/user/sessoes/revogar?id= → desconectar o usuário de todos os aparelhos
 *   POST /admin/api/user/email/confirmar?id= → marcar e-mail como confirmado
 *   POST /admin/api/user/acesso/enviar?id=   → mandar código de acesso por e-mail ao usuário
 *   POST /admin/api/user/nota?id=        → nota interna (linha `nota_interna` na trilha)
 *   GET  /admin/api/cnpj?cnpj=           → dados públicos da Receita (BrasilAPI → OpenCNPJ)
 *   POST /admin/api/export/registrar     → audita a exportação CSV antes do download
 *   GET  /admin/api/busca?q=             → contas (e-mail, nome) e orçamentos
 *   GET  /admin/api/orcamentos           → lista com status e texto, sem apagados
 *   POST /admin/api/users/lote           → bloquear, desbloquear ou nota, com motivo
 *
 * A página (HTML/CSS/JS) mora em adminPagina.js.
 * Segurança: toda rota /admin/api exige JWT validado pelo Supabase. O e-mail
 * ADMIN_EMAIL é o owner de recuperação; administradores adicionais vivem em
 * public.admin_memberships com RBAC. Ações críticas exigem AAL2 (TOTP nesta
 * sessão ou aparelho confiável) e deixam trilha append-only; excluir conta e mexer
 * em administradores exigem o TOTP desta sessão. Só depois disso o Worker usa SERVICE_ROLE, nunca o browser.
 */

import { apagarArquivosDoUsuario, cancelarAssinaturaStripe, excluirFeedbackDoUsuario, getAssinatura } from './conta.js';
import { cancelarPreapprovalMp, lerPreapprovalGravado } from './mercadopago.js';
import { cancelarPlayDoUsuario } from './play.js';
import { derivarEntitlement } from './entitlement.js';
import { contextoContasInternas, origemParaLista, resumirReceita } from './assinaturasPagantes.js';
import { classificarConta, ehUuid, montarPreviaOrg, particionarContas, soDeClientes, validarPedidoOrg } from './contasInternas.js';
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
import { saldoCreditos } from './creditos.js';
import { PLANO_PIX } from './mercadopago.js';
import {
  confiarAparelho,
  dispositivoConfiavel,
  encerrarSessao,
  iniciarSessao,
  listarAparelhos,
  marcarUsoAparelho,
  renovarSessao,
  revogarAparelhos,
} from './adminSessao.js';
import {
  CREDITOS_AJUSTE_MAX,
  ajustarCreditos,
  confirmarEmail,
  consultarCnpj,
  enviarAcesso,
  notaInterna,
  registrarExport,
  revogarSessoesUsuario,
} from './adminFerramentas.js';
import { adminHtml } from './adminPagina.js';
import {
  buscarUsuarios,
  consultaOrcamentos,
  juntarPorId,
  normalizarTermo,
  projetarOrcamentoLista,
  resumirChurn,
  resumirConversaoPorPlano,
  resumirVencendo,
  validarLote,
} from './adminOperacao.js';

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
    let aal = payload.aal === 'aal2' ? 'aal2' : 'aal1';
    let aalVia = aal === 'aal2' ? 'mfa' : 'senha';
    let aparelho = null;
    // Aparelho confiável (cookie HttpOnly + hash no banco): a senha basta neste
    // aparelho, porque o código do autenticador já foi confirmado nele. Só eleva
    // uma sessão já validada acima; qualquer falha na leitura mantém AAL1.
    if (aal === 'aal1') {
      aparelho = await dispositivoConfiavel(request, env, u.id);
      if (aparelho) { aal = 'aal2'; aalVia = 'aparelho'; }
    }
    const extra = { aal, aalVia, aparelho };

    // Recuperação do dono: a env continua sendo a raiz de confiança e permite
    // entrar mesmo se a tabela de memberships estiver indisponível/corrompida.
    const bootstrap = adminEmail(env);
    if (bootstrap && String(u.email || '').trim().toLowerCase() === bootstrap) {
      return { ...u, papel: 'owner', ...extra, bootstrap: true };
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
    return { ...u, papel, ...extra, bootstrap: false };
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

// `mfaReal`: ações irreversíveis (excluir conta, mexer em administradores) não
// aceitam a elevação por aparelho confiável — pedem o código desta sessão.
function exigir(user, permissao, { aal2 = false, mfaReal = false } = {}) {
  if (!pode(user, permissao)) return json({ ok: false, erro: 'sem_permissao' }, 403);
  if ((aal2 || mfaReal) && user.aal !== 'aal2') return json({ ok: false, erro: 'mfa_necessario' }, 403);
  if (mfaReal && user.aalVia !== 'mfa') return json({ ok: false, erro: 'mfa_recente_necessario' }, 403);
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
// Preço mensal de tabela (fonte: PLANO_PIX em mercadopago.js). Usado só para o
// MRR ESTIMADO da visão geral; o painel diz que é estimativa.
const PRECO_MENSAL = {
  pro: PLANO_PIX.pro_mensal.valor,
  empresa: PLANO_PIX.empresa_mensal.valor,
};

async function metrics(env) {
  const [todosUsuarios, orcsLeitura, todosClientes, agendTodos, todasAtividades, assinaturas, exclusoes, admins] = await Promise.all([
    listAuthUsers(env),
    // NÚMERO DE NEGÓCIO: 3 estados (ver comentário de lerEstado). rest() devolveria [] numa falha e o painel mostraria
    // "R$ 0,00" / "0 orçamentos" como se fosse verdade.
    lerEstado(env, 'orcamentos?select=user_id,valor_total,status,criado_em'),
    rest(env, 'clientes?select=id,user_id'),
    rest(env, 'agendamentos?select=id,user_id'),
    listarAtividades(env),
    lerEstado(env, 'assinaturas?select=user_id,plano,status,current_period_end,stripe_subscription_id,stripe_customer_id,mp_preapproval_id,revenuecat_transacao_id,admin_plano_override,admin_override_ativo,admin_override_ate'),
    lerEstado(env, 'funil_exclusoes?select=user_id,email'),
    lerEstado(env, 'admin_memberships?select=user_id'),
  ]);
  const now = Date.now();
  const DAY = 86400000;
  // Orçamentos ilegíveis ≠ zero orçamentos: tudo o que deriva deles sai como `null` + `orcamentosEstado:'indisponivel'`.
  const orcamentosOk = orcsLeitura.ok;
  const todosOrcs = orcamentosOk ? orcsLeitura.dados : [];
  // Contas INTERNAS (Igor, GR Tech, demo, administradores) ficam FORA de todo número abaixo. Sem a lista legível o
  // escopo é 'indeterminado' e o painel avisa (erro nunca vira "só clientes").
  const internasLegiveis = exclusoes.ok && admins.ok;
  const contextoInternas = contextoContasInternas({
    emailsDono: emailsForaDoFunil(env),
    exclusoes: exclusoes.ok ? exclusoes.dados : [],
    admins: admins.ok ? admins.dados : [],
  });
  const particao = particionarContas(todosUsuarios, contextoInternas, internasLegiveis);
  const users = particao.clientes;
  const orcs = soDeClientes(todosOrcs, particao.idsInternas);
  const clientes = soDeClientes(todosClientes, particao.idsInternas);
  const atividades = soDeClientes(todasAtividades, particao.idsInternas);
  const agend = soDeClientes(agendTodos, particao.idsInternas);
  const aprovados = orcs.filter((o) => o.status === 'aprovado');
  const faturamento = aprovados.reduce((s, o) => s + (Number(o.valor_total) || 0), 0);
  const ticket = aprovados.length ? faturamento / aprovados.length : 0;
  const conversao = orcs.length ? Math.round((aprovados.length / orcs.length) * 100) : 0;
  const ativos = users.filter((u) => u.last_sign_in_at).length;
  const novosHoje = users.filter((u) => u.created_at && now - new Date(u.created_at).getTime() < DAY).length;
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
  const porUsuarioTodos = agruparAtividade(todasAtividades);
  const resumos = users.map((u) => resumirAtividade(u, porUsuario.get(u.id), now));
  const atividade30 = atividades.filter((row) => row && Date.parse(row.criado_em) >= now - 30 * DAY);
  const unicos = (dias) => new Set(
    atividades.filter((row) => row && row.user_id && Date.parse(row.criado_em) >= now - dias * DAY).map((row) => row.user_id),
  ).size;
  const dau = unicos(1);
  const wau = unicos(7);
  const mau = unicos(30);

  // Ativação = conta que já criou ao menos 1 orçamento.
  const comOrcamento = new Set(orcs.map((o) => o.user_id).filter(Boolean));
  const idsUsuarios = new Set(users.map((u) => u.id));
  const ativados = [...comOrcamento].filter((id) => idsUsuarios.has(id)).length;

  // Receita: só sai número quando as leituras deram certo (3 estados). Sem a
  // lista de contas internas, um Pix de teste do dono viraria MRR — então
  // falha de qualquer leitura esconde o número, nunca o infla.
  let receita = { estado: 'indisponivel' };
  if (assinaturas.ok && exclusoes.ok && admins.ok) {
    receita = resumirReceita({
      assinaturas: assinaturas.dados,
      // A receita olha TODAS as contas (o plano pago de uma conta interna cai em "manuais", não some): o que a exclui de
      // pagantes/MRR é o `contexto` abaixo, não o escopo de clientes das demais métricas.
      usuarios: todosUsuarios.map((u) => ({ id: u.id, email: u.email, ultimoUso: resumirAtividade(u, porUsuarioTodos.get(u.id), now).ultimoUso })),
      contexto: contextoContasInternas({
        emailsDono: emailsForaDoFunil(env),
        exclusoes: exclusoes.dados,
        admins: admins.dados,
      }),
      precoMensal: PRECO_MENSAL,
      agoraMs: now,
    });
  }

  return json({
    ok: true,
    // Escopo dos números: 'confirmado' = só CLIENTES (internas fora); 'indeterminado' = a lista de internas não foi lida,
    // os números incluem todas as contas e o painel avisa.
    escopo: particao.escopo, contasInternas: particao.internas.length, internasLegiveis,
    usuarios: users.length, ativos, novosHoje, novos7, novos30,
    orcamentosEstado: orcamentosOk ? 'ok' : 'indisponivel',
    orcamentos: orcamentosOk ? orcs.length : null, aprovados: orcamentosOk ? aprovados.length : null,
    conversao: orcamentosOk ? conversao : null,
    clientes: clientes.length, agendamentos: agend.length,
    faturamento: orcamentosOk ? faturamento : null, ticket: orcamentosOk ? ticket : null, spark,
    usando30: resumos.filter((item) => item.atividades30 > 0).length,
    frequentes: resumos.filter((item) => item.frequencia === 'frequente').length,
    nuncaUsaram: resumos.filter((item) => item.frequencia === 'nunca').length,
    logins30: atividade30.filter((row) => row.evento === 'login').length,
    atividade30: atividade30.length,
    atividadeLimitada: atividades.length >= ATIVIDADE_MAX_ROWS,
    dau, wau, mau,
    ativados: orcamentosOk ? ativados : null,
    nuncaOrcaram: orcamentosOk ? Math.max(0, users.length - ativados) : null,
    taxaAtivacao: orcamentosOk ? (users.length ? Math.round((ativados / users.length) * 100) : 0) : null,
    receita,
    operacao: operacaoPainel({
      assinaturas, exclusoes, admins, todosUsuarios, usuariosClientes: users, orcamentos: orcamentosOk ? orcs : null, contexto: contextoInternas, agoraMs: now,
    }),
  });
}

function operacaoPainel({ assinaturas, exclusoes, admins, todosUsuarios, usuariosClientes, orcamentos, contexto, agoraMs }) {
  const vazio = {
    churn: { estado: 'indisponivel' },
    vencendo: { estado: 'indisponivel' },
    conversaoPorPlano: { estado: 'indisponivel' },
  };
  if (!assinaturas.ok || !exclusoes.ok || !admins.ok) return vazio;
  const todos = todosUsuarios.map((u) => ({ id: u.id, email: u.email }));
  const clientes = usuariosClientes.map((u) => ({ id: u.id, email: u.email }));
  return {
    churn: resumirChurn({ assinaturas: assinaturas.dados, usuarios: todos, contexto, agoraMs }),
    vencendo: resumirVencendo({ assinaturas: assinaturas.dados, usuarios: todos, contexto, agoraMs }),
    conversaoPorPlano: resumirConversaoPorPlano({
      usuarios: clientes,
      assinaturas: assinaturas.dados,
      orcamentos,
      contexto,
      agoraMs,
    }),
  };
}

async function users(env) {
  // Plano, orçamentos e empresa são lidos em 3 estados (lerEstado): rest() devolve [] em QUALQUER falha, e aí todo usuário
  // virava plano 'gratis' / faturamento 0 sem aviso. Fonte ilegível => campo null + `fontes.<fonte>:'indisponivel'`.
  const [auth, empresasLeitura, orcsLeitura, assinaturasLeitura, atividades, exclusoes, admins] = await Promise.all([
    listAuthUsers(env),
    lerEstado(env, 'empresa?select=user_id,dados'),
    lerEstado(env, 'orcamentos?select=user_id,status,valor_total'),
    lerEstado(env, 'assinaturas?select=user_id,plano,status,current_period_end,stripe_subscription_id,stripe_customer_id,admin_plano_override,admin_override_ativo,admin_override_ate'),
    listarAtividades(env),
    lerEstado(env, 'funil_exclusoes?select=user_id,email'),
    lerEstado(env, 'admin_memberships?select=user_id'),
  ]);
  const empresasOk = empresasLeitura.ok;
  const orcsOk = orcsLeitura.ok;
  const assinaturasOk = assinaturasLeitura.ok;
  const empresas = empresasOk ? empresasLeitura.dados : [];
  const orcs = orcsOk ? orcsLeitura.dados : [];
  const assinaturas = assinaturasOk ? assinaturasLeitura.dados : [];
  const fontes = {
    empresa: empresasOk ? 'ok' : 'indisponivel',
    orcamentos: orcsOk ? 'ok' : 'indisponivel',
    assinaturas: assinaturasOk ? 'ok' : 'indisponivel',
  };
  const empByUser = new Map();
  for (const e of empresas) empByUser.set(e.user_id, (e.dados && typeof e.dados === 'object') ? e.dados : {});
  const cnt = new Map();
  const fat = new Map();
  const plano = new Map();
  // Rótulo só: cortesia, demo e conta interna aparecem como "liberado". Lista
  // interna ilegível não esconde a lista de contas — só deixa de marcar.
  const contexto = contextoContasInternas({
    emailsDono: emailsForaDoFunil(env),
    exclusoes: exclusoes.ok ? exclusoes.dados : [],
    admins: admins.ok ? admins.dados : [],
  });
  const emailPorId = new Map(auth.map((u) => [u.id, u.email]));
  // Fail-closed (mesmo critério do bloco de receita): sem as DUAS listas internas, plano pago vira
  // 'indeterminada' em vez de 'pagamento' — nunca infla Pagantes nem "Pagos sem uso 14d".
  const leituraInternaOk = exclusoes.ok && admins.ok;
  for (const a of assinaturas) plano.set(a.user_id, origemParaLista(a, emailPorId.get(a.user_id), contexto, leituraInternaOk));
  const apr = new Map();
  for (const o of orcs) {
    cnt.set(o.user_id, (cnt.get(o.user_id) || 0) + 1);
    if (o.status === 'aprovado') {
      fat.set(o.user_id, (fat.get(o.user_id) || 0) + (Number(o.valor_total) || 0));
      apr.set(o.user_id, (apr.get(o.user_id) || 0) + 1);
    }
  }
  const porUsuario = agruparAtividade(atividades);
  const lista = auth.map((u) => ({
    id: u.id,
    email: u.email || '',
    nome: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '',
    empresa: String((empByUser.get(u.id) || {}).nome || ''),
    cidade: [(empByUser.get(u.id) || {}).cidade, (empByUser.get(u.id) || {}).estado].filter(Boolean).join('/'),
    segmento: String((empByUser.get(u.id) || {}).segmento || ''),
    whatsapp: String((empByUser.get(u.id) || {}).whatsapp || (empByUser.get(u.id) || {}).telefone || ''),
    provedor: (u.app_metadata && u.app_metadata.provider) || 'email',
    emailConfirmado: !!u.email_confirmed_at,
    criadoEm: u.created_at || '',
    ultimoAcesso: u.last_sign_in_at || '',
    bloqueado: !!(u.banned_until && new Date(u.banned_until) > new Date()),
    bloqueadoAte: u.banned_until || null,
    // Interna × cliente (mesma regra do funil de receita). Sem a lista legível, NÃO se afirma nada: `interna` fica
    // false e `contasInternasLegiveis:false` faz o painel avisar que as abas não são confiáveis.
    interna: leituraInternaOk && classificarConta(u.id, u.email, contexto).interna,
    internaMotivo: (leituraInternaOk && classificarConta(u.id, u.email, contexto).motivo) || '',
    // null = "não sei" (fonte ilegível), nunca 0 / 'gratis'.
    orcamentos: orcsOk ? (cnt.get(u.id) || 0) : null,
    aprovados: orcsOk ? (apr.get(u.id) || 0) : null,
    faturamento: orcsOk ? (fat.get(u.id) || 0) : null,
    plano: assinaturasOk ? ((plano.get(u.id) || {}).plano || 'gratis') : null,
    planoOrigem: assinaturasOk ? ((plano.get(u.id) || {}).origem || 'gratis') : null,
    ...resumirAtividade(u, porUsuario.get(u.id)),
  }));
  lista.sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  return json({ ok: true, users: lista, contasInternasLegiveis: leituraInternaOk, fontes });
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
  // Vínculos de gateway: lidos só para virar booleanos (stripeVinculado,
  // mercadoPagoVinculado, playVinculado). `projetarLinhas` filtra pela política,
  // então os ids em si nunca chegam ao navegador. Sem eles no select os três
  // indicadores saíam sempre "—", mesmo com assinatura vinculada.
  // Independe de `podeFaturas`: quem lê a assinatura vê os indicadores (só booleanos).
  if (assinaturaSelect.length) {
    for (const c of ['stripe_subscription_id', 'mp_preapproval_id', 'revenuecat_transacao_id']) {
      if (!assinaturaSelect.includes(c)) assinaturaSelect.push(c);
    }
  }
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
  // Notas internas: linhas `nota_interna` da trilha. Suporte lê as notas mesmo
  // sem acesso à auditoria completa.
  const notasSelect = selectAdminDataset(papel, 'notas');
  const [notasBrutas, saldoRpc] = await Promise.all([
    notasSelect
      ? rest(env, `admin_audit_log?target_user_id=eq.${enc}&acao=eq.nota_interna&select=${notasSelect}&order=criado_em.desc&limit=50`)
      : Promise.resolve([]),
    // Saldo pela RPC (soma do livro-razão inteiro), não pelas 100 linhas listadas.
    ler('creditos') ? saldoCreditos(env, id) : Promise.resolve(null),
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
    // Google Play (Play Billing direto): o vínculo é o hash do purchaseToken gravado
    // em `revenuecat_transacao_id` (nome antigo mantido — ver worker/src/play.js).
    assinatura.playVinculado = !!assinaturaInterna.revenuecat_transacao_id;
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
    saldoCreditos: saldoRpc,
    podeCreditos: ler('creditos'),
    notas: projetarLinhas(papel, 'notas', notasBrutas),
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
  // Bloqueio temporário: `dias` (1..365). Sem `dias` = até desbloquear.
  const dias = ban && body.dias != null ? Number(body.dias) : null;
  if (dias != null && (!Number.isInteger(dias) || dias < 1 || dias > 365)) {
    return json({ ok: false, erro: 'dias_invalidos' }, 400);
  }
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: svc(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ban_duration: ban ? (dias ? `${dias * 24}h` : '876000h') : 'none' }),
    });
    if (!r.ok) return json({ ok: false, erro: 'falha_auth' }, 502);
    const auditoria = await auditar(env, actor, {
      acao: ban ? 'usuario_bloqueado' : 'usuario_desbloqueado',
      targetUserId: id,
      motivo,
      depois: { bloqueado: ban, dias },
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
  // Mercado Pago (assinatura recorrente no cartão, preapproval): mesma regra e as
  // MESMAS funções de /conta/excluir. Sem isto, quem pede a exclusão pelo WhatsApp
  // (canal da página /excluir-conta) continuava sendo cobrado pelo MP.
  const preapproval = await lerPreapprovalGravado(env, id);
  if (preapproval.error) return json({ ok: false, erro: 'assinatura_indeterminada' }, 502); // não sei ≠ não tem
  if (preapproval.ausente) {
    console.error('[olli-admin] mp_preapproval_id indisponível (migration 20260728?) — excluindo sem checar o MP:', id);
  } else if (preapproval.id) {
    const r = await cancelarPreapprovalMp(env, preapproval.id);
    if (r !== 'ok') return json({ ok: false, erro: 'falha_cancelamento' }, 502);
  }
  // Google Play: mesma regra e a MESMA função da exclusão pelo app (play.js).
  const play = await cancelarPlayDoUsuario(env, id);
  if (play !== 'ok') return json({ ok: false, erro: 'falha_cancelamento' }, 502);

  // Dados sem CASCADE, na MESMA ordem de /conta/excluir: o feedback (reversível
  // de pedir de novo) antes; os arquivos do Storage (fotos, logos, PDFs — o
  // cascade não os alcança) por último, logo antes do usuário. Qualquer falha =
  // 502 e a conta fica, para nova tentativa. Sem isto a exclusão pelo painel
  // deixava os arquivos órfãos para sempre — contra a página de exclusão e a
  // seção Segurança dos dados da Play.
  if (!(await excluirFeedbackDoUsuario(env, id))) return json({ ok: false, erro: 'falha_exclusao' }, 502);
  if (!(await apagarArquivosDoUsuario(env, id))) return json({ ok: false, erro: 'falha_exclusao' }, 502);

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
    // Senha nova = os outros aparelhos confiáveis deixam de valer (este fica).
    try {
      const atual = actor.aparelho && actor.aparelho.id ? `&id=neq.${actor.aparelho.id}` : '';
      await fetch(`${env.SUPABASE_URL}/rest/v1/admin_trusted_devices?user_id=eq.${encodeURIComponent(actor.id)}&revogado_em=is.null${atual}`, {
        method: 'PATCH',
        headers: svc(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ revogado_em: new Date().toISOString() }),
      });
    } catch { /* melhor esforço: a senha já mudou */ }
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

// ─── organizações internas ────────────────────────────────────
// Marcar uma ORGANIZAÇÃO como interna marca os membros dela (prévia + confirmação + salvaguarda, tudo no banco:
// public.admin_previa_org_interna / admin_marcar_org_interna / admin_desmarcar_org_interna). O worker traduz e AUDITA.

/** RPC que devolve OBJETO (lerEstado só aceita lista). Três estados: ok / sem_migration (404) / indisponível. */
async function rpcObjeto(env, nome, corpo) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: svc(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(corpo),
    });
    if (!r.ok) return { ok: false, status: r.status };
    const dados = await r.json().catch(() => undefined);
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return { ok: false, status: 502 };
    return { ok: true, dados };
  } catch {
    return { ok: false, status: 0 };
  }
}

const orgsErro = (status) => json({ ok: false, erro: status === 404 ? 'orgs_sem_migration' : 'orgs_indisponivel' }, 503);

async function listarOrgs(env) {
  const [orgs, internas, membros] = await Promise.all([
    lerEstado(env, 'organizacoes?select=id,nome,owner_user_id,criado_em&order=criado_em.asc'),
    lerEstado(env, 'organizacoes_internas?select=org_id,motivo,marcado_em'),
    lerEstado(env, 'organizacao_membros?select=org_id,user_id,ativo'),
  ]);
  if (!orgs.ok) return orgsErro(orgs.status);
  if (!internas.ok) return orgsErro(internas.status);
  if (!membros.ok) return orgsErro(membros.status);
  const auth = await listAuthUsers(env);
  const emailPorId = new Map(auth.map((u) => [u.id, u.email || '']));
  const marcadas = new Map(internas.dados.map((x) => [x.org_id, x]));
  const lista = orgs.dados.map((o) => {
    const ativos = membros.dados.filter((m) => m.org_id === o.id && m.ativo !== false).length;
    const marca = marcadas.get(o.id);
    return {
      id: o.id,
      nome: String(o.nome || ''),
      dono: emailPorId.get(o.owner_user_id) || '',
      membros: ativos,
      interna: Boolean(marca),
      motivo: marca ? String(marca.motivo || '') : '',
      marcadaEm: marca ? marca.marcado_em || null : null,
    };
  });
  return json({ ok: true, orgs: lista });
}

async function previaOrg(env, orgId) {
  if (!ehUuid(orgId)) return json({ ok: false, erro: 'sem_id' }, 400);
  const r = await rpcObjeto(env, 'admin_previa_org_interna', { p_org_id: orgId });
  if (!r.ok) return orgsErro(r.status);
  if (r.dados.ok === false && r.dados.erro === 'org_inexistente') return json({ ok: false, erro: 'org_inexistente' }, 404);
  const auth = await listAuthUsers(env);
  const previa = montarPreviaOrg(r.dados, new Map(auth.map((u) => [u.id, u.email || ''])));
  if (!previa) return json({ ok: false, erro: 'previa_invalida' }, 502);
  return json({ ok: true, previa });
}

async function setOrgInterna(env, actor, body = {}) {
  const v = validarPedidoOrg(body);
  if (v.erro) return json({ ok: false, erro: v.erro }, 400);
  const r = v.interna
    ? await rpcObjeto(env, 'admin_marcar_org_interna', { p_org_id: v.id, p_confirmar: v.confirmar, p_motivo: v.motivo, p_por: actor.id })
    : await rpcObjeto(env, 'admin_desmarcar_org_interna', { p_org_id: v.id });
  if (!r.ok) return orgsErro(r.status);
  if (v.interna && r.dados.ok !== true) {
    // previa_mudou / confirmacao_obrigatoria / motivo_invalido / org_inexistente: nada foi marcado.
    return json({ ok: false, erro: String(r.dados.erro || 'recusado'), seraoMarcadas: r.dados.serao_marcadas ?? null }, 409);
  }
  const contagens = v.interna
    ? { marcadas: r.dados.marcadas ?? 0, preservadas: r.dados.preservadas ?? 0, jaMarcada: r.dados.ja_marcada === true }
    : { desmarcadas: r.dados.desmarcadas ?? 0, estavaMarcada: r.dados.estava_marcada === true };
  const auditoria = await auditar(env, actor, {
    acao: v.interna ? 'org_interna_marcada' : 'org_interna_desmarcada',
    targetUserId: null,
    motivo: v.interna ? v.motivo : (v.motivo || 'desfeito pelo administrador'),
    depois: { orgId: v.id, ...contagens },
    requestId: body.requestId,
  });
  return json({ ok: true, ...contagens, auditoria });
}

async function lerOrcamentos(env, opcoes) {
  return lerEstado(env, consultaOrcamentos(opcoes));
}

function projetarLista(papel, linhas) {
  const campos = camposAdmin(papel, 'orcamentos');
  return (linhas || []).map((linha) => projetarOrcamentoLista(linha, campos));
}

async function listarOrcamentosAdmin(env, papel, params) {
  const status = params.get('status') || '';
  const termo = normalizarTermo(params.get('q') || '');
  const leitura = await lerOrcamentos(env, { termo: termo.length >= 2 ? termo : '', status, limite: 100 });
  if (!leitura.ok) return json({ ok: false, erro: 'orcamentos_indisponiveis' }, 502);
  return json({ ok: true, estado: 'ok', orcamentos: projetarLista(papel, leitura.dados) });
}

async function buscaGlobal(env, papel, q) {
  const termo = normalizarTermo(q);
  if (termo.length < 2) return json({ ok: false, erro: 'busca_curta' }, 400);
  const auth = await listAuthUsers(env);
  const base = auth.map((u) => ({
    id: u.id,
    email: u.email || '',
    nome: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '',
    empresa: '',
  }));
  let usuarios = buscarUsuarios(base, termo, 8);
  if (usuarios.length) {
    const ids = usuarios.map((h) => h.id).join(',');
    const emps = await lerEstado(env, `empresa?select=user_id,dados&user_id=in.(${ids})`);
    if (emps.ok) {
      const nomes = new Map(emps.dados.map((e) => [e.user_id, textoEmpresa(e)]));
      usuarios = usuarios.map((h) => ({ ...h, empresa: nomes.get(h.id) || '' }));
    }
  }
  const porTexto = await lerOrcamentos(env, { termo, limite: 20 });
  if (!porTexto.ok) {
    return json({ ok: true, usuarios, orcamentos: [], orcamentosEstado: 'indisponivel' });
  }
  let extras = [];
  if (usuarios.length) {
    const dosUsuarios = await lerOrcamentos(env, { userIds: usuarios.map((h) => h.id), limite: 20 });
    if (dosUsuarios.ok) extras = dosUsuarios.dados;
  }
  const orcamentos = projetarLista(papel, juntarPorId([porTexto.dados, extras], 8));
  return json({ ok: true, usuarios, orcamentos, orcamentosEstado: 'ok' });
}

function textoEmpresa(e) {
  const dados = e && e.dados && typeof e.dados === 'object' ? e.dados : {};
  return String(dados.nome || '');
}

async function acaoEmLote(env, actor, body) {
  const v = validarLote(body);
  if (v.erro) return json({ ok: false, erro: v.erro }, 400);
  const feitos = [];
  const falhas = [];
  for (const id of v.ids) {
    if (v.acao !== 'nota' && id.toLowerCase() === String(actor.id || '').toLowerCase()) {
      falhas.push({ id, erro: 'autoacao_proibida' });
      continue;
    }
    const requestId = (v.requestId ? `${v.requestId}:${id}` : crypto.randomUUID()).slice(0, 120);
    try {
      const r = v.acao === 'nota'
        ? await notaInterna(env, actor, id, { texto: v.texto, requestId }, { auditar })
        : await setBan(env, id, v.acao === 'bloquear', actor, { motivo: v.motivo, requestId, dias: v.dias });
      const j = await r.json().catch(() => ({ ok: false, erro: 'resposta_invalida' }));
      if (r.ok && j.ok !== false) feitos.push(id);
      else falhas.push({ id, erro: j.erro || 'falha' });
    } catch {
      falhas.push({ id, erro: 'falha' });
    }
  }
  const auditoria = await auditar(env, actor, {
    acao: 'usuarios_acao_lote',
    motivo: v.motivo,
    depois: { acao: v.acao, feitos: feitos.length, falhas: falhas.length },
    requestId: v.requestId || null,
  });
  return json({ ok: true, feitos, falhas, auditoria });
}

// ─── roteador ────────────────────────────────────────────────
export async function handleAdmin(request, env, url) {
  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return new Response(adminHtml(env, nonce, { trocaMesesMax: CREDITO_TROCA_MESES_MAX, creditosAjusteMax: CREDITOS_AJUSTE_MAX }), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        // Mesma defesa em profundidade do link.js/stripe.js: o painel usa
        // script/style inline (sem framework) + fetch same-origin para
        // /admin/api e para o Supabase Auth (login).
        'Content-Security-Policy':
          `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; ` +
          "font-src https://olliorcamentos.online; img-src 'self' data: " +
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
    const p = url.pathname;
    const m = request.method;
    // Sessão por cookie HttpOnly: antes do requireAdmin, porque o objetivo é
    // justamente obter um access token sem a página guardar nada em storage.
    if (m === 'POST' && p === '/admin/api/sessao') return iniciarSessao(request, env, url, { requireAdmin });
    if (m === 'POST' && p === '/admin/api/sessao/renovar') return renovarSessao(request, env, url, { requireAdmin });
    if (m === 'POST' && p === '/admin/api/sessao/sair') return encerrarSessao(request, env, url);

    const user = await requireAdmin(request, env);
    if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
    const id = url.searchParams.get('id');
    const body = m === 'POST' ? await request.json().catch(() => ({})) : {};
    let gate;
    if (m === 'GET' && p === '/admin/api/me') {
      if (user.aparelho && user.aparelho.id) await marcarUsoAparelho(env, user.aparelho.id);
      return json({
        ok: true,
        user: {
          id: user.id, email: user.email, papel: user.papel, aal: user.aal, aalVia: user.aalVia,
          aparelhoExpiraEm: (user.aparelho && user.aparelho.expiraEm) || null,
        },
      });
    }
    // Aparelhos confiáveis do próprio administrador.
    if (m === 'POST' && p === '/admin/api/aparelho/confiar') return confiarAparelho(request, env, url, user, { auditar });
    if (m === 'GET' && p === '/admin/api/aparelhos') {
      return exigir(user, 'leitura', { aal2: true }) || listarAparelhos(request, env, user);
    }
    if (m === 'POST' && p === '/admin/api/aparelhos/revogar') {
      return exigir(user, 'leitura', { aal2: true }) || revogarAparelhos(request, env, url, user, id, { auditar });
    }
    // Ferramentas de conta (uma conta por vez, com motivo e trilha).
    if (m === 'POST' && p === '/admin/api/user/creditos') {
      return exigir(user, 'financeiro', { aal2: true }) || ajustarCreditos(env, user, id, body, { auditar });
    }
    if (m === 'POST' && p === '/admin/api/user/sessoes/revogar') {
      return exigir(user, 'suporte', { aal2: true }) || revogarSessoesUsuario(env, user, id, body, { auditar });
    }
    if (m === 'POST' && p === '/admin/api/user/email/confirmar') {
      return exigir(user, 'suporte', { aal2: true }) || confirmarEmail(env, user, id, body, { auditar });
    }
    if (m === 'POST' && p === '/admin/api/user/acesso/enviar') {
      return exigir(user, 'suporte', { aal2: true }) || enviarAcesso(env, user, id, body, { auditar });
    }
    if (m === 'POST' && p === '/admin/api/user/nota') {
      return exigir(user, 'detalhe', { aal2: true }) || notaInterna(env, user, id, body, { auditar });
    }
    if (m === 'GET' && p === '/admin/api/cnpj') {
      return exigir(user, 'detalhe', { aal2: true }) || consultarCnpj(url.searchParams.get('cnpj'));
    }
    if (m === 'POST' && p === '/admin/api/export/registrar') {
      return exigir(user, 'admin', { aal2: true }) || registrarExport(env, user, body, { auditar });
    }
    if (m === 'GET' && p === '/admin/api/busca') {
      const gateBusca = exigir(user, 'admin', { aal2: true });
      if (gateBusca) return gateBusca;
      return buscaGlobal(env, user.papel, url.searchParams.get('q'));
    }
    if (m === 'GET' && p === '/admin/api/orcamentos') {
      const gateOrc = exigir(user, 'admin', { aal2: true });
      if (gateOrc) return gateOrc;
      return listarOrcamentosAdmin(env, user.papel, url.searchParams);
    }
    if (m === 'POST' && p === '/admin/api/users/lote') {
      const acao = body && body.acao;
      const gateLote = exigir(user, acao === 'nota' ? 'detalhe' : 'suporte', { aal2: true });
      if (gateLote) return gateLote;
      return acaoEmLote(env, user, body);
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
      if ((gate = exigir(user, 'owner', { mfaReal: true }))) return gate;
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
    // Organizações internas (prévia → confirmação → marcar; desfazer em 1 clique). Mesmo gate do funil.
    if (m === 'GET' && p === '/admin/api/orgs') {
      return exigir(user, 'admin', { aal2: true }) || listarOrgs(env);
    }
    if (m === 'GET' && p === '/admin/api/org/previa') {
      return exigir(user, 'admin', { aal2: true }) || previaOrg(env, id);
    }
    if (m === 'POST' && p === '/admin/api/org/interna') {
      return exigir(user, 'admin', { aal2: true }) || setOrgInterna(env, user, body);
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
      if ((gate = exigir(user, 'owner', { mfaReal: true }))) return gate;
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
