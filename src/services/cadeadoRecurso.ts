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
import { RECURSOS_EM_BREVE, type EstadoAcessoRecurso, type Recurso } from './entitlements.ts';

/**
 * Os recursos que o D-2267 tirou do Grátis (cadeado nas telas do app). Nota fiscal NÃO entra (CPO, A7): "Preparar nota" só
 * monta os dados para o emissor do governo (o OLLI não emite) e fica aberta a todos, igual ao painel; o recurso `nota_fiscal`
 * segue "em breve" só para a emissão automática.
 */
export const RECURSOS_CADEADO_D2267: readonly Recurso[] = ['recibos', 'agenda', 'ordem_servico', 'importar_lote'];

/**
 * Recurso "em breve" NÃO vende (CPO, A7): o cartão e o chip só dizem "Em breve no Pro" — sem botão "Ver o plano" e sem data
 * inventada. Vender o que o produto ainda não entrega é promessa cobrada em dinheiro.
 */
/**
 * PDF de recibo ainda NÃO emitido (`pdfEmitido === false`, pagamento já registrado) é emissão de documento: com o
 * recurso `recibos` trancado, a 1ª emissão não sai (D-2267, corte do CPO). Reenviar o que já foi emitido segue livre.
 */
export function pdfReciboTrancado(recibo: { pdfEmitido?: boolean }, reciboTrancado: boolean): boolean {
  return reciboTrancado && recibo.pdfEmitido === false;
}

/**
 * Importar CLIENTES em lote (contatos, planilha, vCard) com `importar_lote` trancado. Vale pelo tipo FINAL escolhido:
 * trocar o tipo depois de ler a planilha (ou um .vcf, que força 'clientes') não destranca. Catálogo e foto seguem Grátis.
 * Conferir de novo na hora de gravar, não só ao abrir a tela.
 */
export function importacaoLoteTrancada(origem: string | null, tipo: string, loteTrancado: boolean): boolean {
  return loteTrancado && (origem === 'contatos' || (origem === 'planilha' && tipo === 'clientes'));
}

export function recursoVendavel(recurso: Recurso): boolean {
  return !RECURSOS_EM_BREVE.has(recurso);
}

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
