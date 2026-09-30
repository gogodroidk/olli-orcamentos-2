/**
 * PIX DO PLANO — a landing só fala de Pix quando o Pix está ligado DE VERDADE.
 *
 * ═══ POR QUE ISTO EXISTE ═══
 *
 * O plano Pro/Empresa pode ser pago por Pix (1 mês ou 1 ano, sem renovação
 * automática) desde 29/09/2026 — `worker/src/abacate.js`. O checkout só de cartão
 * perdeu cliente real, e a landing não dizia uma palavra sobre Pix. Mas a mesma
 * rota tem um interruptor: sem chave de produção ela fica DESLIGADA, e o app e o
 * painel escondem o botão (`/abacate/config` → `pix:false`).
 *
 * A landing é SSG: não dá para perguntar ao worker a cada visita sem JS. Então a
 * pergunta é feita UMA VEZ, no BUILD, à mesma rota pública que o app e o painel
 * consultam. Se a resposta não for um `pix:true` explícito, a página sai sem
 * nenhuma promessa de Pix.
 *
 * ═══ TRÊS ESTADOS, NUNCA DOIS ═══
 *
 *  - `ligado`      → o worker disse `ok:true, pix:true`. A copy fala de Pix.
 *  - `desligado`   → o worker respondeu, e o Pix está desligado. Sem Pix na copy.
 *  - `desconhecido`→ rede, timeout, 5xx ou corpo estranho. Sem Pix na copy — "não
 *                    sei" NÃO vira "tem" (é o bug recorrente da casa) — e o build
 *                    AVISA no console, para quem publica perceber que a landing saiu
 *                    sem Pix por falta de resposta, não por decisão.
 *
 * Fail-closed de propósito: prometer um Pix que o botão não entrega é pior que
 * não mencionar um Pix que existe. O preço do Pix é o MESMO catálogo do cartão
 * (`PLANO_PIX` em `worker/src/mercadopago.js`) — travado por
 * `scripts/teste-landing-honesta.ts`, então a copy não precisa repetir número.
 *
 * `OLLI_PIX_LANDING=desligado` no ambiente força a página sem Pix (build offline,
 * emergência). Não existe o contrário: ligar à força seria o modo demo que o dono
 * proibiu.
 */

/** O mesmo worker de pagamentos do app (`src/services/pixPlano.ts`) e do painel. */
const PAGAMENTOS_URL = "https://diagnostico.olliorcamentos.online";

/** Build não pode travar esperando a rede. */
const TIMEOUT_MS = 8_000;

export type EstadoPix = "ligado" | "desligado" | "desconhecido";

async function consultarPixNoBuild(): Promise<EstadoPix> {
	// `globalThis.process` e não `process`: este módulo roda no Node do build, mas o
	// tsconfig do Astro não carrega os tipos do Node.
	const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
	if (env?.OLLI_PIX_LANDING === "desligado") return "desligado";

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const r = await fetch(`${PAGAMENTOS_URL}/abacate/config`, { signal: controller.signal });
		if (!r.ok) return "desconhecido";
		const data: unknown = await r.json().catch(() => null);
		const obj = (data ?? {}) as { ok?: unknown; pix?: unknown };
		if (obj.ok !== true || typeof obj.pix !== "boolean") return "desconhecido";
		return obj.pix ? "ligado" : "desligado";
	} catch {
		return "desconhecido";
	} finally {
		clearTimeout(timer);
	}
}

export const ESTADO_PIX: EstadoPix = await consultarPixNoBuild();

if (ESTADO_PIX === "desconhecido") {
	console.warn(
		"[pix] Não foi possível confirmar /abacate/config no build — a landing sai SEM " +
			"mencionar Pix. Rode o build de novo com rede para publicar a copy do Pix.",
	);
}

/** A única pergunta que a copy faz: posso falar de Pix? */
export const PIX_PLANO_LIGADO = ESTADO_PIX === "ligado";
