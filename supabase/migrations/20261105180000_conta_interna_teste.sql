-- CONTAS DE TESTE são internas (ordem do Igor, 26/10/2026, D-0914): "tira as contas de teste e deixa separado, não conta
-- como possível cliente". Aditiva e idempotente: só acrescenta uma cláusula à pergunta única `public.conta_interna`.
-- Carimbo posterior a 20261104235900: um arquivo mais antigo que a última versão da main o db push recusa.
-- Etiqueta antes do @: +z99 com sufixo livre (+z99chromium); +teste, +test, +qa, +e2e, +smoke, +probe e +agente
-- só com dígitos depois (+QA2 entra; +testemunho e +agendamento continuam cliente). Caixa: example.com, example.net,
-- example.org, mailinator.com, yopmail.com. example.com.br e exemplo.com.br continuam cliente.
-- Quem já chama conta_interna (régua, WhatsApp, medição do 1º orçamento) passa a excluir na hora em que este SQL
-- for aplicado. O placar do painel NÃO chama esta função: a mesma regra está em motivoContaInterna e só vale no
-- deploy do worker. Anúncio continua em funil_exclusoes até o #182. Não criar conta de teste em produção.
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
           lower(u.email) ~ '\+(z99[a-z0-9._-]*|(teste|test|qa|e2e|smoke|probe|agente)[0-9]*)@'
           or lower(u.email) ~ '@(example\.(com|net|org)|mailinator\.com|yopmail\.com)$'
         )
    )
  );
$$;
revoke all on function public.conta_interna(uuid) from public, anon, authenticated;
grant execute on function public.conta_interna(uuid) to service_role;
comment on function public.conta_interna(uuid) is
  'true = conta interna (funil_exclusoes por id/e-mail, administrador ativo, ou e-mail com etiqueta/domínio de teste). Régua, WhatsApp e medição perguntam esta função. O placar repete a regra no worker.';
