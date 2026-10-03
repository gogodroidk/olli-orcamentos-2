/**
 * OLLI — ETA e "a que horas eu preciso SAIR", versão GRÁTIS (Onda I2, 01/10/2026).
 *
 *   POST /eta        → "quanto tempo daqui até lá, saindo agora"
 *   POST /eta/saida  → "a que horas eu saio para CHEGAR às 15h"
 *
 * ATÉ 30/09/2026 estas rotas pagavam a Routes API e a Geocoding API do Google. O
 * billing do projeto Google está DESLIGADO e o dono proibiu pagar. Agora as duas
 * respondem com a MESMA estimativa que o app faz no aparelho
 * (`src/services/etaEstimado.ts`: linha reta × 1,4 ÷ velocidade urbana do
 * horário de Brasília) — sem chave, sem terceiro, sem custo.
 *
 * O app novo (1.1.9+) nem chama mais estas rotas: estima localmente. Elas ficam de
 * pé para o APK antigo instalado não quebrar.
 *
 * ─── HONESTIDADE (P0) ──────────────────────────────────────────────────────
 *  - Toda resposta de sucesso leva `comTransito:false`, `estimado:true` e
 *    `rotulo:'estimativa, sem trânsito'`. Nunca "com trânsito".
 *  - Endereço em TEXTO não é mais geocodificado aqui (era Google). Quem manda
 *    texto recebe `indisponivel` com `erro:'geocodificacao_desligada'` — "não sei",
 *    nunca um ponto chutado. O app novo manda coordenadas (as dos clientes, que o
 *    `POST /geo` grátis já preenche).
 *
 * TRÊS ESTADOS, sempre (regra da casa `olli-gate-erro-vira-vazio`):
 *   { ok:true,  estado:'ok', ... }
 *   { ok:false, estado:'indisponivel', erro }
 *   { ok:false, estado:'endereco_insuficiente', qual }
 *
 * SEGURANÇA: exige JWT do Supabase e passa pelo rate limit ETA_RL por usuário.
 * Sem custo de terceiro, o limitador deixa de ser trava de gasto: política
 * `sensivel:false` (mudo = deixa passar), igual ao /cep.
 */

import { lerCorpoLimitado } from './bodyLimit.js';
import { cabeNoTeto, checarLimite, deixaPassar } from './rateLimit.js';
import { parseJsonBody } from './util.js';
import {
  MAX_DISTANCIA_KM,
  ROTULO_ESTIMATIVA,
  distanciaRetaKm,
  estimarParaChegar,
  estimarViagem,
  folgaEstimativaMin,
} from '../../src/services/etaEstimado.ts';

// ─── Constantes de política ────────────────────────────────────────────────

/** Teto de horizonte: agenda de prestador é de dias, não de meses. */
export const MAX_HORIZONTE_MS = 14 * 24 * 3600 * 1000;

/** Corpo é minúsculo por natureza (2 pontos + 1 horário). */
export const MAX_BODY_BYTES = 4096;

export { MAX_DISTANCIA_KM };

// ─── Helpers puros (testáveis sem rede) ────────────────────────────────────

/** Coordenada plausível no contrato do worker ({lat, lng}). */
export function coordOk(p) {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
    && !(p.lat === 0 && p.lng === 0);
}

/** {lat, lng} (contrato HTTP) → {lat, lon} (contrato do estimador). */
function paraPonto(p) {
  return { lat: p.lat, lon: p.lng };
}

/** Distância em linha reta (km) entre dois {lat, lng}. */
export function haversineKm(a, b) {
  return distanciaRetaKm(paraPonto(a), paraPonto(b));
}

/**
 * Exige designador de fuso (offset ou Z): "15:00" sem fuso pode ser 15h em
 * qualquer lugar do planeta, e chegada ambígua erra a hora de sair por horas.
 */
const RE_TZ = /(?:Z|[+-]\d{2}:?\d{2})$/;

