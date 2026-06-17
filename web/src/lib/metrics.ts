/**
 * Real-data metrics derived from the orçamentos (and clientes) rows.
 *
 * Every number here is computed from the actual Supabase rows — nothing is
 * invented. When the account is empty, the functions naturally return zeros /
 * empty arrays so the UI can show honest empty-states.
 *
 * Status semantics used across the panel:
 *  - "aprovado"  → counts toward faturamento (revenue won).
 *  - "enviado" / "aguardando_assinatura" → in the funnel ("enviados+"),
 *    still open / awaiting the client.
 *  - "rascunho"  → not yet sent.
 *  - "recusado" / "cancelado" → lost / closed.
 */
import type { OrcamentoRow, StatusOrcamento } from './types';
import { daysSince } from './format';

/** The date that best represents when an orçamento happened. */
export function orcamentoDate(o: OrcamentoRow): string | null {
  return o.data_emissao ?? o.criado_em ?? o.atualizado_em ?? null;
}

/** Statuses that mean "sent to the client" (denominator of conversion). */
export const SENT_PLUS: StatusOrcamento[] = [
  'enviado',
  'aguardando_assinatura',
  'aprovado',
  'recusado',
];

/** Statuses that are still open / awaiting a client decision. */
export const OPEN_STATUSES: StatusOrcamento[] = ['enviado', 'aguardando_assinatura'];

export interface DashboardMetrics {
  /** Σ valor_total of approved orçamentos. */
  faturamento: number;
  approvedCount: number;
  totalCount: number;
  /** Orçamentos that reached the client (enviados+). */
  sentPlusCount: number;
  /** Conversion = approved / sentPlus, in 0–100 (0 when no funnel yet). */
  conversao: number;
  /** Still open (enviado / aguardando) — awaiting client. */
  emAbertoCount: number;
  emAbertoValor: number;
  rascunhoCount: number;
}

export function computeDashboard(rows: OrcamentoRow[]): DashboardMetrics {
  let faturamento = 0;
  let approvedCount = 0;
  let sentPlusCount = 0;
  let emAbertoCount = 0;
  let emAbertoValor = 0;
  let rascunhoCount = 0;

  for (const o of rows) {
    const valor = o.valor_total ?? 0;
    if (o.status === 'aprovado') {
      faturamento += valor;
      approvedCount += 1;
    }
    if (SENT_PLUS.includes(o.status)) sentPlusCount += 1;
    if (OPEN_STATUSES.includes(o.status)) {
      emAbertoCount += 1;
      emAbertoValor += valor;
    }
    if (o.status === 'rascunho') rascunhoCount += 1;
  }

  const conversao = sentPlusCount > 0 ? Math.round((approvedCount / sentPlusCount) * 100) : 0;

  return {
    faturamento,
    approvedCount,
    totalCount: rows.length,
    sentPlusCount,
    conversao,
    emAbertoCount,
    emAbertoValor,
    rascunhoCount,
  };
}

export interface MonthBucket {
  label: string; // "Jan"
  year: number;
  month: number; // 0-based
  total: number; // Σ approved valor_total in this month
  isCurrent: boolean;
}

/**
 * Approved revenue bucketed into the last `count` calendar months (oldest →
 * newest, ending with the current month). Uses each orçamento's emission date.
 */
export function revenueByMonth(rows: OrcamentoRow[], count = 6, now = new Date()): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  const baseY = now.getFullYear();
  const baseM = now.getMonth();
  const keyOf = (y: number, m: number) => y * 12 + m;
  const index = new Map<number, number>();

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(baseY, baseM - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    index.set(keyOf(y, m), buckets.length);
    buckets.push({
      label: MONTHS[m],
      year: y,
      month: m,
      total: 0,
      isCurrent: i === 0,
    });
  }

  for (const o of rows) {
    if (o.status !== 'aprovado') continue;
    const iso = orcamentoDate(o);
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const idx = index.get(keyOf(d.getFullYear(), d.getMonth()));
    if (idx !== undefined) buckets[idx].total += o.valor_total ?? 0;
  }

  return buckets;
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export interface OlliAlert {
  id: string;
  tone: 'danger' | 'warning' | 'info';
  text: string;
}

