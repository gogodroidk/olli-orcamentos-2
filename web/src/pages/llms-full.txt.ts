/**
 * /llms-full.txt — o texto INTEIRO dos guias do blog, em markdown puro.
 *
 * `/llms.txt` é o índice (o que a OLLI é, quanto custa, para quem, e a lista de
 * guias). Este arquivo é o corpo: uma IA que quer responder "como cobrar limpeza de
 * ar-condicionado?" lê o guia aqui, sem atravessar markup de página.
 *
 * Mesma regra da casa do llms.txt: nada escrito à mão aqui. O conteúdo é o corpo
 * dos próprios posts (`postsPublicados()`, que já exclui `rascunho`), na ordem do
 * blog. Post novo entra sozinho; rascunho nunca vaza. O que a OLLI NÃO faz continua
 * dito no llms.txt, e o link volta para lá.
 */
import { postsPublicados } from "./blog/_dados";

const ORIGEM = "https://olliorcamentos.online";

export async function GET() {
	const posts = await postsPublicados();

	const guias = posts
		.map((p) => {
			const data = (p.data.atualizadoEm ?? p.data.publicadoEm).toISOString().slice(0, 10);
			return [
				`# ${p.data.titulo}`,
				"",
				`URL: ${ORIGEM}/blog/${p.id}/`,
				`Atualizado em: ${data}`,
				"",
				(p.body ?? "").trim(),
			].join("\n");
		})
		.join("\n\n---\n\n");

	const corpo = [
		"# OLLI — guias completos",
		"",
		"> Guias práticos para prestadores de serviço no Brasil, publicados no blog da OLLI.",
		`> O que é a OLLI, preços e limites do produto: ${ORIGEM}/llms.txt`,
		"",
		"---",
		"",
		guias,
		"",
	].join("\n");

	return new Response(corpo, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
