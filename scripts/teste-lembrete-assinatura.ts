/**
 * Teste da regra de LEMBRETE DE ASSINATURA (`src/services/lembreteAssinatura.ts`).
 *
 *     node scripts/teste-lembrete-assinatura.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Protege: conta nova sem orçamento não é cobrada; limite esgotado e vencimento
 * próximo não somem; quem paga no cartão (renova sozinho) não é lembrado; "não sei"
 * (dados nulos) nunca vira lembrete inventado.
 */
import {
  chaveDispensaLembrete,
  lembreteAssinatura,
  lembreteDispensado,
  type EntradaLembrete,
} from '../src/services/lembreteAssinatura.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const AGORA = new Date('2026-09-29T12:00:00.000Z');
const emDias = (n: number) => new Date(AGORA.getTime() + n * 864e5).toISOString();

function gratis(usados: number, trial: EntradaLembrete['oferta'] extends infer T ? (T extends { trialEstado: infer S } ? S : never) : never = 'ended'): EntradaLembrete {
  return {
    agora: AGORA,
    precoProMensal: 'R$ 39,00',
    assinatura: { planoEfetivo: 'gratis', planoContratado: 'gratis', origem: 'gratis' },
    oferta: {
      planoEfetivo: 'gratis', limiteEnvios: 5, enviosUsados: usados, enviosRestantes: Math.max(0, 5 - usados),
      trialEstado: trial, trialTerminaEm: null, trialDias: 14,
    },
  };
}

function pagoPix(diasParaVencer: number, renovaSozinho = false): EntradaLembrete {
  return {
    agora: AGORA,
    precoProMensal: 'R$ 39,00',
    assinatura: {
      planoEfetivo: diasParaVencer > 0 ? 'pro' : 'gratis', planoContratado: 'pro', origem: diasParaVencer > 0 ? 'pagamento' : 'gratis',
      renovaSozinho, proximaCobranca: emDias(diasParaVencer),
    },
    oferta: null,
  };
}

console.log('\n1. Grátis');
checar('conta nova sem orçamento não é cobrada', lembreteAssinatura(gratis(0)), null);
checar('1 enviado, já testou → "assinar" leve', lembreteAssinatura(gratis(1))?.tipo, 'assinar');
checar('1 enviado, pode testar → oferece teste grátis', lembreteAssinatura(gratis(1, 'eligible'))?.cta.acao, 'iniciar_trial');
checar('3 de 5 → cota_quase (atenção)', [lembreteAssinatura(gratis(3))?.tipo, lembreteAssinatura(gratis(3))?.urgencia], ['cota_quase', 'atencao']);
checar('4 de 5 → "Falta 1"', lembreteAssinatura(gratis(4))?.titulo, 'Falta 1 orçamento grátis este mês');
const esgotado = lembreteAssinatura(gratis(5));
checar('5 de 5 → cota_esgotada crítica e NÃO dispensável', [esgotado?.tipo, esgotado?.urgencia, esgotado?.dispensavelPorHoras], ['cota_esgotada', 'critico', null]);
checar('esgotado com teste disponível → teste primeiro, assinar de segunda', [lembreteAssinatura(gratis(5, 'eligible'))?.cta.acao, lembreteAssinatura(gratis(5, 'eligible'))?.ctaSecundario?.acao], ['iniciar_trial', 'planos']);
checar('texto cita o preço e o Pix', /R\$ 39,00.*Pix/.test(esgotado?.texto ?? ''), true);
checar('id muda por mês', esgotado?.id, 'cota_esgotada:2026-09');

console.log('\n2. Pagou no Pix (não renova sozinho)');
checar('vence em 10 dias → nada ainda', lembreteAssinatura(pagoPix(10)), null);
checar('vence em 5 dias → renovar (info, dispensável 24h)', [lembreteAssinatura(pagoPix(5))?.tipo, lembreteAssinatura(pagoPix(5))?.urgencia, lembreteAssinatura(pagoPix(5))?.dispensavelPorHoras], ['renovar_pix', 'info', 24]);
checar('vence em 2 dias → atenção e NÃO dispensável', [lembreteAssinatura(pagoPix(2))?.urgencia, lembreteAssinatura(pagoPix(2))?.dispensavelPorHoras], ['atencao', null]);
checar('vence amanhã → crítico', [lembreteAssinatura(pagoPix(1))?.urgencia, lembreteAssinatura(pagoPix(1))?.titulo], ['critico', 'Seu Pro vence amanhã']);
checar('cartão recorrente (renova sozinho) → nunca lembra', lembreteAssinatura(pagoPix(1, true)), null);
checar('venceu há 3 dias → plano_vencido crítico', [lembreteAssinatura(pagoPix(-3))?.tipo, lembreteAssinatura(pagoPix(-3))?.urgencia], ['plano_vencido', 'critico']);
checar('venceu há 40 dias → não insiste mais', lembreteAssinatura(pagoPix(-40)), null);

console.log('\n3. Teste do Pro');
const trial = (dias: number): EntradaLembrete => ({
  agora: AGORA, precoProMensal: 'R$ 39,00', assinatura: null,
  oferta: { planoEfetivo: 'pro', limiteEnvios: null, enviosUsados: 0, enviosRestantes: null, trialEstado: 'active', trialTerminaEm: emDias(dias), trialDias: 14 },
});
checar('teste com 10 dias → nada', lembreteAssinatura(trial(10)), null);
checar('teste acaba em 3 dias → trial_acabando', lembreteAssinatura(trial(3))?.tipo, 'trial_acabando');
checar('teste acaba amanhã → crítico e não dispensável', [lembreteAssinatura(trial(1))?.urgencia, lembreteAssinatura(trial(1))?.dispensavelPorHoras], ['critico', null]);

console.log('\n4. Não sei ≠ cobrança');
checar('sem oferta e sem assinatura → null', lembreteAssinatura({ agora: AGORA, precoProMensal: 'R$ 39,00', oferta: null, assinatura: null }), null);
checar('Pro pago no cartão com oferta confirmada → null', lembreteAssinatura({
  agora: AGORA, precoProMensal: 'R$ 39,00',
  assinatura: { planoEfetivo: 'pro', planoContratado: 'pro', origem: 'pagamento', renovaSozinho: true, proximaCobranca: emDias(1) },
  oferta: { planoEfetivo: 'pro', limiteEnvios: null, enviosUsados: 9, enviosRestantes: null, trialEstado: 'ended', trialTerminaEm: null, trialDias: 14 },
}), null);

console.log('\n5. Dispensar');
const leve = lembreteAssinatura(gratis(1))!;
checar('dispensado há 1h → escondido', lembreteDispensado(leve, new Date(AGORA.getTime() - 3600e3).toISOString(), AGORA), true);
checar('dispensado há 4 dias → volta', lembreteDispensado(leve, new Date(AGORA.getTime() - 4 * 864e5).toISOString(), AGORA), false);
checar('não dispensável ignora o "agora não"', lembreteDispensado(esgotado!, AGORA.toISOString(), AGORA), false);
checar('chave por conta e motivo', chaveDispensaLembrete('u1', leve), 'olli.lembrete.u1.assinar:2026-09');

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
