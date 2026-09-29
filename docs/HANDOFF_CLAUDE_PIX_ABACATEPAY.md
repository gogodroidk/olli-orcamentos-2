# HANDOFF Claude → Codex — Pix do plano via AbacatePay (29/09/2026)

**Ordem direta do Igor no chat ("tá liberado para deixar tudo perfeito").** Por isso o Claude
aplicou o patch AQUI, na worktree `C:\OLLI_REL`, por cima das suas alterações não commitadas.
**Nada seu foi alterado além dos pontos abaixo.** Backup dos arquivos antes da mudança:
`C:\Users\ADMIN\Desktop\Entregas Claude\OLLI\2026-09-29-pix-abacatepay\backup-OLLI_REL-antes\`.

## Já está em PRODUÇÃO (publicado a partir desta árvore + patch)
- Worker `olli-diagnostico`: o bundle desta árvore era idêntico ao que estava no ar (diff = só a linha
  do sourcemap). Foi publicado com o patch em 29/09 ~15:30 BRT.
- Painel `olli-painel-web`: o deploy é o ccecc10e.
- **Se você publicar worker ou painel a partir de outra base, as rotas `/abacate/*` e o botão de Pix SOMEM.**
  Commite estes arquivos junto com os seus.

## Arquivos
- NOVOS: `worker/src/abacate.js`, `src/services/pixPlano.ts`, `src/components/PixPlanoModal.tsx`,
  `webapp/src/pages/olli/planos/pix.ts`, `webapp/src/pages/olli/planos/DialogPix.tsx`,
  `scripts/teste-abacate-plano-pix.ts`, este arquivo.
- ALTERADOS:
  - `worker/src/index.js`: rota `/abacate/`.
  - `worker/src/mercadopago.js`: `export` em `PLANO_PIX` e `concederPlanoPeriodo`.
  - `worker/wrangler.jsonc`: `ABACATE_RL` 1012/2012.
  - `src/screens/PlanosScreen.tsx`, `src/screens/AssinaturaScreen.tsx`, `src/services/assinatura.ts`.
  - `webapp/src/pages/olli/planos/{index.tsx,tipos.ts}`, `webapp/src/olli/marcaDocumento.ts`.
  - `scripts/teste-roteamento-pagamento.ts`: `/abacate/*` com dono único; a sua `/stripe/status` foi mantida.
  - `scripts/teste-rotas-metodo.ts`, `package.json`: test `test:abacate-plano-pix` na cadeia.
- Origem limpa (commits): branch `claude/wally-user-subscriptions-95a0e5` (7a15fa0, 9fae79c) + patches em
  `Entregas Claude\OLLI\2026-09-29-pix-abacatepay\pix-*.patch`.

## Estado
- `/abacate/config` → `{pix:false, modo:"desligado"}`, porque o secret `ABACATEPAY_API_KEY` do worker é a chave
  de DEV (`abc_dev_`). É fail-closed de propósito: nunca há Pix de mentira.
- Falta a chave de PRODUÇÃO da AbacatePay (humano). Com ela:
  1. `wrangler secret put ABACATEPAY_API_KEY`.
  2. Criar o webhook `POST /v2/webhooks/create` para `/abacate/webhook?webhookSecret=<ABACATE_WEBHOOK_SECRET>`,
     evento `transparent.completed`.
- Testes: `teste-abacate-plano-pix` (37), `roteamento-pagamento`, `rotas-metodo`, `planos-*`, `assinatura-cliente`,
  mais o `tsc` do app e do painel. Todos verdes nesta árvore.

## ATUALIZAÇÃO 29/09 ~15:50: PIX LIGADO EM PRODUÇÃO
- Chave de produção da AbacatePay no cofre (`ABACATEPAY_API_KEY_PROD`) e no worker (`ABACATEPAY_API_KEY`). O dono
  disse que é uma chave de teste e vai trocar depois. Pra trocar: atualizar o cofre e rodar `wrangler secret put ABACATEPAY_API_KEY`.
- A conta está aprovada: gerou um Pix real (devMode false, QR bancário da Woovi). Taxa de R$ 0,80 por Pix.
- `/abacate/config` → `{pix:true, modo:"producao"}`. O botão "Pagar com Pix" já aparece no painel.
- Webhook de produção `webh_prod_QFp0aSXyuQqW1X6RFs3tHc3n` → `/abacate/webhook`, evento `transparent.completed`.
  - A API remove a query da URL cadastrada, mas devolve `?webhookSecret=` na entrega.
  - PROVADO com `wrangler tail`: a entrega de um webhook dev passou pela checagem do segredo.
  - O webhook dev usado no teste foi apagado.
- Falta: o 1º Pix real de R$ 39, pago pelo dono, na conta gogodroidk (plano grátis), em app.olliorcamentos.online/planos.

## ATUALIZAÇÃO 29/09 ~16:40: LEMBRETES DE ASSINATURA NO AR
- A regra fica em `src/services/lembreteAssinatura.ts` e é pura (sem estado nem chamadas externas). O app usa direto, o painel usa pelo alias `@lembreteAssinatura`.
  As adaptações por loja estão em `src/services/lembreteAssinaturaLoja.ts`.
- A faixa aparece no Início do app (celular e desktop) e no Início e em Planos do painel.
  - `/planos?renovar=pix` abre o Pix de renovação.
- Os testes `teste-lembrete-assinatura` (25) e `teste-lembrete-assinatura-loja` (88) estão no `npm test`.
- Aplicado em `C:\OLLI_REL`: o Codex não tinha mudado nada desde a foto 239633b. Backup em `backup-OLLI_REL-antes-lembretes/`, patch em `lembretes.patch`.
  Painel publicado no deploy 921d88b5. O worker não mudou nesta rodada.
- No APK os lembretes só chegam na próxima versão do app.
- Falha anterior a esta rodada, do Codex: `test:auth-lifecycle` está definido mas fora da cadeia do `npm test`, e o `suite-completa` reclama disso.
- Pendente (decisão do dono): ligar o e-mail real.
  - Hoje há 2 travas: `WELCOME_DISPATCH_MODE=simulator` e o `dispatch_scope` padrão `hold`.
  - Criar os e-mails de lembrete.
  - Descartar as 38 boas-vindas atrasadas.
