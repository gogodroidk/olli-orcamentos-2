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
 *
 * Segurança: toda rota /admin/api exige JWT do Supabase E e-mail == ADMIN_EMAIL.
 * Só DEPOIS disso o Worker usa o SERVICE_ROLE. A service key NUNCA vai ao browser.
 */

import { getAssinatura, cancelarAssinaturaStripe } from './conta.js';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function adminEmail(env) {
  return (env.ADMIN_EMAIL || 'igoreluisa@gmail.com').trim().toLowerCase();
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
    if (String(u.email || '').trim().toLowerCase() !== adminEmail(env)) return null;
    return u;
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

// ─── handlers ────────────────────────────────────────────────
async function metrics(env) {
  const [users, orcs, clientes, agend] = await Promise.all([
    listAuthUsers(env),
    rest(env, 'orcamentos?select=valor_total,status,criado_em'),
    rest(env, 'clientes?select=id'),
    rest(env, 'agendamentos?select=id'),
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
  return json({
    ok: true, usuarios: users.length, ativos, novos7, novos30,
    orcamentos: orcs.length, aprovados: aprovados.length, conversao,
    clientes: clientes.length, agendamentos: agend.length, faturamento, ticket, spark,
  });
}

async function users(env) {
  const [auth, empresas, orcs] = await Promise.all([
    listAuthUsers(env),
    rest(env, 'empresa?select=user_id,dados'),
    rest(env, 'orcamentos?select=user_id,status,valor_total'),
  ]);
  const empByUser = new Map();
  for (const e of empresas) empByUser.set(e.user_id, (e.dados && e.dados.nome) || '');
  const cnt = new Map();
  const fat = new Map();
  for (const o of orcs) {
    cnt.set(o.user_id, (cnt.get(o.user_id) || 0) + 1);
    if (o.status === 'aprovado') fat.set(o.user_id, (fat.get(o.user_id) || 0) + (Number(o.valor_total) || 0));
  }
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
  }));
  lista.sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  return json({ ok: true, users: lista });
}

async function userDetail(env, id) {
  if (!id) return json({ ok: false, erro: 'sem_id' }, 400);
  const enc = encodeURIComponent(id);
  const [empresaArr, orcamentos, clientes, agenda, recibos] = await Promise.all([
    rest(env, `empresa?user_id=eq.${enc}&select=dados`),
    rest(env, `orcamentos?user_id=eq.${enc}&select=numero,cliente_nome,valor_total,status,criado_em&order=criado_em.desc&limit=100`),
    rest(env, `clientes?user_id=eq.${enc}&select=id,nome,telefone`),
    rest(env, `agendamentos?user_id=eq.${enc}&select=id,titulo,inicio,status&order=inicio.desc&limit=50`),
    rest(env, `recibos?user_id=eq.${enc}&select=numero,valor_recebido,data_recebimento&order=criado_em.desc&limit=50`),
  ]);
  return json({ ok: true, empresa: empresaArr[0] ? empresaArr[0].dados : null, orcamentos, clientes, agenda, recibos });
}

async function setBan(env, id, ban) {
  if (!id) return json({ ok: false, erro: 'sem_id' }, 400);
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: svc(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ban_duration: ban ? '876000h' : 'none' }),
    });
    return json({ ok: r.ok });
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
async function deleteUser(env, id) {
  if (!id) return json({ ok: false, erro: 'sem_id' }, 400);

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
    if (r.ok || r.status === 404) return json({ ok: true });
    return json({ ok: false, erro: 'falha_exclusao' }, 502);
  } catch { return json({ ok: false, erro: 'falha' }, 502); }
}

async function resetUserPassword(env, email) {
  if (!email) return json({ ok: false, erro: 'sem_email' }, 400);
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return json({ ok: r.ok });
  } catch { return json({ ok: false, erro: 'falha' }, 502); }
}

async function changeOwnPassword(request, env, senha) {
  if (!senha || String(senha).length < 8) return json({ ok: false, erro: 'senha_curta' }, 400);
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: senha }),
    });
    return json({ ok: r.ok });
  } catch { return json({ ok: false, erro: 'falha' }, 502); }
}

