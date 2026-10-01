/**
 * Teste dos alertas oficiais (`src/alertas.js`: cron + rota GET /alertas).
 *
 *     node scripts/teste-alertas.js   (de dentro de worker/)
 *
 * Protege: IBGE e coordenadas validados (400 sem tocar KV); leitura do JSON do
 * INMET (horário de Brasília → ISO -03:00, aviso encerrado fora, IBGEs,
 * polígono GeoJSON [lon,lat] → [lat,lon]); leitura do Atom/CAP do IDAP em
 * BYTES (com e sem prefixo de namespace, IBGE só no <geocode>, polígono
 * amostrado, Cancel/references tiram o alerta do ar, status≠Actual fora,
 * expirado fora); ponto-no-polígono (com buraco); cron grava no KV e, com o
 * feed fora, grava 'indisponivel' — NUNCA lista vazia com cara de "sem
 * alertas"; rota: parcial quando uma fonte cai, 503 quando caem todas,
 * índice velho = indisponível, alerta só-polígono sem lat/lon vira
 * `naoConferidos` (não some), memória do isolate poupa o KV; crons do
 * wrangler.jsonc batem com `ALERTAS_CRONS`; index.js roteia o cron de alertas
 * ANTES dos jobs de e-mail (que não podem rodar em dobro).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import {
  ALERTAS_ATRIBUICAO,
  ALERTAS_CRONS,
  ALERTAS_MAX_VERTICES,
  ALERTAS_USER_AGENT,
  ALERTAS_VALIDADE_MS,
  IDAP_URL,
  INMET_URL,
  amostrarAnelCap,
  chaveIndice,
  chavePoligonos,
  fonteDoCron,
  handleAlertas,
  horaInmetIso,
  lerIdap,
  lerInmet,
  limparMemoAlertas,
  nivelCap,
  nivelInmet,
  pontoNasPartes,
  processarAlertas,
  validarIbge,
} from '../src/alertas.js';
import { metodosDaRota } from '../src/util.js';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok++;
  console.log(`  ok  ${nome}`);
}

// Relógio do teste: 01/10/2026 12:00 em Brasília.
const AGORA = Date.parse('2026-10-01T12:00:00-03:00');
const SP_CAPITAL = '3550308';
const CAJATI = '3509254';
const RIO = '3304557';

// ─── INMET de mentira (formato real do /avisos/ativos) ─────────────────────
function avisoInmet(over = {}) {
  return {
    id: 55916,
    descricao: 'Tempestade',
    severidade: 'Perigo',
    id_severidade: 7,
    inicio: '2026-10-01 09:00',
    fim: '2026-10-01 23:59',
    encerrado: false,
    estados: 'São Paulo',
    geocodes: `${SP_CAPITAL},3509502,9999999,abc`,
    poligono: JSON.stringify({
      type: 'Polygon',
      coordinates: [[[-47, -24], [-46, -24], [-46, -23], [-47, -23], [-47, -24]]],
    }),
    riscos: ['Chuva entre 30 e 60 mm/h.'],
    instrucoes: ['Evite áreas alagadas.', 'Defesa Civil 199.'],
    icone: 'data:image/png;base64,AAAA',
    ...over,
  };
}
function inmetFalso() {
  return {
    hoje: [avisoInmet(), avisoInmet({ id: 1, encerrado: true }), avisoInmet({ id: 2, inicio: 'ontem' })],
    futuro: [avisoInmet({ id: 55920, severidade: 'Grande Perigo', inicio: '2026-10-02 12:00', fim: '2026-10-02 23:59' })],
  };
}

// ─── IDAP de mentira (Atom + CAP 1.2, como o feed real) ─────────────────────
function anelTexto(latMin, lonMin, latMax, lonMax, porLado = 5) {
  const pts = [];
  const passo = (v0, v1, i) => v0 + ((v1 - v0) * i) / porLado;
  for (let i = 0; i < porLado; i++) pts.push([latMin, passo(lonMin, lonMax, i)]);
  for (let i = 0; i < porLado; i++) pts.push([passo(latMin, latMax, i), lonMax]);
  for (let i = 0; i < porLado; i++) pts.push([latMax, passo(lonMax, lonMin, i)]);
  for (let i = 0; i < porLado; i++) pts.push([passo(latMax, latMin, i), lonMin]);
  pts.push(pts[0]);
  return pts.map(([a, b]) => `${a.toFixed(3)},${b.toFixed(3)}`).join(' ');
}

function entradaCap({
  id,
  p = '',
  status = 'Actual',
  msgType = 'Alert',
  severity = 'Severe',
  onset = '2026-10-01T10:00:00-03:00',
  expires = '2026-10-01T20:00:00-03:00',
  areaDesc = 'SÃO PAULO/SP',
  poligonos = [],
  ibges = [],
  references = null,
  headline = 'Defesa Civil: chuva forte &amp; raios',
}) {
  const t = (n, v) => `<${p}${n}>${v}</${p}${n}>`;
  const ns = p ? ` xmlns:${p.slice(0, -1)}="urn:oasis:names:tc:emergency:cap:1.2"` : ' xmlns="urn:oasis:names:tc:emergency:cap:1.2"';
  return `
  <entry>
    <title>CHUVAS INTENSAS</title>
    <id>${id}</id>
    <content type="text/xml">
      <${p}alert${ns}>
        ${t('identifier', id)}${t('sender', 'CENAD-SEDEC')}${t('sent', onset)}
        ${t('status', status)}${t('msgType', msgType)}${t('scope', 'Public')}
        ${references ? t('references', references) : ''}
        <${p}info>
          ${t('language', 'pt-BR')}${t('category', 'Met')}${t('event', 'CHUVAS INTENSAS')}
          ${t('severity', severity)}${t('onset', onset)}${expires ? t('expires', expires) : ''}
          ${t('senderName', 'Defesa Civil Estadual de São Paulo')}${t('headline', headline)}
          ${t('description', 'Chuva na região.')}${t('instruction', 'Ligue 199.')}
          ${t('web', 'https://www.gov.br/mdr')}
          <${p}parameter>${t('valueName', 'CHANNEL-LIST')}${t('value', 'Google')}</${p}parameter>
          <${p}area>
            ${t('areaDesc', areaDesc)}
            ${poligonos.map((x) => t('polygon', x)).join('\n            ')}
            ${ibges.map((g) => `<${p}geocode>${t('valueName', 'IBGE')}${t('value', g)}</${p}geocode>`).join('')}
          </${p}area>
        </${p}info>
      </${p}alert>
    </content>
  </entry>`;
}

function idapFalso(entradas) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <title>Rss Idap</title>
  ${entradas.join('\n')}
</feed>`;
}

// Polígono de Cajati (aprox.): ponto dentro = (-24.73, -48.12).
const ANEL_CAJATI = anelTexto(-24.9, -48.3, -24.6, -47.9, 400); // 1.601 vértices
const IDAP_PADRAO = idapFalso([
  entradaCap({ id: '100/2026', ibges: [SP_CAPITAL, '3509502'], poligonos: [anelTexto(-23.7, -46.8, -23.4, -46.4)] }),
  entradaCap({ id: '101/2026', p: 'ns2:', poligonos: [ANEL_CAJATI], severity: 'Extreme' }),
  entradaCap({ id: '102/2026', poligonos: [anelTexto(-23, -43.5, -22.7, -43.1)], areaDesc: 'RIO DE JANEIRO/RJ', severity: 'Moderate' }),
  entradaCap({ id: '103/2026', ibges: [SP_CAPITAL], expires: '2026-10-01T11:00:00-03:00' }), // expirado
  entradaCap({ id: '104/2026', ibges: [SP_CAPITAL] }), // cancelado pelo 105
  entradaCap({ id: '105/2026', msgType: 'Cancel', references: 'CENAD-SEDEC,104/2026,2026-10-01T10:00:00-03:00' }),
  entradaCap({ id: '106/2026', ibges: [SP_CAPITAL], status: 'Exercise' }),
  entradaCap({ id: '107/2026', ibges: [], poligonos: [] }), // sem área útil
]);

// ─── KV e fetch de mentira ─────────────────────────────────────────────────
function kvFalso() {
  const dados = new Map();
  const kv = {
    dados,
    gets: 0,
    puts: [],
    async get(chave, opts) {
      kv.gets++;
      const v = dados.get(chave);
      if (v === undefined) return null;
      return opts && opts.type === 'json' ? JSON.parse(v) : v;
    },
    async put(chave, valor, opts) {
      kv.puts.push({ chave, opts });
      dados.set(chave, valor);
    },
  };
  return kv;
}

function respostaFalsa(status, corpo) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return typeof corpo === 'string' ? corpo : JSON.stringify(corpo); },
    async arrayBuffer() {
      const b = Buffer.from(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
  };
}

function fetchFalso(rotas) {
  const chamadas = [];
  const fn = async (url, init) => {
    chamadas.push({ url, init });
    const r = rotas[url];
    if (r instanceof Error) throw r;
    return r || respostaFalsa(404, 'nada');
  };
  fn.chamadas = chamadas;
  return fn;
}

const ENV_BASE = { ALERTAS_MODE: 'production' };

async function consultar(env, qs, { metodo = 'GET', agora = AGORA } = {}) {
  const url = new URL(`https://diagnostico.olliorcamentos.online/alertas?${qs}`);
  const req = new Request(url, { method: metodo, headers: { 'CF-Connecting-IP': '203.0.113.9' } });
  const r = await handleAlertas(req, env, url, { agora: () => agora });
  return { status: r.status, corpo: await r.json() };
}

/** KV já preenchido pelo cron com INMET ok + IDAP com o status pedido. */
async function kvPreenchido({ inmet = 200, idap = 200, quando = AGORA } = {}) {
  const kv = kvFalso();
  const fetchFn = fetchFalso({
    [INMET_URL]: respostaFalsa(inmet, inmetFalso()),
    [IDAP_URL]: respostaFalsa(idap, IDAP_PADRAO),
  });
  await processarAlertas({ ...ENV_BASE, CACHE: kv }, { fetch: fetchFn, now: () => new Date(quando) });
  return kv;
}

