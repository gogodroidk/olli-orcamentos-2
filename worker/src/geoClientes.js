/**
 * OLLI — onde fica o cliente (Onda I1 do plano "OLLI Inteligente").
 *
 *   POST /geo                    → coordenada + IBGE de UM endereço (o app chama ao
 *                                  salvar o cliente; autenticado)
 *   processarGeoClientes (cron)  → BACKFILL em fila dos clientes que ainda não têm
 *                                  ponto/IBGE (GEO_BACKFILL_MODE=production)
 *
 * A regra pura (validação, precisão, número da casa, o que invalida o ponto) mora
 * em `src/utils/geoCliente.ts`, a mesma que o app usa.
 *
 * ─── SÓ SERVIÇO GRATUITO COM USO COMERCIAL PERMITIDO ───────────────────────
 *   1. BrasilAPI CEP v2  — ponto do CEP em `location.coordinates`. Quase sempre
 *      vem VAZIO (5 de 5 consultas reais em 2026-07-18, ver brasil.js), mas
 *      quando vem é o ponto mais barato que existe.
 *   2. ViaCEP           — o código IBGE do município (campo `ibge`).
 *   3. BrasilAPI IBGE   — `/api/ibge/municipios/v1/<UF>`: segunda porta do IBGE,
 *      pelo nome da cidade, quando não há CEP ou o ViaCEP calou.
 *   4. Nominatim (OpenStreetMap) — o ponto da rua/casa ou, no mínimo, da cidade.
 *      Dados ODbL: a tela que mostrar o ponto exibe `ATRIBUICAO_OSM`.
 * NADA de Google Geocoding: fora da cota grátis ele é pago, e o ponto do cliente
 * para clima e alerta não precisa de precisão de portão.
 *
 * ─── A POLÍTICA DO NOMINATIM É LEI AQUI ────────────────────────────────────
 * https://operations.osmfoundation.org/policies/nominatim/ — o serviço público é
 * doado e quem desrespeita é bloqueado por IP (o que derrubaria o recurso para
 * TODOS os clientes do OLLI de uma vez). Então:
 *   - User-Agent próprio identificando o app e um contato (`NOMINATIM_USER_AGENT`);
 *   - no máximo 1 requisição por segundo: horário de saída reservado no isolate
 *     com intervalo de 1,1 s (`NOMINATIM_INTERVALO_MS`) + teto pelo binding
 *     NOMINATIM_RL (50/min, chave única). ATENÇÃO: o contador do Rate Limiting
 *     da Cloudflare é por data center, não planetário — com tráfego espalhado em
 *     vários POPs a soma pode passar de 1/s. No volume atual isso não acontece;
 *     se o /geo crescer, o teto certo é um Durable Object único. Binding ausente
 *     = NÃO chama (fail-closed);
 *   - cache: mapa do isolate + Cache API por consulta normalizada (30 dias), e o
 *     próprio banco (o ponto fica gravado no cliente; ninguém pergunta de novo);
 *   - nada de autocompletar: só consulta ao SALVAR um cliente ou no backfill;
 *   - 403/429 do Nominatim = recuo de 10 minutos no isolate (ele está mandando
 *     parar; insistir é o caminho do bloqueio).
 *
 * ─── QUATRO ESTADOS (regra P0 da casa: "não sei" nunca vira "não tem") ─────
 *   ok             achou o ponto (e talvez o IBGE)
 *   sem_resultado  TODO mundo respondeu e ninguém achou o ponto → fila encerra
 *   indisponivel   algum serviço necessário calou → NÃO marca nada, tenta depois
 *   invalido       não há o que procurar (sem CEP e sem cidade+UF)
 *
 * Log só com contagens — nunca id de conta, cliente, endereço ou coordenada.
 */

import { consultarBrasilApi, consultarViaCep, getUserPadrao, normalizarCep } from './brasil.js';
import { lerCorpoLimitado } from './bodyLimit.js';
import { lerJsonLimitado, sinalTimeout } from './emailRpc.js';
import { checarLimite, deixaPassar } from './rateLimit.js';
import {
  ATRIBUICAO_OSM,
  NOME_UF,
  coordenadaValida,
  enderecoGeocodificavel,
  extrairNumeroEndereco,
  logradouroDoEndereco,
  normalizarIbge,
  normalizarUf,
  precisaoPorRankNominatim,
  textoComparavel,
} from '../../src/utils/geoCliente.ts';

