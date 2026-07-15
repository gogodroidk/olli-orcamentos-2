import { motion, useReducedMotion } from "motion/react";
import { Check, Copy, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Campo } from "@/olli/components/campos";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { cn } from "@/utils";
import type { CalculoOficio, CampoCalc } from "./calculos";
import { iconeDe } from "./meta";

/** Valores iniciais: default do campo; senão 1ª opção (opção) ou vazio (número). */
function valoresIniciais(calc: CalculoOficio): Record<string, string> {
	const v: Record<string, string> = {};
	for (const campo of calc.campos) {
		v[campo.key] = campo.default ?? (campo.tipo === "opcao" ? (campo.opcoes?.[0]?.v ?? "") : "");
	}
	return v;
}

/** Só o que faz sentido num campo numérico BR: dígitos, vírgula/ponto e sinal negativo. */
function limparNumero(s: string): string {
	return s.replace(/[^0-9.,-]/g, "");
}

export function CalculadoraDialog({
	calc,
	cor,
	aberto,
	onOpenChange,
}: {
	calc: CalculoOficio | null;
	cor: string;
	aberto: boolean;
	onOpenChange: (aberto: boolean) => void;
}) {
	return (
		<Dialog open={aberto} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
				{calc && <Conteudo calc={calc} cor={cor} />}
			</DialogContent>
		</Dialog>
	);
}

/**
 * O conteúdo é remontado por `key={calc.id}` no pai, então cada calculadora começa
 * com seus próprios valores iniciais (nada de estado vazando entre ferramentas).
 */
function Conteudo({ calc, cor }: { calc: CalculoOficio; cor: string }) {
	const [valores, setValores] = useState<Record<string, string>>(() => valoresIniciais(calc));
	const reduzir = useReducedMotion();
	const { copyFn, copiedText } = useCopyToClipboard();
	const Icon = iconeDe(calc.id);

	const resultado = useMemo(() => calc.calcular(valores), [calc, valores]);

	// VALIDAÇÃO de entrada: campos numéricos SEM default são obrigatórios para um
	// resultado que signifique algo. Enquanto faltar um deles, mostramos o que falta
	// em vez de um "0" enganoso.
	const camposObrigatorios = useMemo(
		() => calc.campos.filter((c) => c.tipo === "numero" && c.default === undefined),
		[calc],
	);
	const faltando = camposObrigatorios.filter((c) => !(valores[c.key] ?? "").trim());
	const prontoParaCalcular = faltando.length === 0;

	function definir(key: string, valor: string) {
		setValores((prev) => ({ ...prev, [key]: valor }));
	}

	const resumoCopiado = copiedText === resultado.resumo && !!resultado.resumo;

	return (
		<div className="flex max-h-[86vh] flex-col">
			{/* Cabeçalho fixo com o ícone da ferramenta */}
			<DialogHeader className="shrink-0 space-y-0 border-b border-border/70 p-5 text-left sm:p-6">
				<div className="flex items-start gap-3.5">
					<span
						className="grid size-11 shrink-0 place-items-center rounded-2xl"
						style={{ color: cor, backgroundColor: `${cor}1F` }}
					>
						<Icon className="size-5" strokeWidth={2.1} />
					</span>
					<div className="min-w-0">
						<DialogTitle className="text-lg font-bold tracking-tight text-text-primary">{calc.nome}</DialogTitle>
						<DialogDescription className="mt-0.5 text-sm text-text-secondary">{calc.descricao}</DialogDescription>
					</div>
				</div>
			</DialogHeader>

			{/* Corpo rolável: entradas à esquerda, resultado ao vivo à direita (empilha no celular) */}
			<div className="grid flex-1 gap-0 overflow-y-auto md:grid-cols-2">
				<div className="space-y-4 p-5 sm:p-6">
					{calc.campos.map((campo) => (
						<CampoCalculadora
							key={campo.key}
							campo={campo}
							valor={valores[campo.key] ?? ""}
							faltando={faltando.some((c) => c.key === campo.key)}
							cor={cor}
							onChange={(v) => definir(campo.key, v)}
						/>
					))}
				</div>

				{/* Painel de resultado — sticky no desktop para acompanhar a rolagem das entradas */}
				<div className="border-t border-border/70 bg-muted/40 p-5 md:border-l md:border-t-0 sm:p-6">
					<div className="md:sticky md:top-0">
						{prontoParaCalcular ? (
							<ResultadoView
								resultado={resultado}
								cor={cor}
								reduzir={!!reduzir}
								onCopiar={() => resultado.resumo && copyFn(resultado.resumo)}
								copiado={resumoCopiado}
							/>
						) : (
							<PromptFaltando faltando={faltando} />
						)}
					</div>
				</div>
			</div>

			{/* Base normativa — sempre visível, é o que dá credibilidade ao número */}
			<div className="shrink-0 border-t border-border/70 p-5 sm:px-6 sm:py-4">
				<p className="text-[11.5px] leading-relaxed text-text-disabled">
					<span className="font-semibold text-text-secondary">Base técnica: </span>
					{calc.base}
				</p>
			</div>
		</div>
	);
}

