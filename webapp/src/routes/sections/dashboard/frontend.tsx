import type { RouteObject } from "react-router";
import { Component } from "./utils";

/**
 * Rotas do painel OLLI.
 *
 * Até 14/07/2026 quase tudo apontava para `/pages/olli/list` — uma tabela genérica
 * SÓ DE LEITURA. Era por isso que "não dava para adicionar nada": não existia tela
 * de criação. Agora cada domínio tem sua própria página, com CRUD.
 *
 * `/pages/olli/list` e `/pages/olli/placeholder` saíram em 30/09/2026: nenhuma rota
 * apontava mais para eles, mas o `import.meta.glob` de utils.tsx ainda os emitia
 * como arquivo do build. Toda página em `src/pages` vira chunk — apague a que morrer.
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
		{ path: "precificacao", element: Component("/pages/olli/precificacao") },
		{ path: "recibos", element: Component("/pages/olli/recibos") },
		{ path: "documentos", element: Component("/pages/olli/documentos") },
		{ path: "dados", element: Component("/pages/olli/dados") },

		// ─── Operação ───────────────────────────────────────────
		{ path: "ordens-servico", element: Component("/pages/olli/ordens-servico") },
		{ path: "agenda", element: Component("/pages/olli/agenda") },
		{ path: "contratos", element: Component("/pages/olli/contratos") },
		{ path: "equipamentos", element: Component("/pages/olli/equipamentos") },

		{ path: "equipe", element: Component("/pages/olli/equipe") },

		// ─── Ferramentas ────────────────────────────────────────
		{ path: "ferramentas", element: Component("/pages/olli/ferramentas") },
		{ path: "diagnostico", element: Component("/pages/olli/diagnostico") },
		{ path: "assistente", element: Component("/pages/olli/assistente") },
		{ path: "ajuda", element: Component("/pages/olli/ajuda") },

		// ─── Conta ──────────────────────────────────────────────
		{ path: "meu-negocio", element: Component("/pages/olli/meu-negocio") },
		{ path: "planos", element: Component("/pages/olli/planos") },
		{ path: "configuracoes", element: Component("/pages/olli/configuracoes") },
	];
	return frontendDashboardRoutes;
}
