import { cn } from "@/utils";
import type { NavProps } from "../types";
import { NavGroup } from "./nav-group";

export function NavVertical({ data, className, ...props }: NavProps) {
	return (
		// <div>, não <nav>: este componente é sempre montado DENTRO de um <nav> (o do
		// layout vertical, o do horizontal, o da gaveta do celular). Sendo <nav> ele
		// criava um segundo marco de navegação aninhado e SEM NOME — a lista de marcos
		// do leitor de tela mostrava "navegação, navegação" e nenhuma das duas dizia
		// qual era. O nome agora mora uma vez só, no <nav> do layout.
		<div className={cn("flex w-full flex-col gap-1", className)} {...props}>
			{data.map((group, index) => (
				<NavGroup key={group.name || index} name={group.name} items={group.items} />
			))}
		</div>
	);
}
