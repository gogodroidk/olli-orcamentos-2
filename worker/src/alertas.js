/**
 * OLLI — alertas oficiais de tempo (INMET e Defesa Civil/IDAP), Onda I1.
 *
 *   GET /alertas?ibge=<7 dígitos>[&lat=<graus>&lon=<graus>]
 *   cron "7,27,47 * * * *" → processarAlertas(env, { fonte:'inmet' })
 *
 * ⚠ DEFESA CIVIL (IDAP) DESLIGADA — ver FONTES_DESLIGADAS. A rota responde
 *   `fontes.defesaCivil = { estado:'indisponivel', motivo:'fonte_desligada' }`
 *   (logo `estado:'parcial'`), nunca "sem alertas da Defesa Civil".
 *
 * ─── FONTES (só serviço grátis com uso comercial permitido) ────────────────
 *  INMET — https://apiprevmet3.inmet.gov.br/avisos/ativos
 *    JSON que alimenta o portal avisos.inmet.gov.br (mesmos avisos do feed
 *    oficial Alert-AS em RSS/CAP: https://apiprevmet3.inmet.gov.br/avisos/rss).
 *    Uma chamada traz todos os avisos com a lista de municípios (IBGE) e o
 *    polígono em GeoJSON — o RSS exigiria 1 chamada por aviso para chegar ao
 *    CAP. Licença: o próprio feed declara `<copyright>public domain</copyright>`
 *    e "o conteúdo poderá ser reproduzido desde que citada a fonte" → o JSON da
 *    rota sempre leva a atribuição (ALERTAS_ATRIBUICAO, só das fontes ativas).
 *    Horários: o INMET publica no horário de Brasília (o CAP traz -03:00; o
 *    JSON traz "2026-10-01 11:28" sem fuso) → convertidos para ISO com -03:00.
 *
 *  Defesa Civil (IDAP/MIDR) — https://idapfile.mdr.gov.br/idap/api/rss/cap
 *    Feed Atom com o CAP 1.2 de cada alerta embutido (o mesmo que vai para o
 *    Google Public Alerts). Dado público do governo federal, sem chave. Só ~1/3
 *    dos alertas trazem `<geocode>` IBGE; o resto vem SÓ com polígono.
 *    DESLIGADA EM PRODUÇÃO (revisão do PR #99, 01/10/2026): o feed chegou a
 *    23,9 MB (72 alertas vivos) e o `lerIdap` mediu 14–25 ms de CPU no Node
 *    (frio/quente), fora o `arrayBuffer()` de 24 MB e o `JSON.stringify` dos
 *    polígonos (~5 ms). O plano Free dá 10 ms por invocação de cron e o
 *    estouro seria SISTEMÁTICO (não o "de vez em quando" que a Cloudflare
 *    tolera). Streaming não resolve (a CPU total é a mesma numa invocação só) e
 *    o feed não tem filtro por UF; Workers Paid está fora de questão. O parser
 *    continua aqui, testado, para o dia em que houver um caminho que caiba —
 *    religar = tirar de FONTES_DESLIGADAS + cron próprio + medir de novo.
 *    O que foi feito para caber (e não bastou):
 *      - o feed é lido em BYTES (Buffer, busca nativa): só o cabeçalho de cada
 *        CAP, os nomes de área e os IBGEs viram string; o miolo dos polígonos
 *        é pulado com uma busca pelo próximo '<' (medido: ~5 ms quente);
 *      - os polígonos são AMOSTRADOS (até ALERTAS_MAX_VERTICES por anel, 3
 *        casas ≈ 110 m) — o ponto-no-polígono é aproximado na escala de
 *        centenas de metros, o que basta para "o cliente está na área";
 *      - cada fonte tem CRON PRÓPRIO, logo INVOCAÇÃO própria: se o IDAP
 *        estourar a CPU, morre só ele (a Defesa Civil fica 'indisponivel'
 *        pelo vencimento do índice) — nem o INMET nem a outbox de e-mail, que
 *        roda no cron de minuto, são derrubados junto.
 *
 * ─── ARMAZENAMENTO (KV `olli-diagnostico-cache`, binding CACHE) ────────────
 * Por fonte, duas chaves:
 *   alertas:v1:<fonte>            índice: estado, horários e avisos (com IBGEs,
 *                                 UFs e bbox, SEM polígono) — lido a cada consulta
 *   alertas:v1:<fonte>:poligonos  polígonos amostrados — lido só quando a consulta
 *                                 traz lat/lon e algum bbox contém o ponto
 * O índice carrega `geradoEm`; o arquivo de polígonos também. Se não baterem
 * (gravação pela metade), o polígono vira "não conferido" — nunca "fora da área".
 * Escritas: ≤ 2 por rodada × 1 fonte ativa (INMET) × 72 rodadas/dia = 144/dia.
 * A cota do Free (1.000/dia) é da CONTA inteira e o fonteia também usa KV.
 *
 * ─── ERRO NUNCA VIRA VAZIO ─────────────────────────────────────────────────
 * Feed fora (rede, HTTP ≠ 200, corpo que não dá para ler) → o índice daquela
 * fonte é regravado com `estado:'indisponivel'` e SEM avisos. Índice velho
 * (cron parado há mais de ALERTAS_VALIDADE_MS) também é `indisponivel`.
 *   - todas as fontes ok        → 200 { ok:true, estado:'ok', avisos }
 *   - alguma fora               → 200 { ok:true, estado:'parcial', avisos, fontes }
 *                                 (a tela NÃO pode dizer "sem alertas")
 *   - todas fora                → 503 { ok:false, motivo:'alertas_indisponiveis', fontes }
 *   - ALERTAS_MODE=off ou sem KV → 503 { ok:false, motivo:'alertas_desligados' }
 * Alertas da Defesa Civil desenhados só por área, na mesma UF, que não puderam
 * ser conferidos (consulta sem lat/lon) saem contados em `naoConferidos` — a
 * tela avisa "pode haver alerta da Defesa Civil na região" em vez de calar.
 *
 * ─── RATE LIMIT ────────────────────────────────────────────────────────────
 * Rota pública (o dado é público). Binding ALERTAS_RL por IP, só quando a
 * consulta precisa ler o KV (acerto da memória do isolate não consome balde).
 * Política `sensivel:false`: limitador indisponível → segue.
 */

