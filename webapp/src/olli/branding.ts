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
 *
 * GUARDA DE CONTRASTE: a cor da empresa é livre (vem do cadastro), então pode
 * cair perto do branco (ex.: Ciano #19D3E6 ≈ 1,66:1 sobre branco). O painel usa
 * essa cor como fundo com texto claro por cima (botões, badges) — sem escolher
 * o foreground certo, o texto fica ilegível. Por isso calculamos
 * `--primary-foreground` com luminância relativa (mesma fórmula do app,
 * `contrasteTextoSobre`) em vez de assumir branco sempre.
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
		// Foreground legível sobre a cor "default" (é a que os botões/pills usam
		// como fundo, via `text-primary-foreground`). Luminância relativa
		// aproximada de WCAG — mesma fórmula do app (`contrasteTextoSobre` em
		// meu-negocio/constantes.ts). `--primary-foreground` é a variável que o
		// Shadcn/Tailwind deste projeto já lê (global.css) — sem sobrescrevê-la,
		// o texto continua branco fixo mesmo sobre cor clara (ex.: Ciano).
		const foreground = luminanciaRelativa(base) > 0.5 ? black : white;
		root.setProperty("--primary-foreground", foreground.hex());
	} catch {
		// hex inválido → mantém a cor padrão OLLI (azul). Nunca quebra a UI.
	}
}

function luminanciaRelativa(c: Color): number {
	const canal = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
	const [r, g, b] = c
		.rgb()
		.array()
		.map((v) => canal(v / 255));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const HEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

/**
 * Acha a cor de marca da empresa entre os nomes de coluna plausíveis — E dentro
 * do blob `dados` (é lá que ela realmente mora: a tabela `empresa` só tem
 * `user_id`/`dados`/`atualizado_em`, ver contrato em meu-negocio/index.tsx).
 * Sem olhar o blob, a cor salva nunca repinta o painel fora de "Meu Negócio"
 * (o layout chama `resetBrandColor()` a cada carregamento).
 */
export function pickBrandColor(empresa: Record<string, unknown> | null | undefined): string | null {
	if (!empresa) return null;
	const blob =
		(empresa.dados && typeof empresa.dados === "object" ? (empresa.dados as Record<string, unknown>) : null) ?? empresa;
	for (const alvo of [blob, empresa]) {
		for (const k of ["corMarca", "cor_marca", "cor", "brand_color", "cor_primaria", "cor_padrao", "color"]) {
			const v = alvo[k];
			if (typeof v === "string" && HEX.test(v.trim())) return v.trim();
		}
	}
	return null;
}

/**
 * Volta a cor primária pro padrão OLLI (remove o override inline no <html>).
 * Usar no LOGOUT e quando a empresa não tem cor — senão, num logout SPA (sem
 * reload), o próximo tenant herdaria a marca do anterior na mesma aba.
 */
export function resetBrandColor() {
	const root = document.documentElement.style;
	for (const name of ["lighter", "light", "default", "dark", "darker"]) {
		root.removeProperty(`--colors-palette-primary-${name}`);
		root.removeProperty(`--colors-palette-primary-${name}Channel`);
	}
	root.removeProperty("--primary-foreground");
}

/** Hook: aplica a cor da marca da empresa logada assim que ela carrega. */
export function useApplyBranding() {
	const { data: empresa } = useMinhaEmpresa();
	useEffect(() => {
		const hex = pickBrandColor(empresa as Record<string, unknown> | null);
		if (hex) applyBrandColor(hex);
		else resetBrandColor(); // sem cor da empresa → padrão OLLI (não herda tenant anterior)
	}, [empresa]);
}
