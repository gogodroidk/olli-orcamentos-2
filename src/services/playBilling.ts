/**
 * Assinatura pela Google Play — versão para iOS e web: SEMPRE DESLIGADA.
 *
 * O Metro escolhe `playBilling.android.ts` no Android e este arquivo nas demais
 * plataformas. Assim o módulo nativo de compra (`expo-iap`) nunca entra no bundle
 * da web nem no do iPhone: a web vende pelo checkout que já tem (Stripe/Pix) e o
 * iOS não vende (sem StoreKit — Guideline 3.1.1).
 *
 * Os dois arquivos exportam a MESMA interface; o TypeScript confere este aqui e o
 * `.android.ts` também é compilado pelo `tsc` do app, então divergir quebra o gate.
 * Este arquivo é puro de propósito (só `import type`): o teste
 * `scripts/teste-play-billing.ts` o importa no Node.
 */
import type { ConfigPlay, EstadoPlayBilling, FalhaCompraPlay, OfertaPlay } from './playBillingRegras';

/**
 * Ofertas da Play com o estado da carga:
 *  - 'ok'           → lista com o preço DA LOJA (pode vir vazia: a loja não devolveu
 *                     nenhum produto do catálogo);
 *  - 'erro'         → não deu para saber (rede, loja indisponível) — "Tentar de novo";
 *  - 'sem_login'    → a compra fica ligada à conta OLLI: precisa entrar;
 *  - 'indisponivel' → o SERVIDOR desligou a venda pelo app (`PLAY_BILLING_MODE=off`);
 *  - 'desligado'    → este binário não vende pela Play (iOS, web, Expo Go…).
 */
export type ResultadoOfertasPlay =
  | { estado: 'ok'; ofertas: OfertaPlay[] }
  | { estado: 'erro'; mensagem?: string }
  | { estado: 'sem_login' }
  | { estado: 'indisponivel' }
  | { estado: 'desligado' };

/** 'confirmada' = o SERVIDOR conferiu a compra na Google e gravou o plano. */
export type ResultadoCompraPlay =
  | { estado: 'confirmada' }
  | { estado: 'sem_login' }
  | { estado: 'indisponivel' }
  | { estado: 'desligado' }
  | FalhaCompraPlay;

export type ResultadoRestauracaoPlay =
  | { estado: 'ok'; temAssinaturaAtiva: boolean }
  | { estado: 'sem_login' }
  | { estado: 'indisponivel' }
  | { estado: 'desligado' }
  | FalhaCompraPlay;

/** Fora do Android não há venda pela Play. */
export const ESTADO_PLAY_BILLING: EstadoPlayBilling = 'desligado_plataforma';

export function playBillingLigado(): boolean {
  return false;
}

/** A venda pelo app está ligada no servidor? Fora do Android: nunca. */
export async function consultarVendaPlay(): Promise<ConfigPlay> {
  return 'desligada';
}

/** Última leitura do servidor confirmou a venda? (síncrono, conservador). */
export function vendaPlayConfirmada(): boolean {
  return false;
}

export async function carregarOfertasPlay(): Promise<ResultadoOfertasPlay> {
  return { estado: 'desligado' };
}

export async function comprarNaPlay(_oferta: OfertaPlay): Promise<ResultadoCompraPlay> {
  return { estado: 'desligado' };
}

export async function restaurarComprasPlay(): Promise<ResultadoRestauracaoPlay> {
  return { estado: 'desligado' };
}

/**
 * Abre a central de assinaturas da Play. Fora do Android devolve `false` e quem
 * chama decide (a web abre a URL da Play Store; o iPhone não cita outra loja).
 */
export async function gerenciarAssinaturaNaPlay(_produtoId?: string | null): Promise<boolean> {
  return false;
}
