/** Small formatting helpers for user-facing (pt-BR) strings. */

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Format a number as Brazilian Real, e.g. 1234.5 -> "R$ 1.234,50". */
export function formatBRL(value: number | null | undefined): string {
  return brl.format(value ?? 0);
}

/** Format an ISO timestamp as a pt-BR date, e.g. "15/06/2026". Empty when absent. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}
