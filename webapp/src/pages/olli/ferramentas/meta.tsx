import {
	Activity,
	AirVent,
	Cable,
	Calculator,
	Droplet,
	Droplets,
	FlaskConical,
	Flame,
	Gauge,
	Layers,
	Leaf,
	type LucideIcon,
	Paintbrush,
	Percent,
	Shovel,
	Sprout,
	Thermometer,
	Timer,
	TrendingDown,
	TreePine,
	Waves,
	Zap,
} from "lucide-react";
import type { VerticalId } from "./calculos";

/**
 * meta.tsx — só a CAMADA VISUAL das ferramentas (categoria, cor de marca e ícone).
 * A matemática vive em calculos.ts (cópia verbatim do app) e nunca é tocada aqui.
 *
 * Cada categoria (ofício) tem uma cor derivada da marca OLLI — azul, ciano e menta —
 * escolhida para passar contraste AA em tema claro e escuro. O ícone é do lucide-react
 * (já é dependência do painel); nada de fonte/CDN externa.
 */

export interface CategoriaMeta {
	id: VerticalId;
	label: string;
	/** Cor de destaque (hex) — usada no glifo sobre um leve fundo tonal e no chip ativo. */
	cor: string;
	Icon: LucideIcon;
}

/** Ordem fixa dos ofícios na barra de filtros (climatização/elétrica/hidráulica primeiro). */
export const CATEGORIAS: Record<Exclude<VerticalId, "geral">, CategoriaMeta> = {
	refrigeracao: { id: "refrigeracao", label: "Climatização", cor: "#0B6FCE", Icon: AirVent },
	eletrica: { id: "eletrica", label: "Elétrica", cor: "#D97706", Icon: Zap },
	hidraulica: { id: "hidraulica", label: "Hidráulica", cor: "#0891B2", Icon: Droplets },
	pintura: { id: "pintura", label: "Pintura", cor: "#7C3AED", Icon: Paintbrush },
	dedetizacao: { id: "dedetizacao", label: "Dedetização", cor: "#0D9488", Icon: FlaskConical },
	jardinagem: { id: "jardinagem", label: "Jardinagem", cor: "#059669", Icon: Leaf },
};

export const ORDEM_CATEGORIAS: (keyof typeof CATEGORIAS)[] = [
	"refrigeracao",
	"eletrica",
	"hidraulica",
	"pintura",
	"dedetizacao",
	"jardinagem",
];

/** Categoria de um cálculo = a 1ª vertical dele (todos os cálculos têm uma vertical de ofício). */
export function categoriaDe(verticais: VerticalId[]): CategoriaMeta {
	for (const v of verticais) {
		if (v !== "geral" && CATEGORIAS[v]) return CATEGORIAS[v];
	}
	return { id: "geral", label: "Geral", cor: "#0B6FCE", Icon: Calculator };
}

/** Ícone específico por calculadora (id do calculos.ts) — cai no Calculator se faltar. */
const ICONES: Record<string, LucideIcon> = {
	btu: AirVent,
	carga_gas: Flame,
	sh_sc: Thermometer,
	disjuntor_compressor: Zap,
	vacuo: Gauge,
	dimensionamento_circuito: Zap,
	eletroduto: Cable,
	queda_tensao: Activity,
	caixa_agua: Droplet,
	agua_fria_pesos: Droplets,
	perda_carga: TrendingDown,
	fossa_septica: Waves,
	massa: Layers,
	diluicao: FlaskConical,
	diluicao_tinta: Percent,
	secagem_demaos: Timer,
	rendimento_selador: Paintbrush,
	grama: Sprout,
	adubacao_npk: Leaf,
	mudas_cerca_viva: TreePine,
	cova_substrato: Shovel,
};

export function iconeDe(id: string): LucideIcon {
	return ICONES[id] ?? Calculator;
}
