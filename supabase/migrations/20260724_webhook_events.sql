-- ─────────────────────────────────────────────────────────────────────────────
-- webhook_events — idempotência GLOBAL e trilha de auditoria dos webhooks
-- de pagamento (Stripe + Mercado Pago).  Item O2-17.
--
-- POR QUE (o que existe hoje e o que falta):
--   O `stripe.js` deduplica eventos num `Map` de memória do isolate
--   (`EVENTOS_PROCESSADOS`). O próprio comentário lá já é honesto: "não substitui
--   idempotência real (é por isolate, não global)". Cada isolate do Worker tem o
--   SEU Map, o isolate morre a qualquer momento, e a Stripe reenvia evento por
--   dias. Ou seja: hoje a proteção contra reprocessamento é acidental.
--
--   Ela não é catastrófica AINDA porque os handlers atuais são idempotentes por
--   outros meios: assinatura é upsert por `user_id` (reprocessar reescreve o mesmo
--   estado) e crédito passa por `credit_ledger`, que tem índice único
--   `(origem, ref)`. Esta tabela existe para que a próxima rota — a que alguém
--   escrever com um UPDATE incremental — não descubra isso do jeito caro.
--
-- REGRA: persistir ANTES de processar. O insert é a reivindicação do evento; quem
-- tomar o 409 sabe que outro isolate já pegou, e responde 200 sem reprocessar.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.webhook_events (
  id            bigint generated always as identity primary key,
  -- 'stripe' | 'mercadopago' (texto livre: gateway novo não exige migration)
  origem        text        not null,
  -- id do evento NO GATEWAY (evt_… da Stripe, id da notificação do MP).
  event_id      text        not null,
  tipo          text,
  -- Estado do processamento. 'recebido' é gravado ANTES de processar.
  status        text        not null default 'recebido'
                check (status in ('recebido', 'processado', 'falhou')),
  tentativas    integer     not null default 1,
  erro          text,
  -- Corpo do evento, para auditoria/replay. Sem cartão: o gateway não manda PAN.
  payload       jsonb,
  recebido_em   timestamptz not null default now(),
  processado_em timestamptz
);

-- O CORAÇÃO DO ITEM: (origem, event_id) único. É este índice — e não código de
-- aplicação — que torna o reenvio inofensivo, valendo entre isolates, entre
-- deploys e entre regiões. O insert duplicado vira 409 no PostgREST, que o worker
-- lê como "já reivindicado".
create unique index if not exists webhook_events_origem_event_id_uidx
  on public.webhook_events (origem, event_id);

-- Varredura operacional: "o que falhou nas últimas 24h?"
create index if not exists webhook_events_status_recebido_em_idx
  on public.webhook_events (status, recebido_em desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Ninguém, exceto o service_role (que ignora RLS por definição), enxerga isto.
-- É trilha financeira: não pertence a nenhum tenant e não vai para o app.
-- Sem policy alguma + RLS ligada = negado para anon e authenticated.
alter table public.webhook_events enable row level security;

comment on table public.webhook_events is
  'Idempotencia global e auditoria de webhooks de pagamento (Stripe/MP). Escrita so pelo worker via service_role; RLS sem policy = invisivel para anon/authenticated. O unique (origem,event_id) e a protecao real contra reprocessamento — o Map em memoria do isolate nao vale entre isolates. Item O2-17.';
