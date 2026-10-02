/**
 * Teste da CONFIRMAÇÃO DE VÉSPERA pública (`src/confirmacaoVisita.js`, rota /v/<token>).
 *
 *     node scripts/teste-confirmacao-visita.js   (de dentro de worker/)
 *
 * Protege: GET não grava nada (a prévia do WhatsApp faz GET); a página mostra a
 * marca do prestador, o dia/hora em Brasília e o serviço — NUNCA nome, endereço,
 * telefone ou valor do cliente; token malformado nem toca o banco; inexistente =
 * genérica 404; expirado = 410 com o WhatsApp do prestador; banco fora = 503
 * "não consegui" (nunca "cancelada"); visita cancelada na agenda = "alterada"; o
 * POST grava só 'confirmada'/'remarcar' com filtro de expiração no próprio PATCH;
 * resposta inválida = 400 sem gravar.
 */
import assert from 'node:assert/strict';
import {
  quandoDaVisita,
  renderConfirmacao,
  respostaParaStatus,
  responderConfirmacao,
  tokenConfirmacaoValido,
} from '../src/confirmacaoVisita.js';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok++;
  console.log(`  ok  ${nome}`);
}

const TOKEN = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef';
const DONO = '00000000-0000-4000-8000-00000000000a';
const ENV = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'chave-de-teste' };
const AMANHA_14H = new Date(Date.now() + 86_400_000);

let cenario;
let chamadas;
function reset(extra = {}) {
  chamadas = [];
  cenario = {
    linha: {
      id: 'c1', user_id: DONO, agendamento_id: 'ag-1', ocorrencia_dia: '2026-10-02',
      inicio: AMANHA_14H.toISOString(), servico: 'Limpeza do split', status: 'pendente',
      respondido_em: null, expira_em: new Date(Date.now() + 2 * 86_400_000).toISOString(), revogado_em: null,
    },
    linhaStatus: 200,
    agenda: [{ status: 'agendado', excluido_em: null, recorrencia: null }],
    empresa: {
      nome: 'Frio & Cia', especialidade: 'Climatização', whatsapp: '(11) 98765-4321', corMarca: '#123ABC',
      cnpj: '12.345.678/0001-90', endereco: 'Rua Secreta, 99', chavePix: 'pix-secreto',
    },
    patchStatus: 200,
    patchVazio: false,
    ...extra,
  };
}

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const metodo = (init.method || 'GET').toUpperCase();
  chamadas.push({ url: u, metodo, body: init.body });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (u.includes('/rest/v1/agendamentos_confirmacao') && metodo === 'GET') {
    if (cenario.linhaStatus !== 200) return json({}, cenario.linhaStatus);
    return json(cenario.linha ? [cenario.linha] : []);
  }
  if (u.includes('/rest/v1/agendamentos_confirmacao') && metodo === 'PATCH') {
    if (cenario.patchStatus !== 200) return json({}, cenario.patchStatus);
    if (cenario.patchVazio) return json([]);
    const corpo = JSON.parse(init.body);
    return json([{ ...cenario.linha, ...corpo }]);
  }
  if (u.includes('/rest/v1/agendamentos?')) return json(cenario.agenda);
  if (u.includes('/rest/v1/empresa?')) return json([{ dados: cenario.empresa }]);
  throw new Error(`fetch inesperado: ${metodo} ${u}`);
};

