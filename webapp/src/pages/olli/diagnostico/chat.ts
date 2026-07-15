import { supabase } from "@/lib/supabase";

/**
 * Diagnóstico por SINTOMA — conversa com a OLLI Técnica no Worker de IA
 * (Cloudflare, base `diagnostico.olliorcamentos.online`, rota POST /chat).
 *
 * O Worker EXIGE o JWT do Supabase (Authorization: Bearer <access_token>) e
 * responde `{ ok:true, resposta }` ou um erro tipado. Nunca inventamos resposta:
 * se a chamada falhar (sessão, rede, sobrecarga, IA desligada), devolvemos um
 * ERRO honesto e a UI mostra o estado certo com "Tentar de novo".
 *
 * Contrato do Worker (worker/src/index.js → handleChat):
 *   body:  { mensagens: [{ role: 'user'|'assistant', texto }], vertical? }
 *   200:   { ok:true, resposta }              → resposta da IA
 *   200:   { ok:false, motivo:'ia_nao_configurada' }  → IA sem chave (cai p/ código)
 *   401:   { ok:false, motivo:'nao_autorizado' }      → sessão inválida
 *   429:   { ok:false, erro:'muitas_requisicoes' }     → rate limit
 *   503:   { ok:false, erro:'sobrecarregado' }         → alta demanda
 *   502:   { ok:false, erro:'falha_ia' }               → falha na geração
 */

const WORKER_URL = (
	(import.meta.env.VITE_DIAGNOSTICO_URL as string | undefined) ?? "https://diagnostico.olliorcamentos.online"
).replace(/\/+$/, "");

/** Timeout de campo: conexão instável não pode travar a tela para sempre. */
const TIMEOUT_MS = 30_000;

export type TipoErroIA =
	| "timeout"
	| "offline"
	| "servidor"
	| "limite"
	| "auth"
	| "naoConfigurada"
	| "desconhecido";

export interface FalhaIA {
	tipo: TipoErroIA;
	titulo: string;
	mensagem: string;
	/** Rótulo do botão de recuperação. A tela decide a ação (reenviar / ir p/ código). */
	acao: string;
}

/** Copy única por motivo de falha — honesta, na voz da OLLI, sem jargão de erro. */
export function mapearFalhaIA(tipo: TipoErroIA): FalhaIA {
	switch (tipo) {
		case "timeout":
			return {
				tipo,
				titulo: "Demorou demais para responder",
				mensagem: "Sua conexão parece lenta agora — a OLLI não respondeu a tempo.",
				acao: "Tentar de novo",
			};
		case "offline":
			return {
				tipo,
				titulo: "Sem conexão com a internet",
				mensagem: "Confira o Wi-Fi ou os dados e tente de novo.",
				acao: "Tentar de novo",
			};
		case "servidor":
			return {
				tipo,
				titulo: "A OLLI está muito requisitada",
				mensagem: "Estamos com alta demanda agora — tente de novo em instantes.",
				acao: "Tentar de novo",
			};
		case "limite":
			return {
				tipo,
				titulo: "Muitas perguntas em pouco tempo",
				mensagem: "Espere alguns segundos antes de perguntar de novo.",
				acao: "Tentar de novo",
			};
		case "auth":
			return {
				tipo,
				titulo: "Sua sessão expirou",
				mensagem: "Entre de novo na sua conta para usar a OLLI por IA.",
				acao: "Tentar de novo",
			};
		case "naoConfigurada":
			return {
				tipo,
				titulo: "IA por sintoma indisponível agora",
				mensagem: "Enquanto isso, a busca por código funciona 100% — ela não depende de IA.",
				acao: "Ir para Por código",
			};
		default:
			return {
				tipo,
				titulo: "Algo não saiu como esperado",
				mensagem: "Não consegui falar com a OLLI agora. Tente de novo em instantes.",
				acao: "Tentar de novo",
			};
	}
}

export interface MensagemChat {
	role: "user" | "assistant";
	texto: string;
}

export type RespostaChat = { ok: true; resposta: string } | { ok: false; erro: FalhaIA };

/**
 * Chama o Worker /chat com o histórico da conversa. Anexa o token da sessão.
 * Nunca lança: qualquer problema vira `{ ok:false, erro }` com o tipo certo.
 */
export async function perguntarPorSintoma(mensagens: MensagemChat[]): Promise<RespostaChat> {
	let token: string | null = null;
	try {
		const { data } = await supabase.auth.getSession();
		token = data.session?.access_token ?? null;
	} catch {
		token = null;
	}
	if (!token) return { ok: false, erro: mapearFalhaIA("auth") };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const r = await fetch(`${WORKER_URL}/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ mensagens, vertical: "refrigeracao" }),
			signal: controller.signal,
		});

		if (r.status === 401) return { ok: false, erro: mapearFalhaIA("auth") };
		if (r.status === 429) return { ok: false, erro: mapearFalhaIA("limite") };
		if (r.status === 503 || r.status >= 500) return { ok: false, erro: mapearFalhaIA("servidor") };

		const data: unknown = await r.json().catch(() => null);
		const obj = (data ?? {}) as { ok?: boolean; resposta?: unknown; motivo?: string; erro?: string };

		if (obj.ok && typeof obj.resposta === "string" && obj.resposta.trim()) {
			return { ok: true, resposta: obj.resposta.trim() };
		}
		if (obj.motivo === "ia_nao_configurada") return { ok: false, erro: mapearFalhaIA("naoConfigurada") };
		if (obj.motivo === "nao_autorizado") return { ok: false, erro: mapearFalhaIA("auth") };
		if (obj.erro === "muitas_requisicoes") return { ok: false, erro: mapearFalhaIA("limite") };
		if (obj.erro === "sobrecarregado") return { ok: false, erro: mapearFalhaIA("servidor") };
		return { ok: false, erro: mapearFalhaIA("desconhecido") };
	} catch (e) {
		const abortado = e instanceof DOMException && e.name === "AbortError";
		return { ok: false, erro: mapearFalhaIA(abortado ? "timeout" : "offline") };
	} finally {
		clearTimeout(timer);
	}
}
