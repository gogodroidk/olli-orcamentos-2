# Resend webhook — ativação (supressão de bounce/reclamação)

Estado no código (main): tudo já implementado, só falta ligar no painel/segredo.

- Rota: `POST /resend/webhook` (`worker/src/resendWebhook.js`), assinatura Svix verificada antes de qualquer parse; sem `RESEND_WEBHOOK_SECRET` responde 503.
- Idempotência por `svix-id` em `webhook_events`; nenhuma PII do envelope é gravada.
- Supressão: `email.bounced` (só `Permanent`), `email.complained` e `email.suppressed` chamam a RPC `registrar_supressao_email_por_provider`, que grava em `email_supressoes` e cancela itens pendentes da `email_outbox`.
- Envio: o enfileiramento da régua devolve `suprimido` se a conta está em `email_supressoes`.
- Teste: `cd worker && npm run test:resend-webhook`.

## Passo a passo (ação do Igor)

1. **Migration** `supabase/migrations/20260929200000_email_producao_lembretes.sql` precisa estar aplicada no banco (cria `email_supressoes` e as RPCs). Conferir: `select to_regclass('public.email_supressoes');`.
2. **Painel Resend** → Webhooks → Add endpoint. URL: `https://<host-do-worker>/resend/webhook` (a rota de produção do worker; `workers_dev` ou domínio próprio). Eventos: `email.bounced`, `email.complained`, `email.suppressed` (mínimo); opcionais `email.delivered`, `email.delivery_delayed`, `email.failed`.
3. Copiar o *Signing secret* (`whsec_...`) do endpoint.
4. **Segredo** no worker (sem ecoar): `npx wrangler secret put RESEND_WEBHOOK_SECRET` e colar o valor.
5. Resend → endpoint → *Send test event*. Esperado: HTTP 200 `{"ok":true}`; repetir o mesmo evento devolve `duplicado:true`.
6. Conferir: `select tipo,status,count(*) from webhook_events where origem='resend' group by 1,2;`

Nada disso foi executado pelo agente (sem deploy, sem migration, sem painel, sem segredo).
