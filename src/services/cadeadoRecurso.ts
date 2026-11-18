/**
 * CADEADO DO RECURSO (D-2267) — regra PURA, sem React Native.
 *
 * "No Grátis só o básico; o resto com cadeado": a tela do recurso APARECE, com cadeado, e ao tocar
 * abre "Disponível no Pro". O que o usuário já criou continua visível e legível; só não cria nem
 * edita. A decisão de quem tem acesso é de `estadoAcessoRecurso` (entitlements.ts, com a carência do
 * Grátis até `TRANCA_GRATIS_D2267`); aqui só se traduz o estado em "trancar ou não".
 *
 * Trancar é a escolha conservadora: `carregando` e `indeterminado` (não deu para confirmar o plano)
 * NÃO liberam de graça. Quem paga já chega `liberado` pelo cache da mesma conta (ver usePlano).
 */
import type { EstadoAcessoRecurso, Recurso } from './entitlements.ts';

/** Os recursos que o D-2267 tirou do Grátis (cadeado nas telas do app). Nota fiscal é "em breve". */
export const RECURSOS_CADEADO_D2267: readonly Recurso[] = ['recibos', 'agenda', 'ordem_servico', 'importar_lote', 'nota_fiscal'];

/** `true` quando o recurso deve aparecer trancado (cadeado). `liberado` e `em_breve` (plano inclui) não. */
export function recursoTrancado(estado: EstadoAcessoRecurso): boolean {
  return estado !== 'liberado' && estado !== 'em_breve';
}

/**
 * LOJAS (iOS Guideline 3.1.1 / Google Play): onde o cartão "Disponível no Pro" pode OFERECER o plano (botão
 * "Ver o plano"). Web: sim. Android: só quando a venda é pela própria Play (binário com Play Billing E servidor
 * confirmando). iOS e Android sem Play Billing: só INFORMA — nenhum botão nem caminho de pagamento externo.
 * O botão só leva à tela de planos, que no build da loja vende apenas pelo fluxo da loja.
 */
export function podeOferecerPlanoPara(os: string, vendaPlayConfirmada: boolean): boolean {
  if (os === 'web') return true;
  return os === 'android' && vendaPlayConfirmada;
}
