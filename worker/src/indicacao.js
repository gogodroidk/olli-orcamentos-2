/**
 * Indicação "colega indica colega" — OLLI (worker Cloudflare, SEM SDK).
 *
 *   GET  /indicacao/meu       → { codigo, link, creditos, resumo }  (cria o código na 1ª vez)
 *   POST /indicacao/vincular  → { codigo } liga a conta NOVA ao indicador (idempotente)
 *   POST /indicacao/verificar → decide a recompensa do indicado logado (1º orçamento real)
 *   POST /indicacao/evento    → { evento: 'cartao_visto'|'compartilhada', momento, canal? }
 *
 * Segurança (mesmo modelo de conta.js):
 *  - Todas exigem JWT do Supabase validado em /auth/v1/user. O id do usuário é
 *    SEMPRE o do JWT — nunca vem do corpo. (O rascunho anterior aceitava
 *    `indicador_id` no corpo com service_role: qualquer um criava/lia código alheio.)
 *  - Quem decide é o Postgres (RPCs indicacao_*, só service_role): conta nova (≤ 7 dias), teto de 5 já no vínculo,
 *    não é o próprio indicador, 1º orçamento REAL, fora de funil_exclusoes, teto de 5 por
 *    indicador, tudo numa transação sob lock. O worker só repassa.
 *  - /verificar pode ser chamado à vontade pelo cliente: a verdade (o orçamento existe?)
 *    está no banco; chamar não concede nada que o banco não conceda.
 *  - "Não sei" nunca vira "não tem": RPC fora do ar = 503 com motivo, nunca 200 vazio.
 *  - Recompensa (1 mês de Pro por lado) fica DESLIGADA por flag: só liga com env
 *    INDICACAO_RECOMPENSA_ATIVA='1'. Desligada, nada é decidido e o app não promete nada.
 *    Valor e tetos vêm de UMA fonte (espelho de src/services/limitesComerciais.ts; paridade no teste).
 */
import { rateOkSensivel, cabeNoTeto, textoCabeNoTeto, TETO } from './rateLimit.js';
import { parseJsonBody } from './util.js';
import { sbHeaders } from './creditos.js';

// Espelho de src/services/limitesComerciais.ts (teste de paridade em scripts/teste-indicacoes-sql.ts).
export const INDICACAO_MESES_PRO = 1;
export const INDICACAO_TETO_PREMIADAS = 3;
export const INDICACAO_TETO_DIARIO = 20;

