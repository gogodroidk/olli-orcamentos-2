// Identidade única de fonte (painel, app e landing): Plus Jakarta Sans no corpo.
// As duas chaves do preset de troca (Settings → Fonte) apontavam antes para Open
// Sans e Inter; ambas agora resolvem pra Plus Jakarta pra manter a paridade de
// marca — nada no painel carrega mais Open Sans/Inter (ver global.css).
export const FontFamilyPreset = {
	openSans: "Plus Jakarta Sans Variable",
	inter: "Plus Jakarta Sans Variable",
};

export const typographyTokens = {
	fontFamily: {
		openSans: FontFamilyPreset.openSans,
		inter: FontFamilyPreset.inter,
		// Serifada — SÓ para destaque de valor monetário (classe utilitária
		// `font-serif`). Nunca usar em corpo/labels: fica ilegível em texto denso.
		serif: "Spectral, Georgia, 'Times New Roman', serif",
	},
	fontSize: {
		xs: "12",
		sm: "14",
		default: "16",
		lg: "18",
		xl: "20",
	},
	fontWeight: {
		light: "300",
		normal: "400",
		medium: "500",
		semibold: "600",
		bold: "700",
	},
	lineHeight: {
		none: "1",
		tight: "1.25",
		normal: "1.375",
		relaxed: "1.5",
	},
};
