import { useCallback, useMemo, useState } from 'react';
import { orcamentosApi, recibosApi } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { DataState } from '../components/DataState';
import { formatBRL, formatBRLCompact, formatDate } from '../lib/format';
import {
  computeFinance,
  receivedByMonth,
  reciboDate,
  type MonthBucket,
} from '../lib/metrics';
import type { OrcamentoRow, ReciboRow } from '../lib/types';

interface Bundle {
  recibos: ReciboRow[];
  orcamentos: OrcamentoRow[];
}

/** Load recibos (cash) + orçamentos (pipeline) together for one screen. */
async function loadBundle(): Promise<Bundle> {
  const [recibos, orcamentos] = await Promise.all([recibosApi.list(), orcamentosApi.list()]);
  return { recibos, orcamentos };
}

/** Period for the cash chart: current month only, or the last 6 months. */
type Period = 'mes' | '6m';

/** One KPI card. `accent` colours the value/subtitle (e.g. success green). */
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
      <div className="kpi-value value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

/** Cash-received bars. Heights are relative to the max month (real data). */
function CashChart({ buckets, period }: { buckets: MonthBucket[]; period: Period }) {
  const shown = period === 'mes' ? buckets.slice(-1) : buckets;
  const max = Math.max(0, ...shown.map((b) => b.total));
  const hasAny = max > 0;

  return (
    <div className="panel chart-panel">
      <div className="panel-head">
        <span className="panel-title">Caixa recebido por mês</span>
        <span className="panel-aside">{period === 'mes' ? 'mês atual' : '6 meses'}</span>
      </div>
      {hasAny ? (
        <div className="bars">
          {shown.map((b) => {
            const pct = max > 0 ? Math.round((b.total / max) * 100) : 0;
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
          <span className="empty-emoji">💰</span>
          <span>Nenhum recebimento ainda</span>
          <span className="muted small">Recibos emitidos no app aparecem aqui por mês.</span>
        </div>
      )}
    </div>
  );
}

/** Movements list: real recibos (the cash that entered), most recent first. */
function MovementsList({ recibos }: { recibos: ReciboRow[] }) {
  const rows = useMemo(
    () =>
      [...recibos].sort((a, b) =>
        (reciboDate(b) ?? '').localeCompare(reciboDate(a) ?? ''),
      ),
    [recibos],
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Movimentações — recebidos</span>
        <span className="panel-aside">
          {rows.length} {rows.length === 1 ? 'recibo' : 'recibos'}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="empty-block">
          <span className="empty-emoji">🧾</span>
          <span>Nenhum recibo emitido</span>
          <span className="muted small">Emita recibos pelo app para registrar o caixa.</span>
        </div>
      ) : (
        <div className="mini-table">
          <div className="mini-row mini-head">
            <span className="mini-cli">Cliente</span>
            <span className="mini-date">Forma</span>
            <span className="mini-date">Data</span>
            <span className="mini-val num">Valor</span>
          </div>
          {rows.map((r) => (
            <div key={r.id} className="mini-row">
              <span className="mini-cli">
                {r.numero && <span className="mini-num">{r.numero}</span>}
                {r.cliente_nome ?? '—'}
              </span>
              <span className="mini-date">{r.forma_pagamento ?? '—'}</span>
              <span className="mini-date">{formatDate(reciboDate(r))}</span>
              <span className="mini-val num value" style={{ color: 'var(--success)' }}>
                {formatBRL(r.valor_recebido)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FinanceiroPage() {
  const loader = useCallback(loadBundle, []);
  const { data, loading, error } = useAsync(loader);

  const recibos = useMemo(() => data?.recibos ?? [], [data]);
  const orcamentos = useMemo(() => data?.orcamentos ?? [], [data]);

  const [period, setPeriod] = useState<Period>('6m');

  const fin = useMemo(() => computeFinance(recibos, orcamentos), [recibos, orcamentos]);
  const buckets = useMemo(() => receivedByMonth(recibos, 6), [recibos]);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1 className="page-title tight">Financeiro</h1>
          <div className="page-sub">
            Caixa recebido (dinheiro que entrou) vs. pipeline aprovado/aberto
          </div>
        </div>
        <div className="head-actions">
          <div className="chips">
            <button
              type="button"
              className={period === 'mes' ? 'chip chip-active' : 'chip'}
              onClick={() => setPeriod('mes')}
            >
              Mês atual
            </button>
            <button
              type="button"
              className={period === '6m' ? 'chip chip-active' : 'chip'}
              onClick={() => setPeriod('6m')}
            >
              6 meses
            </button>
          </div>
        </div>
      </header>

      <DataState loading={loading} error={error} isEmpty={false}>
        <div className="kpi-row">
          <Kpi
            label="Recebido (caixa) — total"
            value={formatBRL(fin.recebidoTotal)}
            sub={
              fin.recibosCount > 0
                ? `${fin.recibosCount} ${fin.recibosCount === 1 ? 'recibo' : 'recibos'} · dinheiro que entrou`
                : 'nenhum recebimento ainda'
            }
            accent={fin.recebidoTotal > 0 ? 'var(--success)' : undefined}
          />
          <Kpi
            label="Recebido (caixa) — mês atual"
            value={formatBRL(fin.recebidoMes)}
            sub={fin.recebidoMes > 0 ? 'recebido neste mês' : 'nada recebido este mês'}
            accent={fin.recebidoMes > 0 ? 'var(--success)' : undefined}
          />
          <Kpi
            label="Pipeline — aprovado"
            value={formatBRL(fin.pipelineAprovado)}
            sub={
              fin.aprovadoCount > 0
                ? `${fin.aprovadoCount} aprovados · ainda não recebido`
                : 'nenhum aprovado'
            }
            accent={fin.pipelineAprovado > 0 ? 'var(--frost)' : undefined}
          />
          <Kpi
            label="Pipeline — em aberto"
            value={formatBRL(fin.pipelineAberto)}
            sub={
              fin.abertoCount > 0
                ? `${fin.abertoCount} enviados aguardando`
                : 'nada em aberto'
            }
            accent={fin.pipelineAberto > 0 ? 'var(--warning)' : undefined}
          />
        </div>

        <div className="cockpit-grid">
          <div className="cockpit-main">
            <CashChart buckets={buckets} period={period} />
            <MovementsList recibos={recibos} />
          </div>
          <div className="cockpit-side">
            <div className="panel hint-panel">
              <div className="panel-title">Como ler</div>
              <ul className="kv-list">
                <li>
                  <span className="muted">Recebido (caixa)</span>
                  <span className="value" style={{ color: 'var(--success)' }}>
                    {formatBRLCompact(fin.recebidoTotal)}
                  </span>
                </li>
                <li>
                  <span className="muted">Aprovado (pipeline)</span>
                  <span className="value" style={{ color: 'var(--frost)' }}>
                    {formatBRLCompact(fin.pipelineAprovado)}
                  </span>
                </li>
                <li>
                  <span className="muted">Em aberto (pipeline)</span>
                  <span className="value" style={{ color: 'var(--warning)' }}>
                    {formatBRLCompact(fin.pipelineAberto)}
                  </span>
                </li>
              </ul>
              <p className="muted small note-block">
                <strong>Recebido</strong> é o dinheiro que de fato entrou (recibos).{' '}
                <strong>Aprovado</strong> é o orçamento ganho, mas que pode ainda não ter
                sido pago. São coisas diferentes — por isso ficam separados.
              </p>
            </div>
          </div>
        </div>
      </DataState>
    </section>
  );
}
