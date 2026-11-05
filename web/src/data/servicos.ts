/**
 * servicos.ts — os 3 pacotes do "segundo andar" (serviços com IA). Fonte única da página /servicos/.
 *
 * ORIGEM: oferta de 3 pacotes do comercial (07/10/2026), reescrita aqui (não é cópia do arquivo).
 * PREÇO NÃO É FIXO (decisão do Igor): cada proposta sai de uma pesquisa do negócio do cliente.
 * Por isso nenhum valor existe neste arquivo nem na página. Não reintroduza tabela de preço.
 * Prazo e suporte são estimativa, sem histórico de entrega nossa: a página os mostra como
 * "previsto", e quem fecha é a proposta.
 *
 * `PAGINA_PUBLICADA` é o portão: false = a página é noindex e fora do sitemap. Só vira true com
 * LEGAL e QA liberados e ordem do Igor (merge na main publica o site).
 *
 * O WhatsApp é o do segundo andar (final 07). Não é o 7487 do app de orçamentos.
 */

export const PAGINA_PUBLICADA = false;

/** WhatsApp do segundo andar (final 07). Só dígitos, com DDI. */
export const WHATSAPP_SERVICOS = "5511960163507";
export const WHATSAPP_SERVICOS_LEGIVEL = "(11) 96016-3507";
export const WHATSAPP_SERVICOS_MENSAGEM =
	"Olá! Vim pela página de serviços da OLLI e quero um diagnóstico do meu negócio.";

export interface Pacote {
	id: "presenca" | "atendimento" | "sistema";
	nome: string;
	prazoPrevistoDiasUteis: number;
	suportePrevistoDias: number;
	paraQuem: string;
	/** O que entrega, sem herança: "inclui" aponta o pacote anterior. */
	inclui?: string;
	entrega: string[];
	destaque?: boolean;
}

export const PACOTES: Pacote[] = [
	{
		id: "presenca",
		nome: "Presença profissional",
		prazoPrevistoDiasUteis: 10,
		suportePrevistoDias: 30,
		paraQuem: "Quem vive de indicação e não aparece online.",
		entrega: [
			"Site de até 5 páginas no seu domínio",
			"Google Meu Negócio ajustado",
			"WhatsApp Business configurado",
			"Formulário de contato",
		],
	},
	{
		id: "atendimento",
		nome: "Atendimento automático",
		prazoPrevistoDiasUteis: 15,
		suportePrevistoDias: 45,
		paraQuem: "Quem perde cliente por demora de resposta.",
		inclui: "Presença profissional",
		entrega: [
			"Saudação e triagem por assunto no WhatsApp",
			"Agendamento e lembrete",
			"Respostas a dúvidas frequentes com IA",
			"Passagem para uma pessoa quando a conversa pede",
		],
		destaque: true,
	},
	{
		id: "sistema",
		nome: "Sistema sob medida",
		prazoPrevistoDiasUteis: 30,
		suportePrevistoDias: 60,
		paraQuem: "Quem opera em planilha ou caderno e quer processo.",
		inclui: "Atendimento automático",
		entrega: [
			"Painel próprio: clientes, agenda, propostas/orçamentos e status",
			"1 integração à sua escolha (agenda, Pix ou e-mail)",
		],
	},
];

export const NAO_INCLUSO = [
	"Domínio e hospedagem (repassados a você, pagos direto ao fornecedor).",
	"Mensagens do WhatsApp oficial (API da Meta) acima da franquia gratuita mensal, quando o pacote usar a API.",
	"Promessa de captar X clientes: entregamos a estrutura, não o resultado de vendas.",
];

export const CONDICOES = [
	"O valor é definido na proposta, depois do diagnóstico do seu negócio. Não há tabela fixa.",
	"Você só paga depois de aprovar a proposta por escrito. Sem taxa escondida.",
	"Escopo, prazo, forma de pagamento e rodada de ajuste ficam por escrito na proposta, antes de você pagar qualquer coisa.",
];

export const AVISO_REGULADAS =
	"Advocacia, clínicas, consultórios e outras profissões regulamentadas: a OLLI cuida do site, do atendimento e da parte técnica, e orienta o conteúdo pelas regras do seu conselho (OAB, CFM, CRO e outros), mas quem revisa, aprova e responde pelo que é publicado é o profissional. Não prometemos resultado, não fazemos captação de clientes em nome do profissional e não usamos dados de clientes ou pacientes reais em demonstrações.";
