/**
 * FAQ do site v10 (home, planos, dúvidas). UMA lista: a tela e o FAQPage (JSON-LD) saem do mesmo array, então o schema
 * nunca diz o que a página não diz. Respostas que citam plano, preço ou limite são MONTADAS da fonte (data/site.ts).
 *
 * Fora desta lista, de propósito: "O OLLI não oferece exportação de dados" (v10, duvidas) — não confere com nenhuma
 * fonte e é matéria de LGPD (portabilidade); volta só com parecer do LEGAL e confirmação do produto.
 */
import { planoBase, IA_USOS_GRATIS_MES } from "./recursos";
import { FRASE_PIX_LINK, GRATIS_ORC, GRATIS_SEM, PIX, PRECO, SELO, TRIAL_DIAS } from "./site";

export interface Faq {
	id: string;
	q: string;
	a: string;
}

const semPonto = (t: string) => t.replace(/\.$/, "");
/** Minúscula na primeira letra, exceto sigla (PMOC) — "pMOC" seria erro de texto. */
const minuscula = (t: string) => (/^[A-ZÀ-Ý]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
const bulletEmpresa = (trecho: string) => planoBase("empresa").bullets.find((b) => b.texto.includes(trecho) && !b.emBreve)?.texto;
/** "vários técnicos e permissões por papel, PMOC e contratos de manutenção" — só o que a fonte diz que o Empresa tem. */
const equipeEmpresa = [bulletEmpresa("técnicos"), bulletEmpresa("PMOC")].filter((x): x is string => !!x).map((t) => minuscula(semPonto(t)));
const fraseEquipe = equipeEmpresa.length ? `Sim. O plano Empresa inclui ${equipeEmpresa.join("; ")}.` : "Sim, com o plano Empresa.";
const fraseAprova = `Ele abre o link do orçamento e aprova ali.${FRASE_PIX_LINK ? ` ${FRASE_PIX_LINK}` : ""}`;

export const FAQ: Record<string, Faq> = {
	cartao: {
		id: "cartao",
		q: "Preciso de cartão para começar?",
		a: `Não. O plano Grátis é ${GRATIS_SEM}.`,
	},
	limite: {
		id: "limite",
		q: "O plano Grátis tem limite de orçamentos?",
		a: `Sim: ${GRATIS_ORC}, em PDF, link ou WhatsApp, com o selo discreto “${SELO}”. Rascunhos, clientes e histórico não têm limite.`,
	},
	plataformas: {
		id: "plataformas",
		q: "Funciona no celular e no computador?",
		a: "Sim, com a mesma conta. O app Android está na Google Play. No iPhone e no computador, você usa pelo navegador.",
	},
	aprova: {
		id: "aprova",
		q: "Como o cliente aprova e paga?",
		a: fraseAprova,
	},
	equipe: {
		id: "equipe",
		q: "Posso usar com uma equipe?",
		a: fraseEquipe,
	},
	anual: {
		id: "anual",
		q: "O valor anual é cobrado todo mês?",
		a: `Não. A cobrança é anual: ${PRECO.proAno} no Pro ou ${PRECO.empresaAno} no Empresa. Os equivalentes de ${PRECO.proAnoPorMes} e ${PRECO.empresaAnoPorMes} por mês servem para comparar os períodos; não são mensalidades do plano anual.`,
	},
	teste: {
		id: "teste",
		q: "Dá para testar o Pro antes de pagar?",
		a: `Depois do primeiro envio, você pode ativar ${TRIAL_DIAS} dias de Pro, sem cartão e sem cobrança automática.`,
	},
	custo: {
		id: "custo",
		q: "Quanto custam os planos pagos?",
		a: `O Pro custa ${PRECO.proMes}/mês ou ${PRECO.proAno}/ano. O Empresa custa ${PRECO.empresaMes}/mês ou ${PRECO.empresaAno}/ano. A cobrança anual tem ${PRECO.desconto} de desconto em relação a doze mensalidades.${PIX ? " Pro e Empresa também podem ser pagos no Pix, pelo mesmo preço, por 1 mês ou 1 ano, sem renovação automática." : ""}`,
	},
	ia: {
		id: "ia",
		q: "A Oli é uma inteligência artificial?",
		a: `Sim. A Oli é a assistente de IA do app e apoia o diagnóstico. No Grátis, são até ${IA_USOS_GRATIS_MES} usos por mês para esse apoio. Revise as orientações antes de aplicá-las ao atendimento.`,
	},
	offline: {
		id: "offline",
		q: "O que funciona sem internet?",
		a: "No app Android, a consulta de códigos de erro funciona offline; no navegador é preciso estar online. Isso não significa que todos os recursos do app estejam disponíveis sem conexão.",
	},
	pmoc: {
		id: "pmoc",
		q: "O que é o PMOC do plano Empresa?",
		a: "PMOC significa Plano de Manutenção, Operação e Controle. No OLLI, você cadastra os equipamentos e organiza o plano de manutenção de cada um, com a última e a próxima manutenção. A etiqueta com QR code permite consultar essas informações e pedir um orçamento.",
	},
	nota: {
		id: "nota",
		q: "O recibo substitui uma nota fiscal?",
		a: "Não. O OLLI não emite nota fiscal, e o recibo não substitui o documento fiscal exigido para o seu serviço.",
	},
	backup: {
		id: "backup",
		q: "Há cópia dos dados e exclusão da conta?",
		a: "Há cópia automática na nuvem, e você pode excluir sua conta pelo próprio app.",
	},
};

export const FAQ_HOME = ["cartao", "limite", "plataformas", "aprova", "equipe"].map((k) => FAQ[k]);
export const FAQ_PLANOS = ["cartao", "anual", "teste", "aprova", "equipe", "pmoc"].map((k) => FAQ[k]);
export const FAQ_DUVIDAS = ["cartao", "limite", "custo", "teste", "plataformas", "aprova", "ia", "offline", "nota", "equipe", "backup"].map((k) => FAQ[k]);

/** FAQPage serializado do MESMO array que a página renderiza. */
export function schemaFaq(itens: Faq[]) {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: itens.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
	};
}
