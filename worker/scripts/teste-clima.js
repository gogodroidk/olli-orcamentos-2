/**
 * Teste do clima do dia (`src/clima.js`, rota GET /clima).
 *
 *     node scripts/teste-clima.js   (de dentro de worker/)
 *
 * Protege: validação de lat/lon (400, sem gastar balde nem rede); geohash de
 * ~5 km (vetor conhecido + vizinhos dividem célula); parse do Open-Meteo
 * mockado (temperatura, máx/mín do dia, 12h de chuva a partir da hora cheia
 * LOCAL do lugar); hora sem probabilidade vira `null`, nunca 0; cache de 30 min
 * por célula (2ª consulta não toca o upstream nem o rate limit); falha do
 * upstream vira {ok:false, motivo} e NÃO é cacheada; 429 por IP.
 */
import assert from 'node:assert/strict';
import {
  CLIMA_HORAS,
  CLIMA_TTL_S,
  celulaClima,
  geohash,
  handleClima,
  lerOpenMeteo,
  montarResposta,
  urlOpenMeteo,
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

// ─── Resposta do Open-Meteo de mentira (formato real da API v1/forecast) ───
// 48 horas a partir de 01/10/2026 00:00 em São Paulo (UTC-3). Chuva sobe à
// tarde: 70% às 16h. A hora 18h vem com `null` (buraco real que o Open-Meteo
// devolve quando o modelo não cobre a variável).
function openMeteoFalso() {
  const time = [];
  const precipitation_probability = [];
  const weather_code = [];
  for (let i = 0; i < 48; i++) {
    const dia = i < 24 ? '01' : '02';
    const h = String(i % 24).padStart(2, '0');
    time.push(`2026-10-${dia}T${h}:00`);
    const hora = i % 24;
    precipitation_probability.push(hora === 18 && i < 24 ? null : hora === 16 ? 70 : hora === 15 ? 35 : 5);
    weather_code.push(hora === 16 ? 61 : 2);
  }
  return {
    latitude: -23.55,
    longitude: -46.63,
    timezone: 'America/Sao_Paulo',
    timezone_abbreviation: 'GMT-3',
    utc_offset_seconds: -10800,
    current: { time: '2026-10-01T14:15', interval: 900, temperature_2m: 27.4, weather_code: 2, is_day: 1 },
    hourly: { time, precipitation_probability, weather_code },
    daily: {
      time: ['2026-10-01', '2026-10-02'],
      temperature_2m_max: [31.2, 25.0],
      temperature_2m_min: [18.6, 17.1],
    },
  };
}

// 17:20 UTC = 14:20 em São Paulo → janela começa em 14:00 local.
const AGORA = Date.UTC(2026, 9, 1, 17, 20);

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

function fetchFalso(corpo, { status = 200, lanca = false } = {}) {
  const chamadas = [];
  const fn = async (url) => {
    chamadas.push(String(url));
    if (lanca) throw new Error('rede caiu');
    return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
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
  const f = fetchFalso(openMeteoFalso());
  const rl = limiterFalso();
  const { request, url } = req('?lat=999&lon=1');
  const r = await handleClima(request, { CLIMA_RL: rl }, url, { fetch: f, cache: cacheFalso(), agora: () => AGORA });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { ok: false, motivo: 'coordenadas_invalidas' });
  assert.equal(f.chamadas.length, 0);
  assert.equal(rl.chaves.length, 0);
});