/* ─────────────────────────────  Campos  ───────────────────────────── */

function CampoCalculadora({
	campo,
	valor,
	faltando,
	cor,
	onChange,
}: {
	campo: CampoCalc;
	valor: string;
	faltando: boolean;
	cor: string;
	onChange: (v: string) => void;
}) {
	if (campo.tipo === "opcao") {
		return (
			<div className="space-y-1.5">
				<p className="text-sm font-medium text-text-primary">{campo.label}</p>
				<div className="flex flex-wrap gap-1.5" role="group" aria-label={campo.label}>
					{(campo.opcoes ?? []).map((op) => {
						const ativo = valor === op.v;
						return (
							<button
								key={op.v}
								type="button"
								onClick={() => onChange(op.v)}
								aria-pressed={ativo}
								className={cn(
									"rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
									ativo
										? "text-white"
										: "border-border bg-card text-text-secondary hover:border-text-disabled hover:text-text-primary",
								)}
								style={ativo ? { backgroundColor: cor, borderColor: cor } : undefined}
							>
								{op.label}
							</button>
						);
					})}
				</div>
			</div>
		);
	}

	const rotulo = campo.sufixo ? `${campo.label} (${campo.sufixo})` : campo.label;
	return (
		<Campo rotulo={rotulo} erro={faltando ? "Preencha para calcular" : undefined}>
			<div className="relative">
				<Input
					inputMode="decimal"
					value={valor}
					placeholder={campo.placeholder ?? "0"}
					onChange={(e) => onChange(limparNumero(e.target.value))}
					className={cn("tabular-nums", campo.sufixo && "pr-14")}
				/>
				{campo.sufixo && (
					<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-disabled">
						{campo.sufixo}
					</span>
				)}
			</div>
		</Campo>
	);
}

/* ─────────────────────────────  Resultado  ───────────────────────────── */

function ResultadoView({
	resultado,
	cor,
	reduzir,
	onCopiar,
	copiado,
}: {
	resultado: ReturnType<CalculoOficio["calcular"]>;
	cor: string;
	reduzir: boolean;
	onCopiar: () => void;
	copiado: boolean;
}) {
	return (
		<div className="space-y-4">
			<div className="space-y-2.5">
				{resultado.linhas.map((linha, i) => (
					<div key={`${linha.label}-${i}`} className="flex items-baseline justify-between gap-3">
						<span className="text-[13px] text-text-secondary">{linha.label}</span>
						{linha.destaque ? (
							<motion.span
								key={linha.valor}
								initial={reduzir ? false : { opacity: 0, y: 4 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.22, ease: "easeOut" }}
								className="text-right text-lg font-bold tabular-nums"
								style={{ color: cor }}
							>
								{linha.valor}
							</motion.span>
						) : (
							<span className="text-right text-sm font-semibold tabular-nums text-text-primary">{linha.valor}</span>
						)}
					</div>
				))}
			</div>

			{resultado.resumo && (
				<div className="rounded-xl border border-border/70 bg-card p-3">
					<p className="text-[13px] leading-relaxed text-text-secondary">{resultado.resumo}</p>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onCopiar}
						className="mt-2.5 h-8 w-full gap-1.5"
					>
						{copiado ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
						{copiado ? "Copiado" : "Copiar resultado"}
					</Button>
				</div>
			)}

			{resultado.itemOrcamento && (
				<div className="rounded-xl border border-dashed border-border p-3">
					<p className="text-[11px] font-semibold uppercase tracking-wide text-text-disabled">Sugestão para o orçamento</p>
					<p className="mt-1 text-sm font-semibold text-text-primary">{resultado.itemOrcamento.nome}</p>
					<p className="mt-0.5 text-[13px] text-text-secondary">{resultado.itemOrcamento.descricao}</p>
				</div>
			)}

			{resultado.aviso && (
				<div className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
					<Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
					<p className="text-[12.5px] leading-relaxed text-amber-800 dark:text-amber-200">{resultado.aviso}</p>
				</div>
			)}
		</div>
	);
}

function PromptFaltando({ faltando }: { faltando: CampoCalc[] }) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
			<p className="text-sm font-semibold text-text-primary">Preencha para ver o resultado</p>
			<p className="max-w-xs text-[13px] text-text-secondary">
				Falta preencher:{" "}
				<span className="font-medium text-text-primary">{faltando.map((c) => c.label).join(", ")}</span>. O cálculo
				aparece aqui na hora.
			</p>
		</div>
	);
}
