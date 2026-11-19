-- INDICAÇÃO "colega indica colega" (spec mínima do CPO, 07/10/2026).
--
-- Peças:
--   indicacao_codigos  1 código curto por prestador (gerado na 1ª vez que abre o cartão).
--   indicacoes         1 linha por INDICADO (indicado_id único = 1 recompensa por indicado).
--   indicacao_eventos  medição do cartão (visto / compartilhada), sem dado pessoal.
--
-- Recompensa = N meses de Pro para os DOIS lados (N e tetos vêm do worker, de UMA constante:
-- src/services/limitesComerciais.ts; nada de número digitado aqui). A concessão usa o mesmo
-- mecanismo auditado do crédito de troca (assinaturas.admin_plano_override + admin_override_ate):
-- benefício de uso, sem dinheiro, intransferível, NÃO toca nos campos do gateway (plano/status/
-- current_period_end/stripe_*), então não vira "pagante" no funil de receita e não abate nada
-- já pago. Só premia depois do indicado ENVIAR orçamento real, com e-mail confirmado dos dois
-- lados e teto diário global. Quem escreve é só o worker (service_role);
-- o usuário só LÊ as próprias linhas. A decisão de recompensar é toda no Postgres, numa
-- transação só, sob lock do indicador — o worker apenas chama a RPC.
--
-- Depende de: assinaturas (override admin), 20260930120100 (funil_exclusoes),
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
  meses_pro       integer check (meses_pro is null or meses_pro > 0),
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
create or replace function public.indicacao_vincular(p_indicado uuid, p_codigo text, p_teto integer)
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
  -- teto no VÍNCULO: o colega além do teto não entra (e o app sabe, em vez de ser barrado em silêncio
  -- só na recompensa). Serializa por indicador, igual à recompensa.
  perform 1 from public.indicacao_codigos where user_id = v_indicador for update;
  if (select count(*) from public.indicacoes
       where indicador_id = v_indicador and estado in ('cadastrou', 'recompensado')) >= greatest(coalesce(p_teto, 0), 1) then
    return 'teto_indicador';
  end if;
  insert into public.indicacoes (indicador_id, indicado_id, codigo)
  values (v_indicador, p_indicado, v_codigo)
  on conflict (indicado_id) do nothing;
  if not found then return 'ja_vinculado'; end if;
  return 'vinculado';
