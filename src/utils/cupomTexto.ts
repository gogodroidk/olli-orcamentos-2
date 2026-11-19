/**
 * Textos do cupom de influenciador — FONTE ÚNICA do que a tela diz sobre a regra.
 * O percentual e os valores NUNCA são digitados aqui: vêm do servidor (worker/src/cupom.js),
 * que lê a constante CUPOM_PERCENTUAL de src/services/limitesComerciais.ts.
 * O aviso abaixo aparece ANTES de aplicar o cupom (regra de produto: cupom e indicação não acumulam).
 * Paridade com o worker: worker/scripts/teste-cupom.js.
 */
export const AVISO_CUPOM_E_INDICACAO =
  'Cupom e indicação não se somam: vale o que você usar primeiro nesta conta.';

/** O desconto vale só na 1ª cobrança; este texto complementa o que o servidor devolve ("De R$ X por R$ Y"). */
export const AVISO_CUPOM_NAO_RETROATIVO =
  'O cupom vale só na 1ª cobrança e não vale para o que você já pagou.';
