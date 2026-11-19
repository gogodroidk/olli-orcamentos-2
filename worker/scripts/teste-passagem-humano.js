/**
 * P0-34 — frases de FALAS-P0-34.md. Não grava banco e não envia mensagem.
 *     node worker/scripts/teste-passagem-humano.js
 */
import assert from 'node:assert/strict';
import { FRASE_IA, passagemHumano } from '../src/passagemHumano.js';

let n = 0;
const igual = (atual, esperado, msg) => {
  assert.deepEqual(atual, esperado, msg);
  n += 1;
};

const vazio = (r, msg) => {
  assert.equal(r.resposta, '', msg);
  n += 1;
};

const preco = passagemHumano('Consegue fazer por 20 reais por mês?');
igual([preco.estado, preco.motivo], ['humano', 'preco'], 'gatilho 1 preço');
vazio(preco, 'preço não gera texto');

const contrato = passagemHumano('Me manda o contrato e a nota fiscal.');
igual([contrato.estado, contrato.motivo], ['humano', 'contrato'], 'gatilho 2 contrato');
vazio(contrato, 'contrato não gera texto');

const reclamacao = passagemHumano('Vou no Procon. Isso foi um absurdo.');
igual([reclamacao.estado, reclamacao.motivo], ['humano', 'reclamacao'], 'gatilho 3 reclamação');
vazio(reclamacao, 'reclamação não gera texto');

const segredo = 'teste-falso-000';
const dado = passagemHumano(`Segue a senha do meu banco: ${segredo}.`);
igual([dado.estado, dado.motivo], ['humano', 'dado'], 'gatilho 4 dado');
vazio(dado, 'dado não gera texto');
assert.equal(JSON.stringify(dado).includes(segredo), false, 'a decisão não repete o segredo');
n += 1;

const ia = passagemHumano('Você é robô?');
igual([ia.estado, ia.motivo, ia.resposta], ['humano', 'ia', FRASE_IA], 'gatilho 5 é a única frase');
assert.equal(FRASE_IA.includes('sou uma IA'), true, 'a frase diz que é IA');
assert.equal(/pessoa/i.test(FRASE_IA), false, 'a frase não promete pessoa: quem assume é a equipe da OLLI (CPO D-2633)');
n += 1;

const primeira = passagemHumano('qual o prazo da peça que ainda não existe?');
igual([primeira.estado, primeira.motivo], ['novo', null], 'gatilho 6: a primeira fica novo');
vazio(primeira, 'a primeira não responde');
const segunda = passagemHumano('então, qual é o prazo?', { segundaSemResposta: true });
igual([segunda.estado, segunda.motivo], ['humano', 'incerteza'], 'gatilho 6: a segunda para');
vazio(segunda, 'incerteza não gera texto');

const sair = passagemHumano('SAIR. Vou no Procon.', { pediuSair: true });
igual([sair.estado, sair.motivo, sair.resposta], ['saiu', null, ''], 'SAIR ganha da reclamação');

const cancelar = passagemHumano('Cancelar');
igual([cancelar.estado, cancelar.motivo], ['novo', null], 'Cancelar sozinho não é SAIR nem reclamação');

const orcamento = passagemHumano('quero orçamento');
igual([orcamento.estado, orcamento.motivo], ['novo', null], 'pedido normal de orçamento continua novo');

console.log(`PASSOU: ${n} verificações — passagem para humano.`);