end;
$$;
revoke all on function public.indicacao_vincular(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.indicacao_vincular(uuid, text, integer) to service_role;

-- ─── concessão de Pro (benefício de uso) ────────────────────────────────────
-- Mesmas guardas do crédito de troca / concederPlanoPeriodo: nunca rebaixa nível (Empresa
-- manual continua Empresa), nunca encurta vigência (sem data final continua sem data final),
-- e soma os meses a partir do fim de uma concessão ainda vigente.
-- ─── cupom de influenciador × indicação: NÃO acumulam (vale o que a conta usou primeiro) ──
-- Stub: a migration 20261119090000_cupom_influenciador.sql substitui por a versão real (lê cupom_usos).
-- Fica aqui para a ordem de aplicação não importar (plpgsql resolve a função na execução).
create or replace function public.cupom_usou(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$ select false $$;
revoke all on function public.cupom_usou(uuid) from public, anon, authenticated;
grant execute on function public.cupom_usou(uuid) to service_role;

create or replace function public.indicacao_conceder_pro(p_user uuid, p_meses integer, p_razao text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  a public.assinaturas%rowtype;
  v_tem boolean;
  v_plano text := 'pro';
  v_ate timestamptz;
  v_base timestamptz := now();
  v_vigente boolean := false;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 0));
  select * into a from public.assinaturas x where x.user_id = p_user for update;
  v_tem := found;
  -- Quem já usou cupom de influenciador (pago) não acumula o mês da indicação: vale o que usou primeiro.
  if public.cupom_usou(p_user) then
    return false;
  end if;
  -- Quem JÁ PAGA o Pro (assinatura ativa no gateway, período em dia) não recebe override como prêmio:
  -- não soma ao Stripe/MP, então "ganha 1 mês" seria falso. Não concede e não conta.
  if v_tem and a.status = 'active' and a.current_period_end is not null and a.current_period_end > now() then
    return false;
  end if;
  if v_tem then
    v_vigente := a.admin_override_ativo is true
      and a.admin_plano_override in ('pro', 'empresa')
      and (a.admin_override_ate is null or a.admin_override_ate > now());
    if v_vigente then
      if a.admin_plano_override = 'empresa' then v_plano := 'empresa'; end if;
      if a.admin_override_ate is not null then v_base := a.admin_override_ate; end if;
    end if;
  end if;
  v_ate := v_base + make_interval(months => p_meses);
  if v_vigente and a.admin_override_ate is null then v_ate := null; end if;

  insert into public.assinaturas (
    user_id, plano, status, stripe_customer_id, stripe_subscription_id, current_period_end,
    admin_plano_override, admin_override_ativo, admin_override_ate, admin_override_reason,
    admin_override_by, admin_override_at, atualizado_em
  ) values (
    p_user, v_plano, 'canceled', null, null, null,
    v_plano, true, v_ate, left(p_razao, 500), null, now(), now()
  )
  on conflict (user_id) do update set
    admin_plano_override = excluded.admin_plano_override,
    admin_override_ativo = true,
    admin_override_ate = excluded.admin_override_ate,
    admin_override_reason = excluded.admin_override_reason,
    admin_override_by = excluded.admin_override_by,
    admin_override_at = excluded.admin_override_at,
    atualizado_em = now();
  return true;
end;
$$;
revoke all on function public.indicacao_conceder_pro(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.indicacao_conceder_pro(uuid, integer, text) to service_role;

-- ─── recompensa no 1º orçamento real do indicado ────────────────────────────
-- p_meses <= 0 = recurso desligado: não grava nada, não decide nada.
-- Serializa por indicador (lock na linha do código) para o teto não furar. Idempotente:
-- só decide enquanto estado = 'cadastrou', sob lock (a 2ª chamada vê 'recompensado').
-- E-mail confirmado dos dois lados e teto diário global ficam PENDENTES (estado segue
-- 'cadastrou'): voltam a ser tentados quando a condição passar.
create or replace function public.indicacao_recompensar(p_indicado uuid, p_meses integer, p_teto integer, p_teto_dia integer)
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
  v_dia integer;
  v_ind boolean;
  v_ido boolean;
begin
  if p_meses is null or p_meses <= 0 or p_teto is null or p_teto <= 0 or p_teto_dia is null or p_teto_dia <= 0 then
    return jsonb_build_object('status', 'desligado');
  end if;

  select * into v from public.indicacoes where indicado_id = p_indicado;
  if not found then return jsonb_build_object('status', 'sem_indicacao'); end if;
  if v.estado <> 'cadastrou' then return jsonb_build_object('status', 'ja_decidido', 'estado', v.estado); end if;

  v_orc := public.indicacao_primeiro_orcamento_real(p_indicado);
  if v_orc is null then return jsonb_build_object('status', 'sem_orcamento_real'); end if;

  if (select count(*) from auth.users u
       where u.id in (v.indicador_id, v.indicado_id) and u.email_confirmed_at is not null and u.deleted_at is null) < 2 then
    return jsonb_build_object('status', 'email_nao_confirmado');
  end if;

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
  if v_n >= p_teto then
    update public.indicacoes set estado = 'sem_recompensa', motivo = 'teto_indicador', orcou_em = v_orc where id = v.id;
    return jsonb_build_object('status', 'sem_recompensa', 'motivo', 'teto_indicador');
  end if;

  -- teto diário global (antifraude): serializa pelo advisory lock e segue pendente
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('indicacao_teto_dia', 0));
  select count(*) into v_dia from public.indicacoes
   where estado = 'recompensado' and recompensado_em >= date_trunc('day', now());
  if v_dia >= p_teto_dia then return jsonb_build_object('status', 'teto_diario'); end if;

  v_ind := public.indicacao_conceder_pro(v.indicador_id, p_meses, 'Indicação: um colega enviou o 1º orçamento');
  v_ido := public.indicacao_conceder_pro(v.indicado_id,  p_meses, 'Bônus de indicação: seu 1º orçamento enviado');

  update public.indicacoes
     set estado = 'recompensado', orcou_em = v_orc, recompensado_em = now(), meses_pro = p_meses
   where id = v.id;
  return jsonb_build_object('status', 'recompensado', 'meses', case when v_ido then p_meses else 0 end,
    'indicador_recebeu', v_ind, 'indicado_recebeu', v_ido, 'indicador_id', v.indicador_id);
end;
$$;
revoke all on function public.indicacao_recompensar(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.indicacao_recompensar(uuid, integer, integer, integer) to service_role;

-- ─── resumo do indicador (cartão/painel) ────────────────────────────────────
create or replace function public.indicacao_resumo(p_user uuid, p_teto integer)
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
    'teto',          p_teto,
    -- indicador que já paga o Pro: o cartão diz só que o COLEGA ganha (override não soma ao pago)
    'paga',          exists (select 1 from public.assinaturas a where a.user_id = p_user
                              and a.status = 'active' and a.current_period_end is not null and a.current_period_end > now())
  ) from public.indicacoes where indicador_id = p_user;
$$;
revoke all on function public.indicacao_resumo(uuid, integer) from public, anon, authenticated;
grant execute on function public.indicacao_resumo(uuid, integer) to service_role;

-- ============================================================================
-- TESTES MANUAIS (service_role). A=indicador, B=indicado (conta nova), I=conta em funil_exclusoes.
--   select public.indicacao_codigo('<A>');                  -- 6 chars; repetir devolve o mesmo
--   select public.indicacao_vincular('<B>', '<codigo>', 3);     -- 'vinculado'; de novo 'ja_vinculado'
--   select public.indicacao_vincular('<A>', '<codigo>', 3);     -- 'auto_indicacao'
--   select public.indicacao_recompensar('<B>', 0, 3, 20);        -- {"status":"desligado"}
--   select public.indicacao_recompensar('<B>', 1, 3, 20);        -- sem orçamento real: 'sem_orcamento_real'
--   -- após B criar orçamento real: 'recompensado'; 2ª chamada: 'ja_decidido'; assinaturas: override pro nos 2 lados
-- ============================================================================
