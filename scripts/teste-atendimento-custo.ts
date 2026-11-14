/**
 * Custo e teto da Central. Não mexe em preço publicado.
 *
 *     node scripts/teste-atendimento-custo.ts
 * Exit 0 = passou; 1 = falhou.
 */
import { readFileSync } from 'node:fs';
import {
  ACEITES_QR,
  HIPOTESE_PILOTO_CENTAVOS,
  MODELO_ATENDENTE,
  MODELO_FLASH_WORKER,
  TARIFA_META_BR,
  TETO_PILOTO,
  aceitesQrFaltando,
  canalParaNumeroDoCliente,
  custoIaDasRespostas,
  custoIaMicroreais,
  custoMetaMicroreais,
  custoNoTetoOficialMicroreais,
  estourouTeto,
  microreaisParaCentavos,
  podeEnviarMarketing,
  podeLigarQr,
  podeResponderNoTeto,
  taxaPilotoAbacateCentavos,
} from '../src/services/atendimentoCusto.ts';

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

function ler(caminho: string): string {
  return readFileSync(new URL(caminho, import.meta.url), 'utf8');
}

console.log('\n1) META — Brasil, card de 1º/10/2026');
checar('150 utilidades = R$ 5,25', microreaisParaCentavos(custoMetaMicroreais({
  servico: 0, utilidade: 150, autenticacao: 0, marketing: 0,
})), 525);
checar('800 serviços ainda na franquia', microreaisParaCentavos(custoMetaMicroreais({
  servico: 800, utilidade: 0, autenticacao: 0, marketing: 0,
})), 0);
checar('2.000 serviços acima da franquia = R$ 70,00', microreaisParaCentavos(custoMetaMicroreais({
  servico: 3_000, utilidade: 0, autenticacao: 0, marketing: 0,
})), 7_000);
checar('500 marketing = R$ 160,85', microreaisParaCentavos(custoMetaMicroreais({
  servico: 0, utilidade: 0, autenticacao: 0, marketing: 500,
})), 16_085);
checar('1 marketing = 32 centavos (R$ 0,3217 arredonda)', microreaisParaCentavos(TARIFA_META_BR.marketing), 32);

console.log('\n2) IA — Flash-Lite pago, PTAX venda 13/11/2026');
checar('1,5 mil respostas curtas cabem em R$ 1,19', microreaisParaCentavos(custoIaDasRespostas(1_500)), 119);
checar('800 respostas curtas = R$ 0,63', microreaisParaCentavos(custoIaDasRespostas(800)), 63);
const flashCaro = custoIaMicroreais({
  tokensEntrada: 3_000 * 800,
  tokensSaida: 3_000 * 950,
  usdEntradaPorMilhaoMicro: MODELO_FLASH_WORKER.usdEntradaPorMilhaoMicro,
  usdSaidaPorMilhaoMicro: MODELO_FLASH_WORKER.usdSaidaPorMilhaoMicro,
});
checar('3 mil respostas no flash com raciocínio = R$ 44,34', microreaisParaCentavos(flashCaro), 4_434);

console.log('\n3) TETO — o mês cheio do piloto não passa de R$ 4,69');
const teto = custoNoTetoOficialMicroreais();
checar('Meta no teto = R$ 3,50', microreaisParaCentavos(teto.meta), 350);
checar('IA no teto = R$ 1,19', microreaisParaCentavos(teto.ia), 119);
checar('soma = R$ 4,69', microreaisParaCentavos(teto.total), 469);
checar('serviço no teto não gera tarifa', microreaisParaCentavos(custoMetaMicroreais({
  servico: TETO_PILOTO.servico, utilidade: 0, autenticacao: 0, marketing: 0,
})), 0);

const usoCheio = {
  numeros: 1,
  respostasIa: TETO_PILOTO.respostasIa,
  servico: TETO_PILOTO.servico,
  utilidade: TETO_PILOTO.utilidade,
  autenticacao: 0,
  marketing: 0,
};
checar('no teto ainda não estourou', estourouTeto(usoCheio), []);
checar('a próxima resposta para', podeResponderNoTeto(usoCheio), false);
checar('marketing estoura mesmo com o resto folgado', estourouTeto({ ...usoCheio, marketing: 1, respostasIa: 0 }), ['marketing']);

console.log('\n4) QR SÓ COM ACEITE; MARKETING SÓ COM CUSTO MOSTRADO');
checar('lista de aceites tem 9 itens', ACEITES_QR.length, 9);
checar('sem aceite não liga', podeLigarQr([]), false);
checar('falta um, não liga', podeLigarQr(ACEITES_QR.slice(1)), false);
checar('aceite inteiro liga o QR', podeLigarQr(ACEITES_QR), true);
checar('sem Tech Provider e sem aceite: não liga', canalParaNumeroDoCliente({
  somosTechProvider: false, aceitesQr: [],
}), 'nao_ligar');
checar('sem Tech Provider e com aceite: QR de piloto', canalParaNumeroDoCliente({
  somosTechProvider: false, aceitesQr: ACEITES_QR,
}), 'qr_piloto');
checar('Tech Provider: oficial, mesmo sem aceite de QR', canalParaNumeroDoCliente({
  somosTechProvider: true, aceitesQr: [],
}), 'oficial_embedded');
checar('o que falta é nomeado', aceitesQrFaltando(['sair']), ACEITES_QR.filter((item) => item !== 'sair'));

const custoQuinhentos = microreaisParaCentavos(custoMetaMicroreais({
  servico: 0, utilidade: 0, autenticacao: 0, marketing: 500,
}));
checar('marketing com o centavo certo passa', podeEnviarMarketing({
  optIn: true, mensagens: 500, centavosMostrados: custoQuinhentos,
}), true);
checar('marketing sem opt-in não passa', podeEnviarMarketing({
  optIn: false, mensagens: 500, centavosMostrados: custoQuinhentos,
}), false);
checar('marketing com centavo a menos não passa', podeEnviarMarketing({
  optIn: true, mensagens: 500, centavosMostrados: custoQuinhentos - 1,
}), false);

console.log('\n5) PREÇO PUBLICADO NÃO ENTRA AQUI');
checar('hipótese do piloto é 14900 centavos', HIPOTESE_PILOTO_CENTAVOS, 14_900);
checar('taxa do Pix do piloto, recebido e sacado, R$ 1,60', taxaPilotoAbacateCentavos(true), 160);
const tela = ler('../src/screens/PlanosScreen.tsx');
const landing = ler('../web/src/data/planos.ts');
const fonte = ler('../src/services/precosPlanos.ts');
checar('PlanosScreen não importa este módulo', tela.includes('atendimentoCusto'), false);
checar('landing não importa este módulo', landing.includes('atendimentoCusto'), false);
checar('fonte publicada não importa este módulo', fonte.includes('atendimentoCusto'), false);
checar('modelo do atendente é o lite', MODELO_ATENDENTE.id, 'gemini-2.5-flash-lite');

const schema = ler('../docs/produto-atendimento/schema-proposta.sql');
checar('schema avisa para não aplicar', schema.startsWith('-- NÃO APLICAR.'), true);
checar('schema não está na pasta de migration', schema.includes('supabase/migrations'), false);

console.log(`\n${passes} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
