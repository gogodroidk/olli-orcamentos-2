-- CONTAS INTERNAS × CLIENTES (ordem do Igor, 07/10/2026): uma fonte única, e TUDO que mede ou contata a exclui.
--
-- A fonte única JÁ existe e continua sendo `public.funil_exclusoes` ("Marcar como conta interna" do painel) mais
-- os administradores (`admin_memberships`). Já excluem: anuncios_conversoes_pendentes, funil_contas_marcos,
-- receita_conta_interna, ativacao_funil_etapas e (T1/#185) as funções de medição do 1º orçamento.
-- ESTA migration (só aditiva) faz o que faltava:
--   1. `public.conta_interna(user_id)` — UMA função booleana para o banco inteiro perguntar "é interna?";
--   2. `public.conta_interna_por_telefone(telefone)` — o telefone é de uma conta interna? (guarda do WhatsApp);
--   3. ORGANIZAÇÃO interna: marcar a org marca seus membros, com PRÉVIA ("N contas serão marcadas"), confirmação
--      que tem de bater com a prévia, SALVAGUARDA (quem também é membro/dono de OUTRA organização cliente NÃO é
--      marcado — um cliente onde o suporte foi convidado não pode sumir dos números) e DESFAZER em 1 passo:
--      cada marcação por org grava `funil_exclusoes.org_id`, então desmarcar remove só o que a org criou;
--   4. régua de e-mail: `listar_candidatos_lembrete_email` e `enqueue_lembrete_email` passam a recusar conta interna
--      (a lista e, de novo, o ponto onde o e-mail é enfileirado).
--
-- Nenhum e-mail fixo aqui: quem é interno entra pelo painel ADM (marcar conta/organização), nunca por migration.
-- Leitura/escrita só service_role. Idempotente.

-- ─── origem da marcação por organização ───────────────────────────────────────
alter table public.funil_exclusoes add column if not exists org_id uuid;
create index if not exists funil_exclusoes_org_idx on public.funil_exclusoes (org_id) where org_id is not null;

create table if not exists public.organizacoes_internas (
  org_id      uuid primary key references public.organizacoes (id) on delete cascade,
  motivo      text not null check (char_length(motivo) between 3 and 200),
  marcado_por uuid,
  marcado_em  timestamptz not null default now()
);
alter table public.organizacoes_internas enable row level security;
revoke all on public.organizacoes_internas from public, anon, authenticated;
grant select on public.organizacoes_internas to service_role;

-- ─── 1) a pergunta única ──────────────────────────────────────────────────────
create or replace function public.conta_interna(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select p_user_id is not null and (
    exists (select 1 from public.funil_exclusoes f where f.user_id = p_user_id)
    or exists (
      select 1
        from auth.users u
        join public.funil_exclusoes f on f.email is not null and lower(f.email) = lower(u.email)
       where u.id = p_user_id
    )
    or exists (select 1 from public.admin_memberships am where am.user_id = p_user_id and am.ativo)
  );
$$;
revoke all on function public.conta_interna(uuid) from public, anon, authenticated;
grant execute on function public.conta_interna(uuid) to service_role;
comment on function public.conta_interna(uuid) is
  'true = conta interna (funil_exclusoes por id/e-mail, ou administrador ativo). A única pergunta que métricas e automações fazem.';

-- ─── 2) telefone de conta interna (guarda do WhatsApp) ────────────────────────
create or replace function public.conta_interna_por_telefone(p_telefone text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select private.telefone_whatsapp_br(p_telefone) is not null and exists (
    select 1
      from auth.users u
     where private.telefone_whatsapp_br(u.raw_user_meta_data ->> 'phone') = private.telefone_whatsapp_br(p_telefone)
       and public.conta_interna(u.id)
  );
$$;
revoke all on function public.conta_interna_por_telefone(text) from public, anon, authenticated;
grant execute on function public.conta_interna_por_telefone(text) to service_role;

-- ─── 3) organização interna: prévia, marcar, desmarcar ────────────────────────
-- Membros da org = o dono + os membros ativos. PRESERVADO = também é dono/membro ativo de OUTRA organização que
-- NÃO é interna. Já interno = já passa em conta_interna (não é remarcado, e por isso o desfazer não o toca).
create or replace function public.admin_previa_org_interna(p_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_nome text;
  v_total integer;
  v_marcar uuid[];
  v_preservadas uuid[];
  v_ja uuid[];
begin
  select o.nome into v_nome from public.organizacoes o where o.id = p_org_id;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'erro', 'org_inexistente');
  end if;

  with alvo as (
    select o.owner_user_id as uid from public.organizacoes o where o.id = p_org_id and o.owner_user_id is not null
    union
    select m.user_id from public.organizacao_membros m where m.org_id = p_org_id and m.ativo
  ), classif as (
    select a.uid,
           public.conta_interna(a.uid) as ja_interna,
           (
             exists (
               select 1 from public.organizacao_membros m
                where m.user_id = a.uid and m.ativo and m.org_id <> p_org_id
                  and not exists (select 1 from public.organizacoes_internas oi where oi.org_id = m.org_id)
             )
             or exists (
               select 1 from public.organizacoes o2
                where o2.owner_user_id = a.uid and o2.id <> p_org_id
                  and not exists (select 1 from public.organizacoes_internas oi where oi.org_id = o2.id)
             )
           ) as em_outra_org_cliente
      from alvo a
  )
  select pg_catalog.count(*)::integer,
         coalesce(pg_catalog.array_agg(c.uid) filter (where not c.ja_interna and not c.em_outra_org_cliente), '{}'),
         coalesce(pg_catalog.array_agg(c.uid) filter (where not c.ja_interna and c.em_outra_org_cliente), '{}'),
         coalesce(pg_catalog.array_agg(c.uid) filter (where c.ja_interna), '{}')
    into v_total, v_marcar, v_preservadas, v_ja
    from classif c;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'org_id', p_org_id,
    'nome', v_nome,
    'ja_marcada', exists (select 1 from public.organizacoes_internas oi where oi.org_id = p_org_id),
    'total_membros', v_total,
    'serao_marcadas', pg_catalog.cardinality(v_marcar),
    'preservadas', pg_catalog.cardinality(v_preservadas),
    'ja_internas', pg_catalog.cardinality(v_ja),
    'marcar_ids', pg_catalog.to_jsonb(v_marcar),
    'preservadas_ids', pg_catalog.to_jsonb(v_preservadas)
  );
