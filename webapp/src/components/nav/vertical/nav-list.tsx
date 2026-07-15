import { useState } from "react";
import { useLocation } from "react-router";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import type { NavListProps } from "../types";
import { NavItem } from "./nav-item";

export function NavList({ data, depth = 1 }: NavListProps) {
	const location = useLocation();
	const isActive = location.pathname.includes(data.path);
	const [open, setOpen] = useState(isActive);
	const hasChild = data.children && data.children.length > 0;

	const handleClick = () => {
		if (hasChild) {
			setOpen(!open);
		}
	};

	if (data.hidden) {
		return null;
	}

	const item = (
		<NavItem
			// data
			title={data.title}
			path={data.path}
			icon={data.icon}
			info={data.info}
			caption={data.caption}
			auth={data.auth}
			// state
			open={open}
			active={isActive}
			disabled={data.disabled}
			// options
			hasChild={hasChild}
			depth={depth}
			// event
			onClick={handleClick}
		/>
	);

	return (
		<Collapsible open={open} onOpenChange={setOpen} data-nav-type="list">
			{/* Só existe trigger (<button>) quando há filhos a expandir. Item-folha
			    é um link direto (<a>) — já focável e navega com Enter; envolvê-lo
			    num <button> geraria <a> dentro de <button> (HTML inválido) e um
			    stop de teclado morto. */}
			{hasChild ? <CollapsibleTrigger className="w-full">{item}</CollapsibleTrigger> : item}
			{hasChild && (
				<CollapsibleContent>
					<div className="ml-4 mt-1 flex flex-col gap-1">
						{data.children?.map((child) => (
							<NavList key={child.title} data={child} depth={depth + 1} />
						))}
					</div>
				</CollapsibleContent>
			)}
		</Collapsible>
	);
}
