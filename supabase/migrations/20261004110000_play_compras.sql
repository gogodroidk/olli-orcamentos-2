-- Compras da Google Play (Play Billing DIRETO, sem RevenueCat) — decisão C4.
--
-- Uma linha por purchaseToken. Quem escreve é SÓ o worker (service_role), depois
-- de consultar a Google Play Developer API (worker/src/play.js). O plano em si
-- continua em public.assinaturas (colunas revenuecat_*, que o app e o painel já
-- leem); esta tabela guarda o que o plano não tem lugar para guardar:
--
--  - purchase_token CRU: necessário para reconciliar (subscriptionsv2.get) e para
--    CANCELAR a renovação quando a conta é excluída. É credencial de consulta da
--    compra — por isso a tabela não tem policy nenhuma e anon/authenticated não
--    têm GRANT: nem o próprio dono lê o token pelo PostgREST.
--  - token_sha256 com índice ÚNICO: a trava anti-replay. O mesmo token não fica
--    ligado a duas contas (o worker responde 409 compra_de_outra_conta).
--  - user_id imutável (trigger): uma compra nunca é transferida de conta.
--
-- ON DELETE CASCADE no user_id: a exclusão de conta cancela a renovação na Play
-- ANTES (conta.js → cancelarPlayDoUsuario) e então as linhas saem junto. Uma
-- conta nova não consegue reaproveitar um token antigo de quem saiu: o
-- obfuscatedExternalAccountId da compra é o hash do id ANTIGO, e o worker exige
-- igualdade com o hash do usuário do JWT.

create table if not exists public.play_compras (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null references auth.users (id) on delete cascade,
  -- SHA-256 (hex minúsculo) do purchase_token: chave de busca e de vínculo
  -- (também gravado em assinaturas.revenuecat_transacao_id como prova de vínculo).
  token_sha256        text not null check (token_sha256 ~ '^[0-9a-f]{64}$'),
  purchase_token      text not null check (pg_catalog.length(purchase_token) between 20 and 4096),
  -- Id lógico do catálogo único (src/services/playBillingRegras.ts): olli_pro:mensal…
  produto_id          text not null check (produto_id ~ '^[a-z0-9_.]{1,40}:[a-z0-9-]{1,63}$'),
  -- subscriptionState da Play (SUBSCRIPTION_STATE_*) ou TOKEN_INDISPONIVEL (a Play
  -- já não devolve o token e a vigência já tinha passado).
  estado              text not null check (estado ~ '^(SUBSCRIPTION_STATE_[A-Z_]+|TOKEN_INDISPONIVEL)$'),
  expiry              timestamptz,
  linked_token_sha256 text check (linked_token_sha256 is null or linked_token_sha256 ~ '^[0-9a-f]{64}$'),
  -- Pedido GPA.xxxx sem o sufixo de renovação (..N), para auditoria e suporte.
  order_id_base       text check (order_id_base is null or pg_catalog.length(order_id_base) <= 128),
  -- acknowledge feito? (sem ack em 3 dias a Play estorna sozinha)
  ack                 boolean not null default false,
  -- compra de licença de teste (testPurchase): não é receita; o funil ignora.
  teste               boolean not null default false,
  auto_renovacao      boolean,
  verificado_em       timestamptz,
  criado_em           timestamptz not null default pg_catalog.now(),
  atualizado_em       timestamptz not null default pg_catalog.now()
);

create unique index if not exists play_compras_token_sha256_key
  on public.play_compras (token_sha256);

create index if not exists play_compras_user_idx
  on public.play_compras (user_id);

-- Reconciliação (worker/src/play.js): relê quem vence em <= 48 h, está em estado
-- sensível ou sem ack — sempre pela leitura mais antiga primeiro.
create index if not exists play_compras_reconciliar_idx
  on public.play_compras (verificado_em nulls first)
  where estado not in ('SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', 'TOKEN_INDISPONIVEL');

comment on table public.play_compras is
  'Compras de assinatura da Google Play (Play Billing direto). Escrita só pelo worker (service_role). Token cru: só para reconciliar e cancelar na exclusão de conta.';
comment on column public.play_compras.token_sha256 is
  'SHA-256 hex do purchaseToken. ÚNICO: anti-replay (token não fica em duas contas).';

-- ─── user_id imutável: compra da Play nunca muda de conta ───────────────────
create or replace function public.play_compras_dono_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'play_compras_dono_imutavel';
  end if;
  if new.token_sha256 is distinct from old.token_sha256
     or new.purchase_token is distinct from old.purchase_token then
    raise exception 'play_compras_token_imutavel';
  end if;
  return new;
end;
$$;

revoke all on function public.play_compras_dono_imutavel() from public, anon, authenticated;

drop trigger if exists play_compras_dono_imutavel on public.play_compras;
create trigger play_compras_dono_imutavel
  before update on public.play_compras
  for each row execute function public.play_compras_dono_imutavel();

-- ─── acesso: RLS ligado, NENHUMA policy, nada para anon/authenticated ───────
alter table public.play_compras enable row level security;
alter table public.play_compras force row level security;

revoke all on table public.play_compras from public, anon, authenticated;
grant select, insert, update, delete on table public.play_compras to service_role;
