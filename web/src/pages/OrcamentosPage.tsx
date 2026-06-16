import { orcamentosApi } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { DataState } from '../components/DataState';
import { StatusBadge } from '../components/StatusBadge';
import { formatBRL } from '../lib/format';

export function OrcamentosPage() {
  const { data, loading, error } = useAsync(orcamentosApi.list);
  const rows = data ?? [];

  return (
    <section>
      <h1 className="page-title">Orçamentos</h1>
      <DataState
        loading={loading}
        error={error}
        isEmpty={rows.length === 0}
        emptyLabel="Nenhum orçamento ainda."
      >
        <table className="table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Cliente</th>
              <th>Status</th>
              <th className="num">Valor total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>{o.numero ?? '—'}</td>
                <td>{o.cliente_nome ?? '—'}</td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
                <td className="num">{formatBRL(o.valor_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataState>
    </section>
  );
}
