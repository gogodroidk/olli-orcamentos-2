import { Platform } from 'react-native';
import { regrasDaLoja, textosDaLoja } from './lojaRegras';

/**
 * Flag ÚNICA de loja do app — ver as regras e o porquê em `./lojaRegras.ts`.
 * Toda tela que decide se vende ou o que promete importa daqui; nenhuma recria
 * `Platform.OS === 'android'` por conta própria.
 */
const regras = regrasDaLoja(Platform.OS);

/** iOS (Guideline 3.1.1): sem StoreKit, nada é vendido nem apontado para fora. */
export const COMPRA_NO_APP = regras.compraNoApp;
/** Android da Google Play: sem compra externa de bem digital do OLLI (Pix, Stripe…). */
export const BUILD_PLAY_SEM_COMPRA_EXTERNA = regras.buildPlaySemCompraExterna;
/** Só a web: pode mostrar pacote, QR, copia-e-cola ou checkout próprio. */
export const COMPRA_EXTERNA_HABILITADA = regras.compraExternaHabilitada;

/** Textos que dependem da loja (menu da Conta etc.), já resolvidos para esta plataforma. */
export const TEXTOS_LOJA = textosDaLoja(Platform.OS);

export { URL_EXCLUIR_CONTA_WEB } from './lojaRegras';
