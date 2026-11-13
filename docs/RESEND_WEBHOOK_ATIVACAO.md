# Webhook do Resend: ativação (bounce/reclamação suprimem o e-mail)

Estado do código: **pronto em `main`**. Falta só ativar (segredo + painel). Nada aqui é feito pelo código.

## O que já existe

| Peça | Onde |
| --- | --- |
| Rota `POST /resend/webhook` (verifica assinatura Svix, 5 min de tolerância, 256 KiB, idempotente por `svix-id`) | `worker/src/resendWebhook.js`, rota em `worker/src/index.js` |
| Supressão: bounce **Permanent**, `complained` e `suppressed` viram supressão da conta | `motivoSupressaoResend` + RPC `registrar_supressao_email_por_provider` |
| Tabela `public.email_supressoes` (só `user_id`, sem endereço) e as RPCs | `supabase/migrations/20260929200000_email_producao_lembretes.sql` |
| Régua consulta a supressão: seleção de candidatos (`not exists ... email_supressoes`) e trava no envio por conta | mesma migration, linhas ~343 e ~580 |
| Supressão cancela e-mails pendentes na outbox (`suprimido_antes_do_envio`) | `registrar_supressao_email` |
| Testes | `npm --prefix worker run test:resend-webhook` (já dentro de `npm test`) |

Bounce temporário (`Transient`) **não** suprime: só permanente e reclamação.

## Passo a passo para ativar (ordem importa)

1. **Migration**: confirmar que `20260929200000_email_producao_lembretes.sql` está aplicada no Supabase de produção
   (`select to_regclass('public.email_supressoes');` deve retornar a tabela, e
   `select proname from pg_proc where proname = 'registrar_supressao_email_por_provider';` deve retornar 1 linha).
   Se não estiver, aplicar pelo fluxo normal de migrations.
2. **Painel Resend, Webhooks, Add Endpoint**:
   - URL: `https://diagnostico.olliorcamentos.online/resend/webhook`
   - Eventos: `email.bounced`, `email.complained`, `email.suppressed` (mínimo). Opcional: `email.delivered`, `email.delivery_delayed`, `email.failed` para trilha de auditoria.
3. Copiar o **Signing Secret** do endpoint (`whsec_...`).
4. **Segredo no Worker** (sem colar em chat/log):
   `cd worker && npx wrangler secret put RESEND_WEBHOOK_SECRET` e colar o `whsec_...` no prompt.
5. **Conferir**: no painel Resend, enviar o evento de teste do endpoint. Resposta esperada `200 {"ok":true,...}`.
   Sem o segredo o Worker responde `503 webhook_nao_configurado`; assinatura errada, `400 assinatura_invalida`.
6. Reenviar eventos que falharam antes (Resend guarda tentativas): o handler é idempotente.

Obs.: `GET https://diagnostico.olliorcamentos.online/resend/webhook` responde `405` (rota no ar). Em `olliorcamentos.online/resend/webhook` dá 404, porque o Worker está nos custom domains `diagnostico.` e `link.`.

## Como saber que funcionou

- `select motivo, origem, count(*) from public.email_supressoes group by 1,2;` mostra linhas com `origem = 'resend_webhook'` depois de um bounce/reclamação real.
- Tabela de eventos de webhook (`webhookEvents`) com `origem = 'resend'` e `status = 'processado'`.
- Se vier `falhou`, o Resend reenvia sozinho (500).
