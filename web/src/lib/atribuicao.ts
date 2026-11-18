/**
 * ATRIBUIÇÃO DE MARKETING — de onde veio quem se cadastrou.
 *
 * Fonte ÚNICA compartilhada pela landing (`web/src/scripts/marketing.ts`) e pelo
 * painel (`webapp/src/lib/marketing.ts`, via alias `@atribuicao`) — o mesmo padrão
 * de `planos.ts`. Módulo TypeScript puro, zero imports, sem DOM no topo: a parte
 * que toca `document`/`localStorage` entra pelo `Ambiente`, e é por isso que o
 * parser e a persistência têm teste unitário (`scripts/teste-atribuicao-marketing.ts`).
 *
 * O QUE GUARDA
 *   utm_source/medium/campaign/content/term + fbclid + gclid, em DOIS toques:
 *   `primeiro` (first-touch: nunca é sobrescrito) e `ultimo` (last-touch: troca a
 *   cada visita que traga parâmetro — visita direta NÃO apaga a campanha).
 *
 * ONDE GUARDA
 *   - cookie `olli_attr` com `Domain=.olliorcamentos.online`: a landing grava, o
 *     painel (app.olliorcamentos.online) lê. É o que atravessa os dois sites.
 *   - localStorage `olli_attr` em cada origem: rede de segurança para navegador que
 *     recusa cookie e para a URL do painel perder o `?utm_*` depois do login.
 *   Validade de 90 dias, contada pelo carimbo de cada toque (não pelo cookie).
 *
 * PRIVACIDADE
 *   Só se grava algo quando a URL trouxe parâmetro de campanha. Visitante orgânico
 *   não ganha cookie deste módulo. Valores são truncados e sem caractere de controle.
 *   O que sai daqui para o Supabase é `user_metadata.origem_utm` (sem migration);
 *   ver `montarOrigemUtm`. O texto da política de privacidade cobre isto.
 */

export const CHAVE_ATRIBUICAO = "olli_attr";
export const VALIDADE_DIAS = 90;
export const DOMINIO_COOKIE = ".olliorcamentos.online";
export const HOST_APP = "app.olliorcamentos.online";

const VALIDADE_SEGUNDOS = VALIDADE_DIAS * 24 * 60 * 60;
const VALIDADE_MS = VALIDADE_SEGUNDOS * 1000;
/** Tolerância a relógio de aparelho adiantado: toque "do futuro" além disso é lixo. */
const TOLERANCIA_FUTURO_MS = 24 * 60 * 60 * 1000;
const TAMANHO_MAXIMO_VALOR = 100;
/**
 * `fbclid` e `gclid` são identificadores opacos: cortá-los os invalida (o Meta só casa o clique
 * com o `fbc` se o fbclid estiver inteiro, e fbclid recente passa de 100 caracteres). Teto maior,
 * só para eles; o cookie continua limitado por TAMANHO_MAXIMO_COOKIE.
 */
const TAMANHO_MAXIMO_CLICK_ID = 500;
const CHAVES_CLICK_ID = new Set<string>(["fbclid", "gclid"]);
/** Limite de segurança: o navegador descarta cookie acima de ~4 KB e não avisa. */
const TAMANHO_MAXIMO_COOKIE = 3500;

export const PARAMETROS_ATRIBUICAO = [
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_content",
	"utm_term",
	"fbclid",
	"gclid",
] as const;

export type ParametroAtribuicao = (typeof PARAMETROS_ATRIBUICAO)[number];

/** Um contato com a OLLI vindo de campanha: os parâmetros, quando e em que página. */
export type Toque = { [K in ParametroAtribuicao]?: string } & {
	/** Instante da captura, em ms desde 1970. */
	ts: number;
	/** Caminho (sem query) da página de entrada. */
	pagina?: string;
};

export interface Atribuicao {
	primeiro: Toque | null;
	ultimo: Toque | null;
}

export const ATRIBUICAO_VAZIA: Atribuicao = { primeiro: null, ultimo: null };

/** Tudo o que o módulo precisa do navegador, injetável para o teste. */
export interface Ambiente {
	agora: number;
	host: string;
	protocolo: string;
	pathname: string;
	search: string;
	lerCookies(): string;
	gravarCookie(cookie: string): void;
	lerLocal(): string | null;
	gravarLocal(valor: string): void;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

function limparValor(bruto: unknown, max: number = TAMANHO_MAXIMO_VALOR): string | null {
	if (typeof bruto !== "string") return null;
	const semControle = Array.from(bruto)
		.filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127)
		.join("");
	const valor = semControle.trim().slice(0, max);
	return valor === "" ? null : valor;
}

function limiteDoParametro(chave: string): number {
	return CHAVES_CLICK_ID.has(chave) ? TAMANHO_MAXIMO_CLICK_ID : TAMANHO_MAXIMO_VALOR;
}

