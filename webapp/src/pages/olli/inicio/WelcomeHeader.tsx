import { BookOpen, CalendarDays, Plus } from "lucide-react";
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
				<div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
					<CalendarDays className="size-5" strokeWidth={2} aria-hidden="true" />
				</div>
				<div className="min-w-0">
					{isLoading ? (
						<Skeleton className="h-8 w-56" />
					) : (
						<h1 className="truncate text-2xl font-bold tracking-tight text-text-primary">
							{saudacao()}
							{nome ? `, ${nome}` : ""}
						</h1>
					)}
					<p className="mt-0.5 text-sm text-text-secondary">{dataLonga()}</p>
				</div>
			</div>
			<div className="flex flex-wrap gap-2 self-start">
				<a
					href="https://olliorcamentos.online/ajuda/"
					target="_blank"
					rel="noreferrer"
					className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold text-text-primary shadow-sm transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
				>
					<BookOpen className="size-4" />
					Ajuda OLLI
				</a>
				<Link
					to="/orcamentos?novo=1"
					className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
				>
					<Plus className="size-4" strokeWidth={2} />
					Novo orçamento
				</Link>
			</div>
		</div>
	);
}
