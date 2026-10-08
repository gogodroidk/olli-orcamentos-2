# E2E (Playwright) — cadastro → orçamento → envio → Pix

Rede 100% simulada: o painel é buildado apontando para hosts falsos (`*.e2e.test`) e `support/backend-mock.mjs` responde GoTrue + PostgREST + worker em memória. Nada toca produção, nada é enviado/pago.

## Rodar (Windows/Git Bash)
```bash
# 1) painel (precisa rodar do webapp canônico: pnpm + junction não resolve em worktree)
cd webapp
VITE_SUPABASE_URL=https://sb.e2e.test VITE_SUPABASE_ANON_KEY=e2e-anon \
VITE_PAGAMENTOS_URL=https://worker.e2e.test VITE_DIAGNOSTICO_URL=https://worker.e2e.test \
VITE_LINK_BASE_URL=https://link.e2e.test \
npx vite build --outDir ../.e2e-dist/painel --emptyOutDir
# 2) landing
cd ../web && npx astro build --outDir ../.e2e-dist/landing-novo
# 3) testes (MSYS_NO_PATHCONV=1 no Git Bash)
cd .. && node --test e2e/painel/fluxo-comercial.spec.mjs e2e/landing/landing.spec.mjs
```
Falha de etapa grava screenshot em `.e2e-out/` e lista os controles visíveis na mensagem.

## Cobertura
Painel (`painel/fluxo-comercial.spec.mjs`): 1 cadastro (E.164 + metadados) · 2 cliente+orçamento (R$ 850,00) · 3 envio bloqueado sem cadastro do negócio (nada publicado/reservado) · 4 Meu negócio · 5 envio WhatsApp (link `/o/<token>`, abrir ≠ enviado, "Já enviei" → enviado + cota confirmada) · 6 Pix (QR, copia-e-cola, só "Pagamento confirmado!" quando o servidor diz pago) · 2b regressão do achado #1.
Landing (`landing/landing.spec.mjs`): home, CTAs para o painel, /planos (preços = `web/src/data/planos.ts`), /para/*, páginas de anúncio, legais, links internos, mobile sem scroll horizontal, SEO básico.

## Limites conhecidos
Mock não valida RLS nem o SQL real (migrations); só o comportamento do cliente. Pix real (AbacatePay) e e-mail não são exercitados. Google/Apple OAuth fora de escopo.
`.e2e-dist/` e `.e2e-out/` não vão ao git.
