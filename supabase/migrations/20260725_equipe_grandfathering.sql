-- ─────────────────────────────────────────────────────────────────────────────
-- F0d — GRANDFATHERING do paywall Empresa.  (decisão registrada em 2026-07-17)
--
-- A DECISÃO: as organizações que JÁ EXISTEM quando este paywall entra continuam
-- podendo convidar técnicos. As organizações NOVAS precisam do plano Empresa.
--
-- POR QUÊ (e não "porque é mais legal"):
--   O paywall do Empresa (R$ 99/mês) nunca foi aplicado — `equipe` e `mapa_equipe`
--   eram entitlement do plano desde a Onda 1, e nada checava. Ligar o gate sem
--   ressalva TIRA HOJE um recurso que essas contas usam há meses, e faz isso
--   exatamente às vésperas de pedir dinheiro a elas. Trocar confiança por R$ 99 é
--   um mau negócio quando o produto tem zero pagantes e a tese registrada é
--   "a confiança é o produto".
--
--   E a assimetria decide: NÃO temos como saber com certeza quantas contas reais
--   usam Equipe hoje. Sob incerteza vale a regra da casa — "não sei" não vira
--   "não tem" — e escolhe-se o caminho REVERSÍVEL: se o grandfathering se provar
--   caro, basta um UPDATE virando o flag; um usuário cortado, ao contrário, churna
--   e não volta. O Plano-Mestre aponta a mesma direção: "v1 nasce com Empresa
--   grandfathered/aberto — o LIGAR do paywall é decisão de negócio do dono".
--
--   Não é generosidade eterna: o paywall passa a faturar em cima de QUEM CHEGA,
--   que é onde o crescimento está, sem quebrar quem já está dentro.
--
-- COMO REVOGAR (uma linha, quando o dono quiser):
--   update public.organizacoes set equipe_grandfathered = false;
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.organizacoes
  add column if not exists equipe_grandfathered boolean not null default false;

comment on column public.organizacoes.equipe_grandfathered is
  'F0d: true = org criada ANTES do paywall Empresa; pode usar Equipe/Mapa sem assinar. Default false = org nova precisa do plano Empresa. Revogar em massa: update public.organizacoes set equipe_grandfathered = false;';

-- BACKFILL — o coração do item. Marca como grandfathered TUDO que existe NESTE
-- instante. O `default false` cuida do resto: da migration em diante, org nova
-- nasce precisando pagar. É por isso que o backfill roda uma vez e nunca mais:
-- a fronteira é o momento em que este arquivo é aplicado, não uma data cravada
-- no código (que envelheceria e passaria a liberar quem chegou depois).
update public.organizacoes
   set equipe_grandfathered = true
 where equipe_grandfathered is distinct from true;

-- ── Leitura pelo app/painel ──────────────────────────────────────────────────
-- Nenhuma policy nova: `organizacoes` já tem RLS de SELECT para membros da org
-- (20260707_multitenant.sql), e a coluna vai junto na linha que eles já leem.
-- Ninguém pode ESCREVER esta coluna pelo client — o UPDATE de `organizacoes` é
-- restrito ao dono/admin pelas policies existentes, e o único caminho que decide
-- convite é o worker com service_role. Se um dia isso mudar, esta coluna vira
-- auto-promoção a Empresa: mantenha-a fora de qualquer policy de UPDATE do client.
