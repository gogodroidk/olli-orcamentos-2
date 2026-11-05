/**
 * /ajuda/llms.txt — a Central de Ajuda em markdown puro.
 *
 * Mesma regra do /llms.txt: nada escrito à mão. O texto sai de
 * `markdownAjudaLlms('web')`, que lê os artigos da Central e esconde o que
 * só existe no app das lojas (preço de tabela da web fica; texto da Google Play sai).
 */
import { markdownAjudaLlms } from "../../../../src/content/ajuda/index";

export function GET() {
	return new Response(markdownAjudaLlms("web"), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
