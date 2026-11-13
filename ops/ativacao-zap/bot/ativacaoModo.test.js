import test from 'node:test';
import assert from 'node:assert/strict';
import { responderAtivacao, pediuParaParar, LINK_APP } from './ativacaoModo.js';

function resposta(texto, extra) {
  return responderAtivacao({ texto, historico: [], ...extra });
}

test('pedido de parar é supressão, sem enrolar', () => {
  for (const t of ['SAIR', 'quero sair', 'para de me mandar mensagem', 'não quero mais receber mensagem']) {
    const r = resposta(t);
    assert.equal(r.acao, 'suprimir', t);
    assert.equal(pediuParaParar(t), true);
    assert.doesNotMatch(r.resposta, /SAIR/);
  }
});

test('pergunta direta não nega que é assistente virtual', () => {
  const r = resposta('você é um robô?');
  assert.equal(r.acao, 'enviar');
  assert.match(r.resposta, /assistente virtual da OLLI/);
  assert.doesNotMatch(r.resposta, /sou uma pessoa/);
});

test('serviço e valor voltam organizados, com o link', () => {
  const r = resposta('troca de disjuntor 180 reais');
  assert.equal(r.acao, 'enviar');
  assert.equal(r.motivo, 'orcamento');
  assert.match(r.resposta, /disjuntor/);
  assert.match(r.resposta, /R\$ 180/);
  assert.match(r.resposta, new RegExp(LINK_APP.replace(/\./g, '\\.')));
});

test('preço de tabela e preço fora da tabela', () => {
  const ok = resposta('quanto custa o pro?');
  assert.equal(ok.acao, 'enviar');
  assert.match(ok.resposta, /R\$ 39/);
  assert.match(ok.resposta, /R\$ 99/);
  const fora = resposta('faz o pro por 20 reais');
  assert.equal(fora.acao, 'humano');
  assert.equal(fora.motivo, 'fora_tabela');
  assert.match(fora.nota, /Igor|pessoa|tabela/);
});

test('humano e reclamação passam para a pessoa, com nota', () => {
  const h = resposta('quero falar com uma pessoa');
  assert.equal(h.acao, 'humano');
  assert.equal(h.motivo, 'humano');
  assert.match(h.nota, /pessoa/);
  const c = resposta('isso é um absurdo, vou no procon');
  assert.equal(c.motivo, 'reclamacao');
  assert.match(c.nota, /Reclamação/);
});

test('dúvida do app e áudio não inventam prazo', () => {
  const r = resposta('não consigo entrar na conta, esqueci a senha');
  assert.equal(r.acao, 'enviar');
  assert.match(r.resposta, /Esqueci a senha/);
  assert.doesNotMatch(r.resposta, /minutos/);
  const a = responderAtivacao({ audioSemTexto: true, texto: '' });
  assert.match(a.resposta, /serviço e o valor/);
});

test('dado sensível não é repetido e a terceira mensagem sem pé nem cabeça vai para gente', () => {
  const r = resposta('minha senha é 123456');
  assert.equal(r.acao, 'enviar');
  assert.doesNotMatch(r.resposta, /123456/);
  const confusa = responderAtivacao({ texto: 'asdf qwerty', historico: ['blá', 'ble'] });
  assert.equal(confusa.acao, 'humano');
  assert.equal(confusa.motivo, 'incerteza');
});