import { Buffer } from 'node:buffer';
import { checarLimite, deixaPassar } from './rateLimit.js';
import { validarCoordenadas } from './clima.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS, ...extra },
  });
}

/**
 * Cron PRÓPRIO de cada fonte ATIVA (tem de bater com `triggers.crons` do
 * wrangler.jsonc). Minutos fora dos 0/5/10… usados pelos jobs de e-mail e
 * contratos, só por clareza de log: cada expressão já é uma invocação separada.
 * A conta Free da Cloudflare tem só 5 Cron Triggers no TOTAL (todas as workers
 * somadas) — por isso a Defesa Civil desligada não tem cron.
 */
export const ALERTAS_CRONS = { '7,27,47 * * * *': 'inmet' };

/** Fonte de alertas que um cron dispara, ou `null` (cron de outro job). */
export function fonteDoCron(cron) {
  return Object.prototype.hasOwnProperty.call(ALERTAS_CRONS, cron) ? ALERTAS_CRONS[cron] : null;
}

export const INMET_URL = 'https://apiprevmet3.inmet.gov.br/avisos/ativos';
export const IDAP_URL = 'https://idapfile.mdr.gov.br/idap/api/rss/cap';

/** Identificação + contato (mesma do clima). */
export const ALERTAS_USER_AGENT = 'OLLI-Orcamentos/1.0 https://olliorcamentos.online';

/** O IDAP leva ~4 s para entregar 11 MB; folga para rede ruim. */
export const ALERTAS_TIMEOUT_MS = 20000;

/** Dado mais velho que isto = fonte indisponível (2 rodadas de 20 min + folga). */
export const ALERTAS_VALIDADE_MS = 50 * 60 * 1000;

/** Vértices por anel guardados para o ponto-no-polígono. */
export const ALERTAS_MAX_VERTICES = 120;

/** Memória do isolate para o índice (não toca o KV a cada consulta). */
export const ALERTAS_MEMO_MS = 60 * 1000;

/** Alerta sem fim declarado só vale até 24 h depois do início. */
const SEM_FIM_MS = 24 * 60 * 60 * 1000;

export const FONTES = /** @type {const} */ (['inmet', 'defesa_civil']);
const ROTULO_FONTE = { inmet: 'INMET', defesa_civil: 'Defesa Civil' };
const CHAVE_RESPOSTA = { inmet: 'inmet', defesa_civil: 'defesaCivil' };

/**
 * Fontes DESLIGADAS de propósito → motivo exposto na rota. Continuam na
 * resposta (como 'indisponivel'), porque "não consultei" nunca pode parecer
 * "consultei e não tem". Ver o cabeçalho: o IDAP não cabe nos 10 ms do Free.
 */
export const FONTES_DESLIGADAS = Object.freeze({ defesa_civil: 'fonte_desligada' });
export const FONTES_COLETADAS = FONTES.filter((f) => !Object.prototype.hasOwnProperty.call(FONTES_DESLIGADAS, f));

/** Crédito só de quem de fato fornece dado (hoje: "Alertas: INMET"). */
export const ALERTAS_ATRIBUICAO = `Alertas: ${FONTES_COLETADAS.map((f) => ROTULO_FONTE[f]).join(' e ')}`;

export const chaveIndice = (fonte) => `alertas:v1:${fonte}`;
export const chavePoligonos = (fonte) => `alertas:v1:${fonte}:poligonos`;

/** TTL das chaves no KV: lixo de um cron que morreu some sozinho. */
const KV_TTL_S = 6 * 60 * 60;

// ═══════════════════════════════════════════════════════════════════════════
// UF ⇄ código IBGE (2 primeiros dígitos do município)
// ═══════════════════════════════════════════════════════════════════════════

export const UF_POR_SIGLA = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29',
  MG: '31', ES: '32', RJ: '33', SP: '35',
  PR: '41', SC: '42', RS: '43',
  MS: '50', MT: '51', GO: '52', DF: '53',
};
const CODIGOS_UF = new Set(Object.values(UF_POR_SIGLA));

