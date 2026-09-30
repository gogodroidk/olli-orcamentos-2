/** Manifesto público e mínimo para agentes que querem descobrir a OLLI.
 * Não expõe segredos, dados de clientes nem ferramentas de escrita.
 * Alterações financeiras ou de dados exigem API autenticada, escopo de tenant,
 * prévia e confirmação explícita no produto.
 */
export function GET() {
	return new Response(JSON.stringify({
		name: "OLLI Orçamentos",
		version: "2026-09-16",
	description: "Plataforma brasileira para precificação, orçamentos, documentos, ordens de serviço e recebimentos de prestadores.",
		language: "pt-BR",
		publicDocumentation: "https://olliorcamentos.online/llms.txt",
		helpCenter: "https://olliorcamentos.online/ajuda/",
		webApp: "https://app.olliorcamentos.online/",
		capabilities: ["precificacao_explicavel", "orcamentos", "clientes", "catalogo", "documentos_versionados", "ordens_de_servico", "agenda", "financeiro_operacional", "assistente_ia"],
		agentPolicy: {
			defaultMode: "read_only",
			mutations: "preview_and_explicit_confirmation",
			scope: "authenticated_tenant_only",
			audit: true,
			rollback: "when_supported",
			forbiddenWithoutConfirmation: ["cobrar", "cancelar_assinatura", "enviar_documento", "apagar_dados", "alterar_preco_final"],
		},
		contact: "https://olliorcamentos.online/ajuda/",
	}), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
