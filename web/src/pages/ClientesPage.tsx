import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientesApi, orcamentosApi } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { DataState } from '../components/DataState';
import { formatBRL, formatRelative, avatarColor, initial } from '../lib/format';
import { aggregateByClient, clientAgg } from '../lib/metrics';
import type { ClienteRow, OrcamentoRow } from '../lib/types';

interface Bundle {
  clientes: ClienteRow[];
  orcamentos: OrcamentoRow[];
}

/** Load clientes + orçamentos together so we can join them client-side. */
async function loadBundle(): Promise<Bundle> {
  const [clientes, orcamentos] = await Promise.all([clientesApi.list(), orcamentosApi.list()]);
  return { clientes, orcamentos };
}

export function ClientesPage() {
  // Stable loader reference so useAsync doesn't refetch in a loop.
  const loader = useCallback(loadBundle, []);
  const { data, loading, error } = useAsync(loader);
  const navigate = useNavigate();

  const clientes = useMemo(() => data?.clientes ?? [], [data]);
  const orcamentos = useMemo(() => data?.orcamentos ?? [], [data]);
  const index = useMemo(() => aggregateByClient(orcamentos), [orcamentos]);

  const [query, setQuery] = useState('');

  // Decorate each client with its real aggregates, then sort by recency.
  const decorated = useMemo(() => {
    return clientes
      .map((c) => ({ c, agg: clientAgg(index, c.id, c.nome) }))
      .sort((a, b) => (b.agg.lastIso ?? '').localeCompare(a.agg.lastIso ?? ''));
  }, [clientes, index]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return decorated;
    return decorated.filter(
      ({ c }) =>
        c.nome.toLowerCase().includes(q) || (c.telefone ?? '').toLowerCase().includes(q),
    );
  }, [decorated, query]);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1 className="page-title tight">Clientes</h1>
          <div className="page-sub">
            {clientes.length} {clientes.length === 1 ? 'cadastrado' : 'cadastrados'}
          </div>
        </div>
        <span className="pill-muted" title="O cadastro de clientes é feito no app OLLI">
          ＋ Novo cliente: cadastre pelo app
        </span>
      </header>

      <div className="toolbar">
        <label className="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            placeholder="Buscar cliente…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <DataState
        loading={loading}
        error={error}
        isEmpty={clientes.length === 0}
        emptyLabel="Nenhum cliente cadastrado."
      >
        {visible.length === 0 ? (
          <p className="muted pad-top">Nenhum cliente corresponde à busca.</p>
        ) : (
          <div className="crm-table">
            <div className="crm-row crm-head">
              <span className="crm-cli">Cliente</span>
              <span className="crm-contact">Contato</span>
              <span className="crm-count">Orçam.</span>
              <span className="crm-fat num">Faturado</span>
              <span className="crm-last num">Último</span>
            </div>
            {visible.map(({ c, agg }) => (
              <div
                key={c.id}
                className="crm-row row-clickable"
                onClick={() => navigate(`/clientes/${c.id}`)}
              >
                <span className="crm-cli">
                  <span className="crm-avatar" style={{ background: avatarColor(c.nome) }}>
                    {initial(c.nome)}
                  </span>
                  <span className="crm-name">{c.nome}</span>
                </span>
                <span className="crm-contact">{c.telefone ?? '—'}</span>
                <span className="crm-count">{agg.orcamentos}</span>
                <span className="crm-fat num value">{formatBRL(agg.faturado)}</span>
                <span className="crm-last num">
                  {agg.lastIso ? formatRelative(agg.lastIso) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </DataState>
    </section>
  );
}
