/**
 * Custo e teto da Central de atendimento — conta pura, sem rede e sem preço publicado.
 *
 * Não é a fonte do Pro nem da Empresa. Quem importa este arquivo numa tela de
 * plano publica uma hipótese. O teste `scripts/teste-atendimento-custo.ts`
 * trava isso.
 *
 * Unidade interna: microreal. 1 real = 1_000_000 microreais. 1 centavo = 10_000.
 * A tarifa da Meta tem 4 casas (R$ 0,0350), então centavo inteiro perderia o resto.
 *
 * Fontes dos números, lidas em 13/11/2026, estão no comentário de cada constante.
 * Hipótese de preço do piloto não é oferta. Publicar exige o Dr. Paulo e ordem do Igor.
 */

/** 1 real nestas contas. */
export const MICROREAIS_POR_REAL = 1_000_000;
/** 1 centavo. */
export const MICROREAIS_POR_CENTAVO = 10_000;

/**
 * PTAX venda, 13/11/2026 13:03:27, série Olinda do Banco Central
 * (CotacaoDolarDia, dataCotacao 11-13-2026): 5,6518.
 * É o quanto custa comprar 1 dólar. Serve para transformar a fatura da IA em reais.
 */
export const PTAX_VENDA_MICROREAIS_POR_USD = 5_651_800;

/**
 * Tarifa de lista da Meta para mensagem entregue a número do Brasil, em reais,
 * vigente em 1º/10/2026. Três leituras bateram em 13/11/2026: o trecho do PDF
 * "Cost per message in BRL on the WhatsApp Business Platform, effective October 1, 2026"
 * (linha Brazil: 0,3217 / 0,0350 / 0,0350 / n/a / 0,0350), whautomate.com e
 * calypso.so, ambos citando o mesmo card. A página HTML da Meta aponta o CSV
 * e não repete o número do Brasil no trecho indexado. Próxima janela de mudança
 * que essas fontes anunciam: 1º/01/2027.
 *
 * Serviço: as primeiras 1.000 entregas do mês, por número, não são cobradas.
 * Utilidade e autenticação têm degrau de volume; abaixo de 250 mil e 500 mil
 * no mês a tarifa é a de lista. O piloto não chega perto. Marketing não tem degrau.
 */
export const TARIFA_META_BR = {
  marketing: 321_700,
  utilidade: 35_000,
  autenticacao: 35_000,
  servico: 35_000,
  franquiaServico: 1_000,
} as const;

/**
 * Gemini 2.5 Flash-Lite, nível pago, por 1 milhão de tokens, página de preços
 * do Gemini (aistudio.google.com/docs/pricing), lida em 13/11/2026.
 * Entrada de texto US$ 0,10. Saída, inclusive token de raciocínio, US$ 0,40.
 * No nível pago o Google diz que o conteúdo não é usado para melhorar o produto.
 * O nível grátis diz que é. Conversa de cliente não vai no nível grátis.
 *
 * O worker hoje cai em `gemini-2.5-flash` quando não há modelo na configuração
 * (`worker/src/ai.js`). Esse modelo está marcado como descontinuado na mesma
 * página: em 1º/12/2026 a chamada passa para `gemini-3.5-flash-lite` e é
 * cobrada a US$ 0,30 / US$ 2,50. O atendente não usa esse padrão.
 */
export const MODELO_ATENDENTE = {
  id: 'gemini-2.5-flash-lite',
  usdEntradaPorMilhaoMicro: 100_000,
  usdSaidaPorMilhaoMicro: 400_000,
} as const;

export const MODELO_FLASH_WORKER = {
  id: 'gemini-2.5-flash',
  usdEntradaPorMilhaoMicro: 300_000,
  usdSaidaPorMilhaoMicro: 2_500_000,
} as const;

/**
 * AbacatePay, página /pricing, lida em 13/11/2026. Sem mensalidade.
 * Pix recebido: R$ 0,80. Saque Pix: R$ 0,80 até o 20º do mês.
 * O Pix Automático do Pro (R$ 39) já está no código, flag desligada.
 * Este módulo não cria produto de R$ 149 na AbacatePay.
 */
