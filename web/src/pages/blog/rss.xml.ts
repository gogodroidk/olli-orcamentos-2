/**
 * /blog/rss.xml — o feed.
 *
 * ESCRITO À MÃO, SEM `@astrojs/rss`, e é decisão consciente. RSS 2.0 são vinte
 * linhas de XML com escape correto; a alternativa era uma dependência nova (mais
 * a árvore dela) num projeto que hoje tem 10 dependências de produção, para gerar
 * exatamente este texto. A regra da casa sobre não arrastar peso vale também para
 * package.json.
 *
 * SEM `<content:encoded>` com o post inteiro: entregar o corpo renderizado
 * exigiria sanitizador + renderizador de markdown (mais duas dependências) para
 * servir leitores que ainda não existem. `description` basta, e o link leva ao
 * texto completo — que é onde o CTA está.
 *
 * O NOME DO ARQUIVO É A URL: endpoint com extensão vira arquivo com extensão no
 * dist, mesmo com `trailingSlash: 'always'`. Evidência no próprio repositório:
 * `src/pages/llms.txt.ts` gera `dist/llms.txt`, sem barra e sem pasta.
 */
import type { APIContext } from 'astro';
import { postsPublicados } from './_dados';

/** Escapa o que quebraria o XML. Sem isto, um `&` num título derruba o feed inteiro. */
function xml(texto: string): string {
	return texto
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export async function GET(context: APIContext) {
	const origem = context.site?.origin ?? 'https://olliorcamentos.online';
	const posts = await postsPublicados();

	const itens = posts
		.map((post) => {
			const link = `${origem}/blog/${post.id}/`;
			return `    <item>
      <title>${xml(post.data.titulo)}</title>
      <link>${xml(link)}</link>
      <guid isPermaLink="true">${xml(link)}</guid>
      <description>${xml(post.data.descricao)}</description>
      <category>${xml(post.data.categoria)}</category>
      <pubDate>${post.data.publicadoEm.toUTCString()}</pubDate>
    </item>`;
		})
		.join('\n');

	// `lastBuildDate` = data do post mais recente, NÃO `new Date()`. Com `new Date()`
	// todo build (mesmo sem post novo) anunciaria conteúdo novo ao leitor — que é
	// mentir sobre frescor, a versão RSS da copy inventada.
	const maisRecente = posts[0]?.data.publicadoEm ?? new Date(0);

	const corpo = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Blog da OLLI — o ofício por dentro</title>
    <link>${origem}/blog/</link>
    <atom:link href="${origem}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <description>Preço, documento, norma e ferramenta para quem presta serviço em campo no Brasil.</description>
    <language>pt-BR</language>
    <lastBuildDate>${maisRecente.toUTCString()}</lastBuildDate>
${itens}
  </channel>
</rss>
`;

	return new Response(corpo, {
		headers: {
			'Content-Type': 'application/rss+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
}