console.log('\n1) validação');
await caso('IBGE: 7 dígitos com UF válida', () => {
  assert.equal(validarIbge(SP_CAPITAL), SP_CAPITAL);
  assert.equal(validarIbge(' 3304557 '), RIO);
  assert.equal(validarIbge('9999999'), null); // UF 99 não existe
  assert.equal(validarIbge('355030'), null);
  assert.equal(validarIbge('35503080'), null);
  assert.equal(validarIbge(null), null);
});
await caso('níveis: INMET e CAP; desconhecido NÃO vira amarelo', () => {
  assert.equal(nivelInmet('Perigo Potencial'), 'amarelo');
  assert.equal(nivelInmet('Perigo'), 'laranja');
  assert.equal(nivelInmet('Grande Perigo'), 'vermelho');
  assert.equal(nivelInmet('???'), 'desconhecido');
  assert.equal(nivelCap('Extreme'), 'vermelho');
  assert.equal(nivelCap('Severe'), 'laranja');
  assert.equal(nivelCap('Moderate'), 'amarelo');
  assert.equal(nivelCap('Minor'), 'amarelo');
  assert.equal(nivelCap('Unknown'), 'desconhecido');
});
await caso('horário do INMET é de Brasília → ISO -03:00', () => {
  assert.equal(horaInmetIso('2026-10-01 11:28'), '2026-10-01T11:28:00-03:00');
  assert.equal(horaInmetIso('ontem'), null);
});

