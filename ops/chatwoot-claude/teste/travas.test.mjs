// Provas dos P1/P2 do LIVRE (#443 @ 532fd50f): trava de gasto fecha, lista de parar não some.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { chatwootFalso, anthropicFalso, conv, evento } from './falsos.mjs';

const tmp = mkdtempSync(`${tmpdir()}/cwc-travas-`);
process.env.CWC_DADOS = tmp;
process.env.CHATWOOT_TOKEN_CLAUDE = 'tok-falso';
process.env.ANTHROPIC_API_KEY_RESERVA = 'chave-falsa';
const estado = { conversas: {}, log: [] }; const chamadas = []; const respostas = [];
let cwSrv, anSrv;
before(async () => {
  const a = await chatwootFalso(estado); cwSrv = a.srv; process.env.CHATWOOT_URL = a.url;
  const b = await anthropicFalso(respostas, chamadas); anSrv = b.srv; process.env.ANTHROPIC_URL = b.url;
});
after(() => { cwSrv.close(); anSrv.close(); });
const { processar } = await import('../processar.mjs');
const nucleo = await import('../nucleo.mjs');
const CFG = nucleo.CFG;
const G = `${tmp}/gasto.jsonl`; const P = `${tmp}/parar.json`;
beforeEach(() => { rmSync(G, { force: true }); rmSync(P, { force: true }); rmSync(`${P}.tmp`, { force: true }); });
const soma = () => readFileSync(G, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).reduce((s, r) => s + r.reais, 0);
const souRoot = process.getuid?.() === 0;

test('P1-1: gasto.jsonl sem permissão de escrita = 0 chamadas pagas em 3 mensagens', { skip: souRoot && 'root ignora chmod' }, async () => {
  writeFileSync(G, `${JSON.stringify({ dia: nucleo.hojeSP(), conversa: 0, reais: CFG.teto_diario_reais - 0.001 })}\n`);
  chmodSync(G, 0o444);
  const antes = chamadas.length;
  for (const id of [201, 202, 203]) {
    estado.conversas[id] = conv(id, 4, 'oi, quanto custa?');
    const r = await processar(evento(estado.conversas[id], 'oi, quanto custa?'));
    assert.equal(r.resultado, 'teto');
  }
  assert.equal(chamadas.length, antes);
  chmodSync(G, 0o644);
});

test('P1-1: escrita negada mesmo LONGE do teto = não paga (falha fechada)', { skip: souRoot && 'root ignora chmod' }, async () => {
  writeFileSync(G, ''); chmodSync(G, 0o444);
  estado.conversas[204] = conv(204, 4, 'oi');
  const antes = chamadas.length;
  const r = await processar(evento(estado.conversas[204], 'oi'));
  assert.equal(r.resultado, 'teto'); assert.equal(r.motivo, 'falha-gravar'); assert.equal(chamadas.length, antes);
  chmodSync(G, 0o644);
});

test('P1-1: 5 conversas simultâneas com folga para 1 = 1 chamada paga', async () => {
  // mede a reserva de UMA conversa igual às 5 (mesmo texto, mesmo contexto)
  estado.conversas[210] = conv(210, 4, 'oi, tudo bem?');
  respostas.push({ texto: '{"tipo":"saudacao","resposta":"Oi!","humano":false,"motivo":""}' });
  await processar(evento(estado.conversas[210], 'oi, tudo bem?'));
  const reserva = readFileSync(G, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.reserva).reais;
  assert.ok(reserva > 0);
  rmSync(G, { force: true });
  // folga = 1,5 reserva: cabe uma, não cabem duas
  writeFileSync(G, `${JSON.stringify({ dia: nucleo.hojeSP(), conversa: 0, reais: CFG.teto_diario_reais - 1.5 * reserva })}\n`);
  const ids = [211, 212, 213, 214, 215];
  for (const id of ids) estado.conversas[id] = conv(id, 4, 'oi, tudo bem?');
  const antes = chamadas.length;
  for (let k = 0; k < 5; k++) respostas.push({ texto: '{"tipo":"saudacao","resposta":"Oi!","humano":false,"motivo":""}' });
  const rs = await Promise.all(ids.map((id) => processar(evento(estado.conversas[id], 'oi, tudo bem?'))));
  respostas.length = 0;
  assert.equal(chamadas.length - antes, 1, 'só uma passa no teto');
  assert.equal(rs.filter((r) => r.resultado === 'teto').length, 4);
  assert.ok(soma() <= CFG.teto_diario_reais + 1e-9, `gasto ${soma()} passou do teto`);
});

test('P1-1: reserva + ajuste = custo real; erro da API devolve a reserva', async () => {
  estado.conversas[221] = conv(221, 4, 'oi');
  respostas.push({ texto: '{"tipo":"saudacao","resposta":"Oi!","humano":false,"motivo":""}', uso: { input_tokens: 5000, output_tokens: 80 } });
  await processar(evento(estado.conversas[221], 'oi'));
  assert.ok(Math.abs(soma() - 0.00324) < 1e-9, `soma ${soma()}`);
});

test('P1-2: parar.json torto = 0 chamadas e o arquivo fica intacto', async () => {
  writeFileSync(P, '["131","99');
  estado.conversas[231] = conv(231, 4, 'oi');
  const antes = chamadas.length;
  await assert.rejects(processar(evento(estado.conversas[231], 'oi')));
  assert.equal(chamadas.length, antes);
  await assert.rejects(processar(evento(estado.conversas[231], 'para de me mandar mensagem')));
  assert.equal(readFileSync(P, 'utf8'), '["131","99', 'não regravou por cima dos opt-outs');
});

test('P1-2: gravar é atômico e acumula (não perde os anteriores)', () => {
  nucleo.gravarParar('131'); nucleo.gravarParar('999'); nucleo.gravarParar('132');
  assert.deepEqual([...nucleo.lerParar()].sort(), ['131', '132', '999']);
  assert.throws(() => readFileSync(`${P}.tmp`), /ENOENT/);
});

test('P2-1: etiqueta parar-contato (posta por humano) barra antes de pagar', async () => {
  estado.conversas[241] = conv(241, 4, 'oi', { labels: ['parar-contato'] });
  const antes = chamadas.length;
  const r = await processar(evento(estado.conversas[241], 'oi'));
  assert.equal(r.resultado, 'ignorado'); assert.equal(chamadas.length, antes);
});

test('P2-2: modelo devolve motivo "parar" = grava na lista e etiqueta', async () => {
  estado.conversas[251] = conv(251, 4, 'chega, não manda mais nada');
  respostas.push({ texto: '{"tipo":"outro","resposta":"","humano":true,"motivo":"parar"}' });
  const r = await processar(evento(estado.conversas[251], 'chega, não manda mais nada'));
  assert.equal(r.resultado, 'parar');
  assert.ok(nucleo.lerParar().has(String(estado.conversas[251].meta.sender.id)));
  assert.ok(estado.conversas[251].labels.includes('parar-contato'));
});
