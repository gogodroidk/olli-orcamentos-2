-- Hardening dos 2 ERRORs de seguranca da view organizacao_membros_perfil
-- (security_definer_view + auth_users_exposed). Aplicado na producao em 2026-07-14.

-- ESPELHO seguro de auth.users. Roles NUNCA leem auth.users direto; leem daqui.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text,
  atualizado_em timestamptz not null default now()
);
alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;

-- Helper (security definer, mesmo padrao dos eh_gestao/eh_membro_ativo -> sem recursao
-- de RLS): posso ver o perfil deste usuario? (eu mesmo, ou sou gestao de uma org onde ele
-- e membro — espelha exatamente a policy SELECT de organizacao_membros).
create or replace function public.perfil_visivel(alvo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select alvo = (select auth.uid())
      or exists (
        select 1
        from public.organizacao_membros meu
        join public.organizacao_membros dele on dele.org_id = meu.org_id
        where meu.user_id = (select auth.uid())
          and public.eh_gestao(meu.org_id)
          and dele.user_id = alvo
      );
$$;

drop policy if exists profiles_visivel on public.profiles;
create policy profiles_visivel on public.profiles for select to authenticated
  using (public.perfil_visivel(user_id));

-- Backfill (roda como owner na migracao -> acessa auth.users uma vez).
insert into public.profiles (user_id, email, nome)
select id, email::text,
       coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', raw_user_meta_data->>'nome')
from auth.users
on conflict (user_id) do update set email = excluded.email, nome = excluded.nome, atualizado_em = now();

-- Reescreve a view: NAO toca mais auth.users; roda como INVOKER (usa a RLS do usuario).
-- LEFT JOIN de proposito: um membro sem perfil ainda aparece na equipe (sem nome/email),
-- nunca some.
create or replace view public.organizacao_membros_perfil
with (security_invoker = on) as
  select om.org_id, om.user_id, om.papel, om.ativo, om.criado_em,
         p.nome, p.email
  from public.organizacao_membros om
  left join public.profiles p on p.user_id = om.user_id
  where om.org_id in (
    select m.org_id from public.organizacao_membros m where m.user_id = (select auth.uid())
  );

-- Mantem profiles sincronizado com auth.users dali pra frente.
-- FAIL-SAFE: se o espelho falhar, o EXCEPTION devolve new e o signup/login NUNCA quebra.
create or replace function public.sync_profile_from_auth()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email, nome)
  values (new.id, new.email::text,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'nome'))
  on conflict (user_id) do update set email = excluded.email, nome = excluded.nome, atualizado_em = now();
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_auth_user_sync_profile on auth.users;
create trigger on_auth_user_sync_profile
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_from_auth();
