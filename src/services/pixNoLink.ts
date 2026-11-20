/**
 * A VERDADE SOBRE O PIX NO LINK DO ORÇAMENTO (CQ-DINHEIRO-LOTE1, D-2506 — CDC).
 *
 * O Pix do prestador aparece para o cliente no link /o/ só quando o plano do dono tem
 * `link_pagamento` (Pro e Empresa) — regra do worker em `worker/src/link.js`
 * (`blocoPagamento`). No Grátis, a página diz "combine a forma de pagamento". Até
 * 19/11 o painel e o app prometiam ao prestador do Grátis que a chave "vai no link do
 * orçamento depois que o cliente aprova" — e 10 contas puseram a chave acreditando nisso.
 *
 * Módulo PURO: decide a dica do campo "Chave Pix" a partir do estado do recurso
 * (`estadoAcessoRecurso` de `entitlements.ts`). Três verdades, nunca chute:
 *  - liberado → promete o Pix no link (é verdade);
 *  - bloqueado → diz que no Grátis o cliente NÃO vê o Pix no link e o que o Pro faz;
 *  - carregando / não confirmado / em breve → texto neutro, sem afirmar o plano.
 * Nada de preço nem prazo aqui (o preço mora na tela de Planos).
 */
import type { EstadoAcessoRecurso } from './entitlements.ts';

/** A frase pedida pela PRODUCT — CPO (D-2506), em português simples. */
export const FRASE_PIX_LINK_GRATIS = 'No Grátis, o seu cliente não vê o seu Pix no link. No Pro, ele paga por Pix ali mesmo.';

const FIM = 'O dinheiro cai direto na sua conta — a OLLI não passa por ele.';

export interface DicaChavePix {
  /** Texto curto embaixo do campo. */
  dica: string;
  /** Aviso honesto do Grátis (com o botão para conhecer o Pro). `null` = não há o que avisar. */
  avisoGratis: string | null;
}

export function dicaChavePix(estado: EstadoAcessoRecurso): DicaChavePix {
  if (estado === 'liberado') {
    return {
      dica: `Vai no recibo, na cobrança pelo WhatsApp e no link do orçamento: depois que o cliente aprova, ele paga por Pix ali mesmo. ${FIM}`,
      avisoGratis: null,
    };
  }
  if (estado === 'bloqueado') {
    return {
      dica: `Vai no recibo e na cobrança pelo WhatsApp. ${FIM}`,
      avisoGratis: FRASE_PIX_LINK_GRATIS,
    };
  }
  return {
    dica: `Vai no recibo e na cobrança pelo WhatsApp. No link do orçamento, o cliente paga por Pix nos planos Pro e Empresa. ${FIM}`,
    avisoGratis: null,
  };
}
