/**
 * OLLI — clima do dia para o prestador de campo (item 2.5 da Onda 2).
 *
 *   GET /clima?lat=<graus>&lon=<graus>
 *
 * Upstream: Open-Meteo (https://open-meteo.com) — sem chave, sem conta nova do
 * dono. Devolve temperatura atual, máxima/mínima do dia, código do tempo (WMO)
 * e a chance de chuva hora a hora nas próximas 12h.
 *
 * ─── RESPOSTAS ─────────────────────────────────────────────────────────────
 *   200 { ok:true, local:{geohash,lat,lon}, fuso, atual:{temperatura,codigo,ehDia},
 *         hoje:{data,max,min}, chuvaPorHora:[{inicio,hora,probabilidade,codigo}],
 *         atualizadoEm, cache }
 *   400 { ok:false, motivo:'coordenadas_invalidas' }
 *   429 { ok:false, motivo:'muitas_requisicoes' }
 *   503 { ok:false, motivo:'clima_indisponivel' }
 *
 * "Não sei" NUNCA vira "não chove": hora sem probabilidade no upstream sai com
 * `probabilidade: null`, e não com 0. A tela decide o que dizer sobre isso —
 * mas não pode afirmar céu limpo a partir de um buraco no dado.
 *
 * ─── CACHE: 30 MIN POR CÉLULA DE ~5 KM ─────────────────────────────────────
 * A chave é o geohash de 5 caracteres (célula de ~4,9 km × 4,9 km). Todos os
 * prestadores da mesma vizinhança dividem UMA consulta ao Open-Meteo a cada
 * 30 min — e o upstream recebe o CENTRO da célula, não a coordenada de quem
 * pediu (a posição exata do prestador não sai do OLLI à toa).
 *
 * O que vai para o cache é a previsão BRUTA normalizada (48h), não a janela de
 * 12h já cortada: a janela é recortada na hora de responder, a partir do
 * relógio de agora. Assim uma entrada de 29 min atrás não devolve uma "próxima
 * hora" que já passou.
 *
 * Cache API do Workers (`caches.default`) com URL sintética. Observação honesta:
 * no subdomínio *.workers.dev a Cache API é no-op — lá todo pedido é miss e o
 * rate limit é quem segura. No domínio próprio ela funciona.
 *
 * ─── RATE LIMIT POR IP ─────────────────────────────────────────────────────
 * Binding CLIMA_RL. A rota é pública (não exige login: o dado é público e o
 * upstream é grátis), então o teto é por IP. Acerto de cache NÃO consome
 * balde (mesmo raciocínio do /cep: não custou rede de ninguém). Política
 * `sensivel:false`: limitador indisponível → segue, porque clima não é
 * dinheiro nem convite (ver rateLimit.js).
 */

import { checarLimite, deixaPassar } from './rateLimit.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

/** 30 minutos — a previsão horária do Open-Meteo não muda mais rápido que isso. */
export const CLIMA_TTL_S = 30 * 60;

/** Geohash de 5 caracteres ≈ célula de 4,9 km × 4,9 km. */
export const CLIMA_GEOHASH_PRECISAO = 5;

/** Janela de chuva devolvida ao app. */
export const CLIMA_HORAS = 12;

/** Rede ruim é o normal deste público: melhor falhar rápido e mostrar "indisponível". */
export const CLIMA_TIMEOUT_MS = 5000;

/** Prefixo da URL sintética do cache. Versão no caminho: formato novo = chave nova. */
const CACHE_PREFIXO = 'https://cache.olli.interno/clima/v1/';

// ═══════════════════════════════════════════════════════════════════════════
// Validação
// ═══════════════════════════════════════════════════════════════════════════

/** Graus decimais simples. Sem notação científica, sem "Infinity", sem vazio. */
const RE_GRAU = /^-?\d{1,3}(\.\d{1,10})?$/;

/**
 * Lê `lat`/`lon` da query. `null` = coordenada inválida (e isso é 400, não
 * "indisponível": quem chamou mandou dado errado).
 * 0,0 é recusado: é o "ponto nulo" no Atlântico — na prática é GPS sem fix
 * ou campo não preenchido, nunca o endereço de um cliente.
 */
