import { servicosApi } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { DataState } from '../components/DataState';
import { formatBRL } from '../lib/format';

export function ServicosPage() {
  const { data, loading, error } = useAsync(servicosApi.list);
  const rows = data ?? [];

  return (
    <section>
      <h1 className="page-title">Serviços</h1>
      <DataState
        loading={loading}
        error={error}
        isEmpty={rows.length === 0}
        emptyLabel="Nenhum serviço cadastrado."
      >
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th className="num">Preço</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{s.nome}</td>
                <td className="num">{formatBRL(s.preco)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataState>
    </section>
  );
}
