-- ─────────────────────────────────────────────────────────────────────────────
-- A3 + A4 — DUAS TABELAS `self-only` QUE PARTICIPAM DE FLUXO COMPARTILHADO
-- Achados A3 e A4 de docs/ENXAME/AUDITORIA_BANCO.md. Idempotente.
-- Aplicar após 20260707_multitenant.sql (precisa de `public.donos_visiveis()`),
-- 20260615160744 e 20260624000000. Independente das demais desta leva.
--
-- ORDEM OBRIGATÓRIA: esta migration vem ANTES da mudança correspondente no app
-- (`src/services/cloudSync.ts`). O contrário quebraria calado: o app passaria a
-- gravar tombstone/contador no tenant do dono, a RLS recusaria (42501) e
-- `pushTombstone`/`syncContadores` ENGOLEM erro por desenho ("nunca afeta o app
-- local"). Banco primeiro, app depois — é a única ordem que não perde dado.
--
-- ── A3: exclusão definitiva RESSUSCITA ──────────────────────────────────────
-- `exclusoes` guarda os tombstones e é self-only (`exclusoes_owner`, 20260624).
-- Só que DELETABLE_TABLES (`cloudSync.ts:1149`) é toda COMPARTILHADA: clientes,
-- orcamentos, agendamentos, ordens_servico, equipamentos.
--   1. O dono A usa "Excluir definitivamente" num cliente. Nasce tombstone com
--      `user_id = A` (default auth.uid()) e a linha some da nuvem.
--   2. `applyCloudTombstones` (`cloudSync.ts:1188`) lê SEM filtro, confiando na
--      RLS — que devolve ao técnico B só os tombstones DELE. B nunca vê o de A.
--   3. `localDeleteById` não roda no aparelho de B; a cópia local sobrevive.
--   4. No `pushAllLocal` seguinte, B reenvia a linha com `user_id = A` (override
--      de TABELAS_TENANT_EQUIPE) e `clientes_membro_insert` APROVA.
-- O cliente que o dono apagou de vez VOLTA — e volta no tenant do dono.
--
-- ── A4: numeração duplicada dentro do MESMO tenant ──────────────────────────
-- `contadores` é self-only e `syncContadores` (`cloudSync.ts:1295`) também lê sem
-- filtro. Cada membro mantém a PRÓPRIA sequência enquanto os documentos que eles
-- emitem nascem todos no tenant do dono: o dono e dois técnicos emitem, cada um,
-- o "00426". Não é corrida rara de dois aparelhos offline — com equipe é ROTINA.
--
-- ── O QUE MUDA AQUI ─────────────────────────────────────────────────────────
-- Policies PERMISSIVAS NOVAS (OR com as existentes; nada é revogado): o conjunto
-- visível/gravável passa de `self` para `donos_visiveis()` — o mesmo grão que
-- clientes/orcamentos/agendamentos já usam. Membro desligado sai de
-- `donos_visiveis()` no mesmo instante, como no resto do modelo.
--
-- Isto NÃO concede poder novo a um membro mal-intencionado: ele já pode APAGAR as
-- linhas de negócio do dono (as policies de DELETE de clientes/orcamentos/… são
-- `donos_visiveis()` desde 20260707). Plantar um tombstone é estritamente menos
-- do que já dá para fazer.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── A3 · exclusoes ──────────────────────────────────────────────────────────
-- SELECT: o membro passa a ENXERGAR o tombstone do dono → applyCloudTombstones
-- apaga localmente e a exclusão definitiva para de ressuscitar. Este pedaço já
-- vale sozinho, sem tocar no app.
drop policy if exists exclusoes_equipe_select on public.exclusoes;
create policy exclusoes_equipe_select
  on public.exclusoes
  as permissive for select to authenticated
  using (user_id in (select public.donos_visiveis()));

-- INSERT: habilita o sentido INVERSO (o técnico apaga em definitivo e o dono
-- precisa ficar sabendo), gravando o tombstone no tenant do dono. Sem esta
-- policy a metade do app não tem como pousar. `pushTombstone` faz
-- `upsert(..., ignoreDuplicates: true)` = INSERT ... ON CONFLICT DO NOTHING,
-- então INSERT basta — UPDATE/DELETE seguem self-only de propósito: ninguém
-- deve poder REMOVER o tombstone do dono e ressuscitar o registro por essa via.
drop policy if exists exclusoes_equipe_insert on public.exclusoes;
create policy exclusoes_equipe_insert
  on public.exclusoes
  as permissive for insert to authenticated
  with check (user_id in (select public.donos_visiveis()));

-- ── A4 · contadores ─────────────────────────────────────────────────────────
-- SELECT: o membro passa a ver o contador do dono e `syncContadores` (que já
-- funde por Math.max) sobe a sequência dele acima da do dono. Também vale
-- sozinho — reduz a colisão imediatamente, no sentido mais comum (técnico
-- emitindo por cima do número do patrão).
drop policy if exists contadores_equipe_select on public.contadores;
create policy contadores_equipe_select
  on public.contadores
  as permissive for select to authenticated
  using (user_id in (select public.donos_visiveis()));

-- INSERT + UPDATE: o upsert `onConflict: 'user_id,chave'` vira
-- INSERT ... ON CONFLICT DO UPDATE — precisa das DUAS. Habilita a metade do app
-- que fecha A4 de vez: UM contador por TENANT, gravado no tenant do dono, em vez
-- de um por pessoa.
drop policy if exists contadores_equipe_insert on public.contadores;
create policy contadores_equipe_insert
  on public.contadores
  as permissive for insert to authenticated
  with check (user_id in (select public.donos_visiveis()));

drop policy if exists contadores_equipe_update on public.contadores;
create policy contadores_equipe_update
  on public.contadores
  as permissive for update to authenticated
  using (user_id in (select public.donos_visiveis()))
  with check (user_id in (select public.donos_visiveis()));

-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE ESTA MIGRATION **NÃO** RESOLVE (fica para a leva do app — src/):
--  1. `pushTombstone` (cloudSync.ts:795) e o upsert de `syncContadores`
--     (cloudSync.ts:1315) precisam passar a gravar com `user_id = ownerUserId`
--     quando `decidirEscritaEquipe` disser que sou membro — hoje o default
--     `auth.uid()` carimba a pessoa, não o tenant.
--  2. `20260727_numero_unico_por_tenant.sql.pendente` CONTINUA não-aplicável.
--     O pré-requisito declarado no cabeçalho dela (ensinar o push a renumerar no
--     23505, já que `mirrorPush` engole erro) segue não cumprido —
--     `cloudSync.ts:699` não trata 23505. E, por A4, o pré-requisito estava
--     INCOMPLETO: faltava compartilhar `contadores`, que é o item 1 acima.
--     Aplicá-la antes disso troca número duplicado (visível) por documento que
--     nunca aparece no painel (silencioso). NÃO aplicar.
-- ─────────────────────────────────────────────────────────────────────────────
