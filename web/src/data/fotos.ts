/**
 * FOTOS DE PRESTADORES (D-2151) — as 6 fotos da equipe de Criação, em `web/public/fotos/`.
 *
 * PROCEDÊNCIA: geradas com IA (Google Flow, 18/11/2026; origem em `Kit-de-Pecas/PROCEDENCIA.md`),
 * com a tela oficial do app composta no celular. Por isso TODA foto sai com o aviso abaixo
 * (CDC art. 37: pessoa gerada por IA segurando o produto não pode passar por cliente real).
 * Nenhuma foto vira depoimento, nome ou número de cliente.
 *
 * Arquivos: `tecnico-<chave>-448.webp` e `tecnico-<chave>-896.webp` (proporção 896×1200).
 */
import type { VerticalId } from "../../../src/services/verticais";

export type ChaveFoto = "eletrica" | "hidraulica" | "limpeza" | "oficina" | "predial" | "refrigeracao";

export interface FotoPrestador {
	chave: ChaveFoto;
	/** Rótulo do ofício (legenda curta, visível). */
	rotulo: string;
	/** O que a imagem mostra, sem fingir que é uma pessoa real conhecida. */
	alt: string;
	/** Página do ofício para onde o cartão da home leva. */
	href: string;
}

export const AVISO_ILUSTRATIVA = "Imagem ilustrativa criada com IA. Não é cliente da OLLI.";
export const AVISO_ILUSTRATIVAS = "Imagens ilustrativas criadas com IA. Não são clientes da OLLI.";

export const FOTOS: Record<ChaveFoto, FotoPrestador> = {
	eletrica: {
		chave: "eletrica",
		rotulo: "Eletricista",
		alt: "Eletricista ao lado de um quadro de disjuntores mostrando o app OLLI na tela do celular. Imagem ilustrativa criada com IA.",
		href: "/para/eletricista/",
	},
	refrigeracao: {
		chave: "refrigeracao",
		rotulo: "Refrigeração",
		alt: "Técnico de refrigeração na varanda de um apartamento, ao lado de um aparelho de ar-condicionado, mostrando o app OLLI no celular. Imagem ilustrativa criada com IA.",
		href: "/para/climatizacao-e-refrigeracao/",
	},
	hidraulica: {
		chave: "hidraulica",
		rotulo: "Encanador",
		alt: "Encanador agachado numa cozinha, diante de uma pia aberta, mostrando o app OLLI no celular. Imagem ilustrativa criada com IA.",
		href: "/para/encanador/",
	},
	predial: {
		chave: "predial",
		rotulo: "Manutenção predial",
		alt: "Técnico de manutenção predial num corredor, com a caixa de ferramentas ao lado, mostrando o app OLLI no celular. Imagem ilustrativa criada com IA.",
		href: "/para/manutencao/",
	},
	oficina: {
		chave: "oficina",
		rotulo: "Oficina",
		alt: "Mecânico numa oficina, com um carro elevado ao fundo, mostrando o app OLLI no celular. Imagem ilustrativa criada com IA.",
		href: "/para/prestador-de-servico/",
	},
	limpeza: {
		chave: "limpeza",
		rotulo: "Limpeza",
		alt: "Profissional de limpeza pós-obra, de touca e uniforme verde, mostrando o app OLLI no celular. Imagem ilustrativa criada com IA.",
		href: "/para/prestador-de-servico/",
	},
};

/** Ordem da faixa da home. */
export const ORDEM_HOME: ChaveFoto[] = ["eletrica", "refrigeracao", "hidraulica", "predial", "oficina", "limpeza"];

/**
 * Foto de cada página de ofício. Só entra foto que combina com o ofício da página:
 * sem foto de oficina na página de dedetização, nem o contrário. Página sem foto não ganha foto.
 */
export const FOTO_POR_OFICIO: Partial<Record<VerticalId, ChaveFoto>> = {
	refrigeracao: "refrigeracao",
	eletrica: "eletrica",
	hidraulica: "hidraulica",
};

/** Variantes de anúncio por palavra (`ALIASES_PARA`) que têm foto própria. */
export const FOTO_POR_ALIAS: Record<string, ChaveFoto> = {
	manutencao: "predial",
};
