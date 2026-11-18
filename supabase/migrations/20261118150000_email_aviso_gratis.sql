-- E-mail do AVISO aos Grátis da mudança do plano (template `aviso_gratis`, purpose `plan_change_notice`), D-2267, 18/11/2026.
-- O TEXTO não mora no banco: o renderer do worker lê `avisoMudancaGratis(preço)` de src/services/planosBase.ts.
-- `template_dados` só carrega {"tipo":"tranca_gratis_d2267"}.
-- Mesmo caminho dos lembretes: outbox -> consumer (link de descadastro assinado + List-Unsubscribe) -> Resend.
-- Nada sai sozinho: só enfileira via `worker/scripts/aviso-gratis.mjs` (padrão = ensaio, lotes pequenos).
-- Quem recebe: contas no plano GRÁTIS (efetivo), com e-mail confirmado, fora de funil_exclusoes/conta interna,
-- sem supressão (e-mail OU WhatsApp, por conta OU só pelo telefone do cadastro), sem aviso anterior, e que não
-- receberam outro e-mail da casa nas últimas 24 h (1 e-mail/24 h). Sem "responda SAIR"; descadastro pelo template.
--
-- Depende de: 20261108120000 (private.oferta_pro_fatos e o catálogo do outbox), 20261005090000
-- (private.email_recebeu_ultimas_24h), 20261006090000 (whatsapp_nao_contatar).
-- NÃO APLICAR sem PR + revisão + ordem do Igor (migration em produção). Envio só DEPOIS do app/painel publicado.
begin;

-- ─── 1. Catálogo do outbox: acrescenta `aviso_gratis` SEM reescrever a lista ────────────────────
-- Lê a definição VIGENTE e só acrescenta uma opção (a ordem com outras migrations do catálogo não importa).
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
  if v_def not like '%''aviso_gratis''%' then
    alter table public.email_outbox drop constraint email_outbox_template_catalogo_check;
    execute 'alter table public.email_outbox add constraint email_outbox_template_catalogo_check check ('
      || pg_catalog.regexp_replace(v_def, '^CHECK ', '')
      || ' or (template = ''aviso_gratis'' and template_version = ''aviso_gratis.v1'' and purpose = ''plan_change_notice''))';
  end if;
end
$$;

-- ─── 2. Fatos por conta ──────────────────────────────────────────────────────────────────────
create or replace function private.aviso_gratis_fatos(p_user_id uuid, p_now timestamptz)
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
      -- e-mail OU WhatsApp (pediu_sair | reclamou | decisao_interna), por conta OU só pelo telefone do cadastro
      -- (os caminhos reais de SAIR no WhatsApp gravam só o telefone; mesma regra do pode_contatar_whatsapp).
      'suprimido', ((v_fatos ->> 'suprimido') is distinct from 'false')
                   or exists (
                     select 1 from public.whatsapp_nao_contatar n
                      where n.motivo in ('pediu_sair', 'reclamou', 'decisao_interna')
                        and (
                          n.user_id = p_user_id
                          or (n.telefone is not null
                              and n.telefone = (
                                select private.telefone_whatsapp_br(u.raw_user_meta_data ->> 'phone')
                                  from auth.users u where u.id = p_user_id and u.deleted_at is null))
                        )
                   ),
      'avisoEnviadoEm', (
        select pg_catalog.max(o.created_at) from public.email_outbox o
         where o.user_id = p_user_id and o.purpose = 'plan_change_notice' and o.status <> 'dead_letter'
      )
    );
end;
$$;
revoke all on function private.aviso_gratis_fatos(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.fatos_aviso_gratis(p_user_ids uuid[], p_now timestamptz default pg_catalog.now())
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
    raise exception 'aviso_gratis_argumentos_invalidos';
  end if;
  return query select private.aviso_gratis_fatos(x, p_now) from pg_catalog.unnest(p_user_ids) as x;
end;
$$;
revoke all on function public.fatos_aviso_gratis(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.fatos_aviso_gratis(uuid[], timestamptz) to service_role;

-- ─── 3. Quem entra na leitura: contas com e-mail confirmado (os portões decidem quem sai) ───────
create or replace function public.contas_para_aviso_gratis(p_limit integer default 500)
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'aviso_gratis_argumentos_invalidos';
  end if;
  return query
    select u.id
      from auth.users u
     where u.deleted_at is null
       and u.email is not null and pg_catalog.btrim(u.email) <> ''
       and u.email_confirmed_at is not null
       and coalesce(u.is_anonymous, false) = false
     order by u.created_at, u.id
     limit p_limit;
end;
$$;
revoke all on function public.contas_para_aviso_gratis(integer) from public, anon, authenticated;
grant execute on function public.contas_para_aviso_gratis(integer) to service_role;

-- ─── 4. Enqueue de UM aviso (reconfere tudo sob a trava; nunca aceita e-mail do cliente) ────────
create or replace function public.enqueue_aviso_gratis(
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
  if p_user_id is null or p_template_dados is distinct from '{"tipo": "tranca_gratis_d2267"}'::jsonb
     or p_teto_diario is null or p_teto_diario < 1 or p_teto_diario > 200
     or p_now is null or p_now > pg_catalog.now() + interval '5 minutes' or p_now < pg_catalog.now() - interval '1 hour'
  then
    raise exception 'aviso_gratis_argumentos_invalidos';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olli.aviso_gratis:' || p_user_id::text, 0));

  v_fatos := private.aviso_gratis_fatos(p_user_id, p_now);
  if (v_fatos ->> 'existe') is distinct from 'true' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'conta_indisponivel');
  end if;
  if (v_fatos ->> 'suprimido') is distinct from 'false' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'suprimido');
  end if;
  if (v_fatos ->> 'excluido') is distinct from 'false' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'excluido');
  end if;
  if (v_fatos ->> 'plano') is distinct from 'gratis' then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'nao_e_gratis');
  end if;
  if (v_fatos ->> 'avisoEnviadoEm') is not null then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'ja_avisado');
  end if;
  -- Teto por pessoa da casa: no máximo 1 e-mail (de qualquer tipo) em 24 h. Quem ficou de fora hoje entra amanhã.
  if private.email_recebeu_ultimas_24h(p_user_id, p_now) then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'recebeu_email_24h');
  end if;
  -- Trava global só para o teto diário: duas execuções em paralelo não passam do limite.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olli.aviso_gratis:teto_diario', 0));
  if (
    select pg_catalog.count(*) from public.email_outbox o
     where o.purpose = 'plan_change_notice' and o.created_at > p_now - interval '24 hours'
  ) >= p_teto_diario then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'teto_diario');
  end if;

  select pg_catalog.lower(pg_catalog.btrim(u.email)) into v_email from auth.users u where u.id = p_user_id;
  v_chave := 'aviso_gratis:' || p_user_id::text || ':' || pg_catalog.to_char(p_now at time zone 'UTC', 'YYYY-MM-DD');

  insert into public.email_outbox (
    event_id, user_id, tenant_id, idempotency_key, template, template_version,
    purpose, recipient, next_attempt_at, template_dados
  ) values (
    v_chave, p_user_id, null, v_chave, 'aviso_gratis', 'aviso_gratis.v1', 'plan_change_notice', v_email, p_now, p_template_dados
  ) on conflict (idempotency_key) do nothing;

  if not found then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'duplicado');
  end if;
  return pg_catalog.jsonb_build_object('enfileirado', true, 'motivo', 'enfileirado');
end;
$$;
revoke all on function public.enqueue_aviso_gratis(uuid, jsonb, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_aviso_gratis(uuid, jsonb, integer, timestamptz) to service_role;

commit;
