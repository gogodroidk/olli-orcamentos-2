/**
 * Sessão do painel admin + "lembrar este aparelho".
 *
 * PROBLEMA QUE ISTO RESOLVE: o painel guardava o token no sessionStorage (morre
 * ao fechar a aba) e, quando o access token de 1 h vencia, fazia logout em vez
 * de renovar. Resultado: senha + código do autenticador a cada visita.
 *
 * COMO FICA:
 *  1. Sessão persistente. O refresh token do Supabase mora num cookie HttpOnly
 *     (`__Secure-olli_adm_s`, Path=/admin, SameSite=Strict, 30 dias renovados a
 *     cada uso). O JavaScript da página nunca mais guarda token em storage: o
 *     access token vive só em memória e é renovado por POST /admin/api/sessao/renovar.
 *     O Supabase mantém o nível AAL2 da sessão no refresh, então quem confirmou o
 *     código uma vez continua verificado enquanto a sessão existir.
 *  2. Aparelho confiável. Depois do TOTP, o Worker grava o sha-256 de um token
 *     aleatório em public.admin_trusted_devices e põe o token no cookie
 *     `__Secure-olli_adm_d` (30 dias, sem renovação). Se a sessão acabar (sair,
 *     expirar), a senha basta nesse aparelho. Aparelho novo pede o código.
 *
 * O cookie só ELEVA uma sessão já autenticada por senha (Bearer válido no
 * Supabase): sozinho não abre nada. CSRF: as rotas que leem cookie exigem
 * Origin igual ao do painel e SameSite=Strict impede o envio cross-site.
 */

export const COOKIE_SESSAO = '__Secure-olli_adm_s';
export const COOKIE_DISPOSITIVO = '__Secure-olli_adm_d';
const SESSAO_MAX_AGE = 30 * 24 * 60 * 60;
export const DISPOSITIVO_DIAS = 30;

function json(obj, status = 200, extraHeaders = []) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const [k, v] of extraHeaders) headers.append(k, v);
  return new Response(JSON.stringify(obj), { status, headers });
}

function svc(env, extra = {}) {
  return { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...extra };
}

export function lerCookie(request, nome) {
  const raw = request.headers.get('Cookie') || '';
  for (const parte of raw.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) {
      const valor = parte.slice(i + 1).trim();
      return valor && valor.length <= 4096 ? valor : null;
    }
  }
  return null;
}

function cookie(nome, valor, maxAge) {
  return `${nome}=${valor}; Path=/admin; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function apagarCookie(nome) {
  return `${nome}=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

/** Rotas que dependem do cookie exigem que o pedido venha da própria página. */
export function origemConfiavel(request, url) {
  const origin = request.headers.get('Origin');
  if (origin) return origin === url.origin;
  const site = request.headers.get('Sec-Fetch-Site');
  return site === 'same-origin';
}

async function sha256Hex(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function tokenAleatorio() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Nome legível do aparelho a partir do User-Agent (só para a lista). */
export function nomeDoAparelho(ua) {
  const s = String(ua || '');
  const nav = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox'
    : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Navegador';
  const so = /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iPhone/iPad' : /Windows/.test(s) ? 'Windows'
    : /Mac OS X/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : '';
  return (so ? `${nav} · ${so}` : nav).slice(0, 120);
}

/**
 * Troca um refresh token por um par novo no Supabase.
 * Três estados: { ok, sessao } | { invalido } (token morto: limpar cookie) | { indisponivel } (não sei).
 */
async function trocarRefresh(env, refreshToken) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (r.status === 400 || r.status === 401 || r.status === 403) return { invalido: true };
    if (!r.ok) return { indisponivel: true };
    const j = await r.json().catch(() => null);
    if (!j || typeof j.access_token !== 'string' || typeof j.refresh_token !== 'string') return { indisponivel: true };
    return { ok: true, sessao: j };
  } catch {
    return { indisponivel: true };
  }
}

/**
 * POST /admin/api/sessao  { refresh_token }
 * Chamado logo após o login por senha e após confirmar o TOTP. O Worker gira o
 * refresh token, confere que o dono é administrador e guarda o novo no cookie.
 */
export async function iniciarSessao(request, env, url, { requireAdmin }) {
  if (!origemConfiavel(request, url)) return json({ ok: false, erro: 'origem_invalida' }, 403);
  const body = await request.json().catch(() => ({}));
  const refresh = typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';
  if (!refresh || refresh.length > 2048) return json({ ok: false, erro: 'sem_refresh' }, 400);
  const troca = await trocarRefresh(env, refresh);
  if (troca.invalido) return json({ ok: false, erro: 'sessao_invalida' }, 401);
  if (!troca.ok) return json({ ok: false, erro: 'auth_indisponivel' }, 503);
  const req = new Request(request.url, { headers: withAuth(request, troca.sessao.access_token) });
  const admin = await requireAdmin(req, env);
  if (!admin) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  return json(
    { ok: true, access_token: troca.sessao.access_token, expires_in: Number(troca.sessao.expires_in) || 3600 },
    200,
    [['Set-Cookie', cookie(COOKIE_SESSAO, troca.sessao.refresh_token, SESSAO_MAX_AGE)]],
  );
}

