/**
 * Teste dos TEMPLATES de lembrete (`src/emailLembretesTemplate.js`).
 *
 *     node scripts/teste-email-lembretes-template.js   (de dentro de worker/)
 *
 * Protege: CTA certo por tipo (/planos), link de descadastro no HTML
 * e no texto, sem PII, sem urgência inventada, HTML acessível e falha fechada em
 * dado estranho. Desde 01/10/2026 (Grátis ilimitado) os e-mails de cota não
 * existem: um pedido antigo desses na fila falha com `tipo_descontinuado`.
 */
import assert from 'node:assert/strict';
import { renderizarEmailLembrete, dataCurtaBrasilia } from '../src/emailLembretesTemplate.js';

const VENCE = '2026-10-02T02:00:00.000Z';
const RENOVAR = Object.freeze({ tipo: 'renovar_pix', plano: 'pro', venceEm: VENCE, momento: 'D-3', sequencia: `renovacao:${VENCE}` });
const UNSUB = 'https://diagnostico.olliorcamentos.online/email/descadastrar?u=00000000-0000-4000-8000-000000000001&e=lembretes&a=abc';
const BASE = Object.freeze({
  eventId: `lembrete:assinatura:00000000-0000-4000-8000-000000000001:renovacao:${'2026-10-02T02:00:00.000Z'}:D-3`,
  template: 'lembrete_assinatura',
  templateVersion: 'lembrete_assinatura.v1',
  purpose: 'billing_reminder',
  appUrl: 'https://app.olliorcamentos.online',
  supportUrl: 'https://olliorcamentos.online/ajuda/',
  logoUrl: 'https://olliorcamentos.online/icon-192.png',
  unsubscribeUrl: UNSUB,
});
const ATIVACAO = Object.freeze({
  ...BASE,
  eventId: 'onboarding:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000001:activation_day_3:2026-09-01.v1',
  template: 'lembrete_ativacao',
  templateVersion: 'lembrete_ativacao.v1',
  purpose: 'activation_reminder',
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
function tudo(email) {
  return `${email.subject}\n${email.preview}\n${email.html}\n${email.text}`;
}
function comum(email) {
  assert.equal(email.kind, 'lembrete');
  assert.equal(email.locale, 'pt-BR');
  assert.equal(email.unsubscribeUrl, UNSUB);
  assert.ok(Object.isFrozen(email));
  assert.match(email.html, /<html lang="pt-BR" dir="ltr">/);
  assert.equal((email.html.match(/<h1\b/g) || []).length, 1);
  const tabelas = (email.html.match(/<table\b/g) || []).length;
  assert.equal((email.html.match(/<table role="presentation"/g) || []).length, tabelas);
  assert.ok(email.html.includes('alt="OLLI Orçamentos"'));
  assert.ok(email.html.includes('min-height:44px'));
  assert.ok(email.html.includes('Parar de receber lembretes</a>'));
  assert.ok(email.html.includes(UNSUB.replaceAll('&', '&amp;')));
  assert.ok(email.text.includes(`Parar de receber lembretes: ${UNSUB}`));
  assert.ok(email.subject.length <= 120 && !/[\r\n]/.test(email.subject));
  assert.ok(email.preview.length < 90);
  assert.equal(/(última chance|oferta limitada|desconto|urgente|grátis para sempre)/i.test(tudo(email)), false);
  assert.equal(/@/.test(email.subject + email.text.replace(/https?:\/\/\S+/g, '')), false);
}

console.log('\n1. Ativação');
caso('D+3: convite ao primeiro orçamento, sem preço', () => {
  const email = renderizarEmailLembrete({ ...ATIVACAO, dados: { janela: 'activation_day_3' } });
  comum(email);
  assert.ok(email.html.includes('Criar meu primeiro orçamento</a>'));
  assert.ok(email.text.includes('Criar meu primeiro orçamento: https://app.olliorcamentos.online/'));
  assert.equal(/R\$/.test(tudo(email)), false);
});
caso('D+7: último lembrete, diz que é o último', () => {
  const email = renderizarEmailLembrete({ ...ATIVACAO, dados: { janela: 'activation_day_7' } });
  comum(email);
  assert.ok(email.text.includes('Este é o último lembrete deste tipo.'));
});
caso('janela D+1 não tem e-mail (renderer recusa)', () => {
  assert.equal(erro(() => renderizarEmailLembrete({ ...ATIVACAO, dados: { janela: 'activation_day_1' } })), 'janela_invalida');
});

console.log('\n2. Assinatura');
caso('Grátis ilimitado: e-mail de cota (pedido antigo na fila) é recusado, nunca enviado', () => {
  assert.equal(erro(() => renderizarEmailLembrete({ ...BASE, dados: { tipo: 'cota_quase', limite: 5, usados: 3, restantes: 2 } })), 'tipo_descontinuado');
  assert.equal(erro(() => renderizarEmailLembrete({ ...BASE, dados: { tipo: 'cota_esgotada', limite: 5, usados: 5, restantes: 0 } })), 'tipo_descontinuado');
});
caso('renovar_pix: data em Brasília e CTA /planos', () => {
  const venceEm = '2026-10-02T02:00:00.000Z'; // 01/10 23h em Brasília
  const email = renderizarEmailLembrete({
    ...BASE,
    dados: { tipo: 'renovar_pix', plano: 'pro', venceEm, momento: 'D-3', sequencia: `renovacao:${venceEm}` },
  });
  comum(email);
  assert.equal(email.subject, 'Seu plano Pro vence em 01/10 (quinta)');
  assert.ok(email.text.includes('Renovar com Pix: https://app.olliorcamentos.online/planos'));
  assert.ok(email.text.includes('O Pix não renova sozinho.'));
});
caso('plano_vencido: Empresa, dados salvos, renovar com Pix', () => {
  const venceEm = '2026-09-28T15:00:00.000Z';
  const email = renderizarEmailLembrete({
    ...BASE,
    dados: { tipo: 'plano_vencido', plano: 'empresa', venceEm, momento: 'D1', sequencia: `renovacao:${venceEm}` },
  });
  comum(email);
  assert.equal(email.subject, 'Seu plano Empresa venceu — seus dados continuam salvos');
  assert.ok(email.text.includes('venceu em 28/09 (segunda)'));
  assert.ok(email.html.includes('/planos'));
});
caso('data curta em Brasília atravessa a meia-noite UTC', () => {
  assert.equal(dataCurtaBrasilia('2026-10-01T01:30:00.000Z'), '30/09 (quarta)');
});

console.log('\n3. Falha fechada');
caso('tipo desconhecido', () => {
  assert.equal(erro(() => renderizarEmailLembrete({ ...BASE, dados: { tipo: 'assinar' } })), 'tipo_invalido');
});
caso('campo extra nos dados (ex.: e-mail) é recusado', () => {
  assert.equal(erro(() => renderizarEmailLembrete({ ...BASE, dados: { ...RENOVAR, email: 'a@b.co' } })), 'dados_invalidos');
});
caso('plano fora da lista é recusado', () => {
  assert.equal(erro(() => renderizarEmailLembrete({ ...BASE, dados: { ...RENOVAR, plano: 'gratis' } })), 'dados_invalidos');
});
caso('sequência que não bate com o vencimento é recusada', () => {
  const venceEm = '2026-10-02T02:00:00.000Z';
  assert.equal(erro(() => renderizarEmailLembrete({
    ...BASE,
    dados: { tipo: 'renovar_pix', plano: 'pro', venceEm, momento: 'D-3', sequencia: 'renovacao:outra' },
  })), 'dados_invalidos');
});
caso('momento errado para o tipo é recusado', () => {
  const venceEm = '2026-10-02T02:00:00.000Z';
  assert.equal(erro(() => renderizarEmailLembrete({
    ...BASE,
    dados: { tipo: 'renovar_pix', plano: 'pro', venceEm, momento: 'D1', sequencia: `renovacao:${venceEm}` },
  })), 'dados_invalidos');
});
caso('template/versão/purpose divergentes', () => {
  const dados = RENOVAR;
  assert.equal(erro(() => renderizarEmailLembrete({ ...BASE, dados, template: 'marketing' })), 'template_invalido');
  assert.equal(erro(() => renderizarEmailLembrete({ ...BASE, dados, templateVersion: 'lembrete_assinatura.v9' })), 'template_version_divergente');
  assert.equal(erro(() => renderizarEmailLembrete({ ...BASE, dados, purpose: 'activation_reminder' })), 'purpose_invalido');
});
caso('descadastro obrigatório e em https', () => {
  const dados = RENOVAR;
  assert.equal(erro(() => renderizarEmailLembrete({ ...BASE, dados, unsubscribeUrl: 'http://x.test/email/descadastrar' })), 'unsubscribe_url_invalida');
  const { unsubscribeUrl, ...semLink } = BASE;
  assert.equal(erro(() => renderizarEmailLembrete({ ...semLink, dados })), 'input_template_invalido');
});
caso('render é determinístico', () => {
  const dados = RENOVAR;
  assert.equal(JSON.stringify(renderizarEmailLembrete({ ...BASE, dados })), JSON.stringify(renderizarEmailLembrete({ ...BASE, dados })));
});

console.log(`\nPASSOU: ${ok} casos — templates de lembrete`);
