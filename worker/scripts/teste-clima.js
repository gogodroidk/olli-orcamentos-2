/**
 * Teste do clima do dia (`src/clima.js`, rota GET /clima).
 *
 *     node scripts/teste-clima.js   (de dentro de worker/)
 *
 * Protege: validação de lat/lon (400, sem gastar balde nem rede); geohash de
 * ~5 km (vetor conhecido + vizinhos dividem célula); termos do MET Norway
 * (User-Agent com contato, no máx. 4 casas decimais, If-Modified-Since,
 * Expires); parse do Locationforecast /compact mockado (temperatura atual,
 * máx/mín de hoje no fuso de São Paulo, 12h de mm/símbolo a partir da hora
 * cheia LOCAL); hora sem `next_1_hours` vira `null`, nunca 0; cache de 30 min
 * por célula (2ª consulta não toca o upstream nem o rate limit); falha do
 * upstream vira {ok:false, motivo} e NÃO é cacheada; 429 por IP; atribuição
 * "MET Norway" no JSON.
 */
import assert from 'node:assert/strict';
import {
  CLIMA_FONTE,
  CLIMA_HORAS,
  CLIMA_TTL_S,
  MET_USER_AGENT,
  celulaClima,
  frescoAte,
  geohash,
  handleClima,
  lerMet,
  montarResposta,
  resumirDias,
  urlMet,
  validarCoordenadas,
} from '../src/clima.js';
import { metodosDaRota } from '../src/util.js';
import { readFileSync } from 'node:fs';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok++;
  console.log(`  ok  ${nome}`);
}

// ─── Resposta do MET de mentira (formato real do Locationforecast 2.0 /compact) ───
// Série em UTC a partir de 01/10/2026 17:00Z (= 14:00 em São Paulo, UTC-3):
// 60 horas de hora em hora e depois passos de 6h SEM `next_1_hours` (como o
// MET faz no fim da série). Chuva à tarde: 16h local = 1,8 mm 'rain'; 15h
// local = 0,2 mm 'cloudy'. A hora 18h local vem SEM `next_1_hours` (buraco).
const H = 3600_000;
const INICIO = Date.UTC(2026, 9, 1, 17, 0);

/** Temperatura pela hora LOCAL (UTC-3): dá máx/mín conhecidos por dia. */
function temperatura(msUtc) {
  const local = new Date(msUtc - 3 * H);
  const dia = local.getUTCDate();
  const hora = local.getUTCHours();
  if (dia === 1) {
    if (hora === 14) return 27.4;
    if (hora === 15) return 31.2;
    if (hora === 23) return 18.6;
    return 22;
  }
  if (dia === 2) {
    if (hora === 13) return 25.0;
    if (hora === 5) return 17.1;
    return 20;
  }
  return 19;
}

function metFalso() {
  const timeseries = [];
  const tempos = [];
  for (let i = 0; i < 60; i++) tempos.push(INICIO + i * H);
  for (let i = 0; i < 8; i++) tempos.push(INICIO + 60 * H + i * 6 * H);
  tempos.forEach((t, i) => {
    const horaLocal = new Date(t - 3 * H).getUTCHours();
    const data = { instant: { details: { air_temperature: temperatura(t), relative_humidity: 70 } } };
    const horaria = i < 60;
    if (horaria && !(horaLocal === 18 && i < 24)) {
      data.next_1_hours = {
        summary: { symbol_code: horaLocal === 16 ? 'rain' : horaLocal >= 19 || horaLocal < 6 ? 'partlycloudy_night' : horaLocal === 15 ? 'cloudy' : 'partlycloudy_day' },
        details: { precipitation_amount: horaLocal === 16 ? 1.8 : horaLocal === 15 ? 0.2 : 0 },
      };
    }
    data.next_6_hours = { summary: { symbol_code: 'cloudy' }, details: { precipitation_amount: 0 } };
    timeseries.push({ time: new Date(t).toISOString().replace('.000Z', 'Z'), data });
  });
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-46.63, -23.55, 760] },
    properties: {
      meta: { updated_at: '2026-10-01T16:45:12Z', units: { air_temperature: 'celsius', precipitation_amount: 'mm' } },
      timeseries,
    },
  };
}

