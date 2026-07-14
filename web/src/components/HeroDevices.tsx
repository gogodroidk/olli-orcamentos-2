import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";

/**
 * Hero 3D do OLLI — mostra o produto DE VERDADE: a página web (browser com o
 * print real do painel) e o app (celular com um orçamento). Os dois "sobem
 * girando" na entrada, flutuam de leve e reagem ao mouse (parallax 3D).
 * Tudo em CSS 3D + Motion (transform-only = leve). Respeita prefers-reduced-motion.
 */
export default function HeroDevices() {
	const reduce = useReducedMotion();
	const ref = useRef<HTMLDivElement>(null);
	const [tilt, setTilt] = useState({ x: 0, y: 0 });

	function onMove(e: React.MouseEvent<HTMLDivElement>) {
		if (reduce) return;
		const el = ref.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		const px = (e.clientX - r.left) / r.width - 0.5;
		const py = (e.clientY - r.top) / r.height - 0.5;
		setTilt({ x: py * -6, y: px * 10 });
	}

	const floatBrowser = reduce ? {} : { y: [0, -12, 0] };
	const floatPhone = reduce ? {} : { y: [0, -16, 0] };

	return (
		<div
			ref={ref}
			onMouseMove={onMove}
			onMouseLeave={() => setTilt({ x: 0, y: 0 })}
			className="relative mx-auto w-full max-w-xl"
			style={{ perspective: "1200px" }}
		>
			{/* brilhos de marca ao fundo */}
			<div className="pointer-events-none absolute -inset-12 -z-10">
				<div
					className="absolute right-0 top-4 h-72 w-72 rounded-full blur-3xl"
					style={{ background: "radial-gradient(closest-side, rgba(63,216,234,.55), transparent)" }}
				/>
				<div
					className="absolute -left-4 bottom-0 h-72 w-72 rounded-full blur-3xl"
					style={{ background: "radial-gradient(closest-side, rgba(11,111,206,.5), transparent)" }}
				/>
			</div>

			<motion.div
				className="relative"
				style={{ transformStyle: "preserve-3d" }}
				animate={{ rotateX: tilt.x, rotateY: tilt.y }}
				transition={{ type: "spring", stiffness: 120, damping: 18 }}
			>
				{/* BROWSER — a página web (print real do painel) */}
				<motion.div
					className="relative z-10"
					style={{ transformStyle: "preserve-3d" }}
					initial={reduce ? false : { opacity: 0, y: 48, rotateY: 20 }}
					animate={{ opacity: 1, y: 0, rotateY: -12 }}
					transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
				>
					<motion.div
						animate={floatBrowser}
						transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
						className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_40px_80px_-20px_rgba(10,37,71,.35)] ring-1 ring-black/5"
					>
						<div className="flex items-center gap-1.5 border-b border-line bg-paper px-3 py-2.5">
							<span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
							<span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
							<span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
							<span className="ml-3 rounded-md bg-white px-3 py-1 text-[11px] text-muted tnum">app.olliorcamentos.online</span>
						</div>
						<img src="/olli-painel.png" alt="Painel do OLLI no navegador" className="block w-full" width={1440} height={900} />
					</motion.div>
				</motion.div>

				{/* PHONE — o app no celular (mini orçamento) */}
				<motion.div
					className="absolute -bottom-10 -left-4 z-20 w-40 sm:w-48"
					style={{ transformStyle: "preserve-3d" }}
					initial={reduce ? false : { opacity: 0, y: 64, rotateY: -22 }}
					animate={{ opacity: 1, y: 0, rotateY: 10 }}
					transition={{ duration: 0.95, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
				>
					<motion.div
						animate={floatPhone}
						transition={{ duration: 7, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: 0.4 }}
						className="rounded-[2rem] border-[5px] border-[#0a1626] bg-[#0a1626] p-1 shadow-[0_30px_60px_-15px_rgba(10,37,71,.5)]"
					>
						<div className="overflow-hidden rounded-[1.5rem] bg-white">
							<div className="brand-gradient px-3 pb-5 pt-3 text-white">
								<div className="text-[10px] font-bold tracking-wide opacity-90">OLLI</div>
								<p className="mt-2 text-[10px] opacity-90 tnum">Orçamento Nº 0472</p>
								<p className="text-lg font-extrabold tnum">R$ 840,00</p>
								<span className="mt-1 inline-block rounded-full bg-white/25 px-2 py-0.5 text-[9px] font-semibold">Aprovado ✓</span>
							</div>
							<div className="space-y-1.5 p-2.5">
								<div className="flex justify-between text-[9px]">
									<span className="text-muted">Diagnóstico e reparo</span>
									<span className="tnum font-semibold">R$ 480</span>
								</div>
								<div className="flex justify-between text-[9px]">
									<span className="text-muted">Higienização (2×)</span>
									<span className="tnum font-semibold">R$ 360</span>
								</div>
								<div className="rounded-lg bg-tint p-1.5 text-[8px] leading-snug text-brand-ink">
									<b>IA:</b> provável capacitor do compressor — 45/5&nbsp;µF · 82%
								</div>
								<div className="brand-gradient rounded-lg py-1.5 text-center text-[9px] font-semibold text-white">
									Enviar no WhatsApp
								</div>
							</div>
						</div>
					</motion.div>
				</motion.div>
			</motion.div>
		</div>
	);
}
