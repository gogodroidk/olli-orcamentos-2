/**
 * Teste da SELEÇÃO de lembretes por e-mail (`src/emailLembretesPolicy.js`).
 *
 *     node scripts/teste-email-lembretes-policy.js   (de dentro de worker/)
 *
 * Protege: janelas D+3/D+7 da ativação (D+1 é só no app), no máximo 2 e-mails de
 * ativação, nada de cobrança para conta sem orçamento, gatilhos de assinatura
 * idênticos aos da faixa do app (renovar_pix D-3/D0, plano_vencido D+1), 1 e-mail
 * de cobrança por semana, não-duplicação, teto por rodada e horário comercial de
 * Brasília. Desde 01/10/2026 o Grátis é ILIMITADO: nenhum e-mail de cota, com
 * qualquer número de envios — nem quando o banco antigo ainda manda o limite 5.
 */
import assert from 'node:assert/strict';
import {
  decidirLembreteEmail,
  dentroHorarioComercial,
  horaBrasilia,
  rodadaDeSelecao,
  selecionarPedidos,
} from '../src/emailLembretesPolicy.js';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// 29/09/2026 15:00 UTC = 12:00 em Brasília.
const AGORA = new Date('2026-09-29T15:00:00.000Z');
const H = 3600e3;
const antes = (horas) => new Date(AGORA.getTime() - horas * H).toISOString();
const depois = (horas) => new Date(AGORA.getTime() + horas * H).toISOString();
const OPTS = { agora: AGORA, precoProMensal: 'R$ 39', ativacaoMaxDias: 30 };

let ok = 0;
function caso(nome, fn) {
  fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}

function candidato(extra = {}) {
  return {
    userId: U(1),
    confirmadoEm: antes(24 * 4),
    orcamentos: 0,
    membroDeEquipe: false,
    donoDoTenant: true,
    assinatura: null,
    oferta: {
      plano_efetivo: 'gratis', limite_envios: null, envios_usados: 0, envios_restantes: null,
      trial_estado: 'unstarted', trial_termina_em: null, trial_dias: 14,
    },
    historico: { ativacao: [], cobranca: [] },
    ...extra,
  };
}

/** `bancoAntigo` simula o banco antes de 20261002150000, que ainda manda o limite 5. */
function gratisComEnvios(usados, trial = 'ended', bancoAntigo = false) {
  return candidato({
    orcamentos: usados + 1,
    confirmadoEm: antes(24 * 60),
    oferta: {
      plano_efetivo: 'gratis',
      limite_envios: bancoAntigo ? 5 : null,
      envios_usados: usados,
      envios_restantes: bancoAntigo ? Math.max(0, 5 - usados) : null,
      trial_estado: trial, trial_termina_em: null, trial_dias: 14,
    },
  });
}

function pagoPix(horasParaVencer, extra = {}) {
  const ativo = horasParaVencer > 0;
  return candidato({
    orcamentos: 3,
    confirmadoEm: antes(24 * 90),
    assinatura: {
      plano: 'pro', status: 'active', current_period_end: depois(horasParaVencer),
      admin_plano_override: null, admin_override_ativo: false, admin_override_ate: null, recorrente: false,
      ...extra,
    },
    oferta: {
      plano_efetivo: ativo ? 'pro' : 'gratis', limite_envios: null, envios_usados: 0,
      envios_restantes: null, trial_estado: 'ended', trial_termina_em: null, trial_dias: 14,
    },
  });
}

console.log('\n1. Horário comercial de Brasília');
caso('12h de Brasília é horário comercial', () => {
  assert.equal(horaBrasilia(AGORA), 12);
  assert.equal(dentroHorarioComercial(AGORA), true);
});
caso('7h59 e 20h00 de Brasília ficam fora', () => {
  assert.equal(dentroHorarioComercial(new Date('2026-09-29T10:59:00.000Z')), false);
  assert.equal(dentroHorarioComercial(new Date('2026-09-29T11:00:00.000Z')), true);
  assert.equal(dentroHorarioComercial(new Date('2026-09-29T23:00:00.000Z')), false);
  assert.equal(dentroHorarioComercial(new Date('2026-09-29T22:59:00.000Z')), true);
});
caso('seleção roda só na hora cheia', () => {
  assert.equal(rodadaDeSelecao(AGORA), true);
  assert.equal(rodadaDeSelecao(new Date('2026-09-29T15:01:00.000Z')), false);
  assert.equal(rodadaDeSelecao(new Date('2026-09-30T03:00:00.000Z')), false); // meia-noite em Brasília
});

