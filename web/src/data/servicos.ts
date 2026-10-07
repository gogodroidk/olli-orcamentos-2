/**
 * servicos.ts — os 3 pacotes do "segundo andar" (serviços com IA). Fonte única da página /servicos/.
 *
 * ORIGEM: Entregas Claude/OLLI/2026-10-07-trabalho/OFERTA-3-PACOTES.md (Bruno, 07/10/2026).
 * Os preços são SUGESTÃO ainda não aprovada pelo Igor (PENDENTES-IGOR, item 2): antes de
 * publicar em produção, confirme os valores aqui. `PRECOS_APROVADOS` trava a exibição:
 * enquanto for false, a página mostra "sob consulta" no lugar do valor.
 *
 * Honestidade (parecer LEGAL + docs de demo): o WhatsApp de atendimento só é prometido quando o
 * número da Meta estiver CONNECTED; sem promessa de "captar clientes" nem de resultado.
 */

export const PRECOS_APROVADOS = false;

export interface Pacote {
	id: "presenca" | "atendimento" | "sistema";
	nome: string;
	/** Valor em reais inteiros. */
	preco: number;
	prazoDiasUteis: number;
	suporteDias: number;
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
		preco: 5000,
		prazoDiasUteis: 10,
		suporteDias: 30,
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
		preco: 9000,
		prazoDiasUteis: 15,
		suporteDias: 45,
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
		preco: 15000,
		prazoDiasUteis: 30,
		suporteDias: 60,
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
	"Mensagens do WhatsApp oficial (API da Meta) além da franquia gratuita mensal do número, quando o pacote usar a API.",
	"Promessa de captar X clientes: entregamos a estrutura, não o resultado de vendas.",
];

export const CONDICOES = [
	"50% na assinatura por Pix e 50% na entrega.",
	"1 rodada de ajuste incluída.",
	"Contrato assinado antes de começar.",
];

export const AVISO_REGULADAS =
	"Advocacia, clínicas e consultórios: o conteúdo segue as regras de publicidade da OAB, do CFM e do CRO, e quem revisa e responde pelo texto é o profissional. Não usamos dado de cliente real nas demonstrações.";
