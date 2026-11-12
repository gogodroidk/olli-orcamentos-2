/**
 * QUANTO COBRAR — dados das páginas /quanto-cobrar/<tema>/ (SEO de "quanto cobrar por X em 2026").
 *
 * REGRAS DESTE ARQUIVO (CDC + regra da casa "copy derivada da fonte"):
 *  - Todo número de preço é uma LINHA com `fonte` (id de `FONTES`) e data. Não existe preço solto no texto das
 *    páginas: o resumo ("faixa de referência") é CALCULADO destas linhas por `resumoFaixa()`, nunca digitado.
 *  - É FAIXA publicada por terceiros, nunca "preço oficial", "tabela" ou promessa de ganho. As páginas dizem isso.
 *  - Linha `foraDaFaixa` aparece na tabela (transparência), mas não entra no resumo (outlier regional).
 *  - Valor de exemplo/ilustrativo da fonte vem marcado `ilustrativo` e não entra no resumo.
 *  - Preço do OLLI (Pro/Empresa) só vem de `data/planos.ts`; aqui não há literal de R$ do plano.
 *  - Sem texto copiado de concorrente: a redação é nossa; a fonte é citada só pelo número e pelo link.
 *
 * Coleta: instalação/limpeza em 10–12/11/2026 (pesquisa própria, referência cruzada com o CSV do carrossel de
 * preço de 10/11/2026); PMOC em 12/11/2026. `revisarEm` é o alarme: preço de serviço envelhece.
 */

export interface FonteQC {
	id: string;
	nome: string;
	url: string;
	/** Data de publicação/atualização da fonte (AAAA-MM-DD). */
	data: string;
	/** Abrangência, quando não é o Brasil inteiro. */
	regiao?: string;
}

export interface LinhaQC {
	servico: string;
	/** Reais. `max: null` = "a partir de". */
	min: number;
	max: number | null;
	unidade: string;
	fonte: string;
	obs?: string;
	foraDaFaixa?: boolean;
	ilustrativo?: boolean;
	/** Agrupa linhas do mesmo serviço para o resumo. */
	grupo: string;
}

export interface PerguntaQC {
	q: string;
	a: string;
}

export interface PaginaQC {
	slug: string;
	/** Vai no utm_campaign: quanto-cobrar-<utm>. */
	utm: string;
	titulo: string;
	descricao: string;
	h1: string;
	/** Parágrafo citável logo após o H1. Sem número que não esteja nas linhas. */
	resposta: string;
	publicadoEm: string;
	revisarEm: string;
	/** Rótulo do resumo -> grupo de linhas. */
	resumo: { rotulo: string; grupo: string }[];
	linhas: LinhaQC[];
	/** Blocos de texto: título + parágrafos. */
	secoes: { titulo: string; paragrafos: string[]; itens?: string[] }[];
	faq: PerguntaQC[];
	fontes: FonteQC[];
	/** Slugs de blog (existentes) e de outras páginas desta série. */
	leiaTambem: { href: string; texto: string }[];
	/** Frase de ponte pro produto, honesta com o que o app faz. */
	ponteOlli: string;
}

const brl = (n: number) =>
	n.toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
		minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
		maximumFractionDigits: 2,
	});

export const formataBRL = brl;

export function faixaTexto(l: Pick<LinhaQC, "min" | "max">): string {
	return l.max === null ? `a partir de ${brl(l.min)}` : l.min === l.max ? brl(l.min) : `${brl(l.min)} a ${brl(l.max)}`;
}

/** Menor mínimo e maior máximo das linhas do grupo, fora outliers e ilustrativos. Lança erro se o grupo não existe. */
export function resumoFaixa(linhas: LinhaQC[], grupo: string) {
	const g = linhas.filter((l) => l.grupo === grupo && !l.foraDaFaixa && !l.ilustrativo);
	if (g.length === 0) throw new Error(`[quantoCobrar] grupo sem linhas: ${grupo}`);
	const min = Math.min(...g.map((l) => l.min));
	const aberto = g.some((l) => l.max === null);
	const max = aberto ? null : Math.max(...g.map((l) => l.max as number));
	return { min, max, fontes: new Set(g.map((l) => l.fonte)).size };
}

