import test from 'node:test';
import assert from 'node:assert/strict';
import { responderProspeccao, pediuParaParar, lerNegocio, respostaProibida, CNPJ } from './prospeccaoModo.js';

function r(texto, extra = {}) {
  return responderProspeccao({ texto, historico: [], ...extra });
}

function limpa(res) {
  assert.equal(respostaProibida(res.resposta), false, res.motivo);
  assert.doesNotMatch(res.resposta, /OLLI Orçamentos|R\$\s*\d|garanto|100%|todo cliente na hora|fala SAIR|Receita Federal/i);
}

test('1 abertura pede o movimento, sem preço', () => {
  const a = r('oi');
  assert.equal(a.acao, 'enviar');
  assert.match(a.resposta, /técnicos/);
  limpa(a);
});

test('2 resposta sim ao primeiro toque explica a central e pergunta os técnicos', () => {
  const a = r('sim');
  assert.match(a.resposta, /GR Tech/);
  assert.match(a.resposta, /técnicos/);
  assert.equal(a.lead, 'morno');
  assert.doesNotMatch(a.resposta, /todo cliente|na hora/);
  limpa(a);
});

test('3 anota técnicos e pergunta o canal', () => {
  const a = r('somos em 4 técnicos');
  assert.match(a.resposta, /Anotei/);
  assert.match(a.resposta, /WhatsApp/);
  assert.equal(a.qualificacao.tecnicos, true);
  limpa(a);
});

test('4 anota o canal e pergunta se fica sem resposta', () => {
  const a = r('chega pelo WhatsApp', { historico: ['temos 6 técnicos'] });
  assert.match(a.resposta, /sem resposta/);
  assert.equal(a.qualificacao.canal, true);
  limpa(a);
});

test('5 com o movimento completo oferece 15 min e marca lead quente', () => {
  const a = r('fica sem resposta quando estamos na obra', { historico: ['4 técnicos', 'chega pelo WhatsApp'] });
  assert.equal(a.lead, 'quente');
  assert.match(a.resposta, /15 minutos/);
  assert.match(a.resposta, /Igor/);
  assert.equal(lerNegocio(['4 técnicos', 'chega pelo WhatsApp'], 'fica sem resposta').semResposta, true);
  limpa(a);
});

test('6 preço não cita valor e chama o Igor', () => {
  const a = r('quanto custa?');
  assert.equal(a.motivo, 'preco');
  assert.equal(a.lead, 'quente');
  assert.match(a.resposta, /Não tenho um preço/);
  assert.doesNotMatch(a.resposta, /R\$|39|99/);
  limpa(a);
});

test('7 já tenho alguém não pede para trocar', () => {
  const a = r('já tenho alguém que responde');
  assert.equal(a.motivo, 'ja_tem');
  assert.match(a.resposta, /Não vou pedir para trocar/);
  limpa(a);
});

test('8 não confio em robô admite que é IA', () => {
  const a = r('não confio em robô');
  assert.equal(a.motivo, 'desconfia');
  assert.match(a.resposta, /assistente virtual/);
  assert.match(a.resposta, /IA/);
  assert.notEqual(a.acao, 'suprimir');
  limpa(a);
});

test('9 sem tempo não insiste', () => {
  const a = r('não tenho tempo agora');
  assert.equal(a.motivo, 'sem_tempo');
  assert.match(a.resposta, /não insisto/);
  limpa(a);
});

test('10 SAIR e não param na hora', () => {
  assert.equal(pediuParaParar('quero sair'), true);
  const sair = r('SAIR');
  assert.equal(sair.acao, 'suprimir');
  assert.match(sair.resposta, /parei/);
  const nao = r('não');
  assert.equal(nao.acao, 'suprimir');
  assert.match(nao.resposta, /Não envio mais/);
  const interesse = r('não tenho interesse');
  assert.equal(interesse.acao, 'suprimir');
  limpa(sair);
  limpa(nao);
});