export function validarCoordenadas(latBruto, lonBruto) {
  const latS = String(latBruto ?? '').trim();
  const lonS = String(lonBruto ?? '').trim();
  if (!RE_GRAU.test(latS) || !RE_GRAU.test(lonS)) return null;
  const lat = Number(latS);
  const lon = Number(lonS);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

// ═══════════════════════════════════════════════════════════════════════════
// Geohash (Niemeyer) — só o necessário: codificar e achar o centro da célula
// ═══════════════════════════════════════════════════════════════════════════

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Limites da célula do geohash que contém (lat, lon). */
function limitesDaCelula(lat, lon, precisao) {
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let par = true; // bits pares = longitude
  while (hash.length < precisao) {
    if (par) {
      const meio = (lonMin + lonMax) / 2;
      if (lon >= meio) { ch = (ch << 1) | 1; lonMin = meio; } else { ch <<= 1; lonMax = meio; }
    } else {
      const meio = (latMin + latMax) / 2;
      if (lat >= meio) { ch = (ch << 1) | 1; latMin = meio; } else { ch <<= 1; latMax = meio; }
    }
    par = !par;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return { hash, latMin, latMax, lonMin, lonMax };
}

/** Geohash de `precisao` caracteres. */
export function geohash(lat, lon, precisao = CLIMA_GEOHASH_PRECISAO) {
  return limitesDaCelula(lat, lon, precisao).hash;
}

/**
 * Geohash + centro da célula (arredondado a 4 casas, ~11 m — mais que o
 * suficiente para previsão e estável como parâmetro de URL).
 */
export function celulaClima(lat, lon, precisao = CLIMA_GEOHASH_PRECISAO) {
  const c = limitesDaCelula(lat, lon, precisao);
  const r4 = (n) => Math.round(n * 1e4) / 1e4;
  return { geohash: c.hash, lat: r4((c.latMin + c.latMax) / 2), lon: r4((c.lonMin + c.lonMax) / 2) };
}

// ═══════════════════════════════════════════════════════════════════════════
// Open-Meteo
// ═══════════════════════════════════════════════════════════════════════════

/** URL do forecast. 2 dias: a janela de 12h a partir das 13h já cruza a meia-noite. */
export function urlOpenMeteo(lat, lon) {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,weather_code,is_day',
    hourly: 'precipitation_probability,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '2',
  });
  return `https://api.open-meteo.com/v1/forecast?${p.toString()}`;
}

/** Número finito ou `null`. NUNCA 0 por padrão — 0% de chuva é uma afirmação. */
function numOuNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const RE_HORA_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Molda a resposta do Open-Meteo na previsão bruta do OLLI (o que vai para o
 * cache). `null` = veio algo que não dá para usar — e isso é `indisponivel`.
 *
 * Exige o mínimo que a tela promete: temperatura atual e código do tempo. Sem
 * eles não há resposta honesta. Máx/mín e chuva podem faltar pontualmente
 * (viram `null`), mas a série horária precisa EXISTIR e estar alinhada.
 */
export function lerOpenMeteo(d) {
  if (!d || typeof d !== 'object') return null;
  const cur = d.current;
  const hourly = d.hourly;
  const daily = d.daily;
  if (!cur || !hourly || !daily) return null;

  const temperatura = numOuNull(cur.temperature_2m);
  const codigo = numOuNull(cur.weather_code);
  if (temperatura === null || codigo === null) return null;
  const agoraLocal = typeof cur.time === 'string' && RE_HORA_LOCAL.test(cur.time) ? cur.time : null;
  if (!agoraLocal) return null;

  const tempos = hourly.time;
  const probs = hourly.precipitation_probability;
  const codigos = hourly.weather_code;
  if (!Array.isArray(tempos) || tempos.length === 0) return null;
  // Séries desalinhadas = não sabemos qual probabilidade é de qual hora.
  if (!Array.isArray(probs) || probs.length !== tempos.length) return null;
  if (Array.isArray(codigos) && codigos.length !== tempos.length) return null;

  const horas = [];
  for (let i = 0; i < tempos.length; i++) {
    const t = tempos[i];
    if (typeof t !== 'string' || !RE_HORA_LOCAL.test(t)) return null;
    const p = numOuNull(probs[i]);
    horas.push({
      inicio: t,
      probabilidade: p === null ? null : Math.max(0, Math.min(100, Math.round(p))),
      codigo: Array.isArray(codigos) ? numOuNull(codigos[i]) : null,
    });
  }

  const dias = [];
  if (Array.isArray(daily.time)) {
    for (let i = 0; i < daily.time.length; i++) {
      const data = daily.time[i];
      if (typeof data !== 'string' || !RE_DATA.test(data)) continue;
      const max = Array.isArray(daily.temperature_2m_max) ? numOuNull(daily.temperature_2m_max[i]) : null;
      const min = Array.isArray(daily.temperature_2m_min) ? numOuNull(daily.temperature_2m_min[i]) : null;
      dias.push({ data, max, min });
    }
  }

  return {
    v: 1,
    fuso: typeof d.timezone === 'string' ? d.timezone : null,
    utcOffsetSeg: numOuNull(d.utc_offset_seconds) ?? 0,
    atual: {
      temperatura,
      codigo,
      ehDia: cur.is_day === 1 || cur.is_day === true,
      medidoEm: agoraLocal,
    },
    dias,
    horas,
  };
}

