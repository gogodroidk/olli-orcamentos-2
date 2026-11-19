/**
 * REGRAS PURAS do degrau "orçou → enviou" no painel (CQ-ATIVACAO-LOTE1, achados 2 e 3).
 *
 * Por que existe: metade de quem cria orçamento no painel não envia (9 de 18, coorte 01/10–19/11).
 * Dois buracos: depois de criar, a pessoa caía na lista sem "agora envie"; e sem o WhatsApp do
 * cliente o envio parava num aviso vermelho, sem campo e sem link para mandar por conta própria.
 *
 * Aqui só mora a DECISÃO (testável no Node, sem React nem alias): a tela em
 * `pages/olli/orcamentos` usa estas funções.
 */
import { numeroParaWhatsApp } from "./linkWhatsApp.ts";

/** Como a pessoa quer mandar: abrir o WhatsApp com a mensagem ou copiar o link e mandar por fora. */
export type ModoEnvio = "whatsapp" | "link";

/**
 * O que fazer ao tocar em enviar. Só o WhatsApp precisa do número do cliente: "Copiar link"
 * funciona sem ele (a pessoa cola onde quiser). Número duvidoso pede o campo, nunca abre a
 * conversa de um desconhecido.
 */
export function proximoPassoDoEnvio(
	modo: ModoEnvio,
	telefoneDoCliente: string | null | undefined,
): "pedir_numero" | "preparar" {
	if (modo === "link") return "preparar";
	return numeroParaWhatsApp(telefoneDoCliente) ? "preparar" : "pedir_numero";
}

export type ConferenciaWhatsApp = { ok: true; digitos: string } | { ok: false; erro: string };

/**
 * Confere o WhatsApp digitado no diálogo de envio e, se estiver errado, diz O QUE consertar
 * (o usuário erra tudo: "inválido" sozinho não ajuda). Aceita máscara, espaço e +55.
 * `digitos` volta SEM o 55, pronto para a máscara `(11) 98123-4567`.
 */
export function conferirWhatsAppDigitado(texto: string): ConferenciaWhatsApp {
	let d = String(texto ?? "")
		.replace(/\D/g, "")
		.replace(/^0+/, "");
	if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
	if (d.length === 0) return { ok: false, erro: "Digite o WhatsApp do cliente com DDD. Ex.: (11) 98123-4567" };
	if (d.length === 8 || d.length === 9) {
		return { ok: false, erro: "Falta o DDD: digite os 2 números da cidade antes. Ex.: (11) 98123-4567" };
	}
	if (d.length !== 10 && d.length !== 11) {
		return { ok: false, erro: "Confira o número: são o DDD e mais 8 ou 9 números. Ex.: (11) 98123-4567" };
	}
	if (!/^[1-9][1-9]/.test(d)) return { ok: false, erro: "Esse DDD não existe. Confira os 2 primeiros números." };
	if (d.length === 11 && d[2] !== "9") {
		return { ok: false, erro: "Celular tem um 9 logo depois do DDD. Confira o número." };
	}
	if (!numeroParaWhatsApp(d)) return { ok: false, erro: "Confira o número: DDD + número. Ex.: (11) 98123-4567" };
	return { ok: true, digitos: d };
}

/**
 * Depois de "Criar orçamento", abre o passo "Enviar para o cliente"? SIM para todo orçamento
 * NOVO que nasce rascunho (não só o 1º): é o que o app já faz (cria → abre a tela do orçamento,
 * onde está o enviar), e enviar é sempre o próximo passo de um rascunho. Quem não quer enviar
 * agora fecha com 1 toque ("Agora não") ou Esc. Edição de orçamento existente não abre.
 */
export function abrePassoEnviarAposSalvar(ehNovo: boolean, status: string | null | undefined): boolean {
	return ehNovo && (status ?? "rascunho") === "rascunho";
}
