/**
 * O que o cartão de um plano mostra, dado o estado da assinatura. Regra pura e testada.
 *
 * Bug de 06/10/2026 (E2E de produção): quem envia o 1º orçamento ganha 14 dias de Pro (teste). Nesse
 * período `planoEfetivo === "pro"`, e o cartão do Pro virava "Seu plano atual" DESABILITADO — sem
 * "Assinar Pro" e sem "Pagar com Pix". O plano que vende (Pro) só podia ser pago DEPOIS que o teste
 * acabava, justamente quando a pessoa já tinha perdido o hábito. Só o Empresa tinha botão de Pix.
 *
 * Regra: "plano atual" travado = plano PAGO vigente (ou liberado por admin). Teste NÃO trava: o cartão
 * segue marcado ("Teste ativo") mas com os botões de pagar. Leitura que falhou (`atual === null`) nunca
 * marca nada como atual (erro nunca vira valor).
 */
export type EstadoCard = "travado_atual" | "teste_pode_assinar" | "pode_assinar" | "nao_marcar";

export function estadoDoCardPlano(opcoes: {
	/** `true`/`false` quando sabemos o plano efetivo; `null` quando a leitura falhou. */
	atual: boolean | null;
	/** O acesso deste plano vem de um TESTE (sem cobrança), não de pagamento. */
	emTeste: boolean;
}): EstadoCard {
	if (opcoes.atual === null) return "nao_marcar";
	if (opcoes.atual && opcoes.emTeste) return "teste_pode_assinar";
	if (opcoes.atual) return "travado_atual";
	return "pode_assinar";
}
