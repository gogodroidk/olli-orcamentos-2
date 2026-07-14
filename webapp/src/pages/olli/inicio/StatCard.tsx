import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { useOlliCount } from "@/olli/data";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { formatInt } from "./helpers";

export interface StatCardDef {
	table: string;
	label: string;
	to: string;
	Icon: LucideIcon;
	/** Cor do tile do ícone (hex da paleta OLLI). */
	color: string;
}

/**
 * Cartão de KPI rico e clicável. Contagem REAL via `useOlliCount` (respeita RLS),
 * com os 3 estados: skeleton no carregando, "—" no erro (NUNCA some com o dado),
 * número tabular grande no sucesso.
 */
export function StatCard({ table, label, to, Icon, color }: StatCardDef) {
	const { data, isLoading, isError } = useOlliCount(table);

	return (
		<Link to={to} className="group block h-full focus:outline-none">
			<Card className="relative h-full gap-0 overflow-hidden p-5 shadow-sm ring-1 ring-transparent transition-all duration-200 group-hover:-translate-y-1 group-hover:border-primary/30 group-hover:shadow-lg group-focus-visible:ring-primary/50">
				{/* brilho sutil no canto — estático (sem loop de animação) */}
				<div
					className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-60 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
					style={{ backgroundColor: `${color}1F` }}
					aria-hidden
				/>
				<div className="relative flex items-start justify-between">
					<span
						className="grid size-11 place-items-center rounded-xl border"
						style={{ backgroundColor: `${color}1A`, color, borderColor: `${color}33` }}
					>
						<Icon className="size-5" strokeWidth={2.2} />
					</span>
					<ArrowUpRight className="size-4 -translate-x-1 text-text-disabled opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
				</div>
				<div className="relative mt-4">
					{isLoading ? (
						<Skeleton className="h-9 w-16" />
					) : (
						<div className="text-3xl font-bold tracking-tight text-text-primary tabular-nums">
							{isError ? "—" : formatInt(data ?? 0)}
						</div>
					)}
					<div className="mt-1 text-sm font-medium text-text-secondary">{label}</div>
				</div>
			</Card>
		</Link>
	);
}
