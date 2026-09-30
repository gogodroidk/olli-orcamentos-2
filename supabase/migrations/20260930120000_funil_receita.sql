-- OLLI Orçamentos — FUNIL DE RECEITA medido por coorte semanal de cadastro.
--
-- Por quê (30/09/2026): 60 contas, 0 pagantes, 47 nunca criaram orçamento. Sem
-- medida por degrau, não dá para saber ONDE as pessoas caem — e cada correção de
-- ativação vira palpite. Esta migration define o funil canônico por conta e o
-- calcula no banco, sem PII, para o painel ADMIN do worker (service_role).
--
-- Funil canônico (uma conta = um usuário dono; membro convidado de equipe alheia
-- não é cadastro de prestador e fica fora):
--   1 cadastro            auth.users.created_at
--   2 entrou              1º sinal de sessão: user_activity_log, last_sign_in_at
--                         ou qualquer dado criado pela conta (dado implica login)
--   3 perfil_empresa      empresa.dados->>'nome' preenchido
--   4 primeiro_cliente    min(clientes.criado_em)
--   5 primeiro_orcamento  min(orcamentos.criado_em)
--   6 orcamento_enviado   link público criado, PDF/WhatsApp confirmado na cota do
--                         Grátis, ou status saiu de rascunho
--   7 orcamento_aprovado  aprovado no link público (respondido_em) ou marcado
--                         aprovado/convertido pelo prestador (aprovação que o
--                         cliente deu por fora — WhatsApp, telefone)
--   8 teste_pro           trials_comerciais.iniciado_em
--   9 pagou               1ª vez que a assinatura ficou ativa e paga por gateway
--                         (Stripe, Mercado Pago, Pix) — nunca concessão manual
--
-- DERIVAR, NÃO DUPLICAR: quase tudo já existe em tabela própria. O que faltava
-- era o INSTANTE de três transições que só deixam o estado atual:
--   - orçamento saiu de rascunho / virou aprovado (orcamentos.status muda no lugar);
--   - perfil da empresa preenchido (empresa só tem atualizado_em, que anda a cada edição);
--   - assinatura virou paga (assinaturas.atualizado_em anda a cada renovação).
-- Para esses, `funil_marcos` guarda a PRIMEIRA ocorrência por conta, gravada por
-- trigger. O histórico anterior é carregado aqui com a melhor data disponível
-- (atualizado_em no momento da migration) e marcado `estimado = true`. Os
-- "atualizado_em" continuam como teto de segurança na leitura: least() de um teto
-- com o marco nunca piora o marco.
--
-- TELEMETRIA NUNCA QUEBRA O NEGÓCIO: o registro do marco engole qualquer erro
-- (warning no log). Um webhook de pagamento ou o sync de um orçamento não pode
-- falhar porque o funil falhou.
--
-- CONTAS INTERNAS FORA (lista configurável, sem e-mail no SQL):
--   - `funil_exclusoes` (por user_id ou e-mail) — editável pelo painel admin
--     ("Marcar como conta interna") ou por SQL;
--   - e-mails passados pelo chamador (o worker manda o ADMIN_EMAIL, que é o dono);
--   - administradores do SaaS (admin_memberships);
--   - contas que já receberam plano manual (cortesia/demo: admin_override_*);
--   - membros convidados de equipe de outro dono.
--
-- Leitura: SÓ service_role (o worker, depois de super-admin + TOTP). Nenhuma
-- função devolve e-mail, nome ou id — só contagens e medianas por semana.
--
-- Os clientes (app/painel) não mudam: nenhum evento novo sai do dispositivo.

-- ─── 1. Marcos de transição (primeira ocorrência por conta) ─────────────────