const FONTE_REFRIMAQ_INST: FonteQC = {
	id: "refrimaq-inst",
	nome: "Refrimaq — Quanto cobrar para instalar ar-condicionado",
	url: "https://refrimaq.org/quanto-cobrar-para-instalar-ar-condicionado",
	data: "2026-08-28",
};
const FONTE_LAR_PONTUAL: FonteQC = {
	id: "lar-pontual",
	nome: "Lar Pontual — Valor de instalação de ar-condicionado",
	url: "https://larpontual.com.br/portal/valor-instalacao-ar-condicionado",
	data: "2026-10-21",
	regiao: "SP",
};
const FONTE_TODO_RESUELTO: FonteQC = {
	id: "todo-resuelto",
	nome: "Todo Resuelto — Tabela de preços de climatização (agregado de 11 fontes públicas, edição novembro/2026)",
	url: "https://todoresuelto.com/br/precos/climatizacao",
	data: "2026-11-01",
};
const FONTE_REFRIMAQ_ASSIST: FonteQC = {
	id: "refrimaq-assist",
	nome: "Refrimaq — Tabela de preços de assistência técnica",
	url: "https://refrimaq.org/tabela-de-precos-assistencia-tecnica",
	data: "2026-09-26",
};
const FONTE_DIRECT: FonteQC = {
	id: "direct-jp",
	nome: "Direct Ar Condicionado — Quanto custa instalar ar-condicionado em João Pessoa",
	url: "https://directarcondicionado.com.br/blog/quanto-custa-instalar-ar-condicionado-joao-pessoa",
	data: "2026-03-25",
	regiao: "João Pessoa/PB",
};
const FONTE_ENGEHALL: FonteQC = {
	id: "engehall",
	nome: "Engehall — Quanto custa instalar ar-condicionado",
	url: "https://engehall.com.br/quanto-custa-instalar-ar-condicionado-2/",
	data: "2026-04-17",
	regiao: "capitais do Sudeste",
};
const FONTE_NEWCLIMA: FonteQC = {
	id: "newclima",
	nome: "New Clima — Quanto custa o PMOC em São Paulo em 2026",
	url: "https://www.newclimaar.com.br/blog/quanto-custa-pmoc-sao-paulo",
	data: "2026-06-25",
	regiao: "São Paulo",
};
const FONTE_WATT: FonteQC = {
	id: "watt",
	nome: "Watt Soluções — Quanto custa o PMOC em São Paulo",
	url: "https://www.wattsolucoes.com.br/blog/quanto-custa-pmoc-sao-paulo",
	data: "2026-11-12",
	regiao: "São Paulo",
};
const FONTE_MEUPMOC: FonteQC = {
	id: "meupmoc",
	nome: "Meu PMOC — Quanto cobrar pelo PMOC? (tabela que a própria fonte chama de ilustrativa)",
	url: "https://meupmoc.com.br/blog/quanto-cobrar-pelo-pmoc",
	data: "2025-10-14",
};
const FONTE_CFT: FonteQC = {
	id: "cft-trt",
	nome: "CFT — Resolução nº 282, de 2/10/2025: valor do TRT em 2026",
	url: "https://cft.org.br/wp-content/uploads/2025/12/Resolucao282.pdf",
	data: "2025-10-02",
};
const FONTE_LEI_PMOC: FonteQC = {
	id: "lei-13589",
	nome: "Lei nº 13.589/2018 — PMOC (Planalto)",
	url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm",
	data: "2018-01-04",
};
const FONTE_CDC: FonteQC = {
	id: "cdc",
	nome: "Código de Defesa do Consumidor, art. 40 — orçamento prévio (Planalto)",
	url: "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm",
	data: "1990-09-11",
};

const aviso =
	"Estas são faixas publicadas por empresas e portais, não uma tabela oficial nem uma recomendação de preço. O seu preço sai do seu custo, da sua região e do escopo combinado.";

