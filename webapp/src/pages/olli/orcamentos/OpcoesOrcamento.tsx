import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Separator } from "@/ui/separator";

interface Props {
	exemplo: boolean;
	historico: Pick<UseQueryResult<{ id: string }[] | null>, "status" | "fetchStatus" | "data">;
	desconto: ReactNode;
	totais: ReactNode;
	condicoes: ReactNode;
	aoAbrirMaisOpcoes: () => void;
}

export default function OpcoesOrcamento({ exemplo, historico, desconto, totais, condicoes, aoAbrirMaisOpcoes }: Props) {
	const recolher =
		exemplo && historico.status === "success" && historico.fetchStatus === "idle" && historico.data?.length === 0;

	if (!recolher) {
		return (
			<>
				<section className="grid gap-4 md:grid-cols-2">
					{desconto}
					{totais}
				</section>
				<Separator />
				{condicoes}
			</>
		);
	}

	return (
		<>
			{totais}
			<details
				className="rounded-lg border border-border"
				onToggle={(ev) => {
					if (ev.currentTarget.open) aoAbrirMaisOpcoes();
				}}
			>
				<summary className="min-h-[44px] cursor-pointer rounded-lg px-3 text-sm font-medium leading-[44px] text-text-primary focus-visible:outline-ring">
					Mais opções
				</summary>
				<div className="space-y-4 border-t border-border p-3">
					{desconto}
					<Separator />
					{condicoes}
				</div>
			</details>
		</>
	);
}
