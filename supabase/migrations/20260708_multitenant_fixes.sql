-- Correções de segurança/integridade do multi-tenant (achados do gate da Onda 2).
-- Idempotente. Aplicar após 20260707_multitenant.sql.

-- (HIGH #2) convites: worker grava criado_por (auditoria de quem convidou) e o
-- e-mail é opcional (convite por link/WhatsApp sem e-mail).
alter table public.convites add column if not exists criado_por uuid references auth.users (id) on delete set null;
alter table public.convites alter column email drop not null;

-- (HIGH #4) user_id é IMUTÁVEL em orcamentos/agendamentos: sem isso um membro
-- podia dar UPDATE trocando user_id e transferir os dados do dono para a própria
-- conta (exfiltração que sobrevive à desativação). RLS não enxerga OLD → trigger.
create or replace function public.bloquear_troca_user_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id é imutável';
  end if;
  -- autoria também não é editável depois de gravada
  if old.criado_por is not null and new.criado_por is distinct from old.criado_por then
    new.criado_por := old.criado_por;
  end if;
  return new;
end;
$$;
revoke execute on function public.bloquear_troca_user_id() from anon, public;

drop trigger if exists orcamentos_user_id_imutavel on public.orcamentos;
create trigger orcamentos_user_id_imutavel
  before update on public.orcamentos
  for each row execute function public.bloquear_troca_user_id();

drop trigger if exists agendamentos_user_id_imutavel on public.agendamentos;
create trigger agendamentos_user_id_imutavel
  before update on public.agendamentos
  for each row execute function public.bloquear_troca_user_id();

-- (MEDIUM) aceitar_convite: não rebaixa o OWNER se ele aceitar um convite da
-- própria org; e valida o e-mail quando o convite tem e-mail (evita sequestro
-- do link por outra conta autenticada — se o convite foi para um e-mail, só
-- aquele e-mail aceita; convite sem e-mail = por link, qualquer autenticado).
create or replace function public.aceitar_convite(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := (select auth.jwt() ->> 'email');
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
  -- Convite endereçado a um e-mail específico só pode ser aceito por ele.
  if v_conv.email is not null and length(trim(v_conv.email)) > 0
     and lower(trim(v_conv.email)) is distinct from lower(trim(coalesce(v_email, ''))) then
    return 'erro:convite_outro_email';
  end if;

  insert into public.organizacao_membros (org_id, user_id, papel, ativo)
  values (v_conv.org_id, v_uid, v_conv.papel, true)
  on conflict (org_id, user_id) do update
    -- Nunca rebaixa o dono: se já é owner, mantém owner.
    set papel = case when public.organizacao_membros.papel = 'owner' then 'owner' else excluded.papel end,
        ativo = true;

  update public.convites set aceito_por = v_uid, aceito_em = now() where id = v_conv.id;
  return 'ok';
end;
$$;
revoke execute on function public.aceitar_convite(text) from anon, public;
grant execute on function public.aceitar_convite(text) to authenticated;
