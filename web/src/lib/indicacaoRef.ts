/**
 * CÓDIGO DE INDICAÇÃO ("colega indica colega") — guarda o `?ref=K7M2QX` do link
 * https://olliorcamentos.online/?ref=K7M2QX até o cadastro, para o painel vincular.
 *
 * Fonte ÚNICA da landing (`web/src/scripts/marketing.ts`) e do painel
 * (`webapp/src/lib/indicacaoRef.ts`, via alias `@indicacaoRef`). Módulo puro, sem DOM
 * no topo: o navegador entra pelo `AmbienteRef` (injetável nos testes).
 *
 * ONDE GUARDA: cookie `olli_ref` (Domain=.olliorcamentos.online, atravessa landing e
 * painel) + localStorage `olli_ref` por origem. Valor `<CODIGO>.<ts>`, validade 30 dias.
 * NÃO é o `olli_attr` (JSON de UTM) — são chaves separadas.
 *
 * CONSENTIMENTO: não depende do banner. É um código que a PRÓPRIA pessoa trouxe no
 * link, guardado só para vincular o cadastro dela a quem a indicou (funcional/necessário
 * ao serviço pedido, LGPD art. 7º, V e IX). Não vai a terceiros (nem Meta, nem Google);
 * só o worker da OLLI o recebe, no cadastro. Visita sem `?ref` válido não grava nada.
 */

import { DOMINIO_COOKIE, lerCookie } from "./atribuicao.ts";

export const CHAVE_REF = "olli_ref";
export const VALIDADE_REF_DIAS = 30;
const VALIDADE_REF_SEGUNDOS = VALIDADE_REF_DIAS * 24 * 60 * 60;
const VALIDADE_REF_MS = VALIDADE_REF_SEGUNDOS * 1000;
/** Tolerância a relógio de aparelho adiantado. */
const TOLERANCIA_FUTURO_MS = 24 * 60 * 60 * 1000;

export interface AmbienteRef {
	host: string;
	protocolo: string;
	lerCookies(): string;
	gravarCookie(cookie: string): void;
	lerLocal(): string | null;
	gravarLocal(valor: string): void;
	apagarLocal(): void;
}

/** Normaliza: trim + maiúsculas; só `[A-Z0-9]{6}` passa. */
export function normalizarRef(bruto: unknown): string | null {
	if (typeof bruto !== "string") return null;
	const codigo = bruto.trim().toUpperCase();
	return /^[A-Z0-9]{6}$/.test(codigo) ? codigo : null;
}

/** Lê `?ref=` de uma query string. `null` = ausente ou inválido. */
export function lerRefDaUrl(search: string): string | null {
	try {
		return normalizarRef(new URLSearchParams(search).get("ref"));
	} catch {
		return null;
	}
}

function nossoHost(host: string): boolean {
	return host === "olliorcamentos.online" || host.endsWith(".olliorcamentos.online");
}

function montarCookieRef(valor: string, host: string, protocolo: string, maxAge: number): string {
	const dominio = nossoHost(host) ? `; Domain=${DOMINIO_COOKIE}` : "";
	const seguro = protocolo === "https:" ? "; Secure" : "";
	return `${CHAVE_REF}=${encodeURIComponent(valor)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${seguro}${dominio}`;
}

/** `<CODIGO>.<ts>` válido e dentro de 30 dias → `{ codigo, ts }`. */
function interpretar(bruto: string | null, agoraMs: number): { codigo: string; ts: number } | null {
	if (!bruto) return null;
	const ponto = bruto.indexOf(".");
	if (ponto < 0) return null;
	const crua = bruto.slice(0, ponto);
	const codigo = normalizarRef(crua);
	const ts = Number(bruto.slice(ponto + 1));
	if (!codigo || codigo !== crua || !Number.isFinite(ts)) return null;
	if (agoraMs - ts > VALIDADE_REF_MS || ts - agoraMs > TOLERANCIA_FUTURO_MS) return null;
	return { codigo, ts };
}

