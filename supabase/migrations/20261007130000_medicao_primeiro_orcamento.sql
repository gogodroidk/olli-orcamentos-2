-- MEDIÇÃO DO 1º ORÇAMENTO (T1 da spec SPEC-1-SEMANA-PRIMEIRO-ORCAMENTO, 07/10/2026).
--
-- Por quê: toda ativação medida até hoje vem do PAINEL WEB (user_activity_log); o app não aparece e o
-- orçamento de EXEMPLO salvo conta como "orçou" e infla a taxa. Esta migration mede a partir do que o banco
-- JÁ tem — `orcamentos` (que recebe painel E app via sync) e `auth.users` — então:
--   · vale para qualquer plataforma, sem cliente novo nem AAB;
--   · tem histórico desde o 1º cadastro (a base de hoje é reproduzida: 11 de 62 = 17,7%);
--   · separa o orçamento de EXEMPLO sem edição do orçamento REAL.
--
-- "Exemplo sem edição" = todos os itens do orçamento são, por NOME e PREÇO, itens de `ativacao_exemplos_ref`
-- (a tabela espelha EXEMPLOS_POR_VERTICAL de src/services/ativacao.ts; scripts/teste-medicao-primeiro-orcamento.ts
-- falha se os dois divergirem). Trocar um preço ou um nome já torna o orçamento REAL.
--
-- Contas internas/teste ficam fora (`funil_exclusoes`, por id ou e-mail) e conta apagada também.
-- Sem PII: só user_id, datas e contagens.
--
-- COMO LÊ auth.users (convenção do repo: ver anuncios_conversoes_pendentes e 20260723_profiles_view_hardening):
-- roles NUNCA leem auth.users direto. Por isso são FUNÇÕES `security definer` com `search_path` vazio, execução só
-- do service_role — não views (uma view `security_invoker` daria "permission denied" para o service_role, que não
-- tem grant em auth.users; uma view definer é o ERROR `security_definer_view` do advisor).
--
--   select * from public.ativacao_coorte_48h();          -- a taxa em 48 h por semana de cadastro (+ linha 'todas')
--   select * from public.primeiro_orcamento_por_conta(); -- 1 linha por conta (segundos até o 1º orçamento real)
--
-- REGRAS DE CLASSIFICAÇÃO (decisões do Maestro, 07/10/2026):
--   · orçamento de EXEMPLO sem edição (todos os itens batem nome+preço com ativacao_exemplos_ref) não conta como real;
--   · orçamento SEM itens (dados vazio ou itens ausente/vazio) NÃO conta como real — conta só como "qualquer";
--   · a coorte semanal usa a semana de São Paulo (America/Sao_Paulo): domingo 23:30 em SP é da semana que acabou.
--
-- Idempotente.

create table if not exists public.ativacao_exemplos_ref (
  vertical text not null,
  nome     text not null,
  preco    numeric(12, 2) not null,
  primary key (vertical, nome)
);
alter table public.ativacao_exemplos_ref enable row level security;
revoke all on public.ativacao_exemplos_ref from public, anon, authenticated;
grant select on public.ativacao_exemplos_ref to service_role;

insert into public.ativacao_exemplos_ref (vertical, nome, preco) values
  ('refrigeracao', 'Higienização completa de split (até 12.000 BTUs)', 180.00),
  ('refrigeracao', 'Visita técnica e teste de funcionamento', 80.00),
  ('eletrica', 'Troca de disjuntor no quadro (mão de obra)', 90.00),
  ('eletrica', 'Instalação de tomada (mão de obra)', 60.00),
  ('eletrica', 'Disjuntor 20 A', 35.00),
  ('hidraulica', 'Desentupimento de pia ou ralo', 150.00),
  ('hidraulica', 'Troca de sifão (mão de obra)', 70.00),
  ('hidraulica', 'Sifão sanfonado', 25.00),
  ('pintura', 'Pintura de parede interna, 2 demãos (mão de obra)', 25.00),
  ('pintura', 'Massa corrida e lixamento', 12.00),
  ('dedetizacao', 'Dedetização residencial (até 100 m²)', 250.00),
  ('dedetizacao', 'Aplicação de gel em cozinha e banheiros', 100.00),
  ('caixa_dagua', 'Limpeza e desinfecção de caixa d''água (até 1.000 litros)', 250.00),
  ('caixa_dagua', 'Vistoria da tampa, da boia e do extravasor', 50.00),
  ('piscina', 'Visita de limpeza (peneira, escovação e aspiração)', 100.00),
  ('piscina', 'Produtos para tratamento da água (cloro e corretor de pH)', 80.00),
  ('extintores', 'Recarga de extintor de pó ABC 4 kg', 50.00),
  ('extintores', 'Recarga de extintor de CO2 6 kg', 90.00),
  ('extintores', 'Visita técnica e inspeção dos extintores', 60.00),
  ('jardinagem', 'Corte de grama com acabamento', 3.00),
  ('jardinagem', 'Poda de arbustos e cerca viva', 120.00),
  ('jardinagem', 'Recolhimento dos resíduos verdes', 60.00),
  ('geral', 'Visita técnica e avaliação', 60.00),
  ('geral', 'Mão de obra (hora técnica)', 80.00)
on conflict (vertical, nome) do update set preco = excluded.preco;

-- ─── 1 linha por conta ──────────────────────────────────────────────────────────
-- (versão anterior desta migration criava VIEWS; nunca foi aplicada, mas o drop deixa o reaplicar seguro)
drop view if exists public.ativacao_coorte_48h;
drop view if exists public.primeiro_orcamento_por_conta;

