import { Plus, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { useMinhaEmpresa } from "@/olli/data";
import { Skeleton } from "@/ui/skeleton";
import { dataLonga, saudacao } from "./helpers";

/**
 * Cabeçalho de boas-vindas: "Olá, {empresa}" + saudação pelo horário e data por
 * extenso. Nome vem REAL de `useMinhaEmpresa`; no carregando mostra skeleton, no
 * erro/ausência só omite o nome (nunca inventa).
 *
 * À direita, o CTA "Novo orçamento" — SEMPRE visível, em qualquer estado da tela
 * (carregando, erro ou vazio). É a ação que gera receita: ela não pode depender de
 * uma consulta ter dado certo.
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
			<Link
				to="/orcamentos?novo=1"
				className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
			>
				<Plus className="size-4" strokeWidth={2.5} />
				Novo orçamento
			</Link>
		</div>
	);
}
