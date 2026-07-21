-- ─────────────────────────────────────────────────────────────────────────────
-- A7 — UNIQUE GLOBAL: DÁ PARA IMPEDIR OUTRO TENANT DE ESCREVER O PRÓPRIO DADO
-- Achado A7 de docs/ENXAME/AUDITORIA_BANCO.md. Idempotente.
-- Aplicar após 20260708_versoes.sql, 20260709_pmoc_fundacao.sql e
-- 20260715_pmoc_fase2.sql. Independente das demais desta leva.
--
-- O PROBLEMA
--   Quatro índices únicos foram criados SEM `user_id` — o espaço de nomes é o
--   banco inteiro, não o tenant. Quem souber o `orcamento_id` de outra conta (um
--   ex-técnico sabe TODOS: o id vem em cada linha que ele sincronizou) insere, no
--   PRÓPRIO tenant, uma linha com aquele `orcamento_id` e `numero_versao = N`.
--   O par fica ocupado GLOBALMENTE e o dono legítimo passa a tomar 23505 ao
--   congelar a versão N do próprio orçamento.
--   Não lê nem escreve dado alheio: IMPEDE o outro de escrever o dele. E, como o
--   push do app engole erro, o dono não vê um alerta — vê uma versão que "não
--   salva" e um painel que não mostra o que ele acabou de fazer.
--
-- A CORREÇÃO: o grão certo é (user_id, …). Trocar o índice só AMPLIA o que é
-- aceito (todo par que era único globalmente continua único dentro do tenant),
-- então a recriação não pode falhar por dado existente e nada precisa ser migrado.
--
-- SEGURANÇA DA TROCA: nenhum `ON CONFLICT` aponta para estes índices — os alvos
-- usados pelo app e pelo painel são `id` ou `user_id` (`ON_CONFLICT` em
-- `cloudSync.ts:65`, `CONFLITO` em `webapp/src/olli/mutacoes.ts`, e
-- `clienteLink.ts:490/501` que versiona por `id`). Nenhuma FK referencia estes
-- índices. Portanto trocá-los não muda o comportamento de nenhuma escrita.
--
-- NOTA OPERACIONAL: `create unique index` sem CONCURRENTLY toma lock de escrita
-- na tabela pelo tempo da construção. Estas tabelas são pequenas hoje (zero
-- pagantes); se um dia não forem, rode CONCURRENTLY FORA de transação.
--
-- ENQUANTO NÃO RODAR: o DoS cross-tenant continua possível. Nada quebra — é o
-- único achado desta leva que não tem vítima até alguém decidir ser hostil.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Versões de orçamento
create unique index if not exists orcamento_versoes_tenant_orc_num_uidx
  on public.orcamento_versoes (user_id, orcamento_id, numero_versao);
drop index if exists public.orcamento_versoes_orc_num_uidx;

-- 2) Versões de contrato de prestação
create unique index if not exists service_contract_versions_tenant_num_uidx
  on public.service_contract_versions (user_id, contract_id, numero_versao);
drop index if exists public.service_contract_versions_num_uidx;

-- 3) Versões de plano PMOC
create unique index if not exists pmoc_plan_versions_tenant_num_uidx
  on public.pmoc_plan_versions (user_id, plan_id, numero_versao);
drop index if exists public.pmoc_plan_versions_num_uidx;

-- 4) Ordens geradas pelo PMOC. A idempotência declarada em 20260715 ("repetir a
--    geração vira no-op em vez de duplicar visita") é preservada — ela passa a
--    valer DENTRO do tenant, que é onde a geração acontece.
create unique index if not exists pmoc_ordens_geradas_tenant_unica
  on public.pmoc_ordens_geradas (user_id, plano_id, asset_id, periodo, periodicidade_id);
drop index if exists public.pmoc_ordens_geradas_unica;
