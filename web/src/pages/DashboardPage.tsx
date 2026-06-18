import { useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { orcamentosApi } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { DataState } from '../components/DataState';
import { StatusBadge } from '../components/StatusBadge';
import { formatBRL, formatBRLCompact, formatDate, formatRelative } from '../lib/format';
import {
  computeAlerts,
  computeDashboard,
  orcamentoDate,
  revenueByMonth,
  staleValue,
  type MonthBucket,
  type OlliAlert,
} from '../lib/metrics';
import type { OrcamentoRow } from '../lib/types';

/** Today, e.g. "Quarta-feira, 17 de junho". Capitalised weekday. */
function todayLabel(): string {
  const s = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One KPI card. `accent` colours the subtitle (e.g. success green). */
function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value value">{value}</div>
      <div className="kpi-sub" style={accent ? { color: accent } : undefined}>
        {sub}
      </div>
    </div>
  );
}

/** Six-month revenue bars. Heights are relative to the max month (real data). */
function RevenueChart({ buckets }: { buckets: MonthBucket[] }) {
  const max = Math.max(0, ...buckets.map((b) => b.total));
  const hasAny = max > 0;

  return (
    <div className="panel chart-panel">
      <div className="panel-head">
        <span className="panel-title">Faturamento — 6 meses</span>
        <span className="panel-aside">aprovados</span>
      </div>
      {hasAny ? (
        <div className="bars">
          {buckets.map((b) => {
            const pct = max > 0 ? Math.round((b.total / max) * 100) : 0;
            // keep a sliver visible for non-zero months
            const h = b.total > 0 ? Math.max(6, pct) : 0;
            return (
              <div key={`${b.year}-${b.month}`} className="bar-col">
                <div className="bar-track">
                  <div
                    className={b.isCurrent ? 'bar bar-current' : 'bar'}
                    style={{ height: `${h}%` }}
                    title={formatBRL(b.total)}
                  />
                </div>
                <span className={b.isCurrent ? 'bar-label bar-label-current' : 'bar-label'}>
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-block">
          <span className="empty-emoji">📊</span>
          <span>Sem faturamento ainda</span>
          <span className="muted small">Orçamentos aprovados aparecem aqui por mês.</span>
        </div>
      )}
    </div>
  );
}

/** Recent orçamentos table (most recent first). Rows link to the detail. */
function RecentTable({ rows }: { rows: OrcamentoRow[] }) {
  const navigate = useNavigate();
  const recent = useMemo(
    () =>
      [...rows]
        .sort((a, b) => (orcamentoDate(b) ?? '').localeCompare(orcamentoDate(a) ?? ''))
        .slice(0, 6),
    [rows],
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Orçamentos recentes</span>
        <Link to="/orcamentos" className="panel-link">
          Ver todos
        </Link>
      </div>
      {recent.length === 0 ? (
        <div className="empty-block">
          <span className="empty-emoji">🧾</span>
          <span>Nenhum orçamento ainda</span>
          <span className="muted small">Crie o primeiro no app para vê-lo aqui.</span>
        </div>
      ) : (
        <div className="mini-table">
          <div className="mini-row mini-head">
            <span className="mini-cli">Cliente</span>
            <span className="mini-date">Data</span>
            <span className="mini-val num">Valor</span>
            <span className="mini-status">Status</span>
          </div>
          {recent.map((o) => (
            <div
              key={o.id}
              className="mini-row row-clickable"
              onClick={() => navigate(`/orcamentos/${o.id}`)}
            >
              <span className="mini-cli">
                <span className="mini-num">{o.numero ?? '—'}</span>
                {o.cliente_nome ?? '—'}
              </span>
              <span className="mini-date">{formatDate(orcamentoDate(o))}</span>
              <span className="mini-val num value">{formatBRL(o.valor_total)}</span>
              <span className="mini-status">
                <StatusBadge status={o.status} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** OLLI mascot used in the alerts card header. */
function OlliHead() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="8" y="11" width="32" height="28" rx="11" fill="url(#olliG)" />
      <defs>
        <linearGradient id="olliG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0B6FCE" />
          <stop offset="1" stopColor="#34C6D9" />
        </linearGradient>
      </defs>
      <circle cx="19.5" cy="25" r="3.2" fill="#7FE9F5" />
      <circle cx="29.5" cy="25" r="3.2" fill="#7FE9F5" />
    </svg>
  );
}

/** Where each alert id deep-links inside Orçamentos (correct chip pre-selected). */
function alertTarget(id: string): string {
  switch (id) {
    case 'stale':
    case 'sign':
      return '/orcamentos?filtro=enviados';
    default:
      // Drafts (and anything else) → the full list.
      return '/orcamentos';
  }
}

/** Alerts card — real alerts (each links to its section), or a clean state. */
function AlertsCard({ alerts, stale }: { alerts: OlliAlert[]; stale: number }) {
  return (
    <div className="panel alerts-panel">
      <div className="panel-head">
        <span className="panel-title with-icon">
          <OlliHead /> Alertas da OLLI
        </span>
      </div>
      {alerts.length === 0 ? (
        <div className="all-clear">
          <span className="all-clear-check">✓</span>
          <div>
            <div className="all-clear-title">Tudo em dia</div>
            <div className="muted small">Nenhum alerta no momento.</div>
          </div>
        </div>
      ) : (
        <ul className="alert-list">
          {alerts.map((a) => (
            <li key={a.id} className="alert-row">
              <Link to={alertTarget(a.id)} className="alert-link">
                <span className={`alert-dot alert-${a.tone}`} />
                <span className="alert-text">{a.text}</span>
                {a.id === 'stale' && stale > 0 && (
                  <span className="alert-tag">{formatBRLCompact(stale)}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { data, loading, error } = useAsync(orcamentosApi.list);
  const rows = useMemo(() => data ?? [], [data]);

  // Data is fetched at mount; show the load time instead of a fake "agora".
  const loadedAt = useRef(
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  );

  const m = useMemo(() => computeDashboard(rows), [rows]);
  const buckets = useMemo(() => revenueByMonth(rows, 6), [rows]);
  const alerts = useMemo(() => computeAlerts(rows), [rows]);
  const stale = useMemo(() => staleValue(rows), [rows]);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1 className="page-title tight">Visão geral</h1>
          <div className="page-sub">{todayLabel()} · carregado às {loadedAt.current}</div>
        </div>
        <div className="head-actions">
          <Link to="/financeiro" className="btn">
            Ver financeiro
          </Link>
          <span className="pill-muted" title="A criação de orçamentos é feita no app OLLI">
            ＋ Novo orçamento: crie pelo app
          </span>
        </div>
      </header>

      <DataState loading={loading} error={error} isEmpty={false}>
        {/* KPI row — all values computed from real rows */}
        <div className="kpi-row">
          <Kpi
            label="Em contratos (aprovados)"
            value={formatBRL(m.faturamento)}
            sub={
              m.approvedCount > 0
                ? `${m.approvedCount} aprovados · valor aprovado, não recebido`
                : 'nenhum aprovado ainda'
            }
            accent={m.faturamento > 0 ? 'var(--success)' : undefined}
          />
          <Kpi
            label="Orçamentos concluídos"
            value={`${m.approvedCount} / ${m.totalCount}`}
            sub={m.totalCount > 0 ? `${m.totalCount} no total` : 'nenhum ainda'}
          />
          <Kpi
            label="Conversão"
            value={`${m.conversao}%`}
            sub={m.sentPlusCount > 0 ? `${m.approvedCount} de ${m.sentPlusCount} enviados` : 'nenhum enviado'}
            accent={m.conversao > 0 ? 'var(--frost)' : undefined}
          />
          <Kpi
            label="Em aberto"
            value={`${m.emAbertoCount}`}
            sub={m.emAbertoCount > 0 ? `${formatBRLCompact(m.emAbertoValor)} aguardando` : 'nada aguardando'}
            accent={m.emAbertoCount > 0 ? 'var(--warning)' : undefined}
          />
        </div>

        {/* Main grid: chart + recent table (left), alerts (right) */}
        <div className="cockpit-grid">
          <div className="cockpit-main">
            <RevenueChart buckets={buckets} />
            <RecentTable rows={rows} />
          </div>
          <div className="cockpit-side">
            <AlertsCard alerts={alerts} stale={stale} />
            <div className="panel hint-panel">
              <div className="panel-title">Resumo</div>
              <ul className="kv-list">
                <li>
                  <span className="muted">Enviados (aguardando)</span>
                  <span className="value">{m.emAbertoCount}</span>
                </li>
                <li>
                  <span className="muted">Rascunhos</span>
                  <span className="value">{m.rascunhoCount}</span>
                </li>
                <li>
                  <span className="muted">Recência</span>
                  <span className="value">
                    {rows.length > 0
                      ? formatRelative(
                          [...rows]
                            .map(orcamentoDate)
                            .filter(Boolean)
                            .sort()
                            .at(-1) ?? null,
                        )
                      : '—'}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </DataState>
    </section>
  );
}
