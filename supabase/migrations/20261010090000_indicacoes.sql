-- INDICAÇÃO MÍNIMA (spec CPO 07/10) — código por indicador, cadastro do indicado e
-- recompensa no 1º orçamento, TUDO atômico no banco (o worker só chama as funções).
--
-- Regras (docs/INDICACAO_MINIMA_checklist_execucao.md):
--   * link vale 7 DIAS (`indicacao_codigos.expira_em`); vencido, `indicacao_obter_codigo`
--     gera outro. Cadastro com código vencido não vincula.
--   * UM código serve para VÁRIOS indicados (cada um vira uma linha em `indicacoes`);
--     `indicado_id` é UNIQUE → 1 recompensa por indicado.
--   * TETO 5 recompensas por indicador, contado em `indicacoes` sob advisory lock
--     (duas recompensas simultâneas não passam do teto).
--   * auto-indicação, indicador/indicado em `funil_exclusoes` e orçamento sem valor não pagam.
--   * crédito nos DOIS lados, ref distinta por lado (o unique (origem, ref) do ledger
--     rejeitaria a 2ª linha se o ref fosse o mesmo) → idempotente a reentrega.
-- Usuário NUNCA escreve: sem policy de escrita; funções só para service_role.

create table if not exists public.indicacao_codigos (
  indicador_id uuid primary key references auth.users(id) on delete cascade,
  codigo       text not null unique check (codigo ~ '^OLLI-[A-Z0-9]{4,8}$'),
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null default now() + interval '7 days'
);

create table if not exists public.indicacoes (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null references public.indicacao_codigos(codigo) on update cascade,
  indicador_id    uuid not null references auth.users(id) on delete cascade,
  indicado_id     uuid not null unique references auth.users(id) on delete cascade,
  estado          text not null default 'cadastrou' check (estado in ('cadastrou','recompensado')),
  cadastrou_em    timestamptz not null default now(),
  recompensado_em timestamptz,
  creditos        integer check (creditos is null or creditos > 0),
  constraint indicacoes_nao_a_si_mesmo check (indicador_id <> indicado_id)
);
create index if not exists indicacoes_indicador_idx on public.indicacoes (indicador_id);

alter table public.indicacao_codigos enable row level security;
alter table public.indicacoes enable row level security;

drop policy if exists indicacao_codigos_le_proprio on public.indicacao_codigos;
create policy indicacao_codigos_le_proprio on public.indicacao_codigos
  for select to authenticated using (indicador_id = (select auth.uid()));
drop policy if exists indicacoes_le_suas on public.indicacoes;
create policy indicacoes_le_suas on public.indicacoes
  for select to authenticated using (indicador_id = (select auth.uid()));

-- Indicador vê o andamento, nunca o id de quem foi indicado.
revoke all on public.indicacao_codigos, public.indicacoes from anon, authenticated;
grant select on public.indicacao_codigos to authenticated;
grant select (id, estado, cadastrou_em, recompensado_em) on public.indicacoes to authenticated;

-- 1) Código vigente do indicador (cria / renova se vencido).
create or replace function public.indicacao_obter_codigo(p_indicador uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_cod text; v_exp timestamptz; v_try int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('indicacao:' || p_indicador::text, 0));
  select codigo, expira_em into v_cod, v_exp from public.indicacao_codigos where indicador_id = p_indicador;
  if v_cod is not null and v_exp > now() then return v_cod; end if;
  loop
    v_try := v_try + 1;
    v_cod := 'OLLI-' || upper(substr(md5(random()::text || clock_timestamp()::text || p_indicador::text), 1, 6));
    begin
      -- on update cascade: indicados já vinculados acompanham o código novo.
      insert into public.indicacao_codigos (indicador_id, codigo) values (p_indicador, v_cod)
      on conflict (indicador_id) do update
        set codigo = excluded.codigo, criado_em = now(), expira_em = now() + interval '7 days';
      return v_cod;
    exception when unique_violation then
      if v_try >= 5 then raise; end if;
    end;
  end loop;
end $$;

-- 2) Cadastro do indicado com ?ref=. Devolve o motivo, nunca erro.
create or replace function public.indicacao_registrar_cadastro(p_codigo text, p_indicado uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.indicacao_codigos;
begin
  select * into c from public.indicacao_codigos where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then return 'codigo_invalido'; end if;
  if c.expira_em <= now() then return 'expirado'; end if;
  if c.indicador_id = p_indicado then return 'auto_indicacao'; end if;
  if exists (select 1 from public.funil_exclusoes where user_id in (c.indicador_id, p_indicado)) then
    return 'conta_excluida';
  end if;
  insert into public.indicacoes (codigo, indicador_id, indicado_id)
  values (c.codigo, c.indicador_id, p_indicado)
  on conflict (indicado_id) do nothing;
  if not found then return 'ja_indicado'; end if;
  return 'ok';
end $$;

-- 3) Recompensa no 1º orçamento do indicado (valor > 0). Idempotente.
create or replace function public.indicacao_recompensar(p_indicado uuid, p_valor numeric, p_creditos integer default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.indicacoes; v_n int;
begin
  if coalesce(p_valor, 0) <= 0 then return jsonb_build_object('ok', false, 'motivo', 'valor_zero'); end if;
  if p_creditos is null or p_creditos <= 0 then return jsonb_build_object('ok', false, 'motivo', 'creditos_invalidos'); end if;
  select * into i from public.indicacoes where indicado_id = p_indicado;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'nao_veio_por_indicacao'); end if;
  perform pg_advisory_xact_lock(hashtextextended('indicacao:' || i.indicador_id::text, 0));
  select * into i from public.indicacoes where id = i.id;   -- relê já sob o lock
  if i.estado = 'recompensado' then return jsonb_build_object('ok', false, 'motivo', 'ja_recompensado'); end if;
  if exists (select 1 from public.funil_exclusoes where user_id in (i.indicador_id, i.indicado_id)) then
    return jsonb_build_object('ok', false, 'motivo', 'conta_excluida');
  end if;
  select count(*) into v_n from public.indicacoes where indicador_id = i.indicador_id and estado = 'recompensado';
  if v_n >= 5 then return jsonb_build_object('ok', false, 'motivo', 'teto_indicador'); end if;
  insert into public.credit_ledger (user_id, delta, origem, ref, descricao) values
    (i.indicador_id, p_creditos, 'referral', i.id::text || ':indicador', 'Indicação: seu colega fez o 1º orçamento'),
    (i.indicado_id,  p_creditos, 'referral', i.id::text || ':indicado',  'Indicação: bônus do seu 1º orçamento');
  update public.indicacoes set estado = 'recompensado', recompensado_em = now(), creditos = p_creditos where id = i.id;
  return jsonb_build_object('ok', true, 'indicacao_id', i.id, 'creditos', p_creditos);
end $$;

revoke all on function public.indicacao_obter_codigo(uuid), public.indicacao_registrar_cadastro(text, uuid),
  public.indicacao_recompensar(uuid, numeric, integer) from public, anon, authenticated;
grant execute on function public.indicacao_obter_codigo(uuid), public.indicacao_registrar_cadastro(text, uuid),
  public.indicacao_recompensar(uuid, numeric, integer) to service_role;
