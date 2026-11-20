import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { chatwootFalso, anthropicFalso, conv, evento } from './falsos.mjs';

const tmp = mkdtempSync(`${tmpdir()}/cwc-`);
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
const { processar, podeResponderSozinho } = await import('../processar.mjs');
const { decidir } = await import('../decidir.mjs');
const nucleo = await import('../nucleo.mjs');
const CFG = nucleo.CFG;
const j = (o) => ({ texto: JSON.stringify(o) });
const nota = (id) => estado.conversas[id].messages.filter((m) => m.private).map((m) => m.content).join('\n');
const saiuAoCliente = (id) => estado.conversas[id].messages.some((m) => !m.private && m.message_type === 1);

test('SOMBRA: sugestão vira nota privada + etiqueta, nada ao cliente', async () => {
  estado.conversas[1] = conv(1, 4, 'Quanto custa o plano Pro?');
  respostas.push(j({ tipo: 'preco', resposta: 'O Pro sai R$ 39 por mês. Você faz quantos orçamentos por semana?', humano: false, motivo: '' }));
  const r = await processar(evento(estado.conversas[1], 'Quanto custa o plano Pro?'));
  assert.equal(r.resultado, 'sombra');
  assert.equal(saiuAoCliente(1), false);
  assert.match(nota(1), /MODO SOMBRA/); assert.match(nota(1), /R\$ 39/);
  assert.deepEqual(estado.conversas[1].labels, ['claude-sugestao']);
  assert.ok(chamadas.at(-1).corpo.system.includes('R$ 39 por mês'), 'tabela no contexto');
  assert.equal(chamadas.at(-1).corpo.model, 'claude-haiku-5-5');
  assert.equal(chamadas.at(-1).chave, 'chave-falsa');
});

test('preço fora da tabela é barrado e marcado para humano', async () => {
  estado.conversas[2] = conv(2, 4, 'Qual o valor?');
  respostas.push(j({ tipo: 'preco', resposta: 'Pra você faço por R$ 25 só hoje.', humano: false }));
  const r = await processar(evento(estado.conversas[2], 'Qual o valor?'));
  assert.deepEqual(r.barrada.length > 0, true);
  assert.match(nota(2), /BARRADA.*preço fora da tabela/);
  assert.deepEqual(estado.conversas[2].labels.sort(), ['claude-humano', 'claude-sugestao']);
});

test('prazo e resultado inventados são barrados', () => {
  assert.ok(nucleo.motivosDeBarrar('Fica pronto em 2 dias e você vai ganhar 30 clientes.').length >= 2);
  assert.deepEqual(nucleo.motivosDeBarrar('Oi! Aqui é da OLLI. Que serviço você faz por aí?'), []);
  assert.ok(nucleo.motivosDeBarrar('Não sou um robô, sou uma pessoa.').length);
  assert.ok(nucleo.motivosDeBarrar('Sou o assistente virtual da OLLI.').length === 0);
});

test('tabela do dia: R$ 997 vale até 19/11 20h29, R$ 1.397 a partir das 20h30', () => {
  assert.deepEqual(nucleo.motivosDeBarrar('O Site Pronto sai R$ 997.', { data: '2026-11-19T20:29' }), []);
  assert.match(nucleo.motivosDeBarrar('O Site Pronto sai R$ 997.', { data: '2026-11-19T20:30' })[0], /fora da tabela/);
  assert.match(nucleo.motivosDeBarrar('O Site Pronto sai R$ 997.', { data: '2026-11-20T09:00' })[0], /fora da tabela/);
  assert.deepEqual(nucleo.motivosDeBarrar('O Site Pronto sai R$ 1.397.', { data: '2026-11-19T20:30' }), []);
});

test('PARAR: para na hora, não chama a API, marca e não responde mais', async () => {
  estado.conversas[3] = conv(3, 4, 'para de me mandar mensagem');
  const antes = chamadas.length;
  const r = await processar(evento(estado.conversas[3], 'para de me mandar mensagem'));
  assert.equal(r.resultado, 'parar'); assert.equal(chamadas.length, antes);
  assert.ok(estado.conversas[3].labels.includes('parar-contato'));
  assert.equal(saiuAoCliente(3), false);
  const r2 = await processar(evento(estado.conversas[3], 'oi de novo'));
  assert.equal(r2.resultado, 'ignorado'); assert.equal(chamadas.length, antes);
});