console.log('\n2. Ativação (conta confirmada, zero orçamento)');
caso('D+1: janela só do app, sem e-mail', () => {
  const d = decidirLembreteEmail(candidato({ confirmadoEm: antes(30) }), OPTS);
  assert.equal(d.enfileirar, false);
  assert.equal(d.motivo, 'ativacao_sem_email_nesta_janela');
});
caso('antes de 24h: cedo demais', () => {
  const d = decidirLembreteEmail(candidato({ confirmadoEm: antes(5) }), OPTS);
  assert.equal(d.motivo, 'ativacao_too_early');
});
caso('D+3: e-mail activation_day_3 com chave por conta+janela', () => {
  const d = decidirLembreteEmail(candidato({ confirmadoEm: antes(73) }), OPTS);
  assert.equal(d.enfileirar, true);
  assert.equal(d.pedido.template, 'lembrete_ativacao');
  assert.equal(d.pedido.purpose, 'activation_reminder');
  assert.deepEqual(d.pedido.dados, { janela: 'activation_day_3' });
  assert.match(d.pedido.idempotencyKey, new RegExp(`^onboarding:${U(1)}:${U(1)}:activation_day_3:`));
});
caso('D+7 depois do D+3: segundo e último e-mail', () => {
  const c = candidato({
    confirmadoEm: antes(24 * 7 + 1),
    historico: { ativacao: [{ chave: 'k3', janela: 'activation_day_3', em: antes(24 * 4) }], cobranca: [] },
  });
  const d = decidirLembreteEmail(c, OPTS);
  assert.equal(d.enfileirar, true);
  assert.deepEqual(d.pedido.dados, { janela: 'activation_day_7' });
});
caso('já teve D+3 e D+7: acabou (máximo 2 e-mails)', () => {
  const c = candidato({
    confirmadoEm: antes(24 * 10),
    historico: {
      ativacao: [
        { chave: 'k3', janela: 'activation_day_3', em: antes(24 * 7) },
        { chave: 'k7', janela: 'activation_day_7', em: antes(24 * 3) },
      ],
      cobranca: [],
    },
  });
  const d = decidirLembreteEmail(c, OPTS);
  // Sobra só a janela D+1, que é do app: nenhum terceiro e-mail.
  assert.equal(d.enfileirar, false);
  assert.equal(d.pedido, null);
});
caso('D+7 a menos de 48h do D+3: espera (cooldown)', () => {
  const c = candidato({
    confirmadoEm: antes(24 * 7 + 1),
    historico: { ativacao: [{ chave: 'k3', janela: 'activation_day_3', em: antes(10) }], cobranca: [] },
  });
  assert.equal(decidirLembreteEmail(c, OPTS).motivo, 'ativacao_cooldown');
});
caso('conta antiga (acima de 30 dias) não entra', () => {
  const d = decidirLembreteEmail(candidato({ confirmadoEm: antes(24 * 31) }), OPTS);
  assert.equal(d.motivo, 'ativacao_fora_da_janela');
});
caso('membro de equipe alheia não recebe ativação', () => {
  const d = decidirLembreteEmail(candidato({ confirmadoEm: antes(80), membroDeEquipe: true, donoDoTenant: false }), OPTS);
  assert.equal(d.motivo, 'membro_de_equipe');
});
caso('histórico ilegível falha fechado', () => {
  const c = candidato({ confirmadoEm: antes(80), historico: { ativacao: [{ chave: 'x', janela: 'activation_day_3', em: 'lixo' }], cobranca: [] } });
  assert.equal(decidirLembreteEmail(c, OPTS).enfileirar, false);
});

