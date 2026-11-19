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
  pago_em   timestamptz
);
create index if not exists cupom_usos_codigo_idx on public.cupom_usos (codigo, estado);

alter table public.cupons_influenciador enable row level security;
alter table public.cupom_usos            enable row level security;
revoke all on public.cupons_influenciador, public.cupom_usos from public, anon, authenticated;
grant all on public.cupons_influenciador, public.cupom_usos to service_role;

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
     and (estado = 'pago' or criado_em > now() - interval '24 hours');
  if v_ocupadas >= c.usos_max then return jsonb_build_object('status', 'esgotado'); end if;
  return jsonb_build_object('status', 'ok', 'codigo', c.codigo, 'pct', p_pct);
end;
$$;
revoke all on function public.cupom_verificar(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.cupom_verificar(uuid, text, integer) to service_role;

-- Reserva o desconto ANTES de abrir o checkout. Serializa por código (lock) para o teto não furar.
-- Reserva aberta há mais de 24h não conta no teto (checkout abandonado).
create or replace function public.cupom_reservar(
  p_user uuid, p_codigo text, p_pct integer, p_plano text, p_canal text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v jsonb;
begin
  perform 1 from public.cupons_influenciador where codigo = upper(btrim(coalesce(p_codigo, ''))) for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 1));
  v := public.cupom_verificar(p_user, p_codigo, p_pct);
  if v->>'status' <> 'ok' then return v; end if;
  insert into public.cupom_usos (user_id, codigo, plano, canal, pct, estado, criado_em)
  values (p_user, v->>'codigo', p_plano, p_canal, p_pct, 'reservado', now())
  on conflict (user_id) do update
    set codigo = excluded.codigo, plano = excluded.plano, canal = excluded.canal,
        pct = excluded.pct, criado_em = now()
  where public.cupom_usos.estado = 'reservado';
  return v;
end;
$$;
revoke all on function public.cupom_reservar(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.cupom_reservar(uuid, text, integer, text, text) to service_role;

-- Pagamento confirmado: a reserva vira uso. Idempotente. true = a conta tinha reserva (ou já estava paga).
create or replace function public.cupom_confirmar(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.cupom_usos set estado = 'pago', pago_em = coalesce(pago_em, now())
   where user_id = p_user and estado = 'reservado';
  return exists (select 1 from public.cupom_usos where user_id = p_user and estado = 'pago');
end;
$$;
revoke all on function public.cupom_confirmar(uuid) from public, anon, authenticated;
grant execute on function public.cupom_confirmar(uuid) to service_role;

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