export const GEO_JOB_VERSION = '2026-10-02.v1';

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
/** Identifica o app e um contato, como a política exige (sem isto: bloqueio). */
export const NOMINATIM_USER_AGENT = 'OLLI-Orcamentos/1.0 (+https://olliorcamentos.online; contato@olliorcamentos.online)';
/** 1 req/s é o MÁXIMO absoluto da política; 1,1 s dá folga para relógio e rede. */
export const NOMINATIM_INTERVALO_MS = 1100;
/** Quantas consultas podem esperar na fila do isolate antes de dizer "ocupado". */
export const NOMINATIM_MAX_PENDENTES = 3;
/** 403/429 = o serviço pediu para parar. Recuo do isolate. */
export const NOMINATIM_RECUO_MS = 10 * 60 * 1000;
export const NOMINATIM_TIMEOUT_MS = 6000;
/** Endereço não muda de lugar: 30 dias de cache por consulta. */
export const GEO_CACHE_TTL_S = 30 * 24 * 3600;
/** Lista de municípios por UF muda por lei, raramente: 30 dias no isolate. */
export const MUNICIPIOS_TTL_MS = 30 * 24 * 3600 * 1000;
/** Consultas ao Nominatim que UMA chamada do app pode gastar (rua + cidade). */
export const GEO_NOMINATIM_POR_PEDIDO = 2;

/** Brasil com folga (inclui Noronha e Trindade). Ponto fora disto é erro de casamento. */
const BBOX_BRASIL = { latMin: -34.0, latMax: 5.5, lonMin: -74.1, lonMax: -28.5 };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

function texto(v, limite = 200) {
  return typeof v === 'string' ? v.trim().slice(0, limite) : '';
}

// ═══════════════════════════════════════════════════════════════════════════
// Estado do isolate (fila do Nominatim, recuo, caches)
// ═══════════════════════════════════════════════════════════════════════════

/** Próximo horário livre para sair uma consulta ao Nominatim neste isolate (ms). */
let proximaSaidaNominatimMs = Number.NEGATIVE_INFINITY;
let pendentesNominatim = 0;
let recuoAteMs = 0;
const cacheNominatim = new Map(); // chave → { exp, achado }
const cacheMunicipios = new Map(); // UF → { exp, lista: [{nome, ibge}] }
const CACHE_MAX = 500;

/** Só para teste: estado de módulo herdado do vizinho não prova nada. */
export function limparEstadoGeo() {
  proximaSaidaNominatimMs = Number.NEGATIVE_INFINITY;
  pendentesNominatim = 0;
  recuoAteMs = 0;
  cacheNominatim.clear();
  cacheMunicipios.clear();
}

function cachePadrao() {
  try {
    return typeof caches !== 'undefined' && caches.default ? caches.default : null;
  } catch {
    return null;
  }
}

const dormirPadrao = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════
// Nominatim
// ═══════════════════════════════════════════════════════════════════════════

