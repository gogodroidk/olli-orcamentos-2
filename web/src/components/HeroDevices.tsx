import {
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
} from "motion/react";
import type { MouseEvent } from "react";
import { useRef } from "react";

/**
 * Hero do OLLI com capturas reais do produto.
 *
 * A composição preserva o parallax discreto já existente, sem loop contínuo e
 * com `prefers-reduced-motion`. O conteúdo dos aparelhos vem de `public/telas`,
 * o mesmo conjunto validado e usado pela esteira de demonstração da landing.
 */
export default function HeroDevices() {
	const reduce = useReducedMotion();
	const ref = useRef<HTMLDivElement>(null);
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

	function onMove(event: MouseEvent<HTMLDivElement>) {
		if (reduce) return;
		const element = ref.current;
		if (!element) return;
		const bounds = element.getBoundingClientRect();
		px.set((event.clientX - bounds.left) / bounds.width - 0.5);
		py.set((event.clientY - bounds.top) / bounds.height - 0.5);
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
			className="relative mx-auto w-full max-w-xl"
			style={{ perspective: "1200px" }}
		>
			<div className="pointer-events-none absolute -inset-12 -z-10" aria-hidden="true">
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
				<motion.div
					className="relative z-10 ml-auto hidden w-[93%] sm:block"
					style={{ transformStyle: "preserve-3d", rotateY: -12 }}
				>
					<div className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_40px_80px_-20px_rgba(10,37,71,.35)] ring-1 ring-black/5">
						<div className="flex items-center gap-1.5 border-b border-line bg-paper px-3 py-2.5" aria-hidden="true">
							<span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
							<span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
							<span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
							<span className="ml-3 rounded-md bg-white px-3 py-1 text-[11px] text-muted tnum">
								app.olliorcamentos.online
							</span>
						</div>
						<picture>
							<source
								type="image/avif"
								srcSet="/telas/agenda-computador.avif 1440w, /telas/agenda-computador@2x.avif 2880w"
								sizes="(min-width: 1024px) 520px, 44vw"
							/>
							<img
								src="/telas/agenda-computador.webp"
								srcSet="/telas/agenda-computador.webp 1440w, /telas/agenda-computador@2x.webp 2880w"
								sizes="(min-width: 1024px) 520px, 44vw"
								width={1440}
								height={900}
								alt="Tela real do OLLI no computador mostrando a agenda semanal e os serviços organizados por dia."
								className="block aspect-[16/10] h-auto w-full object-cover"
								loading="eager"
								decoding="async"
							/>
						</picture>
					</div>
				</motion.div>

				<div className="relative z-30 mx-auto w-56 sm:absolute sm:-bottom-6 sm:left-[-2.25rem] sm:mx-0 sm:w-60 lg:-bottom-12 lg:w-[16.5rem]">
					<motion.div style={{ transformStyle: "preserve-3d", rotateY: 9 }}>
						<PhoneFrame />
					</motion.div>
				</div>
			</motion.div>
		</div>
	);
}

function PhoneFrame() {
	return (
		<div className="relative">
			<span className="absolute left-[-2px] top-[20%] h-7 w-[3px] rounded-l-sm bg-[#050c15]" aria-hidden="true" />
			<span className="absolute left-[-2px] top-[31%] h-11 w-[3px] rounded-l-sm bg-[#050c15]" aria-hidden="true" />
			<span className="absolute left-[-2px] top-[45%] h-11 w-[3px] rounded-l-sm bg-[#050c15]" aria-hidden="true" />
			<span className="absolute right-[-2px] top-[30%] h-16 w-[3px] rounded-r-sm bg-[#050c15]" aria-hidden="true" />

			<div
				className="rounded-[2.65rem] p-[2px] shadow-[0_45px_90px_-24px_rgba(10,37,71,.62),0_10px_30px_-12px_rgba(10,37,71,.4)]"
				style={{
					background:
						"linear-gradient(145deg,#4a5a72 0%,#101f31 20%,#0a1626 50%,#101f31 80%,#54657e 100%)",
				}}
			>
				<div className="rounded-[2.5rem] bg-[#0a1626] p-[5px] ring-1 ring-white/5">
					<div className="relative aspect-[393/852] overflow-hidden rounded-[2.15rem] bg-paper">
						<picture>
							<source
								type="image/avif"
								srcSet="/telas/novo-orcamento-itens.avif 393w, /telas/novo-orcamento-itens@2x.avif 786w"
								sizes="(min-width: 1024px) 264px, 224px"
							/>
							<img
								src="/telas/novo-orcamento-itens.webp"
								srcSet="/telas/novo-orcamento-itens.webp 393w, /telas/novo-orcamento-itens@2x.webp 786w"
								sizes="(min-width: 1024px) 264px, 224px"
								width={393}
								height={852}
								alt="Tela real do aplicativo OLLI montando um orçamento com serviços, quantidades e total calculado."
								className="block h-full w-full object-cover"
								loading="eager"
								decoding="async"
								fetchPriority="high"
							/>
						</picture>
						<div
							className="pointer-events-none absolute inset-0 rounded-[2.15rem]"
							style={{
								background:
									"linear-gradient(130deg, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 28%, rgba(255,255,255,0) 100%)",
							}}
							aria-hidden="true"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
