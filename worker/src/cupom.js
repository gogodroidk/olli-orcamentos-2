/**
 * Cupom de influenciador — OLLI (worker Cloudflare, SEM SDK).
 *
 *   GET  /cupom/config    → { ativo } (sem login; o app só mostra o campo quando true)
 *   POST /cupom/consultar → { codigo, plano? } diz, SEM gravar nada, se o código vale para esta conta,
 *                           o desconto em palavras e o aviso de que NÃO acumula com a indicação.
 *
 * Regras (produto, 19/11): só a 1ª cobrança; percentual FIXO na constante (não vem do código);
 * teto de usos e validade por código (tabela cupons_influenciador); não acumula com a indicação
 * (vale o que a conta usou primeiro); o desconto aparece ESCRITO antes de pagar (CDC);
 * atribuição guarda só código + conta. NASCE DESLIGADO: só liga com env CUPOM_INFLUENCER_ATIVO='1'.
 * Quem decide é o Postgres (cupom_verificar/cupom_reservar, só service_role); o worker repassa.
 * Pix e cartão têm caminhos próprios (AbacatePay/MP não usam promotion code da Stripe).
 * Sem preço novo: o valor com desconto sai do preço de tabela × (100 − %), arredondado ao centavo.
 */
import { rateOkSensivel, cabeNoTeto, textoCabeNoTeto, TETO } from './rateLimit.js';
import { parseJsonBody } from './util.js';
import { sbHeaders } from './creditos.js';

// Espelho de src/services/limitesComerciais.ts (paridade em scripts/teste-cupom-sql.ts e worker/scripts/teste-cupom.js).
export const CUPOM_PERCENTUAL = 10;

/** Percentual ativo, ou 0 = recurso desligado (flag). */
export function pctLigado(env) {
  return env && env.CUPOM_INFLUENCER_ATIVO === '1' ? CUPOM_PERCENTUAL : 0;
}

const RE_CODIGO = /^[A-Z0-9]{4,20}$/;
/** Normaliza o código digitado: maiúsculo, sem espaço. Null se não tem o formato. */
export function normalizarCodigoCupom(bruto) {
  if (typeof bruto !== 'string') return null;
  const c = bruto.trim().toUpperCase();
  return RE_CODIGO.test(c) ? c : null;
}

/** Valor com desconto em REAIS, arredondado ao centavo. Nunca abaixo de 0,01. */
export function valorComDesconto(valorReais, pct) {
  const v = Number(valorReais);
  if (!Number.isFinite(v) || v <= 0 || !(pct > 0 && pct < 100)) return v;
  return Math.max(0.01, Math.round((v * 100 * (100 - pct)) / 100) / 100);
}

const brl = (n) => `R$ ${Number(n).toFixed(2).replace('.', ',')}`;

/** Texto do desconto, mostrado ANTES do Pix/cartão. `de`/`por` em reais (opcionais no cartão, onde a Stripe mostra o valor). */
export function textoDesconto({ pct, de, por }) {
  const base = `Cupom: ${pct}% de desconto só na 1ª cobrança.`;
  if (de && por) return `${base} De ${brl(de)} por ${brl(por)}; nas próximas, o valor volta ao normal.`;
  return `${base} Nas próximas, o valor volta ao normal.`;
}

/** Aviso fixo exibido antes de aplicar o cupom. */
export const AVISO_NAO_ACUMULA =
  'Cupom e indicação não se somam: vale o que você usar primeiro nesta conta.';

/** Texto por motivo de recusa (o app mostra isto; nunca "erro" genérico). */
export const MOTIVO_TEXTO = {
  invalido: 'Esse código não existe ou não está mais ativo.',
  expirado: 'Esse código já passou da validade.',
  esgotado: 'Esse código atingiu o limite de usos.',
  ja_usou: 'Você já usou um cupom nesta conta. O desconto vale só na 1ª cobrança.',
  ja_pagou: 'O cupom vale só na 1ª cobrança, e esta conta já pagou um plano.',
  indicacao: 'Esta conta já está com a indicação, e cupom e indicação não se somam.',
  desligado: 'Cupom indisponível no momento.',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

async function getUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
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

/** RPC service_role. { ok:true, data } | { ok:false }. */
export async function rpc(env, nome, args) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(args),
    });
    if (!r.ok) return { ok: false };
    return { ok: true, data: await r.json().catch(() => null) };
  } catch {
    return { ok: false };
  }
}

