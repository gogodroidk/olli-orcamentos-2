import { supabase } from "@/lib/supabase";

/**
 * CHECKOUT DE ASSINATURA — abre o Stripe Checkout pelo MESMO Worker que já atende o
 * diagnóstico por IA (Cloudflare, base `diagnostico.olliorcamentos.online`). O worker
 * expõe `POST /stripe/checkout`; o painel só monta o corpo, anexa o JWT do Supabase e
 * redireciona para a URL hospedada que a Stripe devolve.
 *
 * Contrato do Worker (worker/src/stripe.js → handleCheckout):
 *   auth:  Authorization: Bearer <access_token do Supabase>
 *   body:  { plano: 'pro' | 'pro_anual' | 'empresa' | 'empresa_anual' }
 *   200:   { ok:true, url }                         → abrir a URL do Checkout
 *   400:   { ok:false, erro:'plano_invalido' }
 *   401:   { ok:false, erro:'nao_autorizado' }      → sessão inválida
 *   429:   { ok:false, erro:'muitas_requisicoes' }  → rate limit
 *   503:   { ok:false, erro:'stripe_nao_configurado' } → pagamento ainda não ligado
 *   502:   { ok:false, erro:'falha_checkout' }
 *
 * ═══ P0: ERRO NUNCA VIRA VAZIO ═══
 * Esta função NUNCA lança e NUNCA redireciona no escuro. Qualquer problema volta como
 * `{ ok:false, erro }` tipado, e a tela mostra um estado honesto com "Tentar de novo"
 * (mais o WhatsApp como caminho alternativo). Um botão que "não faz nada" seria pior do
 * que não ter botão: some no meio de uma venda e ninguém sabe por quê.
 *
 * Só o Pro/Empresa MENSAL e ANUAL são vendidos aqui. O "12x" da Stripe fica de fora de
 * propósito: ele é o valor CHEIO do ano parcelado (mais caro que o anual à vista) — não
 * é desconto, e o painel não empurra o caminho mais caro (ver `web/src/data/planos.ts`).
 */

/** Base do Worker de pagamentos — o MESMO do diagnóstico (worker/src/index.js). */
const PAGAMENTOS_URL = (
	(import.meta.env.VITE_PAGAMENTOS_URL as string | undefined) ??
	(import.meta.env.VITE_DIAGNOSTICO_URL as string | undefined) ??
	"https://diagnostico.olliorcamentos.online"
).replace(/\/+$/, "");

/** Timeout de campo: conexão instável não pode travar o botão para sempre. */
const TIMEOUT_MS = 20_000;

/** Identificadores que o worker aceita em `/stripe/checkout` (só assinaturas). */
export type PlanoCheckout = "pro" | "pro_anual" | "empresa" | "empresa_anual";

export type TipoFalhaCheckout =
	| "timeout"
	| "offline"
	| "servidor"
	| "limite"
	| "auth"
	| "naoConfigurado"
	| "desconhecido";

export interface FalhaCheckout {
	tipo: TipoFalhaCheckout;
	titulo: string;
	mensagem: string;
}

/** Copy única por motivo de falha — honesta, na voz da OLLI, sem jargão de erro. */
export function mapearFalhaCheckout(tipo: TipoFalhaCheckout): FalhaCheckout {
	switch (tipo) {
		case "timeout":
			return {
				tipo,
				titulo: "Demorou demais para abrir o pagamento",
				mensagem: "Sua conexão parece lenta agora — tente de novo em instantes.",
			};
		case "offline":
			return {
				tipo,
				titulo: "Sem conexão com a internet",
				mensagem: "Confira o Wi-Fi ou os dados e tente de novo.",
			};
		case "servidor":
			return {
				tipo,
				titulo: "Não consegui abrir o pagamento agora",
				mensagem: "Foi um tropeço do nosso lado. Tente de novo em instantes.",
			};
		case "limite":
			return {
				tipo,
				titulo: "Muitas tentativas em pouco tempo",
				mensagem: "Espere alguns segundos antes de tentar de novo.",
			};
		case "auth":
			return {
				tipo,
				titulo: "Sua sessão expirou",
				mensagem: "Entre de novo na sua conta para continuar a assinatura.",
			};
		case "naoConfigurado":
			return {
				tipo,
				titulo: "Pagamento direto ainda não disponível",
				mensagem: "Enquanto isso, a gente faz sua assinatura pelo WhatsApp, na hora.",
			};
		default:
			return {
				tipo,
				titulo: "Algo não saiu como esperado",
				mensagem: "Não consegui abrir o pagamento agora. Tente de novo em instantes.",
			};
	}
}

export type ResultadoCheckout = { ok: true; url: string } | { ok: false; erro: FalhaCheckout };

/**
 * Pede ao worker uma sessão de Checkout para `plano`. Devolve a URL para redirecionar,
 * ou uma falha tipada. Nunca lança.
 */
export async function iniciarCheckout(plano: PlanoCheckout): Promise<ResultadoCheckout> {
	let token: string | null = null;
	try {
		const { data } = await supabase.auth.getSession();
		token = data.session?.access_token ?? null;
	} catch {
		token = null;
	}
	if (!token) return { ok: false, erro: mapearFalhaCheckout("auth") };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const r = await fetch(`${PAGAMENTOS_URL}/stripe/checkout`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ plano }),
			signal: controller.signal,
		});

		if (r.status === 401) return { ok: false, erro: mapearFalhaCheckout("auth") };
		if (r.status === 429) return { ok: false, erro: mapearFalhaCheckout("limite") };
		if (r.status === 503) return { ok: false, erro: mapearFalhaCheckout("naoConfigurado") };

		const data: unknown = await r.json().catch(() => null);
		const obj = (data ?? {}) as { ok?: boolean; url?: unknown; erro?: string };

		if (obj.ok && typeof obj.url === "string" && obj.url.trim()) {
			return { ok: true, url: obj.url };
		}
		if (obj.erro === "stripe_nao_configurado") return { ok: false, erro: mapearFalhaCheckout("naoConfigurado") };
		if (obj.erro === "nao_autorizado") return { ok: false, erro: mapearFalhaCheckout("auth") };
		if (obj.erro === "muitas_requisicoes") return { ok: false, erro: mapearFalhaCheckout("limite") };
		if (r.status >= 500) return { ok: false, erro: mapearFalhaCheckout("servidor") };
		return { ok: false, erro: mapearFalhaCheckout("desconhecido") };
	} catch (e) {
		const abortado = e instanceof DOMException && e.name === "AbortError";
		return { ok: false, erro: mapearFalhaCheckout(abortado ? "timeout" : "offline") };
	} finally {
		clearTimeout(timer);
	}
}
