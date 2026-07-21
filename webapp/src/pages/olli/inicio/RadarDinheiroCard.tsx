import type { Empresa } from "@dominio";
import { AlertTriangle, CheckCircle2, MessageCircle, PhoneOff, RotateCw, Wallet } from "lucide-react";
import { Link } from "react-router";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { paramStatus, type RadarDinheiro, STATUS_A_RECEBER, WHATSAPP_TEXTO, WHATSAPP_VERDE } from "./financeiro";
import { formatBRL, plural } from "./helpers";
import { linkCobranca } from "./radares";

interface Props {
	/** `null` enquanto não há resultado (carregando ou erro) — nunca um radar zerado falso. */
	radar: RadarDinheiro | null;
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
	/** Empresa do dono (blob) — dá nome, cidade e chave Pix para a cobrança. */
	empresa: Empresa | null;
}

/** Quantas linhas cabem no palco antes de virar lista. */
const MOSTRAR = 3;

/**
 * O RADAR DE DINHEIRO PARADO — a primeira coisa que o painel diz.
 *
 * O celular já abria o dia assim (`src/services/radarCobranca.ts`); o painel abria
 * com contagem de cadastro. Este bloco é o palco que faltava: o número em REAIS, com
 * o TEMPO junto ("R$ 800,00 · parado há 12 dias" diz mais que "3 pendentes"), e a
 * cobrança a um toque — o WhatsApp abre com o texto e o Pix já montados pelas MESMAS
 * funções do app (ver `radares.ts`), sem sair da tela.
 *
 * ═══ OS QUATRO ESTADOS, E POR QUE NENHUM PODE FALTAR ═══
 * • CARREGANDO — esqueleto. Nunca um "R$ 0,00" que depois pula para R$ 2.340.
 * • ERRO ....... diz que NÃO SABE, com "Tentar de novo". É a regra mais cara desta
 *   casa: "você não tem dinheiro parado" quando a consulta quebrou faz o dono parar
 *   de cobrar. Aqui, erro nunca vira zero e nunca vira sucesso.
 * • CALMO ...... quando de fato não há nada parado, o bloco NÃO some nem vira card
 *   fantasma: encolhe para uma faixa curta que confirma o bom estado. O dono precisa
 *   saber que o radar olhou e não achou nada — diferente de o radar não ter olhado.
 *   E se houver orçamento aprovado SEM VALOR no cadastro, a faixa calma troca de tom
 *   e admite que não dá para somar, em vez de garantir que não há nada (ver `Calmo`).
 * • ALERTA ..... o número grande, o tempo e os botões.
 *
 * MOVIMENTO: nenhuma animação de entrada. O que se move é só `transform`/`opacity` no
 * hover/foco dos botões, e desliga em `prefers-reduced-motion`. Um valor em dinheiro
 * não precisa de encenação para ser notado — e animação aqui atrasaria a leitura de
 * quem abriu o painel com o cliente esperando.
 */
