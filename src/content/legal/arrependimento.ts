/**
 * Direito de arrependimento (CDC art. 49): FONTE ÚNICA do prazo e da citação.
 * Usado pelos Termos de uso (termos.ts) e pelo aviso da tela do Pix (PixPlanoModal): o número
 * nunca é digitado em dois lugares (já erramos copy de memória; parecer do Dr. Paulo, 24/10/2026).
 */
export const DIAS_ARREPENDIMENTO = 7;
export const ARTIGO_ARREPENDIMENTO = 'art. 49 do Código de Defesa do Consumidor';

/** Linha curta para a tela de pagamento. */
export function textoArrependimentoCurto(): string {
  return `Compra à distância: você pode desistir em até ${DIAS_ARREPENDIMENTO} dias corridos (${ARTIGO_ARREPENDIMENTO}). Veja os detalhes nos Termos de uso.`;
}