/** Código IBGE de município: 7 dígitos com UF válida. `null` = inválido. */
export function validarIbge(bruto) {
  const s = String(bruto ?? '').trim();
  if (!/^\d{7}$/.test(s)) return null;
  return CODIGOS_UF.has(s.slice(0, 2)) ? s : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Nível de severidade
// ═══════════════════════════════════════════════════════════════════════════

const ORDEM_NIVEL = { vermelho: 3, laranja: 2, amarelo: 1, desconhecido: 0 };

/** INMET: "Perigo Potencial" (amarelo), "Perigo" (laranja), "Grande Perigo" (vermelho). */
export function nivelInmet(severidade) {
  const s = String(severidade || '').trim().toLowerCase();
  if (s === 'grande perigo') return 'vermelho';
  if (s === 'perigo') return 'laranja';
  if (s === 'perigo potencial') return 'amarelo';
  return 'desconhecido';
}

/** CAP: Extreme (vermelho), Severe (laranja), Moderate/Minor (amarelo). Unknown NÃO vira amarelo. */
export function nivelCap(severity) {
  const s = String(severity || '').trim();
  if (s === 'Extreme') return 'vermelho';
  if (s === 'Severe') return 'laranja';
  if (s === 'Moderate' || s === 'Minor') return 'amarelo';
  return 'desconhecido';
}

// ═══════════════════════════════════════════════════════════════════════════
// Polígonos: amostragem, bbox e ponto-no-polígono
// ═══════════════════════════════════════════════════════════════════════════
// Formato guardado: cada aviso → lista de PARTES; cada parte → lista de anéis
// (o 1º é o contorno, os demais são buracos); cada anel → [lat, lon, lat, lon…]
// com 3 casas (~110 m).

const r3 = (n) => Math.round(n * 1000) / 1000;

function coordOk(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/** Amostra uma lista de pares [lat, lon] em até `max` vértices (fecha o anel). */
export function amostrarAnel(pares, max = ALERTAS_MAX_VERTICES) {
  const validos = pares.filter((p) => coordOk(p[0], p[1]));
  if (validos.length < 3) return null;
  const passo = Math.max(1, Math.ceil(validos.length / max));
  const plano = [];
  const empurrar = (p) => {
    const lat = r3(p[0]);
    const lon = r3(p[1]);
    const n = plano.length;
    // Vértice repetido em seguida não acrescenta nada (e inflaria a contagem).
    if (n >= 2 && plano[n - 2] === lat && plano[n - 1] === lon) return;
    plano.push(lat, lon);
  };
  for (let i = 0; i < validos.length; i += passo) empurrar(validos[i]);
  empurrar(validos[validos.length - 1]);
  // Anel precisa de 3 vértices DISTINTOS (o fechamento repete o primeiro).
  const n = plano.length / 2;
  const fechado = n > 1 && plano[0] === plano[plano.length - 2] && plano[1] === plano[plano.length - 1];
  return (fechado ? n - 1 : n) >= 3 ? plano : null;
}

const eBranco = (c) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09;

/** Número decimal ("-23.5", "46") lido direto dos bytes [i, e). NaN se não for. */
function numeroDosBytes(buf, i, e) {
  let neg = false;
  if (buf[i] === 0x2d) {
    neg = true;
    i++;
  } else if (buf[i] === 0x2b) {
    i++;
  }
  let inteiro = 0;
  let frac = 0;
  let div = 1;
  let digitos = 0;
  let ponto = false;
  for (; i < e; i++) {
    const c = buf[i];
    if (c >= 0x30 && c <= 0x39) {
      digitos++;
      if (ponto) {
        frac = frac * 10 + (c - 0x30);
        div *= 10;
      } else {
        inteiro = inteiro * 10 + (c - 0x30);
      }
    } else if (c === 0x2e && !ponto) {
      ponto = true;
    } else {
      return NaN;
    }
  }
  if (!digitos) return NaN;
  const v = inteiro + frac / div;
  return neg ? -v : v;
}

/** Vértice "lat,lon" que começa em `i`: { par, fim } (fim = byte separador ou `lim`). */
function verticeDosBytes(buf, i, lim) {
  let e = i;
  while (e < lim && !eBranco(buf[e])) e++;
  let v = i;
  while (v < e && buf[v] !== 0x2c) v++;
  if (v >= e) return { par: null, fim: e };
  const lat = numeroDosBytes(buf, i, v);
  const lon = numeroDosBytes(buf, v + 1, e);
  return { par: Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null, fim: e };
}

/**
 * Anel CAP ("lat,lon lat,lon …") amostrado direto dos BYTES do feed, sem
 * decodificar nem quebrar o texto: há anéis com dezenas de milhares de
 * vértices, e decodificar/`split` em 11 MB estoura a CPU do plano Free.
 * Estima o tamanho médio de um vértice, salta ~`passo` vértices e realinha no
 * separador anterior. Sempre inclui o primeiro e o último vértice.
 * @param {Uint8Array} buf  @param {number} ini  @param {number} fim (exclusivo)
 */
export function amostrarAnelBytes(buf, ini, fim, max = ALERTAS_MAX_VERTICES) {
  while (ini < fim && eBranco(buf[ini])) ini++;
  while (fim > ini && eBranco(buf[fim - 1])) fim--;
  if (fim <= ini) return null;
  const primeiro = verticeDosBytes(buf, ini, fim);
  const mediaVertice = Math.max(4, primeiro.fim - ini + 1);
  const estimados = Math.ceil((fim - ini) / mediaVertice);
  const salto = Math.max(1, Math.ceil(estimados / max)) * mediaVertice;
  const pares = [];
  let pos = ini;
  let lido = primeiro;
  for (;;) {
    if (lido.par) pares.push(lido.par);
    if (lido.fim >= fim) break;
    let prox = pos + salto;
    if (prox <= lido.fim) prox = lido.fim + 1;
    if (prox >= fim) break;
    // Realinha no início do vértice que contém `prox`.
    while (prox > lido.fim + 1 && !eBranco(buf[prox - 1])) prox--;
    pos = prox;
    while (pos < fim && eBranco(buf[pos])) pos++;
    if (pos >= fim) break;
    lido = verticeDosBytes(buf, pos, fim);
  }
  let u = fim;
  while (u > ini && !eBranco(buf[u - 1])) u--;
  const ult = verticeDosBytes(buf, u, fim).par;
  if (ult) pares.push(ult);
  // Amostra de novo pelo índice: o salto por texto é aproximado.
  return amostrarAnel(pares, max + 2);
}

/** Atalho para texto (testes e anéis avulsos). */
export function amostrarAnelCap(texto, max = ALERTAS_MAX_VERTICES) {
  const buf = Buffer.from(String(texto || ''), 'latin1');
  return amostrarAnelBytes(buf, 0, buf.length, max);
}

/** bbox [latMin, lonMin, latMax, lonMax] de uma lista de partes. */
export function bboxDasPartes(partes) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const parte of partes) {
    const anel = parte[0];
    for (let i = 0; i < anel.length; i += 2) {
      if (anel[i] < a) a = anel[i];
      if (anel[i] > c) c = anel[i];
      if (anel[i + 1] < b) b = anel[i + 1];
      if (anel[i + 1] > d) d = anel[i + 1];
    }
  }
  return Number.isFinite(a) ? [a, b, c, d] : null;
}