end;
$$;
revoke all on function public.admin_previa_org_interna(uuid) from public, anon, authenticated;
grant execute on function public.admin_previa_org_interna(uuid) to service_role;

-- Marcar: a confirmação (p_confirmar) TEM de ser o número da prévia que a pessoa viu; se a org mudou, recusa e devolve
-- o número novo (nada é marcado às cegas).
create or replace function public.admin_marcar_org_interna(
  p_org_id   uuid,
  p_confirmar integer,
  p_motivo   text,
  p_por      uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_prev jsonb;
  v_ids uuid[];
  v_n integer;
begin
  if p_motivo is null or pg_catalog.char_length(pg_catalog.btrim(p_motivo)) < 3 then
    return pg_catalog.jsonb_build_object('ok', false, 'erro', 'motivo_invalido');
  end if;
  if p_confirmar is null then
    return pg_catalog.jsonb_build_object('ok', false, 'erro', 'confirmacao_obrigatoria');
  end if;

  -- Uma marcação por vez na mesma organização.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olli.org_interna:' || p_org_id::text, 0));

  v_prev := public.admin_previa_org_interna(p_org_id);
  if (v_prev ->> 'ok')::boolean is not true then
    return v_prev;
  end if;
  if (v_prev ->> 'ja_marcada')::boolean then
    return pg_catalog.jsonb_build_object('ok', true, 'ja_marcada', true, 'marcadas', 0);
  end if;
  if (v_prev ->> 'serao_marcadas')::integer <> p_confirmar then
    return pg_catalog.jsonb_build_object('ok', false, 'erro', 'previa_mudou', 'serao_marcadas', (v_prev ->> 'serao_marcadas')::integer);
  end if;

  select coalesce(pg_catalog.array_agg(x::uuid), '{}') into v_ids
    from pg_catalog.jsonb_array_elements_text(v_prev -> 'marcar_ids') x;

  insert into public.organizacoes_internas (org_id, motivo, marcado_por)
  values (p_org_id, pg_catalog.left(pg_catalog.btrim(p_motivo), 200), p_por);

  insert into public.funil_exclusoes (user_id, motivo, criado_por, org_id)
  select u, pg_catalog.left(pg_catalog.btrim(p_motivo), 200), p_por, p_org_id
    from pg_catalog.unnest(v_ids) u;
  get diagnostics v_n = row_count;

  return pg_catalog.jsonb_build_object('ok', true, 'marcadas', v_n, 'preservadas', (v_prev ->> 'preservadas')::integer);
end;
$$;
revoke all on function public.admin_marcar_org_interna(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_marcar_org_interna(uuid, integer, text, uuid) to service_role;

-- Desmarcar (1 passo): remove só o que ESTA organização marcou; quem já era interno por conta própria continua.
create or replace function public.admin_desmarcar_org_interna(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_n integer;
  v_tinha boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('olli.org_interna:' || p_org_id::text, 0));
  select exists (select 1 from public.organizacoes_internas oi where oi.org_id = p_org_id) into v_tinha;
  delete from public.funil_exclusoes f where f.org_id = p_org_id;
  get diagnostics v_n = row_count;
  delete from public.organizacoes_internas oi where oi.org_id = p_org_id;
  return pg_catalog.jsonb_build_object('ok', true, 'estava_marcada', v_tinha, 'desmarcadas', v_n);
end;
$$;
revoke all on function public.admin_desmarcar_org_interna(uuid) from public, anon, authenticated;
grant execute on function public.admin_desmarcar_org_interna(uuid) to service_role;

-- ─── 4) régua de e-mail: nada para conta interna ──────────────────────────────
-- As duas funções são grandes e já estão em produção; em vez de reescrevê-las (e arriscar divergir da versão viva) o
-- patch troca UMA linha de cada, sobre o texto real, e falha em voz alta se a linha não for encontrada.
do $patch$
declare
  v_def  text;
  v_novo text;
  v_ancora_lista  constant text := 'and not exists (select 1 from public.email_supressoes s where s.user_id = u.id)';
  v_ancora_fila   constant text := 'if exists (select 1 from public.email_supressoes s where s.user_id = p_user_id) then';
begin
  -- a) a lista de candidatos
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'listar_candidatos_lembrete_email';
  if v_def is null then raise exception 'listar_candidatos_lembrete_email_ausente'; end if;
  if position('public.conta_interna(' in v_def) = 0 then
    if position(v_ancora_lista in v_def) = 0 then raise exception 'listar_candidatos_ancora_nao_encontrada'; end if;
    v_novo := replace(v_def, v_ancora_lista, v_ancora_lista || E'\n      and not public.conta_interna(u.id)');
    execute v_novo;
  end if;

  -- b) o ponto onde o e-mail é enfileirado (segunda trava)
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enqueue_lembrete_email';
  if v_def is null then raise exception 'enqueue_lembrete_email_ausente'; end if;
  if position('public.conta_interna(' in v_def) = 0 then
    if position(v_ancora_fila in v_def) = 0 then raise exception 'enqueue_ancora_nao_encontrada'; end if;
    v_novo := replace(v_def, v_ancora_fila,
      E'if public.conta_interna(p_user_id) then\n    return pg_catalog.jsonb_build_object(''enfileirado'', false, ''motivo'', ''conta_interna'');\n  end if;\n\n  ' || v_ancora_fila);
    execute v_novo;
  end if;
