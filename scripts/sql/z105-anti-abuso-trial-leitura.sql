-- Z-105 — leitura do anti-abuso do trial (Z-53).
-- NÃO é migration. Não entra na pasta de migrations. Não grava, não apaga, não altera.
-- Uma sentença só. A saída tem três colunas de texto: secao, sinal, valor.
-- Não devolve e-mail, telefone, IP, nome nem id de conta.
-- O sinal dos grupos é os 16 primeiros caracteres hex de SHA-256 (pgcrypto).
-- Caixa normalizada: minúsculas; no Gmail e no Googlemail, sem ponto e sem o
-- texto depois do +; nos outros, só sem o texto depois do +. Googlemail vira gmail.com.
-- IP vem de auth.sessions (inet). auth.users não tem IP de criação.
-- Trial usado = linha de trials_comerciais com iniciado_em preenchido.
-- Conta interna = public.conta_interna (funil_exclusoes + administrador).

with contas as (
  select
    u.id,
    u.created_at,
    u.deleted_at,
    nullif(lower(btrim(u.email)), '') as email,
    public.conta_interna(u.id) as interna
  from auth.users u
),
norm as (
  select
    c.id,
    c.created_at,
    c.deleted_at,
    c.email,
    c.interna,
    case
      when c.email is null or position('@' in c.email) = 0 then null
      else
        case
          when substring(c.email from '@([^@]+)$') in ('gmail.com', 'googlemail.com')
            then replace(split_part(substring(c.email from '^([^@]+)'), '+', 1), '.', '')
          else split_part(substring(c.email from '^([^@]+)'), '+', 1)
        end
        || '@' ||
        case
          when substring(c.email from '@([^@]+)$') = 'googlemail.com' then 'gmail.com'
          else substring(c.email from '@([^@]+)$')
        end
    end as chave
  from contas c
),
sessoes as (
  select s.user_id, host(s.ip) as ip
  from auth.sessions s
  where s.ip is not null
),
grupos_email as (
  select
    min(left(encode(extensions.digest(n.chave, 'sha256'), 'hex'), 16)) as hash,
    count(*) as n,
    count(*) filter (where n.interna) as internas,
    count(*) filter (where a.user_id is not null) as com_linha,
    count(*) filter (where lower(coalesce(a.status, '')) = 'active') as ativas
  from norm n
  left join public.assinaturas a on a.user_id = n.id
  where n.chave is not null
  group by n.chave
  having count(*) >= 2
),
grupos_ip as (
  select
    min(left(encode(extensions.digest(s.ip, 'sha256'), 'hex'), 16)) as hash,
    count(distinct s.user_id) as n,
    count(distinct s.user_id) filter (where a.user_id is not null) as com_linha,
    count(distinct s.user_id) filter (where lower(coalesce(a.status, '')) = 'active') as ativas
  from sessoes s
  left join public.assinaturas a on a.user_id = s.user_id
  group by s.ip
  having count(distinct s.user_id) >= 2
),
trials_usados as (
  select t.owner_user_id as user_id
  from public.trials_comerciais t
  where t.iniciado_em is not null
)
select secao, sinal, valor
from (
  select 'resumo'::text as secao, 'contas'::text as sinal, count(*)::text as valor from contas
  union all
  select 'resumo', 'apagadas', count(*)::text from contas where deleted_at is not null
  union all
  select 'resumo', 'vivas', count(*)::text from contas where deleted_at is null
  union all
  select 'resumo', 'com_email', count(*)::text from contas where email is not null
  union all
  select 'resumo', 'sem_email', count(*)::text from contas where email is null
  union all
  select 'resumo', 'internas', count(*)::text from contas where interna
  union all
  select 'resumo', 'externas', count(*)::text from contas where not interna
  union all
  select 'resumo', 'sem_assinatura', count(*)::text
  from contas c
  where not exists (select 1 from public.assinaturas a where a.user_id = c.id)
  union all
  select 'resumo', 'primeira_conta',
    to_char((min(created_at) at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
  from contas
  union all
  select 'resumo', 'ultima_conta',
    to_char((max(created_at) at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
  from contas
  union all
  select 'resumo', 'primeira_conta_utc',
    to_char((min(created_at) at time zone 'UTC')::date, 'YYYY-MM-DD')
  from contas
  union all
  select 'resumo', 'ultima_conta_utc',
    to_char((max(created_at) at time zone 'UTC')::date, 'YYYY-MM-DD')
  from contas
  union all
  select 'resumo', 'email_identico_distintos', count(distinct email)::text
  from contas
  where email is not null
  union all
  select 'resumo', 'email_identico_grupos', count(*)::text
  from (
    select email from contas where email is not null group by email having count(*) >= 2
  ) g
  union all
  select 'resumo', 'email_identico_contas', coalesce(sum(n), 0)::text
  from (
    select count(*) as n from contas where email is not null group by email having count(*) >= 2
  ) g
  union all
  select 'resumo', 'email_norm_distintos', count(distinct chave)::text
  from norm
  where chave is not null
  union all
  select 'resumo', 'email_norm_grupos', count(*)::text from grupos_email
  union all
  select 'resumo', 'email_norm_contas', coalesce(sum(n), 0)::text from grupos_email
  union all
  select 'resumo', 'email_norm_com_linha', coalesce(sum(com_linha), 0)::text from grupos_email
  union all
  select 'resumo', 'email_norm_ativas', coalesce(sum(ativas), 0)::text from grupos_email
  union all
  select 'resumo', 'sessoes', count(*)::text from auth.sessions
  union all
  select 'resumo', 'sessoes_com_ip', count(*)::text from auth.sessions where ip is not null
  union all
  select 'resumo', 'contas_com_sessao', count(distinct user_id)::text from sessoes
  union all
  select 'resumo', 'contas_sem_sessao',
    ((select count(*) from contas) - (select count(distinct user_id) from sessoes))::text
  union all
  select 'resumo', 'ips_distintos', count(distinct ip)::text from sessoes
  union all
  select 'resumo', 'ip_grupos', count(*)::text from grupos_ip
  union all
  select 'resumo', 'contas_em_ip_compartilhado', count(distinct user_id)::text
  from sessoes
  where ip in (select ip from sessoes group by ip having count(distinct user_id) >= 2)
  union all
  select 'resumo', 'ip_contas_com_linha', count(distinct s.user_id)::text
  from sessoes s
  join public.assinaturas a on a.user_id = s.user_id
  where s.ip in (select ip from sessoes group by ip having count(distinct user_id) >= 2)
  union all
  select 'resumo', 'ip_contas_ativas', count(distinct s.user_id)::text
  from sessoes s
  join public.assinaturas a on a.user_id = s.user_id
  where lower(coalesce(a.status, '')) = 'active'
    and s.ip in (select ip from sessoes group by ip having count(distinct user_id) >= 2)
  union all
  select 'resumo', 'contas_email_e_ip', count(*)::text
  from (
    select n.id
    from norm n
    where n.chave in (
      select n2.chave from norm n2 where n2.chave is not null group by n2.chave having count(*) >= 2
    )
    intersect
    select s.user_id
    from sessoes s
    where s.ip in (
      select s2.ip from sessoes s2 group by s2.ip having count(distinct s2.user_id) >= 2
    )
  ) cruz
  union all
  select 'resumo', 'auditoria_linhas', count(*)::text from auth.audit_log_entries
  union all
  select 'resumo', 'auditoria_com_ip', count(*)::text
  from auth.audit_log_entries
  where ip_address is not null and btrim(ip_address) <> ''
  union all
  select 'resumo', 'trials_iniciados', count(*)::text from trials_usados
  union all
  select 'resumo', 'chaves_com_2_trials', count(*)::text
  from (
    select n.chave
    from norm n
    join trials_usados t on t.user_id = n.id
    where n.chave is not null
    group by n.chave
    having count(distinct n.id) >= 2
  ) p
  union all
  select 'assinatura', lower(coalesce(plano, '')) || '|' || lower(coalesce(status, '')), count(*)::text
  from public.assinaturas
  group by 1, 2
  union all
  select 'email_norm', hash, n::text from grupos_email
  union all
  select 'email_norm_internas', hash, internas::text from grupos_email
  union all
  select 'email_norm_linha', hash, com_linha::text from grupos_email
  union all
  select 'email_norm_ativa', hash, ativas::text from grupos_email
  union all
  select 'ip', hash, n::text from grupos_ip
  union all
  select 'ip_linha', hash, com_linha::text from grupos_ip
  union all
  select 'ip_ativa', hash, ativas::text from grupos_ip
) leitura
order by secao, sinal
