/**
 * Teste da ETIQUETA QR pública que vende (`src/pmoc.js`, rotas /q/<token> e /e/<token>).
 *
 *     node scripts/teste-etiqueta-qr.js   (de dentro de worker/)
 *
 * Protege: a página resolvida mostra a MARCA do prestador (logo só data-URI raster,
 * cor validada), a última manutenção e a próxima recomendada (datas da RPC; bloco
 * OMITIDO quando a RPC falha — nunca "sem manutenção" por erro), "Chamar no
 * WhatsApp" do prestador e o formulário "Pedir orçamento"; nenhum dado do cliente
 * final; selo "Feito com OLLI" só quando o dono é comprovadamente Grátis (erro ao
 * ler o plano = sem selo). O POST valida nome/WhatsApp/autorização, descarta robô
 * (campo-isca) sem gravar, respeita o teto por equipamento, devolve erro honesto
 * quando não grava e só grava o que a pessoa digitou + o dono do equipamento.
 * Token malformado não toca o banco.
 */
import assert from 'node:assert/strict';
import {
  diaPtBr,
  getResumoManutencao,
  logoPublica,
  PEDIDOS_POR_HORA_POR_EQUIPAMENTO,
  receberPedidoEtiqueta,
  renderEtiqueta,
  validarPedido,
} from '../src/pmoc.js';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok++;
  console.log(`  ok  ${nome}`);
}

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const DONO = '00000000-0000-4000-8000-00000000000a';
const ENV = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'chave-de-teste' };
const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

/** Banco de mentira: cada teste ajusta `cenario`; `chamadas` registra o que o worker pediu. */
let cenario;
let chamadas;
function reset(extra = {}) {
  chamadas = [];
  cenario = {
    asset: { id: 'eq-1', user_id: DONO, codigo_interno: 'AC-014', categoria: 'split', situacao: 'ativo', qr_revogado_em: null },
    assetStatus: 200,
    empresa: {
      nome: 'Frio & Cia',
      especialidade: 'Climatização',
      whatsapp: '(11) 98765-4321',
      corMarca: '#123ABC',
      logoUri: LOGO,
      // Campos que JAMAIS podem aparecer na página pública:
      cnpj: '12.345.678/0001-90',
      endereco: 'Rua Secreta, 99',
      chavePix: 'pix-secreto',
    },
    resumo: { status: 200, body: [{ ultima_manutencao: '2026-09-20T15:00:00+00:00', proxima_manutencao: '2026-10-31', proxima_origem: 'pmoc' }] },
    plano: { status: 200, body: 'gratis' },
    pedidosRecentes: 0,
    falhasScan: 0,
    insertStatus: 201,
    ...extra,
  };
}

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const metodo = (init.method || 'GET').toUpperCase();
  chamadas.push({ url: u, metodo, body: init.body });
  const json = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  if (u.includes('/rest/v1/assets?')) {
    return cenario.assetStatus === 200 ? json(cenario.asset ? [cenario.asset] : []) : json({}, cenario.assetStatus);
  }
  if (u.includes('/rest/v1/empresa?')) return json([{ dados: cenario.empresa }]);
  if (u.endsWith('/rpc/resumo_manutencao_equipamento')) return json(cenario.resumo.body, cenario.resumo.status);
  if (u.endsWith('/rpc/plano_comercial_para_usuario')) return json(cenario.plano.body, cenario.plano.status);
  if (u.includes('/rest/v1/qr_scan_events') && metodo === 'GET') return json([], 200, { 'content-range': `0-0/${cenario.falhasScan}` });
  if (u.includes('/rest/v1/qr_scan_events')) return new Response(null, { status: 201 });
  if (u.includes('/rest/v1/pedidos_orcamento_qr') && metodo === 'GET') {
    return json([], 200, { 'content-range': `0-0/${cenario.pedidosRecentes}` });
  }
  if (u.includes('/rest/v1/pedidos_orcamento_qr') && metodo === 'POST') return new Response(null, { status: cenario.insertStatus });
  throw new Error(`fetch inesperado: ${metodo} ${u}`);
};

