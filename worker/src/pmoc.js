/**
 * PMOC — porta PÚBLICA da etiqueta QR do equipamento (OLLI).
 *
 * GET /q/<token>      → página pública MÍNIMA (tema claro, sem login) da etiqueta
 *                        física colada no equipamento. Mostra SÓ dados
 *                        não-sensíveis: prestador responsável, código do
 *                        equipamento, categoria, situação operacional básica e um
 *                        canal de contato (WhatsApp/telefone). Quem escaneia é
 *                        qualquer pessoa que passa pelo equipamento (síndico,
 *                        zelador, cliente) — NÃO é o dono autenticado.
 * GET /q/<token>.svg  → o QR code (do próprio link /q/<token>) como imagem SVG.
 *                        Gerador de QR puro em JS (sem lib nativa/npm) — ver §QR.
 *
 * SEGURANÇA / LGPD (inegociável):
 *  - Resolve o ativo por `qr_token` via SERVICE_ROLE (a tabela public.assets tem
 *    RLS só para o dono/equipe; a anon key não lê). O token opaco (~32 chars
 *    url-safe, gerado pelo banco) é a ÚNICA credencial.
 *  - NUNCA expõe: cliente completo, endereço, contrato, valores, série completa,
 *    dados do responsável. Só o mínimo operacional + contato do prestador.
 *  - Token inválido OU revogado (qr_revogado_em preenchido) → página GENÉRICA
 *    "etiqueta inválida ou substituída". NÃO vaza se o token existiu (mesma
 *    resposta para inexistente e revogado).
 *  - SEMPRE registra um evento em public.qr_scan_events (service_role): asset_id +
 *    user_id quando resolvido; null + token_tentado quando não. `ip_hash` é o
 *    SHA-256 salgado e truncado do CF-Connecting-IP — NUNCA o IP cru. É
 *    best-effort: nunca derruba a página.
 *  - RATE-LIMIT por origem: reusa o binding LINK_RL (o roteador em index.js já o
 *    aplica antes de chegar aqui); como defesa extra contra ENUMERAÇÃO (varredura
 *    de tokens), quando um scan NÃO resolve consultamos a janela recente de
 *    tentativas do mesmo ip_hash em qr_scan_events e cortamos além de um teto.
 *  - Todo dado do usuário é ESCAPADO no HTML (anti-XSS) e a resposta usa CSP
 *    restritiva (mesmo padrão de link.js).
 */

const ACCENT = '#0B6FCE';
const SUPORTE_WHATSAPP_FALLBACK = ''; // sem contato do prestador → não inventa número

// ─── helpers seguros (mesmo padrão de link.js) ───────────────
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function digits(v) {
  return String(v ?? '').replace(/\D/g, '');
}

function safeHexColor(v, fallback = ACCENT) {
  const s = String(v ?? '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : fallback;
}

// O DEFAULT do banco gera 24 bytes aleatórios em base64url (~32 chars url-safe,
// sem +, / ou =). O piso mínimo aqui reflete isso e barra tokens curtos/absurdos
// antes de gastar 1 query service_role (o token é a única credencial pública).
// Aceita 20..64 para dar folga a variações de encoding sem abrir a porta a
// enumeração de tokens curtos.
function validToken(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(t);
}

// Labels de situação operacional — espelham STATUS_EQUIP_LABELS (src/types).
// CAVEAT LEGAL PMOC: é ESTADO OPERACIONAL do ativo, NUNCA declaração de
// conformidade legal. A página deixa isso explícito no rodapé.
const SITUACAO_LABELS = {
  ativo: 'Ativo',
  reserva: 'Reserva',
  parado: 'Parado',
  em_manutencao: 'Em manutenção',
  interditado: 'Interditado',
  desativado: 'Desativado',
  retirado: 'Retirado',
  substituido: 'Substituído',
  descartado: 'Descartado',
};

// Rótulos amigáveis das categorias HVAC (ver CATEGORIAS_HVAC em src/types). Só
// enfeite: se vier uma categoria fora da lista, usa o próprio texto (escapado).
const CATEGORIA_LABELS = {
  split: 'Split',
  multisplit: 'Multi-split',
  cassete: 'Cassete',
  piso_teto: 'Piso-teto',
  janela: 'Janela',
  portatil: 'Portátil',
  vrf: 'VRF',
  chiller: 'Chiller',
  fancoil: 'Fancoil',
  camara_frio: 'Câmara fria',
  condensadora: 'Condensadora',
  outro: 'Outro',
};

// ─── respostas HTTP ──────────────────────────────────────────
function htmlResp(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      // Defesa em profundidade: mesmo com todo dado escapado, o CSP barra
      // exfiltração externa. Página estática (sem <script>): não precisa de
      // script-src. Google Fonts para tipografia; img-src data: para o QR inline.
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: https://link.olliorcamentos.online; base-uri 'none'; form-action 'none'",
    },
  });
}

