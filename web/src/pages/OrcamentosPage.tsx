import { useMemo, useState } from 'react';
import { orcamentosApi } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { DataState } from '../components/DataState';
import { StatusBadge } from '../components/StatusBadge';
import { formatBRL, formatDate } from '../lib/format';
import { orcamentoDate } from '../lib/metrics';
import type { OrcamentoRow, StatusOrcamento } from '../lib/types';

/** Chip filters. Each maps to a predicate over the real status. */
type FilterKey = 'todos' | 'enviados' | 'aprovados' | 'recusados';

const FILTERS: { key: FilterKey; label: string; match: (s: StatusOrcamento) => boolean }[] = [
  { key: 'todos', label: 'Todos', match: () => true },
  {
    key: 'enviados',
    label: 'Enviados',
    match: (s) => s === 'enviado' || s === 'aguardando_assinatura',
  },
  { key: 'aprovados', label: 'Aprovados', match: (s) => s === 'aprovado' },
  { key: 'recusados', label: 'Recusados', match: (s) => s === 'recusado' || s === 'cancelado' },
];

export function OrcamentosPage() {
  const { data, loading, error } = useAsync(orcamentosApi.list);
  const rows = useMemo(() => data ?? [], [data]);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('todos');

  // Real per-chip counts, computed over all rows (independent of the query).
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { todos: 0, enviados: 0, aprovados: 0, recusados: 0 };
    for (const o of rows) {
      for (const f of FILTERS) if (f.match(o.status)) c[f.key] += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchFilter = FILTERS.find((f) => f.key === filter)?.match ?? (() => true);
    return rows.filter((o) => {
      if (!matchFilter(o.status)) return false;
      if (!q) return true;
      const nome = (o.cliente_nome ?? '').toLowerCase();
      const numero = (o.numero ?? '').toLowerCase();
      return nome.includes(q) || numero.includes(q);
    });
  }, [rows, query, filter]);

  return (
    <section>
      <header className="page-head">
        <h1 className="page-title tight">Orçamentos</h1>
        <button type="button" className="btn btn-primary" disabled title="Crie orçamentos pelo app OLLI">
          ＋ Novo orçamento
        </button>
      </header>

      <div className="toolbar">
        <label className="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            placeholder="Buscar por cliente ou número…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={filter === f.key ? 'chip chip-active' : 'chip'}
              onClick={() => setFilter(f.key)}
            >
              {f.label} · {counts[f.key]}
            </button>
          ))}
        </div>
      </div>

      <DataState
        loading={loading}
        error={error}
        isEmpty={rows.length === 0}
        emptyLabel="Nenhum orçamento ainda."
      >
        {visible.length === 0 ? (
          <p className="muted pad-top">Nenhum orçamento corresponde aos filtros.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Cliente</th>
                <th>Data</th>
                <th>Status</th>
                <th className="num">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o: OrcamentoRow) => (
                <tr key={o.id}>
                  <td>{o.numero ?? '—'}</td>
                  <td>{o.cliente_nome ?? '—'}</td>
                  <td>{formatDate(orcamentoDate(o))}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="num value">{formatBRL(o.valor_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataState>
    </section>
  );
}
