-- Lembrete "seu Pix do plano vence em ~3 h" (P0-08, 26/10/2026).
--
-- A cobrança Pix do plano já é gravada em `webhook_events` (origem `pix_cobranca`, tipo
-- `plano_pix_criada`, payload {user_id, plano, expires_at}; #223). O pagamento visto fica em
-- `webhook_events` origem `abacate` (event_id = id da cobrança; a linha só nasce depois de a AbacatePay
-- confirmar PAID). Sem tabela nova.
--
-- Reusa a esteira dos lembretes (mesma outbox, supressão/SAIR, conta interna, teto diário global):
--   0. `private.pix_vence_limite` e `private.timestamptz_ou_nulo` — helpers (janela e leitura segura da data);
--   1. `listar_pix_vence_email`  — função NOVA: cobranças sem pagamento visto, não substituídas por um Pix
--      mais novo da mesma conta, vencendo entre 1 h e 4 h a partir de agora (na última rodada do dia, 19h de
--      Brasília, até 09:00 do dia seguinte — quem vence de madrugada é avisado na véspera);
--   2. `enqueue_lembrete_email`  — ganha o tipo `pix_vence` por remendo do texto real da função (mesmo
--      método da 20261007140000 e da régua `nao_aberto`; falha em voz alta se a âncora mudou; idempotente)
--      e RECONFERE a cobrança sob a trava antes de enfileirar. O teto de 1 e-mail/24 h por pessoa NÃO vale
--      para `pix_vence`: é aviso de uma compra que a própria pessoa começou (1 por cobrança), e o e-mail de
--      boas-vindas do mesmo dia não pode engolir o aviso do Pix.
-- NÃO APLICAR sem os gates (ci-local, revisão, staging). Produção: tipo desligado até o sufixo de
-- EMAIL_LEMBRETES_MODE listar `pix_vence` ("production:...,pix_vence").

begin;

-- ─── 0. Helpers ──────────────────────────────────────────────────────────────────
-- Vencimento mais distante que a rodada de `p_now` avisa. Igual a `limiteDoAviso` (worker/src/pixVencePolicy.js):
-- agora + 4 h; a partir das 19h de Brasília (UTC-3 fixo, como o worker), 09:00 do dia seguinte.
create or replace function private.pix_vence_limite(p_now timestamptz)
returns timestamptz
language sql
immutable
set search_path to ''
as $function$
  select case
    when extract(hour from (p_now at time zone 'UTC') - interval '3 hours') >= 19
      then (pg_catalog.date_trunc('day', (p_now at time zone 'UTC') - interval '3 hours') + interval '1 day 12 hours') at time zone 'UTC'
    else p_now + interval '4 hours'
  end;
$function$;

-- Payload é texto livre gravado pelo worker: data torta vira NULL em vez de derrubar a lista inteira.
create or replace function private.timestamptz_ou_nulo(p_texto text)
returns timestamptz
language plpgsql
stable -- o cast de texto sem fuso depende do TimeZone da sessão
set search_path to ''
as $function$
begin
  if p_texto is null or p_texto !~ '^\d{4}-\d{2}-\d{2}T' then return null; end if;
  return p_texto::timestamptz;
exception when others then
  return null;
end;
$function$;

revoke all on function private.pix_vence_limite(timestamptz) from public, anon, authenticated;
revoke all on function private.timestamptz_ou_nulo(text) from public, anon, authenticated;

-- ─── 1. Candidatos ───────────────────────────────────────────────────────────────
create or replace function public.listar_pix_vence_email(
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
    raise exception 'pix_vence_argumentos_invalidos';
  end if;

  return query
  with cobrancas as (
    -- Payload é texto livre gravado pelo worker: nada de cast direto (um valor torto derrubaria a lista).
    select
      c.event_id,
      c.recebido_em,
      c.payload ->> 'plano' as plano,
      case when (c.payload ->> 'user_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (c.payload ->> 'user_id')::uuid end as user_id,
      private.timestamptz_ou_nulo(c.payload ->> 'expires_at') as expira
    from public.webhook_events c
    where c.origem = 'pix_cobranca'
      and c.tipo = 'plano_pix_criada'
      and c.recebido_em > p_now - interval '2 days'
  )
  select pg_catalog.jsonb_build_object(
    'userId', cb.user_id,
    'cobrancaId', cb.event_id,
    'plano', cb.plano,
    'expiraEm', pg_catalog.to_char(cb.expira at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'pago', false,      -- pago/superada/suprimida/avisada nem entram (filtros abaixo);
    'superada', false,  -- os campos são exigidos pela política (que falha fechado sem eles)
    'suprimido', false,
    'avisadoEm', null
  )
  from cobrancas cb
  join auth.users u on u.id = cb.user_id
  where cb.user_id is not null
    and cb.expira > p_now + interval '1 hour'
    and cb.expira <= private.pix_vence_limite(p_now)
    and cb.plano in ('pro_mensal', 'pro_anual', 'empresa_mensal', 'empresa_anual')
    and cb.event_id ~ '^[A-Za-z0-9_-]{4,120}$'
    -- esta cobrança já foi paga. Qualquer status: a linha `abacate` só nasce depois de a AbacatePay
    -- confirmar PAID (`liberarSePaga`); 'recebido'/'falhou' = pagou e a concessão ainda não fechou.
    -- Dizer "ainda não foi pago" a essa pessoa a levaria a pagar de novo.
    and not exists (
      select 1 from public.webhook_events p
      where p.origem = 'abacate' and p.event_id = cb.event_id
    )
    -- a pessoa pagou outro Pix depois de gerar este
    and not exists (
      select 1 from public.webhook_events p
      where p.origem = 'abacate'
        and p.payload ->> 'user_id' = cb.user_id::text
        and p.recebido_em >= cb.recebido_em
    )
    -- existe um Pix mais novo da mesma conta: só o último conta
    and not exists (
      select 1 from public.webhook_events n
      where n.origem = 'pix_cobranca' and n.tipo = 'plano_pix_criada'
        and n.payload ->> 'user_id' = cb.user_id::text
        and n.recebido_em > cb.recebido_em
    )
    and u.email is not null
    and pg_catalog.btrim(u.email) <> ''
    and u.email_confirmed_at is not null
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= p_now)
    and coalesce(u.is_anonymous, false) = false
    and not exists (select 1 from public.email_supressoes s where s.user_id = u.id)
    and not public.conta_interna(u.id)
    and not exists (
      select 1 from public.email_outbox o
      where o.idempotency_key = 'reengajamento:' || cb.user_id::text || ':pix_vence:' || cb.event_id
    )
  order by cb.expira, cb.event_id
  limit p_limit;
end;
$function$;

revoke all on function public.listar_pix_vence_email(timestamptz, integer) from public, anon, authenticated;

-- ─── 2. Enqueue: tipo `pix_vence` + reconferência sob a trava + fora do teto de 24 h ───
do $patch$
declare
  v_def  text;
  v_novo text;
  v_ancora_tipos constant text := '''ativacao_ultima'', ''parou'', ''trial_acabando''';
  v_ancora_teto  constant text := E'  if private.email_recebeu_ultimas_24h(p_user_id, p_now) then\n';
  v_teto_novo    constant text := E'  if coalesce(v_tipo, '''') <> ''pix_vence'' and private.email_recebeu_ultimas_24h(p_user_id, p_now) then\n';
  v_ancora_ramo  constant text := E'    else -- trial_acabando\n';
  v_ramo constant text := E'    elsif v_tipo = ''pix_vence'' then\n'
    || E'      if (p_template_dados ->> ''cobrancaId'') is null or (p_template_dados ->> ''cobrancaId'') !~ ''^[A-Za-z0-9_-]{4,120}$'' then\n'
    || E'        return pg_catalog.jsonb_build_object(''enfileirado'', false, ''motivo'', ''dados_invalidos'');\n'
    || E'      end if;\n'
    || E'      if p_idempotency_key <> v_prefixo || ''pix_vence:'' || (p_template_dados ->> ''cobrancaId'') then\n'
    || E'        raise exception ''lembrete_chave_divergente'';\n'
    || E'      end if;\n'
    || E'      if not exists (\n'
    || E'        select 1 from public.webhook_events c\n'
    || E'        where c.origem = ''pix_cobranca'' and c.tipo = ''plano_pix_criada''\n'
    || E'          and c.event_id = p_template_dados ->> ''cobrancaId''\n'
    || E'          and c.payload ->> ''user_id'' = p_user_id::text\n'
    || E'          and c.payload ->> ''plano'' = p_template_dados ->> ''plano''\n'
    || E'          and pg_catalog.to_char(private.timestamptz_ou_nulo(c.payload ->> ''expires_at'') at time zone ''UTC'', ''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'')\n'
    || E'              = p_template_dados ->> ''expiraEm''\n'
    || E'          and private.timestamptz_ou_nulo(c.payload ->> ''expires_at'') > p_now + interval ''1 hour''\n'
    || E'          and private.timestamptz_ou_nulo(c.payload ->> ''expires_at'') <= private.pix_vence_limite(p_now)\n'
    || E'          and not exists (select 1 from public.webhook_events n\n'
    || E'                          where n.origem = ''pix_cobranca'' and n.tipo = ''plano_pix_criada''\n'
    || E'                            and n.payload ->> ''user_id'' = p_user_id::text and n.recebido_em > c.recebido_em)\n'
    || E'      ) then\n'
    || E'        return pg_catalog.jsonb_build_object(''enfileirado'', false, ''motivo'', ''pix_fora_da_janela'');\n'
    || E'      end if;\n'
    || E'      if exists (\n'
    || E'        select 1 from public.webhook_events p\n'
    || E'        where p.origem = ''abacate''\n'
    || E'          and (p.event_id = p_template_dados ->> ''cobrancaId''\n'
    || E'               or (p.payload ->> ''user_id'' = p_user_id::text\n'
    || E'                   and p.recebido_em >= (select c.recebido_em from public.webhook_events c\n'
    || E'                                         where c.origem = ''pix_cobranca'' and c.event_id = p_template_dados ->> ''cobrancaId'')))\n'
    || E'      ) then\n'
    || E'        return pg_catalog.jsonb_build_object(''enfileirado'', false, ''motivo'', ''pix_pago'');\n'
    || E'      end if;\n\n';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enqueue_lembrete_email';
  if v_def is null then raise exception 'enqueue_lembrete_email_ausente'; end if;
  if position('pix_vence' in v_def) = 0 then
    if position(v_ancora_tipos in v_def) = 0 then raise exception 'enqueue_ancora_tipos_nao_encontrada'; end if;
    if position(v_ancora_teto in v_def) = 0 then raise exception 'enqueue_ancora_teto_nao_encontrada'; end if;
    if position(v_ancora_ramo in v_def) = 0 then raise exception 'enqueue_ancora_ramo_nao_encontrada'; end if;
    v_novo := replace(v_def, v_ancora_tipos, v_ancora_tipos || ', ''pix_vence''');
    v_novo := replace(v_novo, v_ancora_teto, v_teto_novo);
    v_novo := replace(v_novo, v_ancora_ramo, v_ramo || v_ancora_ramo);
    execute v_novo;
  end if;
end
$patch$;

-- O patch recria a função: confirma que o acesso continua só do service_role.
revoke all on function public.enqueue_lembrete_email(uuid, text, text, text, text, jsonb, integer, timestamptz) from public, anon, authenticated;

commit;
