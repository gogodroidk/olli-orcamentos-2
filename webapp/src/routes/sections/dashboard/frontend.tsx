import type { RouteObject } from "react-router";
import { Component } from "./utils";

export function getFrontendDashboardRoutes(): RouteObject[] {
	const frontendDashboardRoutes: RouteObject[] = [
		// ─── OLLI (menu real) ───────────────────────────────────
		{ path: "inicio", element: Component("/pages/olli/inicio") },
		{ path: "quadro", element: Component("/pages/olli/quadro") },
		{
			path: "orcamentos",
			element: Component("/pages/olli/list", { table: "orcamentos", title: "Orçamentos", subtitle: "Seus orçamentos" }),
		},
		{
			path: "clientes",
			element: Component("/pages/olli/list", {
				table: "clientes",
				title: "Clientes",
				subtitle: "Sua carteira de clientes",
			}),
		},
		{
			path: "produtos",
			element: Component("/pages/olli/list", {
				table: "produtos",
				title: "Produtos",
				subtitle: "Catálogo de produtos",
			}),
		},
		{
			path: "servicos",
			element: Component("/pages/olli/list", {
				table: "servicos",
				title: "Serviços",
				subtitle: "Catálogo de serviços",
			}),
		},
		{
			path: "recibos",
			element: Component("/pages/olli/list", { table: "recibos", title: "Recibos", subtitle: "Recibos emitidos" }),
		},
		{
			path: "ordens-servico",
			element: Component("/pages/olli/list", {
				table: "ordens_servico",
				title: "Ordens de serviço",
				subtitle: "OS em andamento e concluídas",
			}),
		},
		{
			path: "agenda",
			element: Component("/pages/olli/list", { table: "agendamentos", title: "Agenda", subtitle: "Seus agendamentos" }),
		},
		{
			path: "equipe",
			element: Component("/pages/olli/list", {
				table: "organizacao_membros",
				title: "Equipe",
				subtitle: "Membros da sua organização",
			}),
		},
		{
			path: "equipamentos",
			element: Component("/pages/olli/list", {
				table: "assets",
				title: "Equipamentos",
				subtitle: "Inventário de equipamentos",
			}),
		},
		{
			path: "ferramentas",
			element: Component("/pages/olli/placeholder", {
				title: "Ferramentas de ofício",
				hint: "Calculadoras, códigos de erro e PMOC — chegando aqui.",
			}),
		},
		{
			path: "diagnostico",
			element: Component("/pages/olli/placeholder", {
				title: "Diagnóstico IA",
				hint: "A IA de diagnóstico de climatização vai morar aqui.",
			}),
		},
		{
			path: "planos",
			element: Component("/pages/olli/placeholder", {
				title: "Planos",
				hint: "Assinatura e créditos (Mercado Pago) chegando aqui.",
			}),
		},
		{
			path: "meu-negocio",
			element: Component("/pages/olli/placeholder", { title: "Meu negócio", hint: "Dados da empresa, logo e marca." }),
		},
	];
	return frontendDashboardRoutes;
}
