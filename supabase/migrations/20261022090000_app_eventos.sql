-- Eventos de uso do app (track()) espelhados no NOSSO banco.
--
-- Por quê (22/10/2026): o app dispara 59 eventos via track(), mas eles só ficam
-- no SQLite do celular — a chave do PostHog está vazia. Sem terceiro e sem
-- custo: o app manda os mesmos eventos (já faxinados de PII no cliente) para cá.
--
-- Sem PII: user_id vem de auth.uid() no servidor; nome do evento passa por
-- regex; props só escalares curtos e no máximo 1 KB. Leitura só service_role.
-- Sem replay de tela, sem conteúdo de orçamento/cliente.

create table if not exists public.app_eventos (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  evento text not null check (evento ~ '^[a-z0-9_]{2,48}$'),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 1024),
  plataforma text not null default 'unknown'
    check (plataforma in ('web', 'ios', 'android', 'desktop', 'unknown')),
  criado_em timestamptz not null default now()
);

create index if not exists app_eventos_evento_criado_idx on public.app_eventos (evento, criado_em desc);
create index if not exists app_eventos_user_criado_idx on public.app_eventos (user_id, criado_em desc);

alter table public.app_eventos enable row level security;
revoke all on table public.app_eventos from public, anon, authenticated;

-- Lote de até 50 eventos: [{"e":"nome","p":{...},"t":"ISO opcional"}].
-- Inválidos são descartados em silêncio (telemetria é best-effort).
create or replace function public.registrar_eventos_app(
  p_eventos jsonb,
  p_plataforma text default 'unknown'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  plat text := lower(trim(coalesce(p_plataforma, 'unknown')));
  item jsonb;
  nome text;
  prop jsonb;
  qtd integer := 0;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if jsonb_typeof(p_eventos) is distinct from 'array' then
    raise exception 'lote_invalido';
  end if;
  if plat not in ('web', 'ios', 'android', 'desktop', 'unknown') then
    plat := 'unknown';
  end if;

  -- Teto por usuário: 600 eventos na última hora (loop de re-render não enche o banco).
  if (select count(*) from public.app_eventos
       where user_id = uid and criado_em > now() - interval '1 hour') >= 600 then
    return 0;
  end if;

  for item in select * from jsonb_array_elements(p_eventos) limit 50 loop
    nome := lower(trim(coalesce(item ->> 'e', '')));
    prop := coalesce(item -> 'p', '{}'::jsonb);
    if nome !~ '^[a-z0-9_]{2,48}$' then continue; end if;
    if jsonb_typeof(prop) is distinct from 'object' or pg_column_size(prop) > 1024 then
      prop := '{}'::jsonb;
    end if;
    insert into public.app_eventos (user_id, evento, props, plataforma)
    values (uid, nome, prop, plat);
    qtd := qtd + 1;
  end loop;
  return qtd;
end;
$$;

revoke all on function public.registrar_eventos_app(jsonb, text) from public, anon;
grant execute on function public.registrar_eventos_app(jsonb, text) to authenticated;

-- Funil por evento (agregado, sem pessoa): contas distintas e total nos últimos 30 dias.
create or replace view public.app_eventos_resumo
with (security_invoker = true) as
select e.evento,
       count(distinct e.user_id) as contas,
       count(*) as total,
       max(e.criado_em) as ultima_vez
  from public.app_eventos e
 where e.criado_em > now() - interval '30 days'
   and not public.conta_interna(e.user_id)
 group by e.evento
 order by contas desc;

revoke all on public.app_eventos_resumo from public, anon, authenticated;
grant select on public.app_eventos_resumo to service_role;
grant select on public.app_eventos to service_role;
