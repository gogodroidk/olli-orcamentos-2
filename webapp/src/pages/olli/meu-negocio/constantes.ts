/**
 * Constantes de "Meu negócio" — CÓPIA LITERAL das do app do celular.
 *
 * Nada aqui foi escrito de memória: cada bloco tem a linha do arquivo-fonte. O
 * painel e o app editam o MESMO objeto `Empresa` (blob `empresa.dados`), então uma
 * divergência aqui não é "estilo diferente" — é o mesmo dono vendo duas empresas
 * diferentes conforme onde abriu a tela.
 *
 * Fontes:
 *   src/utils/coresMarca.ts          → CORES_MARCA (paleta testada)
 *   src/screens/MeuNegocioScreen.tsx → empresaEmBranco / VALIDADES_PADRAO / GARANTIAS_PADRAO
 */
import type { Empresa } from "@dominio";

/* ─────────────────────────────  Cor da marca  ──────────────────────────────── */

/**
 * Paleta FECHADA — não é um color picker, e isso é decisão de produto.
 *
 * A cor da marca pinta o cabeçalho do PDF que vai para o cliente, com texto BRANCO
 * por cima. Um picker livre deixa o usuário escolher amarelo, e o orçamento sai
 * ilegível — o dono só descobre quando o cliente reclama. Estas 8 cores foram
 * escolhidas por já terem contraste suficiente com branco.
 *
 * Cópia de `CORES_MARCA` (src/utils/coresMarca.ts). Se lá mudar, mude aqui.
 */
export interface CorMarca {
	label: string;
	value: string;
}

export const CORES_MARCA: readonly CorMarca[] = [
	{ label: "Azul", value: "#0B6FCE" },
	{ label: "Verde", value: "#0E7C66" },
	{ label: "Terracota", value: "#B4451F" },
	{ label: "Roxo", value: "#5B3DA8" },
	{ label: "Grafite", value: "#1C2230" },
	{ label: "Ciano", value: "#19D3E6" },
	{ label: "Marrom", value: "#8B5E34" },
	{ label: "Vinho", value: "#8B2942" },
];

/**
 * Branco ou escuro sobre a cor? Luminância relativa (aproximação de WCAG) — cópia de
 * `contrasteTextoSobre` (src/utils/coresMarca.ts). Usado só no ✓ do swatch selecionado.
 */
export function contrasteTextoSobre(hex: string): "#FFFFFF" | "#0A1626" {
	const limpo = hex.replace("#", "");
	const valido = /^[0-9a-fA-F]{6}$/.test(limpo) ? limpo : "000000";
	const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
	const r = canal(Number.parseInt(valido.slice(0, 2), 16) / 255);
	const g = canal(Number.parseInt(valido.slice(2, 4), 16) / 255);
	const b = canal(Number.parseInt(valido.slice(4, 6), 16) / 255);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "#0A1626" : "#FFFFFF";
}

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