/**
 * Reserva o desconto antes de abrir o checkout. { ok:true, pct, codigo } | { ok:false, status, texto }.
 * status 'indisponivel' = banco fora do ar (o chamador devolve 503; "não sei" nunca vira "sem desconto").
 */
export async function reservarCupom(env, { userId, codigo, plano, canal }) {
  const pct = pctLigado(env);
  if (!pct) return { ok: false, status: 'desligado', texto: MOTIVO_TEXTO.desligado };
  const cod = normalizarCodigoCupom(codigo);
  if (!cod) return { ok: false, status: 'invalido', texto: MOTIVO_TEXTO.invalido };
  const r = await rpc(env, 'cupom_reservar', { p_user: userId, p_codigo: cod, p_pct: pct, p_plano: plano, p_canal: canal });
  if (!r.ok || !r.data) return { ok: false, status: 'indisponivel', texto: 'Não consegui validar o cupom agora. Tente de novo.' };
  if (r.data.status !== 'ok') {
    return { ok: false, status: r.data.status, texto: MOTIVO_TEXTO[r.data.status] || MOTIVO_TEXTO.invalido };
  }
  return { ok: true, pct, codigo: r.data.codigo };
}

/** Pagamento confirmado: a reserva vira uso. Falha aqui não perde o pagamento (a conta já foi creditada). */
export async function confirmarCupom(env, userId) {
  const r = await rpc(env, 'cupom_confirmar', { p_user: userId });
  return r.ok;
}

/** POST /cupom/consultar. `precosPix`: tabela de preço do Pix (injetada; evita import circular). */
export async function handleCupom(request, env, url, precosPix = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  // GET /cupom/config: o app só mostra o campo de cupom quando isto é true (desligado = nada na tela).
  if (url.pathname === '/cupom/config') {
    if (request.method !== 'GET') return json({ ok: false, erro: 'metodo_nao_permitido' }, 405);
    return json({ ok: true, ativo: pctLigado(env) > 0 });
  }
  if (url.pathname !== '/cupom/consultar') return json({ ok: false, erro: 'nao_encontrado' }, 404);
  if (request.method !== 'POST') return json({ ok: false, erro: 'metodo_nao_permitido' }, 405);
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, erro: 'backend_nao_configurado' }, 503);
  if (!(await rateOkSensivel(env, env.CONTA_RL || env.STRIPE_RL, `cupom:consultar:${user.id}`))) {
    return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
  }
  const pct = pctLigado(env);
  if (!pct) return json({ ok: true, valido: false, status: 'desligado', texto: MOTIVO_TEXTO.desligado });

  if (!cabeNoTeto(request, TETO.JSON).ok) return json({ ok: false, erro: 'payload_grande' }, 413);
  let texto = '';
  try { texto = await request.text(); } catch { texto = ''; }
  if (!textoCabeNoTeto(texto, TETO.JSON)) return json({ ok: false, erro: 'payload_grande' }, 413);
  const corpo = parseJsonBody(texto) || {};
  const cod = normalizarCodigoCupom(corpo.codigo);
  if (!cod) return json({ ok: true, valido: false, status: 'invalido', texto: MOTIVO_TEXTO.invalido });

  const r = await rpc(env, 'cupom_verificar', { p_user: user.id, p_codigo: cod, p_pct: pct });
  if (!r.ok || !r.data) return json({ ok: false, erro: 'indisponivel' }, 503);
  if (r.data.status !== 'ok') {
    return json({ ok: true, valido: false, status: r.data.status, texto: MOTIVO_TEXTO[r.data.status] || MOTIVO_TEXTO.invalido, aviso: AVISO_NAO_ACUMULA });
  }
  const tabela = corpo.plano && precosPix[corpo.plano];
  const de = tabela ? tabela.valor : null;
  const por = de ? valorComDesconto(de, pct) : null;
  return json({ ok: true, valido: true, status: 'ok', pct, codigo: cod, de, por, texto: textoDesconto({ pct, de, por }), aviso: AVISO_NAO_ACUMULA });
}
