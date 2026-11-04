import { PageSkeleton } from "@/ui/skeleton";

export function LineLoading() {
	return (
		// Fallback de Suspense de toda troca de tela. O esqueleto ocupa o lugar da
		// barra que deslizava; o texto só para leitor de tela continua anunciando
		// "Carregando…" sem roubar o foco.
		<div
			role="status"
			className="flex h-full min-h-screen w-full items-center justify-center px-6"
		>
			<PageSkeleton />
		</div>
	);
}
