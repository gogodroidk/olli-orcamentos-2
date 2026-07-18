// Identidade única de fonte (painel e landing): Rubik no corpo.
//
// As duas chaves do preset de troca (Settings → Fonte) são herança do template
// slash-admin: apontavam pra Open Sans e Inter e hoje resolvem as DUAS pra
// Rubik, pra manter a paridade de marca — nada no painel carrega mais Open
// Sans/Inter/Plus Jakarta (ver global.css). Os nomes das chaves ficaram porque
// o tipo do tema (theme/type.ts) e o settingStore ainda referenciam; trocar o
// nome da chave é refactor de outro arquivo, não da fonte.
//
// Rubik substituiu Plus Jakarta Sans porque o dono achou a anterior "estranha"
// e pediu letra mais arredondada. O sufixo " Variable" é obrigatório: é o
// font-family que o @fontsource-variable declara no @font-face.
//
// A pilha de fallback existe porque o @font-face usa `font-display: swap`: até o
// woff2 chegar (rede ruim de campo, que é o caso do público), o texto renderiza
// na fonte do sistema em vez de ficar invisível.
const ROUNDED_SANS = '"Rubik Variable", ui-sans-serif, system-ui, sans-serif';

export const FontFamilyPreset = {
	openSans: ROUNDED_SANS,
	inter: ROUNDED_SANS,
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
