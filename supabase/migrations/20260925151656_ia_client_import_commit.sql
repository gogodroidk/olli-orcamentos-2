-- OLLI Autopilot — commit transacional de candidatos de cliente revisados.
--
-- A prévia continua sem mutação. Somente o botão explícito de confirmação chama
-- a RPC abaixo. O Worker deriva tenant/ator da sessão, normaliza o payload e usa
-- service_role; a função revalida o vínculo organizacional como defesa em
-- profundidade, deduplica conservadoramente e grava job + candidatos + clientes
-- na mesma transação.
--
-- Conversa/prompt/arquivo bruto NÃO entram nestas tabelas. Ficam apenas a fonte
-- mínima, o hash, os campos selecionados, evidência curta e o resultado. Jobs e
-- candidatos expiram em até 30 dias; clientes confirmados seguem a retenção
-- normal do produto.

create table if not exists public.ia_client_import_jobs (
  id                    uuid primary key,
  version               text not null default '2026-09-25.v1'
                        check (version = '2026-09-25.v1'),
  tenant_user_id        uuid not null references auth.users (id) on delete cascade,
  org_id                uuid references public.organizacoes (id) on delete cascade,
  actor_user_id         uuid not null references auth.users (id) on delete cascade,
  actor_role            text not null
                        check (actor_role in ('pessoal', 'owner', 'admin', 'gestor', 'tecnico')),
  preview_id            uuid not null,
  preview_fingerprint   text not null
                        check (preview_fingerprint ~ '^[a-f0-9]{64}$'),
  idempotency_key       text not null
                        check (idempotency_key ~ '^[A-Za-z0-9._:-]{8,160}$'),
  request_hash          text not null
                        check (request_hash ~ '^[a-f0-9]{64}$'),
  source_hash           text not null
                        check (source_hash ~ '^[a-f0-9]{64}$'),
  source_name           text not null
                        check (length(source_name) between 1 and 180),
  status                text not null default 'processando'
                        check (status in ('processando', 'aplicada')),
  result                jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(result) = 'object'),
  created_at            timestamptz not null default now(),
  applied_at            timestamptz,
  expires_at            timestamptz not null default (now() + interval '30 days'),
  constraint ia_client_import_jobs_idempotency_unique
    unique (tenant_user_id, actor_user_id, idempotency_key),
  constraint ia_client_import_jobs_lifecycle_check check (
    (status = 'processando' and applied_at is null)
    or (status = 'aplicada' and applied_at is not null)
  ),
  constraint ia_client_import_jobs_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '30 days'
  )
);

create index if not exists ia_client_import_jobs_tenant_created_idx
  on public.ia_client_import_jobs (tenant_user_id, created_at desc);
create index if not exists ia_client_import_jobs_expiry_idx
  on public.ia_client_import_jobs (expires_at);

create table if not exists public.ia_client_import_candidates (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references public.ia_client_import_jobs (id) on delete cascade,
  tenant_user_id   uuid not null references auth.users (id) on delete cascade,
  ordinal          smallint not null check (ordinal between 1 and 50),
  payload          jsonb not null check (jsonb_typeof(payload) = 'object'),
  confidence       numeric(4, 3) not null check (confidence between 0 and 1),
  evidence         text not null default '' check (length(evidence) <= 280),
  decision         text not null check (decision in ('criado', 'existente', 'conflito')),
  client_id        text,
  conflict_reason  text,
  created_at       timestamptz not null default now(),
  unique (job_id, ordinal),
  constraint ia_client_import_candidates_result_check check (
    (decision in ('criado', 'existente') and client_id is not null and conflict_reason is null)
    or (decision = 'conflito' and client_id is null and conflict_reason is not null)
  )
);

create index if not exists ia_client_import_candidates_job_idx
  on public.ia_client_import_candidates (job_id, ordinal);

alter table public.ia_client_import_jobs enable row level security;
alter table public.ia_client_import_jobs force row level security;
alter table public.ia_client_import_candidates enable row level security;
alter table public.ia_client_import_candidates force row level security;

revoke all on table public.ia_client_import_jobs from public, anon, authenticated;
revoke all on table public.ia_client_import_candidates from public, anon, authenticated;

grant select, insert, update, delete on table public.ia_client_import_jobs to service_role;
grant select, insert, update, delete on table public.ia_client_import_candidates to service_role;

comment on table public.ia_client_import_jobs is
  'Commit auditavel e idempotente de candidatos de cliente do Autopilot. Service-role only; sem conversa ou arquivo bruto; TTL maximo de 30 dias.';