export function RadarDinheiroCard({ radar, isLoading, isError, onRetry, empresa }: Props) {
	if (isLoading) return <Carregando />;
	if (isError) return <Erro onRetry={onRetry} />;
	if (!radar) return <Carregando />;
	if (radar.linhas.length === 0) return <Calmo semValor={radar.semValor} />;

	const visiveis = radar.linhas.slice(0, MOSTRAR);
	const restantes = radar.linhas.length - visiveis.length;

	return (
		<Card className="gap-0 overflow-hidden border-warning/30 p-0 shadow-sm">
			<div className="flex flex-col gap-5 bg-warning/5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-6">
				<div className="min-w-0">
					<h2 className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
						<span className="grid size-7 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning">
							<Wallet className="size-4" />
						</span>
						Dinheiro parado
					</h2>

					{/* O número. Grande porque é o assunto da tela, não um detalhe dela. */}
					<p className="mt-2 font-bold text-4xl text-text-primary leading-none tabular-nums sm:text-5xl">
						{formatBRL(radar.total)}
					</p>

					<p className="mt-2 text-sm text-text-secondary">
						{legenda(radar)}
						{radar.jaRecebido > 0 && (
							// `text-text-secondary`, não `-disabled`: isto é DINHEIRO que já entrou,
							// informação de verdade — e o token "disabled" (#919EAB) mede 2,73:1
							// sobre o branco a 12px, medido na tela carregada no tema claro. O
							// "disabled" existe para controle desligado, não para texto que informa.
							<span className="text-text-secondary"> · já entrou {formatBRL(radar.jaRecebido)}</span>
						)}
					</p>

					{radar.semValor > 0 && (
						<p className="mt-2 flex items-start gap-1.5 text-warning-darker text-xs dark:text-warning">
							<AlertTriangle className="mt-px size-3.5 shrink-0" />
							{plural(radar.semValor, "orçamento aprovado", "orçamentos aprovados")} sem valor no cadastro — fora desta
							conta.
						</p>
					)}
				</div>

				{/* As linhas: quem, quanto, há quanto tempo — e o botão que cobra dali mesmo. */}
				<ul className="flex w-full shrink-0 flex-col gap-2 sm:max-w-[24rem]">
					{visiveis.map((item) => {
						const url = linkCobranca(item, empresa);
						return (
							<li
								key={item.id}
								className="flex items-center gap-3 rounded-xl border border-border/60 bg-background px-3 py-2"
							>
								<div className="min-w-0 flex-1">
									<div className="truncate font-medium text-sm text-text-primary">{item.cliente}</div>
									<div className="mt-0.5 truncate text-text-secondary text-xs tabular-nums">
										{formatBRL(item.saldo)}
										{frasePeriodo(item.dias) ? ` · ${frasePeriodo(item.dias)}` : ""}
									</div>
								</div>

								{url ? (
									<a
										href={url}
										target="_blank"
										rel="noopener noreferrer"
										aria-label={`Cobrar ${item.cliente} pelo WhatsApp — ${formatBRL(item.saldo)}`}
										style={{ backgroundColor: WHATSAPP_VERDE, color: WHATSAPP_TEXTO }}
										className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 font-semibold text-sm shadow-sm transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/60"
									>
										<MessageCircle className="size-4" />
										Cobrar
									</a>
								) : (
									<span
										className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 font-medium text-text-disabled text-xs"
										title="Sem telefone válido no cadastro deste orçamento"
									>
										<PhoneOff className="size-3.5" />
										Sem telefone
									</span>
								)}
							</li>
						);
					})}

					{restantes > 0 && (
						<Link
							to={`/orcamentos?status=${paramStatus(STATUS_A_RECEBER)}`}
							className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 font-semibold text-primary text-sm transition-colors hover:bg-primary/10 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
						>
							Ver os outros {restantes} · total {formatBRL(radar.total)}
						</Link>
					)}
				</ul>
			</div>
		</Card>
	);
}

/* ───────────────────────────  estados  ─────────────────────────── */

function Carregando() {
	return (
		<Card className="gap-0 overflow-hidden p-0 shadow-sm">
			<div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<div className="space-y-3">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-10 w-56" />
					<Skeleton className="h-3.5 w-44" />
				</div>
				<div className="w-full space-y-2 sm:max-w-[24rem]">
					{["d1", "d2"].map((k) => (
						<Skeleton key={k} className="h-14 w-full rounded-xl" />
					))}
				</div>
			</div>
		</Card>
	);
}