console.log('\n2) geohash de ~5 km');
await caso('vetor conhecido (Wikipedia: 57.64911,10.40744 → u4pruydqqvj)', () => {
  assert.equal(geohash(57.64911, 10.40744, 11), 'u4pruydqqvj');
  assert.equal(geohash(57.64911, 10.40744), 'u4pru');
});
await caso('célula tem ~4,9 km e o centro cai na mesma célula', () => {
  const c = celulaClima(-23.5505, -46.6333);
  assert.equal(c.geohash.length, 5);
  assert.equal(geohash(c.lat, c.lon), c.geohash);
  // Lado da célula de precisão 5: 360/2^13 de longitude e 180/2^12 de latitude.
  const ladoGraus = 180 / 2 ** 12;
  assert.ok(ladoGraus * 111 > 4.5 && ladoGraus * 111 < 5.2, `lado ~4,9 km (veio ${ladoGraus * 111})`);
  // Vizinho a ~300 m dentro da mesma célula divide a chave.
  assert.equal(geohash(c.lat + 0.003, c.lon + 0.003), c.geohash);
  // Ponto a ~20 km não divide.
  assert.notEqual(geohash(c.lat + 0.2, c.lon), c.geohash);
});
await caso('o upstream recebe o CENTRO da célula, não a posição exata', () => {
  const c = celulaClima(-23.5505, -46.6333);
  const u = new URL(urlOpenMeteo(c.lat, c.lon));
  assert.equal(u.searchParams.get('latitude'), String(c.lat));
  assert.equal(u.searchParams.get('longitude'), String(c.lon));
  assert.equal(u.searchParams.get('timezone'), 'auto');
  assert.match(u.searchParams.get('hourly'), /precipitation_probability/);
});

