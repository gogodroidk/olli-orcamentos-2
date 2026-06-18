import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { orcamentosApi } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { DataState } from '../components/DataState';
import { StatusBadge } from '../components/StatusBadge';
import { formatBRL, formatDate } from '../lib/format';
import { orcamentoDate } from '../lib/metrics';
import type { FormaPagamento, OrcamentoRow } from '../lib/types';

/** Human-readable list of enabled payment methods, e.g. "Pix, Crédito". */
function formasLabel(f: FormaPagamento | undefined): string {
  if (!f) return '—';
  const parts: string[] = [];
  if (f.pix) parts.push('Pix');
  if (f.dinheiro) parts.push('Dinheiro');
  if (f.credito) parts.push('Crédito');
  if (f.debito) parts.push('Débito');
  return parts.length ? parts.join(', ') : '—';
}

export function OrcamentoDetalhePage() {
  const { id = '' } = useParams<{ id: string }>();
  const loader = useCallback(() => orcamentosApi.get(id), [id]);
  const { data, loading, error } = useAsync(loader);

  return (
    <section>
      <header className="page-head">
        <div>
          <Link to="/orcamentos" className="back-link">
            ← Orçamentos
          </Link>
          <h1 className="page-title tight">
            {data?.numero ? `Orçamento ${data.numero}` : 'Orçamento'}
          </h1>
        </div>
      </header>

      <DataState loading={loading} error={error} isEmpty={data === null} emptyLabel="Orçamento não encontrado.">
        {data && <OrcamentoDetail row={data} />}
      </DataState>
    </section>
  );
}

/** The full detail body — only rendered when `row` is present (non-null). */
function OrcamentoDetail({ row }: { row: OrcamentoRow }) {
  const d = row.dados;
  // Prefer the rich jsonb payload, but fall back to the flat columns so the page
  // is honest even for older rows that never stored full `dados`.
  const itens = d?.itens ?? [];
  const subtotal = d?.subtotal ?? row.subtotal ?? 0;
  const desconto = d?.desconto ?? row.desconto ?? 0;
  const valorTotal = d?.valorTotal ?? row.valor_total ?? 0;
  const clienteNome = d?.clienteNome ?? row.cliente_nome ?? '—';
  const clienteId = d?.clienteId ?? row.cliente_id ?? null;

  return (
    <div className="detail-grid">
      <div className="detail-main">
        {/* Items */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Itens</span>
            <span className="panel-aside">
              {itens.length} {itens.length === 1 ? 'item' : 'itens'}
            </span>
          </div>
          {itens.length === 0 ? (
            <div className="empty-block">
              <span className="empty-emoji">📦</span>
              <span>Sem itens detalhados</span>
              <span className="muted small">Este orçamento não guardou a lista de itens.</span>
            </div>
          ) : (
            <table className="table detail-items">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qtd.</th>
                  <th className="num">Preço</th>
                  <th className="num">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <div className="item-name">{it.nome}</div>
                      <div className="muted small">
                        {it.tipo === 'servico' ? 'Serviço' : 'Produto'}
                        {it.unidade ? ` · ${it.unidade}` : ''}
                      </div>
                    </td>
                    <td className="num">{it.quantidade}</td>
                    <td className="num">{formatBRL(it.preco)}</td>
                    <td className="num value">{formatBRL(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Totals */}
        <div className="panel">
          <div className="panel-title">Valores</div>
          <ul className="kv-list">
            <li>
              <span className="muted">Subtotal</span>
              <span className="value">{formatBRL(subtotal)}</span>
            </li>
            <li>
              <span className="muted">Desconto</span>
              <span className="value">{desconto > 0 ? `− ${formatBRL(desconto)}` : formatBRL(0)}</span>
            </li>
            <li>
              <span className="muted">Total</span>
              <span className="value total-value">{formatBRL(valorTotal)}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="detail-side">
        {/* Status + dates */}
        <div className="panel">
          <div className="panel-title">Situação</div>
          <ul className="kv-list">
            <li>
              <span className="muted">Status</span>
              <span>
                <StatusBadge status={row.status} />
              </span>
            </li>
            <li>
              <span className="muted">Emissão</span>
              <span className="value">{formatDate(orcamentoDate(row))}</span>
            </li>
            {d?.validadeOrcamento && (
              <li>
                <span className="muted">Validade</span>
                <span className="value">{formatDate(d.validadeOrcamento)}</span>
              </li>
            )}
            <li>
              <span className="muted">Pagamento</span>
              <span className="value">{formasLabel(d?.formasPagamento)}</span>
            </li>
          </ul>
        </div>

        {/* Client */}
        <div className="panel">
          <div className="panel-title">Cliente</div>
          <div className="detail-client">
            <div className="detail-client-name">{clienteNome}</div>
            {d?.clienteTelefone && <div className="muted small">{d.clienteTelefone}</div>}
            {d?.clienteEndereco && <div className="muted small">{d.clienteEndereco}</div>}
          </div>
          {clienteId && (
            <Link to={`/clientes/${clienteId}`} className="btn detail-btn">
              Ver cliente →
            </Link>
          )}
        </div>

        {/* Optional notes from the rich payload */}
        {(d?.garantia || d?.condicoesPagamento || d?.laudoTecnico) && (
          <div className="panel">
            <div className="panel-title">Detalhes</div>
            {d?.condicoesPagamento && (
              <p className="detail-note">
                <span className="muted small">Condições de pagamento</span>
                {d.condicoesPagamento}
              </p>
            )}
            {d?.garantia && (
              <p className="detail-note">
                <span className="muted small">Garantia</span>
                {d.garantia}
              </p>
            )}
            {d?.laudoTecnico && (
              <p className="detail-note">
                <span className="muted small">Laudo técnico</span>
                {d.laudoTecnico}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
