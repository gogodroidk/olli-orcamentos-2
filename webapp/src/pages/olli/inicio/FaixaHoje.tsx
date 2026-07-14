import { AlertTriangle, CalendarClock, MapPin, RotateCw } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { useOlliList } from "@/olli/data";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { agendamentosDeHoje } from "./financeiro";
import { type AgendamentoRow, horaLocal, plural } from "./helpers";

/**
 * FAIXA "HOJE" — o que o dono (ou o técnico) tem para fazer hoje.
 *
 * Lê `agendamentos` direto (é o único lugar da tela que precisa dessa tabela).
 * `inicio` é timestamptz de VERDADE nesta tabela — pode usar `new Date()` sem medo;
 * quem tem a data podre é `recibos.data_recebimento` (ver financeiro.ts).
 * 3 estados: skeleton · erro com "Tentar de novo" (nunca vira "agenda vazia", o que
 * faria o dono perder uma visita) · vazio de verdade.
 */
export function FaixaHoje() {
	const { data, isLoading, isError, refetch } = useOlliList<AgendamentoRow>("agendamentos", {
		orderBy: "inicio",
		ascending: true,
	});

	const hoje = useMemo(() => (data ? agendamentosDeHoje(data) : []), [data]);

	return (
		<Card className="gap-0 overflow-hidden p-0 shadow-sm">
			<div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5">
				<h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
					<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
						<CalendarClock className="size-[18px]" />
					</span>
					Hoje na agenda
					{!isLoading && !isError && hoje.length > 0 && (
						<span className="text-xs font-medium text-text-secondary">· {plural(hoje.length, "compromisso")}</span>
					)}
				</h2>
				<Link
					to="/agenda"
					className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10"
				>
					Ver agenda
				</Link>
			</div>

			<div className="px-4 py-3.5">
				{isLoading ? (
					<div className="flex gap-3 overflow-hidden">
						{["h1", "h2", "h3"].map((k) => (
							<Skeleton key={k} className="h-16 w-56 shrink-0 rounded-xl" />
						))}
					</div>
				) : isError ? (
					<div className="flex flex-wrap items-center gap-3">
						<AlertTriangle className="size-5 shrink-0 text-warning" />
						<p className="text-sm text-text-primary">
							Não foi possível carregar a agenda — <span className="text-text-secondary">pode haver visita hoje.</span>
						</p>
						<button
							type="button"
							onClick={() => refetch()}
							className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-bg-neutral/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
						>
							<RotateCw className="size-3.5" />
							Tentar de novo
						</button>
					</div>
				) : hoje.length === 0 ? (
					<p className="py-1 text-sm text-text-secondary">Nenhum compromisso marcado para hoje.</p>
				) : (
					<ul className="flex snap-x gap-3 overflow-x-auto pb-1">
						{hoje.map((a, i) => (
							<li
								key={a.id ?? i}
								className="min-w-[230px] shrink-0 snap-start rounded-xl border border-border/70 bg-bg-neutral/30 px-3.5 py-3"
							>
								<div className="flex items-baseline gap-2">
									<span className="text-base font-bold text-text-primary tabular-nums">{horaLocal(a.inicio)}</span>
									<span className="truncate text-xs font-medium uppercase tracking-wide text-text-disabled">
										{(a.tipo ?? "").replace(/_/g, " ") || "compromisso"}
									</span>
								</div>
								<div className="mt-1 truncate text-sm font-medium text-text-primary">
									{(a.titulo ?? "").trim() || (a.cliente_nome ?? "").trim() || "Sem título"}
								</div>
								<div className="mt-0.5 flex items-center gap-1 text-xs text-text-secondary">
									{a.endereco?.trim() ? (
										<>
											<MapPin className="size-3 shrink-0" aria-hidden />
											<span className="truncate">{a.endereco.trim()}</span>
										</>
									) : (
										<span className="truncate">{(a.cliente_nome ?? "").trim() || "—"}</span>
									)}
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</Card>
	);
}