const reqGet = () => new Request(`https://link.olliorcamentos.online/q/${TOKEN}`, { headers: { 'CF-Connecting-IP': '203.0.113.9' } });
const reqPost = (campos) =>
  new Request(`https://link.olliorcamentos.online/q/${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '203.0.113.9' },
    body: new URLSearchParams(campos).toString(),
  });
const VALIDO = { nome: 'Ana Lima', whatsapp: '(21) 99876-5432', mensagem: 'Está pingando', aceite: 'sim', site: '' };
const inserts = () => chamadas.filter((c) => c.url.includes('/pedidos_orcamento_qr') && c.metodo === 'POST');

console.log('\n1) peças puras');
await caso('dia em pt-BR: civil e ISO no fuso de Brasília', () => {
  assert.equal(diaPtBr('2026-10-31'), '31/10/2026');
  assert.equal(diaPtBr('2026-10-01T02:00:00Z'), '30/09/2026');
  assert.equal(diaPtBr('lixo'), '');
  assert.equal(diaPtBr(null), '');
});
await caso('logo pública: só data-URI raster e com teto de tamanho', () => {
  assert.equal(logoPublica({ logoUri: LOGO }), LOGO);
  assert.equal(logoPublica({ logoUri: 'https://evil.test/x.png' }), '');
  assert.equal(logoPublica({ logoUri: 'data:image/svg+xml;base64,PHN2Zz4=' }), '');
  assert.equal(logoPublica({ logoUri: `data:image/png;base64,${'A'.repeat(400_000)}` }), '');
  assert.equal(logoPublica(null), '');
});
await caso('validarPedido: normaliza o WhatsApp e exige autorização', () => {
  const v = validarPedido(VALIDO);
  assert.deepEqual(v, { ok: true, pedido: { nome: 'Ana Lima', telefone: '5521998765432', mensagem: 'Está pingando' } });
  assert.equal(validarPedido({ ...VALIDO, nome: ' a ' }).ok, false);
  assert.equal(validarPedido({ ...VALIDO, whatsapp: '1234' }).ok, false);
  assert.equal(validarPedido({ ...VALIDO, aceite: '' }).ok, false);
  assert.deepEqual(validarPedido({ ...VALIDO, site: 'http://spam' }), { ok: true, robo: true });
  const html = validarPedido({ ...VALIDO, mensagem: '<b>oi</b>\u0000' });
  assert.equal(html.pedido.mensagem, 'oi');
});
await caso('resumo: RPC fora do ar = indisponível (nunca "sem manutenção")', async () => {
  reset({ resumo: { status: 404, body: { code: 'PGRST202' } } });
  assert.deepEqual(await getResumoManutencao(ENV, 'eq-1'), { estado: 'indisponivel' });
  reset({ resumo: { status: 200, body: [{ ultima_manutencao: null, proxima_manutencao: null, proxima_origem: null }] } });
  assert.deepEqual(await getResumoManutencao(ENV, 'eq-1'), { estado: 'ok', ultima: null, proxima: null, proximaOrigem: null });
});

console.log('\n2) página pública (GET)');
await caso('mostra marca, datas, WhatsApp do prestador e o formulário', async () => {
  reset();
  const r = await renderEtiqueta(TOKEN, ENV, reqGet());
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<img class="hd-logo" src="data:image\/png;base64,iVBORw0KGgo="/);
  assert.match(html, /Frio &amp; Cia/);
  assert.match(html, /#123ABC/);
  assert.match(html, /Última manutenção<\/div><div class="manut-v">20\/09\/2026/);
  assert.match(html, /Próxima recomendada<\/div><div class="manut-v">31\/10\/2026<\/div><div class="manut-s">Plano de manutenção/);
  assert.match(html, /href="https:\/\/wa\.me\/5511987654321\?text=/);
  assert.match(html, /<form class="form" method="post" action="\/q\/AbCdEfGhIjKlMnOpQrStUvWxYz012345">/);
  assert.match(html, /name="site"/, 'campo-isca presente');
  assert.match(r.headers.get('Content-Security-Policy'), /form-action 'self'/);
});
await caso('NENHUM dado sensível do prestador/cliente vaza', async () => {
  reset();
  const html = await (await renderEtiqueta(TOKEN, ENV, reqGet())).text();
  for (const segredo of ['12.345.678/0001-90', 'Rua Secreta', 'pix-secreto', DONO, 'eq-1']) {
    assert.ok(!html.includes(segredo), `vazou: ${segredo}`);
  }
});
await caso('selo "Feito com OLLI" só no Grátis; Pro e erro de plano = sem selo', async () => {
  reset();
  assert.match(await (await renderEtiqueta(TOKEN, ENV, reqGet())).text(), /Feito com <b>OLLI<\/b>/);
  reset({ plano: { status: 200, body: 'pro' } });
  assert.ok(!(await (await renderEtiqueta(TOKEN, ENV, reqGet())).text()).includes('Feito com'));
  reset({ plano: { status: 500, body: {} } });
  assert.ok(!(await (await renderEtiqueta(TOKEN, ENV, reqGet())).text()).includes('Feito com'));
});
await caso('RPC indisponível: bloco de manutenção some (sem afirmar nada)', async () => {
  reset({ resumo: { status: 404, body: {} } });
  const html = await (await renderEtiqueta(TOKEN, ENV, reqGet())).text();
  assert.ok(!html.includes('Última manutenção'));
  assert.ok(!html.includes('Ainda sem registro'));
  assert.match(html, /Pedir orçamento/);
});
await caso('sem histórico: diz "sem registro" e "a combinar" (não inventa data)', async () => {
  reset({ resumo: { status: 200, body: [{ ultima_manutencao: null, proxima_manutencao: null, proxima_origem: null }] } });
  const html = await (await renderEtiqueta(TOKEN, ENV, reqGet())).text();
  assert.match(html, /Ainda sem registro nesta etiqueta/);
  assert.match(html, /A combinar/);
});
await caso('logo remota é ignorada e cai no símbolo', async () => {
  reset();
  cenario.empresa.logoUri = 'https://evil.test/logo.png';
  const html = await (await renderEtiqueta(TOKEN, ENV, reqGet())).text();
  assert.ok(!html.includes('evil.test'));
  assert.match(html, /class="hd-mark"/);
});
await caso('token malformado não toca assets', async () => {
  reset();
  const r = await renderEtiqueta('curto', ENV, reqGet());
  assert.equal(r.status, 404);
  assert.ok(!chamadas.some((c) => c.url.includes('/rest/v1/assets?')));
});

console.log('\n3) pedido de orçamento (POST)');
await caso('pedido válido grava SÓ o digitado + dono/equipamento e confirma', async () => {
  reset();
  const r = await receberPedidoEtiqueta(TOKEN, ENV, reqPost(VALIDO));
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Pedido enviado/);
  assert.equal(inserts().length, 1);
  assert.deepEqual(JSON.parse(inserts()[0].body), {
    user_id: DONO, asset_id: 'eq-1', nome: 'Ana Lima', telefone: '5521998765432', mensagem: 'Está pingando',
  });
});
await caso('robô (campo-isca) recebe "enviado" e nada é gravado', async () => {
  reset();
  const r = await receberPedidoEtiqueta(TOKEN, ENV, reqPost({ ...VALIDO, site: 'http://spam.test' }));
  assert.equal(r.status, 200);
  assert.equal(inserts().length, 0);
});
await caso('WhatsApp inválido: 400, formulário aberto com o erro e o que já foi digitado', async () => {
  reset();
  const r = await receberPedidoEtiqueta(TOKEN, ENV, reqPost({ ...VALIDO, whatsapp: '123' }));
  assert.equal(r.status, 400);
  const html = await r.text();
  assert.match(html, /<details class="pedido" open>/);
  assert.match(html, /Confira o WhatsApp/);
  assert.match(html, /value="Ana Lima"/);
  assert.equal(inserts().length, 0);
});
await caso(`teto de ${PEDIDOS_POR_HORA_POR_EQUIPAMENTO} pedidos/hora por equipamento`, async () => {
  reset({ pedidosRecentes: PEDIDOS_POR_HORA_POR_EQUIPAMENTO });
  const r = await receberPedidoEtiqueta(TOKEN, ENV, reqPost(VALIDO));
  assert.equal(r.status, 429);
  assert.match(await r.text(), /vários pedidos/);
  assert.equal(inserts().length, 0);
});
await caso('falha ao gravar (ex.: migration ausente): 503 honesto, nunca "enviado"', async () => {
  reset({ insertStatus: 404 });
  const r = await receberPedidoEtiqueta(TOKEN, ENV, reqPost(VALIDO));
  assert.equal(r.status, 503);
  const html = await r.text();
  assert.ok(!html.includes('Pedido enviado'));
  assert.match(html, /Não consegui registrar o pedido/);
});
await caso('etiqueta revogada/inexistente não aceita pedido', async () => {
  reset({ asset: null });
  const r = await receberPedidoEtiqueta(TOKEN, ENV, reqPost(VALIDO));
  assert.equal(r.status, 404);
  assert.equal(inserts().length, 0);
});
const scansFalhos = () => chamadas.filter((c) => c.url.includes('/qr_scan_events') && c.metodo === 'POST' && JSON.parse(c.body).resolvido === false);
await caso('POST com token inexistente registra a tentativa (conta no anti-enumeração)', async () => {
  reset({ asset: null });
  await receberPedidoEtiqueta(TOKEN, ENV, reqPost(VALIDO));
  assert.equal(scansFalhos().length, 1);
});
await caso('POST respeita o teto anti-enumeração do GET (429 sem tocar assets)', async () => {
  reset({ falhasScan: 99 });
  const r = await receberPedidoEtiqueta(TOKEN, ENV, reqPost(VALIDO));
  assert.equal(r.status, 429);
  assert.ok(!chamadas.some((c) => c.url.includes('/rest/v1/assets?')));
  assert.equal(inserts().length, 0);
});
await caso('corpo grande demais é recusado sem gravar', async () => {
  reset();
  const r = await receberPedidoEtiqueta(TOKEN, ENV, reqPost({ ...VALIDO, mensagem: 'x'.repeat(6000) }));
  assert.equal(r.status, 413);
  assert.equal(inserts().length, 0);
});

console.log(`\n${ok} casos ok`);
