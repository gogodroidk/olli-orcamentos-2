-- GZ-ATIVACAO — mapa da base do OLLI Orçamentos (13/11/2026)
-- SÓ SELECT. Não é migration. Não copiar para supabase/migrations e não aplicar no banco por este arquivo.
-- Quem roda: Salomão, no SQL editor do Supabase (papel postgres). O Grok não acessa o banco de produção.
--
-- O resultado é UM valor jsonb: um array. Salvar esse array (só o JSON, sem cabeçalho) em
--   /home/igor/chatwoot-central/ativacao/base.json
-- e rodar: chmod 600 /home/igor/chatwoot-central/ativacao/base.json
-- Não commitar base.json. Telefone aberto não vai para a entrega.
--
-- Depois: node /home/igor/chatwoot-central/ativacao/mapa.mjs
--         node /home/igor/chatwoot-central/ativacao/importar.mjs --seco
--         node /home/igor/chatwoot-central/ativacao/enviar.mjs --seco
--
-- Conta interna (funil_exclusoes) fica de fora do mapa. Quem pediu para parar
-- (whatsapp_nao_contatar ou email_supressoes) continua no mapa, com suprimido=true,
-- e o envio não chama. Pagante de verdade vem de assinaturas_pagantes (sem cortesia).
-- Prioridade 0 = Luiz (pagamento do Pro não concluído, conta 8d2c59dd).
-- Prioridade 1 = MK Bombas (pagamento da Empresa não concluído, conta ac0f2c80).

with usuarios as (
  select
    u.id,
    u.created_at,
    u.last_sign_in_at,
    coalesce(
      nullif(btrim(p.nome), ''),
      nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data->>'name'), ''),
      ''
    ) as nome_perfil,
    u.raw_user_meta_data->>'phone' as fone_cru
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where u.deleted_at is null
    and coalesce(u.is_anonymous, false) = false
    and not exists (select 1 from public.funil_exclusoes x where x.user_id = u.id)
    and not exists (
      select 1 from public.funil_exclusoes x
      where coalesce(btrim(x.email), '') <> ''
        and lower(btrim(x.email)) = lower(btrim(coalesce(u.email, '')))
    )
),
fone_auth as (
  select
    u.id,
    u.created_at,
    u.last_sign_in_at,
    u.nome_perfil,
    case when n ~ '^55[0-9]{10,11}$' then n else null end as fone
  from usuarios u
  cross join lateral (
    select case
      when length(b) in (10, 11) then '55' || b
      else b
    end as n
    from (
      select ltrim(regexp_replace(coalesce(u.fone_cru, ''), '[^0-9]', '', 'g'), '0') as b
    ) s
  ) z
),
emp as (
  select
    e.user_id,
    nullif(btrim(e.dados->>'nomePrestador'), '') as nome_prestador,
    nullif(btrim(e.dados->>'especialidade'), '') as especialidade,
    nullif(btrim(e.dados->>'cidade'), '') as cidade,
    (
      coalesce(btrim(e.dados->>'nome'), '') <> ''
      or coalesce(btrim(e.dados->>'especialidade'), '') <> ''
    ) as perfil,
    case when n ~ '^55[0-9]{10,11}$' then n else null end as fone
  from public.empresa e
  cross join lateral (
    select case
      when length(b) in (10, 11) then '55' || b
      else b
    end as n
    from (
      select ltrim(
        regexp_replace(
          coalesce(nullif(btrim(e.dados->>'whatsapp'), ''), nullif(btrim(e.dados->>'telefone'), ''), ''),
          '[^0-9]', '', 'g'
        ),
        '0'
      ) as b
    ) s
  ) z
),
orc as (
  select
    o.user_id,
    count(*) filter (where o.excluido_em is null)::int as orcamentos,
    count(*) filter (where o.excluido_em is null and coalesce(o.status, '') <> 'rascunho')::int as enviados,
    count(*) filter (where o.excluido_em is null and o.status in ('aprovado', 'convertido'))::int as aprovados
  from public.orcamentos o
  group by o.user_id
),
cli as (
  select c.user_id, count(*)::int as clientes
  from public.clientes c
  where c.excluido_em is null
  group by c.user_id
),
pag as (
  select a.user_id, a.plano
  from public.assinaturas_pagantes a
),
trial as (
  select distinct t.owner_user_id as user_id
  from public.trials_comerciais t
  where t.estado = 'active' and t.termina_em > now()
),
junto as (
  select
    f.id as conta_id,
    coalesce(e.nome_prestador, f.nome_perfil, '') as nome,
    coalesce(e.fone, f.fone) as fone,
    coalesce(e.especialidade, '') as especialidade,
    coalesce(e.cidade, '') as cidade,
    f.created_at as cadastro_em,
    f.last_sign_in_at as ultimo_acesso_em,
    coalesce(e.perfil, false) as perfil,
    coalesce(c.clientes, 0) as clientes,
    coalesce(o.orcamentos, 0) as orcamentos,
    coalesce(o.enviados, 0) as enviados,
    coalesce(o.aprovados, 0) as aprovados,
    (p.user_id is not null) as paga,
    case
      when p.user_id is not null then p.plano
      when tr.user_id is not null then 'trial'
      else 'gratis'
    end as plano,
    (
      exists (
        select 1 from public.whatsapp_nao_contatar n
        where n.user_id = f.id
           or (coalesce(e.fone, f.fone) is not null and n.telefone = coalesce(e.fone, f.fone))
      )
      or exists (select 1 from public.email_supressoes s where s.user_id = f.id)
    ) as suprimido,
    case
      when f.id::text like '8d2c59dd%' then 0
      when f.id::text like 'ac0f2c80%' then 1
      else 2
    end as prioridade
  from fone_auth f
  left join emp e on e.user_id = f.id
  left join orc o on o.user_id = f.id
  left join cli c on c.user_id = f.id
  left join pag p on p.user_id = f.id
  left join trial tr on tr.user_id = f.id
)
select coalesce(jsonb_agg(
  jsonb_build_object(
    'conta_id', conta_id,
    'nome', nome,
    'telefone_e164', case when fone is null then null else '+' || fone end,
    'especialidade', especialidade,
    'cidade', cidade,
    'etapa', case
      when paga then 'pagou'
      when aprovados > 0 then 'aprovado'
      when enviados > 0 then 'enviado'
      when orcamentos > 0 then 'orcamento'
      when clientes > 0 then 'cliente'
      when perfil then 'perfil'
      else 'cadastrou'
    end,
    'cadastro', to_char(cadastro_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
    'plano', plano,
    'orcamentos', orcamentos,
    'ultimo_acesso', case
      when ultimo_acesso_em is null then null
      else to_char(ultimo_acesso_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
    end,
    'paga', paga,
    'suprimido', suprimido,
    'perfil', perfil,
    'clientes', clientes,
    'enviados', enviados,
    'aprovados', aprovados,
    'prioridade', prioridade
  )
  order by prioridade, cadastro_em desc
), '[]'::jsonb) as base
from junto;