// 17:20 UTC = 14:20 em São Paulo → janela começa em 14:00 local.
const AGORA = Date.UTC(2026, 9, 1, 17, 20);
const LAST_MODIFIED = 'Thu, 01 Oct 2026 16:45:12 GMT';

function cacheFalso() {
  const m = new Map();
  return {
    m,
    async match(k) {
      const t = m.get(String(k));
      return t === undefined ? undefined : new Response(t);
    },
    async put(k, resp) {
      m.set(String(k), await resp.text());
    },
  };
}

/**
 * fetch falso. `status: 304` responde sem corpo. `headers` extra (Expires,
 * Last-Modified) vão na resposta. Guarda URL e headers de cada chamada.
 */
function fetchFalso(corpo, { status = 200, lanca = false, headers = {} } = {}) {
  const chamadas = [];
  const fn = async (url, init = {}) => {
    chamadas.push({ url: String(url), headers: { ...(init.headers || {}) } });
    if (lanca) throw new Error('rede caiu');
    if (status === 304) return new Response(null, { status, headers });
    return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  };
  fn.chamadas = chamadas;
  return fn;
}

function limiterFalso(success = true) {
  const chaves = [];
  return { chaves, async limit({ key }) { chaves.push(key); return { success }; } };
}

function req(qs, ip = '203.0.113.7') {
  const url = new URL(`https://diag.exemplo/clima${qs}`);
  return { request: new Request(url, { headers: { 'CF-Connecting-IP': ip } }), url };
}

console.log('\n1) validação de lat/lon');
await caso('coordenada válida passa', () => {
  assert.deepEqual(validarCoordenadas('-23.5505', '-46.6333'), { lat: -23.5505, lon: -46.6333 });
  assert.deepEqual(validarCoordenadas('90', '-180'), { lat: 90, lon: -180 });
});
await caso('fora do intervalo, vazio, lixo, notação científica e 0,0 são recusados', () => {
  for (const [la, lo] of [
    ['91', '0.1'], ['-23', '181'], ['', '-46'], [null, null], ['abc', '1'],
    ['1e1', '2'], ['Infinity', '2'], ['NaN', '2'], ['0', '0'], ['-23,55', '-46.6'], [' ', ' '],
  ]) {
    assert.equal(validarCoordenadas(la, lo), null, `${la},${lo} devia ser inválido`);
  }
});
await caso('GET /clima com coordenada inválida → 400 {ok:false, motivo}, sem rede e sem balde', async () => {
  const f = fetchFalso(metFalso());
  const rl = limiterFalso();
  const { request, url } = req('?lat=999&lon=1');
  const r = await handleClima(request, { CLIMA_RL: rl }, url, { fetch: f, cache: cacheFalso(), agora: () => AGORA });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { ok: false, motivo: 'coordenadas_invalidas' });
  assert.equal(f.chamadas.length, 0);
  assert.equal(rl.chaves.length, 0);
});

