-- ─────────────────────────────────────────────────────────────────────────────
-- ASSINATURA PELA GOOGLE PLAY (RevenueCat): o VÍNCULO da linha com a loja
--
-- O worker (`POST /revenuecat/webhook`, worker/src/revenuecat.js) grava o plano
-- vendido pela Google Play em `public.assinaturas`, a mesma linha única por usuário
-- que Stripe e Pix usam. Para não derrubar um plano pago por FORA da Play, cada
-- encerramento vindo da loja precisa PROVAR que se refere à assinatura que sustenta
-- a linha — mesmo papel do `mp_preapproval_id` (20260728). Quatro colunas:
--
--   revenuecat_transacao_id  → `original_transaction_id` da assinatura na Play.
--                              EXPIRATION/reembolso só agem se bater com ele.
--   revenuecat_produto_id    → `olli_pro:mensal` etc. (reconciliação e a tela saber
--                              que é assinatura da Play, para mandar gerenciar lá).
--   revenuecat_vigencia_ate  → a vigência que a PRÓPRIA Play deu. Se a linha tem
--                              vigência maior, é outra origem (Stripe/Pix) que
--                              sustenta o plano e a Play sai sem derrubá-lo.
--   revenuecat_evento_em     → `event_timestamp_ms` do último evento aplicado:
--                              evento mais velho (reenvio atrasado) não muda nada.
--
-- Todas opcionais, sem default: as linhas de hoje (Stripe/Pix) ficam com NULL, que
-- significa "nunca foi da Play" — e é assim que o worker as trata.
--
-- ORDEM: aplicar ANTES de cadastrar o webhook no RevenueCat. Sem as colunas o
-- worker não decide às cegas: responde 503 e o RevenueCat reenvia (até 5x).
-- Sem grants novos: o default do schema public já dá SELECT das colunas novas a
-- `authenticated`, e a RLS (`assinatura_select_own`) segue limitando à própria
-- linha. Escrita continua só com service_role.
-- Idempotente: pode rodar de novo sem efeito.
-- ─────────────────────────────────────────────────────────────────────────────

alter table if exists public.assinaturas
  add column if not exists revenuecat_transacao_id text,
  add column if not exists revenuecat_produto_id text,
  add column if not exists revenuecat_vigencia_ate timestamptz,
  add column if not exists revenuecat_evento_em timestamptz;

comment on column public.assinaturas.revenuecat_transacao_id is
  'original_transaction_id da assinatura na Google Play (via RevenueCat). Prova de vinculo: o worker so encerra o plano por EXPIRATION/reembolso quando o evento traz este mesmo id.';
comment on column public.assinaturas.revenuecat_produto_id is
  'Produto da Google Play que concedeu o plano (ex.: olli_pro:mensal). Catalogo em src/services/playBillingRegras.ts.';
comment on column public.assinaturas.revenuecat_vigencia_ate is
  'Vigencia concedida pela propria Google Play. current_period_end maior que isto = plano sustentado por outra origem (Stripe/Pix), que a Play nao derruba.';
comment on column public.assinaturas.revenuecat_evento_em is
  'event_timestamp_ms do ultimo evento do RevenueCat aplicado nesta linha. Evento mais antigo e ignorado (fora de ordem).';

-- Reconciliação manual do dono: "de quem é esta assinatura da Play?"
create index if not exists assinaturas_revenuecat_transacao_idx
  on public.assinaturas (revenuecat_transacao_id) where revenuecat_transacao_id is not null;

-- ── Prova (rodar no SQL editor depois de aplicar) ────────────────────────────
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'assinaturas'
--      and column_name like 'revenuecat_%' order by 1;           -- 4 linhas
--   select count(*) from public.assinaturas
--    where revenuecat_transacao_id is not null;                   -- 0 antes da 1ª venda