test('caixa 5 (pessoal) e 2 (GR Tech): ignoradas, sem tocar', async () => {
  for (const cx of [5, 2]) {
    estado.conversas[50 + cx] = conv(50 + cx, cx, 'oi');
    const d = decidir(evento(estado.conversas[50 + cx], 'oi'), []);
    assert.equal(d.acao, 'ignorar'); assert.match(d.motivo, /proibida/);
  }
  const antes = estado.log.length;
  await assert.rejects(import('../chatwoot.mjs').then((m) => m.conversa(55)), /proibida/);
  assert.ok(estado.log.length > antes); // só o GET da conversa (metadados), sem ler mensagens
  assert.ok(!estado.log.slice(antes).some((l) => l.includes('/messages')));
});

test('número da casa e lista ilegível: ignora', () => {
  const c = conv(60, 4, 'oi');
  assert.equal(decidir(evento(c, 'oi'), ['5511900000000']).motivo, 'número da casa');
  assert.match(decidir(evento(c, 'oi'), null).motivo, /ilegível/);
});

test('TETO: ao bater, volta ao sombra sem chamar a API', async () => {
  nucleo.registrarGasto({ ts: 'x', dia: nucleo.hojeSP(), conversa: 0, reais: CFG.teto_diario_reais });
  estado.conversas[4] = conv(4, 4, 'oi, tudo bem?');
  const antes = chamadas.length;
  const r = await processar(evento(estado.conversas[4], 'oi, tudo bem?'));
  assert.equal(r.resultado, 'teto'); assert.equal(chamadas.length, antes);
  assert.ok(estado.conversas[4].labels.includes('claude-teto'));
});

test('gasto registrado por conversa', () => {
  const g = nucleo.gastoPorConversa();
  assert.ok(g['1'] > 0 && g['2'] > 0);
  // 5000 entrada + 80 saída em Haiku 5.5: (5000*0.10 + 80*0.50)/1e6 USD * 6 = R$ 0,00324
  assert.ok(Math.abs(g['1'] - 0.00324) < 1e-6);
});

test('autônomo: só com caixa E tipo listados, ligado, texto limpo e tipos concordando', () => {
  const base = { caixa: 4, tipoModelo: 'saudacao', tipoTexto: 'saudacao', humano: false, motivos: [], resposta: 'Oi!' };
  const on = { ...CFG, autonomo: { ligado: true, caixas: [4], tipos: ['saudacao'] } };
  assert.equal(podeResponderSozinho({ ...base, cfg: CFG }), false, 'entregue desligado');
  assert.equal(podeResponderSozinho({ ...base, cfg: on }), true);
  assert.equal(podeResponderSozinho({ ...base, cfg: on, caixa: 3 }), false);
  assert.equal(podeResponderSozinho({ ...base, cfg: on, tipoModelo: 'preco', tipoTexto: 'preco' }), false);
  assert.equal(podeResponderSozinho({ ...base, cfg: on, tipoTexto: 'outro' }), false, 'discordância de tipo');
  assert.equal(podeResponderSozinho({ ...base, cfg: on, motivos: ['x'] }), false);
  assert.equal(podeResponderSozinho({ ...base, cfg: on, humano: true }), false);
  assert.equal(CFG.autonomo.ligado, false); assert.deepEqual(CFG.autonomo.caixas, []);
});

test('AUTÔNOMO ligado de mentira: responde só o tipo liberado e deixa nota', async () => {
  writeFileSync(`${tmp}/gasto.jsonl`, ''); // zera o teto
  CFG.autonomo = { ligado: true, caixas: [4], tipos: ['saudacao'] };
  estado.conversas[7] = conv(7, 4, 'oi'); respostas.push(j({ tipo: 'saudacao', resposta: 'Oi! Aqui é da OLLI. Que serviço você faz por aí?', humano: false }));
  const r = await processar(evento(estado.conversas[7], 'oi'));
  assert.equal(r.resultado, 'respondeu'); assert.equal(saiuAoCliente(7), true);
  estado.conversas[8] = conv(8, 4, 'quanto custa o Pro?'); respostas.push(j({ tipo: 'preco', resposta: 'O Pro sai R$ 39 por mês.', humano: false }));
  const r2 = await processar(evento(estado.conversas[8], 'quanto custa o Pro?'));
  assert.equal(r2.resultado, 'sombra'); assert.equal(saiuAoCliente(8), false, 'preço não está liberado');
  CFG.autonomo = { ligado: false, caixas: [], tipos: [] };
});

test('preco-combinado e resposta torta vão para humano', async () => {
  estado.conversas[9] = conv(9, 4, 'e o preço?', { labels: ['preco-combinado'] });
  assert.equal((await processar(evento(estado.conversas[9], 'e o preço?'))).motivo, 'preco-combinado');
  estado.conversas[10] = conv(10, 3, 'oi'); respostas.push({ texto: 'não é json' });
  assert.equal((await processar(evento(estado.conversas[10], 'oi'))).resultado, 'sem-sugestao');
  assert.ok(estado.conversas[10].labels.includes('claude-humano'));
});