export const PAGINAS_QC: PaginaQC[] = [
	{
		slug: "instalacao-de-ar-condicionado",
		utm: "instalacao",
		titulo: "Quanto cobrar por instalação de ar-condicionado em 2026",
		descricao:
			"Faixas de preço de instalação de split por BTU em 2026, com fonte e data em cada número, e como montar o orçamento sem esquecer tubulação e suporte.",
		h1: "Quanto cobrar por instalação de ar-condicionado em 2026",
		resposta:
			"Em fontes públicas consultadas em novembro de 2026, a instalação padrão de um split de 12.000 BTU (até 3 metros de tubulação) aparece entre R$ 500 e R$ 1.200 em todo o Brasil. Aparelhos maiores, metro extra de tubulação, suporte, furo em concreto e trabalho em altura costumam ser cobrados à parte. É uma faixa de referência, não um preço oficial.",
		publicadoEm: "2026-11-12",
		revisarEm: "2027-02-12",
		resumo: [
			{ rotulo: "Split 9.000 BTU", grupo: "9k" },
			{ rotulo: "Split 12.000 BTU", grupo: "12k" },
			{ rotulo: "Split 18.000 BTU", grupo: "18k" },
			{ rotulo: "Split 24.000 BTU", grupo: "24k" },
		],
		linhas: [
			{ grupo: "9k", servico: "Instalação split 9.000 BTU (padrão, até 3 m)", min: 450, max: 700, unidade: "por serviço", fonte: "refrimaq-inst", obs: "inclui até 3 m, suporte, 1 furo, vácuo e teste" },
			{ grupo: "9k", servico: "Instalação split até 9.000 BTU", min: 450, max: 999, unidade: "por serviço", fonte: "todo-resuelto", obs: "faixa agregada de 3 fontes" },
			{ grupo: "7-12k", servico: "Instalação split 7.000 a 12.000 BTU", min: 695, max: 930, unidade: "por serviço", fonte: "lar-pontual", obs: "suporte e furo em alvenaria cobrados à parte" },
			{ grupo: "12k", servico: "Instalação split 12.000 BTU (padrão, até 3 m)", min: 500, max: 900, unidade: "por serviço", fonte: "refrimaq-inst" },
			{ grupo: "12k", servico: "Instalação split 12.000 BTU", min: 500, max: 1199.9, unidade: "por serviço", fonte: "todo-resuelto", obs: "faixa agregada de 3 fontes" },
			{ grupo: "9-12k-sudeste", servico: "Instalação 9.000 a 12.000 BTU, capitais do Sudeste", min: 800, max: 1800, unidade: "por serviço", fonte: "engehall", obs: "valor bem acima das demais fontes; mostrado, mas fora do resumo", foraDaFaixa: true },
			{ grupo: "18k", servico: "Instalação split 18.000 BTU", min: 750, max: 1350, unidade: "por serviço", fonte: "lar-pontual" },
			{ grupo: "18k", servico: "Instalação split 18.000 BTU", min: 700, max: 1200, unidade: "por serviço", fonte: "refrimaq-inst" },
			{ grupo: "18k", servico: "Instalação split 18.000 BTU", min: 550, max: 1499, unidade: "por serviço", fonte: "todo-resuelto", obs: "faixa agregada de 4 fontes" },
			{ grupo: "24k", servico: "Instalação split 24.000 BTU", min: 900, max: 1650, unidade: "por serviço", fonte: "lar-pontual" },
			{ grupo: "24k", servico: "Instalação split 24.000 BTU", min: 900, max: 1500, unidade: "por serviço", fonte: "refrimaq-inst" },
			{ grupo: "24k", servico: "Instalação split 24.000 BTU", min: 650, max: 2199, unidade: "por serviço", fonte: "todo-resuelto", obs: "faixa agregada de 4 fontes" },
			{ grupo: "30-36k", servico: "Instalação split 30.000 a 36.000 BTU", min: 850, max: 2399, unidade: "por serviço", fonte: "todo-resuelto", obs: "faixa agregada de 4 fontes" },
			{ grupo: "cassete", servico: "Instalação de cassete ou piso-teto", min: 1200, max: 2999, unidade: "por serviço", fonte: "todo-resuelto", obs: "faixa agregada de 2 fontes" },
			{ grupo: "metro", servico: "Metro extra de tubulação de cobre", min: 35, max: 70, unidade: "por metro", fonte: "lar-pontual", obs: "mais fluido refrigerante, R$ 40 a R$ 80 por metro" },
			{ grupo: "metro", servico: "Metro extra de tubulação 1/4 + 3/8", min: 90, max: 140, unidade: "por metro", fonte: "refrimaq-inst", obs: "1/4 + 1/2 ou maior: R$ 130 a R$ 180" },
			{ grupo: "metro", servico: "Metro extra de tubulação de cobre", min: 35, max: 180, unidade: "por metro", fonte: "todo-resuelto", obs: "média de R$ 94 por metro" },
			{ grupo: "metro", servico: "Metro extra de tubulação de cobre", min: 80, max: 150, unidade: "por metro", fonte: "direct-jp", obs: "João Pessoa/PB" },
			{ grupo: "suporte", servico: "Par de suportes da condensadora", min: 80, max: 150, unidade: "o par", fonte: "lar-pontual", obs: "cobrado à parte" },
			{ grupo: "furo", servico: "Furo em concreto ou viga", min: 120, max: 250, unidade: "por furo", fonte: "todo-resuelto" },
			{ grupo: "altura", servico: "Instalação em altura (andaime, rapel, laje, telhado)", min: 300, max: 900, unidade: "adicional", fonte: "refrimaq-inst" },
			{ grupo: "gas", servico: "Carga complementar de gás (linha longa)", min: 150, max: 300, unidade: "por carga", fonte: "lar-pontual" },
			{ grupo: "gas", servico: "Carga complementar de gás (linha longa)", min: 120, max: 300, unidade: "por carga", fonte: "refrimaq-inst" },
			{ grupo: "eletrico", servico: "Ponto elétrico dedicado 220 V", min: 250, max: 500, unidade: "por ponto", fonte: "lar-pontual", obs: "serviço de eletricista" },
			{ grupo: "desinstala", servico: "Remoção de split antigo", min: 200, max: 450, unidade: "por serviço", fonte: "refrimaq-inst" },
		],
		secoes: [
			{
				titulo: "O que a faixa de instalação costuma incluir (e o que vira extra)",
				paragrafos: [
					"A maior fonte de briga em orçamento de instalação é escopo, não preço. Quando um cliente compara R$ 500 com R$ 900, quase sempre está comparando serviços diferentes: um inclui suporte e furo, o outro não. Por isso a tabela acima traz a observação de cada fonte.",
					"Nas fontes consultadas, o pacote 'padrão' cobre o aparelho até cerca de 3 metros de tubulação, um furo em parede comum, teste e vácuo. O que costuma sair do pacote e virar linha à parte no orçamento:",
				],
				itens: [
					"metro extra de tubulação de cobre (e o fluido refrigerante do trecho);",
					"suporte da condensadora e furo em concreto ou viga;",
					"ponto elétrico dedicado e disjuntor, quando a rede do cliente não atende;",
					"trabalho em altura: andaime, rapel, laje ou telhado;",
					"dreno, bomba de dreno e acabamento (canaleta, fita);",
					"remoção do aparelho antigo.",
				],
			},
			{
				titulo: "Como chegar ao SEU preço a partir da faixa",
				paragrafos: [
					"Use a faixa como régua de mercado, não como tabela. O caminho que não depende de chute: some as horas que a instalação leva porta a porta, multiplique pela sua hora técnica, some o material com a sua margem de reposição, o deslocamento e o imposto. Se o resultado ficar fora da faixa, vale perguntar por quê antes de mexer no preço: pode ser região, pode ser eficiência, pode ser um item esquecido.",
					"Fale o escopo antes de falar o valor. 'R$ 700 a instalação de 12.000 BTU com até 3 m, suporte e um furo; metro extra R$ X' vende melhor e dá menos retrabalho do que 'R$ 700'. O Código de Defesa do Consumidor (art. 40) já pede orçamento prévio discriminando mão de obra, materiais, condições de pagamento e prazos.",
				],
			},
			{
				titulo: "Por que as faixas são tão largas",
				paragrafos: [
					"Região, altura do ponto de instalação, tipo de parede, distância até a condensadora e o próprio perfil do técnico (autônomo ou empresa com equipe e garantia) mexem no preço. Uma fonte de São Paulo e outra de João Pessoa não deveriam apontar o mesmo número, e não apontam. Quando a sua região aparece na coluna de fonte, dê mais peso a ela; quando não aparece, trate como referência nacional.",
				],
			},
		],
		faq: [
			{
				q: "Quanto cobrar pela instalação de um ar-condicionado split de 12.000 BTU?",
				a: "Nas fontes públicas consultadas em novembro de 2026, a instalação padrão de 12.000 BTU, com até 3 metros de tubulação, aparece entre R$ 500 e R$ 1.200 no Brasil. Suporte, furo em concreto, tubulação extra e trabalho em altura costumam entrar à parte. A faixa é referência de mercado, não preço oficial.",
			},
			{
				q: "O metro extra de tubulação é cobrado à parte?",
				a: "Nas fontes consultadas, sim: o pacote padrão cobre cerca de 3 metros, e o metro extra de cobre aparece de R$ 35 a R$ 180, conforme a bitola, a região e se o fluido refrigerante está incluso. Deixe isso escrito no orçamento antes de começar o serviço.",
			},
			{
				q: "Posso cobrar mais que a faixa?",
				a: "Pode, desde que o escopo justifique e o cliente saiba antes de aprovar: altura, distância, material de melhor qualidade, garantia e atendimento fora de horário são motivos comuns. O que não pode é combinar um valor e cobrar outro depois: o orçamento aprovado vale como combinado (CDC, art. 40).",
			},
			{
				q: "Essa tabela é preço oficial?",
				a: "Não. Não existe tabela oficial de preço de instalação de ar-condicionado no Brasil. As faixas vêm de páginas públicas de empresas e portais, citadas com data e link no fim desta página, e servem para você conferir se o seu preço está em linha com o mercado.",
			},
		],
		fontes: [FONTE_REFRIMAQ_INST, FONTE_LAR_PONTUAL, FONTE_TODO_RESUELTO, FONTE_DIRECT, FONTE_ENGEHALL, FONTE_CDC],
		leiaTambem: [
			{ href: "/quanto-cobrar/limpeza-de-split/", texto: "Quanto cobrar por limpeza de split em 2026" },
			{ href: "/blog/como-calcular-sua-hora-tecnica/", texto: "Como calcular a sua hora técnica" },
			{ href: "/blog/como-cobrar-visita-tecnica-e-diagnostico/", texto: "Como cobrar visita técnica e diagnóstico" },
		],
		ponteOlli:
			"Na OLLI você guarda o seu catálogo de serviços (instalação por BTU, metro extra, suporte, altura) e monta o orçamento no celular, com o escopo discriminado, para o cliente aprovar pelo link.",
	},
	{
		slug: "limpeza-de-split",
		utm: "limpeza-split",
		titulo: "Quanto cobrar por limpeza de split em 2026",
		descricao:
			"Faixas de preço de limpeza e higienização de ar-condicionado split em 2026, com fonte e data, e o que separa limpeza simples de higienização completa.",
		h1: "Quanto cobrar por limpeza de split em 2026",
		resposta:
			"Em fontes públicas consultadas entre 2026-03 e 2026-11, a limpeza ou higienização de um split residencial aparece entre R$ 150 e R$ 470 por aparelho, com a higienização completa na parte de cima da faixa. A diferença quase sempre é de escopo: limpeza de filtro não é desmontar, lavar serpentina e testar. É faixa de referência, não preço oficial.",
		publicadoEm: "2026-11-12",
		revisarEm: "2027-02-12",
		resumo: [
			{ rotulo: "Limpeza ou higienização de split", grupo: "limpeza" },
			{ rotulo: "Visita técnica / diagnóstico", grupo: "visita" },
			{ rotulo: "Recarga de gás", grupo: "gas" },
		],
		linhas: [
			{ grupo: "limpeza", servico: "Higienização completa de split", min: 150, max: 350, unidade: "por aparelho", fonte: "refrimaq-assist" },
			{ grupo: "limpeza", servico: "Limpeza simples de split", min: 150, max: 250, unidade: "por aparelho", fonte: "direct-jp", obs: "João Pessoa/PB; preventiva completa: R$ 200 a R$ 400" },
			{ grupo: "limpeza", servico: "Limpeza de ar-condicionado split", min: 220, max: 469.9, unidade: "por aparelho", fonte: "todo-resuelto", obs: "faixa agregada de 4 fontes" },
			{ grupo: "visita", servico: "Visita técnica / diagnóstico", min: 60, max: 150, unidade: "por visita", fonte: "refrimaq-assist" },
			{ grupo: "gas", servico: "Recarga de gás R-410A em split", min: 350, max: 600, unidade: "por serviço", fonte: "direct-jp", obs: "João Pessoa/PB" },
			{ grupo: "gas", servico: "Recarga de gás", min: 150, max: 480, unidade: "por serviço", fonte: "todo-resuelto", obs: "faixa agregada de 3 fontes" },
			{ grupo: "gas", servico: "Carga extra de gás", min: 120, max: 300, unidade: "por carga", fonte: "todo-resuelto" },
			{ grupo: "desinstala", servico: "Desinstalação de split", min: 250, max: 500, unidade: "por serviço", fonte: "direct-jp", obs: "João Pessoa/PB" },
			{ grupo: "desinstala", servico: "Remoção de split antigo", min: 200, max: 450, unidade: "por serviço", fonte: "refrimaq-inst" },
		],
		secoes: [
			{
				titulo: "Três serviços que o cliente chama de 'limpeza'",
				paragrafos: [
					"No WhatsApp, 'limpeza' pode significar três coisas bem diferentes, e é aí que o preço fica errado. Escreva qual delas você está orçando:",
				],
				itens: [
					"limpeza simples: filtros e carenagem, cerca de 20 minutos;",
					"higienização completa: desmontagem da evaporadora, lavagem da serpentina e da turbina, dreno e teste de operação;",
					"manutenção preventiva: higienização mais medições (pressões, corrente, capacitor, conexões elétricas, isolamento).",
				],
			},
			{
				titulo: "A regra do segundo aparelho no mesmo endereço",
				paragrafos: [
					"O deslocamento e a montagem do setup acontecem uma vez por endereço, não uma vez por aparelho. Se você cobra o valor cheio do primeiro aparelho em todos os demais, está cobrando um deslocamento que não aconteceu, e pode perder o cliente para quem faz o desconto. Anunciar o valor do segundo aparelho em diante antes de o cliente perguntar costuma transformar uma visita de um aparelho em uma visita de três. O tamanho do desconto sai da sua conta de custo; não há percentual universal.",
				],
			},
			{
				titulo: "Como validar a faixa contra o seu custo",
				paragrafos: [
					"Cronometre o seu tempo porta a porta em alguns serviços de cada tipo (hi-wall, piso-teto, cassete). Multiplique pela sua hora técnica, some insumos por aparelho (produto, saco de descarte, EPI), depreciação de bomba e bolsa coletora, deslocamento e imposto. Se o resultado ficar abaixo da faixa, você pode estar cobrando pouco; se ficar acima, confira se o seu escopo realmente é o da higienização completa e se o cliente sabe disso.",
				],
			},
		],
		faq: [
			{
				q: "Quanto cobrar por limpeza de ar-condicionado split?",
				a: "Nas fontes públicas consultadas entre março e novembro de 2026, a limpeza ou higienização de um split aparece entre R$ 150 e R$ 470 por aparelho, com a higienização completa nos valores mais altos. Depende de região, tipo de aparelho e escopo. É referência de mercado, não preço oficial.",
			},
			{
				q: "Qual a diferença entre limpeza e higienização?",
				a: "Na prática do mercado, limpeza simples é filtro e carenagem; higienização completa envolve desmontar a evaporadora, lavar serpentina e turbina, limpar o dreno e testar o aparelho. Combine e escreva qual dos dois está no orçamento, porque o preço e o tempo são diferentes.",
			},
			{
				q: "Dá para cobrar visita técnica separada?",
				a: "Sim. Diagnosticar, medir e explicar a causa do problema é serviço técnico executado. Nas fontes consultadas a visita aparece entre R$ 60 e R$ 150. Muitos técnicos abatem o valor se o cliente aprova o serviço; combine isso por escrito antes de ir.",
			},
			{
				q: "Essa tabela é preço oficial?",
				a: "Não. Não existe tabela oficial de preço de limpeza de ar-condicionado. As faixas vêm de páginas públicas de empresas e portais, com data e link no fim desta página, e servem para conferir se o seu preço está em linha com o mercado.",
			},
		],
		fontes: [FONTE_REFRIMAQ_ASSIST, FONTE_REFRIMAQ_INST, FONTE_DIRECT, FONTE_TODO_RESUELTO, FONTE_CDC],
		leiaTambem: [
			{ href: "/blog/quanto-cobrar-limpeza-de-ar-condicionado/", texto: "Limpeza de ar-condicionado: monte a tabela por BTU e tipo" },
			{ href: "/quanto-cobrar/instalacao-de-ar-condicionado/", texto: "Quanto cobrar por instalação de ar-condicionado em 2026" },
			{ href: "/quanto-cobrar/pmoc/", texto: "Quanto cobrar por PMOC em 2026" },
		],
		ponteOlli:
			"Na OLLI o seu catálogo guarda a limpeza por tipo de aparelho, e o orçamento sai no local, com o escopo escrito, para o cliente aprovar pelo link. O mesmo cliente vira ordem de serviço e recibo sem redigitar.",
	},
	{
		slug: "pmoc",
		utm: "pmoc",
		titulo: "Quanto cobrar por PMOC de ar-condicionado em 2026",
		descricao:
			"Faixas de preço de PMOC em 2026: elaboração do plano, contrato mensal por porte e valor por equipamento, com fonte e data, e o que entra na conta.",
		h1: "Quanto cobrar por PMOC de ar-condicionado em 2026",
		resposta:
			"Em fontes públicas de 2026 para São Paulo, contratos de PMOC aparecem de R$ 350 a R$ 2.500 por mês até 20 equipamentos, ou de R$ 50 a R$ 100 por equipamento ao mês, e a elaboração do documento de R$ 500 a R$ 1.500. Os valores variam muito com porte, frequência de visitas e responsável técnico. É referência, não tabela oficial.",
		publicadoEm: "2026-11-12",
		revisarEm: "2027-02-12",
		resumo: [
			{ rotulo: "Elaboração do plano (taxa única)", grupo: "elaboracao" },
			{ rotulo: "Contrato mensal até 20 equipamentos", grupo: "mensal-ate-20" },
			{ rotulo: "Valor por equipamento ao mês", grupo: "por-equip" },
		],
		linhas: [
			{ grupo: "elaboracao", servico: "Elaboração do documento PMOC", min: 500, max: 1500, unidade: "taxa única", fonte: "newclima", obs: "qualquer porte, São Paulo" },
			{ grupo: "mensal-ate-20", servico: "Contrato: até 5 equipamentos (visita semestral)", min: 350, max: 700, unidade: "por mês", fonte: "newclima", obs: "São Paulo" },
			{ grupo: "mensal-ate-20", servico: "Contrato: 6 a 20 equipamentos (visita trimestral)", min: 700, max: 2000, unidade: "por mês", fonte: "newclima", obs: "São Paulo" },
			{ grupo: "mensal-ate-20", servico: "Contrato comercial até 20 equipamentos (elaboração + execução)", min: 800, max: 2500, unidade: "por mês", fonte: "watt", obs: "São Paulo" },
			{ grupo: "mensal-mais", servico: "Contrato: 21 a 50 equipamentos (visita mensal)", min: 2000, max: 4500, unidade: "por mês", fonte: "newclima", obs: "São Paulo" },
			{ grupo: "mensal-mais", servico: "Contrato: acima de 50 equipamentos", min: 4500, max: null, unidade: "por mês", fonte: "newclima", obs: "São Paulo" },
			{ grupo: "mensal-mais", servico: "Contrato com mais de 20 equipamentos", min: 2500, max: null, unidade: "por mês", fonte: "watt", obs: "São Paulo" },
			{ grupo: "por-equip", servico: "PMOC cobrado por equipamento", min: 50, max: 100, unidade: "por equipamento/mês", fonte: "watt", obs: "depende da capacidade; São Paulo" },
			{ grupo: "exemplo", servico: "Exemplo da fonte: 1 a 10 equipamentos", min: 80, max: 80, unidade: "por equipamento/mês", fonte: "meupmoc", obs: "a própria fonte diz que é só referência ilustrativa", ilustrativo: true },
			{ grupo: "exemplo", servico: "Exemplo da fonte: 21 a 30 equipamentos", min: 60, max: 60, unidade: "por equipamento/mês", fonte: "meupmoc", obs: "a própria fonte diz que é só referência ilustrativa", ilustrativo: true },
			{ grupo: "trt", servico: "TRT (Termo de Responsabilidade Técnica) em 2026", min: 68.17, max: 68.17, unidade: "por TRT", fonte: "cft-trt", obs: "valor do conselho; o do ART (engenheiro, Crea) você confere na tabela vigente do seu Crea" },
		],
		secoes: [
			{
				titulo: "Antes do preço: quem precisa de PMOC",
				paragrafos: [
					"A Lei nº 13.589/2018 determina que edifícios de uso público e coletivo com ambientes climatizados artificialmente tenham um Plano de Manutenção, Operação e Controle (PMOC) dos sistemas de climatização. Escritório, clínica, escola, academia, loja e restaurante entram nessa conta. Para entender a obrigação inteira antes de propor, veja o guia sobre PMOC e a Lei 13.589.",
				],
			},
			{
				titulo: "O que entra no preço de um contrato de PMOC",
				paragrafos: [
					"Contrato de PMOC não é só limpeza com outro nome. Quem precifica bem separa cinco custos e deixa cada um visível para si mesmo, mesmo que a proposta mostre uma mensalidade só:",
				],
				itens: [
					"as visitas: horas por aparelho, vezes a periodicidade do plano no ano;",
					"os materiais de cada visita;",
					"o deslocamento: quilômetros vezes o número de visitas;",
					"a parte técnica do PMOC: elaboração do plano, horas do responsável técnico (ou o honorário dele, se terceirizado) e o registro de responsabilidade técnica (ART ou TRT);",
					"se o contrato incluir mão de obra de chamados corretivos, uma reserva de horas para eles.",
				],
			},
			{
				titulo: "Por que o valor por equipamento cai com o tamanho do contrato",
				paragrafos: [
					"Deslocamento, responsável técnico e registro são custos que se dividem pelo número de aparelhos. Num contrato pequeno eles pesam mais por aparelho, e por isso as fontes mostram valor por equipamento mais alto em contratos pequenos e mais baixo nos grandes. Se você cobra o mesmo valor por aparelho nos dois casos, num deles está perdendo dinheiro.",
				],
			},
			{
				titulo: "Contrato escrito protege você e o cliente",
				paragrafos: [
					"Escreva o que está incluído (preventiva, PMOC, quantos chamados por ano), o que não está (peças, chamados além da franquia), a mensalidade, a data de vencimento, o prazo e o índice de reajuste anual. O Código de Defesa do Consumidor (art. 40) pede orçamento prévio discriminado quando o cliente é consumidor; para empresa, o contrato escrito evita o mesmo tipo de discussão.",
				],
			},
		],
		faq: [
			{
				q: "Quanto cobrar por um contrato de PMOC?",
				a: "Nas fontes públicas de 2026 para São Paulo, contratos até 20 equipamentos aparecem de R$ 350 a R$ 2.500 por mês, conforme porte e frequência de visitas; acima de 20 equipamentos, a partir de R$ 2.000 a R$ 2.500. Outra forma comum é cobrar por equipamento, de R$ 50 a R$ 100 ao mês. São referências, não tabela oficial.",
			},
			{
				q: "Quanto cobrar pela elaboração do PMOC?",
				a: "Uma fonte de São Paulo (junho de 2026) aponta de R$ 500 a R$ 1.500 como taxa única de elaboração do documento, para qualquer porte. Some a isso o registro de responsabilidade técnica: o TRT custa R$ 68,17 em 2026, segundo a Resolução CFT nº 282/2025. O valor da ART você confere na tabela do seu Crea.",
			},
			{
				q: "Vale cobrar PMOC por equipamento?",
				a: "Serve para comparar e explicar ao cliente, mas deve ser resultado da sua conta, não o ponto de partida. Um piso-teto leva mais tempo que um hi-wall, a distância muda o deslocamento e o custo do responsável técnico pesa mais em contrato pequeno.",
			},
			{
				q: "Essa tabela é preço oficial?",
				a: "Não. Não existe tabela oficial de preço de PMOC. As faixas vêm de páginas públicas de empresas de São Paulo e de um guia que se declara ilustrativo; o TRT é o único valor oficial citado, e vem da resolução do conselho. Preço em outra cidade pode ser bem diferente.",
			},
		],
		fontes: [FONTE_NEWCLIMA, FONTE_WATT, FONTE_MEUPMOC, FONTE_CFT, FONTE_LEI_PMOC, FONTE_CDC],
		leiaTambem: [
			{ href: "/blog/pmoc-quem-e-obrigado-lei-13589/", texto: "PMOC: quem é obrigado, o que o plano precisa ter" },
			{ href: "/quanto-cobrar/limpeza-de-split/", texto: "Quanto cobrar por limpeza de split em 2026" },
			{ href: "/blog/como-calcular-sua-hora-tecnica/", texto: "Como calcular a sua hora técnica" },
		],
		ponteOlli:
			"A OLLI tem módulo de PMOC com etiqueta QR por equipamento e histórico de cada máquina, e o mesmo cliente vira orçamento, ordem de serviço e recibo. O módulo ajuda a organizar o contrato; ele não substitui o responsável técnico nem emite a ART ou o TRT.",
	},
];

export const SLUGS_QC = PAGINAS_QC.map((p) => p.slug);
export const AVISO_FAIXA = aviso;