// ─── roteador ────────────────────────────────────────────────
export async function handleAdmin(request, env, url) {
  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    return new Response(adminHtml(env), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        // Mesma defesa em profundidade do link.js/stripe.js: o painel usa
        // script/style inline (sem framework) + fetch same-origin para
        // /admin/api e para o Supabase Auth (login).
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' " +
          (env.SUPABASE_URL || '') +
          "; base-uri 'none'; form-action 'none'",
      },
    });
  }
  if (url.pathname.startsWith('/admin/api/')) {
    // Rate limit por IP ANTES de qualquer validação de credencial: barra
    // força bruta/varredura de token contra este painel (é a única rota do
    // worker que dá acesso total a dados de TODOS os usuários). Roda antes de
    // requireAdmin para não gastar 1 chamada a /auth/v1/user por tentativa.
    if (env.ADMIN_RL) {
      try {
        const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
        const { success } = await env.ADMIN_RL.limit({ key: ip });
        if (!success) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
      } catch {
        // binding ausente em algum ambiente: não bloqueia
      }
    }
    const user = await requireAdmin(request, env);
    if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
    const id = url.searchParams.get('id');
    const p = url.pathname;
    const m = request.method;
    if (m === 'GET' && p === '/admin/api/metrics') return metrics(env);
    if (m === 'GET' && p === '/admin/api/users') return users(env);
    if (m === 'GET' && p === '/admin/api/user') return userDetail(env, id);
    if (m === 'POST' && p === '/admin/api/user/ban') return setBan(env, id, true);
    if (m === 'POST' && p === '/admin/api/user/unban') return setBan(env, id, false);
    if (m === 'POST' && p === '/admin/api/user/delete') return deleteUser(env, id);
    if (m === 'POST' && p === '/admin/api/user/reset') return resetUserPassword(env, url.searchParams.get('email'));
    if (m === 'GET' && p === '/admin/api/feedback') return feedbackList(env);
    if (m === 'POST' && p === '/admin/api/feedback/resolve') return feedbackResolve(env, id, url.searchParams.get('resolvido') === '1');
    if (m === 'POST' && p === '/admin/api/me/password') {
      const body = await request.json().catch(() => ({}));
      return changeOwnPassword(request, env, body && body.senha);
    }
    return json({ ok: false, erro: 'nao_encontrado' }, 404);
  }
  return json({ ok: false, erro: 'nao_encontrado' }, 404);
}