console.log('\n2) INMET');
await caso('lê avisos, descarta encerrado e data ruim, filtra IBGE inválido', () => {
  const r = lerInmet(inmetFalso());
  assert.deepEqual(r.avisos.map((a) => a.id), ['inmet:55916', 'inmet:55920']);
  const a = r.avisos[0];
  assert.equal(a.fonte, 'inmet');
  assert.equal(a.nivel, 'laranja');
  assert.equal(a.inicio, '2026-10-01T09:00:00-03:00');
  assert.equal(a.fim, '2026-10-01T23:59:00-03:00');
  assert.deepEqual(a.ibges, [SP_CAPITAL, '3509502']);
  assert.deepEqual(a.ufs, ['35']);
  assert.equal(a.link, 'https://avisos.inmet.gov.br/55916');
  assert.equal(a.descricao, 'Chuva entre 30 e 60 mm/h.');
  assert.equal(r.avisos[1].nivel, 'vermelho');
  assert.ok(!JSON.stringify(r).includes('base64'), 'o ícone base64 não vai para o KV');
});
await caso('polígono GeoJSON [lon,lat] vira [lat,lon] e bbox', () => {
  const r = lerInmet(inmetFalso());
  assert.deepEqual(r.avisos[0].bbox, [-24, -47, -23, -46]);
  const partes = r.poligonos['inmet:55916'];
  assert.equal(pontoNasPartes(partes, -23.5, -46.5), true);
  assert.equal(pontoNasPartes(partes, -22.5, -46.5), false);
});
await caso('formato inesperado = null (indisponível), nunca lista vazia', () => {
  assert.equal(lerInmet(null), null);
  assert.equal(lerInmet({ hoje: 'x', futuro: [] }), null);
  assert.deepEqual(lerInmet({ hoje: [], futuro: [] }).avisos, []); // feed ok e sem aviso: isto SIM é "sem alertas"
});

