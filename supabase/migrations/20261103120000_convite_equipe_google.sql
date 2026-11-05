-- D1438-G23 — funcionário entra com o Google do e-mail do convite.
--
-- Não aplica sozinho: este arquivo espera a janela de migration.
-- Convite sem e-mail (link) permanece como estava.
-- Convite com e-mail: a sessão precisa ser desse e-mail e ter o Google
-- em app_metadata (claim do JWT, sem ler auth.users daqui).
-- O dono da própria org não é rebaixado se aceitar um convite dela.

create or replace function public.aceitar_convite(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_jwt jsonb := coalesce((select auth.jwt())::jsonb, '{}'::jsonb);
  v_email text := lower(trim(coalesce(v_jwt ->> 'email', '')));
  v_providers jsonb := v_jwt -> 'app_metadata' -> 'providers';
  v_tem_google boolean :=
    (jsonb_typeof(v_providers) = 'array' and v_providers ? 'google')
    or coalesce(v_jwt -> 'app_metadata' ->> 'provider', '') = 'google';
  v_conv public.convites%rowtype;
begin
  if v_uid is null then
    return 'erro:nao_autenticado';
  end if;

  select * into v_conv from public.convites where token = p_token for update;
  if not found then
    return 'erro:convite_invalido';
  end if;
  if v_conv.aceito_em is not null then
    if v_conv.aceito_por = v_uid then return 'ja_aceito'; end if;
    return 'erro:convite_ja_usado';
  end if;
  if v_conv.expira_em < now() then
    return 'erro:convite_expirado';
  end if;

  if v_conv.email is not null and length(trim(v_conv.email)) > 0 then
    if lower(trim(v_conv.email)) is distinct from v_email then
      return 'erro:convite_outro_email';
    end if;
    if not v_tem_google then
      return 'erro:convite_exige_google';
    end if;
  end if;

  insert into public.organizacao_membros (org_id, user_id, papel, ativo)
  values (v_conv.org_id, v_uid, v_conv.papel, true)
  on conflict (org_id, user_id) do update
    set papel = case
          when public.organizacao_membros.papel = 'owner' then 'owner'
          else excluded.papel
        end,
        ativo = true;

  update public.convites
    set aceito_por = v_uid, aceito_em = now()
    where id = v_conv.id;

  return 'ok';
end;
$$;

revoke execute on function public.aceitar_convite(text) from anon, public;
grant execute on function public.aceitar_convite(text) to authenticated;
