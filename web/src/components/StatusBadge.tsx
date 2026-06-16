import { STATUS_COLORS, STATUS_LABELS, type StatusOrcamento } from '../lib/types';

/** Small coloured pill for an orçamento status. */
export function StatusBadge({ status }: { status: StatusOrcamento }) {
  const color = STATUS_COLORS[status] ?? '#6B7280';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className="badge" style={{ backgroundColor: color }}>
      {label}
    </span>
  );
}
