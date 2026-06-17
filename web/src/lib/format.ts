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

/** Compact BRL for cards/alerts: 6140 -> "R$ 6,1 mil", 980 -> "R$ 980". */
export function formatBRLCompact(value: number | null | undefined): string {
  const v = value ?? 0;
  if (Math.abs(v) >= 1000) {
    const mil = v / 1000;
    // one decimal, pt-BR comma, trim a trailing ",0"
    const txt = mil.toFixed(1).replace('.', ',').replace(/,0$/, '');
    return `R$ ${txt} mil`;
  }
  return formatBRL(v);
}

const MS_DAY = 86_400_000;

/** Whole days between an ISO date and now (floored, never negative). */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / MS_DAY));
}

/** Human recency in pt-BR: "hoje", "ontem", "5d", or the date if old/absent. */
export function formatRelative(iso: string | null | undefined): string {
  const days = daysSince(iso);
  if (days === null) return '—';
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 30) return `${days}d`;
  return formatDate(iso);
}

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Short pt-BR month name for a 0-based month index. */
export function monthShort(monthIndex: number): string {
  return MONTHS_PT[((monthIndex % 12) + 12) % 12];
}

// Palette for client/initials avatars — mirrors the design's coloured circles.
const AVATAR_COLORS = ['#0B6FCE', '#7C3AED', '#15B66E', '#475569', '#B4451F', '#0E7490', '#C2410C', '#4338CA'];

/** Deterministic avatar colour from a name, so a client keeps the same colour. */
export function avatarColor(name: string | null | undefined): string {
  const s = name ?? '';
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** First letter of a name, uppercased, for an avatar. Falls back to "?". */
export function initial(name: string | null | undefined): string {
  const c = (name ?? '').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}
