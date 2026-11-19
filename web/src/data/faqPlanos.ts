/**
 * FAQ de decisão da página de preços. Mesmas respostas que já estavam em
 * planos.astro — extraídas para /perguntas/ usar o mesmo texto, sem segunda redação.
 */
import {
	DESCONTO_ANUAL_ROTULO,
	PRECO_PRO,
	reais,
} from "./planos";
import { PIX_PLANO_LIGADO } from "./pix";
import { FRASE_GRATIS, IA_USOS_GRATIS_MES } from "./recursos";

export function faqPlanos() {
	const proMensal = reais(PRECO_PRO.mensalCentavos);
	const proAnualPorMes = reais(PRECO_PRO.anualPorMesCentavos);
	const proAnualTotal = reais(PRECO_PRO.anualCentavos);
	const proEconomia = reais(PRECO_PRO.economiaAnualCentavos);
	const parceladoCentavos = PRECO_PRO.parceladoCentavos;
	const parcelaCentavos = PRECO_PRO.parcelaCentavos;
	const doze =
		parceladoCentavos !== null && parcelaCentavos !== null
			? {
					parcela: reais(parcelaCentavos),
					total: reais(parceladoCentavos),
					aMais: reais(parceladoCentavos - PRECO_PRO.anualCentavos),
				}
			: null;

	return [
		{
			q: "O plano Grátis acaba depois de um tempo?",
			a: `Não. O Grátis é permanente, com ${FRASE_GRATIS}; rascunhos, ordem de serviço, recibos, clientes e histórico também ficam sem limite, e a IA tem ${IA_USOS_GRATIS_MES} usos mensais. Depois do primeiro envio, há um teste Pro opcional de 14 dias, sem cartão e sem cobrança automática.`,
		},
		{
			q: "Preciso de cartão de crédito para começar?",
			a: PIX_PLANO_LIGADO
				? "Não. Tanto o Grátis permanente quanto o teste Pro opcional de 14 dias começam sem cartão, e o teste não renova nem cobra automaticamente. Na hora de assinar um plano pago, você escolhe: cartão ou Pix."
				: "Não. Tanto o Grátis permanente quanto o teste Pro opcional de 14 dias começam sem cartão. Só pedimos cartão quando você decide assinar um plano pago pela Stripe; o teste não renova nem cobra automaticamente.",
		},
		...(PIX_PLANO_LIGADO
			? [
					{
						q: "Dá pra pagar com Pix?",
						a: "Dá. O Pro e o Empresa podem ser pagos por Pix, pelo mesmo preço do cartão, por 1 mês ou por 1 ano. O Pix não renova sozinho: perto do vencimento a OLLI avisa, e você paga de novo só se quiser continuar — sem cartão cadastrado e sem nada para cancelar. O pagamento é feito pelo navegador, na tela de Planos.",
					},
				]
			: []),
		{
			q: "Posso cancelar quando quiser?",
			a: `Pode, a qualquer momento, pelo portal de assinatura da Stripe dentro do app — sem multa e sem falar com ninguém. Você continua com o plano pago até o fim do período que já pagou; depois a conta volta ao Grátis.${PIX_PLANO_LIGADO ? " Quem pagou por Pix não tem o que cancelar: o período pago termina e a conta volta ao Grátis do mesmo jeito." : ""} Nos 7 primeiros dias vale ainda o direito de arrependimento (art. 49 do Código de Defesa do Consumidor).`,
		},
		{
			q: "O que acontece com meus dados se eu parar de pagar?",
			a: "Nada é apagado. Ao cancelar, sua conta volta para o plano Grátis — orçamentos, clientes, histórico e documentos continuam lá. Você só perde os recursos do Pro/Empresa, não os seus dados. Eles só são removidos se você mesmo encerrar a conta: aí os itens vão para uma lixeira recuperável por 30 dias e depois são apagados de forma definitiva.",
		},
		{
			q: "Qual a diferença de pagar mensal ou anual?",
			a: `O anual sai ${DESCONTO_ANUAL_ROTULO} mais barato. No Pro, por exemplo, o mensal é ${proMensal}/mês; no anual o mês equivale a ${proAnualPorMes} (${proAnualTotal} no ano), uma economia de ${proEconomia}. O mensal você cancela quando quiser; o anual você paga uma vez e trava o desconto por 12 meses.`,
		},
		...(doze
			? [
					{
						q: "E o parcelamento em 12×?",
						a: `Dá pra parcelar o ano do Pro em 12× de ${doze.parcela} no cartão. Mas seja transparente com você mesmo: isso soma ${doze.total} — ${doze.aMais} a mais que o anual à vista. O 12× é comodidade de fluxo de caixa, não um desconto. Se o objetivo é economizar, o anual à vista é o melhor negócio.`,
					},
				]
			: []),
	];
}
