-- INDICAÇÃO "colega indica colega" (spec mínima do CPO, 07/10/2026).
--
-- Peças:
--   indicacao_codigos  1 código curto por prestador (gerado na 1ª vez que abre o cartão).
--   indicacoes         1 linha por INDICADO (indicado_id único = 1 recompensa por indicado).
--   indicacao_eventos  medição do cartão (visto / compartilhada), sem dado pessoal.
--
-- Recompensa = crédito de IA no credit_ledger (origem 'referral', já permitida pelo check
-- da 20260720). NADA de tabela nova de crédito. Quem escreve é só o worker (service_role);
-- o usuário só LÊ as próprias linhas. A decisão de recompensar é toda no Postgres, numa
-- transação só, sob lock do indicador — o worker apenas chama a RPC.
--
-- Depende de: 20260720 (credit_ledger), 20260930120100 (funil_exclusoes),
--             20261007130000 (ativacao_exemplos_ref: define "orçamento real").
-- Idempotente (if not exists / or replace). NÃO aplicada: o integrador aplica.

-- ─── códigos ────────────────────────────────────────────────────────────────
create table if not exists public.indicacao_codigos (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  codigo    text not null unique check (codigo ~ '^[A-Z0-9]{6}$'),
  criado_em timestamptz not null default now()
);

-- ─── indicações (1 por indicado) ────────────────────────────────────────────
create table if not exists public.indicacoes (
  id              uuid primary key default gen_random_uuid(),
  indicador_id    uuid not null references auth.users (id) on delete cascade,
  indicado_id     uuid not null unique references auth.users (id) on delete cascade,
  codigo          text not null,
  -- cadastrou → recompensado | sem_recompensa (conta interna, teto atingido, desligado não grava)
  estado          text not null default 'cadastrou'
                    check (estado in ('cadastrou', 'recompensado', 'sem_recompensa')),
  motivo          text check (motivo is null or char_length(motivo) <= 60),
  cadastrou_em    timestamptz not null default now(),
  orcou_em        timestamptz,
  recompensado_em timestamptz,
  constraint indicacoes_nao_a_si_mesmo check (indicador_id <> indicado_id)
);
create index if not exists indicacoes_indicador_idx on public.indicacoes (indicador_id, estado);

-- ─── eventos do cartão ──────────────────────────────────────────────────────
create table if not exists public.indicacao_eventos (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  evento    text not null check (evento in ('cartao_visto', 'compartilhada')),
  momento   text not null check (momento in ('apos_envio', 'apos_aprovacao', 'painel')),
  canal     text check (canal is null or canal in ('whatsapp', 'copiar', 'qr')),
  criado_em timestamptz not null default now()
);
create index if not exists indicacao_eventos_evento_idx on public.indicacao_eventos (evento, criado_em desc);

-- ─── RLS: usuário lê o que é seu; escrita só service_role ───────────────────
alter table public.indicacao_codigos enable row level security;
alter table public.indicacoes        enable row level security;
alter table public.indicacao_eventos enable row level security;

drop policy if exists indicacao_codigos_select_own on public.indicacao_codigos;
create policy indicacao_codigos_select_own on public.indicacao_codigos
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.indicacao_codigos, public.indicacoes, public.indicacao_eventos from public, anon, authenticated;
-- indicacoes: sem leitura direta (mostraria indicado_id/orcou_em ao indicador); o resumo sai pela RPC.
grant select on public.indicacao_codigos to authenticated;
grant all on public.indicacao_codigos, public.indicacoes, public.indicacao_eventos to service_role;
grant usage, select on sequence public.indicacao_eventos_id_seq to service_role;

