-- E-mail de OFERTA do plano Pro (template/purpose `oferta_pro`), 08/11/2026.
-- Mesmo caminho dos lembretes: outbox + link de descadastro assinado (o consumer põe o List-Unsubscribe) +
-- supressão. NÃO envia nada sozinho: só enfileira para uma lista explícita de user_ids, via
-- `worker/scripts/oferta-pro.mjs` (padrão = ensaio). Texto (assunto + parágrafos) chega por parâmetro e fica
-- em `template_dados` (até 6 KB só para este template). NÃO APLICAR sem os gates (ci-local, revisão, staging).
begin;

-- ─── 1. Catálogo e tamanho dos dados ─────────────────────────────────────────────
alter table public.email_outbox drop constraint if exists email_outbox_template_catalogo_check;
alter table public.email_outbox
  add constraint email_outbox_template_catalogo_check
  check (
    (template = 'boas_vindas' and template_version = 'boas_vindas.v1' and purpose = 'account_onboarding')
    or (template = 'lembrete_ativacao' and template_version = 'lembrete_ativacao.v1' and purpose = 'activation_reminder')
    or (template = 'lembrete_assinatura' and template_version = 'lembrete_assinatura.v1' and purpose = 'billing_reminder')
    or (template = 'lembrete_reengajamento' and template_version = 'lembrete_reengajamento.v1' and purpose = 'reengagement_reminder')
    or (template = 'resumo_dinheiro' and template_version = 'resumo_dinheiro.v1' and purpose = 'money_digest')
    or (template = 'resumo_dinheiro' and template_version = 'resumo_dinheiro.v2' and purpose = 'money_digest')
    or (template = 'oferta_pro' and template_version = 'oferta_pro.v1' and purpose = 'oferta_pro')
  );

alter table public.email_outbox drop constraint if exists email_outbox_template_dados_check;
alter table public.email_outbox
  add constraint email_outbox_template_dados_check
  check (
    (template = 'boas_vindas' and template_dados is null)
    or (
      template <> 'boas_vindas'
      and template_dados is not null
      and pg_catalog.jsonb_typeof(template_dados) = 'object'
      and pg_catalog.pg_column_size(template_dados) <= (case when template = 'oferta_pro' then 6144 else 1024 end)
    )
  );

-- ─── 2. Fatos por conta (leitura; a decisão é do worker, a reconferência é do enqueue) ──
create or replace function private.oferta_pro_fatos(p_user_id uuid, p_now timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_plano text;
begin
  select pg_catalog.lower(pg_catalog.btrim(u.email)) into v_email
    from auth.users u
   where u.id = p_user_id
     and u.email is not null and pg_catalog.btrim(u.email) <> ''
     and u.email_confirmed_at is not null
     and u.deleted_at is null
     and (u.banned_until is null or u.banned_until <= p_now)
     and coalesce(u.is_anonymous, false) = false;
  if v_email is null then
    return pg_catalog.jsonb_build_object('userId', p_user_id, 'existe', false);
  end if;
  begin
    v_plano := public.plano_comercial_para_usuario(p_user_id); -- 'pro' também cobre teste Pro ativo
  exception when others then
    v_plano := null; -- tenant ambíguo etc.: não manda
  end;
  return pg_catalog.jsonb_build_object(
    'userId', p_user_id,
    'existe', true,
    'plano', v_plano,
    'suprimido', exists (select 1 from public.email_supressoes s where s.user_id = p_user_id),
    'excluido', exists (select 1 from public.funil_exclusoes f where f.user_id = p_user_id or f.email = v_email)
                or public.conta_interna(p_user_id),
    'ofertaRecenteEm', (
      select pg_catalog.max(o.created_at) from public.email_outbox o
       where o.user_id = p_user_id and o.purpose = 'oferta_pro'
         and o.status <> 'dead_letter' and o.created_at > p_now - interval '30 days'
    )
  );
end;
$$;
revoke all on function private.oferta_pro_fatos(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.fatos_oferta_pro(p_user_ids uuid[], p_now timestamptz default pg_catalog.now())
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
    raise exception 'oferta_pro_argumentos_invalidos';
  end if;
  return query select private.oferta_pro_fatos(x, p_now) from pg_catalog.unnest(p_user_ids) as x;
end;
$$;
revoke all on function public.fatos_oferta_pro(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.fatos_oferta_pro(uuid[], timestamptz) to service_role;

-- ─── 3. Enqueue de UMA oferta (reconfere tudo sob a trava; nunca aceita e-mail do cliente) ──
create or replace function public.enqueue_oferta_pro(
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
     or pg_catalog.pg_column_size(p_template_dados) > 6144
     or p_teto_diario is null or p_teto_diario < 1 or p_teto_diario > 200
     or p_now is null or p_now > pg_catalog.now() + interval '5 minutes' or p_now < pg_catalog.now() - interval '1 hour'
  then
    raise exception 'oferta_pro_argumentos_invalidos';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olli.oferta_pro:' || p_user_id::text, 0));

  v_fatos := private.oferta_pro_fatos(p_user_id, p_now);
  if (v_fatos ->> 'existe') is distinct from 'true' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'conta_indisponivel');
  end if;
  if (v_fatos ->> 'suprimido') = 'true' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'suprimido');
  end if;
  if (v_fatos ->> 'excluido') = 'true' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'excluido');
  end if;
  if (v_fatos ->> 'plano') is distinct from 'gratis' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'nao_e_gratis');
  end if;
  if (v_fatos ->> 'ofertaRecenteEm') is not null then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'oferta_recente');
  end if;
  -- Mesmo teto por pessoa dos lembretes (regua_reengajamento): no máximo 1 e-mail da casa em 24 h.
  if private.email_recebeu_ultimas_24h(p_user_id, p_now) then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'recebeu_email_24h');
  end if;
  if (
    select pg_catalog.count(*) from public.email_outbox o
     where o.purpose = 'oferta_pro' and o.created_at > p_now - interval '24 hours'
  ) >= p_teto_diario then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'teto_diario');
  end if;

  select pg_catalog.lower(pg_catalog.btrim(u.email)) into v_email from auth.users u where u.id = p_user_id;
  v_chave := 'oferta_pro:' || p_user_id::text || ':' || pg_catalog.to_char(p_now at time zone 'UTC', 'YYYY-MM-DD');

  insert into public.email_outbox (
    event_id, user_id, tenant_id, idempotency_key, template, template_version,
    purpose, recipient, next_attempt_at, template_dados
  ) values (
    v_chave, p_user_id, null, v_chave, 'oferta_pro', 'oferta_pro.v1', 'oferta_pro', v_email, p_now, p_template_dados
  ) on conflict (idempotency_key) do nothing;

  if not found then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'duplicado');
  end if;
  return pg_catalog.jsonb_build_object('enfileirado', true, 'motivo', 'enfileirado');
end;
$$;
revoke all on function public.enqueue_oferta_pro(uuid, jsonb, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_oferta_pro(uuid, jsonb, integer, timestamptz) to service_role;

commit;