/** @returns {{ok:true, ms:number} | {ok:false, erro:string}} */
export function lerChegada(iso, agoraMs) {
  if (typeof iso !== 'string' || !iso.trim()) return { ok: false, erro: 'chegar_em_ausente' };
  const s = iso.trim();
  if (!RE_TZ.test(s)) return { ok: false, erro: 'chegar_em_sem_fuso' };
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return { ok: false, erro: 'chegar_em_invalido' };
  if (ms <= agoraMs) return { ok: false, erro: 'chegar_em_passado' };
  if (ms - agoraMs > MAX_HORIZONTE_MS) return { ok: false, erro: 'chegar_em_distante' };
  return { ok: true, ms };
}

/**
 * Ponto do corpo: coordenada vira ponto; TEXTO é recusado com o motivo certo
 * (geocodificação por texto era Google e foi desligada); vazio é "insuficiente".
 * @returns {{ok:true, ponto:{lat,lng}} | {ok:false, erro:'vazio'|'texto_sem_coordenada'}}
 */
export function lerPonto(valor) {
  if (coordOk(valor)) return { ok: true, ponto: { lat: valor.lat, lng: valor.lng } };
  if (typeof valor === 'string' && valor.trim().length >= 5) return { ok: false, erro: 'texto_sem_coordenada' };
  return { ok: false, erro: 'vazio' };
}

// ─── Autenticação (mesma cópia local dos outros módulos do worker) ─────────

const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map();

async function getUserPadrao(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const cached = userCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.user;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    const user = u && u.id ? u : null;
    if (user) {
      if (userCache.size > 500) userCache.clear();
      userCache.set(token, { user, exp: Date.now() + USER_CACHE_TTL_MS });
    }
    return user;
  } catch {
    return null;
  }
}

// ─── Respostas (os três estados, num lugar só) ─────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

/** "Não consegui estimar." Nunca acompanha número. */
export function respIndisponivel(erro, status = 200) {
  return json({ ok: false, estado: 'indisponivel', erro }, status);
}

/** "Falta o local no mapa." Ação do prestador: corrigir. Nunca acompanha número. */
export function respEnderecoInsuficiente(qual, detalhe, extra) {
  return json({ ok: false, estado: 'endereco_insuficiente', qual, detalhe, ...(extra || {}) });
}

/** Leitura comum: auth, teto de corpo, rate limit. Devolve o corpo ou a Response de erro. */
async function prepararPedido(request, env, deps) {
  const getUser = deps.getUser || getUserPadrao;
  const user = await getUser(request, env);
  if (!user) return { resp: json({ ok: false, estado: 'indisponivel', erro: 'nao_autorizado', motivo: 'nao_autorizado' }, 401) };

  // Teto de payload ANTES do parse (nunca `request.text()` sem olhar o tamanho).
  if (!cabeNoTeto(request, MAX_BODY_BYTES).ok) return { resp: respIndisponivel('payload_grande', 413) };
  const lido = await lerCorpoLimitado(request, MAX_BODY_BYTES);
  if (lido.grande) return { resp: respIndisponivel('payload_grande', 413) };

  const estado = await checarLimite(env.ETA_RL, user.id);
  if (!deixaPassar(estado, { sensivel: false })) return { resp: respIndisponivel('muitas_requisicoes', 429) };

  return { corpo: parseJsonBody(lido.raw) || {} };
}

// ─── POST /eta/saida ───────────────────────────────────────────────────────

/**
 * Corpo: { origem:{lat,lng}, destino:{lat,lng}, chegarEm:"ISO com fuso", modo? }
 * (`modo` do APK antigo é aceito e ignorado: não há mais SKU para escolher.)
 *
 * Sucesso:
 *   { ok:true, estado:'ok', minutos, distanciaKm, sairEm, chegarEm, sairAgoraChegaEm,
 *     folgaMin, atrasado, comTransito:false, estimado:true, rotulo, calculadoEm }
 *
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{agora?:Function, getUser?:Function}} [deps] — injeção para teste.
 */
