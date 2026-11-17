/**
 * ACEITE DE MARKETING (LGPD art. 7º I, 8º): caixa separada no cadastro, NUNCA pré-marcada, com texto próprio,
 * guardada em public.consentimentos (finalidade 'marketing') com data, origem e o texto exato que a pessoa viu.
 * Sem aceite registrado, só vai mensagem de serviço (conta, orçamento, cobrança que ela pediu). Não há aceite retroativo.
 *
 * Módulo puro (sem imports): o formulário e o teste usam as mesmas constantes.
 * QUALQUER mudança no texto sobe a versão — a prova guarda a versão e o texto que a pessoa viu.
 */

export const VERSAO_TEXTO_MARKETING = "marketing-v1";

export const TEXTO_MARKETING_V1 =
	"Quero receber novidades, dicas e ofertas do OLLI por e-mail e WhatsApp. " +
	"Posso cancelar quando quiser, pelo link de descadastro das mensagens ou falando com o suporte, e continuo usando o OLLI normalmente.";

export const ORIGEM_ACEITE_CADASTRO_PAINEL = "cadastro_painel";

const TEXTOS: Record<string, string> = { [VERSAO_TEXTO_MARKETING]: TEXTO_MARKETING_V1 };

/** Texto exato de uma versão; undefined se a versão não existe (não grava aceite sem texto conhecido). */
export function textoDaVersao(versao: string): string | undefined {
	return TEXTOS[versao];
}

export interface MarcadorAceite {
	versao: string;
	origem: string;
	aceito_em: string;
}

/** Vai em `options.data` do signUp. Caixa desmarcada => objeto vazio (nada é gravado, silêncio não é aceite). */
export function aceiteParaCadastro(marcado: boolean, agora: Date = new Date()): { marketing_aceite?: MarcadorAceite } {
	if (marcado !== true) return {};
	return {
		marketing_aceite: {
			versao: VERSAO_TEXTO_MARKETING,
			origem: ORIGEM_ACEITE_CADASTRO_PAINEL,
			aceito_em: agora.toISOString(),
		},
	};
}

/** Lê o marcador de user_metadata; qualquer forma inesperada vira null. */
export function lerMarcadorAceite(metadata: unknown): MarcadorAceite | null {
	if (!metadata || typeof metadata !== "object") return null;
	const m = (metadata as Record<string, unknown>).marketing_aceite;
	if (!m || typeof m !== "object") return null;
	const { versao, origem, aceito_em } = m as Record<string, unknown>;
	if (typeof versao !== "string" || typeof origem !== "string" || typeof aceito_em !== "string") return null;
	if (!textoDaVersao(versao)) return null;
	return { versao, origem, aceito_em };
}
