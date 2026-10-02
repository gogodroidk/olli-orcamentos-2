-- ─────────────────────────────────────────────────────────────────────────────
-- FUNIL: contas com CRÉDITO DE TROCA não são mais "cortesia" (02/10/2026)
--
-- O crédito de troca (20261002153417_creditos_troca.sql) concede o Pro pelo mesmo
-- override administrativo do "Conceder Pro" (admin_override_*). A regra de
-- exclusão do funil (20260930120100_funil_receita.sql) tratava TODO override
-- como cortesia/demo e tirava a conta do funil — justamente as contas que mais
-- interessa medir: prestadores reais vindos de concorrentes.
--
-- Agora:
--   - override com crédito de troca aprovado → fica no funil;
--   - override sem crédito de troca → continua 'cortesia' (demo, revisor, dono);
--   - concessão legada fictícia (funil_assinatura_ficticia) → continua 'cortesia';
--   - a aprovação do crédito entra no degrau "teste do Pro" (decidido_em),
--     nunca no "pagou".
--
-- Só redefine funil_contas_marcos (mesma assinatura/retorno). Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.funil_contas_marcos(p_emails_excluidos text[] default '{}')
returns table (
  user_id             uuid,
  excluida_por        text,
  semana              date,
  cadastro_em         timestamptz,
  entrou_em           timestamptz,
  perfil_empresa_em   timestamptz,
  primeiro_cliente_em timestamptz,
  primeiro_orcamento_em timestamptz,
  orcamento_enviado_em  timestamptz,
  orcamento_aprovado_em timestamptz,
  teste_pro_em        timestamptz,
  pagou_em            timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with emails as (
    select distinct lower(btrim(e)) as email
      from unnest(coalesce(p_emails_excluidos, '{}'::text[])) as e
     where coalesce(btrim(e), '') <> ''
  ),
  base as (
    select u.id, u.created_at, u.last_sign_in_at, lower(btrim(coalesce(u.email, ''))) as email
      from auth.users u
  ),
  bruto as (
    select
      b.id,
      b.created_at,
      b.email,
      (select min(a.criado_em) from public.user_activity_log a where a.user_id = b.id) as atividade,
      b.last_sign_in_at,
      least(
        (select min(m.criado_em) from public.funil_marcos m where m.user_id = b.id and m.marco = 'perfil_empresa'),
        (select e.atualizado_em from public.empresa e
          where e.user_id = b.id and coalesce(btrim(e.dados ->> 'nome'), '') <> '')
      ) as perfil,
      (select min(c.criado_em) from public.clientes c where c.user_id = b.id) as cliente,
      (select min(o.criado_em) from public.orcamentos o where o.user_id = b.id) as orcamento,
      least(
        (select min(m.criado_em) from public.funil_marcos m where m.user_id = b.id and m.marco = 'orcamento_enviado'),
        (select min(p.criado_em) from public.orcamentos_publicos p where p.user_id = b.id),
        (select min(g.confirmado_em) from public.orcamento_envios_gratis g
          where g.owner_user_id = b.id and g.estado = 'confirmado'),
        (select min(coalesce(o.atualizado_em, o.criado_em)) from public.orcamentos o
          where o.user_id = b.id and o.status in (
            'enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura',
            'aprovado', 'recusado', 'convertido'))
      ) as enviado,
      least(
        (select min(m.criado_em) from public.funil_marcos m where m.user_id = b.id and m.marco = 'orcamento_aprovado'),
        (select min(p.respondido_em) from public.orcamentos_publicos p
          where p.user_id = b.id and p.status = 'aprovado'),
        (select min(coalesce(o.atualizado_em, o.criado_em)) from public.orcamentos o
          where o.user_id = b.id and o.status in ('aprovado', 'convertido'))
      ) as aprovado,
      -- Crédito de troca aprovado = teste do Pro concedido pelo admin (até 3 meses).
      -- Entra no degrau "teste do Pro"; NUNCA no "pagou" (não houve pagamento).
      least(
        (select min(t.iniciado_em) from public.trials_comerciais t where t.owner_user_id = b.id),
        (select min(ct.decidido_em) from public.creditos_troca ct
          where ct.user_id = b.id and ct.status = 'aprovado')
      ) as teste_pro,
      least(
        (select min(m.criado_em) from public.funil_marcos m where m.user_id = b.id and m.marco = 'pagou'),
        -- Pix da AbacatePay: a cobrança consumida guarda o dono no payload.
        (select min(w.processado_em) from public.webhook_events w
          where w.origem = 'abacate' and w.status = 'processado'
            and w.payload ->> 'user_id' = b.id::text)
      ) as pagou
    from base b
  )
  select
    r.id,
    case
      when r.email <> '' and r.email in (select email from emails) then 'dono'
      when exists (select 1 from public.funil_exclusoes x where x.user_id = r.id)
        or (r.email <> '' and exists (select 1 from public.funil_exclusoes x where x.email = r.email))
        then 'lista_interna'
      when exists (select 1 from public.admin_memberships am where am.user_id = r.id) then 'admin'
      -- Concessão legada com id de gateway inventado: sempre interna.
      when exists (select 1 from public.assinaturas s
                    where s.user_id = r.id
                      and public.funil_assinatura_ficticia(s.stripe_subscription_id, s.stripe_customer_id))
        then 'cortesia'
      -- Override do painel: cortesia/demo, EXCETO quando veio de um crédito de
      -- troca aprovado — esse é prestador real vindo de concorrente e o funil
      -- precisa enxergar se ele converte depois do teste.
      when exists (select 1 from public.assinaturas s
                    where s.user_id = r.id
                      and (s.admin_override_ativo or s.admin_override_at is not null))
       and not exists (select 1 from public.creditos_troca ct
                        where ct.user_id = r.id and ct.status = 'aprovado')
        then 'cortesia'
      when exists (select 1 from public.organizacao_membros om
                     join public.organizacoes o on o.id = om.org_id
                    where om.user_id = r.id and o.owner_user_id <> r.id)
        then 'membro_equipe'
    end,
    (date_trunc('week', r.created_at at time zone 'America/Sao_Paulo'))::date,
    r.created_at,
    -- Dado criado pela conta implica que ela entrou. Tudo é trazido para depois
    -- do cadastro: o app é offline-first e sincroniza criado_em do aparelho.
    case when x.entrou is null then null else greatest(x.entrou, r.created_at) end,
    case when r.perfil is null then null else greatest(r.perfil, r.created_at) end,
    case when r.cliente is null then null else greatest(r.cliente, r.created_at) end,
    case when r.orcamento is null then null else greatest(r.orcamento, r.created_at) end,
    case when r.enviado is null then null else greatest(r.enviado, r.created_at) end,
    case when r.aprovado is null then null else greatest(r.aprovado, r.created_at) end,
    case when r.teste_pro is null then null else greatest(r.teste_pro, r.created_at) end,
    case when r.pagou is null then null else greatest(r.pagou, r.created_at) end
  from bruto r
  cross join lateral (
    select least(r.atividade, r.last_sign_in_at, r.perfil, r.cliente, r.orcamento,
                 r.enviado, r.aprovado, r.teste_pro, r.pagou) as entrou
  ) x;
$$;

revoke all on function public.funil_contas_marcos(text[]) from public, anon, authenticated;
grant execute on function public.funil_contas_marcos(text[]) to service_role;
