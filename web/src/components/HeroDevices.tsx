import {
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
} from "motion/react";
import type { MouseEvent, ReactNode } from "react";
import { useRef } from "react";

/**
 * Hero 3D do OLLI — mostra o produto DE VERDADE: a página web (browser com o
 * print real do painel) e o app (um smartphone premium com um orçamento). Os
 * dois "sobem girando" UMA vez na entrada e reagem ao mouse (parallax 3D).
 *
 * Perf: SEM loop de animação contínuo (o projeto já matou "loops contínuos na
 * web" — perfil P0). O parallax usa MotionValues + spring, então NÃO dispara
 * re-render do React a cada mousemove. Respeita prefers-reduced-motion.
 */
export default function HeroDevices() {
	const reduce = useReducedMotion();
	const ref = useRef<HTMLDivElement>(null);

	// Parallax sem setState: MotionValues -> spring -> transform de rotação.
	const px = useMotionValue(0);
	const py = useMotionValue(0);
	const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [6, -6]), {
		stiffness: 120,
		damping: 18,
	});
	const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-10, 10]), {
		stiffness: 120,
		damping: 18,
	});

	function onMove(e: MouseEvent<HTMLDivElement>) {
		if (reduce) return;
		const el = ref.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		px.set((e.clientX - r.left) / r.width - 0.5);
		py.set((e.clientY - r.top) / r.height - 0.5);
	}
	function onLeave() {
		px.set(0);
		py.set(0);
	}

	return (
		<div
			ref={ref}
			onMouseMove={onMove}
			onMouseLeave={onLeave}
			aria-hidden="true"
			className="relative mx-auto w-full max-w-xl"
			style={{ perspective: "1200px" }}
		>
			{/* brilhos de marca ao fundo */}
			<div className="pointer-events-none absolute -inset-12 -z-10">
				<div
					className="absolute right-0 top-4 h-72 w-72 rounded-full blur-3xl"
					style={{
						background:
							"radial-gradient(closest-side, rgba(63,216,234,.55), transparent)",
					}}
				/>
				<div
					className="absolute -left-8 bottom-0 h-80 w-80 rounded-full blur-3xl"
					style={{
						background:
							"radial-gradient(closest-side, rgba(11,111,206,.5), transparent)",
					}}
				/>
			</div>

			<motion.div
				className="relative"
				style={{ transformStyle: "preserve-3d", rotateX, rotateY }}
			>
				{/* BROWSER — o painel, DESENHADO EM CÓDIGO (não é print).
				    Antes aqui havia um /olli-painel.png que era, na verdade, a demo do
				    template Slash: menu em inglês (Workbench, Error Page…), botão "Join
				    Discord" e números falsos em dólar. Estávamos anunciando o produto com
				    a tela de outro produto. Em código a tela é sempre a nossa, fica nítida
				    em qualquer resolução e não custa 200KB de imagem. */}
				{/* ⚠️ SEM `initial`/`animate` DE ENTRADA — E ISTO É P0, NÃO ESTÉTICA.
				    A ilha agora hidrata com `client:media` (só onde há mouse), mas o HTML
				    dela é gerado UMA vez no build e servido igual para todo mundo. Com
				    `initial={{opacity:0}}`, o Astro assava `opacity:0` no HTML estático —
				    e no CELULAR, onde a ilha nunca hidrata, NADA voltaria a opacidade
				    para 1. O hero inteiro ficaria invisível, para sempre, em todo
				    aparelho sem mouse. Medido no dist/, não deduzido.
				    A pose final virou a pose ESTÁTICA: o hero nasce visível e correto
				    mesmo sem uma linha de JS. O que continua exigindo JS é só o parallax
				    de mouse — que é exatamente o que o `client:media` está comprando. */}
				<motion.div
					className="relative z-10 ml-auto hidden w-[93%] sm:block"
					style={{ transformStyle: "preserve-3d", rotateY: -12 }}
				>
					<div className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_40px_80px_-20px_rgba(10,37,71,.35)] ring-1 ring-black/5">
						<div className="flex items-center gap-1.5 border-b border-line bg-paper px-3 py-2.5">
							<span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
							<span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
							<span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
							<span className="ml-3 rounded-md bg-white px-3 py-1 text-[11px] text-muted tnum">
								app.olliorcamentos.online
							</span>
						</div>
						<BrowserScreen />
					</div>
				</motion.div>

				{/* PHONE — protagonista: smartphone premium com o app OLLI. */}
				<div className="relative z-30 mx-auto w-56 sm:absolute sm:-bottom-6 sm:left-[-2.25rem] sm:mx-0 sm:w-60 lg:-bottom-12 lg:w-[16.5rem]">
					{/* Mesma razão do bloco acima: pose final estática, senão o telefone
					    — que no celular é o ÚNICO aparelho visível (o browser é
					    `hidden sm:block`) — sumiria da tela de quem não tem mouse. */}
					<motion.div
						style={{ transformStyle: "preserve-3d", rotateY: 9 }}
					>
						<PhoneFrame />
					</motion.div>
				</div>
			</motion.div>
		</div>
	);
}

