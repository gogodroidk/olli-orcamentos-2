/**
 * Equipe (multi-tenant) — OLLI (worker Cloudflare, SEM SDK).
 *
 * A org é uma CAMADA sobre os dados single-tenant do owner (ver docs/multi-tenant
 * da Onda 2): organizacoes / organizacao_membros / convites. Este módulo cuida do
 * CONVITE — a única operação que precisa do worker (o resto — listar membros,
 * ativar/desativar, aceitar convite — o app faz direto no Supabase sob RLS).
 *
 *   POST /equipe/convite     → cria um convite (JWT owner/admin) e devolve
 *                              { token, link }. O app compartilha o link por
 *                              WhatsApp / share sheet.
 *   GET  /equipe/convite/<t> → página web "Você foi convidado para <empresa>" com
 *                              botão que abre o app (deep link) ou manda baixar.
 *
 * Segurança (mesmo modelo do stripe.js):
 *  - POST exige JWT do Supabase (Authorization: Bearer <token>), validado em
 *    /auth/v1/user. O papel (owner/admin) é verificado no Supabase via service role
 *    — NUNCA confiamos no client para dizer que é admin.
 *  - Escrita em convites é via SERVICE_ROLE (bypassa RLS); o token do convite
 *    (128 bits) é gerado no servidor, nunca vem do client.
 *  - TODO dado do usuário é escapado antes de entrar no HTML (anti-XSS) e o CSP
 *    é restritivo.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

// Papéis válidos de um membro. 'owner' NUNCA é convidável (é quem cria a org);
// um convite só pode conceder admin/gestor/tecnico.
const PAPEIS_CONVIDAVEIS = new Set(['admin', 'gestor', 'tecnico']);

// Papéis que podem convidar / gerenciar equipe. Espelha o contrato de permissões
// da UI (usePermissao): só owner e admin mexem na equipe.
const PAPEIS_GESTAO = new Set(['owner', 'admin']);

// Validade do convite: 7 dias. Depois disso aceitar_convite (SECURITY DEFINER)
// recusa pelo expira_em — aqui só gravamos a data.
const CONVITE_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

// Base do link público do convite. O mesmo domínio do link do cliente
// (link.olliorcamentos.online), servido por este worker.
const LINK_BASE = 'https://link.olliorcamentos.online';

// Deep link que abre o app já na tela de aceite. O scheme real do app é
// 'olliorcamentos' (app.json). O botão da página tenta o app; se não abrir,
// o usuário cai no CTA de baixar.
const APP_SCHEME = 'olliorcamentos';

// ─── helpers de resposta ─────────────────────────────────────
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      // A página do convite precisa de um <script> inline (botão "abrir app") e
      // Google Fonts. Sem conexões externas além das fontes.
      'Content-Security-Policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; base-uri 'none'; form-action 'none'",
    },
  });
}

// ─── auth do usuário (mesmo padrão de getUser no index.js/stripe.js) ──
async function getUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}

// ─── acesso ao Supabase (service role; bypassa RLS) ──────────
function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

/**
 * Membership do usuário na sua organização (a org é 1:1 com o membro nesta v1).
 * Retorna { org_id, papel } se o usuário é membro ATIVO de alguma org, null se
 * não pertence a nenhuma, ou { error:true } em falha de backend.
 */
async function getMembership(env, userId) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/organizacao_membros?user_id=eq.${encodeURIComponent(userId)}` +
        `&ativo=eq.true&select=org_id,papel&limit=1`,
      { headers: sbHeaders(env) },
    );
    if (!r.ok) return { error: true };
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return { error: true };
    return arr.length ? arr[0] : null;
  } catch {
    return { error: true };
  }
}

/** Nome da organização (para a página do convite). '' em qualquer falha. */
async function getNomeOrg(env, orgId) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/organizacoes?id=eq.${encodeURIComponent(orgId)}&select=nome&limit=1`,
      { headers: sbHeaders(env) },
    );
    if (!r.ok) return '';
    const arr = await r.json().catch(() => null);
    return Array.isArray(arr) && arr.length && typeof arr[0].nome === 'string' ? arr[0].nome : '';
  } catch {
    return '';
  }
}

/**
 * Insere um convite. Retorna { ok:true } em sucesso, { ok:false } em falha.
 * A linha grava org_id, email (opcional), papel, token, expira_em e criado_por.
 */
