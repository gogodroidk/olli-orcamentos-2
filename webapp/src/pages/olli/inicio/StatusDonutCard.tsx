import { AlertTriangle, PieChart, RotateCw } from "lucide-react";
import { useMemo } from "react";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { fatiasDonut } from "./donut";
import { agruparPorStatus, formatInt, type OrcamentoRow } from "./helpers";

interface Props {
	rows: OrcamentoRow[] | undefined;
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
}

/** Raio e espessura no viewBox 120×120: anel interno ≈ 74% do externo, como antes. */
const RAIO = 48;
const ESPESSURA = 14;

/**
 * Card grande com DONUT "Orçamentos por status" — dados REAIS agrupados pelo
 * campo `status`. Cores da marca (ver helpers). 3 estados: skeleton, erro (com
 * "Tentar de novo") e vazio bonito. Legenda própria à direita (nº + %).
 *
 * O anel é SVG puro (ver ./donut.ts): até 30/09/2026 era ApexCharts, ~150 KB
 * gzip baixados só para este desenho. Sem animação: o número que decide está
 * na legenda e aparece na hora — nada de movimento escondendo carregamento.
 * O SVG é `aria-hidden` porque a legenda ao lado já diz o mesmo em texto; o
 * `<title>` de cada fatia dá o valor no hover do mouse.
 */
export function StatusDonutCard({ rows, isLoading, isError, onRetry }: Props) {
	const grupos = useMemo(() => (rows ? agruparPorStatus(rows) : []), [rows]);
	const total = useMemo(() => grupos.reduce((s, g) => s + g.total, 0), [grupos]);
	const fatias = useMemo(() => fatiasDonut(grupos.map((g) => g.total)), [grupos]);

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
						<div className="relative mx-auto aspect-square w-full max-w-[210px]">
							<svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
								<circle
									cx="60"
									cy="60"
									r={RAIO}
									fill="none"
									strokeWidth={ESPESSURA}
									className="stroke-bg-neutral"
								/>
								{grupos.map((g, i) => {
									const f = fatias[i];
									if (!f || f.traco <= 0) return null;
									return (
										<circle
											key={g.slug}
											cx="60"
											cy="60"
											r={RAIO}
											fill="none"
											stroke={g.meta.color}
											strokeWidth={ESPESSURA}
											pathLength={100}
											strokeDasharray={`${f.traco} ${100 - f.traco}`}
											strokeDashoffset={f.deslocamento}
										>
											<title>{`${g.meta.label}: ${formatInt(g.total)} orçamento${g.total === 1 ? "" : "s"} (${f.pct}%)`}</title>
										</circle>
									);
								})}
							</svg>
							<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
								<span className="text-[26px] font-bold leading-none text-text-primary tabular-nums">{formatInt(total)}</span>
								<span className="mt-1 text-[13px] text-text-secondary">Total</span>
							</div>
						</div>
						<ul className="grid gap-2.5">
							{grupos.map((g, i) => {
								const pct = fatias[i]?.pct ?? 0;
								return (
									<li key={g.slug} className="flex items-center gap-3">
										<span
											className="size-2.5 shrink-0 rounded-full"
											style={{ backgroundColor: g.meta.color }}
											aria-hidden
										/>
										<span className="flex-1 truncate text-sm text-text-secondary">{g.meta.label}</span>
										<span className="text-sm font-semibold text-text-primary tabular-nums">{formatInt(g.total)}</span>
										{/* `-secondary` e não `-disabled`: a porcentagem é o dado da legenda.
									    Medido a 10,5px no tema claro, o token "disabled" dava 2,73:1. */}
									<span className="w-9 shrink-0 text-right text-xs text-text-secondary tabular-nums">{pct}%</span>
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