/** Lê os parâmetros de campanha de uma query string. `null` = visita sem campanha. */
export function lerToqueDaUrl(search: string, pagina: string | undefined, agora: number): Toque | null {
	const params = new URLSearchParams(search);
	const toque: Toque = { ts: agora };
	let achou = false;
	for (const chave of PARAMETROS_ATRIBUICAO) {
		const valor = limparValor(params.get(chave), limiteDoParametro(chave));
		if (valor) {
			toque[chave] = valor;
			achou = true;
		}
	}
	if (!achou) return null;
	const caminho = limparValor(pagina);
	if (caminho) toque.pagina = caminho;
	return toque;
}

/** Valida um toque vindo de armazenamento (que pode estar velho, corrompido ou adulterado). */
function toqueValido(bruto: unknown, agora: number): Toque | null {
	if (typeof bruto !== "object" || bruto === null) return null;
	const candidato = bruto as Record<string, unknown>;
	const ts = candidato.ts;
	if (typeof ts !== "number" || !Number.isFinite(ts)) return null;
	if (agora - ts > VALIDADE_MS || ts - agora > TOLERANCIA_FUTURO_MS) return null;
	const toque: Toque = { ts };
	let achou = false;
	for (const chave of PARAMETROS_ATRIBUICAO) {
		const valor = limparValor(candidato[chave], limiteDoParametro(chave));
		if (valor) {
			toque[chave] = valor;
			achou = true;
		}
	}
	if (!achou) return null;
	const pagina = limparValor(candidato.pagina);
	if (pagina) toque.pagina = pagina;
	return toque;
}

/** Desserializa. Nunca lança: lixo, vazio ou expirado viram `ATRIBUICAO_VAZIA`. */
export function lerAtribuicao(bruto: string | null | undefined, agora: number): Atribuicao {
	if (!bruto) return ATRIBUICAO_VAZIA;
	try {
		const dados = JSON.parse(bruto) as { primeiro?: unknown; ultimo?: unknown } | null;
		if (typeof dados !== "object" || dados === null) return ATRIBUICAO_VAZIA;
		return {
			primeiro: toqueValido(dados.primeiro, agora),
			ultimo: toqueValido(dados.ultimo, agora),
		};
	} catch {
		return ATRIBUICAO_VAZIA;
	}
}

export function serializarAtribuicao(atribuicao: Atribuicao): string {
	return JSON.stringify({ primeiro: atribuicao.primeiro, ultimo: atribuicao.ultimo });
}

// ─── Regras de first-touch / last-touch ─────────────────────────────────────

/**
 * Une duas fontes (ex.: cookie da landing + localStorage do painel): o `primeiro`
 * é o toque MAIS ANTIGO, o `ultimo` é o MAIS RECENTE.
 */
export function mesclarAtribuicao(a: Atribuicao, b: Atribuicao): Atribuicao {
	const maisAntigo = (x: Toque | null, y: Toque | null) => (x && y ? (x.ts <= y.ts ? x : y) : (x ?? y));
	const maisRecente = (x: Toque | null, y: Toque | null) => (x && y ? (x.ts >= y.ts ? x : y) : (x ?? y));
	return {
		primeiro: maisAntigo(a.primeiro, b.primeiro),
		ultimo: maisRecente(a.ultimo, b.ultimo),
	};
}

/** Soma um toque novo ao estado: first-touch preservado, last-touch trocado. */
export function registrarToque(atual: Atribuicao, toque: Toque | null): Atribuicao {
	if (!toque) return atual;
	return mesclarAtribuicao(atual, { primeiro: toque, ultimo: toque });
}

export function temAtribuicao(atribuicao: Atribuicao): boolean {
	return atribuicao.primeiro !== null || atribuicao.ultimo !== null;
}

// ─── Cookie ─────────────────────────────────────────────────────────────────

export function lerCookie(cookies: string, nome: string): string | null {
	for (const parte of cookies.split(";")) {
		const igual = parte.indexOf("=");
		if (igual < 0 || parte.slice(0, igual).trim() !== nome) continue;
		try {
			return decodeURIComponent(parte.slice(igual + 1).trim());
		} catch {
			return null;
		}
	}
	return null;
}

/** `Domain=.olliorcamentos.online` só nos nossos hosts — em localhost o cookie ficaria inválido. */
export function montarCookie(nome: string, valor: string, host: string, protocolo: string): string {
	const nosso = host === "olliorcamentos.online" || host.endsWith(".olliorcamentos.online");
	const dominio = nosso ? `; Domain=${DOMINIO_COOKIE}` : "";
	const seguro = protocolo === "https:" ? "; Secure" : "";
	return `${nome}=${encodeURIComponent(valor)}; Max-Age=${VALIDADE_SEGUNDOS}; Path=/; SameSite=Lax${seguro}${dominio}`;
}

// ─── Persistência ───────────────────────────────────────────────────────────

/** O que já está guardado (cookie do domínio pai + localStorage desta origem), mesclado. */
export function lerAtribuicaoSalva(amb: Ambiente): Atribuicao {
	const doCookie = lerAtribuicao(lerCookie(amb.lerCookies(), CHAVE_ATRIBUICAO), amb.agora);
	const doLocal = lerAtribuicao(amb.lerLocal(), amb.agora);
	return mesclarAtribuicao(doCookie, doLocal);
}