create or replace function public.primeiro_orcamento_por_conta()
returns table (
  user_id                    uuid,
  cadastro_em                timestamptz,
  primeiro_orcamento_em      timestamptz,
  primeiro_orcamento_real_em timestamptz,
  primeiro_envio_em          timestamptz,
  segundos_ate_primeiro      bigint,
  segundos_ate_primeiro_real bigint,
  sem_real                   boolean
)
language sql
stable
security definer
set search_path to ''
as $$
  with contas as (
    select u.id as uid, u.created_at as cadastro
      from auth.users u
     where u.deleted_at is null
       and not exists (
         select 1 from public.funil_exclusoes f
          where f.user_id = u.id or (f.email is not null and lower(f.email) = lower(u.email))
       )
  ), orcs as (
    select o.user_id as uid, o.criado_em, o.status,
           -- Itens existem? (sem itens = vazio: nem exemplo nem real)
           coalesce(jsonb_typeof(o.dados -> 'itens') = 'array' and jsonb_array_length(o.dados -> 'itens') > 0, false) as tem_itens,
           -- Exemplo sem edição: tem itens E todos batem nome+preço com a referência.
           coalesce((
             jsonb_typeof(o.dados -> 'itens') = 'array'
             and jsonb_array_length(o.dados -> 'itens') > 0
             and not exists (
               select 1
                 from jsonb_array_elements(o.dados -> 'itens') it
                where not exists (
                  select 1 from public.ativacao_exemplos_ref r
                   where r.nome = it ->> 'nome'
                     and r.preco = case when (it ->> 'preco') ~ '^-?[0-9]+([.][0-9]+)?$' then (it ->> 'preco')::numeric end
                )
             )
           ), false) as so_exemplo
      from public.orcamentos o
  ), classif as (
    select x.*, (x.tem_itens and not x.so_exemplo) as eh_real
      from orcs x
  )
  select c.uid,
         c.cadastro,
         min(k.criado_em),
         min(k.criado_em) filter (where k.eh_real),
         min(k.criado_em) filter (where k.status <> 'rascunho'),
         extract(epoch from (min(k.criado_em) - c.cadastro))::bigint,
         extract(epoch from (min(k.criado_em) filter (where k.eh_real) - c.cadastro))::bigint,
         (count(k.criado_em) > 0 and count(k.criado_em) filter (where k.eh_real) = 0)
    from contas c
    left join classif k on k.uid = c.uid
   group by c.uid, c.cadastro;
$$;

revoke all on function public.primeiro_orcamento_por_conta() from public, anon, authenticated;
grant execute on function public.primeiro_orcamento_por_conta() to service_role;
comment on function public.primeiro_orcamento_por_conta() is
  'Uma linha por conta (fora de funil_exclusoes e apagadas): 1º orçamento (qualquer / real = com itens e não só exemplo) e 1º envio; segundos desde o cadastro; sem_real = tem orçamento mas nenhum real.';

-- ─── A taxa em 48 h, por coorte (semana de cadastro em America/Sao_Paulo) ───────
-- Só entram contas com ≥ 48 h de vida (as outras ainda podem orçar). A linha 'todas' soma tudo.
create or replace function public.ativacao_coorte_48h()
returns table (
  coorte                    text,
  contas_elegiveis          bigint,
  orcaram_48h               bigint,
  orcaram_real_48h          bigint,
  enviaram_48h              bigint,
  taxa_orcou_pct            numeric,
  taxa_orcou_real_pct       numeric,
  taxa_enviou_pct           numeric,
  mediana_segundos_ate_real bigint
)
language sql
stable
security definer
set search_path to ''
as $$
  with marcadas as (
    select p.user_id as uid,
           to_char(date_trunc('week', p.cadastro_em at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as semana,
           p.segundos_ate_primeiro_real as seg_real,
           (p.primeiro_orcamento_em      is not null and p.primeiro_orcamento_em      <= p.cadastro_em + interval '48 hours') as orcou_48h,
           (p.primeiro_orcamento_real_em is not null and p.primeiro_orcamento_real_em <= p.cadastro_em + interval '48 hours') as orcou_real_48h,
           (p.primeiro_envio_em          is not null and p.primeiro_envio_em          <= p.cadastro_em + interval '48 hours') as enviou_48h
      from public.primeiro_orcamento_por_conta() p
     where p.cadastro_em <= pg_catalog.now() - interval '48 hours'
  ), agregadas as (
    select m.semana as grupo, m.* from marcadas m
    union all
    select 'todas', m.* from marcadas m
  )
  select a.grupo,
         count(*),
         count(*) filter (where a.orcou_48h),
         count(*) filter (where a.orcou_real_48h),
         count(*) filter (where a.enviou_48h),
         round(100.0 * count(*) filter (where a.orcou_48h)      / nullif(count(*), 0), 1),
         round(100.0 * count(*) filter (where a.orcou_real_48h) / nullif(count(*), 0), 1),
         round(100.0 * count(*) filter (where a.enviou_48h)     / nullif(count(*), 0), 1),
         (percentile_cont(0.5) within group (order by a.seg_real) filter (where a.orcou_real_48h))::bigint
    from agregadas a
   group by a.grupo
   order by (a.grupo = 'todas'), a.grupo;
$$;

revoke all on function public.ativacao_coorte_48h() from public, anon, authenticated;
grant execute on function public.ativacao_coorte_48h() to service_role;
comment on function public.ativacao_coorte_48h() is
  'Taxa de ativação em 48 h por semana de cadastro (segunda-feira em America/Sao_Paulo): orçou (qualquer), orçou de verdade (com itens, não só exemplo) e enviou; mediana de segundos até o 1º orçamento real. Linha ''todas'' = soma. Só contas com 48 h ou mais.';
