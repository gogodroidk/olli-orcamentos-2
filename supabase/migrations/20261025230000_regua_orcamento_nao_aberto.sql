-- Régua "orçamento enviado e NÃO ABERTO em 48 h" (Z-123 / Z-52, 25/10/2026).
--
-- Gatilho → mensagem → humano: o link público (`orcamentos_publicos`) segue sem `visualizado_em` há
-- 48 h–7 dias → UM e-mail ao PRESTADOR ("seu cliente ainda não abriu") → o prestador chama o cliente.
-- A OLLI nunca escreve ao cliente final por esta régua.
--
-- Reusa a esteira dos lembretes (mesma outbox, supressão, teto de 1 e-mail/24 h por pessoa, teto diário):
--   1. `listar_nao_abertos_email`  — função NOVA (não mexe em `listar_candidatos_lembrete_email`);
--   2. `enqueue_lembrete_email`    — ganha o tipo `nao_aberto` por remendo do texto real da função
--      (mesmo método da 20261007140000; falha em voz alta se a âncora mudou; idempotente) e RECONFERE o
--      orçamento sob a trava antes de enfileirar.
-- NÃO APLICAR sem os gates (ci-local, revisão, staging). Produção: tipo desligado até o sufixo de
-- EMAIL_LEMBRETES_MODE listar `nao_aberto` ("production:...,nao_aberto").

begin;

-- ─── 1. Candidatos ───────────────────────────────────────────────────────────────
create or replace function public.listar_nao_abertos_email(
  p_now timestamptz default now(),
  p_limit integer default 50
)
returns table(candidato jsonb)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if p_now is null
     or p_now > pg_catalog.now() + interval '5 minutes'
     or p_now < pg_catalog.now() - interval '1 day'
     or p_limit is null or p_limit < 1 or p_limit > 200
  then
    raise exception 'nao_abertos_argumentos_invalidos';
  end if;

  return query
  select pg_catalog.jsonb_build_object(
    'userId', op.user_id,
    'token', op.token,
    'enviadoEm', pg_catalog.to_char(op.criado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'visualizadoEm', op.visualizado_em,
    'respondidoEm', op.respondido_em,
    'revogadoEm', op.revogado_em,
    'avisadoEm', (
      select pg_catalog.max(o.created_at) from public.email_outbox o
      where o.idempotency_key = 'reengajamento:' || op.user_id::text || ':nao_aberto:' || op.token
    ),
    'membroDeEquipe', (
      (select pg_catalog.count(*) from public.organizacoes g where g.owner_user_id = op.user_id) = 0
      and exists (select 1 from public.organizacao_membros m where m.user_id = op.user_id and m.ativo)
    ),
    'suprimido', false -- quem está suprimido nem entra (filtro abaixo); o campo é exigido pela política
  )
  from public.orcamentos_publicos op
  join auth.users u on u.id = op.user_id
  where op.status = 'enviado'
    and op.visualizado_em is null
    and op.respondido_em is null
    and op.revogado_em is null
    and op.criado_em <= p_now - interval '48 hours'
    and op.criado_em > p_now - interval '7 days'
    and u.email is not null
    and pg_catalog.btrim(u.email) <> ''
    and u.email_confirmed_at is not null
    and u.email_confirmed_at <= p_now
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= p_now)
    and coalesce(u.is_anonymous, false) = false
    and not exists (select 1 from public.email_supressoes s where s.user_id = u.id)
    and not public.conta_interna(u.id)
    and not private.email_recebeu_ultimas_24h(u.id, p_now)
    and not exists (
      select 1 from public.email_outbox o
      where o.idempotency_key = 'reengajamento:' || op.user_id::text || ':nao_aberto:' || op.token
    )
  order by op.criado_em, op.token
  limit p_limit;
end;
$function$;

revoke all on function public.listar_nao_abertos_email(timestamptz, integer) from public, anon, authenticated;

-- ─── 2. Enqueue: tipo `nao_aberto` + reconferência sob a trava ────────────────────
do $patch$
declare
  v_def  text;
  v_novo text;
  v_ancora_tipos constant text := '''ativacao_ultima'', ''parou'', ''trial_acabando''';
  v_ancora_ramo  constant text := E'    else -- trial_acabando\n';
  v_ramo constant text := E'    elsif v_tipo = ''nao_aberto'' then\n'
    || E'      if (p_template_dados ->> ''token'') is null or (p_template_dados ->> ''token'') !~ ''^[A-Za-z0-9_-]{8,128}$'' then\n'
    || E'        return pg_catalog.jsonb_build_object(''enfileirado'', false, ''motivo'', ''dados_invalidos'');\n'
    || E'      end if;\n'
    || E'      if p_idempotency_key <> v_prefixo || ''nao_aberto:'' || (p_template_dados ->> ''token'') then\n'
    || E'        raise exception ''lembrete_chave_divergente'';\n'
    || E'      end if;\n'
    || E'      if not exists (\n'
    || E'        select 1 from public.orcamentos_publicos op\n'
    || E'        where op.token = p_template_dados ->> ''token''\n'
    || E'          and op.user_id = p_user_id\n'
    || E'          and op.status = ''enviado''\n'
    || E'          and op.visualizado_em is null\n'
    || E'          and op.respondido_em is null\n'
    || E'          and op.revogado_em is null\n'
    || E'          and op.criado_em <= p_now - interval ''48 hours''\n'
    || E'          and op.criado_em > p_now - interval ''7 days''\n'
    || E'          and pg_catalog.to_char(op.criado_em at time zone ''UTC'', ''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'')\n'
    || E'              = p_template_dados ->> ''enviadoEm''\n'
    || E'      ) then\n'
    || E'        return pg_catalog.jsonb_build_object(''enfileirado'', false, ''motivo'', ''orcamento_fora_da_janela'');\n'
    || E'      end if;\n\n';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enqueue_lembrete_email';
  if v_def is null then raise exception 'enqueue_lembrete_email_ausente'; end if;
  if position('nao_aberto' in v_def) = 0 then
    if position(v_ancora_tipos in v_def) = 0 then raise exception 'enqueue_ancora_tipos_nao_encontrada'; end if;
    if position(v_ancora_ramo in v_def) = 0 then raise exception 'enqueue_ancora_ramo_nao_encontrada'; end if;
    v_novo := replace(v_def, v_ancora_tipos, v_ancora_tipos || ', ''nao_aberto''');
    v_novo := replace(v_novo, v_ancora_ramo, v_ramo || v_ancora_ramo);
    execute v_novo;
  end if;
end
$patch$;

-- O patch recria a função: confirma que o acesso continua só do service_role.
revoke all on function public.enqueue_lembrete_email(uuid, text, text, text, text, jsonb, integer, timestamptz) from public, anon, authenticated;

commit;
