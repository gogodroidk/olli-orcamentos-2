/**
 * REGRAS DE LOJA — o que cada build pode VENDER e o que cada texto pode PROMETER.
 * Módulo puro (sem import nativo) para o teste rodar no Node:
 * `scripts/teste-roteamento-pagamento.ts` confere aqui que o rótulo do Android
 * nunca volta a citar Pix.
 *
 * Quem lê no app é `src/config/loja.ts`, que só aplica `Platform.OS` a estas
 * regras. As telas (Conta, Créditos, Planos, Assinatura) importam de lá — antes
 * cada uma tinha a sua cópia da flag e o menu da Conta esqueceu de olhar a dele.
 *
 * ═══ AS DUAS TRAVAS ═══
 *  - iOS (Guideline 3.1.1): sem StoreKit, nada de assinatura ou crédito é vendido
 *    no app, nem apontado para fora (link-out também é proibido).
 *  - Android da Google Play (`BUILD_PLAY_SEM_COMPRA_EXTERNA`): sem Play Billing para
 *    créditos, o build da Play não oferece Pix, Stripe nem outro caminho externo de
 *    compra de bem digital DO PRÓPRIO OLLI. A cobrança que o prestador faz ao
 *    cliente DELE (orçamento, Pix do serviço) não é bem digital do app e continua.
 *  - A web mantém a recarga por Pix e o checkout existentes.
 */

export type SistemaLoja = 'android' | 'ios' | 'web' | 'windows' | 'macos';

export interface RegrasLoja {
  /** iOS = false (Guideline 3.1.1). */
  compraNoApp: boolean;
  /** Android da Play: nenhuma compra externa de bem digital do OLLI. */
  buildPlaySemCompraExterna: boolean;
  /** Pode mostrar pacote, QR, copia-e-cola ou checkout próprio do OLLI. */
  compraExternaHabilitada: boolean;
}

export function regrasDaLoja(os: SistemaLoja | string): RegrasLoja {
  const compraNoApp = os !== 'ios';
  const buildPlaySemCompraExterna = os === 'android';
  return {
    compraNoApp,
    buildPlaySemCompraExterna,
    compraExternaHabilitada: compraNoApp && !buildPlaySemCompraExterna,
  };
}

/** Textos que dependem do que a loja deixa vender. Derivados das regras acima. */
export interface TextosLoja {
  /** Descrição do item "Créditos" no menu da Conta. */
  creditosMenu: string;
  /** Subtítulo do cartão "Sua assinatura" na Conta (o nome do plano entra antes). */
  assinaturaMenu: (rotuloPlano: string) => string;
}

export function textosDaLoja(os: SistemaLoja | string): TextosLoja {
  const r = regrasDaLoja(os);
  return {
    // Só a web recarrega. No Android e no iPhone o que existe é ver o saldo e o
    // extrato — prometer recarga ali é texto que o app desmente na tela seguinte.
    creditosMenu: r.compraExternaHabilitada ? 'Saldo e recarga por Pix' : 'Saldo e extrato',
    // No Android da Play a Assinatura não abre portal (sem faturas, troca de plano
    // nem cancelamento por fora): mostra status e validade, e é isso que se promete.
    assinaturaMenu: (rotuloPlano) =>
      r.buildPlaySemCompraExterna
        ? `Plano ${rotuloPlano} · status e validade`
        : `Plano ${rotuloPlano} · faturas, cobrança e cancelamento`,
  };
}

/** Página pública de exclusão de conta (exigência da Play: excluir também fora do app). */
export const URL_EXCLUIR_CONTA_WEB = 'https://olliorcamentos.online/excluir-conta/';
