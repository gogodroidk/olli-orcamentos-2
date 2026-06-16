import { produtosApi } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { DataState } from '../components/DataState';
import { formatBRL } from '../lib/format';

export function ProdutosPage() {
  const { data, loading, error } = useAsync(produtosApi.list);
  const rows = data ?? [];

  return (
    <section>
      <h1 className="page-title">Produtos</h1>
      <DataState
        loading={loading}
        error={error}
        isEmpty={rows.length === 0}
        emptyLabel="Nenhum produto cadastrado."
      >
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th className="num">Preço</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.nome}</td>
                <td className="num">{formatBRL(p.preco)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataState>
    </section>
  );
}
