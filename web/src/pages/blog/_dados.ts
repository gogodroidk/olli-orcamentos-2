/**
 * _dados.ts — as consultas do blog, num lugar só.
 *
 * O `_` no nome é o que mantém este arquivo FORA do roteamento do Astro (arquivos
 * iniciados por underscore em `src/pages/` não viram rota). É o mesmo motivo de
 * `_CardPost.astro` estar aqui e não em `components/`: o blog inteiro é uma peça
 * só, e componentes do site são de outro dono.
 *
 * POR QUE CENTRALIZAR: o filtro `!rascunho` precisa existir em CINCO lugares —
 * índice, categoria, RSS, post relacionado e a ponte com `/para/[oficio]/`. Um
 * filtro repetido cinco vezes é um filtro que um dia vai faltar em um deles, e
 * rascunho vazado é a versão editorial do "erro vira vazio": o texto pela metade
 * chega ao leitor com cara de publicado.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { CATEGORIAS, MINIMO_POR_CATEGORIA, type CategoriaId } from '../../content/taxonomia';

export type Post = CollectionEntry<'blog'>;

/** Todos os posts publicados, mais recentes primeiro. É a ÚNICA porta de entrada. */
export async function postsPublicados(): Promise<Post[]> {
	const posts = await getCollection('blog', ({ data }) => !data.rascunho);
	return posts.sort(
		(a, b) => b.data.publicadoEm.valueOf() - a.data.publicadoEm.valueOf(),
	);
}

/**
 * Contagem por categoria — inclui as que estão abaixo do gate, porque o índice
 * precisa MOSTRAR a taxonomia inteira (o leitor tem de entender o mapa) mesmo
 * quando parte dela ainda não tem página própria.
 */
export function contarPorCategoria(posts: Post[]): Record<CategoriaId, number> {
	const contagem = Object.fromEntries(
		CATEGORIAS.map((c) => [c.id, 0]),
	) as Record<CategoriaId, number>;
	for (const post of posts) contagem[post.data.categoria as CategoriaId] += 1;
	return contagem;
}

/**
 * As categorias que TÊM rota. Uma só definição, consumida pelo `getStaticPaths`
 * da página de categoria, pelo link do post e pelo índice — assim é impossível
 * um link apontar para uma categoria que não gerou página (link quebrado) ou uma
 * categoria magra existir sem ninguém apontar para ela (página órfã).
 */
export function categoriasComRota(posts: Post[]): CategoriaId[] {
	const contagem = contarPorCategoria(posts);
	return CATEGORIAS.filter((c) => contagem[c.id] >= MINIMO_POR_CATEGORIA).map(
		(c) => c.id,
	);
}

/** A URL da categoria, ou `null` quando ela ainda não passou no gate. */
export function urlCategoria(
	categoria: CategoriaId,
	comRota: readonly CategoriaId[],
): string | null {
	return comRota.includes(categoria) ? `/blog/categoria/${categoria}/` : null;
}

/**
 * Leitura relacionada: mesma categoria primeiro, depois mesmo ofício. Sem
 * completar com "os mais recentes" — recomendar qualquer coisa para encher três
 * espaços é pior que mostrar dois. Se não houver relacionado, o bloco some.
 */
export function relacionados(post: Post, todos: Post[], quantidade = 3): Post[] {
	const outros = todos.filter((p) => p.id !== post.id);
	const escolhidos: Post[] = [];
	const adicionar = (lista: Post[]) => {
		for (const p of lista) {
			if (escolhidos.length >= quantidade) return;
			if (!escolhidos.some((e) => e.id === p.id)) escolhidos.push(p);
		}
	};
	adicionar(outros.filter((p) => p.data.categoria === post.data.categoria));
	adicionar(
		outros.filter(
			(p) => p.data.oficio === post.data.oficio && p.data.oficio !== 'todos',
		),
	);
	return escolhidos;
}

/** Data por extenso, pt-BR, para a tela. O `datetime` do <time> continua ISO. */
export function dataLonga(data: Date): string {
	return data.toLocaleDateString('pt-BR', {
		day: '2-digit',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	});
}

/** ISO curto (AAAA-MM-DD) — atributo `datetime` e `lastmod` do sitemap. */
export function dataIso(data: Date): string {
	return data.toISOString().slice(0, 10);
}

/**
 * Tempo de leitura a partir do markdown bruto. 200 palavras/minuto é a faixa
 * usual de leitura silenciosa em prosa; o número é arredondado para cima e
 * apresentado como estimativa, não como fato — daí o "~".
 */
export function minutosDeLeitura(corpo: string | undefined): number {
	const palavras = (corpo ?? '').trim().split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.round(palavras / 200));
}