/* ─────────────────────────  TELA DO PAINEL (NAVEGADOR)  ────────────────────── */

/** Itens do menu — os MESMOS do painel de verdade (webapp/), em português. */
const MENU = [
	"Início",
	"Orçamentos",
	"Clientes",
	"Ordens de serviço",
	"Agenda",
	"Quadro",
	"Equipe",
];

/** Fatias do donut. Somam 100 — o dasharray depende disso. */
const STATUS = [
	{ rotulo: "Aprovados", pct: 52, cor: "#2BE39A" },
	{ rotulo: "Enviados", pct: 31, cor: "#0B6FCE" },
	{ rotulo: "Rascunho", pct: 17, cor: "#D8E3F0" },
];

function BrowserScreen() {
	return (
		<div className="flex aspect-[16/10] bg-paper">
			{/* Menu lateral */}
			<aside className="flex w-[23%] shrink-0 flex-col border-r border-line bg-white px-2 py-2.5">
				<div className="flex items-center gap-1.5 px-1.5">
					<OlliMark tone="marca" />
					<span className="text-[11px] font-extrabold tracking-tight text-ink">
						OLLI
					</span>
				</div>
				<nav className="mt-3 space-y-[3px]">
					{MENU.map((item, i) => (
						<span
							key={item}
							className={`flex items-center gap-1.5 rounded-md px-1.5 py-[5px] text-[8.5px] font-semibold ${
								i === 0 ? "bg-tint text-brand" : "text-slate"
							}`}
						>
							<span
								className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-brand" : "bg-line"}`}
							/>
							{item}
						</span>
					))}
				</nav>
			</aside>

			{/* Conteúdo */}
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex items-center justify-between border-b border-line bg-white px-3 py-2">
					<span className="text-[10px] font-bold text-ink">Início</span>
					<span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[7.5px] font-bold text-white">
						IR
					</span>
				</div>

				<div className="flex flex-1 flex-col gap-2 p-2.5">
					<div>
						<p className="text-[11px] font-extrabold leading-tight text-ink">
							Boa tarde, Igor 👋
						</p>
						<p className="text-[7.5px] font-medium text-muted">
							Você tem 3 orçamentos aguardando resposta.
						</p>
					</div>

					<div className="grid grid-cols-4 gap-1.5">
						<MiniStat rotulo="Orçamentos" valor="38" delta="+12%" />
						<MiniStat rotulo="Aprovados" valor="24" delta="+8%" />
						<MiniStat rotulo="Faturado" valor="R$ 42,1k" delta="+21%" />
						<MiniStat rotulo="Clientes" valor="126" delta="+5%" />
					</div>

					<div className="grid min-h-0 flex-1 grid-cols-[0.85fr_1fr] gap-1.5">
						{/* Rosca de status */}
						<div className="flex flex-col rounded-lg border border-line bg-white p-2">
							<p className="text-[7px] font-bold uppercase tracking-[0.12em] text-muted">
								Por status
							</p>
							<div className="flex flex-1 items-center gap-2">
								<DonutStatus />
								<div className="space-y-[3px]">
									{STATUS.map((s) => (
										<span
											key={s.rotulo}
											className="flex items-center gap-1 text-[7px] font-semibold text-slate"
										>
											<span
												className="h-1.5 w-1.5 rounded-full"
												style={{ background: s.cor }}
											/>
											{s.rotulo}
										</span>
									))}
								</div>
							</div>
						</div>

						{/* Orçamentos recentes */}
						<div className="flex flex-col rounded-lg border border-line bg-white p-2">
							<p className="mb-1.5 text-[7px] font-bold uppercase tracking-[0.12em] text-muted">
								Recentes
							</p>
							<div className="space-y-1.5">
								<PainelRow
									nome="Clínica Vida & Saúde"
									valor="R$ 2.480"
									status="Aprovado"
									tom="mint"
								/>
								<PainelRow
									nome="Ar Frio Refrigeração"
									valor="R$ 640"
									status="Enviado"
									tom="brand"
								/>
								<PainelRow
									nome="Padaria Pão Quente"
									valor="R$ 1.150"
									status="Rascunho"
									tom="muted"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function MiniStat({
	rotulo,
	valor,
	delta,
}: {
	rotulo: string;
	valor: string;
	delta: string;
}) {
	return (
		<div className="rounded-lg border border-line bg-white px-1.5 py-1.5">
			<p className="truncate text-[6.5px] font-bold uppercase tracking-[0.1em] text-muted">
				{rotulo}
			</p>
			<p className="mt-0.5 text-[11px] font-extrabold leading-none text-ink tnum">
				{valor}
			</p>
			<p className="mt-0.5 text-[6.5px] font-bold text-check tnum">
				{delta}
			</p>
		</div>
	);
}

function DonutStatus() {
	// Truque do raio 15.9155: a circunferência vira ~100, então o dasharray
	// aceita a porcentagem direto, sem conta.
	let offset = 25; // começa no topo
	return (
		<svg
			viewBox="0 0 42 42"
			className="h-[52px] w-[52px] shrink-0"
			aria-hidden="true"
		>
			<circle
				cx="21"
				cy="21"
				r="15.9155"
				fill="none"
				stroke="#EEF3F9"
				strokeWidth="5"
			/>
			{STATUS.map((s) => {
				const dash = `${s.pct} ${100 - s.pct}`;
				const el = (
					<circle
						key={s.rotulo}
						cx="21"
						cy="21"
						r="15.9155"
						fill="none"
						stroke={s.cor}
						strokeWidth="5"
						strokeDasharray={dash}
						strokeDashoffset={offset}
						transform="rotate(-90 21 21)"
					/>
				);
				offset -= s.pct;
				return el;
			})}
			<text
				x="21"
				y="22.6"
				textAnchor="middle"
				className="fill-ink text-[7px] font-extrabold"
			>
				38
			</text>
		</svg>
	);
}

function PainelRow({
	nome,
	valor,
	status,
	tom,
}: {
	nome: string;
	valor: string;
	status: string;
	tom: "mint" | "brand" | "muted";
}) {
	const cores = {
		mint: "bg-mint/15 text-check",
		brand: "bg-tint text-brand",
		muted: "bg-paper text-muted",
	}[tom];
	return (
		<div className="flex items-center gap-1.5">
			<span className="min-w-0 flex-1 truncate text-[8px] font-semibold text-ink">
				{nome}
			</span>
			<span
				className={`shrink-0 rounded-full px-1.5 py-[2px] text-[6.5px] font-bold ${cores}`}
			>
				{status}
			</span>
			<span className="w-12 shrink-0 text-right text-[8px] font-bold text-ink tnum">
				{valor}
			</span>
		</div>
	);
}

/* ─────────────────────────────  MOLDURA DO CELULAR  ───────────────────────── */

function PhoneFrame() {
	return (
		<div className="relative">
			{/* botões laterais — realismo do frame */}
			<span className="absolute left-[-2px] top-[20%] h-7 w-[3px] rounded-l-sm bg-[#050c15]" />
			<span className="absolute left-[-2px] top-[31%] h-11 w-[3px] rounded-l-sm bg-[#050c15]" />
			<span className="absolute left-[-2px] top-[45%] h-11 w-[3px] rounded-l-sm bg-[#050c15]" />
			<span className="absolute right-[-2px] top-[30%] h-16 w-[3px] rounded-r-sm bg-[#050c15]" />

			{/* trilho metálico (borda com luz nas quinas) */}
			<div
				className="rounded-[2.65rem] p-[2px] shadow-[0_45px_90px_-24px_rgba(10,37,71,.62),0_10px_30px_-12px_rgba(10,37,71,.4)]"
				style={{
					background:
						"linear-gradient(145deg,#4a5a72 0%,#101f31 20%,#0a1626 50%,#101f31 80%,#54657e 100%)",
				}}
			>
				{/* bezel preto fino */}
				<div className="rounded-[2.5rem] bg-[#0a1626] p-[5px] ring-1 ring-white/5">
					{/* tela */}
					<div className="relative aspect-[9/19.5] overflow-hidden rounded-[2.15rem] bg-paper">
						<PhoneScreen />

						{/* dynamic island */}
						<div className="pointer-events-none absolute left-1/2 top-[10px] z-20 flex h-[22px] w-[74px] -translate-x-1/2 items-center justify-end rounded-full bg-black pr-2">
							<span className="h-2 w-2 rounded-full bg-[#0c1a2b] ring-1 ring-white/10">
								<span className="block h-1 w-1 translate-x-[3px] translate-y-[3px] rounded-full bg-cyan/40" />
							</span>
						</div>

						{/* brilho de vidro (glass) — estático */}
						<div
							className="pointer-events-none absolute inset-0 z-10 rounded-[2.15rem]"
							style={{
								background:
									"linear-gradient(130deg, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 32%, rgba(255,255,255,0) 100%)",
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

/* ─────────────────────────────  TELA DO APP OLLI  ─────────────────────────── */

function PhoneScreen() {
	return (
		<div className="flex h-full flex-col bg-paper">
			{/* Cabeçalho de marca (gradiente) + status bar */}
			<div className="brand-gradient px-4 pb-4 pt-2.5 text-white">
				<div className="flex items-center justify-between text-[11px] font-semibold">
					<span className="tnum tracking-tight">9:41</span>
					<div className="flex items-center gap-1.5 text-white">
						<SignalIcon />
						<WifiIcon />
						<BatteryIcon />
					</div>
				</div>

				<div className="mt-3.5 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<OlliMark />
						<div className="leading-none">
							<p className="text-[14px] font-extrabold tracking-tight">OLLI</p>
							<p className="mt-1 text-[9px] font-medium text-white/75">
								Meus orçamentos
							</p>
						</div>
					</div>
					<span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-[10px] font-bold ring-1 ring-white/25">
						IR
					</span>
				</div>
			</div>

			{/* Corpo */}
			<div className="flex flex-1 flex-col gap-2 px-3 pb-3 pt-2.5">
				{/* Card de orçamento premium */}
				<div className="rounded-2xl border border-line bg-white p-3.5 shadow-[0_12px_26px_-14px_rgba(10,37,71,.28)]">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0">
							<p className="text-[8px] font-bold uppercase tracking-[0.15em] text-muted">
								Orçamento Nº 0472
							</p>
							<p className="mt-1 truncate text-[13px] font-extrabold leading-tight text-ink">
								Clínica Vida &amp; Saúde
							</p>
						</div>
						<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mint/15 px-2 py-1 text-[9px] font-bold text-check">
							<CheckIcon />
							Aprovado
						</span>
					</div>

					<p className="mt-2.5 text-[26px] font-extrabold leading-none tracking-tight text-ink tnum">
						R$ 2.480<span className="text-muted">,00</span>
					</p>

					<div className="mt-3 space-y-2 border-t border-line pt-2.5">
						<ServiceRow nome="PMOC — 3 splits" preco="R$ 1.200" />
						<ServiceRow nome="Higienização completa" preco="R$ 880" />
						<ServiceRow nome="Troca de filtros" preco="R$ 400" />
					</div>

					<button
						type="button"
						tabIndex={-1}
						aria-hidden="true"
						className="brand-gradient mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold text-white shadow-[0_10px_20px_-8px_rgba(11,111,206,.65)]"
					>
						<WhatsAppGlyph />
						Enviar no WhatsApp
					</button>
				</div>

				{/* Nota da IA — o diferencial do produto */}
				<div className="flex items-start gap-1.5 rounded-xl bg-tint px-2.5 py-2 text-[9.5px] leading-snug text-brand-ink">
					<span className="mt-[1px] text-[10px]">✨</span>
					<span>
						<b className="text-brand">IA:</b> manutenção sugerida a cada 90 dias
						· confiança 94%
					</span>
				</div>

				{/* Recentes — cara de feed de app real */}
				<div className="rounded-xl border border-line bg-white p-2.5">
					<p className="mb-1.5 text-[8px] font-bold uppercase tracking-[0.15em] text-muted">
						Recentes
					</p>
					<RecentRow
						nome="Ar Frio Refrigeração"
						valor="R$ 640"
						status="Enviado"
					/>
				</div>

				<div className="flex-1" />

				{/* Barra de abas */}
				<div className="-mx-3 -mb-3 flex items-center justify-around border-t border-line bg-white/90 px-2 pb-2.5 pt-2 backdrop-blur">
					<TabIcon label="Início" active>
						<path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3v-4H7v4H4a1 1 0 0 1-1-1V9.5Z" />
					</TabIcon>
					<TabIcon label="Orçam.">
						<path d="M6 3h5l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M11 3v3h3 M7.5 10h5 M7.5 13h5" />
					</TabIcon>
					<TabIcon label="Agenda">
						<path d="M4 5h12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z M3 8.5h14 M7 3.5v3 M13 3.5v3" />
					</TabIcon>
					<TabIcon label="Perfil">
						<path d="M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M4.5 17c.6-3 2.9-4.5 5.5-4.5S15 14 15.6 17" />
					</TabIcon>
				</div>
			</div>
		</div>
	);
}

/* ─────────────────────────────  PEÇAS AUXILIARES  ─────────────────────────── */

function ServiceRow({ nome, preco }: { nome: string; preco: string }) {
	return (
		<div className="flex items-center justify-between">
			<span className="flex items-center gap-2 text-[11px] text-slate">
				<span className="h-1.5 w-1.5 rounded-full bg-cyan" />
				{nome}
			</span>
			<span className="text-[11px] font-bold text-ink tnum">{preco}</span>
		</div>
	);
}

function RecentRow({
	nome,
	valor,
	status,
	muted,
}: {
	nome: string;
	valor: string;
	status: string;
	muted?: boolean;
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-tint text-[11px]">
				🧾
			</span>
			<div className="min-w-0 flex-1">
				<p className="truncate text-[10.5px] font-semibold text-ink">{nome}</p>
				<p
					className={`text-[8.5px] font-medium ${muted ? "text-muted" : "text-brand"}`}
				>
					{status}
				</p>
			</div>
			<span className="text-[10.5px] font-bold text-ink tnum">{valor}</span>
		</div>
	);
}

function TabIcon({
	label,
	active,
	children,
}: {
	label: string;
	active?: boolean;
	children: ReactNode;
}) {
	return (
		<span
			className={`flex flex-col items-center gap-0.5 ${active ? "text-brand" : "text-muted"}`}
		>
			<svg
				viewBox="0 0 20 20"
				className="h-[18px] w-[18px]"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				{children}
			</svg>
			<span className="text-[7.5px] font-semibold">{label}</span>
		</span>
	);
}

/* ─────────────────────────────  ÍCONES  ───────────────────────────────────── */

function SignalIcon() {
	return (
		<svg
			viewBox="0 0 18 12"
			className="h-[9px] w-auto"
			fill="currentColor"
			aria-hidden="true"
		>
			<rect x="0" y="8" width="3" height="4" rx="1" />
			<rect x="5" y="5.5" width="3" height="6.5" rx="1" />
			<rect x="10" y="3" width="3" height="9" rx="1" />
			<rect x="15" y="0.5" width="3" height="11.5" rx="1" />
		</svg>
	);
}

function WifiIcon() {
	return (
		<svg
			viewBox="0 0 16 13"
			className="h-[9px] w-auto"
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M8 2.3c2.6 0 5 1 6.8 2.7L13.3 6.6A7.6 7.6 0 0 0 8 4.5 7.6 7.6 0 0 0 2.7 6.6L1.2 5A9.8 9.8 0 0 1 8 2.3Z" />
			<path d="M8 6.1c1.5 0 2.9.6 3.9 1.6l-1.6 1.6A3.3 3.3 0 0 0 8 8.3c-.9 0-1.7.3-2.3.9L4.1 7.7A5.5 5.5 0 0 1 8 6.1Z" />
			<circle cx="8" cy="10.7" r="1.4" />
		</svg>
	);
}

function BatteryIcon() {
	return (
		<svg viewBox="0 0 26 12" className="h-[9px] w-auto" aria-hidden="true">
			<rect
				x="0.5"
				y="0.5"
				width="22"
				height="11"
				rx="3"
				fill="none"
				stroke="currentColor"
				strokeOpacity="0.55"
			/>
			<rect x="2" y="2" width="17" height="8" rx="1.6" fill="currentColor" />
			<rect
				x="24"
				y="4"
				width="2"
				height="4"
				rx="1"
				fill="currentColor"
				fillOpacity="0.55"
			/>
		</svg>
	);
}

function CheckIcon() {
	return (
		<svg
			viewBox="0 0 12 12"
			className="h-2.5 w-2.5"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.4"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M2.5 6.2 5 8.6l4.5-5.2" />
		</svg>
	);
}

/**
 * Mascote OLLI (balão + olhos + check).
 * - `tone="branco"` (padrão): balão branco, traços azuis — para o cabeçalho com
 *   gradiente do app.
 * - `tone="marca"`: balão azul, traços brancos — para fundo claro (menu do painel),
 *   onde o balão branco simplesmente sumiria.
 */
function OlliMark({ tone = "branco" }: { tone?: "branco" | "marca" }) {
	const balao = tone === "marca" ? "#0B6FCE" : "#fff";
	const traco = tone === "marca" ? "#fff" : "#0B6FCE";
	return (
		<svg viewBox="0 0 64 64" className="h-[22px] w-[22px]" aria-hidden="true">
			<rect x="9" y="8" width="46" height="44" rx="14.5" fill={balao} />
			<path d="M22 49 L12 59.5 L30 50 Z" fill={balao} />
			<rect x="20" y="18.5" width="8.5" height="11" rx="4.2" fill={traco} />
			<rect x="35.5" y="18.5" width="8.5" height="11" rx="4.2" fill={traco} />
			<path
				d="M19 41 l6.6 6.9 l16 -15"
				fill="none"
				stroke={traco}
				strokeWidth="6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function WhatsAppGlyph() {
	return (
		<svg
			viewBox="0 0 24 24"
			className="h-[14px] w-[14px]"
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-2.8.9.9-2.7-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.1-.3.2-.5.1-.7-.3-1.5-.6-2.1-1.4-.5-.6.3-.6 1-1.9.1-.2 0-.4 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.7.7-1 1.7-.6 2.8.5 1.6 1.6 3.1 3.5 4 1.9.9 2.3.7 2.8.6.5 0 1.5-.6 1.7-1.1.2-.6.2-1 .1-1.1-.1-.1-.3-.2-.5-.3Z" />
		</svg>
	);
}
