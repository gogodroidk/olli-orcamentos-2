/**
 * Teste do TEMPLATE do resumo diário (`src/resumoDinheiroTemplate.js`).
 *
 *     node scripts/teste-resumo-dinheiro-template.js   (de dentro de worker/)
 *
 * Protege: valor formatado pela fonte (`reais` de precosPlanos.ts), limiares vindos
 * de radarDinheiro.ts, CTA para a raiz do painel, link "parar de receber o resumo"
 * no HTML e no texto, só linhas com número > 0, sem PII, e falha FECHADA em dado
 * estranho — inclusive o e-mail "você tem R$ 0" (nada acionável).
 */
import assert from 'node:assert/strict';
import { renderizarEmailResumoDinheiro } from '../src/resumoDinheiroTemplate.js';
import { reais } from '../../src/services/precosPlanos.ts';
import { LIMIAR_CLIENTE_SUMIDO_DIAS, LIMIAR_PROPOSTA_PARADA_DIAS } from '../../src/services/radarDinheiro.ts';

const U = '00000000-0000-4000-8000-000000000001';
const UNSUB = `https://diagnostico.olliorcamentos.online/email/descadastrar?u=${U}&e=resumo&a=abc`;
const DADOS = Object.freeze({
  data: '2026-09-30',
  aReceberCentavos: 234050,
  aReceberItens: 3,
  diasMaisAntigo: 12,
  semValor: 0,
  propostasParadas: 2,
  clientesSumidos: 1,
});
const BASE = Object.freeze({
  eventId: `resumo:dinheiro:${U}:2026-09-30`,
  template: 'resumo_dinheiro',
  templateVersion: 'resumo_dinheiro.v1',
  purpose: 'money_digest',
  dados: DADOS,
  appUrl: 'https://app.olliorcamentos.online',
  supportUrl: 'https://olliorcamentos.online/ajuda/',
  logoUrl: 'https://olliorcamentos.online/icon-192.png',
  unsubscribeUrl: UNSUB,
});

let ok = 0;
function caso(nome, fn) {
  fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}
function erro(fn) {
  try { fn(); } catch (e) { return e.codigo || e.message; }
  return null;
}
const render = (dados) => renderizarEmailResumoDinheiro({ ...BASE, dados: { ...DADOS, ...dados } });

caso('resumo completo: valor da fonte, três linhas, CTA para o painel', () => {
  const e = render({});
  const valor = reais(234050);
  assert.equal(valor, 'R$ 2.340,50');
  assert.equal(e.subject, `Você tem ${valor} a receber`);
  assert.equal(e.kind, 'lembrete');
  assert.equal(e.template, 'resumo_dinheiro');
  assert.ok(e.text.includes(`${valor} a receber em 3 orçamentos aprovados — o mais antigo parado há 12 dias.`));
  assert.ok(e.text.includes(`2 propostas enviadas sem resposta há ${LIMIAR_PROPOSTA_PARADA_DIAS} dias ou mais.`));
  assert.ok(e.text.includes(`1 cliente sem atendimento há ${LIMIAR_CLIENTE_SUMIDO_DIAS} dias ou mais.`));
  assert.ok(e.text.includes('Abrir o painel: https://app.olliorcamentos.online/'));
  assert.ok(e.html.includes('href="https://app.olliorcamentos.online/"'));
  assert.ok(Object.isFrozen(e));
});

caso('descadastro próprio do resumo no HTML, no texto e no List-Unsubscribe', () => {
  const e = render({});
  assert.equal(e.unsubscribeUrl, UNSUB);
  assert.ok(e.html.includes('Parar de receber o resumo</a>'));
  assert.ok(e.html.includes(UNSUB.replaceAll('&', '&amp;')));
  assert.ok(e.text.includes(`Parar de receber o resumo: ${UNSUB}`));
  assert.equal(e.html.includes('Parar de receber lembretes'), false);
});

