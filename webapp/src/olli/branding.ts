import Color from "color";
import { useEffect } from "react";
import { tokensDaMarca } from "../../../src/utils/coresMarca";
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
 * GUARDA DE CONTRASTE: a cor é livre (cadastro ou logo). O Ciano #19D3E6
 * mede ~1,8:1 sobre branco e ~7:1 sobre o navy do escuro — um único hex
 * servindo os dois modos deixa um deles ilegível. `tokensDaMarca` escolhe
 * o degrau por `data-theme-mode`. O item ativo do menu lê `-dark` no claro
 * e `-light` no escuro; botão lê `default` + `--primary-foreground`.
 *
 * A última cor pedida fica em `hexPedido`. Trocar o tema repinta essa cor
 * (rascunho do Meu Negócio inclusive) sem o layout reler a empresa salva.
 */
const DEGRAUS = ["lighter", "light", "default", "dark", "darker"] as const;

let hexPedido: string | null = null;
let observando = false;

function modoEscuro(): boolean {
	return document.documentElement.getAttribute("data-theme-mode") === "dark";
}

function pintarMarca(hex: string) {
	const base = Color(hex);
	const white = Color("#ffffff");
	const black = Color("#000000");
	const tokens = tokensDaMarca(
		base.hex(),
		{
			lighter: base.mix(white, 0.8).hex(),
			light: base.mix(white, 0.35).hex(),
			dark: base.mix(black, 0.25).hex(),
			darker: base.mix(black, 0.45).hex(),
		},
		modoEscuro(),
	);
	const root = document.documentElement.style;
	for (const name of DEGRAUS) {
		const valor = tokens[name];
		// O Tailwind do Slash usa a variante "Channel" (r g b) para suportar
		// opacidade (bg-primary/10). Setar só o hex NÃO muda a UI — tem que
		// setar as duas: o hex E o canal RGB.
		root.setProperty(`--colors-palette-primary-${name}`, valor);
		const [r, g, b] = Color(valor).rgb().array();
		root.setProperty(`--colors-palette-primary-${name}Channel`, `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`);
	}
	root.setProperty("--primary-foreground", tokens.foreground);
}

function instalarObservador() {
	if (observando || typeof MutationObserver === "undefined") return;
	observando = true;
	new MutationObserver(() => {
		if (hexPedido) pintarMarca(hexPedido);
	}).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme-mode"] });
}

export function applyBrandColor(hex: string) {
	try {
		pintarMarca(hex);
		hexPedido = hex;
		instalarObservador();
	} catch {
		// hex inválido → mantém a cor atual. Nunca quebra a UI.
	}
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
	hexPedido = null;
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