// ─── símbolo OLLI (mono, p/ reuso no HTML) ───────────────────
const SYM = '<svg viewBox="0 0 64 64" width="100%" height="100%"><defs><linearGradient id="og" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3FD8EA"/><stop offset="1" stop-color="#0B6FCE"/></linearGradient></defs><path d="M22 49 L12 59.5 L30 50 Z" fill="url(#og)"/><rect x="9" y="8" width="46" height="44" rx="14.5" fill="url(#og)"/><rect x="13" y="11.5" width="38" height="15" rx="9" fill="#fff" opacity="0.1"/><rect x="20" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5"/><rect x="35.5" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5"/><path d="M19 41 l6.6 6.9 l16 -15" fill="none" stroke="#EAFEFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function adminHtml(env) {
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
 .top .right{display:flex;align-items:center;gap:8px}.who{font-size:12.5px;color:var(--mut);margin-right:4px}
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
 /* MODAL */
 .ov{position:fixed;inset:0;background:rgba(5,12,22,.74);display:none;align-items:flex-start;justify-content:center;padding:22px;overflow:auto;z-index:20;animation:fade .2s both}
 .ov.show{display:flex}
 .modal{background:var(--surf);border:1px solid var(--line);border-radius:20px;max-width:660px;width:100%;padding:24px;animation:pop .3s cubic-bezier(.22,1,.36,1) both}
 .mhead{display:flex;align-items:center;gap:12px;margin-bottom:6px}
 .modal h3{font-size:19px;font-weight:800}.modal .sub{color:var(--mut);font-size:12.5px;margin:2px 0 4px}
 .mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:9px;margin:14px 0}
 .mc{background:var(--surf2);border:1px solid var(--line);border-radius:12px;padding:11px}.mc .v{font-family:'Spectral',serif;font-size:19px;font-weight:700}.mc .l{font-size:10.5px;color:var(--mut2);text-transform:uppercase;letter-spacing:.4px;margin-top:2px}
 .sec h4{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--mut2);margin:14px 0 6px}
 .li{display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:7px 0;border-bottom:1px solid var(--line)}.li:last-child{border:none}
 .acts{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap}
 .field{margin-top:6px}
 /* TOAST */
 .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--surf);border:1px solid var(--line2);border-radius:13px;padding:12px 18px;font-size:13.5px;font-weight:600;opacity:0;transition:all .25s;z-index:40;box-shadow:0 14px 34px rgba(0,0,0,.4)}
 .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
 .toast.ok{border-color:rgba(43,227,154,.5)}.toast.err{border-color:rgba(255,107,107,.5)}
 @media(max-width:620px){.search input{width:160px}th.hideSm,td.hideSm{display:none}}
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
   <div class="right"><span class="who" id="who"></span><button class="btn soft sm" id="pwdBtn">Trocar senha</button><button class="btn ghost sm" id="refreshBtn">↻</button><button class="btn ghost sm" id="logoutBtn">Sair</button></div>
  </div>
  <div class="cards" id="cards"></div>
  <div class="sec-head">
   <h2>Usuários <span class="muted" id="ucount"></span></h2>
   <div class="search"><span class="mag">⌕</span><input id="usearch" placeholder="Buscar por e-mail ou empresa…"/></div>
  </div>
  <div class="tbl"><table><thead><tr><th>Usuário</th><th class="hideSm">Empresa</th><th>Orç.</th><th class="hideSm">Faturamento</th><th class="hideSm">Cadastro</th><th>Status</th></tr></thead><tbody id="urows"></tbody></table></div>
  <div class="sec-head"><h2>Feedback & Erros <span class="muted" id="fcount"></span></h2></div>
  <div id="ffilters" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"></div>
  <div id="frows"></div>
 </div>
</div>

<div class="ov" id="ov"><div class="modal" id="modal"></div></div>
<div class="toast" id="toast"></div>

