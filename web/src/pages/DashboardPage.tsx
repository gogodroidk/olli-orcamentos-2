import { useMemo } from 'react';
import { orcamentosApi } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { DataState } from '../components/DataState';
import { StatusBadge } from '../components/StatusBadge';
import { formatBRL } from '../lib/format';
import { STATUS_ORCAMENTO, type OrcamentoRow, type StatusOrcamento } from '../lib/types';

interface Stats {
  total: number;
  porStatus: Record<StatusOrcamento, number>;
  faturamento: number;
}

function computeStats(rows: OrcamentoRow[]): Stats {
  const porStatus = Object.fromEntries(
    STATUS_ORCAMENTO.map((s) => [s, 0]),
  ) as Record<StatusOrcamento, number>;

  let faturamento = 0;
  for (const o of rows) {
    if (porStatus[o.status] !== undefined) porStatus[o.status] += 1;
    if (o.status === 'aprovado') faturamento += o.valor_total ?? 0;
  }

  return { total: rows.length, porStatus, faturamento };
}

export function DashboardPage() {
  const { data, loading, error } = useAsync(orcamentosApi.list);
  const stats = useMemo(() => computeStats(data ?? []), [data]);

  return (
    <section>
      <h1 className="page-title">Painel</h1>

      <DataState
        loading={loading}
        error={error}
        isEmpty={false}
        emptyLabel="Nenhum orçamento ainda."
      >
        <div className="cards">
          <div className="card stat">
            <span className="stat-label">Total de orçamentos</span>
            <span className="stat-value">{stats.total}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Faturamento (aprovados)</span>
            <span className="stat-value">{formatBRL(stats.faturamento)}</span>
          </div>
        </div>

        <h2 className="section-title">Por status</h2>
        <div className="cards">
          {STATUS_ORCAMENTO.map((status) => (
            <div key={status} className="card stat">
              <StatusBadge status={status} />
              <span className="stat-value">{stats.porStatus[status]}</span>
            </div>
          ))}
        </div>
      </DataState>
    </section>
  );
}
