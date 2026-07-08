-- ============================================================================
-- OLLI — Portal do cliente v2: MOTIVO DE RECUSA + TRILHA DE EVENTOS
-- ----------------------------------------------------------------------------
-- Onda 3, frente "Portal do cliente v2 (motivo de recusa + trilha)".
--
-- O QUE ISTO ADICIONA (fecha o começo do ciclo comercial no lado do cliente):
--   1) orcamentos_publicos.motivo_recusa — texto livre do cliente ao recusar
--      (o worker também mantém o mesmo texto em resposta_cliente, por retrocomp.
--      com o app que já lê resposta_cliente).
--   2) eventos_orcamento_publico — TRILHA append-only: cada vez que o cliente
--      ABRE o link (visualizado, com dedupe por dia), APROVA ou RECUSA, grava-se
--      uma linha. Vira a "linha do tempo" do orçamento no painel do dono.
--
-- QUEM ESCREVE: só o Worker do link público (worker/src/link.js), via
--   SERVICE_ROLE (bypassa RLS). O cliente final NÃO tem credencial de banco — o
--   token de 128 bits é a única chave, validada no Worker.
--
-- QUEM LÊ: só o DONO do orçamento (via join token→orcamentos_publicos.user_id).
--   Espelha a policy `orcamentos_publicos_owner` (dono = auth.uid()); é de
--   PROPÓSITO owner-only e NÃO usa donos_visiveis() — a própria tabela
--   orcamentos_publicos ficou owner-only no multi-tenant da Onda 2. Se um dia a
--   equipe precisar ver a trilha, amplia-se aqui e lá juntos.
--
-- LGPD (regra de ouro desta frente):
--   - NUNCA gravamos o IP cru. Só ip_hash = SHA-256(token || ':' || ip) feito no
--     Worker (crypto.subtle). O hash é salgado com o token → não dá para cruzar o
--     mesmo IP entre orçamentos diferentes, e é irreversível. Serve só para o dono
--     distinguir "aberturas de pessoas diferentes" sem expor o IP de ninguém.
--   - user_agent_curto é truncado (<=120 chars) e serve só para "abriu no celular
--     ou no PC" — não é fingerprint.
--   - motivo é o texto que o próprio cliente escreveu para recusar (dado dele,
--     que ELE decidiu enviar) — some junto com o orçamento (ON DELETE CASCADE).
--
-- IDEMPOTÊNCIA: create table/column if not exists, drop policy if exists antes de
--   create policy. Pode rodar N vezes. NÃO aplique à mão — o integrador revisa e
--   aplica via mcp__supabase__apply_migration e roda os testes do fim do arquivo.
--
-- PADRÃO DE PERF (herdado das migrations anteriores): dentro de policy sempre
--   `(select auth.uid())` (InitPlan, avaliado 1x por query), nunca `auth.uid()` cru.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1) COLUNA motivo_recusa EM orcamentos_publicos
--    Texto livre do cliente ao recusar. Opcional (recusa sem motivo continua
--    válida). O worker preenche resposta_cliente E motivo_recusa com o mesmo
--    texto na recusa (resposta_cliente é a coluna que o app já sincroniza).
-- ────────────────────────────────────────────────────────────────────────────
alter table public.orcamentos_publicos
  add column if not exists motivo_recusa text;


-- ────────────────────────────────────────────────────────────────────────────
-- 2) TABELA DA TRILHA — eventos_orcamento_publico (append-only)
--    Uma linha por evento relevante do link do cliente. FK em token → quando o
--    link é apagado (ou o orçamento/dono é apagado em cascata), a trilha some
--    junto (LGPD: dado do cliente não sobrevive ao orçamento que o originou).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.eventos_orcamento_publico (
  id                bigint generated always as identity primary key,
  token             text not null
                      references public.orcamentos_publicos (token) on delete cascade,
  evento            text not null check (evento in ('visualizado', 'aprovado', 'recusado')),
  -- Só faz sentido em 'recusado' (motivo do cliente); nulo nos demais.
  motivo            text,
  -- SHA-256(token || ':' || ip) calculado no Worker. NUNCA o IP cru (LGPD).
  -- Nulo quando o Worker não teve o IP (ex.: header ausente) — degrada seguro.
  ip_hash           text,
  -- User-Agent truncado no Worker (<=120 chars). Só p/ "celular x PC", não é
  -- fingerprint. Nulo quando ausente.
  user_agent_curto  text,
  criado_em         timestamptz not null default now()
);

-- Leitura do painel E dedupe de 'visualizado': "eventos deste token, mais recentes
-- primeiro". O worker faz o dedupe com um range (criado_em >= início do dia UTC)
-- filtrado por token+evento — este índice (token, criado_em desc) já cobre esse
-- EXISTS. (Um índice funcional em (criado_em::date) seria rejeitado: o cast
-- timestamptz→date é STABLE, não IMMUTABLE, e o Postgres não indexa expressão
-- não-imutável — 42P17. Além de desnecessário aqui, já que a consulta é por range.)
create index if not exists eventos_orc_publico_token_idx
  on public.eventos_orcamento_publico (token, criado_em desc);


