/**
 * OLLI — clima do dia para o prestador de campo (item 2.5 da Onda 2).
 *
 *   GET /clima?lat=<graus>&lon=<graus>
 *
 * Upstream: MET Norway Locationforecast 2.0 /compact
 * (https://api.met.no/weatherapi/locationforecast/2.0/documentation) — grátis,
 * sem chave, uso comercial permitido sob CC BY 4.0 COM ATRIBUIÇÃO ("Previsão:
 * MET Norway"; o app expõe isso em `atribuicaoClima`). O dono proibiu serviço
 * pago e o Open-Meteo grátis é só não comercial — por isso a troca.
 *
 * Termos (https://api.met.no/doc/TermsOfService) que este arquivo cumpre:
 *  - User-Agent identificando o app e um contato (sem isso: 403);
 *  - coordenadas com no máximo 4 casas decimais (5+ casas: 403);
 *  - cache local respeitando `Expires` e revalidação com `If-Modified-Since`
 *    quando há `Last-Modified` (ver "CACHE" abaixo);
 *  - nada de rajada: uma consulta por célula de ~5 km a cada ≥30 min.
 *
 * O /compact NÃO tem probabilidade de chuva. Por hora ele dá a QUANTIDADE
 * prevista (`next_1_hours.details.precipitation_amount`, mm) e o símbolo do
 * tempo (`next_1_hours.summary.symbol_code`, ex.: 'rain', 'partlycloudy_day').
 * É isso que vai para o app.
 *
 * ─── RESPOSTAS ─────────────────────────────────────────────────────────────
 *   200 { ok:true, fonte:'MET Norway', licenca:'CC BY 4.0', local:{geohash,lat,lon},
 *         fuso:'America/Sao_Paulo', atual:{temperatura,simbolo,ehDia,medidoEm},
 *         hoje:{data,max,min}, chuvaPorHora:[{inicio,hora,mm,simbolo}],
 *         atualizadoEm, cache }
 *   400 { ok:false, motivo:'coordenadas_invalidas' }
 *   429 { ok:false, motivo:'muitas_requisicoes' }
 *   503 { ok:false, motivo:'clima_indisponivel' }
 *
 * Horários: o MET responde em UTC; o OLLI converte para America/Sao_Paulo
 * (`inicio`/`hora`/`hoje.data` são do relógio local). `ehDia` vem do sufixo do
 * símbolo (_day/_night/_polartwilight) e é `null` quando o símbolo não diz.
 *
 * "Não sei" NUNCA vira "não chove": hora sem `next_1_hours` (ou fora da série)
 * sai com `mm: null, simbolo: null`, e não com 0. A tela decide o que dizer
 * sobre isso — mas não pode afirmar céu limpo a partir de um buraco no dado.
 *
 * `hoje.max/min` = extremos das horas de HOJE (local) da hora atual em diante:
 * a previsão do MET só olha para a frente, então isto é "quanto ainda vai
 * esquentar/esfriar hoje", estável seja qual for a idade do cache.
 *
 * ─── CACHE: ≥30 MIN POR CÉLULA DE ~5 KM ────────────────────────────────────
 * A chave é o geohash de 5 caracteres (célula de ~4,9 km × 4,9 km). Todos os
 * prestadores da mesma vizinhança dividem UMA consulta ao MET — e o upstream
 * recebe o CENTRO da célula (4 casas), não a coordenada de quem pediu (a
 * posição exata do prestador não sai do OLLI à toa).
 *
 * Frescor: 30 min, ou até o `Expires` do MET se ele for mais longe (teto de
 * `CLIMA_GUARDA_S`). Depois disso a entrada continua guardada (até 6 h) só
 * para REVALIDAR: a próxima consulta manda `If-Modified-Since` com o
 * `Last-Modified` guardado; 304 = reaproveita a série e renova o frescor.
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
 * upstream é grátis), então o teto é por IP. Acerto de cache fresco NÃO
 * consome balde (mesmo raciocínio do /cep: não custou rede de ninguém).
 * Política `sensivel:false`: limitador indisponível → segue, porque clima não
 * é dinheiro nem convite (ver rateLimit.js).
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

/** 30 minutos de frescor mínimo — a previsão horária não muda mais rápido que isso. */
export const CLIMA_TTL_S = 30 * 60;

