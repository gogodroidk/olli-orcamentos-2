-- Cupom de influenciador — 1ª cobrança, percentual FIXO vindo do worker (constante única),
-- teto de usos e validade por código. Atribuição por origem = só CÓDIGO + CONTA (sem dado do influenciador).
-- NASCE DESLIGADO: o worker só chama estas RPCs com CUPOM_INFLUENCER_ATIVO='1'. NÃO aplicada: o integrador aplica.
-- Não acumula com a indicação (cupom_usou() lido por indicacao_conceder_pro; indicação lida aqui).
-- Idempotente (if not exists / or replace).

create table if not exists public.cupons_influenciador (
  codigo     text primary key check (codigo ~ '^[A-Z0-9]{4,20}$'),
  usos_max   integer not null check (usos_max between 1 and 500),
  valido_ate timestamptz not null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- 1 linha por CONTA (primary key = user_id): só a 1ª cobrança tem desconto, e só um cupom por conta.
create table if not exists public.cupom_usos (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  codigo    text not null references public.cupons_influenciador (codigo),
  plano     text not null,
  canal     text not null check (canal in ('stripe', 'pix')),
  pct       integer not null check (pct between 1 and 50),
  estado    text not null default 'reservado' check (estado in ('reservado', 'pago')),
  criado_em timestamptz not null default now(),
  pago_em   timestamptz,
  -- UMA reserva aberta por conta: guarda a cobrança já gerada (Pix/sessão) para devolver a MESMA no pedido repetido.
  cobranca        jsonb,
  expira_em       timestamptz,
  cobranca_paga_id text
);
create index if not exists cupom_usos_codigo_idx on public.cupom_usos (codigo, estado);

-- Desconto que chegou a ser pago uma 2ª vez (corrida): nunca fica silencioso, entra aqui para devolução.
create table if not exists public.cupom_devolucoes (
  cobranca_id       text primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  codigo            text,
  desconto_centavos integer not null check (desconto_centavos >= 0),
  motivo            text not null check (motivo in ('desconto_duplicado', 'sem_reserva')),
  estado            text not null default 'pendente' check (estado in ('pendente', 'devolvido')),
  criado_em         timestamptz not null default now(),
  resolvido_em      timestamptz
);

alter table public.cupons_influenciador enable row level security;
alter table public.cupom_usos            enable row level security;
alter table public.cupom_devolucoes      enable row level security;
revoke all on public.cupons_influenciador, public.cupom_usos, public.cupom_devolucoes from public, anon, authenticated;
grant all on public.cupons_influenciador, public.cupom_usos, public.cupom_devolucoes to service_role;

-- versão real (substitui o stub da migration de indicações): só cupom PAGO bloqueia a indicação.
create or replace function public.cupom_usou(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$ select exists (select 1 from public.cupom_usos where user_id = p_user and estado = 'pago') $$;
revoke all on function public.cupom_usou(uuid) from public, anon, authenticated;
grant execute on function public.cupom_usou(uuid) to service_role;

-- Verifica (sem gravar) se a conta pode usar o código. É a ÚNICA régua: reservar chama esta.
-- status: ok | desligado | invalido | expirado | esgotado | ja_usou | ja_pagou | indicacao
create or replace function public.cupom_verificar(p_user uuid, p_codigo text, p_pct integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  c public.cupons_influenciador%rowtype;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_ocupadas integer;
begin
  if p_pct is null or p_pct <= 0 then return jsonb_build_object('status', 'desligado'); end if;
  select * into c from public.cupons_influenciador where codigo = v_codigo;
  if not found or not c.ativo then return jsonb_build_object('status', 'invalido'); end if;
  if c.valido_ate <= now() then return jsonb_build_object('status', 'expirado'); end if;
  if exists (select 1 from public.cupom_usos where user_id = p_user and estado = 'pago') then
    return jsonb_build_object('status', 'ja_usou');
  end if;
  -- 1ª cobrança: quem já tem período pago no gateway (Stripe/MP) não recebe desconto.
  if exists (select 1 from public.assinaturas a where a.user_id = p_user and a.current_period_end is not null) then
    return jsonb_build_object('status', 'ja_pagou');
  end if;
  -- não acumula com a indicação: quem entrou por link de indicação ou já ganhou o mês fica com a indicação.
  if exists (select 1 from public.indicacoes i
              where i.indicado_id = p_user or (i.indicador_id = p_user and i.estado = 'recompensado')) then
    return jsonb_build_object('status', 'indicacao');
  end if;
  select count(*) into v_ocupadas from public.cupom_usos
   where codigo = c.codigo and user_id <> p_user
     and (estado = 'pago'
          or (estado = 'reservado' and (expira_em > now() or (expira_em is null and criado_em > now() - interval '2 minutes'))));
  if v_ocupadas >= c.usos_max then return jsonb_build_object('status', 'esgotado'); end if;
  return jsonb_build_object('status', 'ok', 'codigo', c.codigo, 'pct', p_pct);
end;
$$;
revoke all on function public.cupom_verificar(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.cupom_verificar(uuid, text, integer) to service_role;

-- Reserva o desconto ANTES de abrir o checkout. UMA reserva aberta por conta (regra de produto):
--   * pedido repetido, mesmo plano e canal, reserva aberta  → status ok + reaproveitar + a MESMA cobrança (nunca outra);
--   * reserva aberta ainda sem cobrança (corrida de 2 chamadas) → em_andamento (a 2ª não gera nada);
--   * reserva aberta de OUTRO plano/canal                    → reserva_aberta (pague ou espere vencer);
--   * desconto já pago                                       → ja_usou ("O desconto já foi usado nesta conta").
-- Serializa por código e por conta (locks), então 2 chamadas paralelas nunca abrem 2 reservas.
create or replace function public.cupom_reservar(
  p_user uuid, p_codigo text, p_pct integer, p_plano text, p_canal text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v jsonb;
  u public.cupom_usos%rowtype;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
begin
  perform 1 from public.cupons_influenciador where codigo = v_codigo for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 1));
  v := public.cupom_verificar(p_user, p_codigo, p_pct);
  if v->>'status' <> 'ok' then return v; end if;

  select * into u from public.cupom_usos where user_id = p_user for update;
  if found and u.estado = 'reservado'
     and ((u.cobranca is not null and u.expira_em > now())
          or (u.cobranca is null and u.criado_em > now() - interval '2 minutes')) then
    if u.cobranca is null then return jsonb_build_object('status', 'em_andamento'); end if;
    if u.plano = p_plano and u.canal = p_canal and u.codigo = v->>'codigo' then
      return v || jsonb_build_object('reaproveitar', true, 'cobranca', u.cobranca);
    end if;
    return jsonb_build_object('status', 'reserva_aberta');
  end if;

  insert into public.cupom_usos (user_id, codigo, plano, canal, pct, estado, criado_em, cobranca, expira_em)
  values (p_user, v->>'codigo', p_plano, p_canal, p_pct, 'reservado', now(), null, null)
  on conflict (user_id) do update
    set codigo = excluded.codigo, plano = excluded.plano, canal = excluded.canal,
        pct = excluded.pct, criado_em = now(), cobranca = null, expira_em = null
  where public.cupom_usos.estado = 'reservado';
  return v;
end;
$$;
revoke all on function public.cupom_reservar(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.cupom_reservar(uuid, text, integer, text, text) to service_role;

-- Guarda a cobrança gerada na reserva (para devolver a MESMA no pedido repetido). true = gravou.
create or replace function public.cupom_anexar(p_user uuid, p_cobranca jsonb, p_expira timestamptz)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.cupom_usos set cobranca = p_cobranca, expira_em = p_expira
   where user_id = p_user and estado = 'reservado';
  return found;
end;
$$;
revoke all on function public.cupom_anexar(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.cupom_anexar(uuid, jsonb, timestamptz) to service_role;

-- A cobrança NÃO saiu (gateway recusou): solta a reserva para o usuário tentar de novo. Só reserva sem cobrança.
create or replace function public.cupom_liberar(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  delete from public.cupom_usos where user_id = p_user and estado = 'reservado' and cobranca is null;
  return found;
end;
$$;
revoke all on function public.cupom_liberar(uuid) from public, anon, authenticated;
grant execute on function public.cupom_liberar(uuid) to service_role;

-- Pagamento confirmado (idempotente por cobrança). O PRIMEIRO pagamento com desconto vira o uso; um 2º
-- pagamento com desconto (corrida) NUNCA fica silencioso: entra em cupom_devolucoes para devolver a diferença.
-- resultado: confirmado | ja_confirmado | desconto_duplicado | sem_reserva
create or replace function public.cupom_confirmar(p_user uuid, p_cobranca_id text, p_desconto_centavos integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  u public.cupom_usos%rowtype;
  v_desc integer := greatest(coalesce(p_desconto_centavos, 0), 0);
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 1));
  select * into u from public.cupom_usos where user_id = p_user for update;
  if not found then
    insert into public.cupom_devolucoes (cobranca_id, user_id, codigo, desconto_centavos, motivo)
    values (p_cobranca_id, p_user, null, v_desc, 'sem_reserva') on conflict (cobranca_id) do nothing;
    return jsonb_build_object('resultado', 'sem_reserva');
  end if;
  if u.estado = 'reservado' then
    update public.cupom_usos set estado = 'pago', pago_em = now(), cobranca_paga_id = p_cobranca_id where user_id = p_user;
    return jsonb_build_object('resultado', 'confirmado');
  end if;
  if u.cobranca_paga_id = p_cobranca_id then return jsonb_build_object('resultado', 'ja_confirmado'); end if;
  insert into public.cupom_devolucoes (cobranca_id, user_id, codigo, desconto_centavos, motivo)
  values (p_cobranca_id, p_user, u.codigo, v_desc, 'desconto_duplicado') on conflict (cobranca_id) do nothing;
  return jsonb_build_object('resultado', 'desconto_duplicado');
end;
$$;
revoke all on function public.cupom_confirmar(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.cupom_confirmar(uuid, text, integer) to service_role;

-- Admin: devoluções pendentes (desconto pago em duplicidade) e baixa quando a diferença foi devolvida.
create or replace function public.cupom_devolucoes_listar()
returns table (cobranca_id text, codigo text, desconto_centavos integer, motivo text, estado text, criado_em timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select d.cobranca_id, d.codigo, d.desconto_centavos, d.motivo, d.estado, d.criado_em
    from public.cupom_devolucoes d order by d.criado_em desc limit 200
$$;
revoke all on function public.cupom_devolucoes_listar() from public, anon, authenticated;
grant execute on function public.cupom_devolucoes_listar() to service_role;

create or replace function public.cupom_devolucao_resolver(p_cobranca_id text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.cupom_devolucoes set estado = 'devolvido', resolvido_em = now()
   where cobranca_id = p_cobranca_id and estado = 'pendente';
  return found;
end;
$$;
revoke all on function public.cupom_devolucao_resolver(text) from public, anon, authenticated;
grant execute on function public.cupom_devolucao_resolver(text) to service_role;

-- Atribuição por origem (admin): código → reservas/pagos. Só código e contagem, nenhum dado pessoal.
create or replace function public.cupom_atribuicao()
returns table (codigo text, usos_max integer, valido_ate timestamptz, ativo boolean, reservados bigint, pagos bigint)
language sql
stable
security definer
set search_path to ''
as $$
  select c.codigo, c.usos_max, c.valido_ate, c.ativo,
         count(u.user_id) filter (where u.estado = 'reservado'),
         count(u.user_id) filter (where u.estado = 'pago')
    from public.cupons_influenciador c left join public.cupom_usos u on u.codigo = c.codigo
   group by c.codigo order by c.criado_em desc
$$;
revoke all on function public.cupom_atribuicao() from public, anon, authenticated;
grant execute on function public.cupom_atribuicao() to service_role;

-- Admin: cria um código (teto de usos e validade por código, com limites duros) e desativa.
-- Guarda só o código: nenhum dado pessoal do influenciador.
create or replace function public.cupom_criar(p_codigo text, p_usos_max integer, p_dias integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
begin
  if v_codigo !~ '^[A-Z0-9]{4,20}$' or p_usos_max is null or p_usos_max < 1 or p_usos_max > 500
     or p_dias is null or p_dias < 1 or p_dias > 90 then
    return jsonb_build_object('status', 'invalido');
  end if;
  insert into public.cupons_influenciador (codigo, usos_max, valido_ate)
  values (v_codigo, p_usos_max, now() + make_interval(days => p_dias))
  on conflict (codigo) do nothing;
  if not found then return jsonb_build_object('status', 'existe'); end if;
  return jsonb_build_object('status', 'ok', 'codigo', v_codigo);
end;
$$;
revoke all on function public.cupom_criar(text, integer, integer) from public, anon, authenticated;
grant execute on function public.cupom_criar(text, integer, integer) to service_role;

create or replace function public.cupom_desativar(p_codigo text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.cupons_influenciador set ativo = false where codigo = upper(btrim(coalesce(p_codigo, ''))) and ativo;
  return found;
end;
$$;
revoke all on function public.cupom_desativar(text) from public, anon, authenticated;
grant execute on function public.cupom_desativar(text) to service_role;
