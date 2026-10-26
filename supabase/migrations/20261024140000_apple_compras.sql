-- Compras da App Store (StoreKit 2) — Fase 1 do iOS (R0011). NÃO APLICADA: só com ordem do Igor.
-- Uma linha por originalTransactionId (a cadeia de renovações de uma assinatura). Escreve SÓ o worker (service_role)
-- depois de VERIFICAR o JWS da Apple (worker/src/appleJws.js). O plano mora em public.assinaturas (colunas revenuecat_*,
-- vínculo `apple:<sha256 do originalTransactionId>`); esta tabela guarda o que o plano não tem onde guardar e dá a trava
-- anti-replay: o mesmo originalTransactionId nunca fica ligado a duas contas (PK + user_id imutável).
-- Sem policy e sem GRANT para anon/authenticated: nem o dono lê pelo PostgREST. Exclusão de conta leva as linhas (CASCADE).
begin;

create table if not exists public.apple_compras (
  original_transaction_id text primary key check (original_transaction_id ~ '^[0-9]{1,30}$'),
  user_id        uuid not null references auth.users (id) on delete cascade,
  produto_id     text not null check (produto_id ~ '^[a-z0-9_.]{1,40}:[a-z0-9-]{1,63}$'),
  ambiente       text not null check (ambiente in ('Production', 'Sandbox')),
  estado         text not null check (estado in ('ativa', 'encerrada', 'registrada')),
  expiry         timestamptz,
  evento_em      timestamptz,
  criado_em      timestamptz not null default pg_catalog.now(),
  atualizado_em  timestamptz not null default pg_catalog.now()
);

create index if not exists apple_compras_user_idx on public.apple_compras (user_id);

alter table public.apple_compras enable row level security;
revoke all on public.apple_compras from public, anon, authenticated;

comment on table public.apple_compras is
  'Compras da App Store (StoreKit 2). Escrita só pelo worker (service_role) após verificar o JWS da Apple. user_id imutável; sem acesso de anon/authenticated.';

create or replace function public.apple_compras_dono_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'apple_compras_dono_imutavel';
  end if;
  return new;
end;
$$;

drop trigger if exists apple_compras_dono_imutavel on public.apple_compras;
create trigger apple_compras_dono_imutavel
  before update on public.apple_compras
  for each row execute function public.apple_compras_dono_imutavel();

commit;