/** Quanto a entrada fica guardada para revalidar com If-Modified-Since (e teto do Expires). */
export const CLIMA_GUARDA_S = 6 * 60 * 60;

/** Geohash de 5 caracteres ≈ célula de 4,9 km × 4,9 km. */
export const CLIMA_GEOHASH_PRECISAO = 5;

/** Janela de chuva devolvida ao app. */
export const CLIMA_HORAS = 12;

/** Quantas horas da série do MET guardamos (a janela de 12h a partir das 13h cruza a meia-noite). */
export const CLIMA_HORAS_GUARDADAS = 48;

/** Rede ruim é o normal deste público: melhor falhar rápido e mostrar "indisponível". */
export const CLIMA_TIMEOUT_MS = 5000;

/** Fuso do "hoje" e das horas devolvidas. */
export const CLIMA_FUSO = 'America/Sao_Paulo';

/** Atribuição exigida pela CC BY 4.0. */
export const CLIMA_FONTE = 'MET Norway';
export const CLIMA_LICENCA = 'CC BY 4.0';

/** Endpoint do MET (produto compact). */
export const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

/** Identificação exigida pelos termos do MET: app + contato. Sem ela, 403. */
export const MET_USER_AGENT = 'OLLI-Orcamentos/1.0 https://olliorcamentos.online';

/** Prefixo da URL sintética do cache. Versão no caminho: formato novo = chave nova. */
const CACHE_PREFIXO = 'https://cache.olli.interno/clima/v2/';

const HORA_MS = 60 * 60 * 1000;

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
// MET Norway — Locationforecast 2.0 /compact
// ═══════════════════════════════════════════════════════════════════════════

/** URL do compact. Sempre 4 casas: 5+ casas é 403 pelos termos do MET. */
export function urlMet(lat, lon) {
  const p = new URLSearchParams({ lat: Number(lat).toFixed(4), lon: Number(lon).toFixed(4) });
  return `${MET_URL}?${p.toString()}`;
}

