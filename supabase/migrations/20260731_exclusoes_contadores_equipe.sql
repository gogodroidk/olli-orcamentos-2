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
-- ── DEPUTADO CONFUSO: por que o INSERT é restrito POR TABELA ────────────────
--
-- A primeira versão desta migration dizia, aqui, que o INSERT "NÃO concede poder
-- novo a um membro mal-intencionado, porque ele já pode APAGAR as linhas de
-- negócio do dono". A frase está ERRADA, e era ela que segurava a policy aberta.
-- Conferido tabela por tabela no repositório, um membro ATIVO pode apagar 4 das
-- 10 de `DELETABLE_TABLES` (`cloudSync.ts:1149`) — não as 10:
--
--   PODE apagar (policy de DELETE = donos_visiveis):
--     orcamentos       20260707_multitenant.sql:491   orcamentos_membro_delete
--     agendamentos     20260707_multitenant.sql:525   agendamentos_membro_delete
--     ordens_servico   20260710_ordens_servico.sql    ordens_servico_delete
--     equipamentos     20260709_pmoc_fundacao.sql     assets_delete (fábrica de
--                      policies; `equipamentos` é `assets` na nuvem —
--                      `REMOTE_TABLE`, cloudSync.ts:86)
--
--   NÃO pode apagar (escrita reservada ao dono, de propósito):
--     clientes         20260719_clientes_insert_equipe.sql:48  clientes_owner_delete
--                      (o técnico ganhou INSERT naquela migration; UPDATE e
--                      DELETE ficaram com o dono "conservador", texto dela)
--     servicos         20260707_multitenant.sql:419   servicos_owner_write
--     produtos         20260707_multitenant.sql:435   produtos_owner_write
--     recibos          20260707_multitenant.sql:451   recibos_owner_write
--     modelos          20260615160744:54              modelos_owner
--     depoimentos      20260615160744:36              depoimentos_owner
--
-- Sem a lista de tabelas no `with check`, o caminho de destruição era este:
--   1. o técnico insere em `exclusoes` uma linha com `user_id = <dono>` e
--      `tabela = 'recibos'`. A policy aprovava: ela limitava o TENANT e não a
--      TABELA, e `donos_visiveis()` do técnico contém o dono.
--   2. no sync seguinte do DONO, `applyCloudTombstones` (`cloudSync.ts:1185`)
--      lê `exclusoes` sem filtro — e a policy self-only devolve a linha, porque
--      o `user_id` dela É o do dono. Não há coluna de autoria: ele não tem como
--      distinguir o tombstone que criou do que plantaram no tenant dele.
--   3. `localDeleteById` apaga do SQLite do dono e `removeRow` apaga da nuvem
--      COM A SESSÃO DO DONO — que obviamente passa em `recibos_owner_write`.
--
-- Quem executa o DELETE é o dono, autorizado, a mando de uma linha que o técnico
-- plantou. É uma classe NOVA de dano, não "estritamente menos". `recibos` é o
-- pior caso: é o comprovante de pagamento que o cliente final tem na mão.
--
-- A lista abaixo usa os nomes LOCAIS das tabelas, que é o que a coluna guarda:
-- `registrarExclusao` (`database.ts:51-70`) grava o nome local e o repassa a
-- `pushTombstone` sem traduzir — por isso 'equipamentos' e não 'assets'.
--
-- Nada legítimo é bloqueado por esta restrição. Tombstone que o membro grava
-- para SI MESMO continua passando por `exclusoes_owner` (20260624, FOR ALL,
-- self-only), que é permissiva e entra em OR com esta: `pushTombstone` usa o
-- default `user_id = auth.uid()`, então hoje TODO tombstone do app cai lá. A
-- policy desta migration só existe para a mudança futura de `cloudSync.ts`
-- descrita no rodapé — e é exatamente essa mudança que precisa nascer limitada.
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
--
-- DUAS condições, não uma. O tenant diz EM NOME DE QUEM se apaga; a tabela diz
-- O QUE se apaga. Só a primeira era verificada, e a segunda é a que impede o
-- deputado confuso descrito no cabeçalho. A lista é fechada e literal de
-- propósito: `tabela` não tem CHECK nem FK (não há DDL de `public.exclusoes` em
-- supabase/migrations/ — a tabela nasceu fora do versionamento), então esta
-- policy é a ÚNICA validação daquela coluna. Tabela nova que a equipe passe a
-- poder apagar entra aqui de propósito, junto com a policy de DELETE dela.
--
-- A cláusula fica em UMA LINHA de propósito, mesmo comprida:
-- `scripts/teste-isolamento-tenant.ts:192-201` confere POR LINHA que toda
-- `using`/`with check` deste arquivo carrega o grão de tenant, e o próprio teste
-- avisa que uma cláusula quebrada em várias linhas o faz FALHAR (erra para o
-- lado seguro). Quebrar aqui derrubaria o teste sem que nada estivesse errado.
drop policy if exists exclusoes_equipe_insert on public.exclusoes;
create policy exclusoes_equipe_insert
  on public.exclusoes
  as permissive for insert to authenticated
  with check (user_id in (select public.donos_visiveis()) and tabela in ('orcamentos', 'agendamentos', 'ordens_servico', 'equipamentos'));

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

-- O UPDATE fica sem restrição de VALOR, e isso é escolha consciente: o membro
-- pode escrever qualquer `valor` no contador do dono. Como a fusão é `Math.max`
-- e monotônica, o dano máximo é queimar a numeração para a frente (o dono
-- passaria a emitir 999999) — recuperável, e estritamente menor do que apagar
-- os orçamentos dele, que ele já pode. Não dá para limitar aqui sem quebrar o
-- caso legítimo (o técnico PRECISA subir a sequência do dono ao emitir).
-- Registrado, não priorizado.
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
--  3. Quando o item 1 for feito, `pushTombstone` passará a mandar tombstone para
--     o tenant do dono — e a policy acima vai RECUSAR (42501) tudo que não
--     estiver na lista de 4 tabelas. `pushTombstone` engole erro por desenho
--     ("nunca afeta o app local", `database.ts:64-68`), então a recusa será
--     silenciosa. Isso é o comportamento CERTO em segurança e o ERRADO em
--     diagnóstico: quem escrever aquela mudança precisa mandar o tombstone das
--     6 tabelas reservadas para o tenant de QUEM APAGOU (o default `auth.uid()`
--     de hoje), e não para o do dono. Mesma regra da RLS de dados: o técnico não
--     apaga recibo do dono nem direto nem por procuração.
--
-- CONFERÊNCIA (o teste que cobre esta migration precisa incluir o vetor novo):
-- `scripts/teste-isolamento-tenant.ts` já checa que a equipe NÃO ganhou DELETE
-- nem UPDATE em `exclusoes`. O vetor deste arquivo não é DELETE nem UPDATE — é
-- INSERT com `tabela` livre. O teste passa (44 ok) e o buraco existia. Vale
-- acrescentar lá: "membro insere em exclusoes com tabela='recibos' e user_id do
-- dono" deve REPROVAR.
-- ─────────────────────────────────────────────────────────────────────────────