export const TAXA_ABACATE_PIX_CENTAVOS = 80;

/**
 * Hipótese do piloto de 30 dias. Não é preço do app. Não entra em PlanosScreen,
 * na landing nem na Stripe. Pro continua 3_900 e Empresa 9_900 em precosPlanos.ts.
 */
export const HIPOTESE_PILOTO_CENTAVOS = 14_900;

/** O que o piloto inclui. Acima disso a resposta para, ou o dono confirma o extra. */
export const TETO_PILOTO = {
  numeros: 1,
  respostasIa: 1_500,
  servico: TARIFA_META_BR.franquiaServico,
  utilidade: 100,
  autenticacao: 0,
  marketing: 0,
  usuarios: 2,
} as const;

/**
 * Tamanho de uma resposta curta, sem colar o histórico inteiro.
 * 800 tokens de entrada e 150 de saída. Raciocínio desligado: token de
 * raciocínio é cobrado como saída e estoura esta conta.
 */
export const TOKENS_RESPOSTA_CURTA = { entrada: 800, saida: 150 } as const;

export const ACEITES_QR = [
  'nao_e_api_oficial',
  'numero_pode_ser_bloqueado',
  'olli_nao_desbloqueia',
  'sem_disparo',
  'ia_se_identifica',
  'sair',
  'arrependimento_7_dias',
  'preco_e_teto_antes',
  'lgpd_operador',
] as const;

export type AceiteQr = (typeof ACEITES_QR)[number];

export type UsoMensagens = {
  servico: number;
  utilidade: number;
  autenticacao: number;
  marketing: number;
};

export type UsoMes = UsoMensagens & {
  respostasIa: number;
  numeros: number;
};

function inteiroNaoNegativo(nome: string, valor: number): void {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new Error(`${nome} precisa ser inteiro >= 0`);
  }
}

/** Arredonda metade para cima. Só para valores >= 0. */
function divRound(numerador: bigint, divisor: bigint): bigint {
  return (numerador + divisor / 2n) / divisor;
}

export function microreaisParaCentavos(microreais: number): number {
  inteiroNaoNegativo('microreais', microreais);
  return Number(divRound(BigInt(microreais), BigInt(MICROREAIS_POR_CENTAVO)));
}

export function custoMetaMicroreais(uso: UsoMensagens, franquiaServico = TARIFA_META_BR.franquiaServico): number {
  inteiroNaoNegativo('servico', uso.servico);
  inteiroNaoNegativo('utilidade', uso.utilidade);
  inteiroNaoNegativo('autenticacao', uso.autenticacao);
  inteiroNaoNegativo('marketing', uso.marketing);
  inteiroNaoNegativo('franquiaServico', franquiaServico);
  const servicoCobrado = Math.max(0, uso.servico - franquiaServico);
  return (
    servicoCobrado * TARIFA_META_BR.servico +
    uso.utilidade * TARIFA_META_BR.utilidade +
    uso.autenticacao * TARIFA_META_BR.autenticacao +
    uso.marketing * TARIFA_META_BR.marketing
  );
}

export function custoIaMicroreais(entrada: {
  tokensEntrada: number;
  tokensSaida: number;
  usdEntradaPorMilhaoMicro: number;
  usdSaidaPorMilhaoMicro: number;
  ptaxMicroreaisPorUsd?: number;
}): number {
  inteiroNaoNegativo('tokensEntrada', entrada.tokensEntrada);
  inteiroNaoNegativo('tokensSaida', entrada.tokensSaida);
  inteiroNaoNegativo('usdEntrada', entrada.usdEntradaPorMilhaoMicro);
  inteiroNaoNegativo('usdSaida', entrada.usdSaidaPorMilhaoMicro);
  const ptax = entrada.ptaxMicroreaisPorUsd ?? PTAX_VENDA_MICROREAIS_POR_USD;
  inteiroNaoNegativo('ptax', ptax);
  const numerador =
    BigInt(entrada.tokensEntrada) * BigInt(entrada.usdEntradaPorMilhaoMicro) +
    BigInt(entrada.tokensSaida) * BigInt(entrada.usdSaidaPorMilhaoMicro);
  const microdolares = numerador / 1_000_000n;
  return Number(divRound(microdolares * BigInt(ptax), 1_000_000n));
}

