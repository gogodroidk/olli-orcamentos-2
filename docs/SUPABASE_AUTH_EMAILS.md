# OLLI - Supabase Auth e e-mails

Este projeto usa Supabase Auth para cadastro, login, recuperação de senha e Google OAuth.

## O que já está preparado

- Site URL de produção: `https://olliorcamentos.online`
- Redirect de app: `olliorcamentos://auth/callback`
- Redirect web: `https://olliorcamentos.online/auth/callback`
- Tela de login/cadastro obrigatória antes do app
- Templates de e-mail em português no script `scripts/apply-supabase-auth-emails.mjs`
- Notificações de segurança ativáveis via Management API

## Aplicar templates de e-mail

Crie um token em:

`https://supabase.com/dashboard/account/tokens`

Depois rode:

```powershell
$env:SUPABASE_ACCESS_TOKEN="seu-token"
npm run supabase:auth:emails
```

## Aplicar SMTP customizado

Além do token acima, defina as credenciais SMTP:

```powershell
$env:SUPABASE_ACCESS_TOKEN="seu-token"
$env:SUPABASE_SMTP_ADMIN_EMAIL="no-reply@seudominio.com"
$env:SUPABASE_SMTP_HOST="smtp.seuprovedor.com"
$env:SUPABASE_SMTP_PORT="587"
$env:SUPABASE_SMTP_USER="usuario-smtp"
$env:SUPABASE_SMTP_PASS="senha-smtp"
$env:SUPABASE_SMTP_SENDER_NAME="OLLI Orçamentos"
npm run supabase:auth:emails
```

Sem SMTP customizado, o Supabase usa o e-mail padrão dele e pode limitar destinatários/rate limit no plano gratuito.

## Google Login

O app já chama `signInWithOAuth({ provider: 'google' })`, mas o provider só funciona depois de salvar no Supabase:

- Client ID do Google OAuth
- Client Secret do Google OAuth
- Callback autorizado no Google: `https://yiaeplqinnnnniyvwtls.supabase.co/auth/v1/callback`

Enquanto o segredo não estiver salvo, os logs mostram `provider is not enabled`.
