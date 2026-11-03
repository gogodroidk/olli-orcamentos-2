/**
 * Textos da home e das páginas institucionais.
 *
 * Copiados das páginas que já estavam no ar (home e llms.txt). Nada aqui é
 * recurso, número, prazo ou garantia novos: se a frase não estava publicada,
 * ela não entra.
 */
import { OFICIOS, TOTAL_CALCULADORAS } from "./oficios";
import { PRECO_EMPRESA, PRECO_PRO, reais } from "./planos";
import { PIX_PLANO_LIGADO } from "./pix";
import { FRASE_GRATIS } from "./recursos";

export const APP_URL = "https://app.olliorcamentos.online";
export const APP_CADASTRO_URL = `${APP_URL}/auth/login?modo=cadastro`;
export const GOOGLE_PLAY_TESTE_URL = "https://play.google.com/apps/testing/online.olliorcamentos.app";

export const RECURSOS = [
	{
		icon: "file-text",
		titulo: "Orçamento profissional em minutos",
		texto: "Itens, quantidades, fotos, desconto e sua marca num PDF pronto, com link para o cliente aprovar.",
	},
	{
		icon: "clipboard-list",
		titulo: "Ordem de serviço",
		texto: "Vire o orçamento em OS com checklist por ofício e assinatura do cliente na tela.",
	},
	{
		icon: "brain",
		titulo: "IA que entende o defeito",
		texto: "Diagnóstico de climatização por sintoma ou código de erro — não é só nota fiscal.",
	},
	{
		icon: "calendar-check",
		titulo: "PMOC (Lei 13.589)",
		texto: "Planos de manutenção, lembretes e documento de responsabilidade (ART) — a papelada da climatização resolvida.",
	},
	{
		icon: "users",
		titulo: "Clientes e cobrança",
		texto: "Cadastro, histórico e radar de quem sumiu ou está para cobrar.",
	},
	{
		icon: "calculator",
		titulo: "Calculadoras de ofício",
		texto: "BTU, carga de gás, caixa d'água, tinta, disjuntor… as contas do dia a dia, aterradas em norma.",
	},
	{
		icon: "calendar",
		titulo: "Agenda e equipe",
		texto: "Agendamentos, técnicos com papéis e permissões, e o trabalho de todo mundo num lugar só.",
	},
	{
		icon: "receipt",
		titulo: "Recibo e PDF bonito",
		texto: "Recibo e documentos com a sua marca — do orçamento ao comprovante, sem planilha.",
	},
] as const;

export const PASSOS = [
	{
		n: "01",
		titulo: "Receba o pedido",
		texto: "O cliente explica o serviço pelo canal de sempre. Você organiza tudo na OLLI, sem deixar preço, foto e condição perdidos na conversa.",
	},
	{
		n: "02",
		titulo: "Crie um orçamento profissional",
		texto: "Monte itens, preços, fotos e condições em minutos, com a sua marca e as ferramentas do seu serviço.",
	},
	{
		n: "03",
		titulo: "Envie e acompanhe",
		texto: "Compartilhe o link pelo WhatsApp. O cliente aprova, e você transforma o orçamento em OS e recibo, com tudo guardado.",
	},
] as const;

const CALCULADORAS_POR_OFICIO = OFICIOS.filter((o) => o.calculadoras > 0)
	.map((o) => `${o.calculadoras} de ${o.label.toLowerCase()}`)
	.join(", ");

/** Perguntas que já estavam na home, na mesma redação. */
export function faqProduto() {
	return [
		{
			q: "Preciso pagar para testar?",
			a: `Não. O plano Grátis é permanente, com ${FRASE_GRATIS}; rascunhos, recibos, clientes e histórico também ficam sem limite. Depois do primeiro envio, você pode ativar 14 dias de Pro sem cartão e sem cobrança automática.`,
		},
		{
			q: "Funciona no celular e no computador?",
			a: "Sim. A OLLI roda no navegador do celular e do computador. O aplicativo existe somente para Android e está em teste fechado, com instalação restrita a testadores selecionados; ainda não há aplicativo para iPhone/iOS nesta versão.",
		},
		{
			q: "Serve pro meu ofício?",
			a: "Climatização, elétrica, hidráulica, pintura, dedetização, jardinagem e mais. Você escolhe o ofício e a OLLI mostra só as ferramentas que fazem sentido pra você.",
		},
		{
			q: "Meus dados ficam seguros?",
			a: "Sim. Seus dados são seus, guardados na nuvem com isolamento por conta. Você pode exportar e excluir quando quiser.",
		},
		{
			q: "Quanto custa um app de orçamento?",
			a: `Na OLLI: ${reais(0)} no plano Grátis, sem prazo pra acabar. O Pro custa ${reais(PRECO_PRO.mensalCentavos)}/mês e o Empresa ${reais(PRECO_EMPRESA.mensalCentavos)}/mês, com desconto no anual. O preço está na página de preços, sem consultor no meio, e o Grátis não é teste de 7 dias.`,
		},
		{
			q: "Existe app grátis de ordem de serviço?",
			a: "Sim — o plano Grátis da OLLI faz ordem de serviço sem limite, com checklist, fotos e assinatura do cliente na tela. Não é teste de 7 dias: é grátis sem prazo, sem cartão e sem fidelidade. O PDF do Grátis sai com uma marca discreta da OLLI, que some no Pro.",
		},
		{
			q: "Serve pra eletricista, encanador ou pintor?",
			a: `Serve. A OLLI tem ${TOTAL_CALCULADORAS} calculadoras de campo divididas por ofício — ${CALCULADORAS_POR_OFICIO} — e mostra só as do seu. Ofício fora da lista continua usando orçamento, OS e recibo normalmente.`,
		},
		{
			q: "O que é PMOC e quem é obrigado a ter?",
			a: "PMOC é o Plano de Manutenção, Operação e Controle exigido pela Lei 13.589/2018 de quem opera ambientes climatizados de uso coletivo. Na OLLI o PMOC é um módulo pronto: inventário dos equipamentos, etiqueta QR por máquina e as ordens de manutenção geradas na periodicidade certa.",
		},
		{
			q: "Funciona sem internet, no meio do serviço?",
			a: "Depende de onde você usa. No aplicativo Android (em teste fechado), orçamento, cliente e OS ficam guardados no próprio celular e sincronizam quando a rede volta. Pelo navegador — no celular ou no computador — a OLLI precisa de internet.",
		},
		...(PIX_PLANO_LIGADO
			? [
					{
						q: "Posso pagar o plano com Pix?",
						a: "Pode. O Pro e o Empresa podem ser pagos por Pix, pelo mesmo preço do cartão, por 1 mês ou 1 ano. O Pix não renova sozinho: perto do vencimento a OLLI avisa, e você paga de novo só se quiser continuar. O pagamento é feito pelo navegador, na tela de Planos.",
					},
				]
			: []),
	];
}
