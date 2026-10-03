-- Medição de anúncios: envio server-side (Meta Conversions API) do cadastro e da
-- assinatura, com idempotência.
--
-- Quem envia: worker/src/anunciosConversoes.js (cron de minuto, a cada 10 min).
-- O que envia: só de quem ACEITOU o aviso de cookies no painel
--   (auth.users.raw_user_meta_data->'medicao_anuncios'->>'consentimento' = 'sim').
-- Exclui contas internas/demo (`funil_exclusoes`, por user_id ou e-mail).
--
--   CompleteRegistration  event_id = 'cadastro-<user_id>'   (o MESMO que o navegador manda)
--   Subscribe             event_id = 'assinatura-<user_id>' (funil_marcos.marco = 'pagou',
--                          que já descarta assinatura fictícia e compra de teste da Play)
--
-- A CAPI só aceita evento com até 7 dias: a janela das pendências é essa.
-- Estado por evento: 'enviado' (fim), 'erro' (tenta de novo até 5 vezes), 'pulado' (fim).

create table if not exists public.anuncios_conversoes (
  event_id      text primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  evento        text not null check (evento in ('CompleteRegistration', 'Subscribe')),
  plataforma    text not null default 'meta' check (plataforma in ('meta')),
  estado        text not null check (estado in ('enviado', 'erro', 'pulado')),
  detalhe       text,
  tentativas    integer not null default 1,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists anuncios_conversoes_user_idx on public.anuncios_conversoes (user_id);

alter table public.anuncios_conversoes enable row level security;
alter table public.anuncios_conversoes force row level security;
revoke all on table public.anuncios_conversoes from public, anon, authenticated;
grant select, insert, update on table public.anuncios_conversoes to service_role;

comment on table public.anuncios_conversoes is
  'Envio server-side de conversões de anúncio (Meta CAPI). Escrita só pelo worker (service_role).';

-- Pendências prontas para enviar. O e-mail sai daqui só para o worker transformar em
-- hash SHA-256 antes de mandar ao Meta (nunca vai em claro).
create or replace function public.anuncios_conversoes_pendentes(p_limite integer default 20)
returns table (
  event_id   text,
  evento     text,
  user_id    uuid,
  email      text,
  event_time timestamptz,
  medicao    jsonb,
  origem     jsonb,
  plano      text
)
language sql
stable
security definer
set search_path to ''
as $$
  with candidatos as (
    select
      'cadastro-' || u.id::text as event_id,
      'CompleteRegistration'::text as evento,
      u.id as user_id,
      u.email::text as email,
      u.created_at as event_time,
      u.raw_user_meta_data -> 'medicao_anuncios' as medicao,
      u.raw_user_meta_data -> 'origem_utm' as origem,
      null::text as plano
    from auth.users u
    where u.created_at > now() - interval '7 days'
      and u.raw_user_meta_data -> 'medicao_anuncios' ->> 'consentimento' = 'sim'
    union all
    select
      'assinatura-' || u.id::text,
      'Subscribe',
      u.id,
      u.email::text,
      m.criado_em,
      u.raw_user_meta_data -> 'medicao_anuncios',
      u.raw_user_meta_data -> 'origem_utm',
      a.plano
    from public.funil_marcos m
    join auth.users u on u.id = m.user_id
    left join public.assinaturas a on a.user_id = m.user_id
    where m.marco = 'pagou'
      and not coalesce(m.estimado, false)
      and m.criado_em > now() - interval '7 days'
      and u.raw_user_meta_data -> 'medicao_anuncios' ->> 'consentimento' = 'sim'
  )
  select c.*
    from candidatos c
   where not exists (
           select 1 from public.anuncios_conversoes x
            where x.event_id = c.event_id
              and (x.estado in ('enviado', 'pulado') or x.tentativas >= 5)
         )
     and not exists (
           select 1 from public.funil_exclusoes e
            where e.user_id = c.user_id
               or (e.email is not null and lower(e.email) = lower(c.email))
         )
   order by c.event_time
   limit greatest(1, least(coalesce(p_limite, 20), 50));
$$;

revoke all on function public.anuncios_conversoes_pendentes(integer) from public, anon, authenticated;
grant execute on function public.anuncios_conversoes_pendentes(integer) to service_role;

-- Resultado do envio (um lote por chamada). Upsert: 'erro' soma tentativa.
create or replace function public.anuncios_conversoes_registrar(p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_n integer := 0;
  v_item jsonb;
begin
  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'p_itens deve ser um array';
  end if;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    insert into public.anuncios_conversoes as x (event_id, user_id, evento, estado, detalhe)
    values (
      v_item ->> 'event_id',
      (v_item ->> 'user_id')::uuid,
      v_item ->> 'evento',
      v_item ->> 'estado',
      left(v_item ->> 'detalhe', 500)
    )
    on conflict (event_id) do update
      set estado = excluded.estado,
          detalhe = excluded.detalhe,
          tentativas = x.tentativas + 1,
          atualizado_em = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.anuncios_conversoes_registrar(jsonb) from public, anon, authenticated;
grant execute on function public.anuncios_conversoes_registrar(jsonb) to service_role;
