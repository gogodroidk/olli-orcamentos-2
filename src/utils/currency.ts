export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(value) ? value : 0);
}

/**
 * Converte texto digitado pelo usuário brasileiro para número.
 * Trata "12,50", "1.234,56", "R$ 1.234,56", "1234.56", "1234".
 */
export function parseCurrency(value: string | number): number {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (!value) return 0;

  let cleaned = value.replace(/[R$\s]/g, '');

  const hasComma = cleaned.includes(',');
  const dotCount = (cleaned.match(/\./g) || []).length;
  const hasDot = dotCount > 0;

  if (hasComma && hasDot) {
    // formato BR: ponto é milhar, vírgula é decimal -> 1.234,56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // só vírgula -> decimal: 12,50
    cleaned = cleaned.replace(',', '.');
  } else if (hasDot) {
    // só ponto(s), sem vírgula. Distinguir milhar de decimal:
    //  - "1.500" / "1.234.567" (grupos de 3) ou MAIS DE UM ponto -> milhar
    //    (remove os pontos): 1.500 -> 1500
    //  - "12.50" / "0.5" (decimal padrão) -> mantém como está
    const milhar = /^\d{1,3}(\.\d{3})+$/.test(cleaned) || dotCount > 1;
    if (milhar) cleaned = cleaned.replace(/\./g, '');
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/** Igual a parseCurrency, mas para qualquer número (quantidade etc). */
export function parseNumber(value: string | number): number {
  return parseCurrency(value);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value : 0);
}

/** Quantidade: mostra inteiro sem casas, fracionário com até 2 casas. */
export function formatQty(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return formatNumber(value, 2);
}
