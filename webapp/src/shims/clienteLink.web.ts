/**
 * Stub WEB de src/services/clienteLink.ts — usado só no build do painel.
 *
 * pdfGenerator.ts faz `await import('../services/clienteLink')` dentro de
 * `obterLinkPublico` (chamado só por montarHtmlOrcamentoCompleto, que o painel NÃO
 * usa). Mesmo sendo dinâmico, o Rollup empacota o alvo — e clienteLink puxa
 * services → supabase → @react-native-async-storage/async-storage → react-native-uuid,
 * uma subárvore nativa inteira. O painel gera o PDF por gerarHtmlOrcamento (sem link)
 * e o cliente recebe pelo portal /o/<token> do worker, então este caminho é morto aqui.
 *
 * Exporta só o que o import dinâmico desestrutura ({ gerarLinkOrcamento, linkConfigurado }).
 * Nunca é executado; se for, falha explícito em vez de calado.
 */
export function linkConfigurado(): boolean {
	return false;
}

export async function gerarLinkOrcamento(): Promise<string> {
	throw new Error("Link do cliente indisponível no painel — o cliente recebe pelo portal /o/<token>.");
}
