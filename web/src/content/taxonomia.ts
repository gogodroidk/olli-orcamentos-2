/**
 * taxonomia.ts — as categorias do blog e as regras que impedem o blog de apodrecer.
 *
 * POR QUE AQUI E NÃO NO content.config.ts: as categorias são lidas por quatro
 * lugares (o schema da coleção, o índice, a página de categoria e o RSS). Uma
 * lista escrita em quatro arquivos é a mesma dívida que `data/oficios.ts` já
 * documenta — por isso a lista existe UMA vez, e o `content.config.ts` a importa.
 *
 * RECORTE POR TRABALHO, NÃO POR ASSUNTO (docs/ENXAME/LANDING_BLOG_SEO.md §3.2).
 * Categoria por assunto ("ar-condicionado", "elétrica") duplicaria o eixo que
 * `/para/[oficio]/` já ocupa e racharia o blog em categorias magras que competem
 * entre si. Por TRABALHO ("preço", "documento", "norma"), o mesmo post serve
 * eletricista e dedetizadora, e a taxonomia aguenta 100 posts sem virar bagunça.
 *
 * MODELO DE URL — decidido uma vez, e não muda mais (trocar URL depois custa SEO):
 *   /blog/                              índice, 12 por página
 *   /blog/2/                            paginação
 *   /blog/[slug]/                       POST — slug PLANO: sem categoria, sem data, sem ano
 *   /blog/categoria/[categoria]/        hub da categoria (só as que passam no gate)
 *   /blog/rss.xml                       feed
 *
 * O slug é plano de propósito. Em `/blog/[categoria]/[slug]/`, o dia em que um
 * post muda de categoria — e vai mudar — a URL muda junto, e você paga 301 mais
 * perda de sinal. Sem ano no slug pelo mesmo motivo: os posts de preço são
 * atualizados em janeiro NA MESMA URL, que é o mecanismo de frescor mais barato
 * que este blog vai ter.
 */

export const CATEGORIAS = [
	{
		id: 'documentos',
		nome: 'Documentos e modelos',
		/** Vira o <title> e o H1 do hub — precisa funcionar como frase de busca. */
		titulo: 'Documentos do prestador: orçamento, OS, recibo e contrato',
		descricao:
			'Orçamento, ordem de serviço, recibo, contrato e laudo: o que cada documento precisa ter para o cliente aprovar e para você não perder a discussão depois.',
	},
	{
		id: 'precificacao',
		nome: 'Preço e precificação',
		titulo: 'Quanto cobrar: preço, hora técnica e margem do prestador',
		descricao:
			'A conta por trás do preço: hora técnica, custo do material, deslocamento, imposto e a margem que sobra. Sem tabela mágica — com a aritmética aberta.',
	},
	{
		id: 'gestao',
		nome: 'Gestão do serviço',
		titulo: 'Gestão do serviço: cobrança, follow-up, agenda e equipe',
		descricao:
			'O que acontece depois do orçamento: cobrar sem queimar o cliente, ir atrás de quem sumiu, montar a rota do dia e contratar o primeiro ajudante.',
	},
	{
		id: 'ferramentas',
		nome: 'Ferramentas e apps',
		titulo: 'Ferramentas e aplicativos para prestador de serviço',
		descricao:
			'Caderno, planilha, app: o que cada ferramenta resolve de verdade, o que ela cobra em silêncio e o ponto em que trocar passa a valer a pena.',
	},
	{
		id: 'tecnico',
		nome: 'Guias técnicos',
		titulo: 'Guias técnicos de campo: diagnóstico, cálculo e norma',
		descricao:
			'Código de erro, BTU, carga de gás, disjuntor, diluição: o conteúdo técnico que decide se a visita termina em conserto ou em segunda visita.',
	},
	{
		id: 'regras',
		nome: 'Normas e obrigações',
		titulo: 'Normas e obrigações do prestador: PMOC, ANVISA, MEI',
		descricao:
			'O que a lei exige de quem presta serviço no Brasil — PMOC, RDC da ANVISA, obrigações do MEI — com o número da norma e o que mudou recentemente.',
	},
] as const;

export type CategoriaId = (typeof CATEGORIAS)[number]['id'];

/** Só os ids — é o que o `z.enum()` do schema consome. */
export const IDS_CATEGORIA = CATEGORIAS.map((c) => c.id) as unknown as [
	CategoriaId,
	...CategoriaId[],
];

/**
 * GATE DE CATEGORIA — é regra, não estilo, por isso vive em código.
 *
 * Categoria com 1–3 posts é página magra: ela divide a autoridade do blog, é
 * rastreada, e não ranqueia nada. Enquanto não houver 4 posts publicados, a
 * categoria NÃO gera rota, NÃO entra no sitemap e NÃO vira link — o rótulo
 * continua aparecendo no post (o leitor precisa saber do que se trata), só que
 * como texto, não como âncora para uma página que não deveria existir ainda.
 *
 * Mudar este número é uma decisão editorial consciente. Deixá-lo como "boa
 * intenção" no lugar de `filter` foi o que criou blog-cemitério em todo lugar.
 */
export const MINIMO_POR_CATEGORIA = 4;

export function categoriaPorId(id: CategoriaId) {
	const achada = CATEGORIAS.find((c) => c.id === id);
	// Exaustivo por tipo: `id` é CategoriaId, então isto é inalcançável. Se um dia
	// alguém alargar o tipo, o build quebra aqui em vez de renderizar rótulo vazio.
	if (!achada) throw new Error(`Categoria desconhecida no blog: "${id}"`);
	return achada;
}

/** Quantos posts por página no índice e nos hubs. */
export const POSTS_POR_PAGINA = 12;
