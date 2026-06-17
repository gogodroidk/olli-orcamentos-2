-- Exclusões (tombstones) — propagação de DELETE entre aparelhos e o painel.
-- O app é offline-first (SQLite local). O pull da nuvem é só ADITIVO, então sem
-- tombstones um registro deletado num aparelho REAPARECE ao sincronizar. Cada
-- delete local grava aqui (e no SQLite); no login o app baixa estes tombstones e
-- apaga os ids correspondentes, convergindo a exclusão. Projeto "OLLI ORCAMENTOS".
-- NÃO aplicada automaticamente.

create table if not exists public.exclusoes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tabela text not null,                        -- clientes | servicos | produtos | orcamentos | recibos | modelos | depoimentos | agendamentos
  item_id text not null,                       -- id do registro excluído
  excluido_em timestamptz not null default now(),
  primary key (user_id, tabela, item_id)
);

alter table public.exclusoes enable row level security;

-- O prestador (dono) cria/gerencia somente os seus tombstones.
create policy "exclusoes_owner" on public.exclusoes
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists exclusoes_user_id_idx on public.exclusoes(user_id);
