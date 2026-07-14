import { Sparkles } from "lucide-react";
import { useMinhaEmpresa } from "@/olli/data";
import { Skeleton } from "@/ui/skeleton";
import { dataLonga, saudacao } from "./helpers";

/**
 * Cabeçalho de boas-vindas: "Olá, {empresa}" + saudação pelo horário e data por
 * extenso. Nome vem REAL de `useMinhaEmpresa`; no carregando mostra skeleton, no
 * erro/ausência só omite o nome (nunca inventa).
 */
export function WelcomeHeader() {
	const { data: empresa, isLoading } = useMinhaEmpresa();
	const nome = ((empresa?.nome as string | undefined) ?? "").trim();

	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-4">
				<div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-[#3FD8EA] text-white shadow-md shadow-primary/25">
					<Sparkles className="size-6" strokeWidth={2.2} />
				</div>
				<div className="min-w-0">
					{isLoading ? (
						<Skeleton className="h-8 w-56" />
					) : (
						<h1 className="truncate text-2xl font-bold tracking-tight text-text-primary">
							{saudacao()}
							{nome ? `, ${nome}` : ""} 👋
						</h1>
					)}
					<p className="mt-0.5 text-sm text-text-secondary">{dataLonga()}</p>
				</div>
			</div>
			<span className="hidden items-center gap-2 self-start rounded-full border border-border bg-bg-neutral/40 px-3.5 py-1.5 text-xs font-medium text-text-secondary sm:inline-flex">
				<span className="size-1.5 rounded-full bg-success" aria-hidden />
				Resumo do seu negócio
			</span>
		</div>
	);
}
