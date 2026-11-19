/**
 * CQ-DEGRAU-1O-ORCAMENTO — o orçamento de exemplo da ativação não trava no nome do cliente.
 *
 * Dado (banco, cadastros de 01/10 a 19/11/2026, sem contas internas): das 43 contas que nunca
 * orçaram, 30 abriram o editor de orçamento novo (quase todas pelo cartão "Seu primeiro orçamento
 * em 1 minuto") e 21 tiveram ali o ÚLTIMO evento. O exemplo já chega com itens e valores; o que
 * falta para salvar é o campo "Cliente" (obrigatório, no topo, vazio).
 *
 * Com a chave LIGADA, só no exemplo de um orçamento NOVO e só com o nome vazio, o rascunho é salvo
 * como "Cliente do exemplo". O resto não muda: enviar pelo WhatsApp continua exigindo cliente
 * cadastrado com número (useEnviarWhatsApp). Chave desligada = comportamento de hoje.
 *
 * Chave: VITE_DEGRAU_1O_ORCAMENTO. Só "1" ou "true" liga; ausente/qualquer outro valor = desligada.
 */

export const NOME_CLIENTE_EXEMPLO = "Cliente do exemplo";

/** Frase extra no aviso do exemplo, só com a chave ligada (transparência: a pessoa sabe o que acontece). */
export const AVISO_NOME_EXEMPLO = `Sem nome agora? Salvamos como “${NOME_CLIENTE_EXEMPLO}” e você troca antes de enviar.`;

export function chaveDegrauLigada(valor: string | undefined | null): boolean {
	const v = (valor ?? "").trim().toLowerCase();
	return v === "1" || v === "true";
}

/** true = salvar com NOME_CLIENTE_EXEMPLO em vez de barrar "Informe o cliente". */
export function usarNomeDoExemplo(p: {
	ligada: boolean;
	exemplo: boolean;
	ehNovo: boolean;
	clienteNome: string;
}): boolean {
	return p.ligada && p.exemplo && p.ehNovo && !p.clienteNome.trim();
}
