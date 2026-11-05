/**
 * Catálogo da aba Integrações (D1438-G14).
 *
 * Só entra o que custa zero para a OLLI. "Já no OLLI" aponta para uma tela que
 * existe. "Em breve" não tem ação: a página não pede senha, chave nem login.
 * O que cobra mensalidade ou taxa fica em FORA_DESTA_LEVA, fora da fila.
 */

export const ROTAS_INTEGRACAO = ["/orcamentos", "/agenda", "/dados", "/meu-negocio", "/recibos"] as const;

export type RotaIntegracao = (typeof ROTAS_INTEGRACAO)[number];

export type EstadoIntegracao = "disponivel" | "em_breve";

export type Integracao = {
	id: string;
	nome: string;
	resumo: string;
	detalhe: string;
	estado: EstadoIntegracao;
	/** 1 é a primeira a construir. Só os itens em breve têm número. */
	prioridade: number | null;
	custoOlli: "zero";
	rota?: RotaIntegracao;
	rotuloAcao?: string;
};

export type ForaDaLeva = {
	id: string;
	nome: string;
	motivo: string;
};

export const INTEGRACOES: readonly Integracao[] = [
	{
		id: "whatsapp",
		nome: "WhatsApp com mensagem pronta",
		resumo: "O OLLI abre o WhatsApp oficial com o texto pronto. Você lê e envia.",
		detalhe:
			"Funciona no orçamento, no cliente, no contrato e nos avisos de cobrança, pelo link wa.me. A OLLI não lê a conversa e não responde no seu lugar.",
		estado: "disponivel",
		prioridade: null,
		custoOlli: "zero",
		rota: "/orcamentos",
		rotuloAcao: "Abrir orçamentos",
	},
	{
		id: "agenda-arquivo",
		nome: "Google Agenda e arquivo .ics",
		resumo: "Cada compromisso pode ir para o Google Agenda ou sair num arquivo .ics.",
		detalhe:
			"Na Agenda, abra o compromisso e use Adicionar no Google Agenda ou Baixar evento (.ics). O arquivo abre no Google, na Apple e no Outlook. A conta Google não fica ligada o tempo todo.",
		estado: "disponivel",
		prioridade: null,
		custoOlli: "zero",
		rota: "/agenda",
		rotuloAcao: "Abrir a agenda",
	},
	{
		id: "planilha",
		nome: "Planilha e pacote dos seus dados",
		resumo: "Importe clientes, produtos e serviços com prévia, e exporte CSV ou JSON.",
		detalhe:
			"A Central de dados mostra o que vai mudar antes de gravar e não apaga a base ao importar. A exportação é um arquivo no seu computador.",
		estado: "disponivel",
		prioridade: null,
		custoOlli: "zero",
		rota: "/dados",
		rotuloAcao: "Abrir Central de dados",
	},
	{
		id: "pix",
		nome: "Chave Pix da sua empresa",
		resumo: "Você guarda a chave no cadastro. O dinheiro cai na sua conta.",
		detalhe:
			"Em Meu negócio, o campo Chave Pix explica que ela acompanha o recibo, a cobrança pelo WhatsApp e o orçamento aprovado. A OLLI não fica com esse valor.",
		estado: "disponivel",
		prioridade: null,
		custoOlli: "zero",
		rota: "/meu-negocio",
		rotuloAcao: "Cadastrar a chave",
	},
	{
		id: "google-avaliacao",
		nome: "Link de avaliação do Google",
		resumo: "Você cola o link do seu perfil. A OLLI não cria a ficha no Google.",
		detalhe:
			"O campo está em Meu negócio. Com o link salvo, o aplicativo do celular mostra Pedir avaliação no recibo e abre o WhatsApp. Neste painel o recibo ainda não tem esse botão.",
		estado: "disponivel",
		prioridade: null,
		custoOlli: "zero",
		rota: "/meu-negocio",
		rotuloAcao: "Colar o link",
	},
	{
		id: "nfse",
		nome: "Nota fiscal pronta para copiar",
		resumo: "O recibo junta os dados para o Emissor Nacional. A OLLI não emite a nota.",
		detalhe:
			"No menu do recibo, Preparar nota fiscal deixa cliente, serviço e valor para você conferir e colar no emissor gratuito do governo. Não há mensalidade de nota cobrada pela OLLI.",
		estado: "disponivel",
		prioridade: null,
		custoOlli: "zero",
		rota: "/recibos",
		rotuloAcao: "Abrir recibos",
	},
	{
		id: "rota-mapa",
		nome: "Rota até o cliente, neste painel",
		resumo: "O painel ainda não abre o mapa a partir do endereço.",
		detalhe:
			"O aplicativo de celular já abre o Google Maps com o endereço, sem chave paga. Aqui o atalho ainda não existe. Quando existir, será o link público de direções. A OLLI não contrata a API paga de mapas.",
		estado: "em_breve",
		prioridade: 1,
		custoOlli: "zero",
	},
	{
		id: "agenda-conta",
		nome: "Agenda ligada o tempo todo",
		resumo: "A conta Google não fica conectada. Um compromisso por vez já funciona.",
		detalhe:
			"Ligar a agenda inteira sozinha pediria login do Google, e esse login está desligado. Hoje cada visita entra pelo botão da Agenda ou pelo arquivo .ics. Esta tela não pede senha.",
		estado: "em_breve",
		prioridade: 2,
		custoOlli: "zero",
	},
	{
		id: "avaliacao-painel",
		nome: "Pedir avaliação a partir do recibo, neste painel",
		resumo: "O botão ainda não está no recibo do painel.",
		detalhe:
			"O cadastro do link já existe em Meu negócio. Falta, neste painel, o mesmo pedido que o celular faz: abrir o WhatsApp com o texto pronto. Não há login do Google da OLLI.",
		estado: "em_breve",
		prioridade: 3,
		custoOlli: "zero",
	},
	{
		id: "login-google-equipe",
		nome: "Funcionário entra com Google",
		resumo: "O convite por link continua valendo. Entrar com a conta Google ainda não.",
		detalhe:
			"A ideia é o funcionário usar o Google do e-mail do convite. Isso não está ligado, e esta tela não abre login. O convite da Equipe segue como está.",
		estado: "em_breve",
		prioridade: 4,
		custoOlli: "zero",
	},
	{
		id: "webhooks",
		nome: "Aviso para uma ferramenta sua",
		resumo: "O OLLI ainda não avisa outro sistema quando um orçamento é aprovado ou uma OS termina.",
		detalhe:
			"Quando existir, você indica um endereço seu. A OLLI não contrata Zapier, Make nem outro serviço, e não cobra mensalidade por este aviso. Nada é enviado hoje.",
		estado: "em_breve",
		prioridade: 5,
		custoOlli: "zero",
	},
	{
		id: "chave-ia",
		nome: "Sua chave de IA",
		resumo: "Ainda não dá para usar a chave da sua conta Claude, GPT ou Gemini.",
		detalhe:
			"A IA que já está no OLLI continua sendo a do aplicativo, com os créditos da sua conta. Uma chave sua, paga direto ao provedor, não está nesta tela. Ela não pede chave.",
		estado: "em_breve",
		prioridade: 6,
		custoOlli: "zero",
	},
];