<script>
const SB=${SB}, ANON=${ANON};
let TOKEN=localStorage.getItem('olli_admin_tok')||'', ALLUSERS=[], MET=null;
const $=id=>document.getElementById(id);
function show(v){$('loginView').classList.toggle('hidden',v!=='login');$('dashView').classList.toggle('hidden',v!=='dash');}
function el(t,p){const e=document.createElement(t);if(p)Object.assign(e,p);for(let i=2;i<arguments.length;i++){const k=arguments[i];if(k!=null)e.append(k.nodeType?k:document.createTextNode(k));}return e;}
function toast(msg,kind){const t=$('toast');t.textContent=msg;t.className='toast show '+(kind||'');setTimeout(()=>{t.className='toast '+(kind||'');},2600);}
function fmtBRL(n){return 'R$ '+(Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtNum(n){return (Number(n)||0).toLocaleString('pt-BR');}
function fmtDate(s){if(!s)return '—';const d=new Date(s);return isNaN(d)?'—':d.toLocaleDateString('pt-BR');}
function initials(s){return (s||'?').trim().charAt(0).toUpperCase();}
async function api(path,opts){const r=await fetch('/admin/api/'+path,{...opts,headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json',...(opts&&opts.headers||{})}});if(r.status===401){logout();throw new Error('401');}return r.json();}

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
  const m=await fetch('/admin/api/metrics',{headers:{Authorization:'Bearer '+TOKEN}});
  if(m.status===401){$('loginErr').textContent='Esta conta não é o super-admin.';TOKEN='';return;}
  localStorage.setItem('olli_admin_tok',TOKEN);$('who').textContent=email;
  await loadDash();
 }catch(e){$('loginErr').textContent='Falha ao entrar. Tente de novo.';}
 finally{$('loginBtn').textContent='Entrar';$('loginBtn').disabled=false;}
}
function logout(){TOKEN='';localStorage.removeItem('olli_admin_tok');show('login');}

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
  card('📄',fmtNum(m.orcamentos),'Orçamentos',m.aprovados+' aprovados',m.aprovados?'up':'flat'),
  card('🎯',m.conversao+'%','Conversão'),
  card('🧾',fmtBRL(m.ticket),'Ticket médio'),
  card('💰',fmtBRL(m.faturamento),'Faturamento',null,null,true),
  sparkCard(m.spark||[]),
 );
}
function renderUsers(list){
 const tb=$('urows');tb.innerHTML='';
 if(!list.length){tb.append(el('tr',{},el('td',{colSpan:6},el('div',{className:'empty'},'Nenhum usuário encontrado.'))));return;}
 for(const x of list){
  const tr=el('tr',{className:'row'});tr.onclick=()=>openUser(x);
  const u=el('div',{className:'u'});u.append(el('div',{className:'av'},initials(x.nome||x.email)),el('div',{},el('div',{className:'uem'},x.email||'—'),el('div',{className:'ues'},x.nome||'sem nome')));
  tr.append(
   el('td',{},u),
   el('td',{className:'hideSm '+(x.empresa?'':'muted')},x.empresa||'(sem empresa)'),
   el('td',{},String(x.orcamentos)),
   el('td',{className:'hideSm muted'},x.faturamento?fmtBRL(x.faturamento):'—'),
   el('td',{className:'hideSm muted'},fmtDate(x.criadoEm)),
   el('td',{},el('span',{className:'pill '+(x.bloqueado?'off':'on')},x.bloqueado?'bloqueado':'ativo')),
  );
  tb.append(tr);
 }
}
function applySearch(){const q=$('usearch').value.trim().toLowerCase();renderUsers(!q?ALLUSERS:ALLUSERS.filter(u=>(u.email||'').toLowerCase().includes(q)||(u.empresa||'').toLowerCase().includes(q)));}

// ── Feedback & Erros ──
let ALLFB=[], FBFILTER='abertos';
const TIPO_FB={feedback:['💬','#0B6FCE'],sugestao:['💡','#F7B23B'],bug:['🐞','#E5484D'],elogio:['⭐','#2BD787'],erro:['⛔','#E5484D']};
function emailDe(uid){const u=ALLUSERS.find(x=>x.id===uid);return u?(u.email||u.nome||'usuário'):(uid?('id '+String(uid).slice(0,8)):'anônimo');}
function renderFbFilters(){
 const box=$('ffilters');if(!box)return;box.innerHTML='';
 const abertos=ALLFB.filter(f=>!f.resolvido).length,erros=ALLFB.filter(f=>f.tipo==='erro'&&!f.resolvido).length;
 $('fcount').textContent='('+abertos+' abertos'+(erros?' · '+erros+' erros':'')+')';
 const opts=[['abertos','Não resolvidos'],['todos','Todos'],['erro','⛔ Erros'],['bug','🐞 Bugs'],['sugestao','💡 Sugestões'],['feedback','💬 Feedback']];
 for(const o of opts){const b=el('button',{className:'btn '+(FBFILTER===o[0]?'soft sm':'ghost sm'),onclick:()=>{FBFILTER=o[0];renderFbFilters();renderFeedback();}},o[1]);box.append(b);}
}
function renderFeedback(){
 const box=$('frows');if(!box)return;box.innerHTML='';
 let list=ALLFB.slice();
 if(FBFILTER==='abertos')list=list.filter(f=>!f.resolvido);
 else if(FBFILTER!=='todos')list=list.filter(f=>f.tipo===FBFILTER);
 if(!list.length){box.append(el('div',{className:'empty'},'Nada por aqui. 🎉'));return;}
 for(const f of list){
  const meta=TIPO_FB[f.tipo]||['💬','#8aa'],ctx=f.contexto||{};
  const item=el('div',{style:'border:1px solid #ffffff14;border-radius:14px;padding:14px;margin-bottom:10px;background:#ffffff08'+(f.resolvido?';opacity:.5':'')});
  const head=el('div',{style:'display:flex;align-items:center;gap:8px;margin-bottom:7px;flex-wrap:wrap'});
  head.append(el('span',{style:'font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;background:'+meta[1]+'22;color:'+meta[1]},meta[0]+' '+f.tipo));
  const bits=[ctx.tela,ctx.plano,ctx.versao?('v'+ctx.versao):null,ctx.plataforma].filter(Boolean).join(' · ');
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

async function loadDash(){
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
  const mini=el('div',{className:'mini'});
  [['Orçamentos',det.orcamentos.length],['Aprovados',aprov.length],['Faturamento',fmtBRL(fat)],['Clientes',det.clientes.length],['Agenda',det.agenda.length],['Recibos',det.recibos.length]].forEach(p=>{const c=el('div',{className:'mc'});c.append(el('div',{className:'v'},String(p[1])),el('div',{className:'l'},p[0]));mini.append(c);});
  d.append(mini);
  const mk=(title,rows)=>{const s=el('div',{className:'sec'});s.append(el('h4',{},title));if(!rows.length){s.append(el('div',{className:'muted',style:'font-size:13px'},'nenhum'));}else rows.forEach(r=>s.append(el('div',{className:'li'},el('span',{},r[0]),el('span',{className:'muted'},r[1]))));return s;};
  d.append(mk('Orçamentos recentes',det.orcamentos.slice(0,10).map(o=>['Nº'+o.numero+' · '+(o.cliente_nome||''),fmtBRL(o.valor_total)+' · '+o.status])));
  d.append(mk('Clientes',det.clientes.slice(0,10).map(c=>[c.nome||'—',c.telefone||''])));
  d.append(mk('Agenda',det.agenda.slice(0,8).map(a=>[a.titulo||'—',fmtDate(a.inicio)+' · '+a.status])));
  const acts=el('div',{className:'acts'});
  acts.append(el('button',{className:'btn soft sm',onclick:modalClose},'Fechar'));
  acts.append(el('button',{className:'btn ghost sm',onclick:()=>act(x,'reset')},'Enviar reset de senha'));
  acts.append(el('button',{className:'btn ghost sm',onclick:()=>act(x,x.bloqueado?'unban':'ban')},x.bloqueado?'Desbloquear':'Bloquear'));
  acts.append(el('button',{className:'btn danger sm',onclick:()=>act(x,'delete')},'Excluir conta'));
  d.append(acts);
 }catch(e){d.innerHTML='<p class="muted">Erro ao carregar.</p>';}
}
async function act(x,a){
 if(a==='reset'){try{await api('user/reset?email='+encodeURIComponent(x.email),{method:'POST'});toast('Reset enviado para '+x.email,'ok');}catch(e){toast('Falha ao enviar.','err');}return;}
 const msg={ban:'Bloquear '+x.email+'?',unban:'Desbloquear '+x.email+'?',delete:'EXCLUIR '+x.email+' e TODOS os dados? Não tem volta.'}[a];
 if(!confirm(msg))return;
 try{await api('user/'+a+'?id='+encodeURIComponent(x.id),{method:'POST'});modalClose();toast(a==='delete'?'Conta excluída':'Feito','ok');await loadDash();}catch(e){toast('Falha na ação.','err');}
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
$('pwdBtn').onclick=openPwd;
$('usearch').addEventListener('input',applySearch);
$('ov').onclick=e=>{if(e.target===$('ov'))modalClose();};
if(TOKEN){fetch('/admin/api/metrics',{headers:{Authorization:'Bearer '+TOKEN}}).then(r=>{if(r.ok){loadDash();}else{logout();}}).catch(()=>logout());}else{show('login');}
</script>
</body></html>`;
}
