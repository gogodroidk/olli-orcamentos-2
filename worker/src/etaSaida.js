/**
 * OLLI — "A que horas eu preciso SAIR" (POST /eta/saida).
 *
 * FUNDAÇÃO da feature descrita em docs/ENXAME/IDEIA_ETA_TRANSITO.md. É a parte
 * que NÃO depende de permissão de localização no aparelho: a origem vem do
 * cadastro (visita anterior ou endereço da empresa), não do GPS. Sem permissão
 * nova = sem passo de loja, sem política de privacidade nova, sem prebuild.
 *
 * DIFERENÇA PARA O /eta QUE JÁ EXISTE (index.js:354):
 *   /eta       → "quanto tempo daqui até lá, AGORA". Trânsito de agora.
 *   /eta/saida → "a que horas eu saio para CHEGAR às 15h". Trânsito PREVISTO
 *                para o horário da saída (`departureTime`), que é o campo que o
 *                /eta não manda — e sem ele o número calculado de manhã para uma
 *                visita da tarde está simplesmente errado, sem ninguém perceber.
 *
 * ─── A REGRA DURA DESTE ARQUIVO ────────────────────────────────────────────
 * NENHUM caminho devolve `ok:true` com um número que não veio da Routes API
 * (direto ou de um cache que veio dela). Não existe estimativa por linha reta,
 * não existe "~10 min, pertinho", não existe chute otimista. Errar a hora de
 * sair faz o prestador chegar ATRASADO no cliente — é pior do que não ter a
 * função. Quando não dá para calcular, o estado é `indisponivel` e o app cai no
 * lembrete fixo que já existe.
 *
 * TRÊS ESTADOS, sempre (regra da casa `olli-gate-erro-vira-vazio`):
 *   { ok:true,  estado:'ok', ... }
 *   { ok:false, estado:'indisponivel', erro }            → rede/API/cota. "Não consegui calcular".
 *   { ok:false, estado:'endereco_insuficiente', qual }   → não dá para geocodificar. Ação: corrigir endereço.
 * "Não sei" nunca vira "não tem", e nunca vira sucesso.
 *
 * ─── CUSTO (é o que decide o desenho) ──────────────────────────────────────
 * Preços conferidos na web em 2026-07-18 (fontes no fim do doc do cluster):
 *   Compute Routes Essentials — 10.000 grátis/mês · US$  5,00 / 1.000
 *   Compute Routes Pro        —  5.000 grátis/mês · US$ 10,00 / 1.000
 *   Geocoding                 — 10.000 grátis/mês · US$  5,00 / 1.000
 * O SKU é decidido pelo `routingPreference`: TRAFFIC_AWARE / TRAFFIC_AWARE_OPTIMAL
 * caem no **Pro** (dobro do preço, metade da franquia); TRAFFIC_UNAWARE fica no
 * Essentials. Por isso `modo` é OBRIGATÓRIO no corpo — quem chama escolhe, e a
 * escolha fica visível no call site em vez de escondida num default:
 *   modo:'planejamento' → TRAFFIC_UNAWARE, sem departureTime  → Essentials
 *   modo:'confirmacao'  → TRAFFIC_AWARE  + departureTime      → Pro
 *
 * ─── SEGURANÇA ─────────────────────────────────────────────────────────────
 * A chave (OLLI_ROUTES_API_KEY) é secret do Worker e NUNCA vai para o aparelho —
 * mesma regra do /eta e do /geocodificar. Exige JWT do Supabase. Rate limit por
 * usuário ANTES de qualquer fetch pago, no binding ETA_RL que já existe.
 *
 * O rate limit aqui é FAIL-CLOSED (`sensivel:true`), diferente do /eta atual.
 * Motivo: esta rota gasta dinheiro de terceiro a cada chamada, e um limitador
 * "indisponível" não é sinônimo de "dentro do limite" (ver rateLimit.js — o
 * incidente real em que um build apagou os 5 limiters em produção). O custo de
 * negar é conhecido e tratado: o app mostra "não consegui calcular" e usa o
 * lembrete fixo. O custo de liberar sem vigia é uma conta aberta na Google.
 */

import { checarLimite, deixaPassar } from './rateLimit.js';
import { parseJsonBody } from './util.js';

// ─── Constantes de política (nada de número mágico solto no corpo) ─────────