async function inserirConvite(env, { orgId, email, papel, token, criadoPor }) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/convites`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({
        org_id: orgId,
        email: email || null,
        papel,
        token,
        expira_em: new Date(Date.now() + CONVITE_VALIDADE_MS).toISOString(),
        criado_por: criadoPor,
      }),
    });
    return { ok: r.ok };
  } catch {
    return { ok: false };
  }
}

/** Convite pelo token (para a página GET). null se não existe; { error:true } em falha. */
async function getConvite(env, token) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/convites?token=eq.${encodeURIComponent(token)}` +
        `&select=org_id,papel,email,expira_em,aceito_em&limit=1`,
      { headers: sbHeaders(env) },
    );
    if (!r.ok) return { error: true };
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return { error: true };
    return arr.length ? arr[0] : null;
  } catch {
    return { error: true };
  }
}

// ─── rate limit (reusa o namespace do Stripe se existir) ─────
/** Aplica o rate limit por chave. true se PODE seguir, false se estourou. */
async function rateOk(env, key) {
  // Reaproveita o STRIPE_RL (mesmo perfil de rota autenticada e pouco frequente);
  // se o binding não existir em algum ambiente, não bloqueia.
  const rl = env.EQUIPE_RL || env.STRIPE_RL;
  if (!rl) return true;
  try {
    const { success } = await rl.limit({ key });
    return !!success;
  } catch {
    return true;
  }
}

// ─── geração de token (128 bits, base64url sem padding = 22 chars) ──
// Mesmo formato do token do link do cliente (validToken aceita [A-Za-z0-9_-]{20,64}).
function novoToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Valida o formato do token do convite (mesmo piso do link do cliente). */
function validToken(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(t);
}

/** E-mail simples e curto (só para gravar no convite; não é a credencial). */
function sanitizarEmail(v) {
  const s = String(v ?? '').trim().toLowerCase().slice(0, 160);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

// ─── POST /equipe/convite ────────────────────────────────────
export async function handleConvite(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);

  // Contador PRÓPRIO (prefixo `convite:`): sem ele, esta rota divide chave e balde
  // (STRIPE_RL, reaproveitado por rateOk quando EQUIPE_RL não existe) com
  // /stripe/checkout e /stripe/portal — mesmo risco que conta.js já documenta e
  // corrige para /conta/excluir. Um dono convidando vários técnicos esgotaria o
  // balde e devolveria 429 justamente no Portal, o caminho que a Apple exige
  // para CANCELAR a assinatura.
  if (!(await rateOk(env, `convite:${user.id}`))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, erro: 'backend_nao_configurado' }, 503);
  }

  // Rejeita payload grande antes de parsear (rota autenticada, corpo minúsculo).
  if (Number(request.headers.get('content-length') || 0) > 4096) {
    return json({ ok: false, erro: 'payload_grande' }, 413);
  }

  const body = await request.json().catch(() => ({}));

  const papel = typeof body.papel === 'string' ? body.papel.trim().toLowerCase() : '';
  if (!PAPEIS_CONVIDAVEIS.has(papel)) return json({ ok: false, erro: 'papel_invalido' }, 400);

  const email = sanitizarEmail(body.email); // opcional — só para lembrar quem foi convidado

  // O papel do solicitante é verificado NO SERVIDOR (nunca no client): só owner/admin
  // convidam. Isto é a linha de defesa real — a UI apenas esconde o botão.
  const membership = await getMembership(env, user.id);
  if (membership && membership.error) return json({ ok: false, erro: 'indisponivel' }, 503);
  if (!membership) return json({ ok: false, erro: 'sem_organizacao' }, 403);
  if (!PAPEIS_GESTAO.has(membership.papel)) return json({ ok: false, erro: 'sem_permissao' }, 403);

  const token = novoToken();
  const ins = await inserirConvite(env, {
    orgId: membership.org_id,
    email,
    papel,
    token,
    criadoPor: user.id,
  });
  if (!ins.ok) return json({ ok: false, erro: 'falha_convite' }, 502);

  return json({ ok: true, token, link: `${LINK_BASE}/equipe/convite/${token}` });
}

// ─── GET /equipe/convite/<token> — página web do convite ─────
export async function renderConvitePage(token, env) {
  if (!validToken(token)) {
    return html(pagina('🔍', 'Convite inválido', 'Confira o link que você recebeu.', ''), 400);
  }
  const conv = await getConvite(env, token);
  if (conv && conv.error) {
    return html(pagina('⏳', 'Erro temporário', 'Não consegui carregar agora. Tente de novo em instantes.', ''), 503);
  }
  if (!conv) {
    return html(pagina('🔍', 'Convite não encontrado', 'Este convite pode ter sido removido.', ''), 404);
  }
  if (conv.aceito_em) {
    return html(pagina('✅', 'Convite já aceito', 'Esse convite já foi usado. Abra o app OLLI para entrar na equipe.', ''));
  }
  const expirado = conv.expira_em && Date.parse(conv.expira_em) < Date.now();
  if (expirado) {
    return html(pagina('⌛', 'Convite expirado', 'Peça um novo convite para quem te chamou.', ''));
  }

  const nomeOrg = await getNomeOrg(env, conv.org_id);
  const papelLabel = PAPEL_LABEL[conv.papel] || 'membro da equipe';
  const deepLink = `${APP_SCHEME}://convite/${token}`;
  const sub = `Você foi convidado para entrar na equipe${nomeOrg ? ` de <b>${esc(nomeOrg)}</b>` : ''} como <b>${esc(papelLabel)}</b>.`;
  return html(pagina('🤝', 'Você recebeu um convite', sub, deepLink, token));
}

