# Runbook de secrets e canário — OLLI staging

Este documento não contém valores de secrets. Ele descreve a ordem segura para
habilitar o ambiente de teste depois que o proprietário fornecer credenciais
de teste pelos painéis oficiais.

## Pré-condições

- projeto Supabase: `sbpkutknpywezeagioon` (`sa-east-1`);
- Worker: `olli-diagnostico-staging`;
- URL: `https://olli-diagnostico-staging.igoreluisa.workers.dev`;
- branch validada: `codex/piloto-p0`;
- produção continua fora deste procedimento;
- nenhum destinatário real é permitido: o simulador Resend usa somente
  `delivered@resend.dev`.

## Nomes exigidos

Os nomes abaixo são os nomes reais esperados pelo código do Worker no ambiente
`staging`. O valor nunca deve ser salvo no Git, no terminal compartilhado ou em
logs:

```text
SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
MP_ACCESS_TOKEN
MP_WEBHOOK_SECRET
OLLI_ROUTES_API_KEY
```

## Provisionamento controlado

Execute cada comando em terminal privado, substituindo `<valor-de-teste>` sem
ecoar o valor em histórico de shell:

```powershell
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
npx wrangler secret put OPENROUTER_API_KEY --env staging
npx wrangler secret put RESEND_API_KEY --env staging
npx wrangler secret put RESEND_WEBHOOK_SECRET --env staging
npx wrangler secret put STRIPE_SECRET_KEY --env staging
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env staging
npx wrangler secret put MP_ACCESS_TOKEN --env staging
npx wrangler secret put MP_WEBHOOK_SECRET --env staging
npx wrangler secret put OLLI_ROUTES_API_KEY --env staging
```

Depois, verifique somente nomes:

```powershell
npx wrangler secret list --env staging
```

O resultado deve ser comparado aos nomes em `ops/olli-environments.json`; os
valores não devem ser impressos nem copiados para a documentação.

## Ativação do simulador

1. Confirmar que os nove nomes estão presentes.
2. Alterar somente o ambiente `staging` para
   `WELCOME_DISPATCH_MODE=simulator` e manter `WELCOME_BATCH_LIMIT=1`.
3. Fazer deploy explícito com `npx wrangler deploy --env staging`.
4. Rodar `npm run staging:smoke`.
5. Criar/confirmar apenas uma fixture sintética no Supabase staging, com
   destinatário `delivered@resend.dev`.
6. Observar claim/settle e confirmar zero linhas sintéticas remanescentes.
7. Reverter imediatamente para `WELCOME_DISPATCH_MODE=off` se qualquer etapa
   retornar erro, destinatário inesperado ou falha de assinatura.

## Rollback

```powershell
npx wrangler deploy --env staging
npx wrangler secret list --env staging
```

O rollback de dados usa as migrations/retry documentadas em
`ops/staging/MIGRATION_CHECKPOINT.md`; não há `DROP`, limpeza de produção ou
reescrita do histórico Git neste runbook.

## Gate final

Este runbook não autoriza conexão GitHub→Cloudflare, secrets reais, cobrança,
envio a pessoas ou promoção. Cada um desses efeitos continua exigindo a
confirmação correspondente no momento da ação.
