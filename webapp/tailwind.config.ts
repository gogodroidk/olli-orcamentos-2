import type { Config } from "tailwindcss";
import { breakpointsTokens } from "./src/theme/tokens/breakpoints";
import { HtmlDataAttribute } from "./src/types/enum";
import { creatColorChannel, createTailwinConfg } from "./src/utils/theme";

export default {
	darkMode: ["selector", `[${HtmlDataAttribute.ThemeMode}='dark']`],
	content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
	theme: {
		fontFamily: createTailwinConfg("typography.fontFamily"),
		extend: {
			colors: {
				// slash admin theme tokens
				primary: creatColorChannel("colors.palette.primary"),
				success: creatColorChannel("colors.palette.success"),
				warning: creatColorChannel("colors.palette.warning"),
				error: creatColorChannel("colors.palette.error"),
				info: creatColorChannel("colors.palette.info"),
				gray: creatColorChannel("colors.palette.gray"),
				common: creatColorChannel("colors.common"),
				text: creatColorChannel("colors.text"),
				bg: creatColorChannel("colors.background"),
				action: createTailwinConfg("colors.action"),

				// Tokens do shadcn/ui.
				//
				// ⚠️ AS CHAVES TÊM QUE SER kebab-case. O shadcn escreve `text-card-foreground`,
				// `text-muted-foreground`, `bg-primary-foreground`… Uma chave `cardForeground`
				// gera a classe `text-card-foreground`? NÃO — gera `text-cardForeground`, que
				// ninguém usa. Efeito: as classes de cor de TEXTO do shadcn simplesmente NÃO
				// EXISTEM, o texto herda a cor do pai e, no tema escuro, some no fundo preto.
				// Era ESTA a causa do "no preto o texto some". Não "corrigir" de volta pra
				// camelCase.
				background: "var(--background)",
				foreground: "var(--foreground)",
				card: "var(--card)",
				"card-foreground": "var(--card-foreground)",
				popover: "var(--popover)",
				"popover-foreground": "var(--popover-foreground)",
				"primary-foreground": "var(--primary-foreground)",
				secondary: "var(--secondary)",
				"secondary-foreground": "var(--secondary-foreground)",
				muted: "var(--muted)",
				"muted-foreground": "var(--muted-foreground)",
				accent: "var(--accent)",
				"accent-foreground": "var(--accent-foreground)",
				destructive: "var(--destructive)",
				"destructive-foreground": "var(--destructive-foreground)",
				border: "var(--border)",
				input: "var(--input)",
				ring: "var(--ring)",
				"chart-1": "var(--chart-1)",
				"chart-2": "var(--chart-2)",
				"chart-3": "var(--chart-3)",
				"chart-4": "var(--chart-4)",
				"chart-5": "var(--chart-5)",
				sidebar: "var(--sidebar)",
				"sidebar-foreground": "var(--sidebar-foreground)",
				"sidebar-primary": "var(--sidebar-primary)",
				"sidebar-primary-foreground": "var(--sidebar-primary-foreground)",
				"sidebar-accent": "var(--sidebar-accent)",
				"sidebar-accent-foreground": "var(--sidebar-accent-foreground)",
				"sidebar-border": "var(--sidebar-border)",
				"sidebar-ring": "var(--sidebar-ring)",
			},
			opacity: createTailwinConfg("opacity"),
			borderRadius: createTailwinConfg("borderRadius"),
			boxShadow: createTailwinConfg("shadows"),
			spacing: createTailwinConfg("spacing"),
			zIndex: createTailwinConfg("zIndex"),
			screens: breakpointsTokens,
		},
	},
} satisfies Config;
