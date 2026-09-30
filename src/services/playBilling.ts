/**
 * Assinatura pela Google Play — versão para iOS e web: SEMPRE DESLIGADA.
 *
 * O Metro escolhe `playBilling.android.ts` no Android e este arquivo nas demais
 * plataformas. Assim o SDK nativo do RevenueCat (`react-native-purchases`) nunca
 * entra no bundle da web nem no do iPhone: a web vende pelo checkout que já tem
 * (Stripe/Pix) e o iOS não vende (sem StoreKit — Guideline 3.1.1).
 *
 * Os dois arquivos exportam a MESMA interface; o TypeScript confere este aqui e o
 * `.android.ts` também é compilado pelo `tsc` do app, então divergir quebra o gate.
 */
import type { EstadoPlayBilling, FalhaCompraPlay, OfertaPlay } from './playBillingRegras';

export type ResultadoOfertasPlay =
  | { estado: 'ok'; ofertas: OfertaPlay[] }
  | { estado: 'erro' }
  | { estado: 'sem_login' }
  | { estado: 'desligado' };

export type ResultadoCompraPlay =
  | { estado: 'confirmada' }
  | { estado: 'sem_login' }
  | { estado: 'desligado' }
  | FalhaCompraPlay;

export type ResultadoRestauracaoPlay =
  | { estado: 'ok'; temAssinaturaAtiva: boolean }
  | { estado: 'sem_login' }
  | { estado: 'desligado' }
  | FalhaCompraPlay;

/** Fora do Android não há venda pela Play. */
export const ESTADO_PLAY_BILLING: EstadoPlayBilling = 'desligado_plataforma';

export function playBillingLigado(): boolean {
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