/** Guarda o código (cookie do domínio + localStorage). Código inválido não grava. */
export function gravarRef(amb: AmbienteRef, codigo: string, agoraMs: number): boolean {
	const limpo = normalizarRef(codigo);
	if (!limpo) return false;
	const valor = `${limpo}.${agoraMs}`;
	amb.gravarLocal(valor);
	amb.gravarCookie(montarCookieRef(valor, amb.host, amb.protocolo, VALIDADE_REF_SEGUNDOS));
	return true;
}

/** Código guardado e ainda válido (o mais recente entre cookie e localStorage), ou `null`. */
export function lerRef(amb: AmbienteRef, agoraMs: number): string | null {
	const doCookie = interpretar(lerCookie(amb.lerCookies(), CHAVE_REF), agoraMs);
	const doLocal = interpretar(amb.lerLocal(), agoraMs);
	if (doCookie && doLocal) return (doCookie.ts >= doLocal.ts ? doCookie : doLocal).codigo;
	return (doCookie ?? doLocal)?.codigo ?? null;
}

/** Apaga cookie e localStorage. */
export function limparRef(amb: AmbienteRef): void {
	amb.apagarLocal();
	amb.gravarCookie(montarCookieRef("", amb.host, amb.protocolo, 0));
}

/**
 * Landing: chamada UMA vez por carga. Só grava se a URL trouxe `?ref` válido;
 * devolve o código gravado (ou `null`).
 */
export function capturarRef(amb: AmbienteRef, search: string, agoraMs: number): string | null {
	const codigo = lerRefDaUrl(search);
	if (!codigo) return null;
	return gravarRef(amb, codigo, agoraMs) ? codigo : null;
}

let tentouNestaCarga = false;

/** Só para teste. */
export function reiniciarTentativaIndicacao(): void {
	tentouNestaCarga = false;
}

export interface OpcoesVinculo {
	worker: string;
	ambiente: AmbienteRef | null;
	agoraMs: number;
	fetchImpl?: typeof fetch;
}

/**
 * Painel, após login/cadastro: se há ref guardado, POST /indicacao/vincular.
 * 200 (qualquer status de negócio) limpa; rede/não-200 MANTÉM para o próximo login.
 * Nunca lança; no máximo UMA tentativa por carga de página.
 */
export async function vincularIndicacaoPendente(token: string | null | undefined, op: OpcoesVinculo): Promise<void> {
	try {
		if (tentouNestaCarga || !token || !op.ambiente) return;
		const codigo = lerRef(op.ambiente, op.agoraMs);
		if (!codigo) return;
		tentouNestaCarga = true;
		const resposta = await (op.fetchImpl ?? fetch)(`${op.worker.replace(/\/+$/, "")}/indicacao/vincular`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ codigo }),
		});
		if (resposta.status === 200) limparRef(op.ambiente);
	} catch {
		// Rede fora: o código fica guardado para o próximo login.
	}
}

/** Ambiente real do navegador. `null` em SSR/build. Todo acesso a storage é à prova de exceção. */
export function ambienteRefDoNavegador(): AmbienteRef | null {
	if (typeof window === "undefined" || typeof document === "undefined") return null;
	return {
		host: window.location.hostname.toLowerCase(),
		protocolo: window.location.protocol,
		lerCookies: () => {
			try {
				return document.cookie;
			} catch {
				return "";
			}
		},
		gravarCookie: (cookie) => {
			try {
				document.cookie = cookie;
			} catch {
				// Cookie bloqueado: o localStorage ainda guarda.
			}
		},
		lerLocal: () => {
			try {
				return window.localStorage.getItem(CHAVE_REF);
			} catch {
				return null;
			}
		},
		gravarLocal: (valor) => {
			try {
				window.localStorage.setItem(CHAVE_REF, valor);
			} catch {
				// Modo privado: o cookie ainda guarda.
			}
		},
		apagarLocal: () => {
			try {
				window.localStorage.removeItem(CHAVE_REF);
			} catch {
				// idem
			}
		},
	};
}
