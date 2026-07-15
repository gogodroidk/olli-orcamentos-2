import { AlertTriangle, CheckCircle2, MessageCircle, PhoneOff, RotateCw, TimerReset } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { linkWhatsapp, listarParados, paramStatus, STATUS_EM_JOGO, WHATSAPP_TEXTO, WHATSAPP_VERDE } from "./financeiro";
import { formatBRL, metaStatus, type OrcamentoRow, plural } from "./helpers";

interface Props {
	rows: OrcamentoRow[] | undefined;
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
	/** Nome da empresa (white-label) — entra no texto da cobrança. */
	empresa?: string;
}

const DIAS_MINIMO = 3;
const MOSTRAR = 5;

/**
 * PARADOS / COBRAR — o bloco que faz o dono ganhar dinheiro.
 *
 * Orçamento enviado/visualizado, sem mexer há mais de 3 dias: proposta viva na mão do
 * cliente que ninguém cobrou. Cada linha tem um botão de WhatsApp com o texto de
 * cobrança já escrito (educado, sem constranger) — o dono revisa e envia.
 *
 * O botão só existe quando há telefone LEGÍVEL no blob do orçamento. Sem telefone,
 * a linha continua aparecendo (o dono precisa saber que a proposta está parada), mas
 * dizendo "sem telefone" — montar um wa.me com número torto abriria conversa com um
 * desconhecido.
 */
export function ParadosCard({ rows, isLoading, isError, onRetry, empresa }: Props) {
	const parados = useMemo(() => (rows ? listarParados(rows, DIAS_MINIMO) : []), [rows]);
	const visiveis = parados.slice(0, MOSTRAR);

	return (
		<Card className="h-full gap-0 overflow-hidden p-0 shadow-sm">
			<div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
				<div className="min-w-0">
					<h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
						<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning">
							<TimerReset className="size-[18px]" />
						</span>
						Parados — hora de cobrar
					</h2>
					<p className="mt-1 text-xs text-text-secondary">
						Enviados sem resposta há mais de {DIAS_MINIMO} dias
						{!isLoading && !isError && parados.length > 0 ? ` · ${plural(parados.length, "orçamento")}` : ""}
					</p>
				</div>
				{!isLoading && !isError && parados.length > MOSTRAR && (
					<Link
						to={`/orcamentos?status=${paramStatus(STATUS_EM_JOGO)}`}
						className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10"
					>
						Ver todos
					</Link>
				)}
			</div>

			<div className="p-3 sm:p-4">
				{isLoading ? (
					<div className="space-y-2">
						{["p1", "p2", "p3"].map((k) => (
							<div key={k} className="flex items-center gap-3 px-2 py-2.5">
								<div className="flex-1 space-y-1.5">
									<Skeleton className="h-3.5 w-2/5" />
									<Skeleton className="h-3 w-1/4" />
								</div>
								<Skeleton className="h-8 w-24 rounded-full" />
							</div>
						))}
					</div>
				) : isError ? (
					<div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
						<AlertTriangle className="size-7 text-warning" />
						<div>
							<p className="text-sm font-semibold text-text-primary">Não foi possível carregar</p>
							<p className="mt-0.5 text-xs text-text-secondary">Pode haver orçamento parado que você não está vendo.</p>
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
				) : visiveis.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
						<span className="grid size-12 place-items-center rounded-full bg-success/10 text-success">
							<CheckCircle2 className="size-6" />
						</span>
						<p className="text-sm font-semibold text-text-primary">Nada parado por aqui</p>
						<p className="max-w-[260px] text-xs text-text-secondary">
							Nenhum orçamento enviado está sem resposta há mais de {DIAS_MINIMO} dias.
						</p>
					</div>
				) : (
					<ul className="divide-y divide-border/50">
						{visiveis.map((p) => {
							const meta = metaStatus(p.status);
							const url = linkWhatsapp(p, empresa);
							const identifica = p.numero ? `${p.numero} · ` : "";
							return (
								<li
									key={p.id}
									className="flex items-center gap-3 rounded-lg px-2 py-3 transition hover:bg-bg-neutral/40"
								>
									<div className="min-w-0 flex-1">
										<div className="truncate text-sm font-medium text-text-primary">{p.cliente}</div>
										<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
											<span className="truncate">
												{identifica}
												{p.valor === null ? "sem valor" : formatBRL(p.valor)}
											</span>
											<span
												className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
												style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
											>
												{meta.label}
											</span>
											<span className="font-semibold text-warning-darker tabular-nums dark:text-warning">
												há {plural(p.dias, "dia")}
											</span>
										</div>
									</div>

									{url ? (
										<a
											href={url}
											target="_blank"
											rel="noopener noreferrer"
											aria-label={`Cobrar ${p.cliente} pelo WhatsApp`}
											style={{ backgroundColor: WHATSAPP_VERDE, color: WHATSAPP_TEXTO }}
											className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/60"
										>
											<MessageCircle className="size-3.5" />
											Cobrar
										</a>
									) : (
										<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-disabled">
											<PhoneOff className="size-3.5" />
											Sem telefone
										</span>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</Card>
	);
}
