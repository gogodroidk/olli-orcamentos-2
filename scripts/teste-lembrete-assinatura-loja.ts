/**
 * Teste da adaptação do LEMBRETE DE ASSINATURA às lojas
 * (`src/services/lembreteAssinaturaLoja.ts`).
 *
 *     node scripts/teste-lembrete-assinatura-loja.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Protege: no iOS e no Android (build da Play) nenhum lembrete mostra botão de
 * compra (`planos`/`renovar_pix`) nem texto com preço/Pix/pagamento; o teste
 * grátis do Pro continua; plataforma desconhecida é tratada como loja; na web o
 * lembrete sai exatamente como a regra escreveu.
 */
import { lembreteAssinatura, type EntradaLembrete, type Lembrete } from '../src/services/lembreteAssinatura.ts';
import { lembreteParaPlataforma } from '../src/services/lembreteAssinaturaLoja.ts';

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
type Trial = NonNullable<EntradaLembrete['oferta']>['trialEstado'];

function gratis(usados: number, trial: Trial = 'ended'): EntradaLembrete {
  return {
    agora: AGORA,
    precoProMensal: 'R$ 39',
    assinatura: { planoEfetivo: 'gratis', planoContratado: 'gratis', origem: 'gratis' },
    oferta: {
      planoEfetivo: 'gratis', limiteEnvios: 5, enviosUsados: usados, enviosRestantes: Math.max(0, 5 - usados),
      trialEstado: trial, trialTerminaEm: null, trialDias: 14,
    },
  };
}
function pagoPix(dias: number): EntradaLembrete {
  return {
    agora: AGORA,
    precoProMensal: 'R$ 39',
    assinatura: {
      planoEfetivo: dias > 0 ? 'pro' : 'gratis', planoContratado: 'pro', origem: dias > 0 ? 'pagamento' : 'gratis',
      renovaSozinho: false, proximaCobranca: emDias(dias),
    },
    oferta: null,
  };
}
const trialAcabando: EntradaLembrete = {
  agora: AGORA, precoProMensal: 'R$ 39', assinatura: null,
  oferta: { planoEfetivo: 'pro', limiteEnvios: null, enviosUsados: 0, enviosRestantes: null, trialEstado: 'active', trialTerminaEm: emDias(2), trialDias: 14 },
};

// Todos os tipos da regra, com e sem teste disponível.
const casos: [string, EntradaLembrete][] = [
  ['assinar', gratis(1)],
  ['trial_disponivel', gratis(1, 'eligible')],
  ['cota_quase', gratis(3)],
  ['cota_quase + teste', gratis(3, 'eligible')],
  ['cota_esgotada', gratis(5)],
  ['cota_esgotada + teste', gratis(5, 'eligible')],
  ['renovar_pix', pagoPix(2)],
  ['plano_vencido', pagoPix(-3)],
  ['trial_acabando', trialAcabando],
];

const VENDA = /R\$|\bpix\b|pagar|pagamento|assin|renove|renovar|preço/i;

for (const plataforma of ['ios', 'android', 'windows']) {
  console.log(`\n${plataforma} (loja / fail-closed)`);
  for (const [nome, entrada] of casos) {
    const l = lembreteAssinatura(entrada) as Lembrete;
    const x = lembreteParaPlataforma(l, plataforma);
    if (!x) {
      checar(`${nome}: some (só "assinar" pode sumir)`, l.tipo, 'assinar');
      continue;
    }
    const acoes = [x.cta?.acao, x.ctaSecundario?.acao].filter(Boolean);
    checar(`${nome}: sem botão de compra`, acoes.filter((a) => a === 'planos' || a === 'renovar_pix'), []);
    checar(`${nome}: sem preço/Pix/pagamento no texto`, VENDA.test(`${x.titulo} ${x.texto} ${x.cta?.rotulo ?? ''} ${x.ctaSecundario?.rotulo ?? ''}`), false);
    checar(`${nome}: mantém id, urgência e dispensa`, [x.id, x.urgencia, x.dispensavelPorHoras], [l.id, l.urgencia, l.dispensavelPorHoras]);
  }
}

console.log('\nteste grátis continua nas lojas');
const esgotadoTeste = lembreteParaPlataforma(lembreteAssinatura(gratis(5, 'eligible'))!, 'ios');
checar('cota_esgotada + teste → só o teste, como primário', [esgotadoTeste?.cta?.acao, esgotadoTeste?.ctaSecundario], ['iniciar_trial', null]);
const quaseTeste = lembreteParaPlataforma(lembreteAssinatura(gratis(3, 'eligible'))!, 'android');
checar('cota_quase + teste → teste sobe de secundário para primário', [quaseTeste?.cta?.acao, quaseTeste?.ctaSecundario], ['iniciar_trial', null]);
checar('cota_esgotada no iOS → texto neutro', lembreteParaPlataforma(lembreteAssinatura(gratis(5))!, 'ios')?.texto, 'O limite volta no dia 1.');
checar('"assinar" leve não aparece na loja', lembreteParaPlataforma(lembreteAssinatura(gratis(1))!, 'ios'), null);

console.log('\nweb');
for (const [nome, entrada] of casos) {
  const l = lembreteAssinatura(entrada)!;
  checar(`${nome}: intacto na web`, lembreteParaPlataforma(l, 'web'), l);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
