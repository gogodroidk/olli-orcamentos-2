export const navItemClasses = {
	base: "inline-flex w-full items-center align-middle rounded-md px-2 py-1.5 text-sm transition-all duration-300 ease-in-out text-text-secondary! cursor-pointer",
	hover: "hover:bg-action-hover!",
	// O item ATIVO usava o azul "default" da marca nos DOIS temas: #0B6FCE dá
	// 3,80:1 sobre o navy do escuro e 4,49:1 sobre o realce quase branco do claro —
	// justo o item que diz "você está aqui" era o menos legível do menu.
	// Agora cada tema pega o degrau certo da MESMA rampa de marca (o white-label
	// sobrescreve `-dark` e `-light` junto com o `default`, ver olli/branding.ts):
	// 6,54:1 no claro e 6,93:1 no escuro. É o mesmo padrão que o Badge deste
	// projeto já usa (`text-primary-dark` + `dark:text-primary-light`).
	active: "bg-primary/hover! hover:bg-primary/focus! text-primary-dark! dark:text-primary-light!",
	disabled: "cursor-not-allowed hover:bg-transparent text-action-disabled!",
};
