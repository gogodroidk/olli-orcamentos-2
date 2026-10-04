-- Opt-out de WhatsApp (pendência do LEGAL, 03/10/2026).
--
-- O WhatsApp de ativação (número OLLI (11) 94172-7487) só pode falar com quem não
-- pediu para sair. Esta lista é a fonte única: o SALES consulta
-- `pode_contatar_whatsapp` ANTES de cada envio e registra todo pedido de saída com
-- `registrar_nao_contatar_whatsapp`. A pessoa também pode sair (e voltar) sozinha
-- pelo app/painel com `definir_contato_whatsapp`.
--
-- Chave dupla, de propósito: por conta (user_id) E por número normalizado — o SALES
-- às vezes só tem o telefone (dado da empresa, lead) e precisa achar o opt-out
-- mesmo assim. Erro nunca vira "pode contatar": sem identificador = não pode.

create table if not exists public.whatsapp_nao_contatar (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete cascade,
  telefone   text check (telefone ~ '^55[0-9]{10,11}$'),
  motivo     text not null check (motivo in ('pediu_sair', 'reclamou', 'numero_invalido', 'decisao_interna')),
  origem     text not null check (origem in ('whatsapp', 'email', 'app', 'painel', 'admin')),
  criado_em  timestamptz not null default now(),
  check (user_id is not null or telefone is not null)
);
create unique index if not exists whatsapp_nao_contatar_user_uidx
  on public.whatsapp_nao_contatar (user_id) where user_id is not null;
create unique index if not exists whatsapp_nao_contatar_tel_uidx
  on public.whatsapp_nao_contatar (telefone) where telefone is not null;

-- Só servidor e as funções abaixo leem/escrevem (sem policy = nada para anon/authenticated).
alter table public.whatsapp_nao_contatar enable row level security;
revoke all on public.whatsapp_nao_contatar from anon, authenticated;

-- ─── Número brasileiro normalizado: 55 + DDD + número (10 ou 11 dígitos) ────────
-- Mesma regra de `src/utils/telefoneWhatsapp.ts` (numeroWhatsAppBR): tira tudo que
-- não é dígito e zeros à esquerda ("0 + DDD"); com 10/11 dígitos põe o 55.
create or replace function private.telefone_whatsapp_br(p_telefone text)
returns text
language plpgsql
immutable
set search_path to ''
as $$
declare
  v text := pg_catalog.regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g');
begin
  v := pg_catalog.ltrim(v, '0');
  if pg_catalog.length(v) in (10, 11) then
    v := '55' || v;
  end if;
  if v ~ '^55[0-9]{10,11}$' then
    return v;
  end if;
  return null;
end;
$$;
revoke all on function private.telefone_whatsapp_br(text) from public, anon, authenticated;

-- ─── Consulta do SALES (antes de CADA envio) ────────────────────────────────────
-- Confere a conta, o número informado e o número do cadastro da conta. Qualquer
-- dúvida = não pode.
create or replace function public.pode_contatar_whatsapp(p_user_id uuid default null, p_telefone text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_tel       text := private.telefone_whatsapp_br(p_telefone);
  v_tel_conta text;
  v_motivo    text;
begin
  if p_user_id is null and v_tel is null then
    return pg_catalog.jsonb_build_object('pode', false, 'motivo', 'sem_identificador');
  end if;

  if p_user_id is not null then
    select private.telefone_whatsapp_br(u.raw_user_meta_data ->> 'phone')
      into v_tel_conta
    from auth.users u
    where u.id = p_user_id and u.deleted_at is null;
    if not found then
      return pg_catalog.jsonb_build_object('pode', false, 'motivo', 'conta_inexistente');
    end if;
  end if;

  select n.motivo into v_motivo
  from public.whatsapp_nao_contatar n
  where (p_user_id is not null and n.user_id = p_user_id)
     or (v_tel is not null and n.telefone = v_tel)
     or (v_tel_conta is not null and n.telefone = v_tel_conta)
  order by n.criado_em desc
  limit 1;

  if v_motivo is not null then
    return pg_catalog.jsonb_build_object('pode', false, 'motivo', v_motivo);
  end if;
  return pg_catalog.jsonb_build_object('pode', true, 'motivo', 'liberado');
end;
$$;
revoke all on function public.pode_contatar_whatsapp(uuid, text) from public, anon, authenticated;

-- ─── Registro do pedido de saída (SALES/admin, pelo servidor) ───────────────────
-- Idempotente: registrar de novo não duplica nem apaga o anterior. Grava a conta e
-- o número, para valer pelos dois caminhos.
create or replace function public.registrar_nao_contatar_whatsapp(
  p_user_id uuid,
  p_telefone text,
  p_motivo text,
  p_origem text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tel text := private.telefone_whatsapp_br(p_telefone);
begin
  if p_motivo is null or p_motivo not in ('pediu_sair', 'reclamou', 'numero_invalido', 'decisao_interna')
     or p_origem is null or p_origem not in ('whatsapp', 'email', 'app', 'painel', 'admin')
  then
    raise exception 'nao_contatar_argumentos_invalidos';
  end if;
  if p_user_id is null and v_tel is null then
    raise exception 'nao_contatar_sem_identificador';
  end if;
  if p_user_id is not null and not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'nao_contatar_conta_inexistente';
  end if;

  if p_user_id is not null then
    insert into public.whatsapp_nao_contatar (user_id, motivo, origem)
    values (p_user_id, p_motivo, p_origem)
    on conflict (user_id) where user_id is not null do nothing;
  end if;
  if v_tel is not null then
    insert into public.whatsapp_nao_contatar (telefone, motivo, origem)
    values (v_tel, p_motivo, p_origem)
    on conflict (telefone) where telefone is not null do nothing;
  end if;

  return pg_catalog.jsonb_build_object('registrado', true, 'telefone_normalizado', v_tel is not null);
end;
$$;
revoke all on function public.registrar_nao_contatar_whatsapp(uuid, text, text, text) from public, anon, authenticated;

-- ─── A própria pessoa sai ou volta (app/painel) ─────────────────────────────────
-- Sair grava a conta e o número do cadastro. Voltar só remove o que a PRÓPRIA
-- pessoa pediu pelo app/painel/WhatsApp/e-mail — nunca uma decisão interna
-- (número inválido, reclamação) nem o número de outra conta.
create or replace function public.definir_contato_whatsapp(p_aceita boolean, p_origem text default 'app')
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tel text;
begin
  if v_uid is null then
    raise exception 'sem_sessao' using errcode = '42501';
  end if;
  if p_aceita is null or p_origem is null or p_origem not in ('app', 'painel') then
    raise exception 'contato_whatsapp_argumentos_invalidos';
  end if;

  select private.telefone_whatsapp_br(u.raw_user_meta_data ->> 'phone') into v_tel
  from auth.users u where u.id = v_uid;

  if p_aceita then
    delete from public.whatsapp_nao_contatar n
    where (n.user_id = v_uid or (v_tel is not null and n.telefone = v_tel))
      and n.motivo = 'pediu_sair';
  else
    perform public.registrar_nao_contatar_whatsapp(v_uid, v_tel, 'pediu_sair', p_origem);
  end if;

  return pg_catalog.jsonb_build_object(
    'aceita_whatsapp', not exists (
      select 1 from public.whatsapp_nao_contatar n
      where n.user_id = v_uid or (v_tel is not null and n.telefone = v_tel)
    )
  );
end;
$$;
revoke all on function public.definir_contato_whatsapp(boolean, text) from public, anon;
grant execute on function public.definir_contato_whatsapp(boolean, text) to authenticated;