/** Meses de Pro por lado, ou 0 = recompensa desligada (flag). */
export function mesesLigados(env) {
  return env && env.INDICACAO_RECOMPENSA_ATIVA === '1' ? INDICACAO_MESES_PRO : 0;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

export const LINK_BASE = 'https://olliorcamentos.online/?ref=';
const RE_CODIGO = /^[A-Z0-9]{6}$/;
const MOMENTOS = new Set(['apos_envio', 'apos_aprovacao', 'painel']);
const CANAIS = new Set(['whatsapp', 'copiar', 'qr']);

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

/** Valida o JWT do Supabase em /auth/v1/user. Retorna o user ({id}) ou null. */
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

/** RPC service_role. { ok:true, data } | { ok:false }. Falha de rede/HTTP = ok:false. */
async function rpc(env, nome, args) {
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

async function inserirEvento(env, linha) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/indicacao_eventos`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(linha),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function lerCorpo(request) {
  if (!cabeNoTeto(request, TETO.JSON).ok) return { erro: 'payload_grande' };
  let texto = '';
  try {
    texto = await request.text();
  } catch {
    texto = '';
  }
  if (!textoCabeNoTeto(texto, TETO.JSON)) return { erro: 'payload_grande' };
  return { corpo: parseJsonBody(texto) };
}

/** Normaliza o código recebido: maiúsculo, sem espaço. Null se não tem o formato. */
export function normalizarCodigo(bruto) {
  if (typeof bruto !== 'string') return null;
  const c = bruto.trim().toUpperCase();
  return RE_CODIGO.test(c) ? c : null;
}

async function porta(request, env, nome) {
  const user = await getUser(request, env);
  if (!user) return { resp: json({ ok: false, erro: 'nao_autorizado' }, 401) };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { resp: json({ ok: false, erro: 'backend_nao_configurado' }, 503) };
  }
  // CONTA_RL não está no wrangler hoje: cai no STRIPE_RL (chave própria por rota+usuário).
  if (!(await rateOkSensivel(env, env.CONTA_RL || env.STRIPE_RL, `indicacao:${nome}:${user.id}`))) {
    return { resp: json({ ok: false, erro: 'muitas_requisicoes' }, 429) };
  }
  return { user };
}

export async function handleMeu(request, env) {
  const { user, resp } = await porta(request, env, 'meu');
  if (resp) return resp;
  const [cod, resumo] = await Promise.all([
    rpc(env, 'indicacao_codigo', { p_user: user.id }),
    rpc(env, 'indicacao_resumo', { p_user: user.id, p_teto: INDICACAO_TETO_PREMIADAS }),
  ]);
  const meses = mesesLigados(env);
  const codigo = cod.ok ? normalizarCodigo(cod.data) : null;
  if (!codigo) return json({ ok: false, erro: 'indisponivel' }, 503);
  // Resumo é enfeite do cartão: sem ele o código ainda vale. Mas "não sei" ≠ zero → null.
  return json({
    ok: true,
    codigo,
    link: `${LINK_BASE}${codigo}`,
    // 0 = recompensa desligada; o cartão não pode prometer nada.
    meses,
    teto: INDICACAO_TETO_PREMIADAS,
    // Desligado: sem contador. Ligado: só recompensados contam.
    // indicador que já paga: o cartão só promete o mês ao colega
    indicadorPaga: meses > 0 && resumo.ok && resumo.data?.paga === true,
    resumo: meses > 0 && resumo.ok && resumo.data && typeof resumo.data === 'object' ? resumo.data : null,
  });
}

export async function handleVincular(request, env) {
  const { user, resp } = await porta(request, env, 'vincular');
  if (resp) return resp;
  const { corpo, erro } = await lerCorpo(request);
  if (erro) return json({ ok: false, erro }, 413);
  const codigo = normalizarCodigo(corpo.codigo);
  if (!codigo) return json({ ok: false, erro: 'codigo_invalido' }, 400);
  const r = await rpc(env, 'indicacao_vincular', { p_indicado: user.id, p_codigo: codigo, p_teto: INDICACAO_TETO_PREMIADAS });
  if (!r.ok || typeof r.data !== 'string') return json({ ok: false, erro: 'indisponivel' }, 503);
  // Estados "perdidos" (código inexistente, conta antiga...) não são erro do cliente
  // refazer: 200 com o status, para o app apagar o código guardado e seguir a vida.
  return json({ ok: true, status: r.data });
}

export async function handleVerificar(request, env) {
  const { user, resp } = await porta(request, env, 'verificar');
  if (resp) return resp;
  const r = await rpc(env, 'indicacao_recompensar', {
    p_indicado: user.id,
    p_meses: mesesLigados(env),
    p_teto: INDICACAO_TETO_PREMIADAS,
    p_teto_dia: INDICACAO_TETO_DIARIO,
  });
  if (!r.ok || !r.data || typeof r.data.status !== 'string') return json({ ok: false, erro: 'indisponivel' }, 503);
  // Não devolve indicador_id ao indicado: ele não precisa saber quem foi.
  return json({ ok: true, status: r.data.status, meses: r.data.status === 'recompensado' ? r.data.meses : 0 });
}

export async function handleEvento(request, env) {
  const { user, resp } = await porta(request, env, 'evento');
  if (resp) return resp;
  const { corpo, erro } = await lerCorpo(request);
  if (erro) return json({ ok: false, erro }, 413);
  const evento = corpo.evento;
  if (evento !== 'cartao_visto' && evento !== 'compartilhada') return json({ ok: false, erro: 'evento_invalido' }, 400);
  if (!MOMENTOS.has(corpo.momento)) return json({ ok: false, erro: 'momento_invalido' }, 400);
  const canal = corpo.canal == null ? null : corpo.canal;
  if (canal !== null && !CANAIS.has(canal)) return json({ ok: false, erro: 'canal_invalido' }, 400);
  const gravou = await inserirEvento(env, { user_id: user.id, evento, momento: corpo.momento, canal });
  return gravou ? json({ ok: true }) : json({ ok: false, erro: 'indisponivel' }, 503);
}

export async function handleIndicacao(request, env, url) {
  const rota = url.pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (rota === '/indicacao/meu') {
    return request.method === 'GET' ? handleMeu(request, env) : json({ erro: 'metodo_nao_suportado' }, 405);
  }
  const posts = {
    '/indicacao/vincular': handleVincular,
    '/indicacao/verificar': handleVerificar,
    '/indicacao/evento': handleEvento,
  };
  if (posts[rota]) {
    return request.method === 'POST' ? posts[rota](request, env) : json({ erro: 'metodo_nao_suportado' }, 405);
  }
  return json({ erro: 'nao_encontrado' }, 404);
}