console.log('\n2) geohash de ~5 km e termos do MET');
await caso('vetor conhecido (Wikipedia: 57.64911,10.40744 → u4pruydqqvj)', () => {
  assert.equal(geohash(57.64911, 10.40744, 11), 'u4pruydqqvj');
  assert.equal(geohash(57.64911, 10.40744), 'u4pru');
});
await caso('célula tem ~4,9 km e o centro cai na mesma célula', () => {
  const c = celulaClima(-23.5505, -46.6333);
  assert.equal(c.geohash.length, 5);
  assert.equal(geohash(c.lat, c.lon), c.geohash);
  const ladoGraus = 180 / 2 ** 12;
  assert.ok(ladoGraus * 111 > 4.5 && ladoGraus * 111 < 5.2, `lado ~4,9 km (veio ${ladoGraus * 111})`);
  assert.equal(geohash(c.lat + 0.003, c.lon + 0.003), c.geohash);
  assert.notEqual(geohash(c.lat + 0.2, c.lon), c.geohash);
});
await caso('o MET recebe o CENTRO da célula, com no máximo 4 casas decimais', () => {
  const c = celulaClima(-23.5505, -46.6333);
  const u = new URL(urlMet(c.lat, c.lon));
  assert.equal(u.origin + u.pathname, 'https://api.met.no/weatherapi/locationforecast/2.0/compact');
  assert.equal(Number(u.searchParams.get('lat')), c.lat);
  assert.equal(Number(u.searchParams.get('lon')), c.lon);
  // 5+ casas = 403 pelos termos. Até coordenada "suja" sai com 4.
  const sujo = new URL(urlMet(-23.123456789, -46.987654321));
  for (const k of ['lat', 'lon']) {
    assert.match(sujo.searchParams.get(k), /^-?\d+\.\d{4}$/, `${k} com mais de 4 casas`);
  }
});
await caso('toda consulta manda User-Agent do OLLI com contato (termos do MET)', async () => {
  assert.match(MET_USER_AGENT, /^OLLI-Orcamentos\/\d/);
  assert.match(MET_USER_AGENT, /https:\/\/olliorcamentos\.online/);
  const f = fetchFalso(metFalso());
  const { request, url } = req('?lat=-23.5505&lon=-46.6333');
  await handleClima(request, { CLIMA_RL: limiterFalso() }, url, { fetch: f, cache: cacheFalso(), agora: () => AGORA });
  assert.equal(f.chamadas.length, 1);
  assert.equal(f.chamadas[0].headers['User-Agent'], MET_USER_AGENT);
  assert.equal(f.chamadas[0].headers['If-Modified-Since'], undefined, 'sem cache não há If-Modified-Since');
});