/** Modos aceitos. Sem default de propósito: a escolha de SKU é do call site. */
export const MODOS = new Set(['planejamento', 'confirmacao']);

/**
 * Chute inicial do problema da galinha e do ovo: para pedir a duração com
 * trânsito previsto é preciso informar a hora da saída, que depende da duração.
 * Resolve-se com UMA iteração (nunca duas — dobra o custo para ganhar ~3 min):
 * estimativa → departureTime → duração real → hora de sair.
 */
export const ESTIMATIVA_INICIAL_MIN = 45;

/** Folga = max(5 min, 12% da duração). Chegar 5 min antes é profissional; 10 min atrasado é reclamação. */
export const FOLGA_PISO_MIN = 5;
export const FOLGA_FRACAO = 0.12;
export const FOLGA_MAX_MIN = 120;

/**
 * Acima disto a rota quase certamente veio de um endereço geocodificado errado
 * ("Rua São João" existe em 300 cidades). Devolver "saia às 3h da manhã" seria
 * pior do que admitir que não entendemos o endereço.
 */
export const MAX_DISTANCIA_KM = 600;

/** Google rejeita departureTime no passado quando o modo NÃO é TRANSIT. Margem p/ latência e relógio torto. */
export const MARGEM_DEPARTURE_MS = 30_000;

/** Teto de horizonte: agenda de prestador é de dias, não de meses. Além disso o trânsito previsto não vale nada. */
export const MAX_HORIZONTE_MS = 14 * 24 * 3600 * 1000;

/**
 * TTL do cache de trajeto, por modo. Os dois números são MUITO diferentes de
 * propósito, e o motivo é honestidade, não performance:
 *
 * - planejamento (TRAFFIC_UNAWARE): é a duração da VIA em fluxo livre. Só muda
 *   com obra. 30 dias — e 30, não 7, porque o padrão de ouro do público é o
 *   cliente recorrente visitado toda semana ou a cada quinze dias: com TTL de 7
 *   dias a visita semanal cai exatamente na borda e o cache erra justo o caso
 *   que ele existe para pegar.
 *
 * - confirmacao (TRAFFIC_AWARE): é o trânsito de AGORA. 10 minutos. Servir isso
 *   de um cache de horas seria apresentar número velho como atual — a versão
 *   sofisticada de "erro vira vazio". Consequência de custo, dita aqui porque
 *   contraria a intuição: **cache não é a alavanca principal de custo desta
 *   feature.** Ele corta o lado barato (Essentials); o lado caro (Pro) é
 *   incomprimível por cache sem mentir. A alavanca do lado caro é chamar menos
 *   — só a PRÓXIMA parada, não as 6 do dia. Ver o cálculo no doc do cluster.
 */
export const TTL_CACHE_MS = { planejamento: 30 * 24 * 3600 * 1000, confirmacao: 10 * 60 * 1000 };

/** Endereço não se muda de lugar. O que muda é o texto, e aí a chave muda junto. */
export const TTL_GEOCODE_MS = 90 * 24 * 3600 * 1000;

/** Corpo é minúsculo por natureza (2 endereços + 1 horário). Mesmo teto do /eta. */
export const MAX_BODY_BYTES = 4096;

// ─── Helpers puros (testáveis sem rede) ────────────────────────────────────

