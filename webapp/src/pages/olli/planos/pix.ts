import { supabase } from "@/lib/supabase";

/**
 * PLANO POR PIX — mesmo Worker do checkout por cartão (`checkout.ts`), rotas `/abacate/*`.
 * Decisão do dono (29/09/2026): o checkout só de cartão perdeu um cliente real (abriu 3x e
 * desistiu); o prestador pequeno paga no Pix. Pix NÃO renova sozinho: paga-se um período
 * (1 mês ou 12 meses) e, perto do vencimento, paga-se de novo.
 *
 * Contrato do Worker (worker/src/abacate.js):
 *   GET  /abacate/config       (sem auth)  → { ok:true, pix:boolean, modo }
 *   POST /abacate/plano/pix    (JWT)       body { plano: PlanoPix }
 *        200 { ok:true, id, brCode, brCodeBase64 (data URI), status, expiresAt, plano:{ id, nome, meses, valor } }
 *        400 plano_invalido · 401 nao_autorizado · 429 muitas_requisicoes
 *        503 pix_desligado · 502 falha_criar_pix
 *   GET  /abacate/status?id=   (JWT)       → { ok:true, pago, liberado }
 *        404 nao_encontrado · 502 falha_status (transitório: continua consultando)
 *        Quando `pago` é true o SERVIDOR já liberou o plano — o painel nunca libera nada.
 *
 * ═══ NUNCA MODO DEMO ═══
 * O botão de Pix só existe quando `/abacate/config` diz `pix:true`. Falha ao consultar a
 * config = sem botão (não sabemos, então não prometemos). Nada aqui simula QR nem
 * pagamento: ou funciona de verdade, ou fica desligado.
 *
 * ═══ ERRO NUNCA VIRA VAZIO ═══
 * Nenhuma função lança. Falha volta tipada e a tela mostra estado honesto com
 * "Tentar de novo". Em especial, `consultarStatusPix` separa "ainda não pagou"
 * (`pago:false`) de "não consegui perguntar" (`ok:false`): o segundo NUNCA é lido como
 * o primeiro, nem como "pago".
 */

/** Base do Worker de pagamentos — a MESMA do checkout por cartão. */
const PAGAMENTOS_URL = (
	(import.meta.env.VITE_PAGAMENTOS_URL as string | undefined) ??
	(import.meta.env.VITE_DIAGNOSTICO_URL as string | undefined) ??
	"https://diagnostico.olliorcamentos.online"
).replace(/\/+$/, "");

/** Timeout de campo: conexão instável não pode travar o botão para sempre. */
const TIMEOUT_MS = 20_000;

/** Chaves do catálogo de Pix do worker (`PLANO_PIX`). */
export type PlanoPix = "pro_mensal" | "pro_anual" | "empresa_mensal" | "empresa_anual";

export type TipoFalhaPix = "timeout" | "offline" | "servidor" | "limite" | "auth" | "desligado" | "desconhecido";

export interface FalhaPix {
	tipo: TipoFalhaPix;
	titulo: string;
	mensagem: string;
}

/** Copy única por motivo de falha — honesta, na voz da OLLI, sem jargão de erro. */
export function mapearFalhaPix(tipo: TipoFalhaPix): FalhaPix {
	switch (tipo) {
		case "timeout":
			return {
				tipo,
				titulo: "Demorou demais para gerar o Pix",
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
				titulo: "Não consegui gerar o Pix agora",
				mensagem: "Foi um tropeço do nosso lado. Nenhuma cobrança foi feita — tente de novo em instantes.",
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
				mensagem: "Entre de novo na sua conta para continuar.",
			};
		case "desligado":
			return {
				tipo,
				titulo: "Pix indisponível no momento",
				mensagem: "Você ainda pode assinar no cartão ou pelo WhatsApp.",
			};
		default:
			return {
				tipo,
				titulo: "Algo não saiu como esperado",
				mensagem: "Não consegui gerar o Pix agora. Tente de novo em instantes.",
			};
	}
}

/** Lê o token da sessão; `null` quando não há sessão (ou a leitura falhou). */
async function lerToken(): Promise<string | null> {
	try {
		const { data } = await supabase.auth.getSession();
		return data.session?.access_token ?? null;
	} catch {
		return null;
	}
}

/** Classifica falhas de rede: aborto do timeout × sem conexão. */
function falhaDeRede(e: unknown): FalhaPix {
	const abortado = e instanceof DOMException && e.name === "AbortError";
	return mapearFalhaPix(abortado ? "timeout" : "offline");
}

/** Mapeia status/erro HTTP comuns às falhas tipadas. */
function falhaDeResposta(status: number, erro: string | undefined): FalhaPix {
	if (status === 401 || erro === "nao_autorizado") return mapearFalhaPix("auth");
	if (status === 429 || erro === "muitas_requisicoes") return mapearFalhaPix("limite");
	if (status === 503 || erro === "pix_desligado") return mapearFalhaPix("desligado");
	if (status >= 500) return mapearFalhaPix("servidor");
	return mapearFalhaPix("desconhecido");
}

