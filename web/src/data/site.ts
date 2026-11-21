/**
 * Dados do SITE v10 (D-2876): rotas, menu de serviços e as frases que dependem do plano.
 *
 * REGRA DA CASA: copy de plano/preço/limite NÃO se digita. A v10 foi escrita em 17/11, antes do corte da CPO de
 * 18/11 (recibo, agenda e OS saíram do Grátis; D-2267) e antes de o Grátis virar "até 5 por mês" em todas as contas.
 * Tudo que vem daqui sai da MESMA fonte do app, do painel e dos e-mails (`planosBase`, `entitlements`, `data/planos`).
 * Mexeu na fonte, o site acompanha no próximo build, e o `teste-site-v10.mjs` trava o que escapar.
 */
import { planoIncluiRecurso } from "../../../src/services/entitlements";
import type { Recurso } from "../../../src/services/entitlements";
import { TRIAL_PRO_DIAS } from "../../../src/services/entitlements";
import { DESCONTO_ANUAL_ROTULO, PRECO_EMPRESA, PRECO_PRO, reais } from "./planos";
import { PIX_PLANO_LIGADO } from "./pix";
import {
	FRASE_GRATIS_CURTA,
	GRATIS_CONDICAO,
	NOME_PLANO,
	recursosQueSairamDoGratis,
	TEXTO_SELO_OLLI,
} from "./recursos";

export const NOME_APP = "OLLI Orçamentos";
export const URL_APP = "https://app.olliorcamentos.online";
export const URL_CADASTRO = `${URL_APP}/auth/login?modo=cadastro`;
export const URL_ENTRAR = `${URL_APP}/auth/login`;
export const URL_PLAY = "https://play.google.com/store/apps/details?id=online.olliorcamentos.app";

/** Rotas das páginas v10. As rotas de SEO que já existiam (/para/<ofício>/, /planos/, /ajuda/) NÃO mudam. */
export const ROTA = {
	inicio: "/",
	tecnicos: "/para/",
	empresas: "/para-empresas/",
	recursos: "/como-funciona/",
	planos: "/planos/",
	duvidas: "/duvidas/",
	ajuda: "/ajuda/",
} as const;

export interface ItemMenu {
	/** slug da rota /para/<slug>/ */
	slug: string;
	nome: string;
}

/** Os 12 serviços do menu da v10, na ordem aprovada. O slug é o da rota real (as de SEO não mudaram). */
export const SERVICOS_MENU: readonly ItemMenu[] = [
	{ slug: "climatizacao-e-refrigeracao", nome: "Refrigeração e ar-condicionado" },
	{ slug: "eletricista", nome: "Eletricista" },
	{ slug: "encanador", nome: "Encanador" },
	{ slug: "pintor", nome: "Pintor" },
	{ slug: "pedreiro-reforma", nome: "Pedreiro e reforma" },
	{ slug: "marido-de-aluguel", nome: "Marido de aluguel" },
	{ slug: "dedetizadora", nome: "Dedetização" },
	{ slug: "limpeza", nome: "Limpeza" },
	{ slug: "informatica", nome: "Informática" },
	{ slug: "chaveiro", nome: "Chaveiro" },
	{ slug: "serralheiro", nome: "Serralheiro" },
	{ slug: "jardinagem", nome: "Jardinagem" },
];

/** Serviços que já tinham página de SEO e não estão no menu da v10: seguem no ar e no hub /para/. */
export const SERVICOS_FORA_DO_MENU: readonly ItemMenu[] = [
	{ slug: "limpeza-de-caixa-dagua", nome: "Limpeza de caixa d'água" },
	{ slug: "piscineiro", nome: "Piscineiro" },
	{ slug: "recarga-de-extintores", nome: "Recarga de extintores" },
	{ slug: "prestador-de-servico", nome: "Outro prestador de serviço" },
];

// ─────────── frases que dependem do plano (todas derivadas) ───────────

/** "até 5 orçamentos enviados por mês" (ou "orçamentos ilimitados" se o corte for desligado). */
export const GRATIS_ORC = FRASE_GRATIS_CURTA;
/** "sem cartão e sem prazo" */
export const GRATIS_SEM = GRATIS_CONDICAO;
export const SELO = TEXTO_SELO_OLLI;
export const PLANOS_PAGOS_INCLUEM = `Os planos ${NOME_PLANO.pro} e ${NOME_PLANO.empresa} incluem`;
export const FRASE_RECURSOS_PLANOS_PAGOS = `${PLANOS_PAGOS_INCLUEM} estes recursos — ${recursosQueSairamDoGratis()}.`;
export const TRIAL_DIAS = TRIAL_PRO_DIAS;

