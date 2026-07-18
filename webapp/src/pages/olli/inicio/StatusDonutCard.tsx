import { AlertTriangle, PieChart, RotateCw } from "lucide-react";
import { Suspense, useMemo } from "react";
import { useChart } from "@/components/chart/useChart";
import { lazyComRetry } from "@/components/lazy/carregar-chunk";
import { ChunkBoundary } from "@/components/lazy/chunk-boundary";
import { useVisivelUmaVez } from "@/hooks/use-visivel-uma-vez";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { agruparPorStatus, formatInt, type OrcamentoRow } from "./helpers";

// Import PREGUIÇOSO: react-apexcharts (~157KB gzip) só entra no bundle quando este
// card realmente renderiza o gráfico — a rota padrão do painel (Início) não pode
// esperar essa dependência inteira baixar por causa de UM donut. `useChart` (acima)
// não puxa a lib de verdade — só o tipo `ApexOptions` (import type, apagado no build).
//
// E o download só COMEÇA quando o donut encosta na tela (ver useVisivelUmaVez logo
// abaixo). No celular ele nasce bem abaixo da dobra: antes disto, todo mundo que
// tinha ao menos um orçamento pagava a biblioteca inteira ao abrir o Início, mesmo
// sem rolar até ela. Quem abre o gráfico paga o gráfico; quem não abre, não paga.
const Chart = lazyComRetry(() => import("@/components/chart/chart").then((m) => ({ default: m.Chart })));

interface Props {
	rows: OrcamentoRow[] | undefined;
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
}

/**
 * Card grande com DONUT "Orçamentos por status" — dados REAIS agrupados pelo
 * campo `status`. Cores da marca (ver helpers). 3 estados: skeleton, erro (com
 * "Tentar de novo") e vazio bonito. Legenda própria à direita (nº + %). Sem
 * animação em loop: o donut só anima 1x na montagem (perfil do projeto proíbe
 * loop contínuo).
 */
export function StatusDonutCard({ rows, isLoading, isError, onRetry }: Props) {
	const { ref: areaGrafico, visivel: graficoNaTela } = useVisivelUmaVez<HTMLDivElement>();
	const grupos = useMemo(() => (rows ? agruparPorStatus(rows) : []), [rows]);
	const total = useMemo(() => grupos.reduce((s, g) => s + g.total, 0), [grupos]);

	const labels = grupos.map((g) => g.meta.label);
	const series = grupos.map((g) => g.total);
	const colors = grupos.map((g) => g.meta.color);

	const chartOptions = useChart({
		chart: { type: "donut" },
		labels,
		colors,
		stroke: { width: 0 },
		legend: { show: false },
		dataLabels: { enabled: false },
		tooltip: {
			y: { formatter: (v: number) => `${formatInt(v)} orçamento${v === 1 ? "" : "s"}` },
		},
		plotOptions: {
			pie: {
				expandOnClick: false,
				donut: {
					size: "74%",
					labels: {
						show: true,
						value: { fontSize: "26px", fontWeight: 700, offsetY: 6, formatter: (v: string) => formatInt(Number(v)) },
						total: {
							show: true,
							label: "Total",
							fontSize: "13px",
							formatter: () => formatInt(total),
						},
					},
				},
			},
		},
	});

	return (
		<Card className="h-full gap-0 overflow-hidden p-0 shadow-sm">
			<div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
				<div>
					<h2 className="text-base font-semibold text-text-primary">Orçamentos por status</h2>
					<p className="mt-0.5 text-xs text-text-secondary">Distribuição de todos os orçamentos</p>
				</div>
				<span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
					<PieChart className="size-[18px]" />
				</span>
			</div>

			<div className="p-5">
				{isLoading ? (
					<div className="flex flex-col items-center gap-6 md:flex-row md:items-center">
						<Skeleton className="size-[200px] shrink-0 rounded-full" />
						<div className="w-full space-y-3">
							{["s1", "s2", "s3", "s4"].map((k) => (
								<Skeleton key={k} className="h-6 w-full" />
							))}
						</div>
					</div>
				) : isError ? (
					<div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
						<AlertTriangle className="size-7 text-warning" />
						<div>
							<p className="text-sm font-semibold text-text-primary">Não foi possível carregar</p>
							<p className="text-xs text-text-secondary">Tente novamente em instantes.</p>
						</div>
						<button
							type="button"
							onClick={onRetry}
							className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-bg-neutral/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
						>
							<RotateCw className="size-3.5" />
							Tentar de novo
						</button>
					</div>
				) : total === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
						<span className="grid size-12 place-items-center rounded-full bg-bg-neutral/60 text-text-disabled">
							<PieChart className="size-6" />
						</span>
						<p className="text-sm font-semibold text-text-primary">Ainda sem orçamentos</p>
						<p className="max-w-[220px] text-xs text-text-secondary">
							Quando você criar o primeiro, a distribuição por status aparece aqui.
						</p>
					</div>
				) : (
					<div className="grid items-center gap-6 md:grid-cols-[minmax(0,210px)_1fr]">
						<div ref={areaGrafico} className="mx-auto w-full max-w-[240px]">
							{graficoNaTela ? (
								// A fronteira é INLINE: se a biblioteca do gráfico não baixar, quem
								// some é o donut — a legenda ao lado (número e % por status, que é
								// o dado que decide) continua na tela. Derrubar o card inteiro por
								// causa do desenho seria perder a informação junto com o enfeite.
								<ChunkBoundary variante="inline" oQue="o gráfico">
									<Suspense fallback={<Skeleton className="mx-auto size-[200px] rounded-full" />}>
										<Chart type="donut" series={series} options={chartOptions} height={230} />
									</Suspense>
								</ChunkBoundary>
							) : (
								<Skeleton className="mx-auto size-[200px] rounded-full" />
							)}
						</div>
						<ul className="grid gap-2.5">
							{grupos.map((g) => {
								const pct = total ? Math.round((g.total / total) * 100) : 0;
								return (
									<li key={g.slug} className="flex items-center gap-3">
										<span
											className="size-2.5 shrink-0 rounded-full"
											style={{ backgroundColor: g.meta.color }}
											aria-hidden
										/>
										<span className="flex-1 truncate text-sm text-text-secondary">{g.meta.label}</span>
										<span className="text-sm font-semibold text-text-primary tabular-nums">{formatInt(g.total)}</span>
										<span className="w-9 shrink-0 text-right text-xs text-text-disabled tabular-nums">{pct}%</span>
									</li>
								);
							})}
						</ul>
					</div>
				)}
			</div>
		</Card>
	);
}