const PAPEL_LABEL = {
  admin: 'administrador',
  gestor: 'gestor',
  tecnico: 'técnico',
};

// ─── página HTML (tema claro, mesma identidade das páginas do worker) ──
function pagina(emoji, titulo, subHtml, deepLink, token) {
  const accent = '#0B6FCE';
  // Botão "Abrir no app" só quando há deep link (convite válido). O <script>
  // tenta o app e, se nada acontecer, o usuário usa o CTA de baixar/colar token.
  const botaoApp = deepLink
    ? `<a class="btn btn-abrir" id="abrir" href="${esc(deepLink)}">Abrir no app OLLI</a>
       <div class="hint">Se o app não abrir sozinho, instale o OLLI e cole este código na tela <b>Conta → Entrar na equipe</b>:</div>
       <div class="codebox"><code>${esc(token)}</code></div>`
    : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="robots" content="noindex, nofollow"/>
<title>Convite · OLLI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Spectral:wght@600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Plus Jakarta Sans',-apple-system,system-ui,sans-serif;background:#EAEEF3;color:#1A2230;-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 14px}
  .wrap{max-width:440px;width:100%}
  .card{background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(10,37,64,.14)}
  .hd{background:linear-gradient(140deg,${accent},#0A2540);height:8px}
  .body{padding:38px 28px 32px;text-align:center}
  .emoji{font-size:50px;line-height:1}
  .title{font-family:'Spectral',Georgia,serif;font-size:23px;font-weight:700;margin-top:14px;color:#0A2540}
  .sub{font-size:15px;color:#5A6575;margin-top:12px;line-height:1.55}
  .sub b{color:#1A2230}
  .btn{display:block;border:none;border-radius:14px;padding:15px;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;text-decoration:none;margin-top:22px}
  .btn-abrir{background:${accent};color:#fff;box-shadow:0 8px 20px rgba(11,111,206,.30)}
  .btn:active{transform:scale(.98)}
  .hint{margin-top:22px;font-size:13px;color:#5A6575;line-height:1.5}
  .hint b{color:#1A2230}
  .codebox{margin-top:10px;background:#F6F8FB;border:1px dashed #BBD6F2;border-radius:12px;padding:14px}
  .codebox code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;font-weight:700;color:${accent};word-break:break-all}
  .foot{text-align:center;font-size:12px;color:#9AA3B2;margin-top:20px;font-weight:600}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="hd"></div>
      <div class="body">
        <div class="emoji">${emoji}</div>
        <div class="title">${esc(titulo)}</div>
        <div class="sub">${subHtml}</div>
        ${botaoApp}
      </div>
    </div>
    <div class="foot">OLLI · o escritório de bolso do prestador</div>
  </div>
  ${deepLink ? `<script>
    // Tenta abrir o app automaticamente ao carregar. Se o scheme não estiver
    // registrado (app não instalado), nada acontece e o usuário usa o código.
    (function(){
      var a = document.getElementById('abrir');
      if (a) { setTimeout(function(){ try { window.location.href = a.getAttribute('href'); } catch(e){} }, 400); }
    })();
  </script>` : ''}
</body>
</html>`;
}

// ─── contrato de rotas /equipe/* ─────────────────────────────
export const EQUIPE_ROUTES_PREFIX = '/equipe/';

/**
 * Ponto de entrada único chamado pelo index.js para qualquer path /equipe/*.
 * GET /equipe/convite/<token> é a página pública; POST /equipe/convite exige JWT.
 */
export async function handleEquipe(request, env, url) {
  const path = url.pathname;

  // Página pública do convite: GET /equipe/convite/<token>
  if (path.startsWith('/equipe/convite/')) {
    const token = decodeURIComponent(path.slice('/equipe/convite/'.length));
    if (request.method === 'GET') return renderConvitePage(token, env);
    return json({ erro: 'metodo_nao_suportado' }, 405);
  }

  // Criar convite: POST /equipe/convite (JWT owner/admin)
  if (path === '/equipe/convite') {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'POST') return handleConvite(request, env);
    return json({ erro: 'metodo_nao_suportado' }, 405);
  }

  return json({ erro: 'nao_encontrado' }, 404);
}