console.log('\n3) parse da resposta do Open-Meteo');
await caso('lê atual, dias e 48 horas', () => {
  const b = lerOpenMeteo(openMeteoFalso());
  assert.ok(b);
  assert.deepEqual(b.atual, { temperatura: 27.4, codigo: 2, ehDia: true, medidoEm: '2026-10-01T14:15' });
  assert.equal(b.utcOffsetSeg, -10800);
  assert.equal(b.fuso, 'America/Sao_Paulo');
  assert.equal(b.horas.length, 48);
  assert.deepEqual(b.dias[0], { data: '2026-10-01', max: 31.2, min: 18.6 });
});
await caso('probabilidade ausente vira null, NUNCA 0 (não sei ≠ não chove)', () => {
  const b = lerOpenMeteo(openMeteoFalso());
  assert.equal(b.horas[18].probabilidade, null);
  assert.equal(b.horas[16].probabilidade, 70);
});
await caso('janela de 12h começa na hora cheia LOCAL e cruza a meia-noite', () => {
  const b = lerOpenMeteo(openMeteoFalso());
  const r = montarResposta(b, AGORA, { geohash: 'x', lat: 1, lon: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.chuvaPorHora.length, CLIMA_HORAS);
  assert.equal(r.chuvaPorHora[0].inicio, '2026-10-01T14:00');
  assert.equal(r.chuvaPorHora[0].hora, '14:00');
  assert.equal(r.chuvaPorHora[2].probabilidade, 70);
  assert.equal(r.chuvaPorHora[2].codigo, 61);
  assert.equal(r.chuvaPorHora[11].inicio, '2026-10-02T01:00');
  assert.deepEqual(r.hoje, { data: '2026-10-01', max: 31.2, min: 18.6 });
  assert.equal(r.atual.temperatura, 27.4);
});
await caso('depois da meia-noite local, "hoje" vira o dia seguinte', () => {
  const b = lerOpenMeteo(openMeteoFalso());
  const r = montarResposta(b, Date.UTC(2026, 9, 2, 3, 30), { geohash: 'x', lat: 1, lon: 1 }); // 00:30 local
  assert.equal(r.hoje.data, '2026-10-02');
  assert.equal(r.hoje.max, 25.0);
  assert.equal(r.chuvaPorHora[0].inicio, '2026-10-02T00:00');
});
await caso('previsão que não cobre agora → null (resposta velha demais)', () => {
  const b = lerOpenMeteo(openMeteoFalso());
  assert.equal(montarResposta(b, Date.UTC(2026, 9, 5, 12, 0), { geohash: 'x', lat: 1, lon: 1 }), null);
});
await caso('resposta quebrada vira null (indisponível), não dado inventado', () => {
  assert.equal(lerOpenMeteo(null), null);
  assert.equal(lerOpenMeteo({ error: true, reason: 'x' }), null);
  const semTemp = openMeteoFalso(); semTemp.current.temperature_2m = null;
  assert.equal(lerOpenMeteo(semTemp), null);
  const desalinhada = openMeteoFalso(); desalinhada.hourly.precipitation_probability.pop();
  assert.equal(lerOpenMeteo(desalinhada), null);
  const horaRuim = openMeteoFalso(); horaRuim.hourly.time[3] = 'ontem';
  assert.equal(lerOpenMeteo(horaRuim), null);
});

console.log('\n4) handler: cache, rate limit e erros');
await caso('miss → consulta upstream, responde ok e grava no cache com TTL de 30 min', async () => {
  const f = fetchFalso(openMeteoFalso());
  const cache = cacheFalso();
  const rl = limiterFalso();
  const { request, url } = req('?lat=-23.5505&lon=-46.6333');
  const r = await handleClima(request, { CLIMA_RL: rl }, url, { fetch: f, cache, agora: () => AGORA });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.cache, false);
  assert.equal(d.local.geohash, celulaClima(-23.5505, -46.6333).geohash);
  assert.equal(d.chuvaPorHora.length, 12);
  assert.equal(f.chamadas.length, 1);
  assert.deepEqual(rl.chaves, ['203.0.113.7']);
  assert.equal(cache.m.size, 1);
  assert.match([...cache.m.keys()][0], /\/clima\/v1\/[0-9a-z]{5}$/);
  assert.equal(CLIMA_TTL_S, 1800);
});
await caso('vizinho na mesma célula → cache: 1 chamada upstream para os dois, sem gastar balde', async () => {
  const f = fetchFalso(openMeteoFalso());
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
  assert.equal(f.chamadas.length, 1);
  assert.equal(rl.chaves.length, 1);
  // A janela é recortada AGORA (14:40 local → ainda 14h); 1h depois começa às 15h.
  const r2 = await handleClima(b.request, env, b.url, { fetch: f, cache, agora: () => AGORA + 60 * 60_000 });
  assert.equal((await r2.json()).chuvaPorHora[0].inicio, '2026-10-01T15:00');
});
await caso('upstream fora → 503 {ok:false, motivo:clima_indisponivel} e NADA no cache', async () => {
  for (const f of [fetchFalso({}, { status: 500 }), fetchFalso({}, { lanca: true }), fetchFalso({ lixo: 1 })]) {
    const cache = cacheFalso();
    const { request, url } = req('?lat=-23.5&lon=-46.6');
    const r = await handleClima(request, { CLIMA_RL: limiterFalso() }, url, { fetch: f, cache, agora: () => AGORA });
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { ok: false, motivo: 'clima_indisponivel' });
    assert.equal(cache.m.size, 0);
  }
});
await caso('rate limit negado → 429 {ok:false, motivo:muitas_requisicoes}, sem upstream', async () => {
  const f = fetchFalso(openMeteoFalso());
  const { request, url } = req('?lat=-23.5&lon=-46.6');
  const r = await handleClima(request, { CLIMA_RL: limiterFalso(false) }, url, { fetch: f, cache: cacheFalso(), agora: () => AGORA });
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { ok: false, motivo: 'muitas_requisicoes' });
  assert.equal(f.chamadas.length, 0);
});
await caso('limiter ausente (binding sumiu) → segue (rota não sensível)', async () => {
  const f = fetchFalso(openMeteoFalso());
  const { request, url } = req('?lat=-23.5&lon=-46.6');
  const r = await handleClima(request, {}, url, { fetch: f, cache: null, agora: () => AGORA });
  assert.equal(r.status, 200);
});
await caso('cache que lança vira miss, não derruba a rota', async () => {
  const quebrado = { async match() { throw new Error('x'); }, async put() { throw new Error('y'); } };
  const { request, url } = req('?lat=-23.5&lon=-46.6');
  const r = await handleClima(request, { CLIMA_RL: limiterFalso() }, url, { fetch: fetchFalso(openMeteoFalso()), cache: quebrado, agora: () => AGORA });
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

console.log(`\nteste-clima: ${ok} casos OK`);