console.log('\n3) Defesa Civil (IDAP)');
await caso('lê CAP com e sem prefixo; Cancel, Exercise, expirado e sem área ficam fora', () => {
  const r = lerIdap(IDAP_PADRAO, AGORA);
  assert.deepEqual(r.avisos.map((a) => a.id), ['defesa_civil:100/2026', 'defesa_civil:101/2026', 'defesa_civil:102/2026']);
  const [a, b, c] = r.avisos;
  assert.deepEqual(a.ibges, [SP_CAPITAL, '3509502']);
  assert.equal(a.nivel, 'laranja');
  assert.equal(a.titulo, 'Defesa Civil: chuva forte & raios'); // entidade XML decodificada
  assert.equal(a.area, 'SÃO PAULO/SP'); // UTF-8 preservado
  assert.equal(a.emissor, 'Defesa Civil Estadual de São Paulo');
  assert.deepEqual(b.ibges, []);
  assert.deepEqual(b.ufs, ['35']); // UF tirada do areaDesc
  assert.equal(b.nivel, 'vermelho');
  assert.deepEqual(c.ufs, ['33']);
  assert.equal(c.nivel, 'amarelo');
});
await caso('bytes e texto dão o mesmo resultado', () => {
  const deTexto = lerIdap(IDAP_PADRAO, AGORA);
  const deBytes = lerIdap(Buffer.from(IDAP_PADRAO, 'utf8'), AGORA);
  const deArrayBuffer = lerIdap(new TextEncoder().encode(IDAP_PADRAO).buffer, AGORA);
  assert.deepEqual(deBytes, deTexto);
  assert.deepEqual(deArrayBuffer, deTexto);
});
await caso('polígono de 1.601 vértices é amostrado e continua acertando o ponto', () => {
  const r = lerIdap(IDAP_PADRAO, AGORA);
  const partes = r.poligonos['defesa_civil:101/2026'];
  assert.ok(partes[0][0].length / 2 <= ALERTAS_MAX_VERTICES + 3, `vértices: ${partes[0][0].length / 2}`);
  assert.equal(pontoNasPartes(partes, -24.73, -48.12), true);
  assert.equal(pontoNasPartes(partes, -23.55, -46.63), false);
});
await caso('não é o feed esperado = null', () => {
  assert.equal(lerIdap('<html><body>manutenção</body></html>', AGORA), null);
  assert.equal(lerIdap('', AGORA), null);
});

