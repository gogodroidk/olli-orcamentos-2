// Turnstile no cadastro/login/recuperação: token só quando ligado, falha clara, CSP e config sem segredo.
import { readFileSync } from 'node:fs';
import {
  ErroCaptcha,
  captchaAtivo,
  htmlTurnstile,
  lerMensagemCaptcha,
  obterTokenCaptcha,
  opcoesCaptcha,
} from '../src/services/captcha.ts';

let falhas = 0;
function checar(cond: boolean, msg: string) {
  if (cond) console.log(`  ok   ${msg}`);
  else { falhas += 1; console.log(`  FALHA ${msg}`); }
}
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Desligado (sem sitekey): comportamento de antes, nenhum token, nenhuma exceção.
checar(!captchaAtivo(''), 'sem sitekey = captcha desligado');
checar((await obterTokenCaptcha({ siteKey: '' })) === undefined, 'desligado devolve undefined');
checar(JSON.stringify(opcoesCaptcha(undefined)) === '{}', 'sem token não manda captchaToken');
checar(opcoesCaptcha('tok').captchaToken === 'tok', 'com token manda captchaToken');

// Ligado: devolve o token do provedor.
checar((await obterTokenCaptcha({ siteKey: 'k', provedor: async () => 'abc' })) === 'abc', 'ligado devolve o token');

// Ligado e quebrado: falha CLARA (nunca segue sem token).
async function falha(opts: Parameters<typeof obterTokenCaptcha>[0]) {
  try { await obterTokenCaptcha(opts); return null; } catch (e) { return e; }
}
checar((await falha({ siteKey: 'k', provedor: null })) instanceof ErroCaptcha, 'ligado sem provedor lança ErroCaptcha');
checar((await falha({ siteKey: 'k', provedor: async () => { throw new Error('x'); } })) instanceof ErroCaptcha, 'provedor que quebra vira ErroCaptcha');
checar((await falha({ siteKey: 'k', provedor: async () => '' })) instanceof ErroCaptcha, 'token vazio lança ErroCaptcha');
checar((await falha({ siteKey: 'k', timeoutMs: 20, provedor: () => new Promise<string>(() => {}) })) instanceof ErroCaptcha, 'provedor que trava estoura o tempo');

// Ponte do WebView nativo.
checar(lerMensagemCaptcha('{"tipo":"token","token":"t"}')?.tipo === 'token', 'mensagem token lida');
checar(lerMensagemCaptcha('{"tipo":"interativo"}')?.tipo === 'interativo', 'mensagem interativo lida');
checar(lerMensagemCaptcha('lixo') === null, 'mensagem inválida ignorada');
checar(lerMensagemCaptcha('{"tipo":"token","token":""}') === null, 'token vazio ignorado');
const html = htmlTurnstile('</script><x>');
checar(!html.includes('</script><x>') && html.includes('interaction-only'), 'html escapa a sitekey e usa modo managed (interaction-only)');

// Todo ponto de auth do app/painel passa pelo captcha.
for (const [arq, trechos] of Object.entries({
  'src/services/supabase.ts': ['signUp({', 'signInWithPassword({', 'signInWithOtp({', 'resetPasswordForEmail('],
  'webapp/src/pages/sys/login/register-form.tsx': ['signUp({'],
  'webapp/src/store/userStore.ts': ['signInWithPassword({'],
  'webapp/src/pages/sys/login/codigo-form.tsx': ['signInWithOtp({'],
  'webapp/src/pages/sys/login/reset-form.tsx': ['resetPasswordForEmail('],
  'webapp/src/pages/sys/login/confirmar.tsx': ['resetPasswordForEmail(', 'signInWithOtp(', '.resend('],
})) {
  const s = ler(arq);
  checar(s.includes('obterTokenCaptcha') && s.includes('opcoesCaptcha'), `${arq} pede o token`);
  for (const t of trechos) {
    // cada chamada precisa ter captcha na vizinhança (até 400 caracteres depois)
    let ok = true;
    for (let i = s.indexOf(t); i !== -1; i = s.indexOf(t, i + 1)) ok = ok && /captcha/i.test(s.slice(i, i + 400));
    checar(ok, `${arq}: ${t} leva captcha`);
  }
}

// Config: captcha ligado com Turnstile e secret só por variável.
const toml = ler('supabase/config.toml');
const bloco = toml.match(/^\[auth\.captcha\]\r?\n([\s\S]*?)(?:\r?\n\[|(?![\s\S]))/m)?.[1] ?? '';
checar(/^enabled\s*=\s*true/m.test(bloco), 'config.toml: [auth.captcha] enabled = true');
checar(/^provider\s*=\s*"turnstile"/m.test(bloco), 'config.toml: provider turnstile');
checar(/^secret\s*=\s*"env\(SUPABASE_AUTH_CAPTCHA_SECRET\)"/m.test(bloco), 'config.toml: secret por env(), nunca literal');

// CSP do painel libera só o que o Turnstile precisa.
for (const arq of ['webapp/vercel.json', 'webapp/public/_headers']) {
  const csp = ler(arq).match(/Content-Security-Policy[^\n]*/)?.[0] ?? '';
  for (const dir of ['script-src', 'frame-src', 'connect-src']) {
    const parte = csp.match(new RegExp(`${dir}[^;]*`))?.[0] ?? '';
    checar(parte.includes('https://challenges.cloudflare.com'), `${arq}: ${dir} libera challenges.cloudflare.com`);
  }
}

// Sitekey/secret nunca no código.
for (const arq of ['src/services/captcha.ts', 'webapp/src/lib/captcha.ts']) {
  checar(!/0x4[A-Za-z0-9_-]{18,}/.test(ler(arq)), `${arq}: sem sitekey/secret literal`);
}

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ncaptcha: tudo ok');