test('11 pergunta se é robô e não nega', () => {
  const a = r('você é robô?');
  assert.match(a.resposta, /assistente virtual/);
  assert.match(a.resposta, /IA/);
  assert.match(a.resposta, new RegExp(CNPJ.replaceAll('.', '\\.')));
  assert.doesNotMatch(a.resposta, /não sou|pessoa de verdade$/i);
  limpa(a);
});

test('12 golpe passa para o Igor com o CNPJ', () => {
  const a = r('isso é golpe?');
  assert.equal(a.acao, 'humano');
  assert.match(a.resposta, new RegExp(CNPJ.replaceAll('.', '\\.')));
  assert.match(a.resposta, /Igor/);
  limpa(a);
});

test('13 aceitar os 15 min entrega a conversa ao Igor', () => {
  const a = r('pode chamar o Igor');
  assert.equal(a.acao, 'humano');
  assert.equal(a.motivo, 'aceitou_15');
  assert.equal(a.lead, 'quente');
  limpa(a);
});

test('14 áudio pede texto e CPF não entra no papo', () => {
  const audio = responderProspeccao({ audioSemTexto: true, texto: '' });
  assert.match(audio.resposta, /não consigo ouvir/);
  const cpf = r('meu cpf é 123.456.789-09');
  assert.equal(cpf.motivo, 'dado_sensivel');
  assert.match(cpf.resposta, /não me manda/);
  limpa(audio);
  limpa(cpf);
});

test('15 reclamação para de vender', () => {
  const a = r('que absurdo, vou no procon');
  assert.equal(a.acao, 'humano');
  assert.equal(a.motivo, 'reclamacao');
  assert.match(a.resposta, /Parei a oferta/);
  limpa(a);
});

test('16 não promete resultado nem desconto', () => {
  const a = r('garante que eu vou vender o dobro com desconto?');
  assert.doesNotMatch(a.resposta, /garanto|dobro|desconto de|100%/i);
  assert.match(a.resposta, /Igor|Não tenho um preço|não/);
  limpa(a);
});

test('20 origem da receita só quando a fonte é receita e perguntam o contato', () => {
  const receita = responderProspeccao({ texto: 'de onde você tirou meu telefone?', fonte: 'receita' });
  assert.equal(receita.acao, 'enviar');
  assert.match(receita.resposta, /assistente virtual/);
  assert.match(receita.resposta, /dados abertos cadastrais da Receita Federal/);
  assert.doesNotMatch(receita.resposta, /site|R\$\s*\d|garanto|OLLI Orçamentos/i);
  const site = r('de onde você tirou meu telefone?');
  assert.match(site.resposta, /site/);
  assert.doesNotMatch(site.resposta, /Receita/);
  const parar = responderProspeccao({ texto: 'pode parar', fonte: 'receita' });
  assert.equal(parar.acao, 'suprimir');
  assert.match(parar.resposta, /parei/);
});

test('17 quem é e de onde veio o número', () => {
  const a = r('quem é você e como conseguiu meu número?');
  assert.match(a.resposta, /assistente virtual/);
  assert.match(a.resposta, /site/);
  assert.doesNotMatch(a.resposta, /Receita|OLLI Orçamentos/);
  limpa(a);
});

test('19 preço, ver e aceite são interesse; sim sozinho não é', () => {
  const preco = r('quanto custa um site?');
  assert.equal(preco.interesse, 'preco');
  assert.equal(preco.lead, 'quente');
  const ver = r('quero ver o atendimento');
  assert.equal(ver.interesse, 'ver');
  assert.equal(ver.lead, 'quente');
  assert.equal(ver.motivo, 'ver');
  const aceite = r('pode chamar o Igor');
  assert.equal(aceite.interesse, 'aceitou');
  assert.equal(r('sim').interesse, null);
  assert.equal(r('sim').lead, 'morno');
  assert.equal(r('não quero ver').acao, 'suprimir');
  limpa(preco);
  limpa(ver);
  limpa(aceite);
});

test('18 não fica sem resposta é dado, não é pedido para parar', () => {
  const a = r('não fica mensagem sem resposta', { historico: ['2 técnicos', 'o cliente liga'] });
  assert.notEqual(a.acao, 'suprimir');
  assert.equal(a.lead, 'quente');
  limpa(a);
});