export async function handleEtaSaida(request, env, deps = {}) {
  const agoraMs = deps.agora ? deps.agora() : Date.now();
  const pedido = await prepararPedido(request, env, deps);
  if (pedido.resp) return pedido.resp;
  const corpo = pedido.corpo;

  const chegada = lerChegada(corpo.chegarEm, agoraMs);
  if (!chegada.ok) return respIndisponivel(chegada.erro, 400);

  const ro = lerPonto(corpo.origem);
  const rd = lerPonto(corpo.destino);
  // Texto sem coordenada: não é endereço errado, é serviço desligado → "não sei".
  if ((!ro.ok && ro.erro === 'texto_sem_coordenada') || (!rd.ok && rd.erro === 'texto_sem_coordenada')) {
    return respIndisponivel('geocodificacao_desligada');
  }
  if (!ro.ok && !rd.ok) return respEnderecoInsuficiente('ambos', 'vazio');
  if (!ro.ok) return respEnderecoInsuficiente('origem', 'vazio');
  if (!rd.ok) return respEnderecoInsuficiente('destino', 'vazio');

  const origem = paraPonto(ro.ponto);
  const destino = paraPonto(rd.ponto);
  const reta = distanciaRetaKm(origem, destino);
  if (reta > MAX_DISTANCIA_KM) {
    return respEnderecoInsuficiente('ambos', 'distancia_implausivel', { distanciaRetaKm: Math.round(reta) });
  }

  const est = estimarParaChegar(origem, destino, chegada.ms);
  if (!est) return respIndisponivel('estimativa_falhou');
  const agoraEst = estimarViagem(origem, destino, agoraMs) || est;
  const folgaMin = folgaEstimativaMin(est.minutos);
  const sairEmMs = chegada.ms - (est.minutos + folgaMin) * 60_000;

  return json({
    ok: true,
    estado: 'ok',
    minutos: est.minutos,
    // O APK antigo lê este campo: sem trânsito, a duração "sem trânsito" é a própria.
    minutosSemTransito: est.minutos,
    distanciaKm: est.distanciaKm,
    sairEm: new Date(sairEmMs).toISOString(),
    chegarEm: new Date(chegada.ms).toISOString(),
    sairAgoraChegaEm: new Date(agoraMs + agoraEst.minutos * 60_000).toISOString(),
    folgaMin,
    atrasado: sairEmMs < agoraMs,
    comTransito: false,
    estimado: true,
    rotulo: ROTULO_ESTIMATIVA,
    cache: false,
    calculadoEm: new Date(agoraMs).toISOString(),
  });
}

// ─── POST /eta — "saindo agora" ────────────────────────────────────────────

/**
 * Corpo `{origem:{lat,lng}, destino:{lat,lng}}`. Sucesso
 * `{ok:true, minutos, distanciaKm, comTransito:false, estimado:true, rotulo}`;
 * falha sempre `ok:false` SEM número.
 *
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{agora?:Function, getUser?:Function}} [deps]
 */
export async function handleEtaAgora(request, env, deps = {}) {
  const agoraMs = deps.agora ? deps.agora() : Date.now();
  const pedido = await prepararPedido(request, env, deps);
  if (pedido.resp) return pedido.resp;
  const corpo = pedido.corpo;

  if (!coordOk(corpo.origem) || !coordOk(corpo.destino)) return json({ ok: false, erro: 'coordenadas_invalidas' }, 400);
  const origem = paraPonto(corpo.origem);
  const destino = paraPonto(corpo.destino);
  if (distanciaRetaKm(origem, destino) > MAX_DISTANCIA_KM) return json({ ok: false, erro: 'distancia_implausivel' });

  const est = estimarViagem(origem, destino, agoraMs);
  if (!est) return json({ ok: false, erro: 'estimativa_falhou' });
  return json({
    ok: true,
    minutos: est.minutos,
    minutosSemTransito: est.minutos,
    distanciaKm: est.distanciaKm,
    comTransito: false,
    estimado: true,
    rotulo: ROTULO_ESTIMATIVA,
  });
}

// ─── POST /geocodificar — desligado com honestidade ────────────────────────

/**
 * Era a Geocoding API do Google (texto livre → ponto). Desligada junto com o
 * billing. Responde "não sei" com o motivo; quem precisa de ponto usa o
 * `POST /geo` (BrasilAPI + Nominatim/OSM, grátis), que é o que o app novo faz
 * ao salvar o cliente.
 */
export function handleGeocodificarDesligado() {
  return json({ ok: false, estado: 'indisponivel', erro: 'geocodificacao_desligada', motivo: 'use_post_geo' });
}