function dentroDoBbox(bbox, lat, lon) {
  return !!bbox && lat >= bbox[0] && lat <= bbox[2] && lon >= bbox[1] && lon <= bbox[3];
}

/** Ray casting num anel plano [lat, lon, …]. */
function dentroDoAnel(anel, lat, lon) {
  let dentro = false;
  const n = anel.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = anel[2 * i], xi = anel[2 * i + 1];
    const yj = anel[2 * j], xj = anel[2 * j + 1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Ponto em alguma parte (dentro do contorno e fora dos buracos). */
export function pontoNasPartes(partes, lat, lon) {
  for (const parte of partes) {
    if (!dentroDoAnel(parte[0], lat, lon)) continue;
    let noBuraco = false;
    for (let k = 1; k < parte.length; k++) {
      if (dentroDoAnel(parte[k], lat, lon)) { noBuraco = true; break; }
    }
    if (!noBuraco) return true;
  }
  return false;
}

/** GeoJSON (Polygon/MultiPolygon, [lon, lat]) → partes amostradas. */
export function partesDeGeoJson(geo) {
  if (!geo || typeof geo !== 'object') return [];
  const polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' ? geo.coordinates : [];
  const partes = [];
  for (const poly of Array.isArray(polys) ? polys : []) {
    if (!Array.isArray(poly)) continue;
    const aneis = [];
    for (const anel of poly) {
      if (!Array.isArray(anel)) continue;
      const a = amostrarAnel(anel.filter(Array.isArray).map((p) => [Number(p[1]), Number(p[0])]));
      if (a) aneis.push(a);
      else if (aneis.length === 0) break; // sem contorno não há parte
    }
    if (aneis.length) partes.push(aneis);
  }
  return partes;
}

// ═══════════════════════════════════════════════════════════════════════════
// INMET (JSON /avisos/ativos)
// ═══════════════════════════════════════════════════════════════════════════

/** "2026-10-01 11:28" (horário de Brasília) → "2026-10-01T11:28:00-03:00". */
export function horaInmetIso(v) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(String(v || '').trim());
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}:${m[3]}:00-03:00`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

const texto = (v, max = 600) => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/**
 * Corpo do /avisos/ativos → { avisos, poligonos }. `null` = formato que não
 * entendemos (isso é `indisponivel`, nunca "zero avisos").
 */
export function lerInmet(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.hoje) || !Array.isArray(d.futuro)) return null;
  const avisos = [];
  const poligonos = {};
  const vistos = new Set();
  for (const a of [...d.hoje, ...d.futuro]) {
    if (!a || typeof a !== 'object' || a.encerrado === true) continue;
    const idNum = Number(a.id);
    if (!Number.isFinite(idNum) || vistos.has(idNum)) continue;
    const inicio = horaInmetIso(a.inicio);
    const fim = horaInmetIso(a.fim);
    if (!inicio || !fim) continue;
    const ibges = String(a.geocodes || '')
      .split(',')
      .map((g) => g.trim())
      .filter((g) => validarIbge(g));
    if (!ibges.length) continue;
    vistos.add(idNum);
    const id = `inmet:${idNum}`;
    let partes = [];
    try {
      partes = partesDeGeoJson(typeof a.poligono === 'string' ? JSON.parse(a.poligono) : a.poligono);
    } catch {
      partes = [];
    }
    if (partes.length) poligonos[id] = partes;
    const riscos = Array.isArray(a.riscos) ? a.riscos.filter((x) => typeof x === 'string').join(' ') : null;
    const instrucoes = Array.isArray(a.instrucoes) ? a.instrucoes.filter((x) => typeof x === 'string').join(' ') : null;
    avisos.push({
      id,
      fonte: 'inmet',
      evento: texto(a.descricao, 80) || 'Aviso meteorológico',
      titulo: texto(`Aviso de ${a.descricao || 'tempo'}. ${a.severidade || ''}`, 160),
      descricao: texto(riscos),
      instrucao: texto(instrucoes),
      nivel: nivelInmet(a.severidade),
      severidade: texto(a.severidade, 40),
      inicio,
      fim,
      area: texto(a.estados, 200),
      emissor: 'INMET',
      link: `https://avisos.inmet.gov.br/${idNum}`,
      ibges,
      ufs: [...new Set(ibges.map((g) => g.slice(0, 2)))],
      bbox: partes.length ? bboxDasPartes(partes) : null,
    });
  }
  return { avisos, poligonos };
}