console.log('\n4) geometria');
await caso('amostragem guarda primeiro e último vértice e respeita o teto', () => {
  const anel = amostrarAnelCap(anelTexto(-10, -10, 10, 10, 2500));
  assert.ok(anel.length / 2 <= ALERTAS_MAX_VERTICES + 3);
  assert.deepEqual(anel.slice(0, 2), [-10, -10]);
  assert.deepEqual(anel.slice(-2), [-10, -10]);
  assert.equal(amostrarAnelCap('1,2 3,4'), null); // menos de 3 vértices não é anel
  assert.equal(amostrarAnelCap('lixo sem virgula'), null);
});
await caso('ponto-no-polígono respeita buraco', () => {
  const externo = [0, 0, 0, 10, 10, 10, 10, 0, 0, 0];
  const buraco = [4, 4, 4, 6, 6, 6, 6, 4, 4, 4];
  assert.equal(pontoNasPartes([[externo, buraco]], 2, 2), true);
  assert.equal(pontoNasPartes([[externo, buraco]], 5, 5), false);
  assert.equal(pontoNasPartes([[externo]], 5, 5), true);
});

console.log('\n5) cron');
await caso('desligado e sem KV não chamam rede', async () => {
  const fetchFn = fetchFalso({});
  assert.deepEqual(await processarAlertas({ ALERTAS_MODE: 'off', CACHE: kvFalso() }, { fetch: fetchFn }), { estado: 'desligado' });
  assert.deepEqual(await processarAlertas({}, { fetch: fetchFn }), { estado: 'desligado' });
  assert.deepEqual(await processarAlertas({ ...ENV_BASE }, { fetch: fetchFn }), { estado: 'sem_kv' });
  assert.equal(fetchFn.chamadas.length, 0);
});
await caso('grava índice + polígonos; feed fora grava indisponivel SEM avisos', async () => {
  const kv = kvFalso();
  const fetchFn = fetchFalso({ [INMET_URL]: respostaFalsa(200, inmetFalso()), [IDAP_URL]: respostaFalsa(502, 'Bad Gateway') });
  const r = await processarAlertas({ ...ENV_BASE, CACHE: kv }, { fetch: fetchFn, now: () => new Date(AGORA) });
  assert.deepEqual(r, { estado: 'processado', fontes: { inmet: 'ok:2', defesa_civil: 'indisponivel:http_502' } });
  const inmet = JSON.parse(kv.dados.get(chaveIndice('inmet')));
  assert.equal(inmet.estado, 'ok');
  assert.equal(inmet.avisos.length, 2);
  const pol = JSON.parse(kv.dados.get(chavePoligonos('inmet')));
  assert.equal(pol.geradoEm, inmet.geradoEm);
  const idap = JSON.parse(kv.dados.get(chaveIndice('defesa_civil')));
  assert.equal(idap.estado, 'indisponivel');
  assert.equal(idap.motivo, 'http_502');
  assert.deepEqual(idap.avisos, []);
  assert.ok(kv.puts.every((p) => p.opts && p.opts.expirationTtl > 0), 'toda chave tem TTL');
  assert.equal(fetchFn.chamadas[0].init.headers['User-Agent'], ALERTAS_USER_AGENT);
  // Polígonos são gravados ANTES do índice.
  const ordem = kv.puts.map((p) => p.chave);
  assert.ok(ordem.indexOf(chavePoligonos('inmet')) < ordem.indexOf(chaveIndice('inmet')));
});
await caso('cada cron coleta só a sua fonte', async () => {
  const kv = kvFalso();
  const fetchFn = fetchFalso({ [IDAP_URL]: respostaFalsa(200, IDAP_PADRAO) });
  const r = await processarAlertas({ ...ENV_BASE, CACHE: kv }, { fonte: 'defesa_civil', fetch: fetchFn, now: () => new Date(AGORA) });
  assert.deepEqual(r.fontes, { defesa_civil: 'ok:3' });
  assert.deepEqual(fetchFn.chamadas.map((c) => c.url), [IDAP_URL]);
});
await caso('rede caindo e JSON quebrado também viram indisponivel', async () => {
  const kv = kvFalso();
  const fetchFn = fetchFalso({ [INMET_URL]: respostaFalsa(200, '{quebrado'), [IDAP_URL]: new TypeError('fetch failed') });
  const r = await processarAlertas({ ...ENV_BASE, CACHE: kv }, { fetch: fetchFn, now: () => new Date(AGORA) });
  assert.deepEqual(r.fontes, { inmet: 'indisponivel:formato_inesperado', defesa_civil: 'indisponivel:rede' });
});