/** Número finito ou `null`. NUNCA 0 por padrão — 0 mm de chuva é uma afirmação. */
function numOuNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Texto não vazio ou `null`. */
function textoOuNull(v) {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** Horário do MET: ISO 8601 em UTC ('2026-10-01T17:00:00Z'). */
const RE_HORA_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/;

/**
 * Molda a resposta do MET na previsão bruta do OLLI (o que vai para o cache).
 * `null` = veio algo que não dá para usar — e isso é `indisponivel`.
 *
 * Guarda as primeiras `CLIMA_HORAS_GUARDADAS` horas da série. Para cada hora:
 * temperatura instantânea, mm previstos na hora seguinte e o símbolo. Campo
 * ausente vira `null` (o MET larga `next_1_hours` depois de ~60h, por exemplo),
 * mas horário malformado derruba tudo: sem saber de que hora é o dado, não há
 * resposta honesta.
 */
export function lerMet(d) {
  const serie = d && typeof d === 'object' && d.properties ? d.properties.timeseries : null;
  if (!Array.isArray(serie) || serie.length === 0) return null;

  const horas = [];
  let limite = null;
  for (const item of serie) {
    const t = item && typeof item.time === 'string' && RE_HORA_UTC.test(item.time) ? Date.parse(item.time) : NaN;
    if (!Number.isFinite(t)) return null;
    if (limite === null) limite = t + CLIMA_HORAS_GUARDADAS * HORA_MS;
    if (t >= limite) break;
    const dados = item.data || {};
    const instante = (dados.instant && dados.instant.details) || {};
    const prox = dados.next_1_hours || null;
    const mm = prox && prox.details ? numOuNull(prox.details.precipitation_amount) : null;
    horas.push({
      inicioUtc: new Date(t).toISOString(),
      temperatura: numOuNull(instante.air_temperature),
      // Quantidade negativa é lixo, não "seco".
      mm: mm === null || mm < 0 ? null : mm,
      simbolo: prox && prox.summary ? textoOuNull(prox.summary.symbol_code) : null,
    });
  }
  if (!horas.some((h) => h.temperatura !== null)) return null;

  const meta = d.properties.meta || {};
  return {
    v: 2,
    fonte: CLIMA_FONTE,
    previsaoDe: textoOuNull(meta.updated_at),
    horas,
  };
}

let fmtLocal = null;
/** Partes do relógio LOCAL (America/Sao_Paulo) de um instante. */
function partesLocais(ms) {
  if (!fmtLocal) {
    fmtLocal = new Intl.DateTimeFormat('en-CA', {
      timeZone: CLIMA_FUSO,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  }
  const p = {};
  for (const x of fmtLocal.formatToParts(new Date(ms))) p[x.type] = x.value;
  const hora = p.hour === '24' ? '00' : p.hour;
  const data = `${p.year}-${p.month}-${p.day}`;
  return { data, hora: `${hora}:${p.minute}`, inicio: `${data}T${hora}:${p.minute}` };
}

/** `true`/`false` pelo sufixo do símbolo; `null` quando o símbolo não diz ('rain', 'fog'…). */
function ehDiaDoSimbolo(simbolo) {
  if (!simbolo) return null;
  if (simbolo.endsWith('_day')) return true;
  if (simbolo.endsWith('_night') || simbolo.endsWith('_polartwilight')) return false;
  return null;
}

/**
 * Recorta a previsão bruta no que o app recebe: o "agora", o resto de HOJE (no
 * fuso local) e as próximas `CLIMA_HORAS` horas a partir da hora cheia
 * corrente. `null` = a previsão guardada não cobre agora (ou não tem
 * temperatura/símbolo para agora) — não há o que afirmar.
 */
export function montarResposta(bruto, agoraMs, celula) {
  const porHora = new Map();
  for (const h of bruto.horas) porHora.set(Date.parse(h.inicioUtc), h);

  // Fusos do Brasil são de hora cheia: a hora cheia UTC é a hora cheia local.
  const horaAtualMs = Math.floor(agoraMs / HORA_MS) * HORA_MS;
  // Sem a hora corrente na série, aceita a próxima (série que começa no :00 seguinte).
  const atualMs = porHora.has(horaAtualMs) ? horaAtualMs : horaAtualMs + HORA_MS;
  const atual = porHora.get(atualMs);
  if (!atual || atual.temperatura === null || atual.simbolo === null) return null;

  const janela = [];
  for (let k = 0; k < CLIMA_HORAS; k++) {
    const t = horaAtualMs + k * HORA_MS;
    const h = porHora.get(t);
    const local = partesLocais(t);
    janela.push({
      inicio: local.inicio,
      hora: local.hora,
      // Hora fora da série = "não sei", nunca 0.
      mm: h ? h.mm : null,
      simbolo: h ? h.simbolo : null,
    });
  }

  const dataHoje = partesLocais(agoraMs).data;
  const tempsHoje = bruto.horas
    .filter((h) => {
      const t = Date.parse(h.inicioUtc);
      return t >= horaAtualMs && h.temperatura !== null && partesLocais(t).data === dataHoje;
    })
    .map((h) => h.temperatura);

  return {
    ok: true,
    fonte: CLIMA_FONTE,
    licenca: CLIMA_LICENCA,
    local: celula,
    fuso: CLIMA_FUSO,
    atual: {
      temperatura: atual.temperatura,
      simbolo: atual.simbolo,
      ehDia: ehDiaDoSimbolo(atual.simbolo),
      medidoEm: partesLocais(atualMs).inicio,
    },
    hoje: {
      data: dataHoje,
      max: tempsHoje.length ? Math.max(...tempsHoje) : null,
      min: tempsHoje.length ? Math.min(...tempsHoje) : null,
    },
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

/** Data HTTP → ms, ou `null`. */
function dataHttp(v) {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Consulta o MET. NUNCA lança. Devolve:
 *  - `{ tipo:'novo', bruto, ultimaModificacao, expiraMs }`
 *  - `{ tipo:'naoModificado', expiraMs }` (304 a um If-Modified-Since)
 *  - `null` (rede, 4xx/5xx — 403 de identificação, 429 de throttling — ou corpo inútil)
 */
async function consultarMet(fetchFn, lat, lon, ultimaModificacao) {
  try {
    const headers = { Accept: 'application/json', 'User-Agent': MET_USER_AGENT };
    if (ultimaModificacao) headers['If-Modified-Since'] = ultimaModificacao;
    const r = await fetchFn(urlMet(lat, lon), { headers, signal: sinalDeTimeout(CLIMA_TIMEOUT_MS) });
    if (!r) return null;
    const expiraMs = dataHttp(r.headers && r.headers.get('Expires'));
    if (r.status === 304) return ultimaModificacao ? { tipo: 'naoModificado', expiraMs } : null;
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    const bruto = lerMet(d);
    if (!bruto) return null;
    const lm = r.headers && r.headers.get('Last-Modified');
    return { tipo: 'novo', bruto, ultimaModificacao: dataHttp(lm) === null ? null : lm, expiraMs };
  } catch {
    return null;
  }
}

/** Até quando a previsão vale sem consultar de novo: ≥30 min, ou o Expires (teto de 6 h). */
export function frescoAte(obtidoMs, expiraMs) {
  const minimo = obtidoMs + CLIMA_TTL_S * 1000;
  if (expiraMs === null || expiraMs === undefined) return minimo;
  return Math.max(minimo, Math.min(expiraMs, obtidoMs + CLIMA_GUARDA_S * 1000));
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
    return corpo && corpo.v === 2 && Array.isArray(corpo.horas) && typeof corpo.frescoAteMs === 'number'
      ? corpo
      : null;
  } catch {
    return null;
  }
}

async function gravarNoCache(cache, chave, entrada) {
  if (!cache) return;
  try {
    await cache.put(
      chave,
      new Response(JSON.stringify(entrada), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CLIMA_GUARDA_S}` },
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
 * Ordem (e o porquê): valida → cache fresco → rate limit → upstream.
 *  - coordenada inválida não gasta balde nem rede;
 *  - acerto de cache fresco não gasta balde (não tocou rede de ninguém);
 *  - só miss/revalidação compete pelo teto, porque só eles tocam o MET.
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
  if (guardado && agoraMs < guardado.frescoAteMs) {
    const resp = montarResposta(guardado, agoraMs, celula);
    if (resp) return json({ ...resp, atualizadoEm: guardado.obtidoEm || null, cache: true });
    // Entrada que não cobre a hora atual: trata como miss e reconsulta.
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
  const estado = await checarLimite(env && env.CLIMA_RL, ip);
  if (!deixaPassar(estado, { sensivel: false })) {
    return json({ ok: false, motivo: 'muitas_requisicoes' }, 429);
  }

  // Só revalida (If-Modified-Since) entrada VENCIDA. Entrada fresca que não
  // cobre agora já provou ser inútil: um 304 devolveria a mesma série.
  const revalidar = guardado && agoraMs >= guardado.frescoAteMs ? guardado : null;
  const r = await consultarMet(fetchFn, celula.lat, celula.lon, revalidar ? revalidar.ultimaModificacao : null);
  if (!r) return json({ ok: false, motivo: 'clima_indisponivel' }, 503);

  let bruto;
  let ultimaModificacao;
  if (r.tipo === 'naoModificado' && revalidar) {
    // 304: a série guardada continua sendo a atual do MET — só renova o frescor.
    bruto = { v: 2, fonte: revalidar.fonte, previsaoDe: revalidar.previsaoDe ?? null, horas: revalidar.horas };
    ultimaModificacao = revalidar.ultimaModificacao;
  } else if (r.tipo === 'naoModificado') {
    return json({ ok: false, motivo: 'clima_indisponivel' }, 503);
  } else {
    bruto = r.bruto;
    ultimaModificacao = r.ultimaModificacao;
  }

  const resp = montarResposta(bruto, agoraMs, celula);
  if (!resp) return json({ ok: false, motivo: 'clima_indisponivel' }, 503);

  // `indisponivel` NUNCA é cacheado — guardar a falha seria esticar 5 s de
  // instabilidade do upstream em 30 min de "clima indisponível" na tela.
  const obtidoEm = new Date(agoraMs).toISOString();
  const gravacao = gravarNoCache(cache, chave, {
    ...bruto,
    obtidoEm,
    frescoAteMs: frescoAte(agoraMs, r.expiraMs),
    ultimaModificacao: ultimaModificacao || null,
  });
  if (deps.waitUntil) deps.waitUntil(gravacao);
  else await gravacao;

  return json({ ...resp, atualizadoEm: obtidoEm, cache: false });
}
