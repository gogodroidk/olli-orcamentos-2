# Turnstile (anti-robô) no cadastro, login e recuperação de senha

Item CQ-TURNSTILE-CADASTRO. Objetivo: robô não cria conta falsa (suja o funil e a régua de ativação no WhatsApp).

## Como funciona
- Widget Cloudflare Turnstile em modo **managed / `interaction-only`**: invisível para quem é gente; só aparece desafio se a Cloudflare desconfiar.
- O token vai em `captchaToken` para `signUp`, `signInWithPassword`, `signInWithOtp`, `resetPasswordForEmail` e `resend`.
- App (web e nativo): `src/services/captcha.ts` (+ `CaptchaHost`, WebView, montado em `App.tsx`; o nativo usa `TURNSTILE_BASE_URL`, hostname que precisa estar no widget).
- Painel: `webapp/src/lib/captcha.ts`.
- Sitekey: `EXPO_PUBLIC_TURNSTILE_SITEKEY` (app) e `VITE_TURNSTILE_SITEKEY` (painel). **Vazia = captcha desligado no cliente.** Secret: só no Supabase, nunca no código.
- Ligado e sem conseguir token: erro claro ("não deu para confirmar que você é uma pessoa"), nunca segue sem token.
- Login Google/Apple e `verifyOtp` não passam por captcha (não são gatilhos do Supabase).

## Passo a passo da casa (nada disso foi feito pelo PR)
Ordem importa: com o captcha ligado no Supabase, chamada sem token é recusada. Ligue o servidor por último.

1. **Cloudflare** (Turnstile > Add widget): nome `OLLI cadastro`; hostnames `olliorcamentos.online`, `app.olliorcamentos.online`, `www.olliorcamentos.online` e o do painel; modo **Managed**. Anote a **sitekey** (pública) e o **secret**.
2. Coloque a sitekey nas variáveis de build: `EXPO_PUBLIC_TURNSTILE_SITEKEY` (build web/EAS do app) e `VITE_TURNSTILE_SITEKEY` (build do painel). Faça o deploy do app e do painel com a sitekey.
3. **Supabase** (Dashboard > Authentication > Attack Protection > Enable CAPTCHA protection): provedor **Cloudflare Turnstile**, cole o **secret**, salve. (Alternativa por CLI: `SUPABASE_AUTH_CAPTCHA_SECRET` no ambiente + `supabase config push`; o `config.toml` já está pronto, com o secret por `env()`.)
4. Teste em produção: cadastro, login com senha, "esqueci a senha", código por e-mail e reenvio. Se algo falhar, desligue o CAPTCHA no painel do Supabase (volta ao normal na hora).
5. App nativo (APK/IPA) antigo não tem o widget: depois do passo 3 ele não consegue logar com senha até atualizar. Publique a versão nova antes, ou aceite o corte (versão mínima: ver `test:versao-minima`).

## Desenvolvimento local
Chaves de teste da Cloudflare (sempre passam): sitekey `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`. Sem sitekey no `.env`, nada muda.
