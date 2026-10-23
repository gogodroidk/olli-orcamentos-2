/**
 * Teste da RÉGUA DE REENGAJAMENTO (03/10/2026): política + template.
 *
 *     node scripts/teste-email-regua-reengajamento.js   (de dentro de worker/)
 *
 * Protege: última chamada de ativação (zero orçamento, 30–120 dias, 1 na vida),
 * "orçou e parou" D7/D14 (no máximo 2 por episódio, para depois de 30 dias),
 * teste do Pro acabando (24–72 h, 1 por teste), teto de 1 e-mail por pessoa a
 * cada 24 h, prioridade da cobrança e da ativação D+3/D+7 sobre a régua nova,
 * banco antigo (sem histórico de reengajamento) = régua nova não decide, e copy
 * derivada da fonte (PRECO_PRO, frasePro, FRASE_GRATIS), com descadastro.
 */
import assert from 'node:assert/strict';
import { decidirLembreteEmail, selecionarPedidos } from '../src/emailLembretesPolicy.js';
import { renderizarEmailLembrete } from '../src/emailLembretesTemplate.js';
import { PRECO_PRO, reais } from '../../src/services/precosPlanos.ts';
import { FRASE_GRATIS, frasePro } from '../../src/services/planosBase.ts';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGORA = new Date('2026-10-05T15:00:00.000Z'); // 12:00 em Brasília
const H = 3600e3;
const D = 24 * H;
const antes = (ms) => new Date(AGORA.getTime() - ms).toISOString();
const depois = (ms) => new Date(AGORA.getTime() + ms).toISOString();
const OPTS = { agora: AGORA, precoProMensal: 'R$ 39', ativacaoMaxDias: 30 };

let ok = 0;
function caso(nome, fn) {
  fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}

function candidato(extra = {}) {
  const { historico, oferta, ...resto } = extra;
  return {
    userId: U(1),
    confirmadoEm: antes(45 * D),
    orcamentos: 0,
    ultimoOrcamentoEm: null,
    ultimoEmailEm: null,
    membroDeEquipe: false,
    donoDoTenant: true,
    assinatura: null,
    oferta: {
      plano_efetivo: 'gratis', limite_envios: null, envios_usados: 0, envios_restantes: null,
      trial_estado: 'ended', trial_termina_em: null, trial_dias: 14,
      ...(oferta || {}),
    },
    historico: { ativacao: [], cobranca: [], reengajamento: [], ...(historico || {}) },
    ...resto,
  };
}

console.log('\n1) Última chamada de ativação');
caso('zero orçamento e 45 dias → ativacao_ultima', () => {
  const d = decidirLembreteEmail(candidato(), OPTS);
  assert.equal(d.enfileirar, true);
  assert.equal(d.pedido.template, 'lembrete_reengajamento');
  assert.equal(d.pedido.purpose, 'reengagement_reminder');
  assert.deepEqual({ ...d.pedido.dados }, { tipo: 'ativacao_ultima' });
  assert.equal(d.pedido.idempotencyKey, `reengajamento:${U(1)}:ativacao_ultima`);
});
caso('dentro dos 30 dias continua na ativação D+3/D+7 (não na régua nova)', () => {
  const d = decidirLembreteEmail(candidato({ confirmadoEm: antes(4 * D) }), OPTS);
  assert.equal(d.pedido?.template ?? null, 'lembrete_ativacao');
});
caso('mais de 120 dias → nada', () => {
  assert.equal(decidirLembreteEmail(candidato({ confirmadoEm: antes(121 * D) }), OPTS).motivo, 'ativacao_ultima_tarde');
});
caso('só uma vez na vida', () => {
  const c = candidato({ historico: { reengajamento: [{ chave: 'x', tipo: 'ativacao_ultima', em: antes(10 * D) }] } });
  assert.equal(decidirLembreteEmail(c, OPTS).motivo, 'ativacao_ultima_ja_enviada');
});
caso('membro de equipe alheia nunca recebe', () => {
  assert.equal(decidirLembreteEmail(candidato({ membroDeEquipe: true, donoDoTenant: false }), OPTS).enfileirar, false);
});

console.log('\n2) Orçou e parou');
const parou = (diasSemOrcamento, extra = {}) => candidato({
  orcamentos: 3,
  confirmadoEm: antes(60 * D),
  ultimoOrcamentoEm: antes(diasSemOrcamento * D),
  ...extra,
});
caso('8 dias sem orçamento novo → parou d7', () => {
  const d = decidirLembreteEmail(parou(8), OPTS);
  assert.equal(d.enfileirar, true);
  assert.equal(d.pedido.dados.tipo, 'parou');
  assert.equal(d.pedido.dados.etapa, 'd7');
  assert.equal(d.pedido.dados.ultimoOrcamentoEm, antes(8 * D));
  assert.equal(d.pedido.idempotencyKey, `reengajamento:${U(1)}:parou:${antes(8 * D)}:d7`);
});
caso('15 dias → parou d14', () => {
  assert.equal(decidirLembreteEmail(parou(15), OPTS).pedido.dados.etapa, 'd14');
});
caso('6 dias e 31 dias → nada', () => {
  assert.equal(decidirLembreteEmail(parou(6), OPTS).enfileirar, false);
  assert.equal(decidirLembreteEmail(parou(31), OPTS).enfileirar, false);
});
caso('mesma chave já enfileirada → não repete', () => {
  const chave = `reengajamento:${U(1)}:parou:${antes(8 * D)}:d7`;
  const c = parou(8, { historico: { reengajamento: [{ chave, tipo: 'parou', em: antes(D + H) }] } });
  assert.equal(decidirLembreteEmail(c, OPTS).motivo, 'reengajamento_ja_enfileirado');
});
caso('quem não é dono do tenant não recebe', () => {
  assert.equal(decidirLembreteEmail(parou(8, { donoDoTenant: false }), OPTS).enfileirar, false);
});

