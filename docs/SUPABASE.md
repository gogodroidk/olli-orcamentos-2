# Supabase

Projeto conectado: `OLLI ORCAMENTOS` (`yiaeplqinnnnniyvwtls`).

## Variáveis do app

O app lê as credenciais públicas com:

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Use `.env.local` para desenvolvimento. Esse arquivo fica ignorado pelo Git. Para orientar outros ambientes, mantenha somente `.env.example` versionado.

## Modelo atual

O app funciona offline com SQLite e usa Supabase para:

- cadastro/login por e-mail e senha;
- backup manual do snapshot local na tabela `public.backups`;
- restauração manual do último snapshot.

Tabelas públicas encontradas no projeto remoto:

- `backups`
- `clientes`
- `contadores`
- `depoimentos`
- `empresa`
- `modelos`
- `orcamentos`
- `produtos`
- `recibos`
- `servicos`

Todas as tabelas estão com RLS habilitado.

## Hardening aplicado

Migration: `supabase/migrations/20260615160744_harden_rls_and_function_permissions.sql`

Correções aplicadas no remoto:

- revogada execução da função `public.rls_auto_enable()` para `anon`, `authenticated` e `public`;
- policies de dados do usuário recriadas com `to authenticated`;
- `auth.uid()` trocado por `(select auth.uid())` nas policies para evitar reavaliação por linha.

Validação pós-migration:

- `anon_can_execute`: `false` para `public.rls_auto_enable()`;
- `authenticated_can_execute`: `false` para `public.rls_auto_enable()`;
- policies agora mostram role `{authenticated}` e checks com `(select auth.uid())`.

## Avisos restantes

Security advisor:

- `Leaked Password Protection Disabled`: ativar no dashboard do Supabase Auth quando quiser endurecer login por senha.

Performance advisor:

- índices `*_user_id_idx` e alguns índices de orçamento aparecem como unused. Como o banco é novo, isso é esperado e não deve ser removido agora.

## Checklist antes de produção

- Ativar leaked password protection no Supabase Auth.
- Confirmar URLs de redirect se OAuth/Google for implementado.
- Fazer um backup real e uma restauração em ambiente de teste.
- Rodar advisors novamente após qualquer mudança DDL.

## Auth, e-mail e Google no app mobile

O app Expo usa o scheme nativo:

```text
olliorcamentos://auth/callback
```

No Supabase Dashboard do projeto `OLLI ORCAMENTOS` (`yiaeplqinnnnniyvwtls`), configure:

1. Auth > URL Configuration
   - Site URL: `https://olliorcamentos.online`
   - Additional Redirect URLs:
     - `olliorcamentos://auth/callback`
     - `https://olliorcamentos.online`
     - `https://olliorcamentos.online/auth/callback`
     - `https://app.olliorcamentos.online`
     - `https://app.olliorcamentos.online/auth/callback`
     - `http://localhost:8081`
     - `http://localhost:8081/auth/callback`
     - `http://localhost:8082`
     - `http://localhost:8082/auth/callback`

2. Auth > Providers > Email
   - Email/password habilitado.
   - Confirm email conforme a estrategia de produto.
   - Para producao, configure SMTP proprio. O changelog do Supabase de 2026-06-03 endureceu customizacao/uso de e-mail no Free Tier, entao SMTP evita limite e aparencia amadora.

3. Auth > Providers > Google
   - Habilite Google.
   - No Google Cloud Console, crie OAuth Client IDs para Web e Android.
   - Cole Client ID e Client Secret no provider Google do Supabase.
   - Em Authorized redirect URIs no Google Cloud Console, use a URL de callback indicada pelo proprio provider Google do Supabase.
   - No app, nao coloque Client Secret. O APK deve carregar apenas URL e chave publica.

4. Variaveis publicas do app

```bash
EXPO_PUBLIC_SUPABASE_URL=https://yiaeplqinnnnniyvwtls.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# compatibilidade antiga, se ainda estiver usando legacy anon key:
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e legacy `anon` sao publicas. Nunca coloque `service_role`, `sb_secret`, SMTP password ou Google Client Secret em `.env.local` do app Expo.

## Verificacao local

Depois de configurar o dashboard:

```powershell
npm run auth:verify
npm run typecheck
npm run doctor
npm run qa:web
```

Teste manual no Android:

1. Instale o APK.
2. Abra `Conta > Entrar / Criar conta`.
3. Toque em `Continuar com Google`.
4. Escolha a conta Google.
5. O app deve voltar pelo link `olliorcamentos://auth/callback`, mostrar a conta conectada e disparar `syncOnLogin()` em background.
