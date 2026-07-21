/**
 * content.config.ts — o schema do blog. Um post que não obedece NÃO COMPILA.
 *
 * O CAMINHO É OBRIGATÓRIO: Astro 5+ procura `src/content.config.ts`. O antigo
 * `src/content/config.ts` não é mais lido — ele lança `LegacyContentConfigError`
 * (conferido em node_modules/astro/dist/content/utils.js:514-531 nesta versão,
 * 7.0.7). Não mover.
 *
 * A REGRA DA CASA APLICADA A CONTEÚDO: `data/oficios.ts` documenta 5 incidentes
 * de copy inventada e a regra que nasceu deles — copy/preço/feature só derivada
 * da fonte. Aqui isso vira validação de build:
 *
 *  - `oficio` é validado contra `VERTICAIS` (o MESMO catálogo que o app usa no
 *    gate). Um post marcado para um ofício que não existe quebra o build, em vez
 *    de sumir em silêncio da página que deveria fortalecer.
 *  - `descricao` tem mínimo e máximo. Sem fallback silencioso: description ruim
 *    é a única meta tag que o Google mostra inteira, e "vou preencher depois"
 *    nunca acontece.
 *  - `rascunho` existe para o post ficar pronto no repositório sem ir ao ar. É o
 *    que permite publicar em ritmo (2–4 por semana) em vez de despejar o lote
 *    inteiro — despejo é literalmente o padrão que a política de spam do Google
 *    descreve como *scaled content abuse*.
 *
 * SEM CAMPO `autor`, DE PROPÓSITO. Hoje há uma pessoa escrevendo. Inventar
 * "equipe editorial" para parecer redação é a mesma categoria de mentira que fez
 * o `SoftwareApplication` sair sem `aggregateRating` (Layout.astro:40-42).
 * Quando existir uma segunda pessoa real, entra `autor` + `Person`.
 *
 * SEM CAMPO `capa`, POR ORA. Imagem de capa é o item que mais estraga LCP no
 * público desta casa (Android intermediário, 4G na rua), e capa genérica de banco
 * de imagem não informa nada. Quando existir foto REAL de serviço, entra como
 * `image()` com `capaAlt` obrigatório — alt vazio não deve passar no build.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { VERTICAIS } from '../../src/services/verticais';
import { IDS_CATEGORIA } from './content/taxonomia';

/**
 * Os ofícios REAIS do produto + 'todos'. Mesmo truque do `Record` exaustivo de
 * `SLUG_POR_OFICIO`: ofício que não existe no app não compila aqui.
 */
const IDS_OFICIO = [...VERTICAIS.map((v) => v.id), 'geral', 'todos'] as unknown as [
	string,
	...string[],
];

const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
	schema: z.object({
		/** Vira <title> e og:title. 60 chars é onde o Google corta no desktop. */
		titulo: z.string().min(20).max(70),
		/** Vira <meta description>. Faixa dura: fora dela, o build para. */
		descricao: z.string().min(110).max(165),
		categoria: z.enum(IDS_CATEGORIA),
		/**
		 * Para qual ofício este post fala. `'todos'` aparece em TODAS as páginas
		 * `/para/[oficio]/`; um ofício específico aparece só na dele. É o link
		 * interno que nasce de graça, nos dois sentidos.
		 */
		oficio: z.enum(IDS_OFICIO),
		publicadoEm: z.coerce.date(),
		/** dateModified + lastmod do sitemap. O sinal de frescor mais barato que existe. */
		atualizadoEm: z.coerce.date().optional(),
		/**
		 * Alarme editorial — NÃO vai para o HTML. Serve para as categorias que
		 * apodrecem (`regras` e `precificacao`): quem revisar o blog filtra por
		 * `revisarEm` vencido em vez de reler 40 posts.
		 */
		revisarEm: z.coerce.date().optional(),
		/** Ordena o índice sem inventar "mais lido" — não há analytics de post ainda. */
		destaque: z.boolean().default(false),
		/** `true` = não gera rota, não entra em sitemap, RSS nem em nenhuma listagem. */
		rascunho: z.boolean().default(false),
	}),
});

export const collections = { blog };
