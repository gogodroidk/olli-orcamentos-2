import { AlertTriangle, ArrowUpRight, type LucideIcon, RotateCw } from "lucide-react";
import { Link } from "react-router";
import { ContadorDinheiro } from "@/components/animate/contador-dinheiro";
import { useValorVistoAntes } from "@/components/animate/use-valor-visto";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";

export interface KpiDinheiroProps {
	label: string;
	/** Valor JÁ formatado (R$ ou %). Nunca passe "0" para representar "não sei". */
	valor: string;
	/** Uma linha de contexto: o que exatamente está sendo somado. */
	detalhe: string;
	/** Aviso âmbar: dado que ficou de FORA da conta (ex.: recibo sem data). */
	aviso?: string;
	to: string;
	Icon: LucideIcon;
	/** Cor do tile (hex da paleta OLLI). */
	color: string;
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
	/**
	 * "Dinheiro entrou": o valor NUMÉRICO por trás de `valor`, para o número subir do
	 * que o dono viu da última vez até o de agora. `chave` identifica o número (e o
	 * período — "recebido-mes:2026-09" — para a virada do mês não contar como queda).
	 * `valor: null` = ainda não sei (carregando/erro): nada conta.
	 */
	contador?: { valor: number | null; chave: string; formatar: (n: number) => string };
}

/**
 * KPI de DINHEIRO — clicável, leva para a lista já filtrada.
 *
 * A regra dos 3 estados aqui não é estética, é contábil:
 *   carregando → skeleton
 *   ERRO       → cara de erro + "Tentar de novo". NUNCA "R$ 0,00": um zero falso faz
 *                o dono achar que não tem nada a receber e parar de cobrar.
 *   ok         → valor + o que ele significa.
 * No estado de erro o cartão deixa de ser link (botão dentro de <a> é âncora
 * aninhada — quebra teclado e leitor de tela) e vira um card com o botão de retry.
 */
export function KpiDinheiroCard(props: KpiDinheiroProps) {
	const { label, valor, detalhe, aviso, to, Icon, color, isLoading, isError, onRetry, contador } = props;
	// Antes dos retornos (regra dos hooks). Só grava um valor CONFIRMADO: carregando ou
	// erro nunca viram "o dono viu R$ 0".
	const numero = contador && !isLoading && !isError ? contador.valor : null;
	const antes = useValorVistoAntes(contador?.chave ?? null, numero);
	const entrou = numero !== null && antes !== null && numero > antes ? numero - antes : null;

	const tile = (
		<span
			className="grid size-11 shrink-0 place-items-center rounded-xl border"
			style={{ backgroundColor: `${color}1A`, color, borderColor: `${color}33` }}
		>
			<Icon className="size-5" strokeWidth={2.2} />
		</span>
	);

	if (isError) {
		return (
			<Card className="h-full gap-0 p-5 shadow-sm">
				<div className="flex items-start justify-between">
					{tile}
					<AlertTriangle className="size-4 text-warning" aria-hidden />
				</div>
				<div className="surgir mt-4">
					<div className="text-sm font-semibold text-text-primary">Não foi possível calcular</div>
					<div className="mt-0.5 text-sm font-medium text-text-secondary">{label}</div>
					<button
						type="button"
						onClick={onRetry}
						className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:bg-bg-neutral/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
					>
						<RotateCw className="size-3.5" />
						Tentar de novo
					</button>
				</div>
			</Card>
		);
	}

	return (
		<Link
			to={to}
			aria-busy={isLoading}
			// Foco de teclado VISÍVEL: um contorno sólido primary com afastamento, no
			// próprio <a> (fora do Card, que tem overflow-hidden e recortaria um anel
			// interno). Antes o único indicador era `group-focus-visible:ring-primary/50`
			// — 1px a 50% de opacidade, que a auditoria não conseguiu enxergar.
			//
			// SEM `outline-none` aqui — e isso NÃO é estilo, é o que faz o anel existir.
			// No Tailwind v4 `outline-none` não é só `outline-style:none`: ele grava
			// `--tw-outline-style: none` NO PRÓPRIO ELEMENTO, e `outline-2` aplica
			// `outline-style: var(--tw-outline-style)`. Com os dois na mesma className o
			// segundo lia o "none" do primeiro: medido no navegador com foco de teclado
			// real, dava `outline-style: none` (largura 2px e cor #0B6FCE certas, estilo
			// nenhum) — ou seja, ANEL INVISÍVEL mesmo com `:focus-visible` casando.
			// Forçar `--tw-outline-style: solid` na mão fazia o anel aparecer na hora.
			// O `outline-none` também não fazia falta: o contorno padrão do navegador em
			// link só aparece em `:focus-visible`, que é exatamente o que a gente pinta.
			className="group block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
		>
			<Card className="relative h-full gap-0 overflow-hidden p-5 shadow-sm ring-1 ring-transparent transition-all duration-200 group-hover:-translate-y-1 group-hover:border-primary/30 group-hover:shadow-lg group-focus-visible:border-primary group-focus-visible:ring-2 group-focus-visible:ring-primary motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
				<div
					className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-60 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
					style={{ backgroundColor: `${color}1F` }}
					aria-hidden
				/>
				<div className="relative flex items-start justify-between">
					{tile}
					<ArrowUpRight className="size-4 -translate-x-1 text-text-disabled opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
				</div>
				<div className="relative mt-4">
					<div className="text-sm font-medium text-text-secondary">{label}</div>
					{/* `surgir`: o valor chega no lugar do esqueleto com um fade curto (tokens.css). */}
					{isLoading ? (
						<Skeleton className="mt-1.5 h-8 w-32" />
					) : (
						<div className="surgir mt-1 truncate text-[26px] font-bold leading-tight tracking-tight text-text-primary tabular-nums font-serif">
							{contador && numero !== null ? (
								<ContadorDinheiro valor={numero} desde={antes} formatar={contador.formatar} />
							) : (
								valor
							)}
						</div>
					)}
					{isLoading ? (
						<Skeleton className="mt-2 h-3 w-24" />
					) : (
						<div className="surgir mt-1.5 text-xs text-text-secondary">{detalhe}</div>
					)}
					{/* O quanto ENTROU desde a última vez que ele olhou — o motivo da contagem. */}
					{entrou !== null && contador && (
						<div className="surgir mt-2 inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success-darker tabular-nums dark:text-success-light">
							+{contador.formatar(entrou)} desde a sua última visita
						</div>
					)}
					{!isLoading && aviso && (
						<div className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning/10 px-2 py-1.5 text-[11px] leading-snug text-warning-darker dark:text-warning">
							<AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
							<span>{aviso}</span>
						</div>
					)}
				</div>
			</Card>
		</Link>
	);
}
