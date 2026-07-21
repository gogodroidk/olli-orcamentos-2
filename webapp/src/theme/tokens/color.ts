import { rgbAlpha } from "@/utils/theme";
import { ThemeColorPresets } from "#/enum";

export const presetsColors = {
	[ThemeColorPresets.Default]: {
		// OLLI — azul de marca (gradiente da logo #3FD8EA → #0B6FCE)
		lighter: "#D6ECFB",
		light: "#63A6EC",
		default: "#0B6FCE",
		dark: "#0A55A6",
		darker: "#08356A",
	},
	[ThemeColorPresets.Cyan]: {
		lighter: "#CCF4FE",
		light: "#68CDF9",
		default: "#078DEE",
		dark: "#0351AB",
		darker: "#012972",
	},
	[ThemeColorPresets.Purple]: {
		lighter: "#EBD6FD",
		light: "#B985F4",
		default: "#7635DC",
		dark: "#431A9E",
		darker: "#200A69",
	},
	[ThemeColorPresets.Blue]: {
		lighter: "#D1E9FC",
		light: "#76B0F1",
		default: "#2065D1",
		dark: "#103996",
		darker: "#061B64",
	},
	[ThemeColorPresets.Orange]: {
		lighter: "#FEF4D4",
		light: "#FED680",
		default: "#FDA92D",
		dark: "#B66816",
		darker: "#793908",
	},
	[ThemeColorPresets.Red]: {
		lighter: "#FFE3D5",
		light: "#FF9882",
		default: "#FF3030",
		dark: "#B71833",
		darker: "#7A0930",
	},
};

/**
 * We recommend picking colors with these values for [Eva Color Design](https://colors.eva.design/):
 *  + lighter : 100
 *  + light : 300
 *  + main : 500
 *  + dark : 700
 *  + darker : 900
 */
export const paletteColors = {
	primary: presetsColors[ThemeColorPresets.Default],
	// success/warning/error "default" alinhados ao STATUS_BASE do app (ver
	// src/theme/cores.ts) — mesma matiz de status nos dois produtos. Só o
	// "default" muda: lighter/light/dark/darker já eram auditados para AA
	// (ex.: Badge usa "-darker" no claro e "-light" no escuro, nunca "default")
	// e a troca do "default" só MELHORA o contraste onde ele é usado puro
	// (texto/ícone direto sobre branco ou sobre navy escuro).
	success: {
		lighter: "#D8FBDE",
		light: "#86E8AB",
		default: "#1FA971",
		dark: "#1B806A",
		darker: "#0A5554",
	},
	warning: {
		lighter: "#FFF5CC",
		light: "#FFD666",
		default: "#D98008",
		dark: "#B76E00",
		darker: "#7A4100",
	},
	error: {
		lighter: "#FFE9D5",
		light: "#FFAC82",
		default: "#E5484D",
		dark: "#B71D18",
		darker: "#7A0916",
	},
	info: {
		lighter: "#CAFDF5",
		light: "#61F3F3",
		default: "#00B8D9",
		dark: "#006C9C",
		darker: "#003768",
	},
	gray: {
		"100": "#F9FAFB",
		"200": "#F4F6F8",
		"300": "#DFE3E8",
		"400": "#C4CDD5",
		"500": "#919EAB",
		"600": "#637381",
		"700": "#454F5B",
		"800": "#1C252E",
		"900": "#141A21",
	},
};

export const commonColors = {
	white: "#FFFFFF",
	black: "#09090B",
};

export const actionColors = {
	hover: rgbAlpha(paletteColors.gray[500], 0.1),
	selected: rgbAlpha(paletteColors.gray[500], 0.1),
	focus: rgbAlpha(paletteColors.gray[500], 0.12),
	disabled: rgbAlpha(paletteColors.gray[500], 0.48),
	active: rgbAlpha(paletteColors.gray[500], 1),
};

export const lightColorTokens = {
	palette: paletteColors,
	common: commonColors,
	action: actionColors,
	text: {
		primary: paletteColors.gray[800],
		secondary: paletteColors.gray[600],
		disabled: paletteColors.gray[500],
	},
	background: {
		default: commonColors.white,
		paper: commonColors.white,
		neutral: paletteColors.gray[200],
	},
};

// Navy do DARK — mesma família do app (ver src/theme/cores.ts SUPERFICIES.escuro),
// não o preto/zinza neutro que o painel usava. Escada de elevação por LUMINOSIDADE
// (sem sombra preta, ver darkShadowTokens): fundo mais escuro → card/popover →
// secondary/muted/accent/sidebar mais claro ainda.
const navyDarkSurfaces = {
	background: "#07111F", // fundo base — cores.ts SUPERFICIES.escuro.background
	surface: "#102238", // card/popover — cores.ts SUPERFICIES.escuro.surface
	surfaceElevated: "#16304D", // secondary/muted/accent/sidebar — cores.ts SUPERFICIES.escuro.surfaceElevated
};

export const darkColorTokens = {
	palette: paletteColors,
	common: commonColors,
	action: actionColors,
	text: {
		primary: commonColors.white,
		secondary: paletteColors.gray[500],
		disabled: paletteColors.gray[600],
	},
	background: {
		default: navyDarkSurfaces.background,
		paper: navyDarkSurfaces.surface,
		neutral: navyDarkSurfaces.surfaceElevated,
	},
};
