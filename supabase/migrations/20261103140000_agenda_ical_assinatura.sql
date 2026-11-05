-- ============================================================================
-- OLLI — assinatura iCal da agenda (D1438-G16)
-- ----------------------------------------------------------------------------
-- O QUE MUDA
--   `agenda_ical_assinaturas` — um link secreto por pessoa e escopo
--   (`propria` = só as visitas em que ela é a responsável; `equipe` = a agenda
--   da conta). O worker lê por GET /ical/<token>.ics e devolve a agenda em
--   iCalendar. Google Agenda, iPhone e Outlook assinam esse endereço.
--   Não é OAuth e não escreve de volta no OLLI.
--
--   `ativar_assinatura_ical(escopo)` — único jeito de criar ou reabrir o link.
--   Quem pede de novo no mesmo escopo recebe o MESMO token (a assinatura que
--   já está no celular continua). `revogar_assinatura_ical(escopo)` mata o
--   token; o próximo ativar gera outro.
--
-- QUEM VÊ O QUÊ
--   - Técnico: só `propria`. Pedir `equipe` recusa (`sem_acesso`).
--   - Dono, admin, gestor e conta pessoal: `equipe` (o padrão) ou `propria`.
--   - O token NÃO é coluna de SELECT. Volta só no JSON do RPC, para quem pediu.
--   - anon não executa e não lê. authenticated não insere direto.
--
-- GRÁTIS. Não consulta plano. A conexão OAuth com o Google continua desligada.
--
-- ORDEM DE PUBLICAÇÃO: aplicar ANTES (ou junto) do worker que serve /ical/.
-- Sem esta tabela o worker responde "não consegui ler" (503), nunca um
-- calendário vazio — calendário vazio apagaria a agenda já assinada.
--
-- IDEMPOTENTE. SEGREDOS: zero neste arquivo (o token nasce na hora do RPC).
-- NÃO APLICAR em produção nesta entrega: só o arquivo entra na branch.
-- ============================================================================

begin;

create table if not exists public.agenda_ical_assinaturas (
  id           uuid primary key default gen_random_uuid(),
  titular_id   uuid not null references auth.users (id) on delete cascade,
  dono_id      uuid not null references auth.users (id) on delete cascade,
  escopo       text not null check (escopo in ('propria', 'equipe')),
  token        text not null unique check (token ~ '^[a-f0-9]{64}$'),
  revogado_em  timestamptz,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.agenda_ical_assinaturas is
  'Link secreto /ical/<token>.ics da agenda. Cria pelo RPC ativar_assinatura_ical. O worker lê com service_role.';

comment on column public.agenda_ical_assinaturas.token is
  'Segredo do link. Não é legível por SELECT; só volta do RPC para quem ativou.';

create unique index if not exists agenda_ical_assinaturas_viva_uq
  on public.agenda_ical_assinaturas (titular_id, escopo)
  where revogado_em is null;

alter table public.agenda_ical_assinaturas enable row level security;

revoke all on table public.agenda_ical_assinaturas from anon, public;
revoke all on table public.agenda_ical_assinaturas from authenticated;

grant select (
  id, titular_id, dono_id, escopo, revogado_em, criado_em, atualizado_em
) on table public.agenda_ical_assinaturas to authenticated;

drop policy if exists agenda_ical_select_propria on public.agenda_ical_assinaturas;
create policy agenda_ical_select_propria
  on public.agenda_ical_assinaturas
  for select
  to authenticated
  using (titular_id = (select auth.uid()));

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: ativar (ou reaproveitar) o link
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.ativar_assinatura_ical(p_escopo text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_dono   uuid;
  v_papel  text;
  v_escopo text;
  v_token  text;
  v_linha  public.agenda_ical_assinaturas%rowtype;
begin
  if v_uid is null then
    raise exception 'sem_sessao' using errcode = '42501';
  end if;

  select o.owner_user_id, m.papel
    into v_dono, v_papel
    from public.organizacao_membros m
    join public.organizacoes o on o.id = m.org_id
   where m.user_id = v_uid
     and m.ativo
   order by case m.papel
              when 'owner' then 0
              when 'admin' then 1
              when 'gestor' then 2
              else 3
            end
   limit 1;

  if not found then
    v_dono := v_uid;
    v_papel := 'owner';
  end if;

  if p_escopo is null or btrim(p_escopo) = '' then
    v_escopo := case when v_papel = 'tecnico' then 'propria' else 'equipe' end;
  elsif p_escopo in ('propria', 'equipe') then
    v_escopo := p_escopo;
  else
    raise exception 'escopo_invalido' using errcode = '22023';
  end if;

  if v_escopo = 'equipe' and v_papel = 'tecnico' then
    raise exception 'sem_acesso' using errcode = '42501';
  end if;

  select * into v_linha
    from public.agenda_ical_assinaturas a
   where a.titular_id = v_uid
     and a.escopo = v_escopo
     and a.revogado_em is null
   for update;

  if found then
    update public.agenda_ical_assinaturas a
       set dono_id = v_dono,
           atualizado_em = now()
     where a.id = v_linha.id
     returning * into v_linha;
  else
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.agenda_ical_assinaturas (titular_id, dono_id, escopo, token)
    values (v_uid, v_dono, v_escopo, v_token)
    returning * into v_linha;
  end if;

  return jsonb_build_object('token', v_linha.token, 'escopo', v_linha.escopo);
exception
  when unique_violation then
    select * into v_linha
      from public.agenda_ical_assinaturas a
     where a.titular_id = v_uid
       and a.escopo = v_escopo
       and a.revogado_em is null;
    if not found then
      raise;
    end if;
    return jsonb_build_object('token', v_linha.token, 'escopo', v_linha.escopo);
end;
$$;

revoke all on function public.ativar_assinatura_ical(text) from public, anon;
grant execute on function public.ativar_assinatura_ical(text) to authenticated;

create or replace function public.revogar_assinatura_ical(p_escopo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null then
    raise exception 'sem_sessao' using errcode = '42501';
  end if;
  if p_escopo is null or p_escopo not in ('propria', 'equipe') then
    raise exception 'escopo_invalido' using errcode = '22023';
  end if;

  update public.agenda_ical_assinaturas a
     set revogado_em = now(),
         atualizado_em = now()
   where a.titular_id = v_uid
     and a.escopo = p_escopo
     and a.revogado_em is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('revogado', v_n > 0);
end;
$$;

revoke all on function public.revogar_assinatura_ical(text) from public, anon;
grant execute on function public.revogar_assinatura_ical(text) to authenticated;

commit;
