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
