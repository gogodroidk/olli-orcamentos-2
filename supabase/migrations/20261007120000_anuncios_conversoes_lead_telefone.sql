-- CAPI server-side: telefone (hash no worker) e evento de ATIVAÇÃO "Lead" (07/10/2026).
--
-- Diagnóstico de 07/10 (produção): a CAPI NÃO estava quebrada — 2 CompleteRegistration já entregues, token
-- no Vault, 0 pendências. O que limita o volume é o CONSENTIMENTO (regra do projeto: sem "sim" nada de
-- terceiro sai): nos 6 cadastros com UTM desde 03/10, 2 aceitaram, 2 recusaram, 2 não responderam.
-- Este arquivo melhora a QUALIDADE do que sai para quem aceitou, sem afrouxar o filtro:
--
--   1. `telefone` (normalizado 55+DDD+número) vai para o worker, que manda só o SHA-256 (`ph`) — mais
--      chance de a Meta casar o cadastro com o anúncio clicado (e-mail sozinho casa pouco).
--   2. `Lead` = ATIVAÇÃO: o primeiro orçamento ENVIADO de quem aceitou (funil_marcos 'orcamento_enviado',
--      sem estimativa). O cadastro sozinho não paga a conta (47/60 nunca orçaram): a Meta passa a ter o sinal
--      de quem de fato usa o produto. event_id 'lead-<user_id>'. (Nome do evento = decisão do MKT; é a
--      constante EVENTO_ATIVACAO em worker/src/anunciosConversoes.js.)
--
-- Mesmo filtro de antes: consentimento 'sim', fora de `funil_exclusoes`, janela de 7 dias, 1 envio por event_id.
-- Idempotente.

alter table public.anuncios_conversoes drop constraint if exists anuncios_conversoes_evento_check;
alter table public.anuncios_conversoes
  add constraint anuncios_conversoes_evento_check check (evento in ('CompleteRegistration', 'Subscribe', 'Lead'));

drop function if exists public.anuncios_conversoes_pendentes(integer);

create or replace function public.anuncios_conversoes_pendentes(p_limite integer default 20)
returns table (
  event_id   text,
  evento     text,
  user_id    uuid,
  email      text,
  telefone   text,
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
      private.telefone_whatsapp_br(u.raw_user_meta_data ->> 'phone') as telefone,
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
      private.telefone_whatsapp_br(u.raw_user_meta_data ->> 'phone'),
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
    union all
    select
      'lead-' || u.id::text,
      'Lead',
      u.id,
      u.email::text,
      private.telefone_whatsapp_br(u.raw_user_meta_data ->> 'phone'),
      m.criado_em,
      u.raw_user_meta_data -> 'medicao_anuncios',
      u.raw_user_meta_data -> 'origem_utm',
      null::text
    from public.funil_marcos m
    join auth.users u on u.id = m.user_id
    where m.marco = 'orcamento_enviado'
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
