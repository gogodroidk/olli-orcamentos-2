import type { RouteObject } from "react-router";
import { Component } from "./utils";

/**
 * Rotas do painel OLLI.
 *
 * Até 14/07/2026 quase tudo apontava para `/pages/olli/list` — uma tabela genérica
 * SÓ DE LEITURA. Era por isso que "não dava para adicionar nada": não existia tela
 * de criação. Agora cada domínio tem sua própria página, com CRUD.
 *
 * `/pages/olli/list` continua existindo para o que ainda é só consulta (Equipe).
 */
export function getFrontendDashboardRoutes(): RouteObject[] {
	const frontendDashboardRoutes: RouteObject[] = [
		// ─── Painel ─────────────────────────────────────────────
		{ path: "inicio", element: Component("/pages/olli/inicio") },
		{ path: "quadro", element: Component("/pages/olli/quadro") },

		// ─── Comercial ──────────────────────────────────────────
		{ path: "orcamentos", element: Component("/pages/olli/orcamentos") },
		{ path: "clientes", element: Component("/pages/olli/clientes") },
		{ path: "produtos", element: Component("/pages/olli/catalogo/produtos") },
		{ path: "servicos", element: Component("/pages/olli/catalogo/servicos") },
		{ path: "recibos", element: Component("/pages/olli/recibos") },

		// ─── Operação ───────────────────────────────────────────
		{ path: "ordens-servico", element: Component("/pages/olli/ordens-servico") },
		{ path: "agenda", element: Component("/pages/olli/agenda") },
		{ path: "equipamentos", element: Component("/pages/olli/equipamentos") },

		// Equipe segue somente-leitura: convidar/mudar papel é outro fluxo, com
		// regras de permissão próprias — não é um CRUD de tabela.
		{
			path: "equipe",
			element: Component("/pages/olli/list", {
				table: "organizacao_membros",
				title: "Equipe",
				subtitle: "Membros da sua organização",
			}),
		},

		// ─── Conta ──────────────────────────────────────────────
		{ path: "meu-negocio", element: Component("/pages/olli/meu-negocio") },
		{ path: "planos", element: Component("/pages/olli/planos") },

		// ─── Ainda não portadas do app ──────────────────────────
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
	];
	return frontendDashboardRoutes;
}