console.log('\n3. Assinatura — mesmos gatilhos da faixa do app');
caso('conta sem orçamento NUNCA recebe cobrança (vai para a trilha de ativação)', () => {
  const c = candidato({ confirmadoEm: antes(24 * 60), oferta: { ...candidato().oferta, envios_usados: 5 } });
  const d = decidirLembreteEmail(c, OPTS);
  assert.notEqual(d.pedido?.purpose, 'billing_reminder');
});
caso('Grátis ILIMITADO: 3, 5, 6 ou 40 envios no mês nunca viram e-mail de cota', () => {
  for (const n of [3, 5, 6, 40]) {
    for (const trial of ['ended', 'eligible']) {
      const d = decidirLembreteEmail(gratisComEnvios(n, trial), OPTS);
      assert.equal(d.enfileirar, false, `${n} envios (${trial})`);
      assert.equal(d.motivo, 'assinatura_tipo_sem_email');
    }
  }
});
caso('banco ANTIGO ainda mandando limite 5: o e-mail de cota também não sai', () => {
  for (const n of [3, 5]) {
    const d = decidirLembreteEmail(gratisComEnvios(n, 'ended', true), OPTS);
    assert.equal(d.enfileirar, false);
    assert.notEqual(d.motivo, 'cota_quase');
    assert.notEqual(d.motivo, 'cota_esgotada');
  }
});
caso('Grátis com 1 envio (trial_disponivel/assinar) fica só na faixa do app', () => {
  assert.equal(decidirLembreteEmail(gratisComEnvios(1, 'eligible'), OPTS).motivo, 'assinatura_tipo_sem_email');
  assert.equal(decidirLembreteEmail(gratisComEnvios(1, 'ended'), OPTS).motivo, 'assinatura_tipo_sem_email');
});
caso('Pix vencendo em 60h: D-3', () => {
  const d = decidirLembreteEmail(pagoPix(60), OPTS);
  assert.equal(d.motivo, 'renovar_pix');
  assert.equal(d.pedido.dados.momento, 'D-3');
  assert.equal(d.pedido.dados.plano, 'pro');
  assert.equal(d.pedido.dados.sequencia, `renovacao:${d.pedido.dados.venceEm}`);
  assert.match(d.pedido.idempotencyKey, /:renovacao:.*:D-3$/);
});
caso('Pix vencendo em 10h: D0', () => {
  assert.equal(decidirLembreteEmail(pagoPix(10), OPTS).pedido.dados.momento, 'D0');
});
caso('Pix vencendo em 30h ou 100h: fora do dia; em 150h a regra nem lembra', () => {
  assert.equal(decidirLembreteEmail(pagoPix(30), OPTS).motivo, 'assinatura_fora_do_dia');
  assert.equal(decidirLembreteEmail(pagoPix(100), OPTS).motivo, 'assinatura_fora_do_dia');
  assert.equal(decidirLembreteEmail(pagoPix(150), OPTS).motivo, 'assinatura_nada_a_lembrar');
});
caso('cartão recorrente (Stripe/MP) não recebe "o Pix não renova"', () => {
  assert.equal(decidirLembreteEmail(pagoPix(60, { recorrente: true }), OPTS).enfileirar, false);
});
caso('vencido há 30h: plano_vencido D+1', () => {
  const d = decidirLembreteEmail(pagoPix(-30), OPTS);
  assert.equal(d.motivo, 'plano_vencido');
  assert.equal(d.pedido.dados.momento, 'D1');
  assert.equal(d.pedido.dados.plano, 'pro');
});
caso('vencido há 5h ou há 4 dias: fora do dia', () => {
  assert.equal(decidirLembreteEmail(pagoPix(-5), OPTS).motivo, 'assinatura_fora_do_dia');
  assert.equal(decidirLembreteEmail(pagoPix(-96), OPTS).motivo, 'assinatura_fora_do_dia');
});
caso('membro de equipe (sem tenant próprio) não recebe cobrança', () => {
  assert.equal(decidirLembreteEmail({ ...gratisComEnvios(4), donoDoTenant: false }, OPTS).motivo, 'assinatura_nao_e_dono');
});
caso('oferta desconhecida (null) não vira cobrança inventada', () => {
  assert.equal(decidirLembreteEmail({ ...gratisComEnvios(4), oferta: null }, OPTS).enfileirar, false);
});