function svgResp(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // O QR de um token é imutável enquanto o token existir; cache curto na
      // borda alivia o worker sem risco (o conteúdo é o próprio link).
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}

// ─── acesso ao Supabase (service role; bypassa RLS) ──────────
function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

// Colunas explícitas (menor privilégio): SÓ o que a página pública precisa. NUNCA
// puxa numero_serie completo, cliente_id, local_id, patrimônio do cliente, custo,
// contrato — nada disso chega à borda pública. `user_id` só para achar o
// prestador (empresa) e carimbar o scan; nunca é exibido.
const ASSET_COLS =
  'id,user_id,codigo_interno,categoria,situacao,qr_revogado_em';

/**
 * Resolve o ativo pelo token VIGENTE e não-revogado. Retorna a linha, `null` se
 * não existir/estiver revogado, ou `{ error:true }` em falha de backend.
 * O filtro `qr_revogado_em=is.null` já exclui tokens revogados no próprio SELECT.
 */
async function getAsset(env, token) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/assets` +
        `?qr_token=eq.${encodeURIComponent(token)}` +
        `&qr_revogado_em=is.null` +
        // Equipamento na LIXEIRA não resolve a etiqueta. `qr_revogado_em` cobre a
        // revogação do token; `excluido_em` cobre a exclusão do equipamento — são
        // duas coisas diferentes e faltava a segunda.
        `&excluido_em=is.null` +
        `&select=${ASSET_COLS}&limit=1`,
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

/**
 * Busca a EMPRESA (prestador) do dono do ativo para exibir SÓ o nome, a
 * especialidade/slogan (tagline) e um canal de contato (WhatsApp/telefone). O
 * `dados` é o jsonb espelho do objeto Empresa do app (nome, whatsapp, telefone,
 * especialidade, slogan…). Nunca lança; `{}` em qualquer falha.
 */
async function getPrestador(env, userId) {
  if (!userId) return {};
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/empresa?user_id=eq.${encodeURIComponent(userId)}&select=dados&limit=1`,
      { headers: sbHeaders(env) },
    );
    if (!r.ok) return {};
    const arr = await r.json().catch(() => null);
    const dados = Array.isArray(arr) && arr[0] && typeof arr[0].dados === 'object' ? arr[0].dados : {};
    return dados || {};
  } catch {
    return {};
  }
}

// ─── TRILHA de scans (LGPD-safe) ─────────────────────────────
// Hash irreversível do IP: SHA-256(segredo_fixo || ':' || ip). NUNCA guardamos o IP cru.
// Salgado com um SEGREDO FIXO do worker (SUPABASE_SERVICE_ROLE_KEY — nunca no repo/
// exposto), NÃO com o token. Isso é ESSENCIAL para o rate-limit anti-enumeração
// funcionar: com sal por-token, cada request de um enumerador (que usa tokens
// distintos) geraria um ip_hash diferente e a contagem de tentativas por origem NUNCA
// agregaria (o guard viraria código morto). Sal fixo → hash ESTÁVEL por IP na janela →
// tentativasFalhasRecentes conta de fato. Truncado a 16 hex (64 bits): agrupa origens
// para o gestor e para o teto de abuso, sem virar identificador forte de pessoa. A
// correlação fica restrita ao tenant do dono (RLS de qr_scan_events por user_id).
async function hashIp(env, ip) {
  try {
    const cripto = globalThis.crypto;
    if (!ip || !cripto || !cripto.subtle) return null;
    const sal = (env && env.SUPABASE_SERVICE_ROLE_KEY) ? String(env.SUPABASE_SERVICE_ROLE_KEY) : 'olli-qr-scan';
    const dados = new TextEncoder().encode(`${sal}:${ip}`);
    const buf = await cripto.subtle.digest('SHA-256', dados);
    const bytes = new Uint8Array(buf);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex.slice(0, 16);
  } catch {
    return null;
  }
}

/**
 * Grava UM evento de scan (append-only) via service_role. Nunca lança e nunca
 * bloqueia a entrega da página: a trilha é observabilidade/segurança, não pode
 * derrubar a etiqueta pública. `resolvido=false` + `token_tentado` quando não
 * resolveu (investigação de enumeração).
 */
