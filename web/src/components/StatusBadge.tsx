import { STATUS_COLORS, STATUS_LABELS, type StatusOrcamento } from '../lib/types';

/**
 * Statuses whose fill is too light for white text. These use dark text so the
 * badge meets WCAG AA contrast (e.g. the yellow "aguardando assinatura").
 */
const DARK_TEXT_STATUSES: ReadonlySet<StatusOrcamento> = new Set(['aguardando_assinatura']);

/** Small coloured pill for an orçamento status. */
export function StatusBadge({ status }: { status: StatusOrcamento }) {
  const color = STATUS_COLORS[status] ?? '#6B7280';
  const label = STATUS_LABELS[status] ?? status;
  const textColor = DARK_TEXT_STATUSES.has(status) ? '#0A1626' : undefined;
  return (
    <span className="badge" style={{ backgroundColor: color, color: textColor }}>
      {label}
    </span>
  );
}
