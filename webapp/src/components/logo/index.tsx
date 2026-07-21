import { cn } from "@/utils";
import { NavLink } from "react-router";
import { Icon } from "../icon";

interface Props {
	size?: number | string;
	className?: string;
}
function Logo({ size = 50, className }: Props) {
	return (
		// `aria-label` porque o único conteúdo deste link é um <svg aria-hidden>: medido
		// no painel carregado, ele era a PRIMEIRA parada de Tab da tela inteira e o
		// leitor de tela anunciava só "link", sem nome nenhum. No layout vertical o
		// nome "OLLI" ao lado é um <span> IRMÃO, fora da âncora — não conta como nome.
		<NavLink to="/" aria-label="OLLI — ir para o início" className={cn(className)}>
			<Icon icon="local:ic-logo-badge" size={size} color="var(--colors-palette-primary-default)" />
		</NavLink>
	);
}

export default Logo;