console.log('\n3) Teste do Pro acabando');
const trial = (horasParaAcabar) => candidato({
  orcamentos: 2,
  confirmadoEm: antes(10 * D),
  ultimoOrcamentoEm: antes(D),
  oferta: { plano_efetivo: 'pro', trial_estado: 'active', trial_termina_em: depois(horasParaAcabar * H) },
});
caso('48 h para acabar → trial_acabando', () => {
  const d = decidirLembreteEmail(trial(48), OPTS);
  assert.equal(d.enfileirar, true);
  assert.deepEqual({ ...d.pedido.dados }, { tipo: 'trial_acabando', terminaEm: depois(48 * H) });
});
const encerrado = (horasDepois, extra = {}) => candidato({
  orcamentos: 2,
  confirmadoEm: antes(30 * D),
  ultimoOrcamentoEm: antes(D),
  oferta: { plano_efetivo: 'gratis', trial_estado: 'ended', trial_termina_em: antes(horasDepois * H) },
  ...extra,
});
caso('teste acabou há 2 dias → trial_encerrado (1 por teste)', () => {
  const d = decidirLembreteEmail(encerrado(48), OPTS);
  assert.equal(d.enfileirar, true);
  assert.deepEqual({ ...d.pedido.dados }, { tipo: 'trial_encerrado', terminaEm: antes(48 * H) });
  assert.match(d.pedido.idempotencyKey, /:trial_encerrado:/);
});
caso('trial_encerrado: quem já paga (plano efetivo pro) NÃO recebe "voltou ao Grátis"', () => {
  const pago = encerrado(48, { oferta: { plano_efetivo: 'pro', trial_estado: 'ended', trial_termina_em: antes(48 * H) } });
  assert.notEqual(decidirLembreteEmail(pago, OPTS).motivo, 'reengajamento_trial_encerrado');
  const semPlano = encerrado(48, { oferta: { plano_efetivo: null, trial_estado: 'ended', trial_termina_em: antes(48 * H) } });
  assert.notEqual(decidirLembreteEmail(semPlano, OPTS).motivo, 'reengajamento_trial_encerrado');
});
caso('trial_encerrado: fora de 0–7 dias, não-dono e já enviado → nada', () => {
  assert.notEqual(decidirLembreteEmail(encerrado(8 * 24), OPTS).motivo, 'reengajamento_trial_encerrado');
  assert.equal(decidirLembreteEmail(encerrado(48, { donoDoTenant: false }), OPTS).enfileirar, false);
  const chave = decidirLembreteEmail(encerrado(48), OPTS).pedido.idempotencyKey;
  const c = encerrado(48, { historico: { reengajamento: [{ chave, tipo: 'trial_encerrado', em: antes(30 * H) }] } });
  assert.equal(decidirLembreteEmail(c, OPTS).motivo, 'reengajamento_ja_enfileirado');
});
caso('12 h e 100 h → nada', () => {
  assert.equal(decidirLembreteEmail(trial(12), OPTS).enfileirar, false);
  assert.equal(decidirLembreteEmail(trial(100), OPTS).enfileirar, false);
});

console.log('\n4) Teto, prioridade e banco antigo');
caso('e-mail nas últimas 24 h → teto_pessoa_dia (qualquer segmento)', () => {
  for (const c of [candidato(), parou(8), trial(48), candidato({ confirmadoEm: antes(4 * D) })]) {
    const d = decidirLembreteEmail({ ...c, ultimoEmailEm: antes(5 * H) }, OPTS);
    assert.equal(d.motivo, 'teto_pessoa_dia');
  }
});
caso('e-mail há 25 h não bloqueia', () => {
  assert.equal(decidirLembreteEmail({ ...parou(8), ultimoEmailEm: antes(25 * H) }, OPTS).enfileirar, true);
});
caso('banco antigo (sem historico.reengajamento) → régua nova não decide', () => {
  const velho = (c) => ({ ...c, historico: { ativacao: c.historico.ativacao, cobranca: c.historico.cobranca } });
  assert.equal(decidirLembreteEmail(velho(candidato()), OPTS).enfileirar, false);
  assert.equal(decidirLembreteEmail(velho(parou(8)), OPTS).enfileirar, false);
  assert.equal(decidirLembreteEmail(velho(trial(48)), OPTS).enfileirar, false);
});
caso('cobrança de renovação tem prioridade sobre "parou"', () => {
  const vence = depois(60 * H);
  const c = parou(8, {
    assinatura: { plano: 'pro', status: 'active', current_period_end: vence, admin_plano_override: null, admin_override_ativo: false, admin_override_ate: null, recorrente: false },
    oferta: { plano_efetivo: 'pro' },
  });
  assert.equal(decidirLembreteEmail(c, OPTS).pedido.template, 'lembrete_assinatura');
});
caso('lote: um pedido por conta e motivos sem PII', () => {
  const r = selecionarPedidos([candidato(), candidato(), parou(8, { userId: U(2) }), trial(48)], { ...OPTS, tetoRodada: 5 });
  assert.equal(r.pedidos.length, 2); // U(1) duas vezes e trial(48) também é U(1)
  assert.equal(/@/.test(JSON.stringify(r)), false);
});