function withAuth(request, accessToken) {
  const h = new Headers();
  h.set('Authorization', `Bearer ${accessToken}`);
  const ck = request.headers.get('Cookie');
  if (ck) h.set('Cookie', ck);
  return h;
}

/**
 * POST /admin/api/sessao/renovar
 * Lê o cookie, renova no Supabase, devolve access token novo e regrava o cookie.
 * Supabase fora do ar NÃO apaga o cookie ("não sei" ≠ "sessão morta").
 */
export async function renovarSessao(request, env, url, { requireAdmin }) {
  if (!origemConfiavel(request, url)) return json({ ok: false, erro: 'origem_invalida' }, 403);
  const refresh = lerCookie(request, COOKIE_SESSAO);
  if (!refresh) return json({ ok: false, erro: 'sem_sessao' }, 401);
  const troca = await trocarRefresh(env, refresh);
  if (troca.invalido) {
    return json({ ok: false, erro: 'sessao_expirada' }, 401, [['Set-Cookie', apagarCookie(COOKIE_SESSAO)]]);
  }
  if (!troca.ok) return json({ ok: false, erro: 'auth_indisponivel' }, 503);
  const req = new Request(request.url, { headers: withAuth(request, troca.sessao.access_token) });
  const admin = await requireAdmin(req, env);
  if (!admin) {
    return json({ ok: false, erro: 'nao_autorizado' }, 401, [['Set-Cookie', apagarCookie(COOKIE_SESSAO)]]);
  }
  return json(
    { ok: true, access_token: troca.sessao.access_token, expires_in: Number(troca.sessao.expires_in) || 3600 },
    200,
    [['Set-Cookie', cookie(COOKIE_SESSAO, troca.sessao.refresh_token, SESSAO_MAX_AGE)]],
  );
}

/**
 * POST /admin/api/sessao/sair  { esquecerAparelho?: boolean }
 * Encerra a sessão no Supabase (se houver Bearer) e apaga o cookie de sessão.
 * Com esquecerAparelho, também revoga e apaga o cookie do aparelho confiável.
 */
