import { AlertTriangle, RefreshCw, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";

/**
 * Estados compartilhados das duas abas do Diagnóstico. A regra é rígida: ERRO e
 * VAZIO são coisas DIFERENTES e nunca se confundem — um erro de rede jamais
 * aparece como "nada encontrado" (o clássico bug da casa). Erro sempre traz
 * "Tentar de novo".
 */

/** ERRO real (rede/servidor). Sempre com ação de recuperação. */
export function EstadoErro({
	titulo = "Não consegui carregar agora",
	mensagem = "Pode ter sido a conexão. Tente de novo.",
	rotuloAcao = "Tentar de novo",
	aoTentar,
}: {
	titulo?: string;
	mensagem?: string;
	rotuloAcao?: string;
	aoTentar: () => void;
}) {
	return (
		<Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
			<div className="grid size-12 place-items-center rounded-2xl bg-error/15 text-error-dark dark:text-error">
				<AlertTriangle className="size-6" />
			</div>
			<div className="space-y-1">
				<p className="font-semibold text-text-primary">{titulo}</p>
				<p className="mx-auto max-w-md text-sm text-text-secondary">{mensagem}</p>
			</div>
			<Button variant="outline" onClick={aoTentar} className="gap-2">
				<RefreshCw className="size-4" />
				{rotuloAcao}
			</Button>
		</Card>
	);
}

/** VAZIO honesto: a busca funcionou, só não achou nada. */
export function EstadoVazio({
	titulo = "Nenhum resultado",
	mensagem,
	acao,
}: {
	titulo?: string;
	mensagem?: string;
	acao?: ReactNode;
}) {
	return (
		<Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
			<div className="grid size-12 place-items-center rounded-2xl bg-muted text-text-secondary">
				<SearchX className="size-6" />
			</div>
			<div className="space-y-1">
				<p className="font-semibold text-text-primary">{titulo}</p>
				{mensagem && <p className="mx-auto max-w-md text-sm text-text-secondary">{mensagem}</p>}
			</div>
			{acao}
		</Card>
	);
}

/** Esqueleto de carregamento de uma lista de cartões. */
export function EsqueletoLista({ linhas = 4 }: { linhas?: number }) {
	return (
		<div className="space-y-3" aria-hidden>
			{Array.from({ length: linhas }).map((_, i) => (
				<Card key={i} className="space-y-3 p-4">
					<div className="flex items-center gap-2">
						<Skeleton className="h-5 w-16" />
						<Skeleton className="h-5 w-20" />
						<Skeleton className="ml-auto h-5 w-14" />
					</div>
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-2/3" />
				</Card>
			))}
		</div>
	);
}