console.log('\n5) Copy derivada da fonte');
const UNSUB = 'https://diagnostico.olliorcamentos.online/email/descadastrar?u=00000000-0000-4000-8000-000000000001&e=lembretes&a=abc';
function render(dados) {
  return renderizarEmailLembrete({
    eventId: `reengajamento:${U(1)}:${dados.tipo}`,
    template: 'lembrete_reengajamento',
    templateVersion: 'lembrete_reengajamento.v1',
    purpose: 'reengagement_reminder',
    dados,
    appUrl: 'https://app.olliorcamentos.online',
    supportUrl: 'https://olliorcamentos.online/ajuda/',
    logoUrl: 'https://olliorcamentos.online/icon-192.png',
    unsubscribeUrl: UNSUB,
  });
}
caso('trial: preço e benefícios vêm de PRECO_PRO e frasePro()', () => {
  const e = render({ tipo: 'trial_acabando', terminaEm: '2026-10-17T12:00:00.000Z' });
  assert.ok(e.text.includes(`${reais(PRECO_PRO.mensalCentavos)}/mês`));
  assert.ok(e.text.includes(frasePro()));
  assert.ok(e.text.includes('não renova sozinho'));
  assert.ok(e.html.includes('/planos'));
});
caso('trial_encerrado: e-mail com preço da fonte, sem Pix embutido e sem dado do cliente', () => {
  const e = render({ tipo: 'trial_encerrado', terminaEm: '2026-10-20T12:00:00.000Z' });
  assert.match(e.text, /R\$\s?374,40/);
  assert.match(e.text, /20%/);
  assert.doesNotMatch(e.text, /na hora|nada foi apagado/i);
  const erro = (fn) => { try { fn(); } catch (e) { return e.codigo; } return null; };
  assert.equal(erro(() => render({ tipo: 'trial_encerrado', terminaEm: 'ontem' })), 'dados_invalidos');
});
caso('última chamada: frase do Grátis vem de FRASE_GRATIS', () => {
  assert.ok(render({ tipo: 'ativacao_ultima' }).text.includes(FRASE_GRATIS));
});
caso('parou d7/d14 citam a data do último orçamento e levam ao app', () => {
  const d7 = render({ tipo: 'parou', etapa: 'd7', ultimoOrcamentoEm: '2026-09-25T15:00:00.000Z' });
  assert.ok(d7.text.includes('25/09'));
  const d14 = render({ tipo: 'parou', etapa: 'd14', ultimoOrcamentoEm: '2026-09-18T15:00:00.000Z' });
  assert.ok(d14.text.includes('último lembrete deste tipo'));
});
caso('todo e-mail da régua tem descadastro no HTML e no texto, sem PII', () => {
  for (const dados of [
    { tipo: 'ativacao_ultima' },
    { tipo: 'parou', etapa: 'd7', ultimoOrcamentoEm: '2026-09-25T15:00:00.000Z' },
    { tipo: 'trial_acabando', terminaEm: '2026-10-17T12:00:00.000Z' },
  ]) {
    const e = render(dados);
    assert.ok(e.html.includes('Parar de receber lembretes</a>'));
    assert.ok(e.text.includes(UNSUB));
    assert.equal(/@/.test(`${e.subject}${e.text}`), false);
  }
});
caso('dado estranho falha fechado (vira dead_letter, nunca e-mail torto)', () => {
  const erro = (fn) => { try { fn(); } catch (e) { return e.codigo; } return null; };
  assert.equal(erro(() => render({ tipo: 'parou', etapa: 'd30', ultimoOrcamentoEm: '2026-09-25T15:00:00.000Z' })), 'dados_invalidos');
  assert.equal(erro(() => render({ tipo: 'trial_acabando', terminaEm: 'amanhã' })), 'dados_invalidos');
  assert.equal(erro(() => render({ tipo: 'promocao' })), 'tipo_invalido');
  assert.equal(erro(() => render({ tipo: 'ativacao_ultima', extra: 1 })), 'dados_invalidos');
});

console.log(`\nPASSOU: ${ok} casos — régua de reengajamento`);
