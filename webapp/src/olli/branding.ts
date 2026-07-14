import Color from "color";
import { useEffect } from "react";
import { useMinhaEmpresa } from "./data";

/**
 * WHITE-LABEL — a marca da empresa pinta o painel.
 *
 * O Slash aplica a cor primária por variáveis CSS
 * (`--colors-palette-primary-{lighter,light,default,dark,darker}`). Aqui a
 * gente SOBRESCREVE essas variáveis inline no <html> com a cor da empresa
 * logada — então cada dono vê o sistema na cor DELE, sem seletor de demo.
 * Reaproveita a mesma ideia do `coresMarca`/`extrairCoresLogo` do app.
 */
export function applyBrandColor(hex: string) {
	try {
		const base = Color(hex);
		const white = Color("#ffffff");
		const black = Color("#000000");
		const root = document.documentElement.style;
		const ramp: Record<string, Color> = {
			lighter: base.mix(white, 0.8),
			light: base.mix(white, 0.35),
			default: base,
			dark: base.mix(black, 0.25),
			darker: base.mix(black, 0.45),
		};
		for (const [name, c] of Object.entries(ramp)) {
			// O Tailwind do Slash usa a variante "Channel" (r g b) para suportar
			// opacidade (bg-primary/10). Setar só o hex NÃO muda a UI — tem que
			// setar as duas: o hex E o canal RGB.
			root.setProperty(`--colors-palette-primary-${name}`, c.hex());
			const [r, g, b] = c.rgb().array();
			root.setProperty(`--colors-palette-primary-${name}Channel`, `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`);
		}
	} catch {
		// hex inválido → mantém a cor padrão OLLI (azul). Nunca quebra a UI.
	}
}

const HEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

/** Acha a cor de marca da empresa entre os nomes de coluna plausíveis. */
export function pickBrandColor(empresa: Record<string, unknown> | null | undefined): string | null {
	if (!empresa) return null;
	for (const k of ["cor_marca", "corMarca", "cor", "brand_color", "cor_primaria", "cor_padrao", "color"]) {
		const v = empresa[k];
		if (typeof v === "string" && HEX.test(v.trim())) return v.trim();
	}
	return null;
}

/** Hook: aplica a cor da marca da empresa logada assim que ela carrega. */
export function useApplyBranding() {
	const { data: empresa } = useMinhaEmpresa();
	useEffect(() => {
		const hex = pickBrandColor(empresa as Record<string, unknown> | null);
		if (hex) applyBrandColor(hex);
	}, [empresa]);
}