export const FORA_DESTA_LEVA: readonly ForaDaLeva[] = [
	{
		id: "whatsapp-api",
		nome: "WhatsApp que lê e responde sozinho",
		motivo:
			"A API oficial cobra por mensagem e não acessa o WhatsApp pessoal. O caminho sem custo é a mensagem pronta no wa.me, que já está no OLLI.",
	},
	{
		id: "nfse-automatica",
		nome: "Emitir a NFS-e automática",
		motivo:
			"Os serviços que emitem a nota cobram mensalidade. O que existe sem esse custo é preparar os dados para o Emissor Nacional.",
	},
	{
		id: "maps-pago",
		nome: "Mapa e rota com API paga",
		motivo:
			"Geocoding e rota com trânsito do Google cobram. A OLLI não contrata isso. O atalho futuro é só o link público de direções.",
	},
	{
		id: "assinatura-digital-paga",
		nome: "Assinatura digital paga",
		motivo:
			"Plataformas de assinatura formal cobram por documento. O aceite do orçamento que já existe no OLLI não depende delas.",
	},
	{
		id: "cobranca-gateway",
		nome: "Cobrar o cliente por um gateway",
		motivo:
			"Boleto, cartão e Pix intermediado têm taxa do gateway. A chave Pix da sua conta, sem a OLLI no meio, é o caminho sem mensalidade.",
	},
];

export function listarDisponiveis(): Integracao[] {
	return INTEGRACOES.filter((item) => item.estado === "disponivel");
}

export function listarEmBreve(): Integracao[] {
	return INTEGRACOES.filter((item) => item.estado === "em_breve").sort(
		(a, b) => (a.prioridade ?? 0) - (b.prioridade ?? 0),
	);
}
