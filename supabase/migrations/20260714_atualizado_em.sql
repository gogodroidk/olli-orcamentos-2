-- 20260714_atualizado_em.sql — relógio de edição para as 6 tabelas que não tinham.
-- APLICADA em 2026-07-09.
--
-- POR QUÊ: agendamentos, orcamentos, ordens_servico e assets já carregam
-- `atualizado_em`, e o cloudSync usa esse timestamp para decidir quem vence num
-- conflito (guards remoteMaisNovoNoMapa / localMaisNovo). As outras seis —
-- clientes, servicos, produtos, modelos, depoimentos, recibos — nunca tiveram
-- relógio: o sync sempre foi last-writer-wins cego nelas.
--
-- Isso era um bug latente (editar o mesmo cliente em dois aparelhos) e virou
-- perda de dado real quando a LIXEIRA (soft delete via `excluido_em`) entrou:
--   1. o técnico exclui um serviço OFFLINE  → local: excluido_em = agora
--   2. o mirrorPush falha (fire-and-forget) → nuvem: linha ainda ATIVA
--   3. ao reconectar, syncOnLogin roda pullAll ANTES de pushAllLocal
--   4. o pull traz a linha ativa e, sem guard de timestamp, zera o excluido_em
--      local → o item RESSUSCITA, e o push seguinte propaga a ressurreição.
-- Não dá para resolver com "exclusão sempre vence": isso tornaria a exclusão um
-- estado absorvente e o "Restaurar" da Lixeira seria desfeito por qualquer
-- aparelho que ainda tivesse a cópia excluída. Sem relógio não há como saber
-- qual das duas intenções é a mais recente. Daí esta migration.
--
-- Backfill com `criado_em` (não com now()): se preenchêssemos com now(), toda
-- linha remota pareceria "recém-editada" e venceria o guard contra qualquer
-- edição local ainda não sincronizada, apagando trabalho offline legítimo.

-- 1) coluna (nullable primeiro, para poder fazer o backfill)
alter table public.clientes    add column if not exists atualizado_em timestamptz;
alter table public.servicos    add column if not exists atualizado_em timestamptz;
alter table public.produtos    add column if not exists atualizado_em timestamptz;
alter table public.modelos     add column if not exists atualizado_em timestamptz;
alter table public.depoimentos add column if not exists atualizado_em timestamptz;
alter table public.recibos     add column if not exists atualizado_em timestamptz;

-- 2) backfill: a linha nunca foi editada depois de criada, então criado_em é a
--    melhor verdade disponível. coalesce cobre linhas antigas sem criado_em.
update public.clientes    set atualizado_em = coalesce(criado_em, now()) where atualizado_em is null;
update public.servicos    set atualizado_em = coalesce(criado_em, now()) where atualizado_em is null;
update public.produtos    set atualizado_em = coalesce(criado_em, now()) where atualizado_em is null;
update public.modelos     set atualizado_em = coalesce(criado_em, now()) where atualizado_em is null;
update public.depoimentos set atualizado_em = coalesce(criado_em, now()) where atualizado_em is null;
update public.recibos     set atualizado_em = coalesce(criado_em, now()) where atualizado_em is null;

-- 3) default + not null (o app sempre manda o valor; o default cobre inserts
--    feitos por fora, ex.: SQL manual ou seed)
alter table public.clientes    alter column atualizado_em set default now();
alter table public.servicos    alter column atualizado_em set default now();
alter table public.produtos    alter column atualizado_em set default now();
alter table public.modelos     alter column atualizado_em set default now();
alter table public.depoimentos alter column atualizado_em set default now();
alter table public.recibos     alter column atualizado_em set default now();

alter table public.clientes    alter column atualizado_em set not null;
alter table public.servicos    alter column atualizado_em set not null;
alter table public.produtos    alter column atualizado_em set not null;
alter table public.modelos     alter column atualizado_em set not null;
alter table public.depoimentos alter column atualizado_em set not null;
alter table public.recibos     alter column atualizado_em set not null;
