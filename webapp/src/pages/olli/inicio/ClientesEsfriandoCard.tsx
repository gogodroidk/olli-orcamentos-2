import type { Empresa } from "@dominio";
import { AlertTriangle, CheckCircle2, MessageCircle, PhoneOff, RotateCw, Snowflake } from "lucide-react";
import { useMemo } from "react";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { WHATSAPP_TEXTO, WHATSAPP_VERDE } from "./financeiro";
import type { OrcamentoRow, ReciboRow } from "./helpers";
import { plural } from "./helpers";
import { DIAS_ESFRIANDO, linkReconquista, listarEsfriando } from "./radares";
import { useAgendaRadar, useClientesRadar, useRadarSnooze } from "./useClientesEsfriando";

interface Props {
	/** Já carregados pela página (mesma leitura dos KPIs) — não relemos a tabela. */
	orcamentos: OrcamentoRow[] | undefined;
	recibos: ReciboRow[] | undefined;
	orcRecCarregando: boolean;
	orcRecErro: boolean;
	onRetry: () => void;
	empresa: Empresa | null;
}

const MOSTRAR = 4;

/**
 * O CLIENTE QUE ESFRIOU — "esse cliente faz 6 meses que você não vai lá".
 *
 * Espelha `src/services/radarClientes.ts` do celular (150 dias, três fontes de última
 * interação, quem nunca foi atendido não entra, adiamento do app respeitado). A regra
 * mora em `radares.ts` com o mapa das diferenças; aqui é só a tela.
 *
 * Este radar não fala em dinheiro por escolha: o valor de uma manutenção futura é
 * palpite, e palpite em reais estraga a confiança nos números que são medidos. Ele
 * fala em TEMPO, que é dado real — e a ação continua sendo uma só, a mensagem que o
 * app escreveria.
 *
 * 3 estados, sem atalho: carregando · erro (nunca "nenhum cliente sumido", que faria
 * o dono deixar de ligar) · valor. Quatro consultas alimentam este card e QUALQUER
 * uma delas falhando derruba o card inteiro para o estado de erro — meia lista aqui é
 * pior que lista nenhuma, porque parece completa.
 */
export function ClientesEsfriandoCard({ orcamentos, recibos, orcRecCarregando, orcRecErro, onRetry, empresa }: Props) {
	const cliQ = useClientesRadar();
	const ageQ = useAgendaRadar();
	const snoozeQ = useRadarSnooze();

	const isLoading = orcRecCarregando || cliQ.isLoading || ageQ.isLoading;
	// O snooze fica FORA do erro de propósito (ver `useRadarSnooze`): sem ele o radar
	// mostra de mais, nunca de menos. As outras quatro leituras são o corpo do radar.
	const isError = orcRecErro || cliQ.isError || ageQ.isError;

	const esfriando = useMemo(() => {
		if (!orcamentos || !recibos || !cliQ.data || !ageQ.data) return null;
		return listarEsfriando({
			clientes: cliQ.data,
			orcamentos,
			agendamentos: ageQ.data,
			recibos,
			adiados: snoozeQ.data ?? {},
		});
	}, [orcamentos, recibos, cliQ.data, ageQ.data, snoozeQ.data]);

	const recarregar = () => {
		onRetry();
		cliQ.refetch();
		ageQ.refetch();
		snoozeQ.refetch();
	};

	const visiveis = esfriando?.slice(0, MOSTRAR) ?? [];
	const restantes = (esfriando?.length ?? 0) - visiveis.length;

	return (
		<Card className="h-full gap-0 overflow-hidden p-0 shadow-sm">
			<div className="flex items-center justify-between gap-3 border-border/60 border-b px-5 py-4">
				<div className="min-w-0">
					<h2 className="flex items-center gap-2 font-semibold text-base text-text-primary">
						<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-info/10 text-info-dark dark:text-info-light">
							<Snowflake className="size-[18px]" />
						</span>
						Clientes esfriando
					</h2>
					<p className="mt-1 text-text-secondary text-xs">
						Já foram atendidos e sumiram há mais de {Math.round(DIAS_ESFRIANDO / 30)} meses
						{!isLoading && !isError && esfriando && esfriando.length > 0
							? ` · ${plural(esfriando.length, "cliente")}`
							: ""}
					</p>
				</div>
			</div>

			<div className="p-3 sm:p-4">
				{isLoading ? (
					<div className="space-y-2">
						{["c1", "c2", "c3"].map((k) => (
							<div key={k} className="flex items-center gap-3 px-2 py-2.5">
								<div className="flex-1 space-y-1.5">
									<Skeleton className="h-3.5 w-2/5" />
									<Skeleton className="h-3 w-1/3" />
								</div>
								<Skeleton className="h-11 w-28 rounded-full" />
							</div>
						))}
					</div>
				) : isError ? (
					<div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
						<AlertTriangle className="size-7 text-warning" />
						<div>
							<p className="font-semibold text-sm text-text-primary">Não foi possível carregar</p>
							<p className="mt-0.5 text-text-secondary text-xs">Pode haver cliente sumido que você não está vendo.</p>
						</div>
						<button
							type="button"
							onClick={recarregar}
							className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-4 font-semibold text-text-primary text-xs transition-colors hover:bg-bg-neutral/60 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
						>
							<RotateCw className="size-3.5" />
							Tentar de novo
						</button>
					</div>
				) : visiveis.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
						<span className="grid size-12 place-items-center rounded-full bg-success/10 text-success">
							<CheckCircle2 className="size-6" />
						</span>
						<p className="font-semibold text-sm text-text-primary">Sua carteira está em dia</p>
						<p className="max-w-[280px] text-text-secondary text-xs">
							Nenhum cliente atendido ficou mais de {Math.round(DIAS_ESFRIANDO / 30)} meses sem contato.
						</p>
					</div>
				) : (
					<>
						<ul className="divide-y divide-border/50">
							{visiveis.map((c) => {
								const url = linkReconquista(c, empresa);
								return (
									<li
										key={c.id}
										className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-bg-neutral/40 motion-reduce:transition-none"
									>
										<div className="min-w-0 flex-1">
											<div className="truncate font-medium text-sm text-text-primary">{c.nome}</div>
											<div className="mt-0.5 text-text-secondary text-xs tabular-nums">
												{plural(c.meses, "mês", "meses")} sem contato
											</div>
										</div>

										{url ? (
											<a
												href={url}
												target="_blank"
												rel="noopener noreferrer"
												aria-label={`Chamar ${c.nome} no WhatsApp — ${plural(c.meses, "mês", "meses")} sem contato`}
												style={{ backgroundColor: WHATSAPP_VERDE, color: WHATSAPP_TEXTO }}
												className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 font-semibold text-xs shadow-sm transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/60"
											>
												<MessageCircle className="size-3.5" />
												Chamar
											</a>
										) : (
											<span
												className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 font-medium text-text-disabled text-xs"
												title="Sem telefone válido no cadastro deste cliente"
											>
												<PhoneOff className="size-3.5" />
												Sem telefone
											</span>
										)}
									</li>
								);
							})}
						</ul>
						{restantes > 0 && (
							<p className="px-2 pt-3 text-text-secondary text-xs">
								e mais {plural(restantes, "cliente")} sem contato.
							</p>
						)}
					</>
				)}
			</div>
		</Card>
	);
}