-- ─── "orçamento real" do usuário ────────────────────────────────────────────
-- Mesma régua da medição de ativação: com itens, ao menos um item com preço > 0, não na
-- lixeira, e NÃO só o exemplo sem edição (nome+preço iguais ao catálogo de exemplos).
-- Devolve o criado_em do 1º orçamento real ou null.
create or replace function public.indicacao_primeiro_orcamento_real(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path to ''
as $$
  select min(o.criado_em)
    from public.orcamentos o
   where o.user_id = p_user
     and o.excluido_em is null
     and jsonb_typeof(o.dados -> 'itens') = 'array'
     and exists (
       select 1 from jsonb_array_elements(o.dados -> 'itens') it
        where case when (it ->> 'preco') ~ '^[0-9]+([.][0-9]+)?$' then (it ->> 'preco')::numeric end > 0
     )
     and exists (
       select 1 from jsonb_array_elements(o.dados -> 'itens') it
        where not exists (
          select 1 from public.ativacao_exemplos_ref r
           where r.nome = it ->> 'nome'
             and r.preco = case when (it ->> 'preco') ~ '^-?[0-9]+([.][0-9]+)?$' then (it ->> 'preco')::numeric end
        )
     );
$$;
revoke all on function public.indicacao_primeiro_orcamento_real(uuid) from public, anon, authenticated;
grant execute on function public.indicacao_primeiro_orcamento_real(uuid) to service_role;

-- ─── código do prestador (cria na 1ª vez) ───────────────────────────────────
create or replace function public.indicacao_codigo(p_user uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v text;
  c text;
  -- sem 0/O/1/I: o código é ditado e digitado
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
  tent int;
begin
  select codigo into v from public.indicacao_codigos where user_id = p_user;
  if found then return v; end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'usuario_inexistente';
  end if;
  for tent in 1..12 loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alfabeto, 1 + floor(random() * 32)::int, 1);
    end loop;
    begin
      insert into public.indicacao_codigos (user_id, codigo) values (p_user, c);
      return c;
    exception when unique_violation then
      -- ou o código colidiu, ou outra chamada criou o do mesmo usuário agora
      select codigo into v from public.indicacao_codigos where user_id = p_user;
      if found then return v; end if;
    end;
  end loop;
  raise exception 'codigo_indisponivel';
end;
$$;
revoke all on function public.indicacao_codigo(uuid) from public, anon, authenticated;
grant execute on function public.indicacao_codigo(uuid) to service_role;

-- ─── vínculo no cadastro ────────────────────────────────────────────────────
-- p_indicado vem do JWT validado no worker, nunca do corpo. Conta precisa ser nova
-- (≤ 7 dias: dá tempo de confirmar o e-mail): o link é para quem ainda vai entrar, não para amarrar conta antiga.
create or replace function public.indicacao_vincular(p_indicado uuid, p_codigo text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_indicador uuid;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_criada timestamptz;
begin
  if v_codigo !~ '^[A-Z0-9]{6}$' then return 'codigo_invalido'; end if;
  select user_id into v_indicador from public.indicacao_codigos where codigo = v_codigo;
  if v_indicador is null then return 'codigo_invalido'; end if;
  if v_indicador = p_indicado then return 'auto_indicacao'; end if;
  select created_at into v_criada from auth.users where id = p_indicado and deleted_at is null;
  if v_criada is null then return 'usuario_inexistente'; end if;
  if v_criada < now() - interval '7 days' then return 'conta_antiga'; end if;
  -- quem já é indicador de alguém e cujo indicador é este: sem ciclo A↔B
  if exists (select 1 from public.indicacoes where indicador_id = p_indicado and indicado_id = v_indicador) then
    return 'ciclo';
  end if;
  -- já vinculado (a qualquer indicador): não gasta vaga de ninguém
  if exists (select 1 from public.indicacoes where indicado_id = p_indicado) then return 'ja_vinculado'; end if;
  -- teto no VÍNCULO: o 6º colega não entra (e o app sabe, em vez de ser barrado em silêncio
  -- só na recompensa). Serializa por indicador, igual à recompensa.
  perform 1 from public.indicacao_codigos where user_id = v_indicador for update;
  if (select count(*) from public.indicacoes
       where indicador_id = v_indicador and estado in ('cadastrou', 'recompensado')) >= 5 then
    return 'teto_indicador';
  end if;
  insert into public.indicacoes (indicador_id, indicado_id, codigo)
  values (v_indicador, p_indicado, v_codigo)
  on conflict (indicado_id) do nothing;
  if not found then return 'ja_vinculado'; end if;
  return 'vinculado';
end;
$$;
revoke all on function public.indicacao_vincular(uuid, text) from public, anon, authenticated;
grant execute on function public.indicacao_vincular(uuid, text) to service_role;

-- ─── recompensa no 1º orçamento real do indicado ────────────────────────────
-- p_creditos <= 0 = recurso desligado: não grava nada, não decide nada.
-- Serializa por indicador (lock na linha do código) para o teto de 5 não furar.
-- Idempotente: ref do ledger = 'ind:<id>:<lado>'; (origem,ref) é único.
create or replace function public.indicacao_recompensar(p_indicado uuid, p_creditos integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v public.indicacoes%rowtype;
  v_orc timestamptz;
  v_n integer;
  v_interno boolean;
begin
  if p_creditos is null or p_creditos <= 0 then
    return jsonb_build_object('status', 'desligado');
  end if;

  select * into v from public.indicacoes where indicado_id = p_indicado;
  if not found then return jsonb_build_object('status', 'sem_indicacao'); end if;
  if v.estado <> 'cadastrou' then return jsonb_build_object('status', 'ja_decidido', 'estado', v.estado); end if;

  v_orc := public.indicacao_primeiro_orcamento_real(p_indicado);
  if v_orc is null then return jsonb_build_object('status', 'sem_orcamento_real'); end if;

  -- lock do indicador, depois relê a indicação (outra chamada pode ter decidido)
  perform 1 from public.indicacao_codigos where user_id = v.indicador_id for update;
  select * into v from public.indicacoes where id = v.id for update;
  if v.estado <> 'cadastrou' then return jsonb_build_object('status', 'ja_decidido', 'estado', v.estado); end if;

  select exists (
    select 1 from public.funil_exclusoes f
     where f.user_id in (v.indicador_id, v.indicado_id)
        or (f.email is not null and lower(f.email) in (
              select lower(u.email) from auth.users u where u.id in (v.indicador_id, v.indicado_id)))
  ) into v_interno;
  if v_interno then
    update public.indicacoes set estado = 'sem_recompensa', motivo = 'conta_interna', orcou_em = v_orc where id = v.id;
    return jsonb_build_object('status', 'sem_recompensa', 'motivo', 'conta_interna');
  end if;

  select count(*) into v_n from public.indicacoes where indicador_id = v.indicador_id and estado = 'recompensado';
  if v_n >= 5 then
    update public.indicacoes set estado = 'sem_recompensa', motivo = 'teto_indicador', orcou_em = v_orc where id = v.id;
    return jsonb_build_object('status', 'sem_recompensa', 'motivo', 'teto_indicador');
  end if;

  insert into public.credit_ledger (user_id, delta, origem, ref, descricao) values
    (v.indicador_id, p_creditos, 'referral', 'ind:' || v.id || ':indicador', 'Indicação: um colega fez o 1º orçamento'),
    (v.indicado_id,  p_creditos, 'referral', 'ind:' || v.id || ':indicado',  'Bônus de indicação: seu 1º orçamento')
  on conflict (origem, ref) where ref is not null do nothing;

  update public.indicacoes
     set estado = 'recompensado', orcou_em = v_orc, recompensado_em = now()
   where id = v.id;
  return jsonb_build_object('status', 'recompensado', 'creditos', p_creditos, 'indicador_id', v.indicador_id);
end;
$$;
revoke all on function public.indicacao_recompensar(uuid, integer) from public, anon, authenticated;
grant execute on function public.indicacao_recompensar(uuid, integer) to service_role;

-- ─── resumo do indicador (cartão/painel) ────────────────────────────────────
create or replace function public.indicacao_resumo(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    -- só RECOMPENSADOS: cadastro sozinho é farmável (contas novas sem orçamento) e não
    -- pode inflar o contador do cartão.
    'recompensadas', count(*) filter (where estado = 'recompensado'),
    'teto',          5
  ) from public.indicacoes where indicador_id = p_user;
$$;
revoke all on function public.indicacao_resumo(uuid) from public, anon, authenticated;
grant execute on function public.indicacao_resumo(uuid) to service_role;

-- ============================================================================
-- TESTES MANUAIS (service_role). A=indicador, B=indicado (conta nova), I=conta em funil_exclusoes.
--   select public.indicacao_codigo('<A>');                  -- 6 chars; repetir devolve o mesmo
--   select public.indicacao_vincular('<B>', '<codigo>');     -- 'vinculado'; de novo 'ja_vinculado'
--   select public.indicacao_vincular('<A>', '<codigo>');     -- 'auto_indicacao'
--   select public.indicacao_recompensar('<B>', 0);           -- {"status":"desligado"}
--   select public.indicacao_recompensar('<B>', 10);          -- sem orçamento real: 'sem_orcamento_real'
--   -- após B criar orçamento real: 'recompensado'; 2ª chamada: 'ja_decidido'; ledger: 2 linhas 'referral'
-- ============================================================================
