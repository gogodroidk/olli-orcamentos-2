# OLLI — Link do cliente (Cloudflare Worker)

Página pública de um orçamento: o cliente vê o valor e os itens e pode
**Aprovar / Recusar / tirar Dúvida no WhatsApp**. A resposta é gravada no
Supabase (`orcamentos_publicos`) e o app reflete o novo status.

```
GET  /o/<token>   → página do orçamento
POST /o/<token>   → grava aprovação/recusa (Post/Redirect/Get)
```

## Deploy

1. Aplique a migration `backend/migrations/0003_create_link_cliente_schema.sql`
   no projeto Supabase (cria a tabela `orcamentos_publicos`).
2. Configure os secrets do Worker (chaves de **servidor**, nunca no app):
   ```bash
   cd cloudflare/orcamento-link
   npm install
   npx wrangler secret put SUPABASE_URL               # https://<ref>.supabase.co
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # service_role do projeto
   npx wrangler deploy
   ```
3. Aponte o domínio (Cloudflare/Hostinger) para o Worker e coloque a mesma base
   em `EXPO_PUBLIC_LINK_BASE_URL` no app. O link de cada orçamento fica
   `https://SEU_DOMINIO/o/<token>`.

## Segurança

- O Worker usa a **service_role** (ignora RLS) só para ler por `token` e gravar a
  resposta do cliente. Essa chave fica em secret do Worker; o app nunca a vê.
- A página pública recebe apenas o **snapshot** do orçamento (`dados`), não o
  banco inteiro. Tokens são aleatórios e não sequenciais.
