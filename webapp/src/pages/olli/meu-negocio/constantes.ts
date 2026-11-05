/**
 * Constantes de "Meu negócio".
 *
 * A paleta de cor é reexportada do módulo do app (`coresMarca`) — uma cópia
 * aqui divergia e o Ciano mentia o contraste. O resto (validade, garantia,
 * empresa em branco) continua cópia literal das telas do celular: o painel e
 * o app editam o MESMO objeto `Empresa` (blob `empresa.dados`).
 *
 * Fontes:
 *   src/utils/coresMarca.ts          → CORES_MARCA (reexportada, não copiada)
 *   src/screens/MeuNegocioScreen.tsx → empresaEmBranco / VALIDADES_PADRAO / GARANTIAS_PADRAO
 */
import type { Empresa } from "@dominio";

/* ─────────────────────────────  Cor da marca  ──────────────────────────────── */

/**
 * Paleta FECHADA — não é um color picker, e isso é decisão de produto.
 *
 * A amostra mostra a cor escolhida. O Ciano é claro de propósito: no PDF, se o
 * branco por cima não passar 4,5:1, `corMarcaNoPapel` escurece só o necessário.
 * Reexportada de `src/utils/coresMarca.ts` para o painel e o app não divergirem.
 */
export { CORES_MARCA, contrasteTextoSobre } from "../../../../../src/utils/coresMarca";

/* ───────────────────  Padrões que saem em todo orçamento  ──────────────────── */

/** Cópia de `VALIDADES_PADRAO` (MeuNegocioScreen). O default do app, quando vazio, é 15. */
export const VALIDADES_PADRAO = [7, 15, 30, 60] as const;

/** Default do app quando `validadeDiasPadrao` não foi escolhido (`?? 15` na tela do celular). */
export const VALIDADE_DIAS_DEFAULT = 15;

/**
 * Cópia de `GARANTIAS_PADRAO` (MeuNegocioScreen). O TEXTO é o que vai no PDF —
 * por isso ele é copiado inteiro, não "resumido": ele cita o art. 26 do CDC.
 */
export const GARANTIAS_PADRAO: readonly { dias: number; label: string; texto: string }[] = [
	{
		dias: 30,
		label: "30 dias",
		texto:
			"Garantia de 30 dias para peças e materiais não duráveis, conforme art. 26 do Código de Defesa do Consumidor (CDC).",
	},
	{
		dias: 90,
		label: "90 dias",
		texto:
			"Garantia de 90 dias para a mão de obra e materiais duráveis, conforme art. 26 do Código de Defesa do Consumidor (CDC).",
	},
	{
		dias: 365,
		label: "365 dias",
		texto: "Garantia estendida de 12 meses para mão de obra e materiais, superior ao mínimo legal do art. 26 do CDC.",
	},
];

/* ────────────────────────────  Empresa em branco  ──────────────────────────── */

/**
 * Cópia de `empresaEmBranco()` (MeuNegocioScreen). Toda string OBRIGATÓRIA do tipo
 * `Empresa` nasce como '' — nunca `undefined` —, senão o blob subiria com buracos e
 * o app do celular renderizaria "undefined" no cabeçalho do PDF.
 *
 * `id: 'empresa_1'` é o id fixo do app (a tabela local do celular guarda 1 linha; na
 * nuvem a chave é o `user_id`). Não inventar um uuid aqui: o app procura por este id.
 */
export function empresaEmBranco(): Empresa {
	return {
		id: "empresa_1",
		nome: "",
		especialidade: "",
		slogan: "",
		cnpj: "",
		cpf: "",
		endereco: "",
		cidade: "",
		estado: "",
		telefone: "",
		whatsapp: "",
		site: "",
		email: "",
		chavePix: "",
		normas: "",
		nomePrestador: "",
	};
}

/** Logo exibível na WEB. `file://` (câmera/galeria do celular) não renderiza no navegador. */
export function logoExibivel(uri: string | undefined): string | null {
	if (!uri) return null;
	return /^(data:|https?:\/\/)/i.test(uri.trim()) ? uri.trim() : null;
}
