-- CONTAS DE TESTE são internas (ordem do Igor, 26/10/2026, D-0914): "tira as contas de teste e deixa separado, não conta
-- como possível cliente". Aditiva e idempotente: só acrescenta uma cláusula à pergunta única `public.conta_interna`.
-- Uma conta cujo e-mail traz a etiqueta de teste (`+teste`, `+test`, `+qa`, `+e2e`, `+z99`, `+smoke`, `+probe`, `+agente`
-- antes do @) ou vem de caixa descartável/de exemplo (example.*, mailinator, yopmail) já NASCE interna: sai do placar, das
-- métricas, da régua de e-mail, do WhatsApp e dos anúncios, sem ninguém clicar em "Marcar como conta interna".
-- Quem NÃO usa a etiqueta continua cliente até ser marcada à mão (funil_exclusoes) — a regra é: agente não cria conta de
-- teste em produção (usa staging); se for inevitável, o e-mail leva `+teste`.
create or replace function public.conta_interna(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select p_user_id is not null and (
    exists (select 1 from public.funil_exclusoes f where f.user_id = p_user_id)
    or exists (
      select 1
        from auth.users u
        join public.funil_exclusoes f on f.email is not null and lower(f.email) = lower(u.email)
       where u.id = p_user_id
    )
    or exists (select 1 from public.admin_memberships am where am.user_id = p_user_id and am.ativo)
    or exists (
      select 1
        from auth.users u
       where u.id = p_user_id
         and (
           lower(u.email) ~ '\+(teste|test|qa|e2e|z99|smoke|probe|agente)[a-z0-9._-]*@'
           or lower(u.email) ~ '@(example\.[a-z.]+|mailinator\.com|yopmail\.com)$'
         )
    )
  );
$$;
revoke all on function public.conta_interna(uuid) from public, anon, authenticated;
grant execute on function public.conta_interna(uuid) to service_role;
comment on function public.conta_interna(uuid) is
  'true = conta interna (funil_exclusoes por id/e-mail, administrador ativo, ou e-mail com etiqueta/domínio de teste). A única pergunta que métricas e automações fazem.';