create table if not exists public.funil_marcos (
  user_id    uuid not null references auth.users (id) on delete cascade,
  marco      text not null check (marco in (
    'perfil_empresa', 'orcamento_enviado', 'orcamento_aprovado', 'pagou'
  )),
  -- De onde veio a transição. 'retroativo' = carga desta migration.
  origem     text not null check (origem in (
    'empresa', 'orcamento', 'stripe', 'mercado_pago', 'avulso', 'retroativo'
  )),
  criado_em  timestamptz not null default now(),
  -- true = data aproximada (teto), vinda da carga retroativa.
  estimado   boolean not null default false,
  primary key (user_id, marco)
);

alter table public.funil_marcos enable row level security;
alter table public.funil_marcos force row level security;
revoke all on table public.funil_marcos from public, anon, authenticated;
grant select on table public.funil_marcos to service_role;

comment on table public.funil_marcos is
  'Primeira ocorrência, por conta, das transições do funil que não deixam data própria (perfil, enviado, aprovado, pagou). Gravada por trigger; leitura só service_role. Ver admin_funil_coortes.';

-- ─── 2. Lista configurável de contas internas ───────────────────────────────

create table if not exists public.funil_exclusoes (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users (id) on delete cascade,
  -- E-mail sempre normalizado: quem grava já manda minúsculo e sem espaço.
  email       text check (email is null or (email = lower(btrim(email)) and position('@' in email) > 1)),
  motivo      text not null check (char_length(motivo) between 3 and 200),
  criado_por  uuid references auth.users (id) on delete set null,
  criado_em   timestamptz not null default now(),
  -- Exatamente um alvo por linha.
  constraint funil_exclusoes_um_alvo check ((user_id is null) <> (email is null))
);

create unique index if not exists funil_exclusoes_user_uidx
  on public.funil_exclusoes (user_id) where user_id is not null;
create unique index if not exists funil_exclusoes_email_uidx
  on public.funil_exclusoes (email) where email is not null;

alter table public.funil_exclusoes enable row level security;
alter table public.funil_exclusoes force row level security;
revoke all on table public.funil_exclusoes from public, anon, authenticated;
grant select, insert, delete on table public.funil_exclusoes to service_role;

comment on table public.funil_exclusoes is
  'Contas internas/cortesia fora do funil de receita (por user_id ou e-mail). Editável pelo painel admin (auditado) ou por SQL. Leitura só service_role.';

-- ─── 3. Registro do marco (nunca propaga erro) ──────────────────────────────