end
$patch$;

-- ─── 5) medição do 1º orçamento (T1/#185): mesma pergunta única ────────────────
-- A função aplicada em produção exclui por funil_exclusoes (id/e-mail); passa a perguntar `conta_interna`, que também
-- cobre administrador ativo. Mesmo método do remendo acima (texto real, falha em voz alta se a cláusula mudou).
do $patch_t1$
declare
  v_def  text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'primeiro_orcamento_por_conta';
  if v_def is null then
    return; -- T1 ainda não aplicada neste banco: nada a remendar (o T1 já exclui funil_exclusoes sozinho)
  end if;
  if position('public.conta_interna(' in v_def) = 0 then
    v_novo := regexp_replace(
      v_def,
      'and not exists \(\s*select 1 from public\.funil_exclusoes f\s*where f\.user_id = u\.id or \(f\.email is not null and lower\(f\.email\) = lower\(u\.email\)\)\s*\)',
      'and not public.conta_interna(u.id)'
    );
    if v_novo = v_def then raise exception 'primeiro_orcamento_ancora_nao_encontrada'; end if;
    execute v_novo;
  end if;
end
$patch_t1$;

-- ─── 6) WhatsApp: conta interna nunca é abordada ─────────────────────────────────
-- `pode_contatar_whatsapp` é a pergunta que o SALES faz antes de CADA mensagem (docs/WHATSAPP_NAO_CONTATAR.md) e que o
-- guarda do #181 (wa_autorizar_envio) também chama: um ponto só cobre os dois. Recusa pela CONTA e pelo TELEFONE
-- (um lead cujo número é o de uma conta interna também não é abordado).
do $patch_whatsapp$
declare
  v_def  text;
  v_novo text;
  v_ancora constant text := 'if p_user_id is not null then';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'pode_contatar_whatsapp';
  if v_def is null then raise exception 'pode_contatar_whatsapp_ausente'; end if;
  if position('public.conta_interna(' in v_def) = 0 then
    if position(v_ancora in v_def) = 0 then raise exception 'pode_contatar_ancora_nao_encontrada'; end if;
    v_novo := replace(v_def, v_ancora,
      E'-- Conta INTERNA (equipe, demo, teste): nunca se aborda, pela conta ou pelo telefone (migration contas_internas).\n'
      || E'  if (p_user_id is not null and public.conta_interna(p_user_id))\n'
      || E'     or (v_tel is not null and public.conta_interna_por_telefone(v_tel)) then\n'
      || E'    return pg_catalog.jsonb_build_object(''pode'', false, ''motivo'', ''conta_interna'');\n'
      || E'  end if;\n\n  ' || v_ancora);
    execute v_novo;
  end if;
end
$patch_whatsapp$;
