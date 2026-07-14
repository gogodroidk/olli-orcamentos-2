import { AlertTriangle, FileText, Inbox } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { clienteOrcamento, formatBRL, metaStatus, type OrcamentoRow, valorOrcamento } from "./helpers";

interface Props {
	rows: OrcamentoRow[] | undefined;
	isLoading: boolean;
	isError: boolean;
}

/**
 * Card "Orçamentos recentes" — os 6 mais novos (dados REAIS). Cada linha: nº,
 * cliente, valor em R$ e badge de status COLORIDO. 3 estados: skeleton, erro
 * ("—", nunca vira vazio) e vazio bonito.
 */
export function RecentOrcamentosCard({ rows, isLoading, isError }: Props) {
	const recentes = (rows ?? []).slice(0, 6);

	return (
		<Card className="h-full gap-0 overflow-hidden p-0 shadow-sm">
			<div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
				<div>
					<h2 className="text-base font-semibold text-text-primary">Orçamentos recentes</h2>
					<p className="mt-0.5 text-xs text-text-secondary">Os últimos criados</p>
				</div>
				<Link
					to="/orcamentos"
					className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10"
				>
					Ver todos
				</Link>
			</div>

			<div className="p-3 sm:p-4">
				{isLoading ? (
					<div className="space-y-2">
						{["s1", "s2", "s3", "s4", "s5", "s6"].map((k) => (
							<div key={k} className="flex items-center gap-3 px-2 py-2">
								<Skeleton className="size-9 shrink-0 rounded-lg" />
								<div className="flex-1 space-y-1.5">
									<Skeleton className="h-3.5 w-2/5" />
									<Skeleton className="h-3 w-1/4" />
								</div>
								<Skeleton className="h-6 w-20" />
							</div>
						))}
					</div>
				) : isError ? (
					<div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
						<AlertTriangle className="size-7 text-warning" />
						<p className="text-sm font-semibold text-text-primary">Não foi possível carregar</p>
						<p className="text-xs text-text-secondary">Os valores aparecem assim que a conexão voltar.</p>
					</div>
				) : recentes.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
						<span className="grid size-12 place-items-center rounded-full bg-bg-neutral/60 text-text-disabled">
							<Inbox className="size-6" />
						</span>
						<p className="text-sm font-semibold text-text-primary">Nenhum orçamento ainda</p>
						<p className="max-w-[240px] text-xs text-text-secondary">
							Crie o primeiro orçamento para começar a acompanhar seu funil.
						</p>
					</div>
				) : (
					<ul className="divide-y divide-border/50">
						{recentes.map((o, i) => {
							const meta = metaStatus(o.status);
							const valor = valorOrcamento(o);
							return (
								<li
									key={o.id ?? i}
									className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-bg-neutral/40"
								>
									<span
										className="grid size-9 shrink-0 place-items-center rounded-lg border"
										style={{
											backgroundColor: `${meta.color}1A`,
											color: meta.color,
											borderColor: `${meta.color}33`,
										}}
									>
										<FileText className="size-4" />
									</span>
									<div className="min-w-0 flex-1">
										<div className="truncate text-sm font-medium text-text-primary">{clienteOrcamento(o)}</div>
										<div className="truncate text-xs text-text-secondary">{o.numero?.trim() || "Sem número"}</div>
									</div>
									<div className="flex shrink-0 flex-col items-end gap-1">
										<span className="text-sm font-semibold text-text-primary tabular-nums">
											{valor === null ? "—" : formatBRL(valor)}
										</span>
										<Badge variant={meta.badge}>{meta.label}</Badge>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</Card>
	);
}