console.log('\n3) parse da resposta do MET (/compact)');
await caso('lê 48 horas da série, em UTC, com temperatura, mm e símbolo', () => {
  const b = lerMet(metFalso());
  assert.ok(b);
  assert.equal(b.v, 2);
  assert.equal(b.fonte, 'MET Norway');
  assert.equal(b.previsaoDe, '2026-10-01T16:45:12Z');
  assert.equal(b.horas.length, 48);
  assert.deepEqual(b.horas[0], { inicioUtc: '2026-10-01T17:00:00.000Z', temperatura: 27.4, mm: 0, simbolo: 'partlycloudy_day' });
  assert.deepEqual(b.horas[2], { inicioUtc: '2026-10-01T19:00:00.000Z', temperatura: 22, mm: 1.8, simbolo: 'rain' });
});
await caso('hora sem next_1_hours vira mm/símbolo null, NUNCA 0 (não sei ≠ não chove)', () => {
  const b = lerMet(metFalso());
  assert.equal(b.horas[4].inicioUtc, '2026-10-01T21:00:00.000Z'); // 18h local
  assert.equal(b.horas[4].mm, null);
  assert.equal(b.horas[4].simbolo, null);
  const negativo = metFalso();
  negativo.properties.timeseries[1].data.next_1_hours.details.precipitation_amount = -1;
  assert.equal(lerMet(negativo).horas[1].mm, null, 'mm negativo é lixo, não seco');
});
await caso('janela de 12h começa na hora cheia LOCAL (São Paulo) e cruza a meia-noite', () => {
  const b = lerMet(metFalso());
  const r = montarResposta(b, AGORA, { geohash: 'x', lat: 1, lon: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.fonte, CLIMA_FONTE);
  assert.equal(r.licenca, 'CC BY 4.0');
  assert.equal(r.fuso, 'America/Sao_Paulo');
  assert.equal(r.chuvaPorHora.length, CLIMA_HORAS);
  assert.deepEqual(r.chuvaPorHora[0], { inicio: '2026-10-01T14:00', hora: '14:00', mm: 0, simbolo: 'partlycloudy_day' });
  assert.deepEqual(r.chuvaPorHora[1], { inicio: '2026-10-01T15:00', hora: '15:00', mm: 0.2, simbolo: 'cloudy' });
  assert.deepEqual(r.chuvaPorHora[2], { inicio: '2026-10-01T16:00', hora: '16:00', mm: 1.8, simbolo: 'rain' });
  assert.deepEqual(r.chuvaPorHora[4], { inicio: '2026-10-01T18:00', hora: '18:00', mm: null, simbolo: null });
  assert.equal(r.chuvaPorHora[11].inicio, '2026-10-02T01:00');
});
await caso('atual = temperatura instantânea da hora corrente + símbolo; ehDia pelo sufixo', () => {
  const b = lerMet(metFalso());
  const r = montarResposta(b, AGORA, { geohash: 'x', lat: 1, lon: 1 });
  assert.deepEqual(r.atual, { temperatura: 27.4, simbolo: 'partlycloudy_day', ehDia: true, medidoEm: '2026-10-01T14:00' });
  const noite = montarResposta(b, Date.UTC(2026, 9, 1, 23, 10), { geohash: 'x', lat: 1, lon: 1 }); // 20:10 local
  assert.equal(noite.atual.ehDia, false);
  const semSufixo = montarResposta(b, Date.UTC(2026, 9, 1, 19, 5), { geohash: 'x', lat: 1, lon: 1 }); // 16h 'rain'
  assert.equal(semSufixo.atual.ehDia, null, "'rain' não diz se é dia: null, não chute");
});
await caso('máx/mín de hoje (fuso local) a partir das horas do dia', () => {
  const b = lerMet(metFalso());
  const r = montarResposta(b, AGORA, { geohash: 'x', lat: 1, lon: 1 });
  assert.deepEqual(r.hoje, { data: '2026-10-01', max: 31.2, min: 18.6 });
});
await caso('depois da meia-noite local, "hoje" vira o dia seguinte', () => {
  const b = lerMet(metFalso());
  const r = montarResposta(b, Date.UTC(2026, 9, 2, 3, 30), { geohash: 'x', lat: 1, lon: 1 }); // 00:30 local
  assert.equal(r.hoje.data, '2026-10-02');
  assert.equal(r.hoje.max, 25.0);
  assert.equal(r.hoje.min, 17.1);
  assert.equal(r.chuvaPorHora[0].inicio, '2026-10-02T00:00');
});
await caso('previsão que não cobre agora → null (resposta velha demais)', () => {
  const b = lerMet(metFalso());
  assert.equal(montarResposta(b, Date.UTC(2026, 9, 5, 12, 0), { geohash: 'x', lat: 1, lon: 1 }), null);
});
await caso('sem temperatura ou símbolo para agora → null (indisponível), não dado inventado', () => {
  const semTemp = metFalso();
  semTemp.properties.timeseries[0].data.instant.details.air_temperature = null;
  assert.equal(montarResposta(lerMet(semTemp), AGORA, { geohash: 'x', lat: 1, lon: 1 }), null);
  const semSimbolo = metFalso();
  delete semSimbolo.properties.timeseries[0].data.next_1_hours;
  assert.equal(montarResposta(lerMet(semSimbolo), AGORA, { geohash: 'x', lat: 1, lon: 1 }), null);
});
await caso('resposta quebrada vira null (indisponível)', () => {
  assert.equal(lerMet(null), null);
  assert.equal(lerMet({ error: true }), null);
  assert.equal(lerMet({ properties: { timeseries: [] } }), null);
  const horaRuim = metFalso(); horaRuim.properties.timeseries[3].time = 'ontem';
  assert.equal(lerMet(horaRuim), null);
  const semFuso = metFalso(); semFuso.properties.timeseries[3].time = '2026-10-01T20:00:00';
  assert.equal(lerMet(semFuso), null, 'horário sem Z não é UTC garantido');
});

console.log('\n3b) resumo por dia (Radar do Tempo, Onda I4)');
await caso('dias: máx/mín por dia LOCAL e chuva somada só com cobertura suficiente', () => {
  const b = lerMet(metFalso());
  assert.ok(Array.isArray(b.dias));
  // 01/10 começa às 14h local: só 10 h de chuva conhecidas → "não sei", nunca 0.
  assert.deepEqual(b.dias[0], { data: '2026-10-01', max: 31.2, min: 18.6, chuvaMm: null });
  // 02/10: 24 h horárias conhecidas → soma 1,8 + 0,2.
  assert.equal(b.dias[1].data, '2026-10-02');
  assert.equal(b.dias[1].max, 25);
  assert.equal(b.dias[1].min, 17.1);
  assert.equal(b.dias[1].chuvaMm, 2);
  // Trecho de 6 em 6 h (sem next_1_hours) também conta.
  const ultimo = b.dias[b.dias.length - 1];
  assert.ok(ultimo.data > '2026-10-03');
});
await caso('dias: resumirDias aguenta lixo e nunca inventa', () => {
  assert.deepEqual(resumirDias(null), []);
  assert.deepEqual(resumirDias([{ time: 'ontem' }]), []);
  const r = resumirDias([{ time: '2026-10-05T15:00:00Z', data: { instant: { details: { air_temperature: 30 } } } }]);
  assert.deepEqual(r, [{ data: '2026-10-05', max: null, min: null, chuvaMm: null }]);
});
await caso('dias na resposta: de hoje em diante; previsão antiga sem o campo → ausente', () => {
  const b = lerMet(metFalso());
  const r = montarResposta(b, Date.UTC(2026, 9, 2, 12, 0), { geohash: 'x', lat: 1, lon: 1 });
  assert.equal(r.dias[0].data, '2026-10-02');
  const semDias = { ...b };
  delete semDias.dias;
  assert.equal('dias' in montarResposta(semDias, AGORA, { geohash: 'x', lat: 1, lon: 1 }), false);
});

console.log('\n4) handler: cache, Expires/If-Modified-Since, rate limit e erros');
await caso('miss → consulta o MET, responde ok com fonte e grava no cache', async () => {
  const f = fetchFalso(metFalso(), { headers: { 'Last-Modified': LAST_MODIFIED } });
  const cache = cacheFalso();
  const rl = limiterFalso();
  const { request, url } = req('?lat=-23.5505&lon=-46.6333');
  const r = await handleClima(request, { CLIMA_RL: rl }, url, { fetch: f, cache, agora: () => AGORA });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.fonte, 'MET Norway');
  assert.equal(d.cache, false);
  assert.equal(d.atualizadoEm, new Date(AGORA).toISOString());
  assert.equal(d.local.geohash, celulaClima(-23.5505, -46.6333).geohash);
  assert.equal(d.chuvaPorHora.length, 12);
  assert.equal(f.chamadas.length, 1);
  assert.deepEqual(rl.chaves, ['203.0.113.7']);
  assert.equal(cache.m.size, 1);
  assert.match([...cache.m.keys()][0], /\/clima\/v2\/[0-9a-z]{5}$/);
  const entrada = JSON.parse([...cache.m.values()][0]);
  assert.equal(entrada.ultimaModificacao, LAST_MODIFIED);
  assert.equal(entrada.frescoAteMs, AGORA + CLIMA_TTL_S * 1000);
  assert.equal(CLIMA_TTL_S, 1800);
});
await caso('vizinho na mesma célula → cache: 1 chamada upstream para os dois, sem gastar balde', async () => {
  const f = fetchFalso(metFalso());
  const cache = cacheFalso();
  const rl = limiterFalso();
  const env = { CLIMA_RL: rl };
  const c = celulaClima(-23.5505, -46.6333);
  const a = req(`?lat=${c.lat}&lon=${c.lon}`);
  await handleClima(a.request, env, a.url, { fetch: f, cache, agora: () => AGORA });
  const b = req(`?lat=${(c.lat + 0.003).toFixed(4)}&lon=${(c.lon + 0.003).toFixed(4)}`, '198.51.100.9');
  const r = await handleClima(b.request, env, b.url, { fetch: f, cache, agora: () => AGORA + 20 * 60_000 });
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.cache, true);
  assert.equal(d.chuvaPorHora[0].inicio, '2026-10-01T14:00'); // 14:40 local → ainda 14h
  assert.equal(f.chamadas.length, 1);
  assert.equal(rl.chaves.length, 1);
});
await caso('Expires mais longe que 30 min estende o frescor (sem consultar antes da hora)', async () => {
  assert.equal(frescoAte(AGORA, null), AGORA + 30 * 60_000);
  assert.equal(frescoAte(AGORA, AGORA + 10 * 60_000), AGORA + 30 * 60_000, 'Expires curto não encurta os 30 min');
  assert.equal(frescoAte(AGORA, AGORA + 50 * 60_000), AGORA + 50 * 60_000);
  assert.equal(frescoAte(AGORA, AGORA + 48 * H), AGORA + 6 * H, 'Expires absurdo tem teto');
  const expira = new Date(AGORA + 50 * 60_000).toUTCString();
  const f = fetchFalso(metFalso(), { headers: { Expires: expira } });
  const cache = cacheFalso();
  const { request, url } = req('?lat=-23.5505&lon=-46.6333');
  await handleClima(request, { CLIMA_RL: limiterFalso() }, url, { fetch: f, cache, agora: () => AGORA });
  const r = await handleClima(request, { CLIMA_RL: limiterFalso() }, url, { fetch: f, cache, agora: () => AGORA + 40 * 60_000 });
  assert.equal((await r.json()).cache, true);
  assert.equal(f.chamadas.length, 1, 'dentro do Expires não toca o MET');
});
await caso('entrada vencida → revalida com If-Modified-Since; 304 reaproveita a série', async () => {
  const cache = cacheFalso();
  const { request, url } = req('?lat=-23.5505&lon=-46.6333');
  const f1 = fetchFalso(metFalso(), { headers: { 'Last-Modified': LAST_MODIFIED } });
  await handleClima(request, { CLIMA_RL: limiterFalso() }, url, { fetch: f1, cache, agora: () => AGORA });
  const f2 = fetchFalso(null, { status: 304 });
  const rl = limiterFalso();
  const depois = AGORA + 60 * 60_000; // 15:20 local
  const r = await handleClima(request, { CLIMA_RL: rl }, url, { fetch: f2, cache, agora: () => depois });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.cache, false);
  assert.equal(d.chuvaPorHora[0].inicio, '2026-10-01T15:00');
  assert.equal(d.atual.temperatura, 31.2);
  assert.equal(f2.chamadas.length, 1);
  assert.equal(f2.chamadas[0].headers['If-Modified-Since'], LAST_MODIFIED);
  assert.equal(rl.chaves.length, 1, 'revalidação toca o MET: gasta balde');
  const entrada = JSON.parse([...cache.m.values()][0]);
  assert.equal(entrada.frescoAteMs, depois + CLIMA_TTL_S * 1000, '304 renova o frescor');
  assert.equal(entrada.ultimaModificacao, LAST_MODIFIED);
});
await caso('entrada vencida e MET responde 200 → série nova substitui a velha', async () => {
  const cache = cacheFalso();
  const { request, url } = req('?lat=-23.5505&lon=-46.6333');
  await handleClima(request, { CLIMA_RL: limiterFalso() }, url, { fetch: fetchFalso(metFalso()), cache, agora: () => AGORA });
  const novo = metFalso();
  novo.properties.timeseries[1].data.instant.details.air_temperature = 33.3; // 18Z = 15h local
  const f = fetchFalso(novo);
  const r = await handleClima(request, { CLIMA_RL: limiterFalso() }, url, { fetch: f, cache, agora: () => AGORA + 60 * 60_000 });
  assert.equal((await r.json()).atual.temperatura, 33.3);
  assert.equal(f.chamadas[0].headers['If-Modified-Since'], undefined, 'sem Last-Modified guardado, não inventa data');
});
await caso('upstream fora (500, 403, 429, rede, lixo, 304 sem cache) → 503 e NADA no cache', async () => {
  for (const f of [
    fetchFalso({}, { status: 500 }),
    fetchFalso({}, { status: 403 }),
    fetchFalso({}, { status: 429 }),
    fetchFalso({}, { lanca: true }),
    fetchFalso({ lixo: 1 }),
    fetchFalso(null, { status: 304 }),
  ]) {
    const cache = cacheFalso();
    const { request, url } = req('?lat=-23.5&lon=-46.6');
    const r = await handleClima(request, { CLIMA_RL: limiterFalso() }, url, { fetch: f, cache, agora: () => AGORA });
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { ok: false, motivo: 'clima_indisponivel' });
    assert.equal(cache.m.size, 0);
  }
});
await caso('rate limit negado → 429 {ok:false, motivo:muitas_requisicoes}, sem upstream', async () => {
  const f = fetchFalso(metFalso());
  const { request, url } = req('?lat=-23.5&lon=-46.6');
  const r = await handleClima(request, { CLIMA_RL: limiterFalso(false) }, url, { fetch: f, cache: cacheFalso(), agora: () => AGORA });
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { ok: false, motivo: 'muitas_requisicoes' });
  assert.equal(f.chamadas.length, 0);
});
await caso('limiter ausente (binding sumiu) → segue (rota não sensível)', async () => {
  const f = fetchFalso(metFalso());
  const { request, url } = req('?lat=-23.5&lon=-46.6');
  const r = await handleClima(request, {}, url, { fetch: f, cache: null, agora: () => AGORA });
  assert.equal(r.status, 200);
});
await caso('cache que lança vira miss, não derruba a rota', async () => {
  const quebrado = { async match() { throw new Error('x'); }, async put() { throw new Error('y'); } };
  const { request, url } = req('?lat=-23.5&lon=-46.6');
  const r = await handleClima(request, { CLIMA_RL: limiterFalso() }, url, { fetch: fetchFalso(metFalso()), cache: quebrado, agora: () => AGORA });
  assert.equal(r.status, 200);
});

console.log('\n5) roteamento e binding');
await caso('/clima existe na tabela de métodos (GET) e no index.js', () => {
  assert.equal(metodosDaRota('/clima'), 'GET');
  const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(index, /url\.pathname === '\/clima' && request\.method === 'GET'/);
  assert.match(index, /handleClima\(request, env, url\)/);
});
await caso('CLIMA_RL declarado em produção e staging, com namespace_id único', () => {
  const w = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const ids = [...w.matchAll(/"namespace_id":\s*"(\d+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'namespace_id repetido');
  const clima = [...w.matchAll(/"name":\s*"CLIMA_RL",\s*"namespace_id":\s*"(\d+)"/g)].map((m) => m[1]);
  assert.equal(clima.length, 2);
});
await caso('nenhum resto do Open-Meteo no código do clima', () => {
  const fonte = readFileSync(new URL('../src/clima.js', import.meta.url), 'utf8');
  assert.doesNotMatch(fonte, /api\.open-meteo\.com/);
});

console.log(`\nteste-clima: ${ok} casos OK`);