export async function encerrarSessao(request, env, url) {
  if (!origemConfiavel(request, url)) return json({ ok: false, erro: 'origem_invalida' }, 403);
  const body = await request.json().catch(() => ({}));
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (token) {
    try {
      await fetch(`${env.SUPABASE_URL}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      });
    } catch { /* o cookie some de qualquer jeito */ }
  }
  const cookies = [['Set-Cookie', apagarCookie(COOKIE_SESSAO)]];
  if (body && body.esquecerAparelho === true) {
    const bruto = lerCookie(request, COOKIE_DISPOSITIVO);
    if (bruto) {
      try {
        const hash = await sha256Hex(bruto);
        await fetch(`${env.SUPABASE_URL}/rest/v1/admin_trusted_devices?token_hash=eq.${hash}&revogado_em=is.null`, {
          method: 'PATCH',
          headers: svc(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ revogado_em: new Date().toISOString() }),
        });
      } catch { /* o cookie some de qualquer jeito */ }
    }
    cookies.push(['Set-Cookie', apagarCookie(COOKIE_DISPOSITIVO)]);
  }
  return json({ ok: true }, 200, cookies);
}

/**
 * Aparelho confiável do pedido, se houver. Qualquer falha devolve null — falha
 * fechado: sem certeza, o painel pede o código do autenticador.
 */
export async function dispositivoConfiavel(request, env, userId) {
  const bruto = lerCookie(request, COOKIE_DISPOSITIVO);
  if (!bruto || bruto.length < 20 || !userId) return null;
  try {
    const hash = await sha256Hex(bruto);
    const agora = new Date().toISOString();
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/admin_trusted_devices?token_hash=eq.${hash}` +
        `&user_id=eq.${encodeURIComponent(userId)}&revogado_em=is.null&expira_em=gt.${encodeURIComponent(agora)}` +
        '&select=id,expira_em&limit=1',
      { headers: svc(env) },
    );
    if (!r.ok) return null;
    const rows = await r.json().catch(() => null);
    if (!Array.isArray(rows) || !rows[0] || !rows[0].id) return null;
    return { id: rows[0].id, expiraEm: rows[0].expira_em, hash };
  } catch {
    return null;
  }
}

/**
 * POST /admin/api/aparelho/confiar
 * Só com TOTP confirmado DE VERDADE nesta sessão (aal2 do Supabase, não a
 * elevação por aparelho) — confiar um aparelho é ação de alto risco.
 */
export async function confiarAparelho(request, env, url, user, { auditar }) {
  if (!origemConfiavel(request, url)) return json({ ok: false, erro: 'origem_invalida' }, 403);
  if (user.aal !== 'aal2' || user.aalVia !== 'mfa') return json({ ok: false, erro: 'mfa_necessario' }, 403);
  const token = tokenAleatorio();
  const hash = await sha256Hex(token);
  const expira = new Date(Date.now() + DISPOSITIVO_DIAS * 86400000).toISOString();
  const nome = nomeDoAparelho(request.headers.get('User-Agent'));
  const ip = (request.headers.get('CF-Connecting-IP') || '').slice(0, 64) || null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/admin_trusted_devices`, {
      method: 'POST',
      headers: svc(env, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify({ user_id: user.id, token_hash: hash, nome, ip, expira_em: expira }),
    });
    if (r.status === 404) return json({ ok: false, erro: 'aparelhos_sem_migration' }, 503);
    if (!r.ok) return json({ ok: false, erro: 'falha_aparelho' }, 502);
    const rows = await r.json().catch(() => []);
    const auditoria = await auditar(env, user, {
      acao: 'aparelho_confiavel_adicionado',
      targetUserId: user.id,
      motivo: `Aparelho confiável por ${DISPOSITIVO_DIAS} dias: ${nome}`,
      depois: { aparelho: (rows[0] && rows[0].id) || null, expiraEm: expira },
    });
    return json({ ok: true, expiraEm: expira, nome, auditoria }, 200, [
      ['Set-Cookie', cookie(COOKIE_DISPOSITIVO, token, DISPOSITIVO_DIAS * 86400)],
    ]);
  } catch {
    return json({ ok: false, erro: 'falha_aparelho' }, 502);
  }
}

/** GET /admin/api/aparelhos — aparelhos confiáveis do próprio administrador. */
export async function listarAparelhos(request, env, user) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/admin_trusted_devices?user_id=eq.${encodeURIComponent(user.id)}` +
        '&select=id,nome,ip,criado_em,ultimo_uso_em,expira_em,revogado_em,token_hash&order=criado_em.desc&limit=50',
      { headers: svc(env) },
    );
    if (r.status === 404) return json({ ok: false, erro: 'aparelhos_sem_migration' }, 503);
    if (!r.ok) return json({ ok: false, erro: 'aparelhos_indisponivel' }, 502);
    const rows = await r.json().catch(() => null);
    if (!Array.isArray(rows)) return json({ ok: false, erro: 'aparelhos_indisponivel' }, 502);
    const bruto = lerCookie(request, COOKIE_DISPOSITIVO);
    const atual = bruto ? await sha256Hex(bruto) : '';
    const agora = Date.now();
    return json({
      ok: true,
      dias: DISPOSITIVO_DIAS,
      aparelhos: rows.map((d) => ({
        id: d.id,
        nome: d.nome,
        ip: d.ip,
        criadoEm: d.criado_em,
        ultimoUsoEm: d.ultimo_uso_em,
        expiraEm: d.expira_em,
        estado: d.revogado_em ? 'revogado' : Date.parse(d.expira_em) <= agora ? 'expirado' : 'ativo',
        atual: !!atual && d.token_hash === atual,
      })),
    });
  } catch {
    return json({ ok: false, erro: 'aparelhos_indisponivel' }, 502);
  }
}

/** POST /admin/api/aparelhos/revogar?id=<uuid>|todos */
export async function revogarAparelhos(request, env, url, user, alvo, { auditar }) {
  if (!origemConfiavel(request, url)) return json({ ok: false, erro: 'origem_invalida' }, 403);
  const todos = alvo === 'todos';
  if (!todos && !/^[0-9a-f-]{36}$/i.test(String(alvo || ''))) return json({ ok: false, erro: 'sem_id' }, 400);
  const filtro = `user_id=eq.${encodeURIComponent(user.id)}&revogado_em=is.null${todos ? '' : `&id=eq.${alvo}`}`;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/admin_trusted_devices?${filtro}`, {
      method: 'PATCH',
      headers: svc(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ revogado_em: new Date().toISOString() }),
    });
    if (!r.ok) return json({ ok: false, erro: 'falha_aparelho' }, 502);
  } catch {
    return json({ ok: false, erro: 'falha_aparelho' }, 502);
  }
  const auditoria = await auditar(env, user, {
    acao: todos ? 'aparelhos_confiaveis_revogados' : 'aparelho_confiavel_revogado',
    targetUserId: user.id,
    motivo: todos ? 'Revogou todos os aparelhos confiáveis' : 'Revogou um aparelho confiável',
    depois: { aparelho: todos ? 'todos' : alvo },
  });
  return json({ ok: true, auditoria });
}

/** Marca o uso do aparelho (melhor esforço; não bloqueia a resposta). */
export async function marcarUsoAparelho(env, id) {
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/admin_trusted_devices?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: svc(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ ultimo_uso_em: new Date().toISOString() }),
    });
  } catch { /* melhor esforço */ }
}
