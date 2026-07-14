import type { RouteObject } from "react-router";
import { Navigate } from "react-router";
import { Component } from "./utils";

export function getFrontendDashboardRoutes(): RouteObject[] {
	const frontendDashboardRoutes: RouteObject[] = [
		// ─── OLLI (menu real) ───────────────────────────────────
		{ path: "inicio", element: Component("/pages/olli/inicio") },
		{ path: "quadro", element: Component("/pages/olli/quadro") },
		{ path: "orcamentos", element: Component("/pages/olli/list", { table: "orcamentos", title: "Orçamentos", subtitle: "Seus orçamentos" }) },
		{ path: "clientes", element: Component("/pages/olli/list", { table: "clientes", title: "Clientes", subtitle: "Sua carteira de clientes" }) },
		{ path: "produtos", element: Component("/pages/olli/list", { table: "produtos", title: "Produtos", subtitle: "Catálogo de produtos" }) },
		{ path: "servicos", element: Component("/pages/olli/list", { table: "servicos", title: "Serviços", subtitle: "Catálogo de serviços" }) },
		{ path: "recibos", element: Component("/pages/olli/list", { table: "recibos", title: "Recibos", subtitle: "Recibos emitidos" }) },
		{ path: "ordens-servico", element: Component("/pages/olli/list", { table: "ordens_servico", title: "Ordens de serviço", subtitle: "OS em andamento e concluídas" }) },
		{ path: "agenda", element: Component("/pages/olli/list", { table: "agendamentos", title: "Agenda", subtitle: "Seus agendamentos" }) },
		{ path: "equipe", element: Component("/pages/olli/list", { table: "organizacao_membros", title: "Equipe", subtitle: "Membros da sua organização" }) },
		{ path: "equipamentos", element: Component("/pages/olli/list", { table: "assets", title: "Equipamentos", subtitle: "Inventário de equipamentos" }) },
		{ path: "ferramentas", element: Component("/pages/olli/placeholder", { title: "Ferramentas de ofício", hint: "Calculadoras, códigos de erro e PMOC — chegando aqui." }) },
		{ path: "diagnostico", element: Component("/pages/olli/placeholder", { title: "Diagnóstico IA", hint: "A IA de diagnóstico de climatização vai morar aqui." }) },
		{ path: "planos", element: Component("/pages/olli/placeholder", { title: "Planos", hint: "Assinatura e créditos (Mercado Pago) chegando aqui." }) },
		{ path: "meu-negocio", element: Component("/pages/olli/placeholder", { title: "Meu negócio", hint: "Dados da empresa, logo e marca." }) },
		// ─── template Slash (mantido fora do menu, referência) ──
		{ path: "workbench", element: Component("/pages/dashboard/workbench") },
		{ path: "analysis", element: Component("/pages/dashboard/analysis") },
		{
			path: "components",
			children: [
				{ index: true, element: <Navigate to="animate" replace /> },
				{ path: "animate", element: Component("/pages/components/animate") },
				{ path: "scroll", element: Component("/pages/components/scroll") },
				{ path: "multi-language", element: Component("/pages/components/multi-language") },
				{ path: "icon", element: Component("/pages/components/icon") },
				{ path: "upload", element: Component("/pages/components/upload") },
				{ path: "chart", element: Component("/pages/components/chart") },
				{ path: "toast", element: Component("/pages/components/toast") },
			],
		},
		{
			path: "functions",
			children: [
				{ index: true, element: <Navigate to="clipboard" replace /> },
				{ path: "clipboard", element: Component("/pages/functions/clipboard") },
				{ path: "token_expired", element: Component("/pages/functions/token-expired") },
			],
		},
		{
			path: "management",
			children: [
				{ index: true, element: <Navigate to="user" replace /> },
				{
					path: "user",
					children: [
						{ index: true, element: <Navigate to="profile" replace /> },
						{ path: "profile", element: Component("/pages/management/user/profile") },
						{ path: "account", element: Component("/pages/management/user/account") },
					],
				},
				{
					path: "system",
					children: [
						{ index: true, element: <Navigate to="permission" replace /> },
						{ path: "permission", element: Component("/pages/management/system/permission") },
						{ path: "role", element: Component("/pages/management/system/role") },
						{ path: "user", element: Component("/pages/management/system/user") },
						{ path: "user/:id", element: Component("/pages/management/system/user/detail") },
					],
				},
			],
		},
		{
			path: "error",
			children: [
				{ index: true, element: <Navigate to="403" replace /> },
				{ path: "403", element: Component("/pages/sys/error/Page403") },
				{ path: "404", element: Component("/pages/sys/error/Page404") },
				{ path: "500", element: Component("/pages/sys/error/Page500") },
			],
		},
		{
			path: "menu_level",
			children: [
				{ index: true, element: <Navigate to="1a" replace /> },
				{ path: "1a", element: Component("/pages/menu-level/menu-level-1a") },
				{
					path: "1b",
					children: [
						{ index: true, element: <Navigate to="2a" replace /> },
						{ path: "2a", element: Component("/pages/menu-level/menu-level-1b/menu-level-2a") },
						{
							path: "2b",
							children: [
								{ index: true, element: <Navigate to="3a" replace /> },
								{ path: "3a", element: Component("/pages/menu-level/menu-level-1b/menu-level-2b/menu-level-3a") },
								{ path: "3b", element: Component("/pages/menu-level/menu-level-1b/menu-level-2b/menu-level-3b") },
							],
						},
					],
				},
			],
		},
		{
			path: "link",
			children: [
				{ index: true, element: <Navigate to="iframe" replace /> },
				{ path: "iframe", element: Component("/pages/sys/others/link/iframe", { src: "https://ant.design/index-cn" }) },
				{
					path: "external-link",
					element: Component("/pages/sys/others/link/external-link", { src: "https://ant.design/index-cn" }),
				},
			],
		},
		{
			path: "permission",
			children: [
				{ index: true, element: Component("/pages/sys/others/permission") },
				{ path: "page-test", element: Component("/pages/sys/others/permission/page-test") },
			],
		},
		{ path: "calendar", element: Component("/pages/sys/others/calendar") },
		{ path: "kanban", element: Component("/pages/sys/others/kanban") },
		{ path: "blank", element: Component("/pages/sys/others/blank") },
	];
	return frontendDashboardRoutes;
}
