export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
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
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    // formato BR: ponto é milhar, vírgula é decimal -> 1.234,56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // só vírgula -> decimal: 12,50
    cleaned = cleaned.replace(',', '.');
  }
  // só ponto: assume decimal padrão (12.50) — deixa como está

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
  }).format(value || 0);
}

/** Quantidade: mostra inteiro sem casas, fracionário com até 2 casas. */
export function formatQty(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return formatNumber(value, 2);
}
