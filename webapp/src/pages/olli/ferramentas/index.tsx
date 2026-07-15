import { motion, useReducedMotion } from "motion/react";
import { Calculator, ChevronRight, Search, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/ui/input";
import { cn } from "@/utils";
import { CalculadoraDialog } from "./CalculadoraDialog";
import { CALCULOS, type CalculoOficio, type VerticalId } from "./calculos";
import { categoriaDe, CATEGORIAS, ORDEM_CATEGORIAS, iconeDe } from "./meta";

/**
 * FERRAMENTAS DE OFÍCIO — o hub de calculadoras de campo do OLLI (BTU, carga de gás,
 * disjuntor, caixa d'água, tinta, adubação…). A matemática é a MESMA do app do celular
 * (cópia verbatim em calculos.ts); aqui é só a vitrine + o formulário ao vivo.
 *
 * Nada fica escondido: todas as calculadoras aparecem, com busca e filtro por ofício.
 * Clicar num card abre a calculadora (entradas + resultado que recalcula a cada tecla).
 * Não há estados de carregando/erro/vazio de rede — é cálculo 100% local — mas a
 * entrada é validada: campo obrigatório vazio mostra o que falta em vez de um zero falso.
 */

/** As categorias que realmente têm calculadora hoje, na ordem fixa da barra. */
function categoriasPresentes(): (keyof typeof CATEGORIAS)[] {
	const presentes = new Set<VerticalId>();
	for (const c of CALCULOS) for (const v of c.verticais) presentes.add(v);
	return ORDEM_CATEGORIAS.filter((id) => presentes.has(id));
}

export default function FerramentasPage() {
	const reduzir = useReducedMotion();
	const [busca, setBusca] = useState("");
	const [filtro, setFiltro] = useState<VerticalId | "todos">("todos");
	const [abertoId, setAbertoId] = useState<string | null>(null);

	const categorias = useMemo(categoriasPresentes, []);

	const lista = useMemo(() => {
		const termo = busca.trim().toLowerCase();
		return CALCULOS.filter((c) => {
			const porCategoria = filtro === "todos" || c.verticais.includes(filtro);
			const porBusca =
				!termo || c.nome.toLowerCase().includes(termo) || c.descricao.toLowerCase().includes(termo);
			return porCategoria && porBusca;
		});
	}, [busca, filtro]);

	const calcAberto = useMemo(() => CALCULOS.find((c) => c.id === abertoId) ?? null, [abertoId]);
	const corAberto = calcAberto ? categoriaDe(calcAberto.verticais).cor : "#0B6FCE";

	const containerVar = {
		hidden: {},
		show: { transition: { staggerChildren: reduzir ? 0 : 0.035 } },
	};
	const itemVar = reduzir
		? { hidden: { opacity: 1 }, show: { opacity: 1 } }
		: { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
			{/* Cabeçalho */}
			<div className="flex items-center gap-4">
				<div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-[#3FD8EA] text-white shadow-md shadow-primary/25">
					<Wrench className="size-6" strokeWidth={2.2} />
				</div>
				<div className="min-w-0">
					<h1 className="text-2xl font-bold tracking-tight text-text-primary">Ferramentas de ofício</h1>
					<p className="mt-0.5 text-sm text-text-secondary">
						{CALCULOS.length} calculadoras de campo, com a norma por trás de cada número.
					</p>
				</div>
			</div>

			{/* Busca + filtro por ofício */}
			<div className="space-y-3">
				<div className="relative max-w-md">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-disabled" />
					<Input
						value={busca}
						onChange={(e) => setBusca(e.target.value)}
						placeholder="Buscar calculadora (BTU, disjuntor, tinta…)"
						className="pl-9"
						aria-label="Buscar calculadora"
					/>
				</div>

				<div className="flex flex-wrap gap-2">
					<ChipFiltro ativo={filtro === "todos"} onClick={() => setFiltro("todos")} Icon={Calculator} label="Todas" />
					{categorias.map((id) => {
						const cat = CATEGORIAS[id];
						return (
							<ChipFiltro
								key={id}
								ativo={filtro === id}
								cor={cat.cor}
								Icon={cat.Icon}
								label={cat.label}
								onClick={() => setFiltro(id)}
							/>
						);
					})}
				</div>
			</div>

			{/* Grade de calculadoras */}
			{lista.length > 0 ? (
				<motion.div
					variants={containerVar}
					initial="hidden"
					animate="show"
					className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
				>
					{lista.map((calc) => (
						<CardCalculadora key={calc.id} calc={calc} variants={itemVar} onOpen={() => setAbertoId(calc.id)} />
					))}
				</motion.div>
			) : (
				<div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-14 text-center">
					<div className="grid size-11 place-items-center rounded-2xl bg-muted text-text-disabled">
						<Search className="size-5" />
					</div>
					<p className="font-semibold text-text-primary">Nenhuma calculadora encontrada</p>
					<p className="max-w-sm text-sm text-text-secondary">
						Tente outro termo ou toque em “Todas” para ver as {CALCULOS.length} ferramentas.
					</p>
				</div>
			)}

			<CalculadoraDialog
				key={calcAberto?.id}
				calc={calcAberto}
				cor={corAberto}
				aberto={!!calcAberto}
				onOpenChange={(aberto) => !aberto && setAbertoId(null)}
			/>
		</div>
	);
}

/* ─────────────────────────────  Cards e chips  ───────────────────────────── */

function CardCalculadora({
	calc,
	variants,
	onOpen,
}: {
	calc: CalculoOficio;
	variants: Record<string, { opacity: number; y?: number }>;
	onOpen: () => void;
}) {
	const cat = categoriaDe(calc.verticais);
	const Icon = iconeDe(calc.id);
	const reduzir = useReducedMotion();

	return (
		<motion.button
			type="button"
			onClick={onOpen}
			variants={variants}
			whileHover={reduzir ? undefined : { y: -3 }}
			transition={{ type: "spring", stiffness: 380, damping: 26 }}
			className={cn(
				"group flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 text-left shadow-sm",
				"transition-colors hover:border-text-disabled/60",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
			)}
		>
			<span
				className="grid size-11 shrink-0 place-items-center rounded-2xl"
				style={{ color: cat.cor, backgroundColor: `${cat.cor}1F` }}
			>
				<Icon className="size-5" strokeWidth={2.1} />
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<h3 className="truncate text-[15px] font-semibold text-text-primary">{calc.nome}</h3>
				</div>
				<p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-text-secondary">{calc.descricao}</p>
				<span
					className="mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
					style={{ color: cat.cor, backgroundColor: `${cat.cor}14` }}
				>
					{cat.label}
				</span>
			</div>
			<ChevronRight className="size-5 shrink-0 text-text-disabled transition-transform group-hover:translate-x-0.5 group-hover:text-text-secondary" />
		</motion.button>
	);
}

function ChipFiltro({
	ativo,
	cor,
	Icon,
	label,
	onClick,
}: {
	ativo: boolean;
	cor?: string;
	Icon: (typeof CATEGORIAS)[keyof typeof CATEGORIAS]["Icon"];
	label: string;
	onClick: () => void;
}) {
	const corAtiva = cor ?? "#0B6FCE";
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={ativo}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
				ativo
					? "text-white"
					: "border-border bg-card text-text-secondary hover:border-text-disabled hover:text-text-primary",
			)}
			style={ativo ? { backgroundColor: corAtiva, borderColor: corAtiva } : undefined}
		>
			<Icon className="size-3.5" />
			{label}
		</button>
	);
}