create or replace function public.funil_registrar_marco(
  p_user_id uuid,
  p_marco text,
  p_origem text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.funil_marcos (user_id, marco, origem)
  values (p_user_id, p_marco, p_origem)
  on conflict (user_id, marco) do nothing;
exception when others then
  -- Telemetria nunca derruba o sync do orçamento nem o webhook de pagamento.
  raise warning 'funil_registrar_marco falhou (%): %', p_marco, sqlstate;
end;
$$;

revoke all on function public.funil_registrar_marco(uuid, text, text) from public, anon, authenticated;

-- Status de orçamento que só existem depois de a proposta sair para o cliente.
-- 'cancelado' fica de fora: rascunho descartado também é cancelado.
create or replace function public.funil_marco_orcamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  if new.status in (
    'enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura',
    'aprovado', 'recusado', 'convertido'
  ) then
    perform public.funil_registrar_marco(new.user_id, 'orcamento_enviado', 'orcamento');
  end if;
  if new.status in ('aprovado', 'convertido') then
    perform public.funil_registrar_marco(new.user_id, 'orcamento_aprovado', 'orcamento');
  end if;
  return null;
end;
$$;

create or replace function public.funil_marco_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(btrim(new.dados ->> 'nome'), '') <> '' then
    perform public.funil_registrar_marco(new.user_id, 'perfil_empresa', 'empresa');
  end if;
  return null;
end;
$$;

-- Pago = ativo num plano pago. A concessão manual do painel mexe só nas colunas
-- admin_* (e nasce 'canceled' quando cria a linha), então não conta como pago.
create or replace function public.funil_marco_assinatura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and new.plano in ('pro', 'empresa') then
    perform public.funil_registrar_marco(
      new.user_id,
      'pagou',
      case
        when new.stripe_subscription_id is not null then 'stripe'
        when new.mp_preapproval_id is not null then 'mercado_pago'
        -- Pagamento avulso: Pix (AbacatePay/Mercado Pago) ou 12x da Stripe.
        else 'avulso'
      end
    );
  end if;
  return null;
end;
$$;

revoke all on function public.funil_marco_orcamento() from public, anon, authenticated;
revoke all on function public.funil_marco_empresa() from public, anon, authenticated;
revoke all on function public.funil_marco_assinatura() from public, anon, authenticated;

drop trigger if exists funil_marco_orcamento on public.orcamentos;
create trigger funil_marco_orcamento
  after insert or update of status on public.orcamentos
  for each row execute function public.funil_marco_orcamento();

drop trigger if exists funil_marco_empresa on public.empresa;
create trigger funil_marco_empresa
  after insert or update of dados on public.empresa
  for each row execute function public.funil_marco_empresa();

drop trigger if exists funil_marco_assinatura on public.assinaturas;
create trigger funil_marco_assinatura
  after insert or update on public.assinaturas
  for each row execute function public.funil_marco_assinatura();

-- ─── 4. Carga retroativa (congela a melhor data de hoje) ────────────────────
-- Sem isto, uma edição futura num orçamento antigo empurraria o "enviado" dele
-- para a data da edição (atualizado_em anda). Idempotente: on conflict do nothing.

insert into public.funil_marcos (user_id, marco, origem, criado_em, estimado)
select o.user_id, 'orcamento_enviado', 'retroativo', min(coalesce(o.atualizado_em, o.criado_em)), true
  from public.orcamentos o
 where o.user_id is not null
   and o.status in (
     'enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura',
     'aprovado', 'recusado', 'convertido'
   )
 group by o.user_id
on conflict (user_id, marco) do nothing;

insert into public.funil_marcos (user_id, marco, origem, criado_em, estimado)
select o.user_id, 'orcamento_aprovado', 'retroativo', min(coalesce(o.atualizado_em, o.criado_em)), true
  from public.orcamentos o
 where o.user_id is not null
   and o.status in ('aprovado', 'convertido')
 group by o.user_id
on conflict (user_id, marco) do nothing;

insert into public.funil_marcos (user_id, marco, origem, criado_em, estimado)
select e.user_id, 'perfil_empresa', 'retroativo', coalesce(e.atualizado_em, now()), true
  from public.empresa e
 where coalesce(btrim(e.dados ->> 'nome'), '') <> ''
on conflict (user_id, marco) do nothing;

insert into public.funil_marcos (user_id, marco, origem, criado_em, estimado)
select a.user_id, 'pagou', 'retroativo', coalesce(a.atualizado_em, now()), true
  from public.assinaturas a
 where a.status = 'active'
   and a.plano in ('pro', 'empresa')
on conflict (user_id, marco) do nothing;

-- ─── 5. Datas de cada degrau por conta (base das agregações) ────────────────
-- Devolve user_id: é interna (service_role) e existe para as agregações e os
-- testes. O painel NUNCA recebe esta saída crua — só admin_funil_coortes.

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
      (select min(t.iniciado_em) from public.trials_comerciais t where t.owner_user_id = b.id) as teste_pro,
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
      when exists (select 1 from public.assinaturas s
                    where s.user_id = r.id and (s.admin_override_ativo or s.admin_override_at is not null))
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

-- ─── 6. Funil por coorte semanal (o que o painel lê) ────────────────────────
-- Uma linha por (semana de cadastro, degrau) + uma linha por degrau com
-- semana = NULL (todas as coortes da janela juntas; mediana não se soma).
--
--   contas               contas da coorte que chegaram ao degrau
--   contas_no_anterior   contas que chegaram ao degrau anterior (denominador)
--   contas_com_anterior  chegaram ao anterior E a este (numerador da conversão)
--   mediana_horas_desde_anterior  entre as que têm os dois (negativo vira 0:
--                                 degrau pulado/fora de ordem)
--   mediana_horas_desde_cadastro  entre as que chegaram a este degrau
--
-- p_semanas: últimas N semanas de cadastro (1–104). NULL = todas.

create or replace function public.admin_funil_coortes(
  p_emails_excluidos text[] default '{}',
  p_semanas integer default 12
)
returns table (
  semana                        date,
  degrau_ordem                  integer,
  degrau                        text,
  contas                        bigint,
  contas_no_anterior            bigint,
  contas_com_anterior           bigint,
  mediana_horas_desde_anterior  numeric,
  mediana_horas_desde_cadastro  numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with contas as (
    select c.*
      from public.funil_contas_marcos(p_emails_excluidos) c
     where c.excluida_por is null
       and (
         p_semanas is null
         or c.semana >= (date_trunc('week', now() at time zone 'America/Sao_Paulo'))::date
                        - (least(greatest(p_semanas, 1), 104) - 1) * 7
       )
  ),
  degraus as (
    select c.semana, c.cadastro_em, d.ordem, d.degrau, d.em, d.anterior_em
      from contas c
      cross join lateral (values
        (1, 'cadastro',           c.cadastro_em,           null::timestamptz),
        (2, 'entrou',             c.entrou_em,             c.cadastro_em),
        (3, 'perfil_empresa',     c.perfil_empresa_em,     c.entrou_em),
        (4, 'primeiro_cliente',   c.primeiro_cliente_em,   c.perfil_empresa_em),
        (5, 'primeiro_orcamento', c.primeiro_orcamento_em, c.primeiro_cliente_em),
        (6, 'orcamento_enviado',  c.orcamento_enviado_em,  c.primeiro_orcamento_em),
        (7, 'orcamento_aprovado', c.orcamento_aprovado_em, c.orcamento_enviado_em),
        (8, 'teste_pro',          c.teste_pro_em,          c.orcamento_aprovado_em),
        (9, 'pagou',              c.pagou_em,              c.teste_pro_em)
      ) as d(ordem, degrau, em, anterior_em)
  )
  select
    d.semana,
    d.ordem,
    d.degrau,
    count(d.em),
    case when d.ordem = 1 then null else count(d.anterior_em) end,
    case when d.ordem = 1 then null
         else count(*) filter (where d.em is not null and d.anterior_em is not null) end,
    round((percentile_cont(0.5) within group (
      order by greatest(0, extract(epoch from d.em - d.anterior_em)) / 3600.0
    ) filter (where d.em is not null and d.anterior_em is not null))::numeric, 1),
    round((percentile_cont(0.5) within group (
      order by greatest(0, extract(epoch from d.em - d.cadastro_em)) / 3600.0
    ) filter (where d.em is not null))::numeric, 1)
  from degraus d
  group by grouping sets ((d.semana, d.ordem, d.degrau), (d.ordem, d.degrau))
  order by d.semana desc nulls first, d.ordem;
$$;

revoke all on function public.admin_funil_coortes(text[], integer) from public, anon, authenticated;
grant execute on function public.admin_funil_coortes(text[], integer) to service_role;

-- ─── 7. Quantas contas ficaram fora, por regra (sem identificar ninguém) ─────

create or replace function public.admin_funil_exclusoes(p_emails_excluidos text[] default '{}')
returns table (regra text, contas bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.excluida_por, count(*)
    from public.funil_contas_marcos(p_emails_excluidos) c
   where c.excluida_por is not null
   group by c.excluida_por
   order by 1;
$$;

revoke all on function public.admin_funil_exclusoes(text[]) from public, anon, authenticated;
grant execute on function public.admin_funil_exclusoes(text[]) to service_role;
