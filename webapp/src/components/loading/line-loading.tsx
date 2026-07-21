import "./line-loading.css";
import { useSettings } from "@/store/settingStore";
import { commonColors, paletteColors } from "@/theme/tokens/color";

export function LineLoading() {
	const { themeMode } = useSettings();

	return (
		// Este é o fallback de Suspense de TODA troca de tela do painel. Era uma barra
		// muda: quem usa leitor de tela clicava "Clientes" e não ouvia absolutamente
		// nada até a tela pronta — sem saber se o clique pegou. `role="status"` (que já
		// implica aria-live="polite") + um texto sr-only fazem o "Carregando…" ser
		// anunciado sem roubar o foco de onde o usuário está.
		<div
			role="status"
			className="flex h-full min-h-screen w-full flex-col items-center justify-center"
		>
			<span className="sr-only">Carregando…</span>
			<div
				className="relative h-1.5 w-96 overflow-hidden rounded"
				aria-hidden="true"
				style={{
					backgroundColor: paletteColors.gray["500"],
				}}
			>
				<div
					className="absolute left-0 top-0 h-full w-1/3 animate-loading"
					style={{
						backgroundColor: themeMode === "light" ? commonColors.black : commonColors.white,
					}}
				/>
			</div>
		</div>
	);
}