// ═══════════════════════════════════════════════════════════════════════════
// Defesa Civil (IDAP — Atom com CAP 1.2)
// ═══════════════════════════════════════════════════════════════════════════

function decodificarXml(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

/** Conteúdo do 1º `<p:nome>` de um trecho PEQUENO já decodificado (cabeçalho do CAP). */
function tagEm(s, p, nome) {
  const abre = `<${p}${nome}>`;
  const a = s.indexOf(abre);
  if (a === -1) return null;
  const b = s.indexOf(`</${p}${nome}>`, a);
  if (b === -1) return null;
  return decodificarXml(s.slice(a + abre.length, b)).trim();
}

/** "2026-10-01T00:14:18-03:00" → ISO válido, ou `null`. */
function horaCap(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/.test(s) && Number.isFinite(Date.parse(s)) ? s : null;
}

/** "SÃO PAULO/SP" → código IBGE da UF ("35"), ou `null`. */
function ufDaArea(areaDesc) {
  const m = /\/\s*([A-Z]{2})\s*$/.exec(String(areaDesc || '').trim().toUpperCase());
  return m && UF_POR_SIGLA[m[1]] ? UF_POR_SIGLA[m[1]] : null;
}

function comoBuffer(entrada) {
  if (Buffer.isBuffer(entrada)) return entrada;
  if (entrada instanceof ArrayBuffer) return Buffer.from(entrada);
  if (entrada instanceof Uint8Array) return Buffer.from(entrada.buffer, entrada.byteOffset, entrada.byteLength);
  return Buffer.from(String(entrada || ''), 'utf8');
}

/**
 * Feed Atom do IDAP → { avisos, poligonos }. `null` = não é o feed esperado.
 * Trabalha nos BYTES (Buffer, busca nativa): só o cabeçalho de cada CAP, os
 * nomes de área e os IBGEs são decodificados — os ~11 MB de polígono nunca
 * viram string. Só `status=Actual` e `scope=Public`; `msgType=Cancel` (e o
 * `references` de um Update) tira do ar o alerta referenciado; alerta já
 * expirado em `agoraMs` é descartado aqui mesmo (economiza KV).
 * @param {Buffer|ArrayBuffer|Uint8Array|string} entrada
 */
export function lerIdap(entrada, agoraMs = Date.now()) {
  const buf = comoBuffer(entrada);
  if (!/<feed[\s>]/.test(buf.toString('utf8', 0, Math.min(buf.length, 2000)))) return null;
  const lidos = [];
  const cancelados = new Set();
  let pos = 0;
  for (;;) {
    const a = buf.indexOf('<entry>', pos);
    if (a === -1) break;
    pos = a + 7;
    // Cabeçalho = do <entry> até a 1ª <area>. Busca curta: a área vem logo
    // depois de alguns KB de texto; só o conteúdo dela é que é enorme.
    const m = /<(\w+:)?alert[\s>]/.exec(buf.toString('utf8', a, Math.min(buf.length, a + 4000)));
    const p = m ? m[1] || '' : '';
    const iAreaBruto = m ? buf.indexOf(`<${p}area>`, a) : -1;
    let cab = buf.toString('utf8', a, iAreaBruto === -1 ? Math.min(buf.length, a + 65536) : iAreaBruto);
    const fimNoCab = cab.indexOf('</entry>');
    const iArea = fimNoCab === -1 && iAreaBruto !== -1 ? iAreaBruto : -1;
    if (fimNoCab !== -1) cab = cab.slice(0, fimNoCab);
    if (!m) continue;

    // Área: mini-tokenizador só de TAGS. O conteúdo de um <polygon> (às vezes
    // MBs) é pulado com UMA busca nativa pelo próximo '<' — nunca vira string.
    const ibges = [];
    const partes = [];
    const ufs = new Set();
    let areaDesc = null;
    if (iArea !== -1) {
      let x = iArea;
      let ultimoValueName = null;
      for (;;) {
        const lt = buf.indexOf(0x3c, x);
        if (lt === -1) break;
        const gt = buf.indexOf(0x3e, lt);
        if (gt === -1) break;
        const nome = buf.toString('latin1', lt + 1, Math.min(gt, lt + 40));
        x = gt + 1;
        if (nome === '/entry') break;
        if (nome !== `${p}polygon` && nome !== `${p}areaDesc` && nome !== `${p}valueName` && nome !== `${p}value`) continue;
        const fimConteudo = buf.indexOf(0x3c, x);
        if (fimConteudo === -1) break;
        if (nome === `${p}polygon`) {
          const anel = amostrarAnelBytes(buf, x, fimConteudo);
          if (anel) partes.push([anel]);
        } else {
          const conteudo = decodificarXml(buf.toString('utf8', x, fimConteudo)).trim();
          if (nome === `${p}areaDesc`) {
            if (!areaDesc) areaDesc = conteudo;
            const uf = ufDaArea(conteudo);
            if (uf) ufs.add(uf);
          } else if (nome === `${p}valueName`) {
            ultimoValueName = conteudo;
          } else if (ultimoValueName === 'IBGE' && validarIbge(conteudo)) {
            ibges.push(conteudo);
            ufs.add(conteudo.slice(0, 2));
          }
        }
        x = fimConteudo;
      }
      pos = Math.max(pos, x);
    }

    const id = tagEm(cab, p, 'identifier');
    if (!id) continue;
    const refs = tagEm(cab, p, 'references');
    if (refs) {
      for (const r of refs.split(/\s+/)) {
        const partesRef = r.split(',');
        if (partesRef.length >= 2 && partesRef[1]) cancelados.add(partesRef[1]);
      }
    }
    if (tagEm(cab, p, 'status') !== 'Actual' || tagEm(cab, p, 'scope') !== 'Public') continue;
    const msgType = tagEm(cab, p, 'msgType');
    if (msgType === 'Cancel') {
      cancelados.add(id);
      continue;
    }
    if (msgType !== 'Alert' && msgType !== 'Update') continue;
    lidos.push({ p, cab, id, ibges, partes, ufs, areaDesc });
  }

  const avisos = [];
  const poligonos = {};
  const vistos = new Set();
  for (const e of lidos) {
    if (cancelados.has(e.id) || vistos.has(e.id)) continue;
    const { p, cab, ibges, partes, ufs, areaDesc } = e;
    const inicio = horaCap(tagEm(cab, p, 'onset')) || horaCap(tagEm(cab, p, 'effective')) || horaCap(tagEm(cab, p, 'sent'));
    if (!inicio) continue;
    const fim = horaCap(tagEm(cab, p, 'expires'));
    const fimMs = fim ? Date.parse(fim) : Date.parse(inicio) + SEM_FIM_MS;
    if (fimMs <= agoraMs) continue;
    if (!ibges.length && !partes.length) continue; // sem área não há como casar com cliente
    vistos.add(e.id);
    const idAviso = `defesa_civil:${e.id}`;
    if (partes.length) poligonos[idAviso] = partes;
    const severity = tagEm(cab, p, 'severity');
    avisos.push({
      id: idAviso,
      fonte: 'defesa_civil',
      evento: texto(tagEm(cab, p, 'event'), 80) || 'Alerta da Defesa Civil',
      titulo: texto(tagEm(cab, p, 'headline'), 200),
      descricao: texto(tagEm(cab, p, 'description')),
      instrucao: texto(tagEm(cab, p, 'instruction')),
      nivel: nivelCap(severity),
      severidade: texto(severity, 40),
      inicio,
      fim: fim || null,
      area: texto(areaDesc, 200),
      emissor: texto(tagEm(cab, p, 'senderName'), 120) || 'Defesa Civil',
      link: texto(tagEm(cab, p, 'web'), 300),
      ibges: [...new Set(ibges)],
      ufs: [...ufs],
      bbox: partes.length ? bboxDasPartes(partes) : null,
    });
  }
  return { avisos, poligonos };
}

// ═══════════════════════════════════════════════════════════════════════════
// Coleta (cron)
// ═══════════════════════════════════════════════════════════════════════════

function sinalDeTimeout(ms) {
  try {
    return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(ms)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Busca e lê uma fonte. NUNCA lança: `{ ok:true, avisos, poligonos }` ou `{ ok:false, motivo }`. */
export async function coletarFonte(fonte, fetchFn, agoraMs) {
  const url = fonte === 'inmet' ? INMET_URL : IDAP_URL;
  try {
    const r = await fetchFn(url, {
      headers: {
        'User-Agent': ALERTAS_USER_AGENT,
        Accept: fonte === 'inmet' ? 'application/json' : 'application/atom+xml, application/rss+xml, application/xml',
      },
      signal: sinalDeTimeout(ALERTAS_TIMEOUT_MS),
    });
    if (!r || !r.ok) return { ok: false, motivo: `http_${r ? r.status : 'sem_resposta'}` };
    let lido;
    if (fonte === 'inmet') {
      let d = null;
      try { d = JSON.parse(await r.text()); } catch { d = null; }
      lido = lerInmet(d);
    } else {
      // Bytes, não texto: decodificar os ~11 MB custaria mais CPU que o parse inteiro.
      lido = lerIdap(Buffer.from(await r.arrayBuffer()), agoraMs);
    }
    if (!lido) return { ok: false, motivo: 'formato_inesperado' };
    return { ok: true, ...lido };
  } catch (e) {
    return { ok: false, motivo: e && e.name === 'TimeoutError' ? 'tempo_esgotado' : 'rede' };
  }
}

export function alertasLigados(env) {
  return String((env && env.ALERTAS_MODE) || '').trim() === 'production';
}

/**
 * Cron: coleta a(s) fonte(s) e grava no KV. NUNCA lança. Em produção cada cron
 * chama UMA fonte (`deps.fonte`); sem ela, coleta as duas em sequência.
 * @param {{fonte?:string, fetch?:Function, now?:() => Date}} [deps]
 * @returns {Promise<{estado:string, fontes?:Record<string,string>}>}
 */
export async function processarAlertas(env, deps = {}) {
  if (!alertasLigados(env)) return { estado: 'desligado' };
  const kv = env && env.CACHE;
  if (!kv || typeof kv.put !== 'function') {
    console.error('[alertas] sem binding CACHE (KV): alertas desligados');
    return { estado: 'sem_kv' };
  }
  const fetchFn = deps.fetch || fetch;
  const agora = deps.now ? deps.now() : new Date();
  const agoraMs = agora.getTime();
  const fontes = {};
  // Fonte desligada nunca é buscada (nem por um cron antigo que sobrou na conta).
  const alvo = FONTES_COLETADAS.filter((f) => !deps.fonte || f === deps.fonte);
  for (const fonte of alvo) {
    const res = await coletarFonte(fonte, fetchFn, agoraMs);
    const geradoEm = new Date(agoraMs).toISOString();
    try {
      if (res.ok) {
        // Polígonos ANTES do índice: o índice novo só aparece com os polígonos dele já gravados.
        await kv.put(chavePoligonos(fonte), JSON.stringify({ v: 1, fonte, geradoEm, poligonos: res.poligonos }), { expirationTtl: KV_TTL_S });
        await kv.put(chaveIndice(fonte), JSON.stringify({ v: 1, fonte, estado: 'ok', geradoEm, atualizadoEm: geradoEm, avisos: res.avisos }), { expirationTtl: KV_TTL_S });
        fontes[fonte] = `ok:${res.avisos.length}`;
      } else {
        await kv.put(chaveIndice(fonte), JSON.stringify({ v: 1, fonte, estado: 'indisponivel', motivo: res.motivo, geradoEm, atualizadoEm: null, avisos: [] }), { expirationTtl: KV_TTL_S });
        fontes[fonte] = `indisponivel:${res.motivo}`;
        console.error(`[alertas] ${fonte} indisponível: ${res.motivo}`);
      }
    } catch (e) {
      fontes[fonte] = 'kv_falhou';
      console.error(`[alertas] falha ao gravar ${fonte} no KV:`, e && e.message ? e.message : e);
    }
  }
  return { estado: 'processado', fontes };
}

// ═══════════════════════════════════════════════════════════════════════════
// Consulta (rota)
// ═══════════════════════════════════════════════════════════════════════════

let memoIndices = null; // { exp, porFonte }
const memoPoligonos = new Map(); // fonte → { geradoEm, poligonos }

/** Só para teste. */
export function limparMemoAlertas() {
  memoIndices = null;
  memoPoligonos.clear();
}

async function lerKvJson(kv, chave) {
  try {
    const v = await kv.get(chave, { type: 'json', cacheTtl: 60 });
    return v && typeof v === 'object' ? v : null;
  } catch {
    return undefined; // erro de leitura ≠ chave ausente
  }
}

/** Estado de uma fonte a partir do índice guardado. */
export function estadoDaFonte(indice, agoraMs) {
  if (indice === undefined) return { estado: 'indisponivel', motivo: 'armazenamento_falhou' };
  if (!indice || indice.v !== 1) return { estado: 'indisponivel', motivo: 'sem_dados' };
  if (indice.estado !== 'ok') return { estado: 'indisponivel', motivo: indice.motivo || 'feed_fora' };
  const t = Date.parse(indice.atualizadoEm);
  if (!Number.isFinite(t) || agoraMs - t > ALERTAS_VALIDADE_MS) return { estado: 'indisponivel', motivo: 'desatualizado' };
  return { estado: 'ok', atualizadoEm: indice.atualizadoEm };
}

function aindaValido(aviso, agoraMs) {
  const fimMs = aviso.fim ? Date.parse(aviso.fim) : Date.parse(aviso.inicio) + SEM_FIM_MS;
  return Number.isFinite(fimMs) && fimMs > agoraMs;
}

/**
 * Cruza os índices com o município (e o ponto, se houver). Pura — testável sem KV.
 * `carregarPoligonos(fonte, geradoEm)` devolve o mapa de polígonos da fonte ou
 * `null` quando não dá para conferir.
 */
export async function cruzarAlertas({ indices, ibge, coord, agoraMs, carregarPoligonos, desligadas = FONTES_DESLIGADAS }) {
  const fontes = {};
  const avisos = [];
  const naoConferidos = {};
  const uf = ibge.slice(0, 2);
  for (const fonte of FONTES) {
    const indice = indices[fonte];
    const st = Object.prototype.hasOwnProperty.call(desligadas, fonte)
      ? { estado: 'indisponivel', motivo: desligadas[fonte] }
      : estadoDaFonte(indice, agoraMs);
    fontes[CHAVE_RESPOSTA[fonte]] = { nome: ROTULO_FONTE[fonte], ...st };
    if (st.estado !== 'ok') continue;
    let poligonos;
    let pendentes = 0;
    for (const aviso of Array.isArray(indice.avisos) ? indice.avisos : []) {
      if (!aviso || !aindaValido(aviso, agoraMs)) continue;
      const ibges = Array.isArray(aviso.ibges) ? aviso.ibges : [];
      let conferidoPor = null;
      if (ibges.includes(ibge)) {
        conferidoPor = 'municipio';
      } else if (!ibges.length && aviso.bbox) {
        // Só polígono. Fora da UF não conta; dentro, precisa do ponto.
        const ufs = Array.isArray(aviso.ufs) ? aviso.ufs : [];
        if (coord) {
          if (dentroDoBbox(aviso.bbox, coord.lat, coord.lon)) {
            if (poligonos === undefined) poligonos = await carregarPoligonos(fonte, indice.geradoEm);
            const partes = poligonos && poligonos[aviso.id];
            if (partes) {
              if (pontoNasPartes(partes, coord.lat, coord.lon)) conferidoPor = 'poligono';
            } else {
              pendentes++;
            }
          }
        } else if (!ufs.length || ufs.includes(uf)) {
          pendentes++;
        }
      }
      if (!conferidoPor) continue;
      const { ibges: _i, ufs: _u, bbox: _b, ...publico } = aviso;
      const inicioMs = Date.parse(aviso.inicio);
      avisos.push({ ...publico, conferidoPor, emVigor: Number.isFinite(inicioMs) && inicioMs <= agoraMs });
    }
    if (pendentes) naoConferidos[CHAVE_RESPOSTA[fonte]] = pendentes;
  }
  avisos.sort(
    (x, y) => (ORDEM_NIVEL[y.nivel] ?? 0) - (ORDEM_NIVEL[x.nivel] ?? 0) || Date.parse(x.inicio) - Date.parse(y.inicio),
  );
  const estados = Object.values(fontes).map((f) => f.estado);
  const estado = estados.every((e) => e === 'ok') ? 'ok' : estados.some((e) => e === 'ok') ? 'parcial' : 'indisponivel';
  return { estado, fontes, avisos, naoConferidos };
}

/**
 * GET /alertas?ibge=&lat=&lon= — público.
 * @param {{agora?:Function}} [deps]
 */
export async function handleAlertas(request, env, url, deps = {}) {
  if (request.method !== 'GET') {
    return json({ ok: false, motivo: 'metodo_nao_suportado' }, 405, { Allow: 'GET' });
  }
  const agoraMs = deps.agora ? deps.agora() : Date.now();

  const ibge = validarIbge(url.searchParams.get('ibge'));
  if (!ibge) return json({ ok: false, motivo: 'ibge_invalido' }, 400);
  let coord = null;
  if (url.searchParams.has('lat') || url.searchParams.has('lon')) {
    coord = validarCoordenadas(url.searchParams.get('lat'), url.searchParams.get('lon'));
    if (!coord) return json({ ok: false, motivo: 'coordenadas_invalidas' }, 400);
  }

  const kv = env && env.CACHE;
  if (!alertasLigados(env) || !kv || typeof kv.get !== 'function') {
    return json({ ok: false, motivo: 'alertas_desligados', atribuicao: ALERTAS_ATRIBUICAO }, 503);
  }

  let porFonte;
  if (memoIndices && memoIndices.exp > agoraMs) {
    porFonte = memoIndices.porFonte;
  } else {
    const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
    const estadoRl = await checarLimite(env.ALERTAS_RL, ip);
    if (!deixaPassar(estadoRl, { sensivel: false })) return json({ ok: false, motivo: 'muitas_requisicoes' }, 429);
    porFonte = {};
    // Só as fontes coletadas: ler a chave de uma desligada gastaria cota à toa.
    const lidos = await Promise.all(FONTES_COLETADAS.map((f) => lerKvJson(kv, chaveIndice(f))));
    FONTES_COLETADAS.forEach((f, i) => { porFonte[f] = lidos[i]; });
    // Erro de leitura (undefined) não fica na memória: a próxima consulta tenta de novo.
    if (lidos.every((v) => v !== undefined)) memoIndices = { exp: agoraMs + ALERTAS_MEMO_MS, porFonte };
  }

  const carregarPoligonos = async (fonte, geradoEm) => {
    const m = memoPoligonos.get(fonte);
    if (m && m.geradoEm === geradoEm) return m.poligonos;
    const v = await lerKvJson(kv, chavePoligonos(fonte));
    if (!v || v.v !== 1 || v.geradoEm !== geradoEm || !v.poligonos || typeof v.poligonos !== 'object') return null;
    memoPoligonos.set(fonte, { geradoEm, poligonos: v.poligonos });
    return v.poligonos;
  };

  const r = await cruzarAlertas({ indices: porFonte, ibge, coord, agoraMs, carregarPoligonos });
  const base = { ibge, fontes: r.fontes, atribuicao: ALERTAS_ATRIBUICAO, consultadoEm: new Date(agoraMs).toISOString() };
  if (r.estado === 'indisponivel') return json({ ok: false, motivo: 'alertas_indisponiveis', ...base }, 503);
  return json({
    ok: true,
    estado: r.estado,
    ...base,
    pontoConferido: !!coord,
    avisos: r.avisos,
    naoConferidos: r.naoConferidos,
  });
}