const reqPost = (campos) =>
  new Request(`https://link.olliorcamentos.online/v/${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(campos).toString(),
  });
const patches = () => chamadas.filter((c) => c.metodo === 'PATCH');

console.log('\n1) peças puras');
await caso('token: só 64 hex minúsculos', () => {
  assert.equal(tokenConfirmacaoValido(TOKEN), true);
  assert.equal(tokenConfirmacaoValido(TOKEN.toUpperCase()), false);
  assert.equal(tokenConfirmacaoValido('abc'), false);
  assert.equal(tokenConfirmacaoValido(`${TOKEN}0`), false);
  assert.equal(tokenConfirmacaoValido(null), false);
});
await caso('resposta → status (o resto é recusado)', () => {
  assert.equal(respostaParaStatus('confirmo'), 'confirmada');
  assert.equal(respostaParaStatus('remarcar'), 'remarcar');
  assert.equal(respostaParaStatus('pendente'), null);
  assert.equal(respostaParaStatus(undefined), null);
});
await caso('quando: fuso de Brasília e "amanhã"/"hoje" relativos', () => {
  const agora = Date.parse('2026-10-01T20:00:00Z'); // 17h em Brasília
  assert.equal(quandoDaVisita('2026-10-02T17:00:00Z', agora), 'amanhã, sexta-feira, 2 de outubro, às 14:00');
  assert.equal(quandoDaVisita('2026-10-01T22:30:00Z', agora), 'hoje, quinta-feira, 1 de outubro, às 19:30');
  // 01h UTC do dia 3 = 22h do dia 2 em Brasília
  assert.equal(quandoDaVisita('2026-10-03T01:00:00Z', agora), 'amanhã, sexta-feira, 2 de outubro, às 22:00');
  assert.equal(quandoDaVisita('2026-10-10T12:00:00Z', agora), 'sábado, 10 de outubro, às 09:00');
  assert.equal(quandoDaVisita('lixo', agora), '');
});

console.log('\n2) GET /v/<token>');
await caso('página válida: marca, dia, serviço e os dois botões — sem dado do cliente', async () => {
  reset();
  const r = await renderConfirmacao(TOKEN, ENV);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /Frio &amp; Cia/);
  assert.match(html, /Limpeza do split/);
  assert.match(html, /Confirmo/);
  assert.match(html, /Preciso remarcar/);
  assert.match(html, /name="resposta" value="confirmo"/);
  for (const proibido of ['12.345.678', 'Rua Secreta', 'pix-secreto', 'ag-1', DONO]) assert.ok(!html.includes(proibido), proibido);
  assert.match(r.headers.get('content-security-policy') || '', /default-src 'none'/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
await caso('GET NÃO grava nada (a prévia do WhatsApp também faz GET)', async () => {
  reset();
  await renderConfirmacao(TOKEN, ENV);
  assert.equal(chamadas.filter((c) => c.metodo !== 'GET').length, 0);
});
await caso('já respondeu: mostra a resposta e deixa mudar', async () => {
  reset();
  cenario.linha = { ...cenario.linha, status: 'confirmada', respondido_em: new Date().toISOString() };
  const html = await (await renderConfirmacao(TOKEN, ENV)).text();
  assert.match(html, /já confirmou/);
  assert.match(html, /Preciso remarcar/);
});
await caso('token malformado: 404 genérica sem tocar o banco', async () => {
  reset();
  const r = await renderConfirmacao('nao-e-token', ENV);
  assert.equal(r.status, 404);
  assert.equal(chamadas.length, 0);
});
await caso('inexistente/revogado: 404 genérica', async () => {
  reset({ linha: null });
  const r = await renderConfirmacao(TOKEN, ENV);
  assert.equal(r.status, 404);
  assert.match(await r.text(), /Link inválido/);
});
await caso('banco fora: 503 "não consegui" (nunca "cancelada")', async () => {
  reset({ linhaStatus: 500 });
  const r = await renderConfirmacao(TOKEN, ENV);
  assert.equal(r.status, 503);
  const html = await r.text();
  assert.match(html, /Não consegui carregar/);
  assert.ok(!html.includes('alterada'));
});
await caso('expirado: 410 com o WhatsApp oficial (wa.me) do prestador', async () => {
  reset();
  cenario.linha = { ...cenario.linha, expira_em: new Date(Date.now() - 1000).toISOString() };
  const r = await renderConfirmacao(TOKEN, ENV);
  assert.equal(r.status, 410);
  const html = await r.text();
  assert.match(html, /expirou/);
  assert.match(html, /https:\/\/wa\.me\/5511987654321/);
});
await caso('visita cancelada na agenda do prestador: "alterada", sem botões', async () => {
  reset({ agenda: [{ status: 'cancelado', excluido_em: null, recorrencia: null }] });
  const html = await (await renderConfirmacao(TOKEN, ENV)).text();
  assert.match(html, /foi alterada/);
  assert.ok(!html.includes('value="confirmo"'));
});
await caso('agenda ainda não sincronizada (sem linha): segue normal', async () => {
  reset({ agenda: [] });
  const html = await (await renderConfirmacao(TOKEN, ENV)).text();
  assert.match(html, /value="confirmo"/);
});

console.log('\n3) POST /v/<token>');
await caso('confirmo grava confirmada com filtro de expiração no PATCH', async () => {
  reset();
  const r = await responderConfirmacao(TOKEN, ENV, reqPost({ resposta: 'confirmo' }));
  assert.equal(r.status, 200);
  const htmlOk = await r.text();
  assert.match(htmlOk, /Visita confirmada/);
  assert.match(htmlOk, /foi registrada/);
  assert.ok(!/já sabe/.test(htmlOk));
  assert.equal(patches().length, 1);
  assert.match(patches()[0].url, /expira_em=gt\./);
  assert.match(patches()[0].url, /revogado_em=is\.null/);
  const corpo = JSON.parse(patches()[0].body);
  assert.equal(corpo.status, 'confirmada');
  assert.ok(corpo.respondido_em);
  assert.deepEqual(Object.keys(corpo).sort(), ['atualizado_em', 'respondido_em', 'status']);
});
await caso('remarcar grava remarcar e oferece combinar pelo WhatsApp oficial', async () => {
  reset();
  const html = await (await responderConfirmacao(TOKEN, ENV, reqPost({ resposta: 'remarcar' }))).text();
  assert.equal(JSON.parse(patches()[0].body).status, 'remarcar');
  assert.match(html, /remarcação registrado/);
  // Ninguém é "avisado" na hora: a resposta aparece no app do prestador no sync.
  assert.ok(!/foi avisado|já sabe/.test(html));
  assert.match(html, /wa\.me\/5511987654321/);
});
await caso('resposta inválida: 400, nada gravado', async () => {
  reset();
  const r = await responderConfirmacao(TOKEN, ENV, reqPost({ resposta: 'pendente' }));
  assert.equal(r.status, 400);
  assert.equal(patches().length, 0);
});
await caso('expirou entre o GET e o POST: 410, nada gravado', async () => {
  reset();
  cenario.linha = { ...cenario.linha, expira_em: new Date(Date.now() - 1000).toISOString() };
  const r = await responderConfirmacao(TOKEN, ENV, reqPost({ resposta: 'confirmo' }));
  assert.equal(r.status, 410);
  assert.equal(patches().length, 0);
});
await caso('PATCH não achou a linha (expirou no meio): 410, nunca "confirmada"', async () => {
  reset({ patchVazio: true });
  const r = await responderConfirmacao(TOKEN, ENV, reqPost({ resposta: 'confirmo' }));
  assert.equal(r.status, 410);
  assert.ok(!(await r.text()).includes('Visita confirmada'));
});
await caso('falha ao gravar: 503 com a página e o erro honesto', async () => {
  reset({ patchStatus: 500 });
  const r = await responderConfirmacao(TOKEN, ENV, reqPost({ resposta: 'confirmo' }));
  assert.equal(r.status, 503);
  assert.match(await r.text(), /Não consegui registrar/);
});
await caso('visita cancelada: POST não grava', async () => {
  reset({ agenda: [{ status: 'agendado', excluido_em: '2026-10-01T10:00:00Z', recorrencia: null }] });
  const r = await responderConfirmacao(TOKEN, ENV, reqPost({ resposta: 'confirmo' }));
  assert.equal(r.status, 410);
  assert.equal(patches().length, 0);
});
await caso('corpo grande demais é recusado sem gravar', async () => {
  reset();
  const r = await responderConfirmacao(TOKEN, ENV, reqPost({ resposta: 'confirmo', x: 'y'.repeat(4000) }));
  assert.equal(r.status, 413);
  assert.equal(patches().length, 0);
});

console.log(`\n${ok} casos ok`);