console.log('\n6) rota GET /alertas');
await caso('método, IBGE e coordenadas validados antes do KV', async () => {
  limparMemoAlertas();
  const kv = await kvPreenchido();
  const env = { ...ENV_BASE, CACHE: kv };
  kv.gets = 0;
  assert.equal((await consultar(env, `ibge=${SP_CAPITAL}`, { metodo: 'POST' })).status, 405);
  assert.equal((await consultar(env, 'ibge=123')).corpo.motivo, 'ibge_invalido');
  assert.equal((await consultar(env, `ibge=${SP_CAPITAL}&lat=-23.5`)).corpo.motivo, 'coordenadas_invalidas');
  assert.equal((await consultar(env, `ibge=${SP_CAPITAL}&lat=0&lon=0`)).status, 400);
  assert.equal(kv.gets, 0);
});
await caso('desligado (modo off ou sem KV) diz que está desligado', async () => {
  limparMemoAlertas();
  const a = await consultar({ ALERTAS_MODE: 'off', CACHE: kvFalso() }, `ibge=${SP_CAPITAL}`);
  assert.equal(a.status, 503);
  assert.equal(a.corpo.motivo, 'alertas_desligados');
  const b = await consultar({ ...ENV_BASE }, `ibge=${SP_CAPITAL}`);
  assert.equal(b.corpo.motivo, 'alertas_desligados');
});
await caso('KV vazio (cron nunca rodou) = 503 indisponível, nunca "sem alertas"', async () => {
  limparMemoAlertas();
  const r = await consultar({ ...ENV_BASE, CACHE: kvFalso() }, `ibge=${SP_CAPITAL}`);
  assert.equal(r.status, 503);
  assert.equal(r.corpo.ok, false);
  assert.equal(r.corpo.motivo, 'alertas_indisponiveis');
  assert.equal(r.corpo.fontes.inmet.estado, 'indisponivel');
  assert.equal(r.corpo.fontes.defesaCivil.motivo, 'sem_dados');
});
await caso('tudo ok: avisos do município, ordenados por nível, sem dados internos', async () => {
  limparMemoAlertas();
  const kv = await kvPreenchido();
  const r = await consultar({ ...ENV_BASE, CACHE: kv }, `ibge=${SP_CAPITAL}`);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.ok, true);
  assert.equal(r.corpo.estado, 'ok');
  assert.equal(r.corpo.atribuicao, ALERTAS_ATRIBUICAO);
  // Vermelho primeiro; no mesmo nível, o que começa antes.
  assert.deepEqual(r.corpo.avisos.map((a) => a.id), ['inmet:55920', 'inmet:55916', 'defesa_civil:100/2026']);
  assert.equal(r.corpo.avisos[0].emVigor, false); // amanhã
  assert.equal(r.corpo.avisos[1].emVigor, true);
  assert.equal(r.corpo.avisos[2].conferidoPor, 'municipio');
  for (const a of r.corpo.avisos) {
    assert.equal(a.ibges, undefined);
    assert.equal(a.bbox, undefined);
    assert.equal(a.ufs, undefined);
  }
  // Alerta só-polígono em SP (Cajati) sem lat/lon: não some, vira "não conferido".
  assert.deepEqual(r.corpo.naoConferidos, { defesaCivil: 1 });
  assert.equal(r.corpo.pontoConferido, false);
});
await caso('com lat/lon: só-polígono entra se o ponto está dentro', async () => {
  limparMemoAlertas();
  const kv = await kvPreenchido();
  const env = { ...ENV_BASE, CACHE: kv };
  const dentro = await consultar(env, `ibge=${CAJATI}&lat=-24.73&lon=-48.12`);
  assert.deepEqual(dentro.corpo.avisos.map((a) => [a.id, a.conferidoPor]), [['defesa_civil:101/2026', 'poligono']]);
  assert.deepEqual(dentro.corpo.naoConferidos, {});
  const fora = await consultar(env, `ibge=${CAJATI}&lat=-23.0&lon=-48.12`);
  assert.deepEqual(fora.corpo.avisos, []);
  assert.deepEqual(fora.corpo.naoConferidos, {});
  assert.equal(fora.corpo.estado, 'ok'); // aqui "sem alertas" é verdade: fontes ok e ponto conferido
});
await caso('polígonos de outra rodada (gravação pela metade) = não conferido', async () => {
  limparMemoAlertas();
  const kv = await kvPreenchido();
  const pol = JSON.parse(kv.dados.get(chavePoligonos('defesa_civil')));
  pol.geradoEm = '2026-09-30T00:00:00.000Z';
  kv.dados.set(chavePoligonos('defesa_civil'), JSON.stringify(pol));
  const r = await consultar({ ...ENV_BASE, CACHE: kv }, `ibge=${CAJATI}&lat=-24.73&lon=-48.12`);
  assert.deepEqual(r.corpo.avisos, []);
  assert.deepEqual(r.corpo.naoConferidos, { defesaCivil: 1 });
});
await caso('Defesa Civil fora: parcial (a tela não pode dizer "sem alertas")', async () => {
  limparMemoAlertas();
  const kv = await kvPreenchido({ idap: 500 });
  const r = await consultar({ ...ENV_BASE, CACHE: kv }, `ibge=${RIO}`);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.estado, 'parcial');
  assert.deepEqual(r.corpo.avisos, []);
  assert.equal(r.corpo.fontes.inmet.estado, 'ok');
  assert.equal(r.corpo.fontes.defesaCivil.estado, 'indisponivel');
  assert.equal(r.corpo.fontes.defesaCivil.motivo, 'http_500');
});
await caso('as duas fontes fora: 503', async () => {
  limparMemoAlertas();
  const kv = await kvPreenchido({ inmet: 503, idap: 500 });
  const r = await consultar({ ...ENV_BASE, CACHE: kv }, `ibge=${SP_CAPITAL}`);
  assert.equal(r.status, 503);
  assert.equal(r.corpo.motivo, 'alertas_indisponiveis');
});
await caso('índice velho (cron parado) = indisponível', async () => {
  limparMemoAlertas();
  const kv = await kvPreenchido({ quando: AGORA - ALERTAS_VALIDADE_MS - 60_000 });
  const r = await consultar({ ...ENV_BASE, CACHE: kv }, `ibge=${SP_CAPITAL}`);
  assert.equal(r.status, 503);
  assert.equal(r.corpo.fontes.inmet.motivo, 'desatualizado');
});
await caso('aviso vencido sai da resposta', async () => {
  limparMemoAlertas();
  const kv = await kvPreenchido();
  const depois = Date.parse('2026-10-02T00:30:00-03:00'); // 55916 venceu às 23:59; 55920 ainda vem
  const ind = JSON.parse(kv.dados.get(chaveIndice('inmet')));
  ind.atualizadoEm = new Date(depois).toISOString();
  kv.dados.set(chaveIndice('inmet'), JSON.stringify(ind));
  const idap = JSON.parse(kv.dados.get(chaveIndice('defesa_civil')));
  idap.atualizadoEm = new Date(depois).toISOString();
  kv.dados.set(chaveIndice('defesa_civil'), JSON.stringify(idap));
  const r = await consultar({ ...ENV_BASE, CACHE: kv }, `ibge=${SP_CAPITAL}`, { agora: depois });
  assert.deepEqual(r.corpo.avisos.map((a) => a.id), ['inmet:55920']);
});
await caso('memória do isolate: 2ª consulta não lê o KV nem gasta balde', async () => {
  limparMemoAlertas();
  const kv = await kvPreenchido();
  let baldes = 0;
  const env = { ...ENV_BASE, CACHE: kv, ALERTAS_RL: { async limit() { baldes++; return { success: true }; } } };
  kv.gets = 0;
  await consultar(env, `ibge=${SP_CAPITAL}`);
  const lidos = kv.gets;
  await consultar(env, `ibge=${RIO}`);
  assert.equal(kv.gets, lidos);
  assert.equal(baldes, 1);
});
await caso('limite por IP estourado = 429', async () => {
  limparMemoAlertas();
  const kv = await kvPreenchido();
  const env = { ...ENV_BASE, CACHE: kv, ALERTAS_RL: { async limit() { return { success: false }; } } };
  const r = await consultar(env, `ibge=${SP_CAPITAL}`);
  assert.equal(r.status, 429);
});
await caso('KV falhando na leitura = indisponível (e não fica na memória)', async () => {
  limparMemoAlertas();
  const kv = { async get() { throw new Error('kv fora'); } };
  const r = await consultar({ ...ENV_BASE, CACHE: kv }, `ibge=${SP_CAPITAL}`);
  assert.equal(r.status, 503);
  assert.equal(r.corpo.fontes.inmet.motivo, 'armazenamento_falhou');
  const kv2 = await kvPreenchido();
  const r2 = await consultar({ ...ENV_BASE, CACHE: kv2 }, `ibge=${SP_CAPITAL}`);
  assert.equal(r2.status, 200);
});

