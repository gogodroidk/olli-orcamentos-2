import Color from "color";
import { commonColors, paletteColors } from "./color";

export const lightShadowTokens = {
	none: "none",
	sm: `0 1px 2px 0 ${Color(paletteColors.gray[700]).alpha(0.05)}, 0 8px 24px -8px ${Color(paletteColors.gray[700]).alpha(0.08)}`,
	default: `0 2px 8px 0 ${Color(paletteColors.gray[700]).alpha(0.05)}, 0 12px 28px -10px ${Color(paletteColors.gray[700]).alpha(0.08)}`,
	md: `0 4px 12px 0 ${Color(paletteColors.gray[700]).alpha(0.06)}, 0 16px 32px -12px ${Color(paletteColors.gray[700]).alpha(0.08)}`,
	lg: `0 8px 20px 0 ${Color(paletteColors.gray[700]).alpha(0.06)}, 0 20px 40px -14px ${Color(paletteColors.gray[700]).alpha(0.1)}`,
	xl: `0 12px 28px 0 ${Color(paletteColors.gray[700]).alpha(0.07)}, 0 24px 48px -16px ${Color(paletteColors.gray[700]).alpha(0.1)}`,
	"2xl": `0 16px 36px 0 ${Color(paletteColors.gray[700]).alpha(0.08)}, 0 28px 56px -18px ${Color(paletteColors.gray[700]).alpha(0.1)}`,
	"3xl": `0 20px 44px 0 ${Color(paletteColors.gray[700]).alpha(0.08)}, 0 32px 64px -20px ${Color(paletteColors.gray[700]).alpha(0.12)}`,
	inner: `inset 0 1px 2px 0 ${Color(paletteColors.gray[700]).alpha(0.08)}`,

	dialog: `0 24px 48px -12px ${Color(paletteColors.gray[900]).alpha(0.18)}`,
	card: `0 1px 2px 0 ${Color(paletteColors.gray[700]).alpha(0.04)}, 0 12px 32px -12px ${Color(paletteColors.gray[700]).alpha(0.08)}`,
	dropdown: `0 1px 2px 0 ${Color(paletteColors.gray[700]).alpha(0.06)}, 0 16px 40px -12px ${Color(paletteColors.gray[700]).alpha(0.12)}`,

	primary: `0 8px 16px 0 ${Color(paletteColors.primary.default).alpha(0.24)}`,
	info: `0 8px 16px 0 ${Color(paletteColors.info.default).alpha(0.24)}`,
	success: `0 8px 16px 0 ${Color(paletteColors.success.default).alpha(0.24)}`,
	warning: `0 8px 16px 0 ${Color(paletteColors.warning.default).alpha(0.24)}`,
	error: `0 8px 16px 0 ${Color(paletteColors.error.default).alpha(0.24)}`,
};

// Escuro: a sombra preta quase some contra um fundo já escuro — a elevação real
// vem do DEGRAU de superfície mais clara (background → card/popover → neutral,
// ver theme/tokens/color.ts darkColorTokens.background). Por isso aqui o preto
// fica só sutil, pra dar separação de borda, não pra "empurrar" profundidade.
export const darkShadowTokens = {
	none: "none",
	sm: `0 1px 2px 0 ${Color(commonColors.black).alpha(0.08)}`,
	default: `0 4px 8px 0 ${Color(commonColors.black).alpha(0.1)}`,
	md: `0 8px 16px 0 ${Color(commonColors.black).alpha(0.12)}`,
	lg: `0 12px 24px 0 ${Color(commonColors.black).alpha(0.14)}`,
	xl: `0 16px 32px 0 ${Color(commonColors.black).alpha(0.16)}`,
	"2xl": `0 20px 40px 0 ${Color(commonColors.black).alpha(0.18)}`,
	"3xl": `0 24px 48px 0 ${Color(commonColors.black).alpha(0.2)}`,
	inner: `inset 0 2px 4px 0 ${Color(commonColors.black).alpha(0.1)}`,

	dialog: `-40px 40px 80px -8px ${Color(commonColors.black).alpha(0.16)}`,
	card: `0 0 2px 0 ${Color(commonColors.black).alpha(0.12)}, 0 12px 24px -4px ${Color(commonColors.black).alpha(0.08)}`,
	dropdown: `0 0 2px 0 ${Color(commonColors.black).alpha(0.14)}, -20px 20px 40px -4px ${Color(commonColors.black).alpha(0.14)}`,

	primary: `0 8px 16px 0 ${Color(paletteColors.primary.default).alpha(0.24)}`,
	info: `0 8px 16px 0 ${Color(paletteColors.info.default).alpha(0.24)}`,
	success: `0 8px 16px 0 ${Color(paletteColors.success.default).alpha(0.24)}`,
	warning: `0 8px 16px 0 ${Color(paletteColors.warning.default).alpha(0.24)}`,
	error: `0 8px 16px 0 ${Color(paletteColors.error.default).alpha(0.24)}`,
};