console.log('\n4. Ritmo: 1 cobrança por semana e não-duplicação');
caso('cobrança de outro motivo há 3 dias bloqueia o D-3', () => {
  const c = { ...pagoPix(60), historico: { ativacao: [], cobranca: [{ chave: 'x', sequencia: null, em: antes(72) }] } };
  assert.equal(decidirLembreteEmail(c, OPTS).motivo, 'assinatura_limite_semanal');
});
caso('cobrança há 8 dias não bloqueia', () => {
  const c = { ...pagoPix(60), historico: { ativacao: [], cobranca: [{ chave: 'x', sequencia: null, em: antes(24 * 8) }] } };
  assert.equal(decidirLembreteEmail(c, OPTS).enfileirar, true);
});
caso('D0 depois do D-3 do MESMO vencimento passa (sequência conta como uma)', () => {
  const base = pagoPix(10);
  const venceEm = new Date(base.assinatura.current_period_end).toISOString();
  const c = { ...base, historico: { ativacao: [], cobranca: [{ chave: 'd3', sequencia: `renovacao:${venceEm}`, em: antes(50) }] } };
  assert.equal(decidirLembreteEmail(c, OPTS).enfileirar, true);
});
caso('D-3 bloqueado por cobrança de OUTRO motivo na semana', () => {
  const c = { ...pagoPix(60), historico: { ativacao: [], cobranca: [{ chave: 'q', sequencia: null, em: antes(48) }] } };
  assert.equal(decidirLembreteEmail(c, OPTS).motivo, 'assinatura_limite_semanal');
});
caso('mesma chave já enfileirada não repete', () => {
  const base = pagoPix(60);
  const chave = decidirLembreteEmail(base, OPTS).pedido.idempotencyKey;
  const c = { ...base, historico: { ativacao: [], cobranca: [{ chave, sequencia: null, em: antes(24 * 8) }] } };
  assert.equal(decidirLembreteEmail(c, OPTS).motivo, 'assinatura_ja_enfileirado');
});

console.log('\n5. Lote: dedupe por conta e teto por rodada');
caso('conta repetida no lote é avaliada uma vez', () => {
  const r = selecionarPedidos([pagoPix(60), pagoPix(60)], { ...OPTS, tetoRodada: 5 });
  assert.equal(r.pedidos.length, 1);
});
caso('teto da rodada corta o excedente', () => {
  const lote = [1, 2, 3, 4].map((n) => ({ ...pagoPix(60), userId: U(n) }));
  const r = selecionarPedidos(lote, { ...OPTS, tetoRodada: 2 });
  assert.equal(r.pedidos.length, 2);
  assert.equal(r.motivos.teto_da_rodada, 2);
});
caso('candidato malformado não derruba o lote', () => {
  const r = selecionarPedidos([null, { userId: 'x' }, pagoPix(60)], { ...OPTS, tetoRodada: 5 });
  assert.equal(r.pedidos.length, 1);
  assert.equal(r.motivos.candidato_invalido, 2);
});
caso('decisão e motivos não carregam e-mail nem nome', () => {
  const r = selecionarPedidos([gratisComEnvios(3), pagoPix(60)], { ...OPTS, tetoRodada: 5 });
  assert.equal(/@/.test(JSON.stringify(r)), false);
});
caso('preço fora do formato falha fechado', () => {
  assert.equal(decidirLembreteEmail(gratisComEnvios(3), { ...OPTS, precoProMensal: '39' }).motivo, 'preco_invalido');
});

console.log(`\nPASSOU: ${ok} casos — seleção de lembretes por e-mail`);
