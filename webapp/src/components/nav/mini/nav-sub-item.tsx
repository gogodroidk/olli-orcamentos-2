import { ChevronRight, Info } from "lucide-react";
import Icon from "@/components/icon/icon";
import useLocale from "@/locales/use-locale";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/ui/tooltip";
import { cn } from "@/utils";
import { NavItemRenderer } from "../components";
import { navItemClasses, navItemStyles } from "../styles";
import type { NavItemProps } from "../types";

export const NavSubItem = (item: NavItemProps) => {
	const { t } = useLocale();

	const content = (
		<>
			{/* Icon */}
			<span style={navItemStyles.icon} className="mr-1 items-center justify-center">
				{item.icon && typeof item.icon === "string" ? <Icon icon={item.icon} /> : item.icon}
			</span>

			{/* Title */}
			<span style={navItemStyles.title} className="flex-auto">
				{t(item.title)}
			</span>

			{/* Caption */}
			{item.caption && (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger>
							<Info className="size-4" strokeWidth={2} aria-hidden="true" />
						</TooltipTrigger>
						<TooltipContent>
							<p>{t(item.caption)}</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			)}

			{/* Info */}
			{item.info && <span style={navItemStyles.info}>{item.info}</span>}

			{/* Arrow */}
			{item.hasChild && (
				<ChevronRight className="size-4" strokeWidth={2} style={navItemStyles.arrow} aria-hidden="true" />
			)}
		</>
	);

	const itemClassName = cn(
		navItemClasses.base,
		navItemClasses.hover,
		item.active && item.depth === 1 && navItemClasses.active,
		item.active && item.depth !== 1 && "bg-action-hover!",
		item.disabled && navItemClasses.disabled,
	);

	return (
		<NavItemRenderer item={item} className={itemClassName}>
			{content}
		</NavItemRenderer>
	);
};
