-- E-mail de CONVERSA (template/purpose `conversa`), 18/11/2026 (D-2233).
-- Texto de vendedor humano, escrito por conta, SEM botão de plano. Para quem ainda não é cliente (G1/G2).
-- Mesmo caminho do `oferta_pro`: outbox -> consumer (link de descadastro assinado + List-Unsubscribe) -> Resend.
-- Nada sai sozinho: só enfileira para lista explícita de user_ids, via `worker/scripts/oferta-pro.mjs --modelo conversa`
-- (padrão = ensaio). NÃO mexe em `oferta_pro` nem em nenhum lembrete existente.
--
-- Depende de: 20261108120000 (private.oferta_pro_fatos), 20261005090000 (private.email_recebeu_ultimas_24h),
-- 20261006090000 (whatsapp_nao_contatar). NÃO APLICAR sem PR + revisão + ordem do Igor (migration em produção).
--
-- Fecha o buraco de supressão cruzada SÓ para este caminho: quem pediu para parar no WhatsApp
-- (pediu_sair | reclamou | decisao_interna) também é barrado aqui, mesmo sem a migration 20261118130000.
begin;

-- ─── 1. Catálogo do outbox: acrescenta `conversa` SEM reescrever a lista ────────────────────────
-- Lê a definição VIGENTE da constraint e só acrescenta uma opção. Assim a ordem de aplicação com outras
-- migrations que mexem no catálogo (ex.: orçamento não aberto) não importa: nenhuma apaga a outra.
-- template_dados de `conversa` segue no teto de 1 KB dos demais; o worker limita o texto a 900 bytes.
do $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_constraintdef(c.oid) into v_def
    from pg_catalog.pg_constraint c
   where c.conrelid = 'public.email_outbox'::regclass
     and c.conname = 'email_outbox_template_catalogo_check';
  if v_def is null then
    raise exception 'catalogo_check_ausente: aplique antes 20261108120000_oferta_pro_email.sql';
  end if;
  if v_def not like '%''conversa''%' then
    alter table public.email_outbox drop constraint email_outbox_template_catalogo_check;
    execute 'alter table public.email_outbox add constraint email_outbox_template_catalogo_check check ('
      || pg_catalog.regexp_replace(v_def, '^CHECK ', '')
      || ' or (template = ''conversa'' and template_version = ''conversa.v1'' and purpose = ''conversa''))';
  end if;
end
$$;

-- ─── 2. Fatos por conta: os de `oferta_pro` + conversa recente + opt-out do WhatsApp ────────────
create or replace function private.conversa_fatos(p_user_id uuid, p_now timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fatos jsonb := private.oferta_pro_fatos(p_user_id, p_now);
begin
  if (v_fatos ->> 'existe') is distinct from 'true' then
    return v_fatos;
  end if;
  return v_fatos
    || pg_catalog.jsonb_build_object(
      -- Barra também quem pediu para parar no WhatsApp (o e-mail não olhava essa lista).
      'suprimido', ((v_fatos ->> 'suprimido') is distinct from 'false')
                   or exists (
                     select 1 from public.whatsapp_nao_contatar n
                      where n.user_id = p_user_id
                        and n.motivo in ('pediu_sair', 'reclamou', 'decisao_interna')
                   ),
      'conversaRecenteEm', (
        select pg_catalog.max(o.created_at) from public.email_outbox o
         where o.user_id = p_user_id and o.purpose = 'conversa'
           and o.status <> 'dead_letter' and o.created_at > p_now - interval '30 days'
      )
    );
end;
$$;
revoke all on function private.conversa_fatos(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.fatos_conversa(p_user_ids uuid[], p_now timestamptz default pg_catalog.now())
returns table(fato jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_ids is null or pg_catalog.cardinality(p_user_ids) < 1 or pg_catalog.cardinality(p_user_ids) > 100
     or p_now is null or p_now > pg_catalog.now() + interval '5 minutes' or p_now < pg_catalog.now() - interval '1 hour'
  then
    raise exception 'conversa_argumentos_invalidos';
  end if;
  return query select private.conversa_fatos(x, p_now) from pg_catalog.unnest(p_user_ids) as x;
end;
$$;
revoke all on function public.fatos_conversa(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.fatos_conversa(uuid[], timestamptz) to service_role;

-- ─── 3. Enqueue de UMA conversa (reconfere tudo sob a trava; nunca aceita e-mail do cliente) ────
create or replace function public.enqueue_conversa(
  p_user_id        uuid,
  p_template_dados jsonb,
  p_teto_diario    integer default 40,
  p_now            timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fatos jsonb;
  v_email text;
  v_chave text;
begin
  if p_user_id is null or p_template_dados is null
     or pg_catalog.jsonb_typeof(p_template_dados) <> 'object'
     or pg_catalog.pg_column_size(p_template_dados) > 1024
     or p_teto_diario is null or p_teto_diario < 1 or p_teto_diario > 200
     or p_now is null or p_now > pg_catalog.now() + interval '5 minutes' or p_now < pg_catalog.now() - interval '1 hour'
  then
    raise exception 'conversa_argumentos_invalidos';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olli.conversa:' || p_user_id::text, 0));

  v_fatos := private.conversa_fatos(p_user_id, p_now);
  if (v_fatos ->> 'existe') is distinct from 'true' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'conta_indisponivel');
  end if;
  if (v_fatos ->> 'suprimido') is distinct from 'false' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'suprimido');
  end if;
  if (v_fatos ->> 'excluido') is distinct from 'false' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'excluido');
  end if;
  if (v_fatos ->> 'membroEquipe') is distinct from 'false' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'membro_equipe');
  end if;
  if (v_fatos ->> 'jaAssinou') is distinct from 'false' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'ja_assinou');
  end if;
  if (v_fatos ->> 'plano') is distinct from 'gratis' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'nao_e_gratis');
  end if;
  if (v_fatos ->> 'conversaRecenteEm') is not null then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'conversa_recente');
  end if;
  -- Teto por pessoa da casa: no máximo 1 e-mail (de qualquer tipo) em 24 h.
  if private.email_recebeu_ultimas_24h(p_user_id, p_now) then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'recebeu_email_24h');
  end if;
  if (
    select pg_catalog.count(*) from public.email_outbox o
     where o.purpose = 'conversa' and o.created_at > p_now - interval '24 hours'
  ) >= p_teto_diario then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'teto_diario');
  end if;

  select pg_catalog.lower(pg_catalog.btrim(u.email)) into v_email from auth.users u where u.id = p_user_id;
  v_chave := 'conversa:' || p_user_id::text || ':' || pg_catalog.to_char(p_now at time zone 'UTC', 'YYYY-MM-DD');

  insert into public.email_outbox (
    event_id, user_id, tenant_id, idempotency_key, template, template_version,
    purpose, recipient, next_attempt_at, template_dados
  ) values (
    v_chave, p_user_id, null, v_chave, 'conversa', 'conversa.v1', 'conversa', v_email, p_now, p_template_dados
  ) on conflict (idempotency_key) do nothing;

  if not found then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'duplicado');
  end if;
  return pg_catalog.jsonb_build_object('enfileirado', true, 'motivo', 'enfileirado');
end;
$$;
revoke all on function public.enqueue_conversa(uuid, jsonb, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_conversa(uuid, jsonb, integer, timestamptz) to service_role;

commit;