/** 'AAAA-MM-DDTHH:00' do relógio LOCAL do lugar (não do aparelho, não UTC). */
function horaLocalDe(agoraMs, utcOffsetSeg) {
  const d = new Date(agoraMs + utcOffsetSeg * 1000);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:00`;
}

/**
 * Recorta a previsão bruta no que o app recebe: o dia de HOJE (no fuso do
 * lugar) e as próximas `CLIMA_HORAS` horas a partir da hora cheia corrente.
 * `null` = a previsão guardada não cobre agora (relógio fora da série) —
 * resposta antiga demais para ser verdade.
 */
export function montarResposta(bruto, agoraMs, celula) {
  const horaAgora = horaLocalDe(agoraMs, bruto.utcOffsetSeg);
  const dataHoje = horaAgora.slice(0, 10);
  // Comparação lexicográfica funciona: formato fixo 'AAAA-MM-DDTHH:MM'.
  const inicio = bruto.horas.findIndex((h) => h.inicio >= horaAgora);
  if (inicio < 0) return null;
  const janela = bruto.horas.slice(inicio, inicio + CLIMA_HORAS).map((h) => ({
    inicio: h.inicio,
    hora: h.inicio.slice(11, 16),
    probabilidade: h.probabilidade,
    codigo: h.codigo,
  }));
  const hoje = bruto.dias.find((x) => x.data === dataHoje) || null;
  return {
    ok: true,
    local: celula,
    fuso: bruto.fuso,
    atual: bruto.atual,
    hoje: hoje ? { data: hoje.data, max: hoje.max, min: hoje.min } : { data: dataHoje, max: null, min: null },
    chuvaPorHora: janela,
  };
}

/** `AbortSignal.timeout` existe no Workers e no Node 18+; se não existir, segue sem timeout. */
function sinalDeTimeout(ms) {
  try {
    return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(ms)
      : undefined;
  } catch {
    return undefined;
  }
}

async function consultarOpenMeteo(fetchFn, lat, lon) {
  try {
    const r = await fetchFn(urlOpenMeteo(lat, lon), {
      headers: { Accept: 'application/json' },
      signal: sinalDeTimeout(CLIMA_TIMEOUT_MS),
    });
    if (!r || !r.ok) return null;
    const d = await r.json().catch(() => null);
    return lerOpenMeteo(d);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Cache API
// ═══════════════════════════════════════════════════════════════════════════

function cachePadrao() {
  try {
    return typeof caches !== 'undefined' && caches.default ? caches.default : null;
  } catch {
    return null;
  }
}

/** Lê do cache. Falha do cache = miss (nunca derruba a rota). */
async function lerDoCache(cache, chave) {
  if (!cache) return null;
  try {
    const r = await cache.match(chave);
    if (!r) return null;
    const corpo = await r.json().catch(() => null);
    return corpo && corpo.v === 1 && Array.isArray(corpo.horas) && corpo.atual ? corpo : null;
  } catch {
    return null;
  }
}

async function gravarNoCache(cache, chave, bruto) {
  if (!cache) return;
  try {
    await cache.put(
      chave,
      new Response(JSON.stringify({ ...bruto, obtidoEm: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CLIMA_TTL_S}` },
      }),
    );
  } catch {
    // Sem cache a rota continua funcionando — só custa uma consulta a mais.
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /clima?lat=&lon= — público, limitado por IP.
 *
 * Ordem (e o porquê): valida → cache → rate limit → upstream.
 *  - coordenada inválida não gasta balde nem rede;
 *  - acerto de cache não gasta balde (não tocou rede de ninguém);
 *  - só o miss compete pelo teto, porque só ele custa fair-use do Open-Meteo.
 *
 * @param {{fetch?:Function, cache?:object|null, agora?:Function, waitUntil?:Function}} [deps]
 */
export async function handleClima(request, env, url, deps = {}) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, motivo: 'metodo_nao_suportado' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET', ...CORS },
    });
  }
  const fetchFn = deps.fetch || fetch;
  const cache = 'cache' in deps ? deps.cache : cachePadrao();
  const agoraMs = deps.agora ? deps.agora() : Date.now();

  const coord = validarCoordenadas(url.searchParams.get('lat'), url.searchParams.get('lon'));
  if (!coord) return json({ ok: false, motivo: 'coordenadas_invalidas' }, 400);

  const celula = celulaClima(coord.lat, coord.lon);
  const chave = `${CACHE_PREFIXO}${celula.geohash}`;

  const guardado = await lerDoCache(cache, chave);
  if (guardado) {
    const resp = montarResposta(guardado, agoraMs, celula);
    if (resp) return json({ ...resp, atualizadoEm: guardado.obtidoEm || null, cache: true });
    // Entrada que não cobre a hora atual: trata como miss e reconsulta.
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
  const estado = await checarLimite(env && env.CLIMA_RL, ip);
  if (!deixaPassar(estado, { sensivel: false })) {
    return json({ ok: false, motivo: 'muitas_requisicoes' }, 429);
  }

  const bruto = await consultarOpenMeteo(fetchFn, celula.lat, celula.lon);
  if (!bruto) return json({ ok: false, motivo: 'clima_indisponivel' }, 503);

  const resp = montarResposta(bruto, agoraMs, celula);
  if (!resp) return json({ ok: false, motivo: 'clima_indisponivel' }, 503);

  // `indisponivel` NUNCA é cacheado — guardar a falha seria esticar 5 s de
  // instabilidade do upstream em 30 min de "clima indisponível" na tela.
  const gravacao = gravarNoCache(cache, chave, bruto);
  if (deps.waitUntil) deps.waitUntil(gravacao);
  else await gravacao;

  return json({ ...resp, atualizadoEm: new Date(agoraMs).toISOString(), cache: false });
}
