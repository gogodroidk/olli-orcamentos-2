-- ============================================================================
-- OLLI — TERMÔMETRO DO ORÇAMENTO: eventos de interação do link /o/<token>
-- ----------------------------------------------------------------------------
-- Frente I2 (Jogada 9 do plano "OLLI inteligente"): o prestador vê, no orçamento,
-- se o cliente abriu o link, quantas vezes, quanto tempo ficou e se voltou ao
-- preço — e o app classifica quente / morno / frio com o porquê, e o follow-up
-- escolhe o texto pelo sinal.
--
-- POR QUE UMA TABELA NOVA (e não a trilha `eventos_orcamento_publico`):
--   a trilha guarda o que tem valor de REGISTRO (abriu no dia, aprovou, recusou,
--   avisou que pagou), com ip_hash e user-agent curto para o dossiê. Esta tabela
--   guarda só MÉTRICA DE INTERAÇÃO, sem nenhum dado de quem está do outro lado:
--   nada de IP (nem hash), nada de user-agent, nada de texto livre.
--
-- O QUE CADA LINHA É (tipo):
--   abertura        a página abriu num navegador que executa JavaScript (o
--                   pré-visualizador do WhatsApp não executa — não conta);
--                   1 por sessão de aba (recarregar a página não conta de novo);
--   tempo           segundos com a página VISÍVEL desde o último envio (soma-se);
--   preco_visto     o total ficou visível por ~1,5 s (a 2ª vez em diante = "voltou
--                   ao preço");
--   clique_aprovar  tocou em "Aprovar" (a resposta em si continua na trilha);
--   clique_pagar    tocou em "Copiar código Pix" ou "Já paguei".
--
-- `sessao` = 16 caracteres hex aleatórios gerados NA ABA do cliente
--   (crypto.getRandomValues) e guardados só no sessionStorage daquela aba. Não
--   identifica pessoa nem aparelho: some quando a aba fecha e serve só para não
--   contar "recarregar a página" como nova abertura.
--
-- QUEM ESCREVE: só o Worker (worker/src/link.js, POST /o/<token>/sinal) via
--   SERVICE_ROLE. O cliente final não tem credencial de banco.
-- QUEM LÊ: só o DONO do link (user_id = auth.uid()). `user_id` e `orcamento_id`
--   são copiados da linha de orcamentos_publicos pelo Worker no momento do evento
--   — a policy fica simples e o Realtime consegue filtrar por dono.
--
-- LGPD:
--   - só métricas de interação, sem PII nova;
--   - FK em token com ON DELETE CASCADE: apagou o link (ou o orçamento/dono, em
--     cascata), os eventos somem junto;
--   - retenção: o app lê só os últimos 60 dias; o Worker apaga o que passou de
--     180 dias (job diário, ver worker/src/link.js `limparEventosAntigos`).
--
-- REALTIME: a tabela entra na publicação `supabase_realtime` para o app avisar
--   "Cliente abriu seu orçamento agora" com o app aberto. O Realtime aplica a
--   policy abaixo com o JWT de quem escuta: cada dono recebe só as linhas dele.
--   Sem esta migration o app segue funcionando: o termômetro diz que não
--   conseguiu ler e o aviso simplesmente não chega.
--
-- IDEMPOTENTE: create ... if not exists; drop policy if exists antes de criar.
-- NÃO APLICAR À MÃO — o integrador revisa e aplica.
-- PERF: dentro de policy, sempre `(select auth.uid())` (InitPlan, 1x por query).
-- ============================================================================

create table if not exists public.orcamento_eventos (
  id            bigint generated always as identity primary key,
  token         text not null
                  references public.orcamentos_publicos (token) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  orcamento_id  text not null,
  tipo          text not null
                  check (tipo in ('abertura', 'tempo', 'preco_visto', 'clique_aprovar', 'clique_pagar')),
  sessao        text check (sessao is null or sessao ~ '^[0-9a-f]{16}$'),
  -- Só em 'tempo': segundos visíveis desde o último envio (teto de 30 min por envio).
  segundos      integer check (segundos is null or (segundos between 0 and 1800)),
  criado_em     timestamptz not null default now()
);

-- Leitura do app: "eventos do dono nos últimos 60 dias" (lista) e "eventos deste
-- orçamento" (detalhe). Ambos começam por user_id.
create index if not exists orcamento_eventos_dono_idx
  on public.orcamento_eventos (user_id, criado_em desc);
create index if not exists orcamento_eventos_orcamento_idx
  on public.orcamento_eventos (user_id, orcamento_id, criado_em desc);
-- Teto anti-abuso do Worker (conta eventos do token na última hora) e cascade.
create index if not exists orcamento_eventos_token_idx
  on public.orcamento_eventos (token, criado_em desc);

alter table public.orcamento_eventos enable row level security;

-- Só SELECT para authenticated (a RLS recorta as linhas). Sem insert/update/delete:
-- o dono não consegue forjar nem apagar sinal; quem grava é o service_role.
grant select on public.orcamento_eventos to authenticated;

drop policy if exists orcamento_eventos_dono_select on public.orcamento_eventos;
create policy orcamento_eventos_dono_select
  on public.orcamento_eventos
  as permissive for select to authenticated
  using (user_id = (select auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orcamento_eventos'
  ) then
    alter publication supabase_realtime add table public.orcamento_eventos;
  end if;
end
$$;

-- ============================================================================
-- CONFERÊNCIA (rodar MANUALMENTE depois de aplicar):
--   -- como service_role, simulando o Worker:
--   insert into public.orcamento_eventos (token,user_id,orcamento_id,tipo,sessao)
--     values ('<token de A>','<A>','<orc de A>','abertura','0123456789abcdef');
--   -- T1: o dono A vê
--   set role authenticated; set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   select tipo from public.orcamento_eventos;                         -- 1 linha
--   -- T2: o dono A NÃO grava (sem policy de insert)
--   insert into public.orcamento_eventos (token,user_id,orcamento_id,tipo)
--     values ('<token de A>','<A>','x','abertura');                   -- ERRO
--   reset role;
--   -- T3: outro usuário B não vê
--   set role authenticated; set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   select count(*) from public.orcamento_eventos;                     -- 0
--   reset role;
--   -- T4: CHECKs
--   insert ... tipo='qualquer'      -> ERRO (check tipo)
--   insert ... sessao='João'        -> ERRO (check sessao)
--   insert ... segundos=99999       -> ERRO (check segundos)
--   -- T5: cascade — apagar o link apaga os eventos.
-- O texto desta migration é travado por scripts/teste-termometro.ts.
-- ============================================================================
