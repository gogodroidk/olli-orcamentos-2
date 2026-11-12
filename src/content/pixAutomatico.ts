/**
 * Texto do PIX AUTOMÁTICO (assinatura recorrente no Pix). UMA fonte para o app e para o painel web.
 *
 * Direito do consumidor (CDC art. 6º III e 31): antes de pagar, a pessoa lê o preço, que a cobrança se repete
 * sozinha todo mês e COMO cancelar. Só afirmamos o que o servidor faz de verdade (módulo do Pix Automático no worker):
 *  - o 1º débito é na hora e os seguintes são mensais, no valor fixo da autorização;
 *  - cancelar (pelo OLLI ou no app do banco) para as cobranças e o Pro segue até o fim do período já pago;
 *  - débito recusado pelo banco encerra a assinatura (sem tentar de novo) e o Pro acaba no fim do período pago.
 * Teste: scripts/teste-pix-automatico-copy.ts.
 */

export const ROTULO_PIX_AUTOMATICO = 'Pix Automático: renova sozinho todo mês';

/** Valor já formatado ("R$ 39,00") — vem do catálogo de preço da tela, nunca digitado aqui. */
export function textoAcordoPixAutomatico(valor: string): string {
  return (
    `Você autoriza uma vez no app do seu banco e ${valor} são debitados da sua conta por Pix, automaticamente, ` +
    'todo mês, até você cancelar. O primeiro débito é na hora. ' +
    'Para cancelar: em Planos, toque em "Cancelar renovação automática", ou cancele a autorização no app do seu banco. ' +
    'Cancelando, nada mais é cobrado e o Pro segue até o fim do período já pago.'
  );
}

/** Linha curta sob o botão (o texto completo aparece na confirmação antes de pagar). */
export function textoCurtoPixAutomatico(valor: string): string {
  return `${valor} por mês, debitado sozinho do seu banco até você cancelar. Cancele quando quiser, aqui em Planos ou no app do banco.`;
}

export const TEXTO_PIX_AUTOMATICO_ATIVO = 'Renovação automática por Pix ativa: o Pro renova sozinho todo mês.';
export const ROTULO_CANCELAR_PIX_AUTOMATICO = 'Cancelar renovação automática';