/* ─────────────────────────────  /abacate/config  ───────────────────────────── */

/**
 * O Pix está ligado de verdade? Só `true` explícito liga. Qualquer falha (rede, 5xx,
 * corpo estranho) devolve `false`: sem certeza, sem botão.
 */
export async function pixDisponivel(): Promise<boolean> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const r = await fetch(`${PAGAMENTOS_URL}/abacate/config`, { signal: controller.signal });
		if (!r.ok) return false;
		const data: unknown = await r.json().catch(() => null);
		const obj = (data ?? {}) as { ok?: boolean; pix?: unknown };
		return obj.ok === true && obj.pix === true;
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}

/* ───────────────────────────  /abacate/plano/pix  ─────────────────────────── */

/** Cobrança Pix criada — o que a tela precisa para mostrar o QR e acompanhar. */
export interface CobrancaPix {
	id: string;
	/** Código "copia e cola". */
	brCode: string;
	/** QR como `data:image/png;base64,…` (já pronto para `<img src>`). */
	qrCodeUri: string;
	/** ISO — o Pix vale ~1h. `null` se o worker não informou. */
	expiraEm: string | null;
	plano: { id: string; nome: string; meses: number; valor: number };
}

export type ResultadoCriarPix = { ok: true; cobranca: CobrancaPix } | { ok: false; erro: FalhaPix };

/** Pede ao worker um Pix para `plano`. Nunca lança. */
export async function criarPix(plano: PlanoPix): Promise<ResultadoCriarPix> {
	const token = await lerToken();
	if (!token) return { ok: false, erro: mapearFalhaPix("auth") };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const r = await fetch(`${PAGAMENTOS_URL}/abacate/plano/pix`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ plano }),
			signal: controller.signal,
		});

		const data: unknown = await r.json().catch(() => null);
		const obj = (data ?? {}) as {
			ok?: boolean;
			id?: unknown;
			brCode?: unknown;
			brCodeBase64?: unknown;
			expiresAt?: unknown;
			plano?: { id?: unknown; nome?: unknown; meses?: unknown; valor?: unknown };
			erro?: string;
		};

		const p = obj.plano;
		if (
			r.ok &&
			obj.ok === true &&
			typeof obj.id === "string" &&
			obj.id &&
			typeof obj.brCode === "string" &&
			obj.brCode &&
			p &&
			typeof p.id === "string" &&
			typeof p.nome === "string" &&
			typeof p.meses === "number" &&
			typeof p.valor === "number"
		) {
			return {
				ok: true,
				cobranca: {
					id: obj.id,
					brCode: obj.brCode,
					qrCodeUri: typeof obj.brCodeBase64 === "string" ? obj.brCodeBase64 : "",
					expiraEm: typeof obj.expiresAt === "string" ? obj.expiresAt : null,
					plano: { id: p.id, nome: p.nome, meses: p.meses, valor: p.valor },
				},
			};
		}
		return { ok: false, erro: falhaDeResposta(r.status, obj.erro) };
	} catch (e) {
		return { ok: false, erro: falhaDeRede(e) };
	} finally {
		clearTimeout(timer);
	}
}

/* ─────────────────────────────  /abacate/status  ───────────────────────────── */

/**
 * `pago:true` → o servidor JÁ liberou o plano.
 * `pago:false` → a resposta afirmou que ainda não foi pago.
 * `ok:false` → não consegui perguntar; `transitorio` diz se vale continuar consultando
 * (rede/502/429) ou se é definitivo (sessão inválida, cobrança inexistente).
 */
export type ResultadoStatusPix = { ok: true; pago: boolean } | { ok: false; transitorio: boolean; erro: FalhaPix };

/** Consulta se a cobrança `id` foi paga. Nunca lança. */
export async function consultarStatusPix(id: string): Promise<ResultadoStatusPix> {
	const token = await lerToken();
	if (!token) return { ok: false, transitorio: false, erro: mapearFalhaPix("auth") };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const r = await fetch(`${PAGAMENTOS_URL}/abacate/status?id=${encodeURIComponent(id)}`, {
			headers: { Authorization: `Bearer ${token}` },
			signal: controller.signal,
		});
		const data: unknown = await r.json().catch(() => null);
		const obj = (data ?? {}) as { ok?: boolean; pago?: unknown; erro?: string };

		if (r.ok && obj.ok === true && typeof obj.pago === "boolean") return { ok: true, pago: obj.pago };

		const erro = falhaDeResposta(r.status, obj.erro);
		// Sessão inválida, Pix desligado e cobrança inexistente não melhoram sozinhos.
		const definitivo = erro.tipo === "auth" || erro.tipo === "desligado" || r.status === 404 || r.status === 400;
		return { ok: false, transitorio: !definitivo, erro };
	} catch (e) {
		return { ok: false, transitorio: true, erro: falhaDeRede(e) };
	} finally {
		clearTimeout(timer);
	}
}