comment on table public.ia_client_import_candidates is
  'Candidatos revisados e resultado de deduplicacao do commit Autopilot. Service-role only e exclusao em cascata com o job.';

create or replace function public.commit_ia_client_import(
  p_job_id uuid,
  p_tenant_user_id uuid,
  p_org_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_preview_id uuid,
  p_preview_fingerprint text,
  p_idempotency_key text,
  p_request_hash text,
  p_source_hash text,
  p_source_name text,
  p_candidates jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing_job public.ia_client_import_jobs%rowtype;
  v_context_ok boolean := false;
  v_inserted integer := 0;
  v_now timestamptz := pg_catalog.now();
  v_raw jsonb;
  v_payload jsonb;
  v_ordinal integer;
  v_name text;
  v_phone text;
  v_phone_digits text;
  v_email text;
  v_document text;
  v_document_digits text;
  v_cpf text;
  v_cnpj text;
  v_address text;
  v_complement text;
  v_city text;
  v_state text;
  v_zip text;
  v_evidence text;
  v_confidence numeric(4, 3);
  v_match_count integer;
  v_match_id text;
  v_match_name text;
  v_match_deleted boolean;
  v_client_id text;
  v_decision text;
  v_conflict_reason text;
  v_created jsonb := '[]'::jsonb;
  v_existing jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_client_result jsonb;
  v_result jsonb;
begin
  if p_job_id is null or p_tenant_user_id is null or p_actor_user_id is null
     or p_preview_id is null or p_candidates is null
     or p_actor_role not in ('pessoal', 'owner', 'admin', 'gestor', 'tecnico')
     or p_preview_fingerprint !~ '^[a-f0-9]{64}$'
     or p_request_hash !~ '^[a-f0-9]{64}$'
     or p_source_hash !~ '^[a-f0-9]{64}$'
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,160}$'
     or length(pg_catalog.btrim(pg_catalog.coalesce(p_source_name, ''))) not between 1 and 180
     or pg_catalog.jsonb_typeof(p_candidates) <> 'array'
     or pg_catalog.jsonb_array_length(p_candidates) not between 1 and 50 then
    raise exception 'ia_client_import_invalid_request';
  end if;

  if p_org_id is null then
    v_context_ok := p_actor_role = 'pessoal' and p_actor_user_id = p_tenant_user_id;
  else
    select pg_catalog.exists (
      select 1
      from public.organizacoes o
      join public.organizacao_membros m on m.org_id = o.id
      where o.id = p_org_id
        and o.owner_user_id = p_tenant_user_id
        and m.user_id = p_actor_user_id
        and m.ativo is true
        and m.papel = p_actor_role
    ) into v_context_ok;
  end if;
  if not v_context_ok then
    raise exception 'ia_client_import_context_invalid';
  end if;

  select * into v_existing_job
  from public.ia_client_import_jobs j
  where j.tenant_user_id = p_tenant_user_id
    and j.actor_user_id = p_actor_user_id
    and j.idempotency_key = p_idempotency_key;
  if found then
    if v_existing_job.request_hash <> p_request_hash then
      raise exception 'ia_client_import_idempotency_conflict';
    end if;
    return v_existing_job.result || pg_catalog.jsonb_build_object('idempotente', true);
  end if;

  insert into public.ia_client_import_jobs (
    id, tenant_user_id, org_id, actor_user_id, actor_role, preview_id,
    preview_fingerprint, idempotency_key, request_hash, source_hash, source_name,
    status, result, created_at, expires_at
  ) values (
    p_job_id, p_tenant_user_id, p_org_id, p_actor_user_id, p_actor_role, p_preview_id,
    p_preview_fingerprint, p_idempotency_key, p_request_hash, p_source_hash,
    pg_catalog.btrim(p_source_name), 'processando', '{}'::jsonb, v_now,
    v_now + interval '30 days'
  ) on conflict (tenant_user_id, actor_user_id, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_existing_job
    from public.ia_client_import_jobs j
    where j.tenant_user_id = p_tenant_user_id
      and j.actor_user_id = p_actor_user_id
      and j.idempotency_key = p_idempotency_key;
    if not found or v_existing_job.request_hash <> p_request_hash then
      raise exception 'ia_client_import_idempotency_conflict';
    end if;
    return v_existing_job.result || pg_catalog.jsonb_build_object('idempotente', true);
  end if;

  for v_raw, v_ordinal in
    select e.value, e.ordinality::integer
    from pg_catalog.jsonb_array_elements(p_candidates) with ordinality as e(value, ordinality)
  loop
    if pg_catalog.jsonb_typeof(v_raw) <> 'object' then
      raise exception 'ia_client_import_candidate_invalid';
    end if;

    v_name := pg_catalog.btrim(pg_catalog.coalesce(v_raw ->> 'nome', ''));
    v_phone := pg_catalog.btrim(pg_catalog.coalesce(v_raw ->> 'telefone', ''));
    v_email := pg_catalog.btrim(pg_catalog.coalesce(v_raw ->> 'email', ''));
    v_document := pg_catalog.btrim(pg_catalog.coalesce(v_raw ->> 'documento', ''));
    v_address := pg_catalog.btrim(pg_catalog.coalesce(v_raw ->> 'endereco', ''));
    v_complement := pg_catalog.btrim(pg_catalog.coalesce(v_raw ->> 'complemento', ''));
    v_city := pg_catalog.btrim(pg_catalog.coalesce(v_raw ->> 'cidade', ''));
    v_state := pg_catalog.upper(pg_catalog.btrim(pg_catalog.coalesce(v_raw ->> 'estado', '')));
    v_zip := pg_catalog.btrim(pg_catalog.coalesce(v_raw ->> 'cep', ''));
    v_evidence := pg_catalog.left(pg_catalog.btrim(pg_catalog.coalesce(v_raw ->> 'evidencia', '')), 280);
    v_phone_digits := pg_catalog.regexp_replace(v_phone, '[^0-9]', '', 'g');
    v_document_digits := pg_catalog.regexp_replace(v_document, '[^0-9]', '', 'g');

    if length(v_name) not between 1 and 160
       or length(v_phone) > 40
       or length(v_email) > 160
       or length(v_document) > 40
       or length(v_address) > 240
       or length(v_complement) > 120
       or length(v_city) > 100
       or (v_state <> '' and v_state !~ '^[A-Z]{2}$')
       or (v_zip <> '' and v_zip !~ '^[0-9]{5}-?[0-9]{3}$')
       or (v_email <> '' and v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$')
       or (v_document_digits <> '' and length(v_document_digits) not in (11, 14))
       or pg_catalog.jsonb_typeof(v_raw -> 'confianca') <> 'number' then
      raise exception 'ia_client_import_candidate_invalid';
    end if;

    v_confidence := (v_raw ->> 'confianca')::numeric;
    if v_confidence < 0 or v_confidence > 1 then
      raise exception 'ia_client_import_candidate_invalid';
    end if;
    v_cpf := case when length(v_document_digits) = 11 then v_document else null end;
    v_cnpj := case when length(v_document_digits) = 14 then v_document else null end;
    v_payload := pg_catalog.jsonb_build_object(
      'nome', v_name,
      'telefone', v_phone,
      'email', v_email,
      'documento', v_document,
      'endereco', v_address,
      'complemento', v_complement,
      'cidade', v_city,
      'estado', v_state,
      'cep', v_zip
    );

    select pg_catalog.count(*)::integer,
           pg_catalog.min(c.id),
           pg_catalog.min(c.nome),
           pg_catalog.bool_or(c.excluido_em is not null)
      into v_match_count, v_match_id, v_match_name, v_match_deleted
    from public.clientes c
    where c.user_id = p_tenant_user_id
      and (
        (v_document_digits <> '' and (
          pg_catalog.regexp_replace(pg_catalog.coalesce(c.cpf, ''), '[^0-9]', '', 'g') = v_document_digits
          or pg_catalog.regexp_replace(pg_catalog.coalesce(c.cnpj, ''), '[^0-9]', '', 'g') = v_document_digits
        ))
        or (
          v_phone_digits <> ''
          and pg_catalog.regexp_replace(pg_catalog.coalesce(c.telefone, ''), '[^0-9]', '', 'g') = v_phone_digits
          and pg_catalog.lower(pg_catalog.btrim(c.nome)) = pg_catalog.lower(v_name)
        )
      );

    v_client_id := null;
    v_decision := null;
    v_conflict_reason := null;
    if v_match_count = 1 and not v_match_deleted then
      v_client_id := v_match_id;
      v_decision := 'existente';
    elsif v_match_count > 0 then
      v_decision := 'conflito';
      v_conflict_reason := case when v_match_deleted then 'registro_na_lixeira' else 'duplicidade_ambigua' end;
    elsif v_phone_digits <> '' then
      select pg_catalog.count(*)::integer,
             pg_catalog.min(c.id),
             pg_catalog.min(c.nome),
             pg_catalog.bool_or(c.excluido_em is not null)
        into v_match_count, v_match_id, v_match_name, v_match_deleted
      from public.clientes c
      where c.user_id = p_tenant_user_id
        and pg_catalog.regexp_replace(pg_catalog.coalesce(c.telefone, ''), '[^0-9]', '', 'g') = v_phone_digits;
      if v_match_count > 0 then
        v_decision := 'conflito';
        v_conflict_reason := 'telefone_em_outro_cadastro';
      end if;
    end if;

    if v_decision is null then
      v_client_id := gen_random_uuid()::text;
      insert into public.clientes (
        id, user_id, criado_por, nome, telefone, cpf, cnpj, endereco,
        complemento, estado, cidade, cep, criado_em, atualizado_em, excluido_em
      ) values (
        v_client_id, p_tenant_user_id, p_actor_user_id, v_name,
        pg_catalog.nullif(v_phone, ''), v_cpf, v_cnpj,
        pg_catalog.nullif(v_address, ''), pg_catalog.nullif(v_complement, ''),
        pg_catalog.nullif(v_state, ''), pg_catalog.nullif(v_city, ''),
        pg_catalog.nullif(v_zip, ''), v_now, v_now, null
      );
      v_decision := 'criado';
    end if;

    insert into public.ia_client_import_candidates (
      job_id, tenant_user_id, ordinal, payload, confidence, evidence,
      decision, client_id, conflict_reason, created_at
    ) values (
      p_job_id, p_tenant_user_id, v_ordinal, v_payload, v_confidence,
      v_evidence, v_decision, v_client_id, v_conflict_reason, v_now
    );

    v_client_result := pg_catalog.jsonb_build_object(
      'ordinal', v_ordinal,
      'nome', v_name,
      'clienteId', v_client_id,
      'motivo', v_conflict_reason
    );
    if v_decision = 'criado' then
      v_client_result := v_client_result || pg_catalog.jsonb_build_object(
        'cliente', pg_catalog.jsonb_build_object(
          'id', v_client_id,
          'nome', v_name,
          'telefone', v_phone,
          'cpf', v_cpf,
          'cnpj', v_cnpj,
          'endereco', v_address,
          'complemento', v_complement,
          'estado', v_state,
          'cidade', v_city,
          'cep', v_zip,
          'criadoEm', v_now
        )
      );
      v_created := v_created || pg_catalog.jsonb_build_array(v_client_result);
    elsif v_decision = 'existente' then
      v_existing := v_existing || pg_catalog.jsonb_build_array(v_client_result);
    else
      v_conflicts := v_conflicts || pg_catalog.jsonb_build_array(v_client_result);
    end if;
  end loop;

  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'jobId', p_job_id,
    'status', 'aplicada',
    'idempotente', false,
    'criados', v_created,
    'existentes', v_existing,
    'conflitos', v_conflicts,
    'resumo', pg_catalog.jsonb_build_object(
      'criados', pg_catalog.jsonb_array_length(v_created),
      'existentes', pg_catalog.jsonb_array_length(v_existing),
      'conflitos', pg_catalog.jsonb_array_length(v_conflicts)
    )
  );

  update public.ia_client_import_jobs
  set status = 'aplicada', result = v_result, applied_at = v_now
  where id = p_job_id and status = 'processando';
  if not found then
    raise exception 'ia_client_import_audit_failed';
  end if;

  return v_result;
end;
$$;

revoke all on function public.commit_ia_client_import(
  uuid, uuid, uuid, uuid, text, uuid, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.commit_ia_client_import(
  uuid, uuid, uuid, uuid, text, uuid, text, text, text, text, text, jsonb
) to service_role;

create or replace function public.purge_expired_ia_client_imports(
  p_now timestamptz default pg_catalog.now()
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_now is null or p_now > pg_catalog.now() + interval '5 minutes' then
    raise exception 'ia_client_import_purge_invalid_clock';
  end if;
  delete from public.ia_client_import_jobs j where j.expires_at <= p_now;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_ia_client_imports(timestamptz)
  from public, anon, authenticated;
grant execute on function public.purge_expired_ia_client_imports(timestamptz)
  to service_role;

-- Rollback operacional:
-- 1. desligar a rota /ia/autopilot/clientes/commit no Worker;
-- 2. preservar jobs/candidatos para auditoria e deixar o TTL expirar;
-- 3. clientes confirmados continuam recuperáveis pela lixeira normal;
-- 4. remover função/tabelas somente em migration posterior e autorizada.