/** Coordenada plausível? Mesmo critério do coordOk do /eta. */
export function coordOk(p) {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

/**
 * Distância em linha reta (km). NÃO é ETA e nunca vira ETA — 2 km em linha reta
 * podem ser 25 min em Copacabana às 18h. Serve só como sanidade: se dois pontos
 * estão a 900 km, gastar uma chamada paga para descobrir que o endereço está
 * errado é jogar dinheiro fora.
 */
export function haversineKm(a, b) {
  const R = 6371;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Folga em minutos para uma duração em segundos. */
export function folgaPadraoMin(duracaoSeg) {
  const min = Math.max(0, Number(duracaoSeg) || 0) / 60;
  return Math.max(FOLGA_PISO_MIN, Math.ceil(min * FOLGA_FRACAO));
}

/** Folga escolhida: a do corpo se for um número são; senão a padrão. */
export function folgaEscolhida(folgaBruta, duracaoSeg) {
  if (Number.isFinite(folgaBruta) && folgaBruta >= 0 && folgaBruta <= FOLGA_MAX_MIN) {
    return Math.round(folgaBruta);
  }
  return folgaPadraoMin(duracaoSeg);
}

/**
 * Exige designador de fuso (offset ou Z). "2026-07-18T15:00:00" sozinho é
 * ambíguo — e um horário de chegada ambíguo é exatamente a classe de erro que
 * faz o prestador chegar na hora errada. Melhor recusar do que adivinhar.
 */
const RE_TZ = /(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Valida o horário de chegada desejado.
 * @returns {{ok:true, ms:number, offsetMin:number} | {ok:false, erro:string}}
 */
export function lerChegada(iso, agoraMs) {
  if (typeof iso !== 'string' || !iso.trim()) return { ok: false, erro: 'chegar_em_ausente' };
  const s = iso.trim();
  if (!RE_TZ.test(s)) return { ok: false, erro: 'chegar_em_sem_fuso' };
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return { ok: false, erro: 'chegar_em_invalido' };
  if (ms <= agoraMs) return { ok: false, erro: 'chegar_em_passado' };
  if (ms - agoraMs > MAX_HORIZONTE_MS) return { ok: false, erro: 'chegar_em_distante' };
  return { ok: true, ms, offsetMin: offsetDoIso(s) };
}

/** Offset em minutos declarado na própria string (Z = 0). Usado só para bucketar cache. */
export function offsetDoIso(s) {
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(s);
  if (!m) return 0; // Z
  const sinal = m[1] === '-' ? -1 : 1;
  return sinal * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * `departureTime` a mandar para o Google. Nunca no passado: a API rejeita
 * horário passado fora do modo TRANSIT, e um 400 do Google aqui viraria um
 * "indisponivel" que na verdade era um bug nosso.
 */
export function departureTimeMs({ chegarEmMs, estimativaSeg, folgaMin, agoraMs }) {
  const alvo = chegarEmMs - estimativaSeg * 1000 - folgaMin * 60_000;
  return Math.max(alvo, agoraMs + MARGEM_DEPARTURE_MS);
}

/**
 * O cálculo que o dono pediu: dada a duração REAL, a que horas sair.
 * `atrasado:true` significa "a hora de sair já passou" — e isso é informação
 * verdadeira e útil, não um erro. O app mostra "você já devia ter saído" com a
 * chegada prevista se sair agora, em vez de um horário no passado sem contexto.
 */
export function calcularSaida({ duracaoSeg, chegarEmMs, folgaMin, agoraMs }) {
  const sairEmMs = chegarEmMs - duracaoSeg * 1000 - folgaMin * 60_000;
  return {
    sairEmMs,
    folgaMin,
    atrasado: sairEmMs < agoraMs,
    sairAgoraChegaEmMs: agoraMs + duracaoSeg * 1000,
  };
}

/** ~110 m de granularidade: o suficiente para o mesmo cliente cair sempre no mesmo balde. */
export function arredondarCoord(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Chave do cache de trajeto. O mesmo par origem→destino se repete muito
 * (cliente recorrente), mas o trânsito das 8h não é o das 14h — daí a faixa de
 * hora — e sábado não é terça — daí o tipo de dia.
 */
export function chaveTrajeto({ origem, destino, partidaMs, offsetMin, modo }) {
  const local = new Date(partidaMs + offsetMin * 60_000);
  const hora = local.getUTCHours();
  const dia = local.getUTCDay(); // 0=dom 6=sáb, já no fuso local declarado
  const tipoDia = dia === 0 || dia === 6 ? 'fs' : 'du';
  return [
    modo,
    `${arredondarCoord(origem.lat)},${arredondarCoord(origem.lng)}`,
    `${arredondarCoord(destino.lat)},${arredondarCoord(destino.lng)}`,
    `h${hora}`,
    tipoDia,
  ].join('|');
}

/**
 * Marcas de acentuação separadas pelo NFD (U+0300..U+036F). Montada por código
 * em vez de literal: escrita direto no fonte, a classe fica INVISÍVEL no editor
 * (são combining marks — grudam no colchete anterior) e o próximo a mexer
 * apaga sem ver. Aqui está explícito o que é.
 */
const RE_DIACRITICO = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

/**
 * Chave do cache de geocodificação. Absorve acento, caixa e pontuação:
 * "Av. São João, 100" e "AV SAO JOAO 100" viram a mesma linha — que é a
 * diferença entre pagar 1 geocoding e pagar 2 pelo mesmo cliente.
 * NÃO absorve abreviação ("Av." ≠ "Avenida"): expandir abreviatura é adivinhar,
 * e adivinhar endereço é como se chega no lugar errado. Fica como cache miss.
 */
export function normalizarEndereco(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(RE_DIACRITICO, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

// ─── Cache no Supabase (best-effort, igual ao cnpj_cache) ──────────────────
// As tabelas `eta_cache` e `geocode_cache` ainda NÃO existem (a migration está
// escrita no doc do cluster, não aplicada). Enquanto não existirem, toda leitura
// devolve null e toda escrita é engolida: o endpoint funciona igual, só mais
// caro. Cache que quebra a rota é pior que cache nenhum.

function cacheHeaders(env, extra) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...(extra || {}),
  };
}

function temSupabase(env) {
  return !!(env && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/** @returns {Promise<{duracaoSeg:number, distanciaM:number|null, calculadoEm:string}|null>} */
export async function lerCacheTrajeto(env, chave, ttlMs, f) {
  if (!temSupabase(env)) return null;
  const fetchFn = f || fetch;
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/eta_cache?chave=eq.${encodeURIComponent(chave)}`
      + '&select=duracao_seg,distancia_m,atualizado_em&limit=1';
    const r = await fetchFn(url, { headers: cacheHeaders(env) });
    if (!r.ok) return null;
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr) || !arr.length) return null;
    const linha = arr[0];
    const carimbo = new Date(linha.atualizado_em).getTime();
    const idade = Date.now() - carimbo;
    if (!(idade >= 0) || idade > ttlMs) return null; // stale: melhor pagar do que mentir
    const seg = Number(linha.duracao_seg);
    if (!Number.isFinite(seg) || seg <= 0) return null;
    return {
      duracaoSeg: seg,
      distanciaM: Number.isFinite(Number(linha.distancia_m)) ? Number(linha.distancia_m) : null,
      calculadoEm: new Date(carimbo).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function gravarCacheTrajeto(env, chave, dados, f) {
  if (!temSupabase(env)) return;
  const fetchFn = f || fetch;
  try {
    await fetchFn(`${env.SUPABASE_URL}/rest/v1/eta_cache?on_conflict=chave`, {
      method: 'POST',
      headers: cacheHeaders(env, {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify({
        chave,
        duracao_seg: dados.duracaoSeg,
        distancia_m: dados.distanciaM,
        atualizado_em: new Date().toISOString(),
      }),
    });
  } catch { /* best-effort */ }
}

export async function lerCacheGeocode(env, norm, f) {
  if (!temSupabase(env)) return null;
  const fetchFn = f || fetch;
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/geocode_cache?endereco_norm=eq.${encodeURIComponent(norm)}`
      + '&select=lat,lng,formatado,atualizado_em&limit=1';
    const r = await fetchFn(url, { headers: cacheHeaders(env) });
    if (!r.ok) return null;
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr) || !arr.length) return null;
    const idade = Date.now() - new Date(arr[0].atualizado_em).getTime();
    if (!(idade >= 0) || idade > TTL_GEOCODE_MS) return null;
    const p = { lat: Number(arr[0].lat), lng: Number(arr[0].lng) };
    return coordOk(p) ? { ...p, formatado: arr[0].formatado || null } : null;
  } catch {
    return null;
  }
}

export async function gravarCacheGeocode(env, norm, ponto, f) {
  if (!temSupabase(env)) return;
  const fetchFn = f || fetch;
  try {
    await fetchFn(`${env.SUPABASE_URL}/rest/v1/geocode_cache?on_conflict=endereco_norm`, {
      method: 'POST',
      headers: cacheHeaders(env, {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify({
        endereco_norm: norm,
        lat: ponto.lat,
        lng: ponto.lng,
        formatado: ponto.formatado || null,
        atualizado_em: new Date().toISOString(),
      }),
    });
  } catch { /* best-effort */ }
}

// ─── Resolução de ponto (texto → coordenada) ───────────────────────────────

/**
 * Aceita `{lat,lng}` (barato: zero chamada) ou texto (1 Geocoding, cacheado 90
 * dias). O app DEVE mandar coordenada quando já tiver — ver o contrato no doc:
 * geocodificar é trabalho de quem salva o endereço, não de quem calcula a rota.
 *
 * @returns {Promise<{ok:true, ponto:{lat,lng,formatado?}, geocodou:boolean, cache:boolean}
 *                 | {ok:false, erro:'vazio'|'nao_encontrado'|'indisponivel'}>}
 */
export async function resolverPonto(valor, env, fetchFn) {
  if (coordOk(valor)) {
    return { ok: true, ponto: { lat: valor.lat, lng: valor.lng }, geocodou: false, cache: false };
  }
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (texto.length < 5) return { ok: false, erro: 'vazio' };

  const norm = normalizarEndereco(texto);
  const doCache = await lerCacheGeocode(env, norm, fetchFn);
  if (doCache) return { ok: true, ponto: doCache, geocodou: false, cache: true };

  try {
    const alvo = 'https://maps.googleapis.com/maps/api/geocode/json?address='
      + encodeURIComponent(texto)
      + '&region=br&language=pt-BR&key=' + env.OLLI_ROUTES_API_KEY;
    const resp = await fetchFn(alvo);
    if (!resp.ok) return { ok: false, erro: 'indisponivel' };
    const data = await resp.json().catch(() => ({}));
    // ZERO_RESULTS é resposta VÁLIDA dizendo "não existe" → endereço insuficiente.
    // Qualquer outro status não-OK é "não sei" → indisponivel. Os dois nunca se
    // confundem: um pede pro prestador corrigir o endereço, o outro não.
    if (data && data.status === 'ZERO_RESULTS') return { ok: false, erro: 'nao_encontrado' };
    const r0 = data && data.status === 'OK' && Array.isArray(data.results) ? data.results[0] : null;
    const loc = r0 && r0.geometry && r0.geometry.location;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
      return { ok: false, erro: data && data.status === 'OK' ? 'nao_encontrado' : 'indisponivel' };
    }
    const ponto = { lat: loc.lat, lng: loc.lng, formatado: r0.formatted_address || null };
    await gravarCacheGeocode(env, norm, ponto, fetchFn);
    return { ok: true, ponto, geocodou: true, cache: false };
  } catch {
    return { ok: false, erro: 'indisponivel' };
  }
}

// ─── Chamada à Routes API ──────────────────────────────────────────────────

/**
 * @returns {Promise<{ok:true, duracaoSeg:number, duracaoSemTransitoSeg:number|null, distanciaM:number|null}
 *                 | {ok:false, erro:'rota_indisponivel'|'sem_rota'|'eta_falhou'}>}
 */
export async function chamarRotas({ origem, destino, modo, partidaMs, env, fetchFn }) {
  const comTransito = modo === 'confirmacao';
  const campos = comTransito
    ? 'routes.duration,routes.staticDuration,routes.distanceMeters'
    : 'routes.duration,routes.distanceMeters';
  const corpo = {
    origin: { location: { latLng: { latitude: origem.lat, longitude: origem.lng } } },
    destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
    travelMode: 'DRIVE',
    // O campo que decide o SKU. TRAFFIC_UNAWARE = Essentials (US$5/1k, 10k
    // grátis); TRAFFIC_AWARE = Pro (US$10/1k, 5k grátis).
    routingPreference: comTransito ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE',
    languageCode: 'pt-BR',
    units: 'METRIC',
  };
  // departureTime SÓ no modo com trânsito: em TRAFFIC_UNAWARE ele não muda nada
  // e é feature a mais numa requisição que queremos manter no SKU barato.
  if (comTransito) corpo.departureTime = new Date(partidaMs).toISOString();

  try {
    const resp = await fetchFn(
      'https://routes.googleapis.com/directions/v2:computeRoutes?key=' + env.OLLI_ROUTES_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-FieldMask': campos },
        body: JSON.stringify(corpo),
      },
    );
    if (!resp.ok) return { ok: false, erro: 'rota_indisponivel' };
    const data = await resp.json().catch(() => ({}));
    const rota = data && Array.isArray(data.routes) ? data.routes[0] : null;
    if (!rota || !rota.duration) return { ok: false, erro: 'sem_rota' };
    const seg = segundosDe(rota.duration);
    if (!Number.isFinite(seg) || seg <= 0) return { ok: false, erro: 'sem_rota' };
    return {
      ok: true,
      duracaoSeg: seg,
      duracaoSemTransitoSeg: segundosDe(rota.staticDuration),
      distanciaM: Number.isFinite(rota.distanceMeters) ? rota.distanceMeters : null,
    };
  } catch {
    return { ok: false, erro: 'eta_falhou' };
  }
}

/** "1234s" → 1234. Nunca 0-por-acidente: valor ilegível vira null, e null não vira ETA. */
export function segundosDe(v) {
  if (typeof v !== 'string') return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(v.trim());
  if (!m) return null;
  const n = Math.round(Number(m[1]));
  return Number.isFinite(n) ? n : null;
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

/** "Não consegui calcular." Nunca acompanha número. */
export function respIndisponivel(erro, status = 200) {
  return json({ ok: false, estado: 'indisponivel', erro }, status);
}

/** "Não reconheci este endereço." Ação do prestador: corrigir. Nunca acompanha número. */
export function respEnderecoInsuficiente(qual, detalhe, extra) {
  return json({ ok: false, estado: 'endereco_insuficiente', qual, detalhe, ...(extra || {}) });
}

// ─── A rota ────────────────────────────────────────────────────────────────

/**
 * POST /eta/saida
 *
 * Corpo:
 *   {
 *     origem:   "Rua X, 123, São Paulo/SP"  |  { lat, lng },
 *     destino:  "Rua Y, 456, Santo André"   |  { lat, lng },
 *     chegarEm: "2026-07-18T15:00:00-03:00",   // ISO 8601 COM fuso, obrigatório
 *     modo:     "planejamento" | "confirmacao", // obrigatório: decide o SKU
 *     folgaMin: 8                               // opcional (0..120); default = max(5, 12%)
 *   }
 *
 * Resposta de sucesso:
 *   {
 *     ok: true, estado: 'ok',
 *     minutos, minutosSemTransito, distanciaKm,
 *     sairEm, chegarEm, sairAgoraChegaEm,        // ISO 8601 UTC
 *     folgaMin, atrasado, comTransito, modo, sku,
 *     cache, calculadoEm                          // carimbo: ETA sem hora é mentira em potência
 *   }
 *
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{fetch?:Function, agora?:Function, getUser?:Function}} [deps] — injeção para teste.
 */
export async function handleEtaSaida(request, env, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const agoraMs = deps.agora ? deps.agora() : Date.now();
  const getUser = deps.getUser || getUserPadrao;

  const user = await getUser(request, env);
  if (!user) return json({ ok: false, estado: 'indisponivel', erro: 'nao_autorizado' }, 401);
  if (!env.OLLI_ROUTES_API_KEY) return respIndisponivel('eta_nao_configurado');

  // Teto de payload ANTES do parse (corpo é minúsculo por natureza).
  let raw = '';
  try {
    raw = await request.text();
  } catch {
    return respIndisponivel('corpo_ilegivel', 400);
  }
  if (raw.length > MAX_BODY_BYTES) {
    return json({ ok: false, estado: 'indisponivel', erro: 'payload_grande' }, 413);
  }

  // Rate limit ANTES de qualquer fetch pago. FAIL-CLOSED: limiter que não
  // responde não é permissão. Ver o docblock do topo.
  const estado = await checarLimite(env.ETA_RL, user.id);
  if (!deixaPassar(estado, { sensivel: true })) {
    return respIndisponivel(estado === 'negado' ? 'muitas_requisicoes' : 'limite_indisponivel', 429);
  }

  const corpo = parseJsonBody(raw);

  const modo = typeof corpo.modo === 'string' ? corpo.modo.trim() : '';
  if (!MODOS.has(modo)) return respIndisponivel('modo_invalido', 400);

  const chegada = lerChegada(corpo.chegarEm, agoraMs);
  if (!chegada.ok) return respIndisponivel(chegada.erro, 400);

  // Endereços: coordenada (grátis) ou texto (1 Geocoding, cacheado).
  const [ro, rd] = await Promise.all([
    resolverPonto(corpo.origem, env, fetchFn),
    resolverPonto(corpo.destino, env, fetchFn),
  ]);
  // "Não sei" (API fora) e "não existe" (ZERO_RESULTS) são estados DIFERENTES e
  // levam a ações diferentes: um é esperar, o outro é corrigir o endereço.
  if (!ro.ok && ro.erro === 'indisponivel') return respIndisponivel('geocode_indisponivel');
  if (!rd.ok && rd.erro === 'indisponivel') return respIndisponivel('geocode_indisponivel');
  if (!ro.ok && !rd.ok) return respEnderecoInsuficiente('ambos', ro.erro);
  if (!ro.ok) return respEnderecoInsuficiente('origem', ro.erro);
  if (!rd.ok) return respEnderecoInsuficiente('destino', rd.erro);

  const origem = ro.ponto;
  const destino = rd.ponto;

  // Sanidade ANTES de gastar a chamada paga: 900 km entre duas visitas do mesmo
  // dia é endereço errado, não viagem. Barato (offline) e evita tanto o gasto
  // quanto a resposta absurda.
  const retaKm = haversineKm(origem, destino);
  if (retaKm > MAX_DISTANCIA_KM) {
    return respEnderecoInsuficiente('ambos', 'distancia_implausivel', {
      distanciaRetaKm: Math.round(retaKm),
    });
  }

  // Galinha e ovo, uma iteração só: estimativa (cache ou 45 min) → departureTime.
  const folgaChute = folgaEscolhida(corpo.folgaMin, ESTIMATIVA_INICIAL_MIN * 60);
  const partidaMs = departureTimeMs({
    chegarEmMs: chegada.ms,
    estimativaSeg: ESTIMATIVA_INICIAL_MIN * 60,
    folgaMin: folgaChute,
    agoraMs,
  });

  const chave = chaveTrajeto({ origem, destino, partidaMs, offsetMin: chegada.offsetMin, modo });
  const cacheado = await lerCacheTrajeto(env, chave, TTL_CACHE_MS[modo], fetchFn);

  let duracaoSeg;
  let duracaoSemTransitoSeg = null;
  let distanciaM = null;
  let veioDoCache = false;
  let calculadoEm = new Date(agoraMs).toISOString();

  if (cacheado) {
    duracaoSeg = cacheado.duracaoSeg;
    distanciaM = cacheado.distanciaM;
    veioDoCache = true;
    // Carimbo do cálculo ORIGINAL, não de agora. Apresentar número de ontem com
    // a hora de hoje é a versão sofisticada de "erro vira vazio".
    calculadoEm = cacheado.calculadoEm;
  } else {
    const rota = await chamarRotas({ origem, destino, modo, partidaMs, env, fetchFn });
    if (!rota.ok) return respIndisponivel(rota.erro);
    duracaoSeg = rota.duracaoSeg;
    duracaoSemTransitoSeg = rota.duracaoSemTransitoSeg;
    distanciaM = rota.distanciaM;
    await gravarCacheTrajeto(env, chave, { duracaoSeg, distanciaM }, fetchFn);
  }

  const distanciaKm = Number.isFinite(distanciaM) ? Math.round(distanciaM / 100) / 10 : null;
  if (distanciaKm !== null && distanciaKm > MAX_DISTANCIA_KM) {
    return respEnderecoInsuficiente('ambos', 'distancia_implausivel', { distanciaKm });
  }

  const folgaMin = folgaEscolhida(corpo.folgaMin, duracaoSeg);
  const saida = calcularSaida({ duracaoSeg, chegarEmMs: chegada.ms, folgaMin, agoraMs });

  return json({
    ok: true,
    estado: 'ok',
    minutos: Math.max(1, Math.round(duracaoSeg / 60)),
    minutosSemTransito: Number.isFinite(duracaoSemTransitoSeg)
      ? Math.max(1, Math.round(duracaoSemTransitoSeg / 60))
      : null,
    distanciaKm,
    sairEm: new Date(saida.sairEmMs).toISOString(),
    chegarEm: new Date(chegada.ms).toISOString(),
    sairAgoraChegaEm: new Date(saida.sairAgoraChegaEmMs).toISOString(),
    folgaMin: saida.folgaMin,
    atrasado: saida.atrasado,
    comTransito: modo === 'confirmacao',
    modo,
    sku: modo === 'confirmacao' ? 'pro' : 'essentials',
    cache: veioDoCache,
    calculadoEm,
  });
}
