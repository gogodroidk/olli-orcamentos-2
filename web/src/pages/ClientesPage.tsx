import { clientesApi } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { DataState } from '../components/DataState';

export function ClientesPage() {
  const { data, loading, error } = useAsync(clientesApi.list);
  const rows = data ?? [];

  return (
    <section>
      <h1 className="page-title">Clientes</h1>
      <DataState
        loading={loading}
        error={error}
        isEmpty={rows.length === 0}
        emptyLabel="Nenhum cliente cadastrado."
      >
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td>{c.telefone ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataState>
    </section>
  );
}
