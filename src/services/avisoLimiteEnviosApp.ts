/**
 * Aviso do limite de envios do Grátis no APP (P0-09). Pura: sem React, sem plataforma.
 *
 * Antes dizia "para enviar mais agora, veja os planos na tela Conta", que não leva a
 * lugar nenhum: na tela Conta do Android da Play e do iOS não há como contratar
 * (sem StoreKit; Play Billing desligado), e quem toca nem sabe qual toque é o certo.
 *
 * Agora:
 *  - onde o app VENDE o Pro (web do app ou Play Billing ligado): texto igual ao da web
 *    (`avisoLimiteEnvios`, painel) + botão "Ver planos" que abre a tela Planos;
 *  - onde NÃO vende (iOS e Android da loja hoje): só a verdade, sem apontar para
 *    compra por fora (Guideline 3.1.1 / política da Play) e sem prometer caminho
 *    que não existe.
 * O texto nunca promete Pix: o Pix do Pro só existe na web (lição do LIVRE no #451).
 */

export interface AvisoLimiteEnviosApp {
  titulo: string;
  mensagem: string;
  /** Rótulo do botão que abre a tela Planos; ausente = sem botão. */
  rotuloBotao: string | null;
}

export const TITULO_LIMITE_ENVIOS_APP = 'Limite do mês atingido';
export const ROTULO_BOTAO_LIMITE_APP = 'Ver planos';

export function avisoLimiteEnviosApp(teto: number, vendaNoApp: boolean): AvisoLimiteEnviosApp {
  const abertura = `Você usou os ${teto} envios do Grátis deste mês. Seu orçamento está salvo.`;
  if (vendaNoApp) {
    return {
      titulo: TITULO_LIMITE_ENVIOS_APP,
      mensagem: `${abertura} Para enviar agora, libere o Pro; se preferir esperar, os envios voltam no próximo mês.`,
      rotuloBotao: ROTULO_BOTAO_LIMITE_APP,
    };
  }
  return {
    titulo: TITULO_LIMITE_ENVIOS_APP,
    mensagem: `${abertura} Os envios voltam no próximo mês.`,
    rotuloBotao: null,
  };
}
