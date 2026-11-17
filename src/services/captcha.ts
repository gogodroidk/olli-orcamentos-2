/**
 * Anti-robô (Cloudflare Turnstile) para cadastro, login e recuperação de senha.
 *
 * O captcha do Supabase Auth (provedor `turnstile`) exige um `captchaToken` em
 * signUp, signInWithPassword, signInWithOtp e resetPasswordForEmail. Este módulo
 * entrega esse token sem mexer nas telas: os serviços de auth chamam
 * `obterTokenCaptcha()` antes de falar com o Supabase.
 *
 * - Sem `EXPO_PUBLIC_TURNSTILE_SITEKEY` o captcha fica DESLIGADO no cliente
 *   (comportamento de antes). A chave é pública (sitekey); o secret fica só no
 *   painel do Supabase e nunca entra no código.
 * - Modo do widget: `interaction-only` (modo "managed"): invisível para quem é
 *   gente; só mostra desafio se a Cloudflare desconfiar.
 * - Na web o provedor é o script da Cloudflare; no nativo é o `CaptchaHost`
 *   (WebView), montado uma vez na raiz do app.
 */

export const TURNSTILE_SITEKEY = (process.env.EXPO_PUBLIC_TURNSTILE_SITEKEY ?? '').trim();
export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** Hostname cadastrado no widget da Cloudflare; o WebView nativo se apresenta com ele. */
export const TURNSTILE_BASE_URL = 'https://app.olliorcamentos.online';
export const TEMPO_MAXIMO_CAPTCHA_MS = 20_000;

export type ProvedorCaptcha = () => Promise<string>;

export class ErroCaptcha extends Error {
  readonly code = 'captcha_indisponivel';
  constructor(msg = 'Não deu para confirmar que você é uma pessoa. Tente de novo em instantes.') {
    super(msg);
    this.name = 'ErroCaptcha';
  }
}

let provedorAtual: ProvedorCaptcha | null = null;

export function registrarProvedorCaptcha(p: ProvedorCaptcha | null): void {
  provedorAtual = p;
}

export function captchaAtivo(siteKey: string = TURNSTILE_SITEKEY): boolean {
  return siteKey.length > 0;
}

/**
 * Devolve um token novo (cada token vale uma chamada só) ou `undefined` quando o
 * captcha está desligado. Se está ligado e não for possível obter o token, lança
 * `ErroCaptcha` — melhor falhar claro do que mandar a chamada sem token.
 */
export async function obterTokenCaptcha(
  opts: { siteKey?: string; provedor?: ProvedorCaptcha | null; timeoutMs?: number } = {},
): Promise<string | undefined> {
  if (!captchaAtivo(opts.siteKey ?? TURNSTILE_SITEKEY)) return undefined;
  const provedor = opts.provedor === undefined ? provedorAtual : opts.provedor;
  if (!provedor) throw new ErroCaptcha();
  const limite = opts.timeoutMs ?? TEMPO_MAXIMO_CAPTCHA_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const token = await Promise.race([
      provedor(),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new ErroCaptcha()), limite);
      }),
    ]);
    if (!token) throw new ErroCaptcha();
    return token;
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

/** Página mínima que roda dentro do WebView nativo e devolve o token por postMessage. */
export function htmlTurnstile(siteKey: string): string {
  const chave = JSON.stringify(siteKey).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:transparent;display:flex;align-items:center;justify-content:center;height:100%}</style>
<script src="${TURNSTILE_SCRIPT_URL}&onload=ini" async defer></script>
<script>
function enviar(o){window.ReactNativeWebView.postMessage(JSON.stringify(o))}
function ini(){turnstile.render('#w',{sitekey:${chave},appearance:'interaction-only',
callback:function(t){enviar({tipo:'token',token:t})},
'error-callback':function(){enviar({tipo:'erro'})},
'before-interactive-callback':function(){enviar({tipo:'interativo'})},
'after-interactive-callback':function(){enviar({tipo:'fim-interativo'})}})}
</script></head><body><div id="w"></div></body></html>`;
}

/** Interpreta a mensagem do WebView; qualquer coisa fora do combinado vira null. */
export function lerMensagemCaptcha(
  bruto: string,
): { tipo: 'token'; token: string } | { tipo: 'erro' | 'interativo' | 'fim-interativo' } | null {
  try {
    const m = JSON.parse(bruto);
    if (m?.tipo === 'token' && typeof m.token === 'string' && m.token) return { tipo: 'token', token: m.token };
    if (m?.tipo === 'erro' || m?.tipo === 'interativo' || m?.tipo === 'fim-interativo') return { tipo: m.tipo };
  } catch {
    /* mensagem que não é JSON: ignora */
  }
  return null;
}

// ─── Provedor da web (script da Cloudflare direto na página) ────────────────
type TurnstileGlobal = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

let carregandoScript: Promise<TurnstileGlobal> | null = null;

function carregarScriptWeb(): Promise<TurnstileGlobal> {
  const w = window as unknown as { turnstile?: TurnstileGlobal };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  if (!carregandoScript) {
    carregandoScript = new Promise<TurnstileGlobal>((ok, falha) => {
      const s = document.createElement('script');
      s.src = TURNSTILE_SCRIPT_URL;
      s.async = true;
      s.onload = () => (w.turnstile ? ok(w.turnstile) : falha(new ErroCaptcha()));
      s.onerror = () => {
        carregandoScript = null;
        falha(new ErroCaptcha());
      };
      document.head.appendChild(s);
    });
  }
  return carregandoScript;
}

async function tokenWeb(): Promise<string> {
  const ts = await carregarScriptWeb();
  return new Promise<string>((ok, falha) => {
    const caixa = document.createElement('div');
    // Só ocupa espaço quando a Cloudflare pede interação (modo interaction-only).
    caixa.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483000';
    document.body.appendChild(caixa);
    let id = '';
    const limpar = () => {
      try {
        if (id) ts.remove(id);
      } catch {
        /* widget já removido */
      }
      caixa.remove();
    };
    id = ts.render(caixa, {
      sitekey: TURNSTILE_SITEKEY,
      appearance: 'interaction-only',
      callback: (t: string) => {
        limpar();
        ok(t);
      },
      'error-callback': () => {
        limpar();
        falha(new ErroCaptcha());
      },
    });
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && captchaAtivo()) {
  registrarProvedorCaptcha(tokenWeb);
}