caso('só aparece o que tem número; assunto segue o que existe', () => {
  const soPropostas = render({ aReceberCentavos: 0, aReceberItens: 0, diasMaisAntigo: null, clientesSumidos: 0 });
  assert.equal(soPropostas.subject, '2 propostas esperando resposta dos clientes');
  assert.equal(/a receber|cliente sem atendimento/.test(soPropostas.text), false);
  const umaProposta = render({ aReceberCentavos: 0, aReceberItens: 0, diasMaisAntigo: null, clientesSumidos: 0, propostasParadas: 1 });
  assert.equal(umaProposta.subject, '1 proposta esperando resposta do cliente');
  const soSumidos = render({ aReceberCentavos: 0, aReceberItens: 0, diasMaisAntigo: null, propostasParadas: 0, clientesSumidos: 4 });
  assert.equal(soSumidos.subject, '4 clientes sem atendimento há um bom tempo');
  const umItem = render({ aReceberCentavos: 50000, aReceberItens: 1, diasMaisAntigo: 0, propostasParadas: 0, clientesSumidos: 0 });
  assert.ok(umItem.text.includes('R$ 500 a receber em 1 orçamento aprovado.'));
  assert.equal(umItem.text.includes('parado há'), false);
});

caso('aprovado sem valor aparece como aviso honesto', () => {
  assert.ok(render({ semValor: 1 }).text.includes('1 orçamento aprovado está sem valor no cadastro e ficou fora desta conta.'));
  assert.ok(render({ semValor: 2 }).text.includes('2 orçamentos aprovados estão sem valor no cadastro e ficaram fora desta conta.'));
});

caso('sem PII e sem urgência inventada', () => {
  const e = render({});
  const tudo = `${e.subject}\n${e.preview}\n${e.html}\n${e.text}`;
  assert.equal(tudo.includes(U), true); // só dentro do link assinado de descadastro
  assert.equal(tudo.replaceAll(UNSUB, '').replaceAll(UNSUB.replaceAll('&', '&amp;'), '').replaceAll(BASE.eventId, '').includes(U), false);
  assert.equal(/urgente|última chance|desconto|agora ou nunca|@/i.test(`${e.subject}\n${e.text}`.replaceAll(UNSUB, '')), false);
});

caso('falha fechada: nada acionável, dado incoerente ou fora do catálogo', () => {
  assert.equal(erro(() => render({ aReceberCentavos: 0, aReceberItens: 0, diasMaisAntigo: null, propostasParadas: 0, clientesSumidos: 0 })), 'nada_acionavel');
  assert.equal(erro(() => render({ aReceberCentavos: 0 })), 'dados_invalidos'); // itens sem valor
  assert.equal(erro(() => render({ aReceberItens: 0, diasMaisAntigo: null })), 'dados_invalidos'); // valor sem itens
  assert.equal(erro(() => render({ aReceberCentavos: 10.5 })), 'dados_invalidos');
  assert.equal(erro(() => render({ propostasParadas: -1 })), 'dados_invalidos');
  assert.equal(erro(() => render({ data: '30/09/2026' })), 'dados_invalidos');
  assert.equal(erro(() => render({ nomeCliente: 'Maria' })), 'dados_invalidos');
  assert.equal(erro(() => renderizarEmailResumoDinheiro({ ...BASE, template: 'lembrete_assinatura' })), 'template_invalido');
  assert.equal(erro(() => renderizarEmailResumoDinheiro({ ...BASE, templateVersion: 'resumo_dinheiro.v2' })), 'template_version_divergente');
  assert.equal(erro(() => renderizarEmailResumoDinheiro({ ...BASE, unsubscribeUrl: 'http://x.test/' })), 'unsubscribe_url_invalida');
  assert.equal(erro(() => renderizarEmailResumoDinheiro({ ...BASE, extra: 1 })), 'input_template_invalido');
});

caso('HTML acessível na mesma casca dos lembretes', () => {
  const e = render({});
  assert.match(e.html, /<html lang="pt-BR" dir="ltr">/);
  assert.equal((e.html.match(/<h1\b/g) || []).length, 1);
  assert.ok(e.html.includes('min-height:44px'));
  assert.ok(e.html.includes('alt="OLLI Orçamentos"'));
  assert.ok(e.subject.length <= 180);
});

console.log(`\nPASSOU: ${ok} casos — template do resumo diário`);
