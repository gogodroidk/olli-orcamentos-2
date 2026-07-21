import { cn } from "@/utils";
import type { NavProps } from "../types";
import { NavGroup } from "./nav-group";

export const NavMini = ({ data, className, ...props }: NavProps) => {
	return (
		// <div> pelo mesmo motivo do NavVertical: já vive dentro do <nav> do layout.
		<div className={cn("flex flex-col", className)} {...props}>
			<ul className="flex flex-col gap-1">
				{data.map((item, index) => (
					<NavGroup key={item.name || index} items={item.items} />
				))}
			</ul>
		</div>
	);
};