/** Chave estável da consulta (absorve caixa, acento e espaço). */
export function chaveNominatim(params) {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${textoComparavel(params[k])}`)
    .join('&');
}

/** Lê o 1º resultado do jsonv2. `null` = resposta vazia (não achou). `undefined` = corpo ilegível. */
export function lerRespostaNominatim(d) {
  if (!Array.isArray(d)) return undefined;
  if (d.length === 0) return null;
  const r = d[0];
  const coord = coordenadaValida(r && r.lat, r && r.lon);
  if (!coord) return null;
  if (
    coord.lat < BBOX_BRASIL.latMin || coord.lat > BBOX_BRASIL.latMax ||
    coord.lon < BBOX_BRASIL.lonMin || coord.lon > BBOX_BRASIL.lonMax
  ) {
    return null; // casou com algo fora do Brasil: não é o cliente
  }
  const precisao = precisaoPorRankNominatim(r.place_rank);
  if (!precisao) return null; // estado/país inteiro não é endereço de cliente
  return { lat: coord.lat, lon: coord.lon, precisao };
}

/**
 * Cria o "consultor" do Nominatim para UMA chamada (rota) ou UMA rodada (cron).
 *
 * @param {object} o
 * @param {object} o.env            NOMINATIM_RL (binding de rate limit global)
 * @param {Function} o.fetchFn
 * @param {Function} [o.agora]      relógio em ms (teste injeta um falso)
 * @param {Function} [o.dormir]     espera (teste injeta uma que avança o relógio)
 * @param {object|null} [o.cache]   Cache API (null = só o mapa do isolate)
 * @param {{restante:number}} o.orcamento  consultas reais permitidas nesta chamada/rodada
 * @returns {(params:Record<string,string>) => Promise<{estado:'ok',lat:number,lon:number,precisao:string}|{estado:'vazio'}|{estado:'indisponivel',motivo:string}>}
 */
export function criarNominatim(o) {
  const fetchFn = o.fetchFn || fetch;
  const agora = o.agora || (() => Date.now());
  const dormir = o.dormir || dormirPadrao;
  const cache = o.cache === undefined ? cachePadrao() : o.cache;
  const orcamento = o.orcamento || { restante: GEO_NOMINATIM_POR_PEDIDO };

  return async function consultar(params) {
    const chave = chaveNominatim(params);

    // 1. Cache do isolate (o mais barato: nem Cache API, nem rede, nem cota).
    const guardado = cacheNominatim.get(chave);
    if (guardado && guardado.exp > agora()) return guardado.achado ? { estado: 'ok', ...guardado.achado } : { estado: 'vazio' };

    // 2. Cache API (sobrevive ao isolate; no *.workers.dev é no-op).
    const urlCache = `https://cache.olli.interno/nominatim?${encodeURIComponent(chave)}`;
    if (cache) {
      try {
        const r = await cache.match(urlCache);
        const corpo = r ? await r.json().catch(() => null) : null;
        if (corpo && corpo.v === 1) {
          lembrar(chave, corpo.achado, agora());
          return corpo.achado ? { estado: 'ok', ...corpo.achado } : { estado: 'vazio' };
        }
      } catch {
        // falha do cache = miss
      }
    }

    // 3. Daqui em diante é rede de terceiro: orçamento, recuo, teto global, fila.
    if (orcamento.restante <= 0) return { estado: 'indisponivel', motivo: 'cota_da_rodada' };
    if (agora() < recuoAteMs) return { estado: 'indisponivel', motivo: 'recuo' };
    const limite = await checarLimite(o.env && o.env.NOMINATIM_RL, 'nominatim-global');
    // Fail-closed (sensivel:true): sem o teto global não há como garantir 1 req/s.
    if (!deixaPassar(limite, { sensivel: true })) return { estado: 'indisponivel', motivo: limite === 'negado' ? 'teto_global' : 'sem_limitador' };
    if (pendentesNominatim >= NOMINATIM_MAX_PENDENTES) return { estado: 'indisponivel', motivo: 'ocupado' };

    orcamento.restante -= 1;
    pendentesNominatim += 1;
    let resultado;
    try {
      // Reserva o HORÁRIO de saída de forma síncrona (sem promessa compartilhada
      // entre pedidos): no Workers, encadear o fetch deste pedido numa promessa
      // criada por OUTRO pedido faz a I/O correr no contexto alheio — que pode
      // acabar antes ("hanging promise"/"I/O on behalf of a different request").
      // Cada pedido dorme no próprio contexto até o seu horário; as saídas ficam
      // espaçadas de NOMINATIM_INTERVALO_MS do mesmo jeito.
      const agoraMs = agora();
      const saida = Math.max(agoraMs, proximaSaidaNominatimMs);
      proximaSaidaNominatimMs = saida + NOMINATIM_INTERVALO_MS;
      if (saida > agoraMs) await dormir(saida - agoraMs);
      // Quem estava na frente pode ter levado 403/429 enquanto este esperava.
      resultado = agora() < recuoAteMs
        ? { estado: 'indisponivel', motivo: 'recuo' }
        : await chamarNominatim(fetchFn, params, agora);
    } catch {
      resultado = { estado: 'indisponivel', motivo: 'rede' };
    } finally {
      pendentesNominatim -= 1;
    }

    // Só resposta DEFINITIVA vai para o cache. Guardar "indisponível" seria
    // transformar uma falha de segundos em endereço morto por 30 dias.
    if (resultado.estado === 'ok' || resultado.estado === 'vazio') {
      const achado = resultado.estado === 'ok' ? { lat: resultado.lat, lon: resultado.lon, precisao: resultado.precisao } : null;
      lembrar(chave, achado, agora());
      if (cache) {
        try {
          await cache.put(
            urlCache,
            new Response(JSON.stringify({ v: 1, achado }), {
              headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${GEO_CACHE_TTL_S}` },
            }),
          );
        } catch {
          // sem cache a rota continua; só custa uma consulta a mais na próxima
        }
      }
    }
    return resultado;
  };
}

function lembrar(chave, achado, agoraMs) {
  if (cacheNominatim.size > CACHE_MAX) cacheNominatim.clear();
  cacheNominatim.set(chave, { exp: agoraMs + GEO_CACHE_TTL_S * 1000, achado });
}

async function chamarNominatim(fetchFn, params, agora) {
  const qs = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'br',
    'accept-language': 'pt-BR',
    ...params,
  });
  try {
    const r = await fetchFn(`${NOMINATIM_URL}?${qs.toString()}`, {
      headers: { Accept: 'application/json', 'User-Agent': NOMINATIM_USER_AGENT },
      signal: sinalTimeout(NOMINATIM_TIMEOUT_MS),
    });
    if (!r || !r.ok) {
      if (r && (r.status === 403 || r.status === 429)) recuoAteMs = agora() + NOMINATIM_RECUO_MS;
      return { estado: 'indisponivel', motivo: `http_${r ? r.status : 0}` };
    }
    const d = await r.json().catch(() => undefined);
    const lido = lerRespostaNominatim(d);
    if (lido === undefined) return { estado: 'indisponivel', motivo: 'corpo_ilegivel' };
    return lido ? { estado: 'ok', ...lido } : { estado: 'vazio' };
  } catch {
    return { estado: 'indisponivel', motivo: 'rede' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// IBGE pelo nome da cidade (segunda porta, BrasilAPI)
// ═══════════════════════════════════════════════════════════════════════════

/** @returns {Promise<{estado:'ok',ibge:string}|{estado:'nao_encontrado'}|{estado:'indisponivel'}>} */
export async function ibgePorNome(fetchFn, cidade, uf, agoraMs = Date.now()) {
  const sigla = normalizarUf(uf);
  const alvo = textoComparavel(cidade);
  if (!sigla || !alvo) return { estado: 'nao_encontrado' };
  let lista = null;
  const guardado = cacheMunicipios.get(sigla);
  if (guardado && guardado.exp > agoraMs) lista = guardado.lista;
  if (!lista) {
    try {
      const r = await fetchFn(`https://brasilapi.com.br/api/ibge/municipios/v1/${sigla}?providers=dados-abertos-br,gov,wikipedia`, {
        headers: { Accept: 'application/json' },
        signal: sinalTimeout(NOMINATIM_TIMEOUT_MS),
      });
      if (!r || !r.ok) return { estado: 'indisponivel' };
      const d = await r.json().catch(() => null);
      if (!Array.isArray(d) || d.length === 0) return { estado: 'indisponivel' };
      lista = d
        .map((m) => ({ nome: textoComparavel(m && m.nome), ibge: normalizarIbge(m && m.codigo_ibge) }))
        .filter((m) => m.nome && m.ibge);
      if (lista.length === 0) return { estado: 'indisponivel' };
      cacheMunicipios.set(sigla, { exp: agoraMs + MUNICIPIOS_TTL_MS, lista });
    } catch {
      return { estado: 'indisponivel' };
    }
  }
  const achado = lista.find((m) => m.nome === alvo);
  return achado ? { estado: 'ok', ibge: achado.ibge } : { estado: 'nao_encontrado' };
}

// ═══════════════════════════════════════════════════════════════════════════
// Geocodificar UM endereço
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {{cep?:string, endereco?:string, cidade?:string, uf?:string, ibge?:string,
 *          pontoAtual?:{lat:number,lon:number,precisao:string}|null}} entrada
 * @param {{fetchFn:Function, nominatim:Function, agoraMs?:number}} ctx
 */
export async function geocodificarEndereco(entrada, ctx) {
  const fetchFn = ctx.fetchFn || fetch;
  const cep = normalizarCep(entrada && entrada.cep);
  let cidade = texto(entrada && entrada.cidade);
  let uf = normalizarUf(entrada && (entrada.uf ?? entrada.estado));
  let logradouro = logradouroDoEndereco(entrada && entrada.endereco);
  const numero = extrairNumeroEndereco(entrada && entrada.endereco);
  let ibge = normalizarIbge(entrada && entrada.ibge);
  let ibgeIndisponivel = false;
  let precisaoFalhou = false; // algum serviço necessário para o PONTO calou

  let ponto = entrada && entrada.pontoAtual ? entrada.pontoAtual : null;
  let fonte = ponto ? 'existente' : null;

  if (!cep && !(cidade && uf)) return { estado: 'invalido' };

  if (cep) {
    // BrasilAPI v2: só serve para o PONTO do CEP (raríssimo) e para completar
    // cidade/UF/rua. Falhar aqui não é "não sei" para o resultado: as outras
    // portas cobrem tudo o que ela traria.
    const b = await consultarBrasilApi(fetchFn, cep);
    if (b.estado === 'ok') {
      const e = b.endereco;
      if (!cidade) cidade = e.cidade;
      if (!uf) uf = normalizarUf(e.uf);
      if (!logradouro && e.logradouro) logradouro = e.logradouro;
      if (!ponto && typeof e.lat === 'number' && typeof e.lng === 'number') {
        const c = coordenadaValida(e.lat, e.lng);
        if (c) {
          ponto = { lat: c.lat, lon: c.lon, precisao: 'cep' };
          fonte = 'brasilapi';
        }
      }
    }
    if (!ibge || !cidade || !uf) {
      const v = await consultarViaCep(fetchFn, cep);
      if (v.estado === 'ok') {
        const e = v.endereco;
        if (!ibge && e.ibge) ibge = normalizarIbge(e.ibge);
        if (!cidade) cidade = e.cidade;
        if (!uf) uf = normalizarUf(e.uf);
        if (!logradouro && e.logradouro) logradouro = e.logradouro;
      } else if (v.estado === 'indisponivel') {
        // Sem ViaCEP não sabemos o IBGE por ele (a porta do nome tenta abaixo) e,
        // se o cliente não tinha cidade digitada, nem a cidade.
        if (!cidade || !uf) precisaoFalhou = true;
      }
      // 'nao_encontrado': o CEP não existe. Segue com o que foi digitado.
    }
  }

  if (!ibge && cidade && uf) {
    const r = await ibgePorNome(fetchFn, cidade, uf, ctx.agoraMs);
    if (r.estado === 'ok') ibge = r.ibge;
    else if (r.estado === 'indisponivel') ibgeIndisponivel = true;
  }

  if (!ponto && cidade && uf) {
    const estado = NOME_UF[uf];
    if (logradouro) {
      const rua = await ctx.nominatim({ street: numero ? `${numero} ${logradouro}` : logradouro, city: cidade, state: estado });
      if (rua.estado === 'ok') {
        // Sem número na consulta, o Nominatim não pode ter achado a CASA.
        const precisao = !numero && rua.precisao === 'numero' ? 'rua' : rua.precisao;
        ponto = { lat: rua.lat, lon: rua.lon, precisao };
        fonte = 'nominatim';
      } else if (rua.estado === 'indisponivel') {
        precisaoFalhou = true;
      }
    }
    if (!ponto && !precisaoFalhou) {
      const cid = await ctx.nominatim({ city: cidade, state: estado });
      if (cid.estado === 'ok') {
        // Consulta de cidade nunca é mais fina que a cidade, diga o rank o que disser.
        ponto = { lat: cid.lat, lon: cid.lon, precisao: 'cidade' };
        fonte = 'nominatim';
      } else if (cid.estado === 'indisponivel') {
        precisaoFalhou = true;
      }
    }
  }

  if (ponto) return { estado: 'ok', lat: ponto.lat, lon: ponto.lon, precisao: ponto.precisao, ibge: ibge || null, ibgeIndisponivel: !ibge && ibgeIndisponivel, fonte };
  // Alguém que precisávamos ouvir calou: "não sei", nunca "não tem".
  if (precisaoFalhou) return { estado: 'indisponivel', ibge: ibge || null };
  // Todos responderam e ninguém achou o ponto (inclui CEP inexistente sem cidade digitada).
  return { estado: 'sem_resultado', ibge: ibge || null, ibgeIndisponivel: !ibge && ibgeIndisponivel };
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /geo
// ═══════════════════════════════════════════════════════════════════════════

const MAX_BODY_BYTES = 2048;

/**
 * POST /geo — autenticado. Corpo: { cep?, endereco?, cidade?, uf? }.
 *   200 { ok:true,  estado:'ok', lat, lon, precisao, ibge, fonte, atribuicao }
 *   200 { ok:false, estado:'sem_resultado', ibge }
 *   400 { ok:false, estado:'invalido', erro }
 *   200/401/413/429 { ok:false, estado:'indisponivel', erro, ibge? }
 *
 * Rate limit por usuário no binding CEP_RL, com chave própria (`geo:<id>`), na
 * política `sensivel:false` do /cep. O teto que protege o NOMINATIM é outro, o
 * global e fail-closed (ver criarNominatim).
 */
export async function handleGeo(request, env, deps = {}) {
  const getUser = deps.getUser || getUserPadrao;
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, estado: 'indisponivel', erro: 'nao_autorizado' }, 401);

  const lido = await lerCorpoLimitado(request, MAX_BODY_BYTES);
  if (lido.grande) return json({ ok: false, estado: 'invalido', erro: 'corpo_grande' }, 413);
  let corpo = null;
  try {
    corpo = JSON.parse(lido.raw || 'null');
  } catch {
    corpo = null;
  }
  if (!corpo || typeof corpo !== 'object') return json({ ok: false, estado: 'invalido', erro: 'corpo_invalido' }, 400);

  const entrada = {
    cep: texto(corpo.cep, 20),
    endereco: texto(corpo.endereco, 200),
    cidade: texto(corpo.cidade, 80),
    uf: texto(corpo.uf, 2),
  };
  if (!enderecoGeocodificavel({ cep: entrada.cep, cidade: entrada.cidade, estado: entrada.uf })) {
    return json({ ok: false, estado: 'invalido', erro: 'endereco_insuficiente' }, 400);
  }

  const estadoLimite = await checarLimite(env.CEP_RL, `geo:${user.id}`);
  if (!deixaPassar(estadoLimite, { sensivel: false })) {
    return json({ ok: false, estado: 'indisponivel', erro: 'muitas_requisicoes' }, 429);
  }

  const fetchFn = deps.fetch || fetch;
  const nominatim = criarNominatim({
    env,
    fetchFn,
    agora: deps.agora,
    dormir: deps.dormir,
    cache: deps.cache,
    orcamento: { restante: GEO_NOMINATIM_POR_PEDIDO },
  });
  const r = await geocodificarEndereco(entrada, { fetchFn, nominatim, agoraMs: deps.agora ? deps.agora() : Date.now() });

  if (r.estado === 'ok') {
    return json({
      ok: true,
      estado: 'ok',
      lat: r.lat,
      lon: r.lon,
      precisao: r.precisao,
      ibge: r.ibge,
      fonte: r.fonte,
      // ODbL: o ponto do Nominatim leva a atribuição junto, para a tela exibir.
      atribuicao: r.fonte === 'nominatim' ? ATRIBUICAO_OSM : null,
    });
  }
  if (r.estado === 'sem_resultado') return json({ ok: false, estado: 'sem_resultado', ibge: r.ibge });
  if (r.estado === 'invalido') return json({ ok: false, estado: 'invalido', erro: 'endereco_insuficiente' }, 400);
  return json({ ok: false, estado: 'indisponivel', erro: 'geo_indisponivel', ibge: r.ibge || null });
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKFILL em fila (cron)
// ═══════════════════════════════════════════════════════════════════════════

function inteiroLimitado(valor, fallback, min, max) {
  const n = Number.parseInt(String(valor ?? ''), 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** Só o valor exato "production" liga (fail-closed). Ligar só DEPOIS da migration. */
export function modoGeoBackfill(env) {
  return texto(env && env.GEO_BACKFILL_MODE, 20).toLowerCase() === 'production' ? 'production' : 'off';
}

export function configGeoBackfill(env) {
  return Object.freeze({
    // Clientes lidos da fila por rodada (o cron roda a cada minuto).
    maxClientes: inteiroLimitado(env && env.GEO_BACKFILL_MAX_POR_RODADA, 5, 1, 30),
    // Consultas REAIS ao Nominatim por rodada: 10 × 1,1 s ≈ 11 s de fila, e no
    // máximo 10/min — bem abaixo do 1/s da política, sobrando para o app.
    maxNominatim: inteiroLimitado(env && env.GEO_BACKFILL_MAX_NOMINATIM, 10, 0, 40),
  });
}

function resumo(valor) {
  return Object.freeze({ version: GEO_JOB_VERSION, ...valor });
}

/** Filtro PostgREST de igualdade que também casa NULL (`is.null`). */
function filtroIgual(coluna, valor) {
  return valor === null || valor === undefined ? `${coluna}=is.null` : `${coluna}=eq.${encodeURIComponent(String(valor))}`;
}

function criarRest(supabaseUrl, serviceRoleKey, fetchImpl) {
  return async function rest(caminho, { method = 'GET', body, prefer } = {}) {
    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    };
    if (prefer) headers.Prefer = prefer;
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/${caminho}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: sinalTimeout(10_000),
    });
    const payload = await lerJsonLimitado(response, 512 * 1024).catch(() => null);
    if (!response.ok) {
      throw Object.assign(new Error(`supabase_${response.status}`), { codigo: `supabase_${response.status}` });
    }
    return payload;
  };
}

/**
 * Uma rodada do backfill. Lê a fila (ativos, sem ponto OU sem IBGE, nunca
 * procurados), geocodifica um por um e grava com PATCH CONDICIONAL: o filtro
 * inclui o endereço lido. Se o prestador trocou o endereço no meio da rodada, o
 * PATCH não casa nenhuma linha e o ponto velho NÃO é gravado no endereço novo.
 *
 * NÃO toca `atualizado_em`: o relógio de sync é das edições do usuário. Com o
 * mesmo carimbo, o pull do app traz a geo nova sem disputar com edição local.
 *
 * Primeira falha de serviço (`indisponivel`) encerra a rodada: insistir num
 * serviço que calou só queima cota e empurra o mesmo cliente de novo.
 */
export async function processarGeoClientes(env, deps = {}) {
  const modo = modoGeoBackfill(env);
  if (modo === 'off') return resumo({ mode: 'off', motivo: 'desligado', lidos: 0, gravados: 0 });

  const supabaseUrl = texto(env && env.SUPABASE_URL, 2048).replace(/\/+$/, '');
  const serviceRoleKey = texto(env && env.SUPABASE_SERVICE_ROLE_KEY, 4096);
  if (!/^https:\/\/[^/]+/.test(supabaseUrl) || serviceRoleKey.length < 20) {
    return resumo({ mode: modo, motivo: 'supabase_nao_configurado', lidos: 0, gravados: 0 });
  }

  const cfg = configGeoBackfill(env);
  const fetchImpl = deps.fetchImpl || fetch;
  const agora = deps.agora || (() => Date.now());
  const rest = criarRest(supabaseUrl, serviceRoleKey, fetchImpl);
  const nominatim = criarNominatim({
    env,
    fetchFn: fetchImpl,
    agora,
    dormir: deps.dormir,
    cache: deps.cache,
    orcamento: { restante: cfg.maxNominatim },
  });

  const contagem = { lidos: 0, gravados: 0, comPonto: 0, semResultado: 0, enderecoMudou: 0, semEndereco: 0, interrompido: false };
  try {
    const linhas = await rest(
      'clientes?select=id,user_id,cep,endereco,cidade,estado,lat,lon,ibge,geo_precisao' +
        '&excluido_em=is.null&geo_tentado_em=is.null&or=(lat.is.null,ibge.is.null)' +
        `&order=criado_em.asc&limit=${cfg.maxClientes}`,
    );
    if (!Array.isArray(linhas)) throw Object.assign(new Error('fila_invalida'), { codigo: 'fila_invalida' });
    contagem.lidos = linhas.length;

    for (const l of linhas) {
      if (!l || typeof l.id !== 'string' || typeof l.user_id !== 'string') continue;
      const guarda =
        `id=eq.${encodeURIComponent(l.id)}&user_id=eq.${encodeURIComponent(l.user_id)}` +
        `&${filtroIgual('cep', l.cep)}&${filtroIgual('cidade', l.cidade)}` +
        `&${filtroIgual('estado', l.estado)}&${filtroIgual('endereco', l.endereco)}`;
      const carimbo = new Date(agora()).toISOString();

      if (!enderecoGeocodificavel({ cep: l.cep, cidade: l.cidade, estado: l.estado })) {
        // Nada a procurar: sai da fila. Editar o endereço o devolve (trigger).
        const r = await rest(`clientes?${guarda}&select=id`, { method: 'PATCH', body: { geo_tentado_em: carimbo }, prefer: 'return=representation' });
        if (Array.isArray(r) && r.length) contagem.semEndereco += 1;
        continue;
      }

      const coordAtual = coordenadaValida(l.lat, l.lon);
      const pontoAtual = coordAtual && l.geo_precisao ? { ...coordAtual, precisao: l.geo_precisao } : null;
      const res = await geocodificarEndereco(
        { cep: l.cep, endereco: l.endereco, cidade: l.cidade, uf: l.estado, ibge: l.ibge, pontoAtual },
        { fetchFn: fetchImpl, nominatim, agoraMs: agora() },
      );

      const patch = {};
      if (res.estado === 'ok' && !pontoAtual) {
        patch.lat = res.lat;
        patch.lon = res.lon;
        patch.geo_precisao = res.precisao;
      }
      const ibgeNovo = normalizarIbge(res.ibge);
      if (ibgeNovo && ibgeNovo !== l.ibge) patch.ibge = ibgeNovo;
      // Fila encerra só com resposta DEFINITIVA. IBGE que ficou de fora por
      // serviço calado mantém o cliente na fila para a próxima rodada.
      const definitivo = (res.estado === 'ok' || res.estado === 'sem_resultado') && !res.ibgeIndisponivel;
      if (definitivo) patch.geo_tentado_em = carimbo;

      if (Object.keys(patch).length) {
        const r = await rest(`clientes?${guarda}&select=id`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
        if (Array.isArray(r) && r.length) {
          contagem.gravados += 1;
          if (patch.lat !== undefined) contagem.comPonto += 1;
          if (res.estado === 'sem_resultado') contagem.semResultado += 1;
        } else {
          contagem.enderecoMudou += 1;
        }
      }
      if (res.estado === 'indisponivel') {
        contagem.interrompido = true;
        break;
      }
    }

    const saida = resumo({ mode: modo, motivo: 'ok', ...contagem });
    console.log(JSON.stringify({ event: 'geo_backfill_rodada', ...saida }));
    return saida;
  } catch (erro) {
    const codigo = texto(String((erro && (erro.codigo || erro.message)) || ''), 60).replace(/[^a-zA-Z0-9._:-]/g, '_') || 'erro';
    console.error(JSON.stringify({ event: 'geo_backfill_rodada_falhou', code: codigo }));
    return resumo({ mode: modo, motivo: 'falhou', codigo, ...contagem });
  }
}