function Erro({ onRetry }: { onRetry: () => void }) {
	return (
		<Card className="gap-0 overflow-hidden border-warning/40 p-0 shadow-sm">
			<div className="flex flex-col gap-3 bg-warning/5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<div className="flex items-start gap-3">
					<span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning">
						<AlertTriangle className="size-5" />
					</span>
					<div>
						<p className="font-semibold text-base text-text-primary">Não foi possível ler o dinheiro parado</p>
						{/*
						 * A frase existe para impedir a leitura mais cara do produto. Sem ela, um
						 * bloco em branco no lugar do número é lido como "não tenho nada a receber".
						 */}
						<p className="mt-0.5 text-sm text-text-secondary">
							Pode haver orçamento aprovado esperando pagamento — isto é uma falha de leitura, não um "está tudo pago".
						</p>
					</div>
				</div>
				<button
					type="button"
					onClick={onRetry}
					className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border px-4 font-semibold text-sm text-text-primary transition-colors hover:bg-bg-neutral/60 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
				>
					<RotateCw className="size-4" />
					Tentar de novo
				</button>
			</div>
		</Card>
	);
}

/**
 * O ESTADO CALMO. Não é um vazio triste nem um card fantasma: é uma faixa curta que
 * diz que o radar olhou e não achou nada. Some da hierarquia (altura pequena, sem
 * número gigante) sem sumir da tela — a ausência do bloco faria o dono duvidar se o
 * painel está olhando.
 *
 * Com `semValor > 0` a faixa MUDA de tom, e isso é P0: existem orçamentos aprovados
 * que não dá para somar (valor em branco no cadastro). Dizer "nenhum dinheiro parado"
 * ali seria transformar um "não sei quanto" em "não tem" — a mentira que este produto
 * não pode contar. Então a faixa admite que não sabe e diz quantos são.
 */
function Calmo({ semValor }: { semValor: number }) {
	if (semValor > 0) {
		return (
			<Card className="gap-0 overflow-hidden border-warning/30 p-0 shadow-sm">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-warning/5 px-5 py-3.5 sm:px-6">
					<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning">
						<AlertTriangle className="size-[18px]" />
					</span>
					<p className="font-semibold text-sm text-text-primary">Não dá para somar o que está parado</p>
					<p className="text-sm text-text-secondary">
						{plural(semValor, "orçamento aprovado", "orçamentos aprovados")} sem valor no cadastro — o resto já foi
						pago.
					</p>
				</div>
			</Card>
		);
	}

	return (
		<Card className="gap-0 overflow-hidden p-0 shadow-sm">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3.5 sm:px-6">
				<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
					<CheckCircle2 className="size-[18px]" />
				</span>
				<p className="font-semibold text-sm text-text-primary">Nenhum dinheiro parado</p>
				<p className="text-sm text-text-secondary">Nenhum orçamento aprovado está esperando pagamento.</p>
			</div>
		</Card>
	);
}

/* ───────────────────────────  frases  ─────────────────────────── */

/** "hoje" · "há 1 dia" · "há 12 dias". `null` quando não há data legível (não chuta). */
function frasePeriodo(dias: number | null): string | null {
	if (dias === null) return null;
	if (dias <= 0) return "hoje";
	return `há ${plural(dias, "dia")}`;
}

/**
 * A linha embaixo do número: quantos são e há quanto tempo o mais antigo espera.
 * O TEMPO é metade da frase — "R$ 800,00 · parado há 12 dias" cobra sozinho; "3
 * orçamentos pendentes" não diz nada que faça alguém pegar o telefone.
 */
function legenda(radar: RadarDinheiro): string {
	const tempo = frasePeriodo(radar.diasMaisAntigo);
	if (radar.itens === 1) {
		if (tempo === null) return "1 orçamento aprovado, ainda sem pagamento";
		if (tempo === "hoje") return "1 orçamento aprovado hoje, ainda sem pagamento";
		return `1 orçamento aprovado, parado ${tempo}`;
	}
	const quantos = `${plural(radar.itens, "orçamento aprovado", "orçamentos aprovados")} sem pagamento`;
	if (tempo === null) return quantos;
	return tempo === "hoje" ? `${quantos}, todos aprovados hoje` : `${quantos} · o mais antigo parado ${tempo}`;
}
