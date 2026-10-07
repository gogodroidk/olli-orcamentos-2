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
-- Sem PII: as views só devolvem user_id, datas e contagens; leitura só service_role.
--
--   select * from public.ativacao_coorte_48h;          -- a taxa em 48 h por semana de cadastro (+ linha 'todas')
--   select * from public.primeiro_orcamento_por_conta; -- 1 linha por conta (segundos até o 1º orçamento real)
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
create or replace view public.primeiro_orcamento_por_conta
with (security_invoker = true) as
with contas as (
  select u.id as user_id, u.created_at as cadastro_em
    from auth.users u
   where u.deleted_at is null
     and not exists (
       select 1 from public.funil_exclusoes f
        where f.user_id = u.id or (f.email is not null and lower(f.email) = lower(u.email))
     )
), orcs as (
  select o.user_id, o.criado_em, o.status,
         coalesce((
           jsonb_typeof(o.dados -> 'itens') = 'array'
           and jsonb_array_length(o.dados -> 'itens') > 0
           and not exists (
             select 1
               from jsonb_array_elements(o.dados -> 'itens') it
              where not exists (
                select 1 from public.ativacao_exemplos_ref r
                 where r.nome = it ->> 'nome'
                   and r.preco = case when (it ->> 'preco') ~ '^-?[0-9]+(\.[0-9]+)?$' then (it ->> 'preco')::numeric end
              )
           )
         ), false) as so_exemplo -- sem itens/dados = NÃO é exemplo (NULL sumiria da conta de "real")
    from public.orcamentos o
)
select c.user_id,
       c.cadastro_em,
       min(o.criado_em)                                         as primeiro_orcamento_em,
       min(o.criado_em) filter (where not o.so_exemplo)         as primeiro_orcamento_real_em,
       min(o.criado_em) filter (where o.status <> 'rascunho')   as primeiro_envio_em,
       extract(epoch from (min(o.criado_em) - c.cadastro_em))::bigint
                                                                as segundos_ate_primeiro,
       extract(epoch from (min(o.criado_em) filter (where not o.so_exemplo) - c.cadastro_em))::bigint
                                                                as segundos_ate_primeiro_real,
       (count(o.criado_em) > 0 and count(o.criado_em) filter (where not o.so_exemplo) = 0)
                                                                as so_exemplo
  from contas c
  left join orcs o on o.user_id = c.user_id
 group by c.user_id, c.cadastro_em;

revoke all on public.primeiro_orcamento_por_conta from public, anon, authenticated;
grant select on public.primeiro_orcamento_por_conta to service_role;
comment on view public.primeiro_orcamento_por_conta is
  'Uma linha por conta (fora de funil_exclusoes): quando orçou pela 1ª vez (qualquer / real = não-exemplo) e quando enviou; segundos desde o cadastro. so_exemplo = só tem orçamento de exemplo sem edição.';

-- ─── A taxa em 48 h, por coorte (semana de cadastro) ────────────────────────────
-- Só entram contas com ≥ 48 h de vida (as outras ainda podem orçar). A linha 'todas' soma tudo.
create or replace view public.ativacao_coorte_48h
with (security_invoker = true) as
with elegiveis as (
  select p.*, date_trunc('week', p.cadastro_em)::date as semana
    from public.primeiro_orcamento_por_conta p
   where p.cadastro_em <= now() - interval '48 hours'
), marcadas as (
  select e.*,
         (e.primeiro_orcamento_em      is not null and e.primeiro_orcamento_em      <= e.cadastro_em + interval '48 hours') as orcou_48h,
         (e.primeiro_orcamento_real_em is not null and e.primeiro_orcamento_real_em <= e.cadastro_em + interval '48 hours') as orcou_real_48h,
         (e.primeiro_envio_em          is not null and e.primeiro_envio_em          <= e.cadastro_em + interval '48 hours') as enviou_48h
    from elegiveis e
), agregadas as (
  select to_char(m.semana, 'YYYY-MM-DD') as coorte, m.* from marcadas m
  union all
  select 'todas', m.* from marcadas m
)
select a.coorte,
       count(*)                                           as contas_elegiveis,
       count(*) filter (where a.orcou_48h)                as orcaram_48h,
       count(*) filter (where a.orcou_real_48h)           as orcaram_real_48h,
       count(*) filter (where a.enviou_48h)               as enviaram_48h,
       round(100.0 * count(*) filter (where a.orcou_48h)      / nullif(count(*), 0), 1) as taxa_orcou_pct,
       round(100.0 * count(*) filter (where a.orcou_real_48h) / nullif(count(*), 0), 1) as taxa_orcou_real_pct,
       round(100.0 * count(*) filter (where a.enviou_48h)     / nullif(count(*), 0), 1) as taxa_enviou_pct,
       (percentile_cont(0.5) within group (order by a.segundos_ate_primeiro_real)
          filter (where a.orcou_real_48h))::bigint        as mediana_segundos_ate_real
  from agregadas a
 group by a.coorte
 order by (a.coorte = 'todas'), a.coorte;

revoke all on public.ativacao_coorte_48h from public, anon, authenticated;
grant select on public.ativacao_coorte_48h to service_role;
comment on view public.ativacao_coorte_48h is
  'Taxa de ativação em 48 h por semana de cadastro: orçou (qualquer), orçou de verdade (não-exemplo) e enviou; mediana de segundos até o 1º orçamento real. Linha ''todas'' = soma. Só contas com 48 h ou mais.';
