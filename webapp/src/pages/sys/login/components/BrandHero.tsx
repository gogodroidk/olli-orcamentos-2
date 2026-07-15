/**
 * BrandHero — painel direito da tela de login.
 * Hero de marca OLLI, 100% Tailwind + SVG inline (sem imagem externa).
 * Fundo em gradiente navy -> azul com brilho ciano, mascote OLLI, wordmark,
 * tagline e 3 provas curtas com check menta.
 */
function OlliMascot({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true" role="img">
			<defs>
				<linearGradient id="olliHeroBadgeGrad" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#3FD8EA" />
					<stop offset="1" stopColor="#0B6FCE" />
				</linearGradient>
			</defs>
			<rect x="2" y="2" width="60" height="60" rx="16" fill="#0A2547" />
			<path d="M22 49 L12 59.5 L30 50 Z" fill="url(#olliHeroBadgeGrad)" />
			<rect x="9" y="8" width="46" height="44" rx="14.5" fill="url(#olliHeroBadgeGrad)" />
			<rect x="13" y="11.5" width="38" height="15" rx="9" fill="#ffffff" fillOpacity="0.1" />
			<rect x="20" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5" />
			<rect x="35.5" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5" />
			<path
				d="M19 41 l6.6 6.9 l16 -15"
				fill="none"
				stroke="#EAFEFF"
				strokeWidth="6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

const BULLETS = ["Orçamento em minutos", "IA que entende o defeito do equipamento", "No celular e no computador"];

function BrandHero() {
	return (
		<div className="relative hidden overflow-hidden lg:block">
			{/* base: gradiente navy -> azul de marca */}
			<div className="absolute inset-0 bg-gradient-to-br from-[#0A2547] via-[#0A2547] to-[#0B6FCE]" />
			{/* brilho ciano sutil */}
			<div className="pointer-events-none absolute -left-24 top-1/4 h-96 w-96 rounded-full bg-[#3FD8EA] opacity-20 blur-[120px]" />
			<div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-[#0B6FCE] opacity-30 blur-[110px]" />
			{/* leve textura de grade */}
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.06]"
				style={{
					backgroundImage:
						"linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
					backgroundSize: "44px 44px",
				}}
			/>

			<div className="relative z-10 flex h-full flex-col items-center justify-center px-10 py-14 text-center xl:px-16">
				<div className="flex flex-col items-center gap-6">
					<OlliMascot className="h-24 w-24 drop-shadow-[0_12px_40px_rgba(63,216,234,0.35)] xl:h-28 xl:w-28" />
					<div className="flex flex-col items-center gap-3">
						<span className="bg-gradient-to-r from-[#3FD8EA] to-[#8FE9F5] bg-clip-text text-5xl font-black tracking-tight text-transparent xl:text-6xl">
							OLLI
						</span>
						<p className="max-w-sm text-balance text-lg font-medium text-white/85 xl:text-xl">
							Do orçamento ao recibo, sem planilha.
						</p>
					</div>
				</div>

				<ul className="mt-12 flex flex-col gap-4 text-left">
					{BULLETS.map((text) => (
						<li key={text} className="flex items-center gap-3">
							<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2BE39A]/15 ring-1 ring-[#2BE39A]/40">
								<svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
									<path
										d="M4 10.5 l3.5 3.5 l8 -8.5"
										stroke="#2BE39A"
										strokeWidth="2.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							</span>
							<span className="text-base text-white/90 xl:text-lg">{text}</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

export default BrandHero;
