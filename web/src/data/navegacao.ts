/** Páginas do site público. O header mostra as primeiras; o rodapé mostra todas. */
export const PAGINAS_HEADER = [
	{ href: "/produto/", rotulo: "Produto" },
	{ href: "/catalogo/", rotulo: "Catálogo" },
	{ href: "/para/", rotulo: "Ofícios" },
	{ href: "/planos/", rotulo: "Preços" },
	{ href: "/como-funciona/", rotulo: "Como funciona" },
	{ href: "/blog/", rotulo: "Blog" },
	{ href: "/contato/", rotulo: "Contato" },
] as const;

export const PAGINAS_EMPRESA = [
	{ href: "/sobre/", rotulo: "Sobre" },
	{ href: "/perguntas/", rotulo: "Perguntas" },
	{ href: "/ajuda/", rotulo: "Ajuda" },
	{ href: "/contato/", rotulo: "Contato" },
	{ href: "/blog/", rotulo: "Blog" },
] as const;

export function paginaAtual(pathname: string, href: string): boolean {
	if (href === "/para/") return pathname.startsWith("/para/");
	if (href === "/blog/") return pathname.startsWith("/blog/");
	return pathname === href;
}
