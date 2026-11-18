-- assinaturas: policy de leitura da própria assinatura (paridade staging x produção).
--
-- Contexto: em produção a policy `assinatura_select_own` existe (criada antes do
-- repo ter baseline) mas nenhuma migration a define; o baseline do staging
-- (ops/staging/schema-baseline.sql) habilita RLS na tabela sem policy alguma.
-- Resultado em staging: o dono autenticado lê 0 linhas, e a tela Planos mostra
-- Grátis para quem é Pro.
--
-- Idempotente: só cria se faltar. Em produção é no-op (a policy já existe com
-- exatamente esta definição). Sem escrita para o cliente: só SELECT, só a própria
-- linha; INSERT/UPDATE/DELETE continuam só pelo worker (service_role).
alter table public.assinaturas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'assinaturas'
       and policyname = 'assinatura_select_own'
  ) then
    create policy assinatura_select_own on public.assinaturas
      for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;
