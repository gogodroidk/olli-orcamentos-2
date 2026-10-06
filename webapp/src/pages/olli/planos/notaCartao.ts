/**
 * Nota sob o botão "Assinar" do painel: quais cartões o checkout aceita.
 *
 * Por quê (E2E de produção, 06/10/2026): o Checkout do Stripe abre com "Tipos de cartão aceitos: Visa e
 * Mastercard". Quem tem Elo, Hipercard, Amex ou só cartão de DÉBITO descobria isso DEPOIS de clicar, na
 * página do Stripe, sem saída — e o Pix (que funciona) ficava escondido atrás de outro botão.
 *
 * FONTE (lida em 06/10/2026): Stripe, "Accepted payment methods in Brazil" — contas do Stripe no Brasil
 * aceitam cartões de crédito Visa e Mastercard; Amex, Elo, Hipercard e outros esquemas locais NÃO são
 * suportados; Pix e Boleto são suportados, Pix sem recorrência.
 * https://support.stripe.com/questions/accepted-payment-methods-in-brazil
 * Se o Stripe passar a aceitar outras bandeiras, ESTE texto é o que muda (e o teste que o tranca).
 */
export function notaCartao(pixDisponivel: boolean): string {
	return pixDisponivel
		? "Cartão de crédito Visa ou Mastercard. Tem Elo, Hipercard ou só débito? Use “Pagar com Pix”."
		: "Cartão de crédito Visa ou Mastercard.";
}