export const PRECO = {
	proMes: reais(PRECO_PRO.mensalCentavos),
	proAno: reais(PRECO_PRO.anualCentavos),
	proAnoPorMes: reais(PRECO_PRO.anualPorMesCentavos),
	proEconomia: reais(PRECO_PRO.economiaAnualCentavos),
	empresaMes: reais(PRECO_EMPRESA.mensalCentavos),
	empresaAno: reais(PRECO_EMPRESA.anualCentavos),
	empresaAnoPorMes: reais(PRECO_EMPRESA.anualPorMesCentavos),
	empresaEconomia: reais(PRECO_EMPRESA.economiaAnualCentavos),
	desconto: DESCONTO_ANUAL_ROTULO,
} as const;

/**
 * Pix da ASSINATURA (Pro/Empresa pagos no Pix): só é dito se o servidor de pagamentos confirmou, no build, que está ligado.
 * É outra coisa que o "pagamento na hora" do link do orçamento (recurso `link_pagamento`, do prestador).
 */
export const PIX = PIX_PLANO_LIGADO;
/** O link do orçamento com o Pix do prestador: dito só se a fonte (entitlements) concede aos planos pagos. */
export const LINK_COM_PIX = planoIncluiRecurso("pro", "link_pagamento") && planoIncluiRecurso("empresa", "link_pagamento") && !planoIncluiRecurso("gratis", "link_pagamento");
/** "Nos planos Pro e Empresa, o cliente também pode pagar pelo Pix, direto na sua conta, no mesmo link." ou "". */
export const FRASE_PIX_LINK = LINK_COM_PIX ? "Nos planos Pro e Empresa, o cliente também pode pagar pelo Pix, direto na sua conta, no mesmo link." : "";

/** O Grátis inclui este recurso? (false = é do Pro ou do Empresa) */
export function gratisInclui(recurso: Recurso): boolean {
	return planoIncluiRecurso("gratis", recurso);
}
/** Selo "Pro" para recurso que o Grátis não tem. Vazio se o Grátis tem. */
export function seloPlano(recurso: Recurso): string {
	return gratisInclui(recurso) ? "" : planoIncluiRecurso("pro", recurso) ? "Pro" : "Empresa";
}

/** `<a>` de cadastro com plano e período (a atribuição é anexada depois por `marketing.ts`). */
export function urlAssinar(plano: "pro" | "empresa", periodo: "mensal" | "anual" = "mensal"): string {
	return `${URL_CADASTRO}&plano=${plano}&periodo=${periodo}`;
}

/**
 * PREMISSAS DA COPY. As páginas da v10 dizem "No Pro, a agenda…", "recibo é do Pro", "o Pro/Empresa recebem pelo Pix no link".
 * Se a fonte mudar (um recurso voltar ao Grátis, por exemplo), o build QUEBRA aqui em vez de publicar frase velha.
 */
for (const r of ["agenda", "ordem_servico", "recibos"] as const) {
	if (gratisInclui(r) || !planoIncluiRecurso("pro", r)) {
		throw new Error(`[site] copy da v10 diz que "${r}" é do Pro e a fonte (entitlements) mudou. Revise as páginas da v10 (data/site.ts, pages/*.astro).`);
	}
}

/** Segmentos que só existem na v10 (não tinham página de SEO antes). Chave = slug da rota /para/<slug>/. */
export const SEGMENTOS_NOVOS = ["pedreiro-reforma", "limpeza", "informatica", "chaveiro", "serralheiro"] as const;
/** Como a profissão aparece em título, "resposta curta" e FAQ destas páginas. */
export const PROFISSAO_NOVA: Record<string, string> = {
	"pedreiro-reforma": "pedreiro e reforma",
	limpeza: "serviços de limpeza",
	informatica: "informática",
	chaveiro: "chaveiro",
	serralheiro: "serralheiro",
};

/** Perfis oficiais da OLLI (JSON-LD `sameAs`). Instagram e Página do Facebook da OLLI. */
export const REDES_OFICIAIS = [
	"https://www.instagram.com/olliorcamentos/",
	"https://www.facebook.com/profile.php?id=1382931624902325",
];
