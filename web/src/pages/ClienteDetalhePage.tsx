import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { clientesApi, orcamentosApi, recibosApi } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { DataState } from '../components/DataState';
import { StatusBadge } from '../components/StatusBadge';
import { formatBRL, formatDate, avatarColor, initial } from '../lib/format';
import { computeFinance, orcamentoDate, reciboDate } from '../lib/metrics';
import type { ClienteRow, OrcamentoRow, ReciboRow } from '../lib/types';

interface Bundle {
  cliente: ClienteRow | null;
  orcamentos: OrcamentoRow[];
  recibos: ReciboRow[];
}

/** Normalised name for the loose (id-less) match fallback. */
function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

export function ClienteDetalhePage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Load the client + all orçamentos + all recibos, then join client-side by id
  // (with a name fallback). RLS already scopes every list to this account.
  const loader = useCallback(async (): Promise<Bundle> => {
    const [cliente, orcamentos, recibos] = await Promise.all([
      clientesApi.get(id),
      orcamentosApi.list(),
      recibosApi.list(),
    ]);
    return { cliente, orcamentos, recibos };
  }, [id]);
  const { data, loading, error } = useAsync(loader);

  const cliente = data?.cliente ?? null;
  const nomeKey = norm(cliente?.nome);

  const orcamentos = useMemo(() => {
    const all = data?.orcamentos ?? [];
    return all
      .filter((o) => o.cliente_id === id || (nomeKey && norm(o.cliente_nome) === nomeKey))
      .sort((a, b) => (orcamentoDate(b) ?? '').localeCompare(orcamentoDate(a) ?? ''));
  }, [data, id, nomeKey]);

  const recibos = useMemo(() => {
    const all = data?.recibos ?? [];
    return all
      .filter((r) => r.cliente_id === id || (nomeKey && norm(r.cliente_nome) === nomeKey))
      .sort((a, b) => (reciboDate(b) ?? '').localeCompare(reciboDate(a) ?? ''));
  }, [data, id, nomeKey]);

  const fin = useMemo(() => computeFinance(recibos, orcamentos), [recibos, orcamentos]);

  return (
    <section>
      <header className="page-head">
        <div>
          <Link to="/clientes" className="back-link">
            ← Clientes
          </Link>
          <h1 className="page-title tight">{cliente?.nome ?? 'Cliente'}</h1>
        </div>
      </header>

      <DataState
        loading={loading}
        error={error}
        isEmpty={cliente === null}
        emptyLabel="Cliente não encontrado."
      >
        {cliente && (
          <>
            <div className="client-head-card panel">
              <span className="crm-avatar lg" style={{ background: avatarColor(cliente.nome) }}>
                {initial(cliente.nome)}
              </span>
              <div className="client-head-meta">
                <div className="client-head-name">{cliente.nome}</div>
                <div className="muted small">
                  {[cliente.telefone, cliente.cidade, cliente.estado].filter(Boolean).join(' · ') ||
                    'Sem contato cadastrado'}
                </div>
              </div>
            </div>

            <div className="kpi-row trio">
              <div className="kpi-card">
                <div className="kpi-label">Recebido (caixa)</div>
                <div className="kpi-value value" style={{ color: 'var(--success)' }}>
                  {formatBRL(fin.recebidoTotal)}
                </div>
                <div className="kpi-sub">
                  {fin.recibosCount} {fin.recibosCount === 1 ? 'recibo' : 'recibos'}
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Aprovado (pipeline)</div>
                <div className="kpi-value value" style={{ color: 'var(--frost)' }}>
                  {formatBRL(fin.pipelineAprovado)}
                </div>
                <div className="kpi-sub">{fin.aprovadoCount} aprovados</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Orçamentos</div>
                <div className="kpi-value value">{orcamentos.length}</div>
                <div className="kpi-sub">no histórico</div>
              </div>
            </div>

            <div className="panel section-gap">
              <div className="panel-head">
                <span className="panel-title">Orçamentos do cliente</span>
              </div>
              {orcamentos.length === 0 ? (
                <div className="empty-block">
                  <span className="empty-emoji">🧾</span>
                  <span>Nenhum orçamento para este cliente</span>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Data</th>
                      <th>Status</th>
                      <th className="num">Valor total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orcamentos.map((o) => (
                      <tr
                        key={o.id}
                        className="row-clickable"
                        onClick={() => navigate(`/orcamentos/${o.id}`)}
                      >
                        <td>{o.numero ?? '—'}</td>
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
            </div>

            {recibos.length > 0 && (
              <div className="panel section-gap">
                <div className="panel-head">
                  <span className="panel-title">Recibos (caixa recebido)</span>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Forma</th>
                      <th>Data</th>
                      <th className="num">Recebido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recibos.map((r) => (
                      <tr key={r.id}>
                        <td>{r.numero ?? '—'}</td>
                        <td>{r.forma_pagamento ?? '—'}</td>
                        <td>{formatDate(reciboDate(r))}</td>
                        <td className="num value" style={{ color: 'var(--success)' }}>
                          {formatBRL(r.valor_recebido)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </DataState>
    </section>
  );
}