-- ────────────────────────────────────────────────────────────────────────────
-- 3) RLS — leitura SÓ do dono; escrita SÓ via service_role (worker)
--    A tabela tem RLS ligada e NENHUMA policy de INSERT/UPDATE/DELETE para
--    `authenticated`/`anon`: assim o cliente (anon) e qualquer usuário logado
--    não conseguem forjar/adulterar a trilha. O Worker escreve com SERVICE_ROLE,
--    que bypassa RLS (não precisa de policy). SELECT é liberado só ao dono do
--    orçamento, resolvido por join token → orcamentos_publicos.user_id.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.eventos_orcamento_publico enable row level security;

-- Concede os privilégios de tabela ao role authenticated (a RLS abaixo é quem
-- realmente restringe as LINHAS). Sem grant de SELECT, nem a policy adianta.
-- NÃO concedemos insert/update/delete a authenticated: a trilha é imutável para
-- todo mundo que não seja o service_role.
grant select on public.eventos_orcamento_publico to authenticated;

-- SELECT: o dono do orçamento (dono do token) vê a trilha dele. O EXISTS abaixo
-- só enxerga a linha de orcamentos_publicos cujo user_id = auth.uid() PORQUE a
-- própria RLS de orcamentos_publicos (policy orcamentos_publicos_owner) filtra
-- por user_id — mas policies não "empilham" automaticamente em subqueries, então
-- comparamos o user_id explicitamente aqui para garantir o recorte por dono.
drop policy if exists eventos_orc_publico_dono_select on public.eventos_orcamento_publico;
create policy eventos_orc_publico_dono_select
  on public.eventos_orcamento_publico
  as permissive for select to authenticated
  using (
    exists (
      select 1
      from public.orcamentos_publicos op
      where op.token = eventos_orcamento_publico.token
        and op.user_id = (select auth.uid())
    )
  );
-- (sem policy de INSERT/UPDATE/DELETE p/ authenticated → trilha é append-only e
--  imutável para o cliente e para qualquer usuário; só o worker/service_role grava.)


-- ============================================================================
-- 4) TESTES SQL (rodar MANUALMENTE — o integrador executa após aplicar).
-- ----------------------------------------------------------------------------
-- Objetivo: provar (a) que o dono vê a trilha do próprio orçamento; (b) que
-- outro usuário NÃO vê; (c) que a coluna motivo_recusa aceita o texto; (d) que o
-- dedupe de 'visualizado' por dia funciona no nível do índice/consulta que o
-- worker faz.
--
-- Preparação (como service_role / owner, RLS OFF — simula o que o Worker faz):
--   -- dono A e um orçamento público dele:
--   -- insert into public.orcamentos_publicos (token,user_id,orcamento_id,dados,status)
--   --   values ('tok-trilha-teste','<A>','orc-1','{}'::jsonb,'enviado');
--   -- eventos que o worker gravaria:
--   -- insert into public.eventos_orcamento_publico (token,evento,ip_hash,user_agent_curto)
--   --   values ('tok-trilha-teste','visualizado','deadbeef','Mozilla/5.0 (iPhone)');
--   -- insert into public.eventos_orcamento_publico (token,evento,motivo)
--   --   values ('tok-trilha-teste','recusado','Achei caro, vou pensar.');
--   -- update public.orcamentos_publicos
--   --   set status='recusado', resposta_cliente='Achei caro, vou pensar.',
--   --       motivo_recusa='Achei caro, vou pensar.', respondido_em=now()
--   --   where token='tok-trilha-teste';
--
-- ── T1: o DONO A vê a trilha do próprio orçamento ──────────────────────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   select evento, motivo, ip_hash from public.eventos_orcamento_publico
--     where token = 'tok-trilha-teste' order by criado_em;   -- deve retornar 2 linhas
--   select motivo_recusa from public.orcamentos_publicos
--     where token = 'tok-trilha-teste';                       -- 'Achei caro, vou pensar.'
--   reset role;
--
-- ── T2: outro usuário B NÃO vê a trilha de A (zero vazamento) ──────────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   select count(*) from public.eventos_orcamento_publico
--     where token = 'tok-trilha-teste';                       -- deve ser 0
--   reset role;
--
-- ── T3: nem o dono nem B conseguem FORJAR/EDITAR a trilha (append-only p/ user)
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   -- INSERT deve FALHAR (sem policy de insert p/ authenticated):
--   insert into public.eventos_orcamento_publico (token,evento) values ('tok-trilha-teste','aprovado');
--   -- UPDATE deve afetar 0 linhas / falhar (sem policy de update):
--   update public.eventos_orcamento_publico set motivo='hack' where token='tok-trilha-teste';
--   -- DELETE deve afetar 0 linhas / falhar (sem policy de delete):
--   delete from public.eventos_orcamento_publico where token='tok-trilha-teste';
--   reset role;
--
-- ── T4: dedupe de 'visualizado' por dia (a consulta que o worker faz) ──────
--   -- o worker, antes de inserir 'visualizado', roda um EXISTS equivalente a:
--   --   select 1 from public.eventos_orcamento_publico
--   --     where token = 'tok-trilha-teste' and evento='visualizado'
--   --       and criado_em >= date_trunc('day', now());
--   -- se retornar linha, NÃO insere de novo hoje. Confirme que uma 2a "abertura"
--   -- no mesmo dia não cria 2a linha de 'visualizado'.
--
-- ── T5: CASCADE — apagar o link apaga a trilha (LGPD) ──────────────────────
--   -- delete from public.orcamentos_publicos where token='tok-trilha-teste';
--   -- select count(*) from public.eventos_orcamento_publico
--   --   where token='tok-trilha-teste';                       -- 0 (FK on delete cascade)
-- ============================================================================