console.log('\n7) amarração com wrangler.jsonc e index.js');
await caso('crons do wrangler.jsonc batem com ALERTAS_CRONS', () => {
  const wr = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const m = /"triggers"\s*:\s*\{\s*"crons"\s*:\s*\[([^\]]*)\]/.exec(wr);
  assert.ok(m, 'triggers.crons no wrangler.jsonc');
  const crons = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.ok(crons.includes('* * * * *'), 'o cron de minuto continua');
  const deAlertas = crons.filter((c) => fonteDoCron(c));
  assert.deepEqual(deAlertas.sort(), Object.keys(ALERTAS_CRONS).sort());
  assert.deepEqual(Object.values(ALERTAS_CRONS).sort(), ['defesa_civil', 'inmet']);
  assert.equal(fonteDoCron('* * * * *'), null);
  assert.equal(fonteDoCron(undefined), null);
  assert.ok(/"binding"\s*:\s*"CACHE"/.test(wr), 'binding KV CACHE declarado');
  assert.ok(/"ALERTAS_RL"/.test(wr), 'rate limit ALERTAS_RL declarado');
});
await caso('index.js: cron de alertas sai ANTES dos jobs do cron de minuto', () => {
  const idx = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const ini = idx.indexOf('scheduled(controller, env, ctx) {');
  const alerta = idx.indexOf('fonteDoCron(controller?.cron)', ini);
  const retorno = idx.indexOf('return;', alerta);
  const outbox = idx.indexOf('processarWelcomeOutbox(env)', ini);
  assert.ok(ini > 0 && alerta > ini && retorno > alerta && outbox > retorno);
  assert.ok(/url\.pathname === '\/alertas'/.test(idx));
});
await caso("tabela de métodos: GET /alertas", () => {
  assert.equal(metodosDaRota('/alertas'), 'GET');
});

console.log(`\n${ok} casos ok`);