function persistir(amb: Ambiente, atribuicao: Atribuicao): void {
	const json = serializarAtribuicao(atribuicao);
	amb.gravarLocal(json);
	const cookie = montarCookie(CHAVE_ATRIBUICAO, json, amb.host, amb.protocolo);
	if (cookie.length <= TAMANHO_MAXIMO_COOKIE) amb.gravarCookie(cookie);
}

/**
 * Chamada UMA vez por carregamento de página: junta o que já estava guardado com
 * o que a URL trouxe agora, grava de volta e devolve o estado. Sem campanha em lugar
 * nenhum, não grava nada.
 */
export function capturarAtribuicao(amb: Ambiente): Atribuicao {
	const toque = lerToqueDaUrl(amb.search, amb.pathname, amb.agora);
	const atual = registrarToque(lerAtribuicaoSalva(amb), toque);
	if (temAtribuicao(atual)) persistir(amb, atual);
	return atual;
}

/** Ambiente real do navegador. `null` em SSR/build. Cada acesso a storage é à prova de exceção. */
export function ambienteDoNavegador(): Ambiente | null {
	if (typeof window === "undefined" || typeof document === "undefined") return null;
	return {
		agora: Date.now(),
		host: window.location.hostname.toLowerCase(),
		protocolo: window.location.protocol,
		pathname: window.location.pathname,
		search: window.location.search,
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
				return window.localStorage.getItem(CHAVE_ATRIBUICAO);
			} catch {
				return null;
			}
		},
		gravarLocal: (valor) => {
			try {
				window.localStorage.setItem(CHAVE_ATRIBUICAO, valor);
			} catch {
				// Modo privado / storage cheio: o cookie ainda guarda.
			}
		},
	};
}

// ─── Propagação landing → painel ────────────────────────────────────────────

/**
 * Acrescenta os parâmetros da campanha a um link para o painel. Só mexe em
 * `https://app.olliorcamentos.online/...`, nunca sobrescreve parâmetro que o link já
 * tenha (plano, período, modo) e devolve o href original se nada mudar.
 */
export function anexarAtribuicaoAoLink(href: string, atribuicao: Atribuicao): string {
	const toque = atribuicao.ultimo ?? atribuicao.primeiro;
	if (!toque) return href;
	let url: URL;
	try {
		url = new URL(href, `https://${HOST_APP.replace(/^app\./, "")}`);
	} catch {
		return href;
	}
	if (url.protocol !== "https:" || url.hostname !== HOST_APP) return href;
	let mudou = false;
	for (const chave of PARAMETROS_ATRIBUICAO) {
		const valor = toque[chave];
		if (valor && !url.searchParams.has(chave)) {
			url.searchParams.set(chave, valor);
			mudou = true;
		}
	}
	return mudou ? url.toString() : href;
}

// ─── Gravação no cadastro (Supabase user_metadata) ──────────────────────────

/** Toque como vai para o banco: parâmetros + `capturado_em` legível + página. */
export type ToqueExportado = { [K in ParametroAtribuicao]?: string } & {
	capturado_em: string;
	pagina?: string;
};

/** Valor de `user_metadata.origem_utm`. */
export interface OrigemUtm {
	primeiro_toque?: ToqueExportado;
	ultimo_toque?: ToqueExportado;
	/** Cookies do Meta Pixel, guardados para o futuro envio server-side (CAPI). */
	fbp?: string;
	fbc?: string;
}

function exportarToque(toque: Toque): ToqueExportado {
	const { ts, ...resto } = toque;
	return { ...resto, capturado_em: new Date(ts).toISOString() };
}

/**
 * Monta `origem_utm` para o cadastro. `null` = não há nada a gravar (visita
 * orgânica sem Pixel). `fbc` cai para o formato `fb.1.<ts>.<fbclid>` quando o cookie
 * `_fbc` ainda não existe mas o clique do Facebook foi capturado.
 */
export function montarOrigemUtm(atribuicao: Atribuicao, cookies: string): OrigemUtm | null {
	const origem: OrigemUtm = {};
	if (atribuicao.primeiro) origem.primeiro_toque = exportarToque(atribuicao.primeiro);
	if (atribuicao.ultimo) origem.ultimo_toque = exportarToque(atribuicao.ultimo);

	const fbp = limparValor(lerCookie(cookies, "_fbp"));
	if (fbp) origem.fbp = fbp;

	let fbc = limparValor(lerCookie(cookies, "_fbc"));
	if (!fbc) {
		const clique = atribuicao.ultimo?.fbclid ? atribuicao.ultimo : atribuicao.primeiro?.fbclid ? atribuicao.primeiro : null;
		if (clique?.fbclid) fbc = `fb.1.${clique.ts}.${clique.fbclid}`;
	}
	if (fbc) origem.fbc = fbc;

	return Object.keys(origem).length > 0 ? origem : null;
}