async function registrarScan(env, { assetId, userId, tokenTentado, resolvido, ipHash, userAgent }) {
  try {
    const linha = {
      asset_id: assetId ?? null,
      user_id: userId ?? null,
      token_tentado: tokenTentado ?? null,
      resolvido: !!resolvido,
      ip_hash: ipHash ?? null,
      user_agent: userAgent ? String(userAgent).slice(0, 200) : null,
    };
    await fetch(`${env.SUPABASE_URL}/rest/v1/qr_scan_events`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(linha),
    });
  } catch {
    // scan é best-effort: engolir qualquer erro
  }
}

/**
 * Anti-enumeração por origem: conta tentativas NÃO-resolvidas do mesmo ip_hash na
 * última janela (60s). Acima do teto, a página passa a devolver a resposta
 * genérica de "inválido" sem sequer olhar o banco — corta a varredura de tokens.
 * Fail-open: qualquer erro/ausência de ip_hash retorna 0 (não bloqueia
 * navegação legítima). O LINK_RL (12/min por IP, no roteador) é a 1ª barreira;
 * este é o reforço específico contra enumeração de tokens.
 */
const ENUM_JANELA_MS = 60_000;
const ENUM_TETO = 8;
async function tentativasFalhasRecentes(env, ipHash) {
  if (!ipHash) return 0;
  try {
    const desde = new Date(Date.now() - ENUM_JANELA_MS).toISOString();
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/qr_scan_events` +
        `?ip_hash=eq.${encodeURIComponent(ipHash)}` +
        `&resolvido=eq.false` +
        `&criado_em=gte.${encodeURIComponent(desde)}` +
        `&select=id`,
      { headers: sbHeaders(env, { Prefer: 'count=exact', Range: '0-0' }) },
    );
    if (!r.ok) return 0;
    // PostgREST devolve o total no header Content-Range: "0-0/<total>".
    const cr = r.headers.get('content-range') || '';
    const m = /\/(\d+)$/.exec(cr);
    return m ? Number(m[1]) || 0 : 0;
  } catch {
    return 0;
  }
}

// ─── porta pública: GET /q/<token> ───────────────────────────
export async function renderEtiqueta(token, env, request) {
  const ip = request && request.headers ? request.headers.get('CF-Connecting-IP') || '' : '';
  const ua = request && request.headers ? request.headers.get('User-Agent') || '' : '';
  const ipHash = await hashIp(env, ip);

  // Token malformado: nem toca o banco. Registra a tentativa (enumeração) e
  // devolve a página genérica — mesma resposta de inexistente/revogado.
  if (!validToken(token)) {
    await registrarScan(env, {
      assetId: null,
      userId: null,
      tokenTentado: String(token || '').slice(0, 80),
      resolvido: false,
      ipHash,
      userAgent: ua,
    });
    return htmlResp(pageEtiquetaInvalida(), 404);
  }

  // Reforço anti-enumeração: se esta origem já falhou muito na janela, corta
  // ANTES de gastar a query de resolução (protege o banco de varredura).
  const falhas = await tentativasFalhasRecentes(env, ipHash);
  if (falhas >= ENUM_TETO) {
    await registrarScan(env, {
      assetId: null,
      userId: null,
      tokenTentado: token.slice(0, 80),
      resolvido: false,
      ipHash,
      userAgent: ua,
    });
    return htmlResp(pageEtiquetaInvalida(), 429);
  }

  const asset = await getAsset(env, token);

  // Falha de backend: página neutra de "tente de novo" (não vaza existência).
  if (asset && asset.error) {
    await registrarScan(env, {
      assetId: null,
      userId: null,
      tokenTentado: token.slice(0, 80),
      resolvido: false,
      ipHash,
      userAgent: ua,
    });
    return htmlResp(pageErroTemporario(), 503);
  }

  // Não existe OU revogado (o SELECT já filtrou revogados): resposta genérica.
  // NÃO distingue "nunca existiu" de "foi substituído/revogado" (não vaza).
  if (!asset) {
    await registrarScan(env, {
      assetId: null,
      userId: null,
      tokenTentado: token.slice(0, 80),
      resolvido: false,
      ipHash,
      userAgent: ua,
    });
    return htmlResp(pageEtiquetaInvalida(), 404);
  }

  // Resolvido: carimba o scan (asset_id + user_id do dono) e busca o prestador.
  await registrarScan(env, {
    assetId: asset.id,
    userId: asset.user_id || null,
    tokenTentado: null,
    resolvido: true,
    ipHash,
    userAgent: ua,
  });

  const prestador = await getPrestador(env, asset.user_id);
  return htmlResp(pageEtiqueta(asset, prestador, token));
}

// ─── porta pública: GET /q/<token>.svg (imagem QR) ───────────
export function renderEtiquetaSvg(token) {
  // Não toca o banco: o QR é uma pura função do texto do link (o próprio /q/<token>).
  // Token malformado → SVG placeholder discreto (não revela nada, não quebra <img>).
  if (!validToken(token)) return svgResp(qrPlaceholderSvg(), 404);
  const url = urlEtiqueta(token);
  try {
    const svg = qrSvg(url);
    return svgResp(svg);
  } catch {
    return svgResp(qrPlaceholderSvg(), 500);
  }
}

/** URL pública canônica da etiqueta (a mesma que o app referencia). */
export function urlEtiqueta(token) {
  return `https://link.olliorcamentos.online/q/${token}`;
}

// ─── páginas HTML ────────────────────────────────────────────
function shell(inner, accentRaw = ACCENT) {
  const accent = safeHexColor(accentRaw, ACCENT);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="robots" content="noindex, nofollow"/>
<title>Etiqueta do equipamento · OLLI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Spectral:wght@600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Plus Jakarta Sans',-apple-system,system-ui,sans-serif;background:#EAEEF3;color:#1A2230;-webkit-font-smoothing:antialiased;padding:24px 14px 48px}
  .wrap{max-width:460px;margin:0 auto}
  .card{background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(10,37,64,.14)}
  .hd{background:linear-gradient(140deg,${accent},#0A2540);padding:22px 22px 20px;color:#fff;display:flex;align-items:center;gap:12px}
  .hd-mark{width:42px;height:42px;border-radius:13px;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .hd-name{font-family:'Spectral',Georgia,serif;font-size:18px;font-weight:700;line-height:1.2}
  .hd-tag{font-size:12.5px;color:rgba(255,255,255,.8);margin-top:2px}
  .body{padding:22px}
  .eyebrow{font-size:12px;font-weight:700;color:#6B7686;letter-spacing:.3px}
  .title{font-size:19px;font-weight:800;margin-top:4px;line-height:1.32}
  .sob{font-size:13px;color:#3C4756;margin-top:8px;line-height:1.5}
  .grid{margin-top:18px;border-top:1px solid #EDEFF2}
  .row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #EDEFF2}
  .row-l{font-size:12.5px;color:#8A93A2;font-weight:600}
  .row-v{font-size:13.5px;font-weight:700;text-align:right}
  .badge{display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:4px 11px;letter-spacing:.2px}
  .actions{margin-top:20px;display:flex;flex-direction:column;gap:10px}
  .btn{border:none;border-radius:14px;padding:15px;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none}
  .btn-zap{background:#15B66E;color:#fff;box-shadow:0 8px 20px rgba(21,182,110,.28)}
  .nocontato{margin-top:18px;background:#F6F8FB;border:1px solid #EDEFF2;border-radius:14px;padding:14px 16px;font-size:13px;color:#5A6575;line-height:1.5;text-align:center}
  .caveat{margin-top:16px;background:#FBFCFE;border:1px solid #EDEFF2;border-radius:12px;padding:12px 14px;font-size:11.5px;color:#8A93A2;line-height:1.5}
  .foot{text-align:center;font-size:11px;color:#9AA3B2;margin-top:18px;font-weight:600}
  .err{background:#fff;border-radius:22px;padding:44px 26px;text-align:center;box-shadow:0 18px 50px rgba(10,37,64,.14)}
  .err-emoji{font-size:42px}
  .err-title{font-size:18px;font-weight:800;margin-top:12px}
  .err-sub{font-size:13.5px;color:#6B7686;margin-top:7px;line-height:1.55}
  .robot{width:26px;height:26px}
</style>
</head>
<body><div class="wrap">${inner}</div></body>
</html>`;
}

function olliRobot() {
  // Símbolo oficial OLLI (mesmo de link.js): balão-documento + olhos + check.
  return `<svg class="robot" viewBox="0 0 64 64" fill="none"><defs><linearGradient id="om" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3FD8EA"/><stop offset="1" stop-color="#0B6FCE"/></linearGradient></defs><path d="M22 49 L12 59.5 L30 50 Z" fill="url(#om)"/><rect x="9" y="8" width="46" height="44" rx="14.5" fill="url(#om)"/><rect x="13" y="11.5" width="38" height="15" rx="9" fill="#ffffff" opacity="0.1"/><rect x="20" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5"/><rect x="35.5" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5"/><path d="M19 41 l6.6 6.9 l16 -15" fill="none" stroke="#EAFEFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Página genérica de token inválido/revogado/inexistente (não vaza existência). */
function pageEtiquetaInvalida() {
  return shell(
    `<div class="err">
      <div class="err-emoji">🏷️</div>
      <div class="err-title">Etiqueta inválida ou substituída</div>
      <div class="err-sub">Esta etiqueta não corresponde a um equipamento ativo. Ela pode ter sido substituída por uma nova. Se você acha que isso é um engano, fale com o responsável pela manutenção.</div>
      <div class="foot" style="margin-top:24px">identificação de equipamentos por OLLI</div>
    </div>`,
  );
}

/** Falha temporária de backend (neutra; não distingue existência). */
function pageErroTemporario() {
  return shell(
    `<div class="err">
      <div class="err-emoji">🔌</div>
      <div class="err-title">Não consegui carregar agora</div>
      <div class="err-sub">Tente novamente em alguns instantes.</div>
      <div class="foot" style="margin-top:24px">identificação de equipamentos por OLLI</div>
    </div>`,
  );
}

/** SVG placeholder (token inválido/erro no gerador) — discreto, não vaza nada. */
function qrPlaceholderSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="QR indisponível"><rect width="200" height="200" fill="#fff"/><rect x="0.5" y="0.5" width="199" height="199" fill="none" stroke="#E0E5EC"/><text x="100" y="104" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#9AA3B2">QR indisponível</text></svg>`;
}

/**
 * Página da etiqueta resolvida. Mostra SÓ o mínimo não-sensível:
 *  - prestador responsável (nome + tagline) + aviso "sob manutenção por…"
 *  - código do equipamento (codigo_interno — nunca patrimônio do cliente/série)
 *  - categoria HVAC
 *  - situação operacional básica (com caveat de que NÃO é conformidade legal)
 *  - canal de contato do prestador (WhatsApp preferencial; senão telefone)
 */
function pageEtiqueta(asset, prestador, token) {
  const nomePrestador = (prestador && typeof prestador.nome === 'string' && prestador.nome.trim())
    ? prestador.nome.trim()
    : 'Prestador de manutenção';
  const tagline = (prestador && typeof prestador.especialidade === 'string' && prestador.especialidade.trim())
    ? prestador.especialidade.trim()
    : (prestador && typeof prestador.slogan === 'string' ? prestador.slogan.trim() : '');
  const accent = safeHexColor(prestador && prestador.corMarca, ACCENT);

  const codigo = (asset && typeof asset.codigo_interno === 'string') ? asset.codigo_interno.trim() : '';
  const categoriaId = (asset && typeof asset.categoria === 'string') ? asset.categoria.trim() : '';
  const categoriaLabel = categoriaId ? (CATEGORIA_LABELS[categoriaId] || categoriaId) : '';
  const situacaoId = (asset && typeof asset.situacao === 'string') ? asset.situacao : 'ativo';
  const situacaoLabel = SITUACAO_LABELS[situacaoId] || 'Ativo';

  // Cores discretas por situação (só realce visual; sem semântica legal).
  const situacaoCores = {
    ativo: ['#E7F8F1', '#0B8A5B'],
    reserva: ['#EAF3FC', '#0B6FCE'],
    parado: ['#F1F3F6', '#5A6575'],
    em_manutencao: ['#FEF6E7', '#B9770E'],
    interditado: ['#FDECEA', '#C0392B'],
    desativado: ['#F1F3F6', '#5A6575'],
    retirado: ['#F1F3F6', '#5A6575'],
    substituido: ['#F1EEFB', '#6D4FC0'],
    descartado: ['#F1F3F6', '#5A6575'],
  };
  const [sbg, sfg] = situacaoCores[situacaoId] || situacaoCores.ativo;

  // Contato: WhatsApp preferencial; senão telefone. Só dígitos; DDI 55 no wa.me.
  const whats = digits((prestador && prestador.whatsapp) || SUPORTE_WHATSAPP_FALLBACK);
  const tel = digits((prestador && prestador.telefone) || '');
  const contatoNum = whats || tel;
  const msg = `Olá! Escaneei a etiqueta de um equipamento sob manutenção${codigo ? ` (código ${codigo})` : ''}. Preciso falar sobre ele.`;
  const zapHref = contatoNum
    ? `https://wa.me/${contatoNum.startsWith('55') ? contatoNum : '55' + contatoNum}?text=${encodeURIComponent(msg)}`
    : '';

  const linhas = [];
  if (codigo) linhas.push(`<div class="row"><span class="row-l">Código do equipamento</span><span class="row-v">${esc(codigo)}</span></div>`);
  if (categoriaLabel) linhas.push(`<div class="row"><span class="row-l">Tipo</span><span class="row-v">${esc(categoriaLabel)}</span></div>`);
  linhas.push(
    `<div class="row"><span class="row-l">Situação</span><span class="row-v"><span class="badge" style="background:${sbg};color:${sfg}">${esc(situacaoLabel)}</span></span></div>`,
  );

  const contatoBloco = zapHref
    ? `<div class="actions"><a class="btn btn-zap" href="${esc(zapHref)}" target="_blank" rel="noopener noreferrer">💬 Falar com ${esc(nomePrestador)}</a></div>`
    : `<div class="nocontato">Este equipamento está sob manutenção de <strong>${esc(nomePrestador)}</strong>. Procure o responsável pela manutenção local para mais informações.</div>`;

  const inner = `<div class="card">
    <div class="hd">
      <div class="hd-mark">${olliRobot()}</div>
      <div><div class="hd-name">${esc(nomePrestador)}</div>${tagline ? `<div class="hd-tag">${esc(tagline)}</div>` : ''}</div>
    </div>
    <div class="body">
      <div class="eyebrow">EQUIPAMENTO IDENTIFICADO</div>
      <div class="title">Equipamento sob manutenção</div>
      <div class="sob">Este equipamento é acompanhado por <strong>${esc(nomePrestador)}</strong>. Abaixo, as informações básicas da etiqueta.</div>
      <div class="grid">${linhas.join('')}</div>
      ${contatoBloco}
      <div class="caveat">A situação exibida é o estado operacional registrado pelo prestador — não representa, por si só, declaração de conformidade legal do equipamento. Nenhum dado pessoal ou contratual é exibido nesta página.</div>
      <div class="foot">identificação de equipamentos por OLLI</div>
    </div>
  </div>`;

  return shell(inner, accent);
}

// ============================================================================
// §QR — GERADOR DE QR CODE PURO EM JS (sem lib nativa/npm)
// ----------------------------------------------------------------------------
// Modo BYTE (ISO-8859-1/UTF-8), nível de correção de erro M (médio), versão
// escolhida automaticamente pelo tamanho do dado (o link /q/<token> cabe com
// folga até a v6, ~134 chars em M). Implementa: campo de Galois GF(256),
// Reed-Solomon (ECC), colocação da matriz (finders, timing, alinhamento, dados
// em zigue-zague), aplicação de máscara e info de formato. Sem dependências.
//
// LIÇÃO HERMES: só ES puro (arrays, Uint8Array, bitwise). Nada de TextDecoder
// latin1, WASM ou API exótica. Roda idêntico no workerd e em qualquer runtime.
// ============================================================================

// GF(256) com polinômio gerador 0x11D (padrão QR). Tabelas de exp/log.
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

// Polinômio gerador de Reed-Solomon para `n` símbolos de correção.
function rsGeneratorPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

// Divisão polinomial: resto = símbolos de ECC de `data` (Uint8Array) com `n` graus.
function rsEncode(data, n) {
  const gen = rsGeneratorPoly(n);
  const res = new Uint8Array(data.length + n);
  res.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

// Tabela de capacidade (nível M, modo byte) e parâmetros de bloco por versão.
// [version] = { size, totalCodewords, ecPerBlock, [group1Blocks, g1Data, group2Blocks, g2Data] }
// Fonte: tabelas ISO/IEC 18004 (nível M). Versões 1..10 cobrem folgadamente um
// link de ~50 chars; incluímos até a 10 por robustez.
const QR_M = {
  1: { ec: 10, g1: [1, 16], g2: [0, 0] },
  2: { ec: 16, g1: [1, 28], g2: [0, 0] },
  3: { ec: 26, g1: [1, 44], g2: [0, 0] },
  4: { ec: 18, g1: [2, 32], g2: [0, 0] },
  5: { ec: 24, g1: [2, 43], g2: [0, 0] },
  6: { ec: 16, g1: [4, 27], g2: [0, 0] },
  7: { ec: 18, g1: [4, 31], g2: [0, 0] },
  8: { ec: 22, g1: [2, 38], g2: [2, 39] },
  9: { ec: 22, g1: [3, 36], g2: [2, 37] },
  10: { ec: 26, g1: [4, 43], g2: [1, 44] },
};

// Total de codewords de DADOS (sem ECC) por versão no nível M — soma dos blocos.
function dataCapacity(v) {
  const p = QR_M[v];
  return p.g1[0] * p.g1[1] + p.g2[0] * p.g2[1];
}

// Padrões de alinhamento (posições centrais) por versão. v1 não tem.
const ALIGN_POS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

// UTF-8 encode puro (sem TextEncoder por clareza; equivalente e ES puro).
function utf8Bytes(str) {
  // TextEncoder existe no workerd, mas manter puro evita qualquer surpresa de
  // runtime e é trivial para a faixa que nos interessa (o link é ASCII, mas
  // suportamos multibyte por completude).
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(i + 1);
      const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      i++;
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

// Monta o fluxo de bits de DADOS (modo byte) para a versão dada e completa com
// padding até a capacidade. Retorna Uint8Array de codewords de dados.
function buildDataCodewords(bytes, version) {
  const capacityBits = dataCapacity(version) * 8;
  const bits = [];
  const push = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  // Indicador de modo byte = 0100.
  push(0b0100, 4);
  // Contador de caracteres: 8 bits (v1..9) ou 16 bits (v10..26) no modo byte.
  const countBits = version <= 9 ? 8 : 16;
  push(bytes.length, countBits);
  for (let i = 0; i < bytes.length; i++) push(bytes[i], 8);
  // Terminador (até 4 bits) se couber.
  const remaining = capacityBits - bits.length;
  push(0, Math.min(4, remaining));
  // Alinha a byte.
  while (bits.length % 8 !== 0) bits.push(0);
  // Bytes de preenchimento alternados 0xEC / 0x11 até a capacidade.
  const pad = [0xec, 0x11];
  let pi = 0;
  const cw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    cw.push(b);
  }
  while (cw.length < dataCapacity(version)) {
    cw.push(pad[pi & 1]);
    pi++;
  }
  return Uint8Array.from(cw);
}

// Intercala blocos de dados + ECC conforme o padrão (grupo1/grupo2) e produz a
// sequência final de codewords a colocar na matriz.
function interleave(dataCw, version) {
  const p = QR_M[version];
  const blocks = [];
  let idx = 0;
  const addBlocks = (count, dataLen) => {
    for (let b = 0; b < count; b++) {
      const d = dataCw.slice(idx, idx + dataLen);
      idx += dataLen;
      const ec = rsEncode(d, p.ec);
      blocks.push({ data: d, ec });
    }
  };
  addBlocks(p.g1[0], p.g1[1]);
  if (p.g2[0]) addBlocks(p.g2[0], p.g2[1]);

  const maxData = Math.max(...blocks.map((b) => b.data.length));
  const out = [];
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  }
  for (let i = 0; i < p.ec; i++) {
    for (const b of blocks) out.push(b.ec[i]);
  }
  return Uint8Array.from(out);
}

// Escolhe a menor versão (1..10, nível M) que comporta os bytes no modo byte.
function chooseVersion(byteLen) {
  for (let v = 1; v <= 10; v++) {
    const countBits = v <= 9 ? 8 : 16;
    const needBits = 4 + countBits + byteLen * 8;
    if (needBits <= dataCapacity(v) * 8) return v;
  }
  throw new Error('dado_grande_demais_para_qr');
}

// Máscara 0 do QR: (row + col) % 2 === 0. Simples e determinística — evitamos a
// escolha por penalidade (8 máscaras) porque para um link fixo qualquer máscara
// válida decodifica; a 0 é a canônica e mantém o gerador enxuto.
function maskBit(row, col) {
  return (row + col) % 2 === 0;
}

// Info de formato (nível M + máscara 0) já calculada com BCH e XOR do padrão.
// EC level M = bits 00; máscara 0 = 000 → 5 bits '00000'. O valor final é a
// constante padronizada para (M, máscara 0).
const FORMAT_INFO_M0 = 0b101010000010010; // (M, mask 0) — 15 bits com BCH e máscara aplicada.

/**
 * Gera a matriz booleana do QR para `text` e devolve { size, modules }.
 * modules[r][c] = true → módulo escuro.
 */
function buildMatrix(text) {
  const bytes = utf8Bytes(text);
  const version = chooseVersion(bytes.length);
  const size = 17 + version * 4;
  const dataCw = buildDataCodewords(bytes, version);
  const finalCw = interleave(dataCw, version);

  // matriz e mapa de "função" (reservado: não recebe dado nem máscara).
  const m = Array.from({ length: size }, () => new Int8Array(size).fill(-1)); // -1 = vazio
  const fn = Array.from({ length: size }, () => new Uint8Array(size)); // 1 = função

  const setF = (r, c, dark) => {
    m[r][c] = dark ? 1 : 0;
    fn[r][c] = 1;
  };

  // Finder pattern 7x7 + separador, nas 3 quinas.
  const placeFinder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inRing =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setF(rr, cc, inRing || inCore);
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns (linha/coluna 6, alternado).
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    if (!fn[6][i]) setF(6, i, dark);
    if (!fn[i][6]) setF(i, 6, dark);
  }

  // Módulo escuro fixo.
  setF(size - 8, 8, true);

  // Padrões de alinhamento (não sobre finders).
  const aligns = ALIGN_POS[version] || [];
  for (const ar of aligns) {
    for (const ac of aligns) {
      // pula os que colidem com finders
      if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 9) || (ar >= size - 9 && ac <= 8)) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          setF(ar + r, ac + c, dark);
        }
      }
    }
  }

  // Reserva as áreas de info de formato (serão preenchidas depois).
  const reserveFormat = () => {
    for (let i = 0; i < 9; i++) {
      if (!fn[8][i]) { fn[8][i] = 1; if (m[8][i] === -1) m[8][i] = 0; }
      if (!fn[i][8]) { fn[i][8] = 1; if (m[i][8] === -1) m[i][8] = 0; }
    }
    for (let i = 0; i < 8; i++) {
      const r = size - 1 - i;
      if (!fn[r][8]) { fn[r][8] = 1; if (m[r][8] === -1) m[r][8] = 0; }
      const c = size - 1 - i;
      if (!fn[8][c]) { fn[8][c] = 1; if (m[8][c] === -1) m[8][c] = 0; }
    }
  };
  reserveFormat();

  // Coloca os bits de dado em zigue-zague (de baixo p/ cima, 2 colunas por vez),
  // pulando a coluna 6 (timing) e módulos de função. Aplica a máscara 0 já aqui.
  let bitIdx = 0;
  const totalBits = finalCw.length * 8;
  const getBit = (i) => (i < totalBits ? (finalCw[i >> 3] >> (7 - (i & 7))) & 1 : 0);

  let col = size - 1;
  let upward = true;
  while (col > 0) {
    if (col === 6) col--; // pula coluna de timing
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let k = 0; k < 2; k++) {
        const c = col - k;
        if (fn[row][c]) continue;
        let dark = getBit(bitIdx) === 1;
        bitIdx++;
        if (maskBit(row, c)) dark = !dark;
        m[row][c] = dark ? 1 : 0;
      }
    }
    col -= 2;
    upward = !upward;
  }

  // Escreve a info de formato (M + máscara 0) nas duas cópias padronizadas.
  const fmt = FORMAT_INFO_M0;
  const fbit = (i) => (fmt >> i) & 1;
  // Cópia 1: em volta do finder superior-esquerdo.
  for (let i = 0; i <= 5; i++) m[8][i] = fbit(i);
  m[8][7] = fbit(6);
  m[8][8] = fbit(7);
  m[7][8] = fbit(8);
  for (let i = 9; i <= 14; i++) m[14 - i][8] = fbit(i);
  // Cópia 2: parte inferior-esquerda + direita.
  for (let i = 0; i <= 7; i++) m[size - 1 - i][8] = fbit(i);
  for (let i = 8; i <= 14; i++) m[8][size - 15 + i] = fbit(i);

  // Converte para booleano (dark = 1).
  const modules = m.map((rowArr) => Array.from(rowArr, (v) => v === 1));
  return { size, modules };
}

/**
 * QR como SVG compacto: uma quiet zone de 4 módulos, fundo branco, módulos
 * escuros agrupados por linha em um único <path> (menor payload). viewBox em
 * unidades de módulo → escala perfeita em qualquer tamanho no <img>.
 */
export function qrSvg(text) {
  const { size, modules } = buildMatrix(text);
  const quiet = 4;
  const dim = size + quiet * 2;

  // Um único path com todos os módulos escuros (retângulos 1x1). Agrupa runs
  // horizontais contíguos para reduzir o tamanho do path.
  let d = '';
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (modules[r][c]) {
        let len = 1;
        while (c + len < size && modules[r][c + len]) len++;
        d += `M${c + quiet} ${r + quiet}h${len}v1h-${len}z`;
        c += len;
      } else {
        c++;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim * 8}" height="${dim * 8}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="QR code do equipamento"><rect width="${dim}" height="${dim}" fill="#ffffff"/><path d="${d}" fill="#0A2540"/></svg>`;
}