export function tokensDasRespostas(respostas: number, porResposta = TOKENS_RESPOSTA_CURTA): {
  tokensEntrada: number;
  tokensSaida: number;
} {
  inteiroNaoNegativo('respostas', respostas);
  return {
    tokensEntrada: respostas * porResposta.entrada,
    tokensSaida: respostas * porResposta.saida,
  };
}

export function custoIaDasRespostas(respostas: number, modelo = MODELO_ATENDENTE): number {
  const tokens = tokensDasRespostas(respostas);
  return custoIaMicroreais({
    ...tokens,
    usdEntradaPorMilhaoMicro: modelo.usdEntradaPorMilhaoMicro,
    usdSaidaPorMilhaoMicro: modelo.usdSaidaPorMilhaoMicro,
  });
}

/** Pior mês ainda dentro do teto, no caminho oficial. Serviço fica na franquia. */
export function custoNoTetoOficialMicroreais(): { meta: number; ia: number; total: number } {
  const meta = custoMetaMicroreais({
    servico: TETO_PILOTO.servico,
    utilidade: TETO_PILOTO.utilidade,
    autenticacao: TETO_PILOTO.autenticacao,
    marketing: TETO_PILOTO.marketing,
  });
  const ia = custoIaDasRespostas(TETO_PILOTO.respostasIa);
  return { meta, ia, total: meta + ia };
}

export function aceitesQrFaltando(aceitos: readonly string[]): AceiteQr[] {
  const tem = new Set(aceitos);
  return ACEITES_QR.filter((item) => !tem.has(item));
}

export function podeLigarQr(aceitos: readonly string[]): boolean {
  return aceitesQrFaltando(aceitos).length === 0;
}

/**
 * Sem Tech Provider não há Embedded Signup do número dele na Cloud API.
 * QR só com o aceite inteiro. Sem os dois, não liga.
 */
export function canalParaNumeroDoCliente(entrada: {
  somosTechProvider: boolean;
  aceitesQr: readonly string[];
}): 'oficial_embedded' | 'qr_piloto' | 'nao_ligar' {
  if (entrada.somosTechProvider) return 'oficial_embedded';
  if (podeLigarQr(entrada.aceitesQr)) return 'qr_piloto';
  return 'nao_ligar';
}

export function estourouTeto(uso: UsoMes, teto = TETO_PILOTO): string[] {
  const motivos: string[] = [];
  if (uso.numeros > teto.numeros) motivos.push('numeros');
  if (uso.respostasIa > teto.respostasIa) motivos.push('respostasIa');
  if (uso.servico > teto.servico) motivos.push('servico');
  if (uso.utilidade > teto.utilidade) motivos.push('utilidade');
  if (uso.autenticacao > teto.autenticacao) motivos.push('autenticacao');
  if (uso.marketing > teto.marketing) motivos.push('marketing');
  return motivos;
}

export function podeResponderNoTeto(uso: UsoMes): boolean {
  return estourouTeto({ ...uso, respostasIa: uso.respostasIa + 1 }).length === 0;
}

/**
 * Marketing nunca entra no teto. Só sai com opt-in e com o custo em centavos
 * mostrado antes. O custo é o da Meta, sem markup escondido.
 */
export function podeEnviarMarketing(entrada: {
  optIn: boolean;
  centavosMostrados: number;
  mensagens: number;
}): boolean {
  if (!entrada.optIn || entrada.mensagens < 1) return false;
  const devido = microreaisParaCentavos(custoMetaMicroreais({
    servico: 0,
    utilidade: 0,
    autenticacao: 0,
    marketing: entrada.mensagens,
  }));
  return entrada.centavosMostrados === devido;
}

/** Taxa da AbacatePay no Pix do piloto: 1 recebimento e, se sacar, 1 saque. */
export function taxaPilotoAbacateCentavos(sacar: boolean): number {
  return TAXA_ABACATE_PIX_CENTAVOS + (sacar ? TAXA_ABACATE_PIX_CENTAVOS : 0);
}
