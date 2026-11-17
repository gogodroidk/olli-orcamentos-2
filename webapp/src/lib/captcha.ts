/**
 * Anti-robô (Cloudflare Turnstile) do painel: cadastro, login e recuperação de senha.
 *
 * O captcha do Supabase Auth (provedor `turnstile`) exige `captchaToken` em signUp,
 * signInWithPassword, signInWithOtp, resetPasswordForEmail e resend. Quem chama o
 * Supabase pede o token aqui antes, sem mexer no formulário.
 *
 * - Sem `VITE_TURNSTILE_SITEKEY` o captcha fica DESLIGADO no cliente (como antes).
 *   A sitekey é pública; o secret fica só no painel do Supabase.
 * - Widget `interaction-only` (modo "managed"): invisível para quem é gente; a
 *   Cloudflare só mostra desafio se desconfiar.
 */

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TEMPO_MAXIMO_MS = 20_000;

export class ErroCaptcha extends Error {
	readonly code = "captcha_indisponivel";
	constructor() {
		super("Não deu para confirmar que você é uma pessoa. Tente de novo em instantes.");
		this.name = "ErroCaptcha";
	}
}

type TurnstileGlobal = {
	render: (el: HTMLElement, o: Record<string, unknown>) => string;
	remove: (id: string) => void;
};

let carregando: Promise<TurnstileGlobal> | null = null;

function carregarScript(): Promise<TurnstileGlobal> {
	const w = window as unknown as { turnstile?: TurnstileGlobal };
	if (w.turnstile) return Promise.resolve(w.turnstile);
	if (!carregando) {
		carregando = new Promise<TurnstileGlobal>((ok, falha) => {
			const s = document.createElement("script");
			s.src = SCRIPT_URL;
			s.async = true;
			s.onload = () => (w.turnstile ? ok(w.turnstile) : falha(new ErroCaptcha()));
			s.onerror = () => {
				carregando = null;
				falha(new ErroCaptcha());
			};
			document.head.appendChild(s);
		});
	}
	return carregando;
}

async function tokenNovo(siteKey: string): Promise<string> {
	const ts = await carregarScript();
	return new Promise<string>((ok, falha) => {
		const caixa = document.createElement("div");
		// Só ocupa espaço quando a Cloudflare pede interação (interaction-only).
		caixa.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483000";
		document.body.appendChild(caixa);
		let id = "";
		const limpar = () => {
			try {
				if (id) ts.remove(id);
			} catch {
				/* widget já removido */
			}
			caixa.remove();
		};
		id = ts.render(caixa, {
			sitekey: siteKey,
			appearance: "interaction-only",
			callback: (t: string) => {
				limpar();
				ok(t);
			},
			"error-callback": () => {
				limpar();
				falha(new ErroCaptcha());
			},
		});
	});
}

export function captchaAtivo(siteKey: string = import.meta.env.VITE_TURNSTILE_SITEKEY ?? ""): boolean {
	return siteKey.trim().length > 0;
}

/**
 * Token novo (vale para UMA chamada) ou `undefined` com o captcha desligado.
 * Ligado e sem conseguir o token: lança `ErroCaptcha` em vez de mandar sem token.
 */
export async function obterTokenCaptcha(): Promise<string | undefined> {
	const siteKey = (import.meta.env.VITE_TURNSTILE_SITEKEY ?? "").trim();
	if (!captchaAtivo(siteKey)) return undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			tokenNovo(siteKey),
			new Promise<never>((_, rej) => {
				timer = setTimeout(() => rej(new ErroCaptcha()), TEMPO_MAXIMO_MS);
			}),
		]);
	} catch (e) {
		throw e instanceof ErroCaptcha ? e : new ErroCaptcha();
	} finally {
		if (timer) clearTimeout(timer);
	}
}

/** Opções extras do supabase-js: `{ captchaToken }` quando há token, nada quando não há. */
export function opcoesCaptcha(token: string | undefined): { captchaToken?: string } {
	return token ? { captchaToken: token } : {};
}
