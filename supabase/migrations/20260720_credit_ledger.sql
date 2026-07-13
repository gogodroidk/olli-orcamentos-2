-- CRÉDITOS OLLI — ledger imutável (F2 da estratégia, docs/ESTRATEGIA_SUPERIOR.md).
-- Saldo único consumido por ação (voz IA, WhatsApp, review, consulta CNPJ...) e
-- recarregado por PIX/Stripe/IAP. Fonte da verdade do saldo = SUM(delta) desta tabela.
--
-- REGRA DE SEGURANÇA (a mais importante): o USUÁRIO NUNCA ESCREVE no ledger —
-- senão ele se concederia créditos de graça. Só o WORKER (service_role, que ignora
-- RLS) grava, e só APÓS confirmação do gateway (nunca crédito otimista). O app
-- apenas LÊ o próprio saldo/extrato. Mesmo espírito do feedback (20260717): sem
-- policy de INSERT para papéis públicos.
--
-- Idempotência: (origem, ref) é ÚNICO — o mesmo evento Stripe / txid Pix / evento
-- IAP nunca credita duas vezes (o webhook pode reenviar). NÃO aplicada ainda —
-- o integrador revisa e aplica via mcp__supabase__apply_migration. Idempotente.

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- + concessão (compra/bônus) · − consumo. Em CRÉDITOS inteiros (o peso por ação
  -- vive no worker: voz=1, WhatsApp marketing=5, review=3... ver ESTRATEGIA).
  delta integer not null,
  origem text not null check (origem in ('stripe','pix','iap','promo','referral','mesada','consumo','ajuste')),
  -- id externo (evento Stripe, txid Pix, id da ação consumida) — chave de idempotência.
  ref text,
  descricao text not null default '',
  criado_em timestamptz not null default now()
);

-- Extrato do usuário (mais novo primeiro) e cálculo de saldo por usuário.
create index if not exists credit_ledger_user_criado_idx on public.credit_ledger (user_id, criado_em desc);
-- Idempotência forte: uma concessão por (origem, ref). Parcial: consumos podem
-- não ter ref (ou têm o id da ação, que também é único).
create unique index if not exists credit_ledger_origem_ref_uidx
  on public.credit_ledger (origem, ref) where ref is not null;

alter table public.credit_ledger enable row level security;

-- LEITURA: o usuário vê o PRÓPRIO extrato (para exibir saldo/histórico). Nenhuma
-- policy de INSERT/UPDATE/DELETE para authenticated → escrita só via service_role
-- (o worker). Append-only por desenho: não há caminho de UPDATE/DELETE.
drop policy if exists credit_ledger_select_own on public.credit_ledger;
create policy credit_ledger_select_own on public.credit_ledger
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.credit_ledger to authenticated;

-- Saldo do próprio usuário (o app chama para exibir). SECURITY INVOKER: a policy de
-- SELECT do ledger já restringe o usuário às PRÓPRIAS linhas, então NÃO precisa de
-- DEFINER — e DEFINER chamável por authenticated é surfacie de privilégio (advisor
-- `authenticated_security_definer_function_executable`). STABLE (não escreve).
create or replace function public.meu_saldo_creditos()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(delta), 0)::integer
  from public.credit_ledger
  where user_id = (select auth.uid());
$$;

revoke all on function public.meu_saldo_creditos() from public, anon;
grant execute on function public.meu_saldo_creditos() to authenticated;

-- Saldo de um usuário QUALQUER — para o WORKER (service_role) checar antes de
-- consumir/liberar uma ação paga. NÃO exposta a papéis públicos (um usuário não
-- pode consultar o saldo de outro): execute só para service_role.
create or replace function public.saldo_creditos(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(delta), 0)::integer
  from public.credit_ledger
  where user_id = p_user;
$$;

revoke all on function public.saldo_creditos(uuid) from public, anon, authenticated;
grant execute on function public.saldo_creditos(uuid) to service_role;

-- ============================================================================
-- TESTES (rodar MANUALMENTE — o integrador executa; 1 JWT).
--   set role authenticated; set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   -- usuário NÃO consegue se creditar (sem policy de insert):
--   insert into public.credit_ledger (user_id, delta, origem) values ('<A>', 100, 'promo'); -- FALHA (42501)
--   reset role;
--   -- service_role concede (fora de RLS) e o usuário vê o saldo:
--   insert into public.credit_ledger (user_id, delta, origem, ref, descricao)
--     values ('<A>', 100, 'pix', 'txid-teste-1', 'Recarga 100'); -- OK (service_role)
--   -- idempotência: repetir o mesmo (origem, ref) FALHA (unique):
--   insert into public.credit_ledger (user_id, delta, origem, ref) values ('<A>', 100, 'pix', 'txid-teste-1'); -- FALHA
--   set role authenticated; set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   select public.meu_saldo_creditos(); -- 100
--   reset role;
-- ============================================================================