/** Threshold (days) after which a sent-but-unanswered orçamento is "parado". */
export const STALE_DAYS = 5;

/**
 * Honest, real alerts derived from the rows. Empty array ⇒ "tudo em dia".
 *  1. Sent orçamentos with no response for > STALE_DAYS (with their value).
 *  2. Drafts never sent.
 *  3. Orçamentos awaiting signature.
 */
export function computeAlerts(rows: OrcamentoRow[]): OlliAlert[] {
  const alerts: OlliAlert[] = [];

  let staleCount = 0;
  let staleValue = 0;
  for (const o of rows) {
    if (o.status !== 'enviado') continue;
    const days = daysSince(orcamentoDate(o));
    if (days !== null && days > STALE_DAYS) {
      staleCount += 1;
      staleValue += o.valor_total ?? 0;
    }
  }
  if (staleCount > 0) {
    alerts.push({
      id: 'stale',
      tone: 'danger',
      text: `${staleCount} ${plural(staleCount, 'orçamento parado', 'orçamentos parados')} +${STALE_DAYS} dias`,
    });
  }

  const aguardando = rows.filter((o) => o.status === 'aguardando_assinatura').length;
  if (aguardando > 0) {
    alerts.push({
      id: 'sign',
      tone: 'warning',
      text: `${aguardando} ${plural(aguardando, 'orçamento aguardando', 'orçamentos aguardando')} assinatura`,
    });
  }

  const rascunhos = rows.filter((o) => o.status === 'rascunho').length;
  if (rascunhos > 0) {
    alerts.push({
      id: 'draft',
      tone: 'info',
      text: `${rascunhos} ${plural(rascunhos, 'rascunho não enviado', 'rascunhos não enviados')}`,
    });
  }

  return alerts;
}

/** Value tied up in stale (sent, >STALE_DAYS) orçamentos — for the alert subline. */
export function staleValue(rows: OrcamentoRow[]): number {
  let v = 0;
  for (const o of rows) {
    if (o.status !== 'enviado') continue;
    const days = daysSince(orcamentoDate(o));
    if (days !== null && days > STALE_DAYS) v += o.valor_total ?? 0;
  }
  return v;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// ─── Client CRM aggregates ───────────────────────────────────────────────────
export interface ClientAgg {
  /** Number of orçamentos linked to this client. */
  orcamentos: number;
  /** Σ valor_total of this client's approved orçamentos (faturado). */
  faturado: number;
  /** Most recent orçamento date (any status), ISO, or null. */
  lastIso: string | null;
}

/**
 * Aggregate orçamentos per client. Joins on `cliente_id` when present, else
 * falls back to a normalised `cliente_nome` so loosely-linked rows still count.
 */
export function aggregateByClient(orcamentos: OrcamentoRow[]): {
  byId: Map<string, ClientAgg>;
  byName: Map<string, ClientAgg>;
} {
  const byId = new Map<string, ClientAgg>();
  const byName = new Map<string, ClientAgg>();

  const touch = (map: Map<string, ClientAgg>, key: string, o: OrcamentoRow) => {
    let agg = map.get(key);
    if (!agg) {
      agg = { orcamentos: 0, faturado: 0, lastIso: null };
      map.set(key, agg);
    }
    agg.orcamentos += 1;
    if (o.status === 'aprovado') agg.faturado += o.valor_total ?? 0;
    const iso = orcamentoDate(o);
    if (iso && (!agg.lastIso || iso > agg.lastIso)) agg.lastIso = iso;
  };

  for (const o of orcamentos) {
    if (o.cliente_id) touch(byId, o.cliente_id, o);
    const nameKey = normName(o.cliente_nome);
    if (nameKey) touch(byName, nameKey, o);
  }

  return { byId, byName };
}

/** Look up a client's aggregate by id first, then by normalised name. */
export function clientAgg(
  index: { byId: Map<string, ClientAgg>; byName: Map<string, ClientAgg> },
  id: string,
  nome: string | null,
): ClientAgg {
  return (
    index.byId.get(id) ??
    index.byName.get(normName(nome)) ?? { orcamentos: 0, faturado: 0, lastIso: null }
  );
}

function normName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}
