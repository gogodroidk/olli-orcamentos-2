-- ─────────────────────────────────────────────────────────────────────────────
-- COTA GRÁTIS DE IA CONTADA NO SERVIDOR (fecha o vazamento do "opt-in do cliente")
--
-- O QUE ERA: os 3 usos/mês de IA do plano Grátis (IA_USOS_GRATIS_MES em
-- src/services/planos.ts) eram contados em AsyncStorage, no aparelho. Duas
-- consequências, as duas ruins:
--   1. desinstalar/reinstalar o app zerava a cota — 3 usos por reinstalação;
--   2. pior, o worker nem consultava cota nenhuma: ele só cobrava crédito quando o
--      CLIENTE mandava `confirmarCredito:true`. Quem simplesmente não mandasse o
--      campo usava o Gemini (conta do dono) de graça e sem limite. Autorização é
--      decisão de servidor: o cliente pode PEDIR, nunca CONCEDER.
--
-- ESTE ARQUIVO dá ao worker onde contar. Mesmo desenho do credit_ledger (20260720):
-- append-only, escrito só pelo service_role, lido pelo dono da linha, com índice
-- único fazendo a idempotência de retry.
--
-- E dá a ela um PRAZO, que é a outra metade da mesma regra. A chave de
-- idempotência (`ref`) chega como `creditoRef`, string escolhida pelo CLIENTE.
-- Idempotência sem prazo transforma essa string num passe livre: fixe `ref='X'`
-- e toda chamada depois da primeira volta "já contada" / "já lançada" — IA
-- ilimitada na conta do dono. As duas coisas que este arquivo cria existem para
-- fechar isso nas duas camadas:
--   • consumir_cota_ia        → a cota grátis, com janela de 10 min
--   • ref_cobranca_ia_recente → o crédito, com a MESMA janela de 10 min
-- Idempotência absorve RETRY (segundos); replay de mês inteiro não é retry.
--
-- COMPATÍVEL COM O DEPLOY ANTES DA APLICAÇÃO: enquanto esta migration não roda, a
-- RPC abaixo não existe, o worker recebe 404 e trata como 'indisponivel' → LIBERA a
-- IA (fail-open, comportamento de hoje). A regra passa a valer sozinha no momento em
-- que o dono aplicar isto — sem redeploy do worker e sem janela de usuário travado.
-- Idempotente: pode rodar de novo sem efeito.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.ia_uso_gratis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- competência 'YYYY-MM' em UTC, carimbada pelo próprio banco (o relógio do
  -- aparelho não decide cota — ver consumir_cota_ia abaixo).
  periodo text not null,
  -- qual IA consumiu o uso. Hoje só 'voz_ia'; a coluna existe para a próxima
  -- ação paga não precisar de outra tabela.
  acao text not null default 'voz_ia',
  -- chave de idempotência da AÇÃO (o mesmo `ref` usado no credit_ledger): um
  -- retry de rede da mesma transcrição não pode queimar um segundo uso grátis.
  -- ATENÇÃO: é string escolhida pelo CLIENTE (chega como `creditoRef` no corpo
  -- de /voz, /transcrever e /voz/conversa). Serve de CHAVE, nunca de
  -- autorização — por isso ela só vale dentro de uma janela (ver JANELA abaixo).
  ref text,
  -- Início da janela de idempotência a que esta linha pertence (bucket alinhado,
  -- do mesmo tamanho da janela). Existe por um motivo só, e é de segurança: sem
  -- ela a chave única seria (user_id, acao, ref) para sempre, o
  -- `insert ... on conflict do nothing` lá embaixo viraria no-op eterno para um
  -- `ref` repetido, a contagem do mês NUNCA subiria e o mesmo `ref` renderia
  -- cota infinita. Com ela, cada janela nova aceita uma linha nova — e é a
  -- contagem mensal que volta a ser o teto.
  janela timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

-- Idempotente de verdade: se a tabela já existia da versão anterior deste
-- arquivo (sem `janela`), acrescenta a coluna em vez de ignorar em silêncio.
alter table public.ia_uso_gratis add column if not exists janela timestamptz not null default now();

-- Contagem do mês (o filtro que a RPC faz a cada chamada).
create index if not exists ia_uso_gratis_user_periodo_idx
  on public.ia_uso_gratis (user_id, periodo, acao);

-- Idempotência forte por ação DENTRO DA JANELA. Parcial (só quando há ref) pelo
-- mesmo motivo do credit_ledger: um consumo sem ref é um uso legítimo distinto,
-- não um duplicado. O `janela` na chave é o que impede a versão eterna disto
-- (ver o comentário da coluna). O prefixo (user_id, acao, ref) continua servindo
-- ao `exists` da RPC, que procura por ref sem saber a janela.
drop index if exists public.ia_uso_gratis_ref_uidx;
create unique index if not exists ia_uso_gratis_ref_janela_uidx
  on public.ia_uso_gratis (user_id, acao, ref, janela) where ref is not null;

alter table public.ia_uso_gratis enable row level security;

-- LEITURA: o usuário vê o próprio consumo (para o app poder um dia mostrar
-- "2 de 3 usos" a partir da VERDADE, e não do contador local). Nenhuma policy de
-- INSERT/UPDATE/DELETE para `authenticated` → escrita só via service_role (worker).
-- Se o usuário pudesse escrever aqui, ele apagaria a própria cota.
drop policy if exists ia_uso_gratis_select_own on public.ia_uso_gratis;
create policy ia_uso_gratis_select_own on public.ia_uso_gratis
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.ia_uso_gratis to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- consumir_cota_ia — "tenta gastar 1 uso grátis do mês". TRÊS respostas, porque
-- "não sei" não pode virar "não tem" (regra P0 do projeto):
--   'consumida'  → tinha cota e o uso foi registrado
--   'ja_contada' → este `ref` já foi contado HÁ POUCO (retry) — não gasta de novo
--   'esgotada'   → a cota do mês acabou (daqui em diante o worker exige crédito)
-- Falha de infra não produz resposta nenhuma: a chamada erra, o worker vê o erro
-- e libera (fail-open). Nunca devolve 'esgotada' por dúvida.
--
-- O "HÁ POUCO" é a correção de um furo de segurança, não um detalhe: `p_ref` é
-- string ESCOLHIDA PELO CLIENTE. Se 'ja_contada' valesse para sempre, a primeira
-- chamada com `ref='X'` gastaria 1 uso e TODA chamada seguinte com o mesmo 'X'
-- (áudio outro, transcrição outra, mês outro) cairia no `exists` e voltaria
-- liberada — IA ilimitada na conta do dono, de graça, para sempre. O passe livre
-- não some tirando o campo do cliente: some LIMITANDO O TEMPO em que uma mesma
-- chave conta como repetição. Idempotência existe para absorver RETRY, e retry
-- acontece em segundos; replay de um mês inteiro não é retry.
--
-- SECURITY DEFINER + grant só para service_role: o worker chama, o usuário não —
-- se `authenticated` pudesse executar, daria para... não gastar a própria cota
-- (chamando com o mesmo ref) ou sondar a de outro. Só o worker.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.consumir_cota_ia(
  p_user uuid,
  p_acao text,
  p_ref text,
  p_limite integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- JANELA DE IDEMPOTÊNCIA — por quanto tempo o mesmo `p_ref` é lido como "é o
  -- mesmo pedido de novo" em vez de "é um pedido novo". ESPELHA JANELA_IDEM_MS
  -- em worker/src/creditos.js (mudou aqui, mude lá).
  --
  -- Por que 10 minutos: a chamada de voz tem timeout de 60s no app
  -- (TIMEOUT_VOZ_MS / TIMEOUT_TRANSCREVER_MS em src/services/olliAssistente.ts e
  -- src/services/vozNuvem.ts; 45s na conversa). O pior retry HONESTO é: estourou
  -- o timeout, o app foi para segundo plano no bolso, o usuário voltou e tocou de
  -- novo — minutos, não horas. 10 min cobrem isso com folga e ainda deixam a
  -- chave valer pouco para quem quiser abusar dela.
  v_janela constant interval := interval '10 minutes';
  v_periodo text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  v_acao text := coalesce(nullif(btrim(p_acao), ''), 'voz_ia');
  v_limite integer := greatest(coalesce(p_limite, 0), 0);
  v_usados integer;
  v_agora timestamptz := now();
  v_bucket timestamptz;
begin
  if p_user is null then
    -- Sem usuário não há cota a debitar; devolver 'esgotada' aqui bloquearia
    -- alguém por um erro de chamada. O worker trata qualquer resposta
    -- inesperada como indisponível e libera.
    return 'indisponivel';
  end if;

  -- Retry da MESMA ação, DENTRO DA JANELA: já foi contada, não conta de novo (e
  -- não bloqueia). Janela DESLIZANTE (compara com `criado_em`), não bucket: um
  -- retry legítimo é absorvido sempre, sem depender de onde caiu o corte do
  -- relógio. Fora da janela o `exists` não acha nada e o pedido segue como uso
  -- NOVO — que é o que ele é.
  if p_ref is not null and exists (
    select 1 from public.ia_uso_gratis u
    where u.user_id = p_user and u.acao = v_acao and u.ref = p_ref
      and u.criado_em > v_agora - v_janela
  ) then
    return 'ja_contada';
  end if;

  select count(*) into v_usados
  from public.ia_uso_gratis u
  where u.user_id = p_user and u.periodo = v_periodo and u.acao = v_acao;

  if v_usados >= v_limite then
    return 'esgotada';
  end if;

  -- Bucket alinhado, do MESMO tamanho da janela. Isso é o que faz o insert
  -- funcionar: o `exists` acima não achou nenhuma linha deste ref nos últimos
  -- `v_janela`, logo qualquer linha antiga dele é de um bucket ANTERIOR (bucket
  -- e janela têm o mesmo tamanho, então "mais velho que a janela" implica
  -- "bucket menor") — e a chave única não colide.
  -- (o `::double precision` é explícito de propósito: `extract` devolve numeric
  -- desde o PG14 e to_timestamp recebe double precision — deixar a conversão
  -- implícita funciona, mas some quando alguém lê rápido.)
  v_bucket := to_timestamp(
    (floor(extract(epoch from v_agora) / extract(epoch from v_janela)) * extract(epoch from v_janela))::double precision
  );

  -- `on conflict do nothing` sobra então para o único caso que ele sempre
  -- serviu: duas chamadas SIMULTÂNEAS do mesmo ref (mesmo bucket, as duas
  -- passando pelo `exists` antes de qualquer uma gravar) — só uma conta.
  insert into public.ia_uso_gratis (user_id, periodo, acao, ref, janela)
  values (p_user, v_periodo, v_acao, p_ref, v_bucket)
  on conflict do nothing;

  return 'consumida';
end;
$$;

comment on function public.consumir_cota_ia(uuid, text, text, integer) is
  'Consome 1 uso da cota gratuita mensal de IA (contagem no SERVIDOR, nao no aparelho). Retorna consumida | ja_contada | esgotada. ja_contada so vale dentro da janela de 10 min (p_ref e escolhido pelo cliente: idempotencia eterna seria IA gratis infinita). Erro de infra nao vira esgotada: o worker faz fail-open.';

revoke all on function public.consumir_cota_ia(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.consumir_cota_ia(uuid, text, text, integer) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- ref_cobranca_ia_recente — a MESMA janela, agora para o CRÉDITO.
--
-- Por que existe (e por que mora neste arquivo, que é "o arquivo da janela"):
-- esgotada a cota, a IA passa a custar 1 crédito, e a idempotência do crédito é
-- o índice único (origem, ref) do credit_ledger. Índice não olha relógio: ou a
-- chave é a mesma (não cobra nunca mais) ou é outra (cobra sempre). Com uma
-- chave escolhida pelo cliente, "a mesma para sempre" significa 1 crédito
-- comprando IA sem fim — o mesmo furo da cota, na camada do dinheiro.
--
-- Pôr um carimbo de tempo na chave resolve o replay mas quebra o retry honesto:
-- um retry 9 minutos depois cai do outro lado do corte e cobra de novo. Então o
-- worker PERGUNTA antes de gerar chave nova: "já lancei uma cobrança desta mesma
-- ação na última janela?". Se já, ele reusa AQUELA chave e o índice único
-- absorve; se não, gera a do bucket corrente e cobra.
--
-- `starts_with` (não `like`): o prefixo carrega uma string do cliente e `like`
-- interpretaria `%`/`_` dentro dela como curinga — casaria cobrança que não é a
-- dele. Prefixo literal não tem esse problema.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.ref_cobranca_ia_recente(p_user uuid, p_prefixo text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select l.ref
  from public.credit_ledger l
  where l.user_id = p_user
    and l.origem = 'consumo'
    and l.ref is not null
    and p_prefixo is not null
    and starts_with(l.ref, p_prefixo)
    -- MESMA janela do consumir_cota_ia acima. Mudou lá, mude aqui (e em
    -- JANELA_IDEM_MS, worker/src/creditos.js).
    and l.criado_em > now() - interval '10 minutes'
  order by l.criado_em desc
  limit 1;
$$;

comment on function public.ref_cobranca_ia_recente(uuid, text) is
  'Devolve o ref da ultima cobranca de IA lancada no ledger para esta acao dentro da janela de 10 min (ou null). O worker reusa esse ref para que um RETRY caia no indice unico em vez de cobrar 2x, sem que a chave do cliente vire credito infinito. Ver chaveCobrancaVoz em worker/src/creditos.js.';

revoke all on function public.ref_cobranca_ia_recente(uuid, text) from public, anon, authenticated;
grant execute on function public.ref_cobranca_ia_recente(uuid, text) to service_role;

-- ── Prova (rodar no SQL editor depois de aplicar) ────────────────────────────
--   -- 1. tem cota: as 3 primeiras passam, a 4ª não (limite 3):
--   select public.consumir_cota_ia('<uuid>', 'voz_ia', 'ref-1', 3); -- consumida
--   select public.consumir_cota_ia('<uuid>', 'voz_ia', 'ref-2', 3); -- consumida
--   select public.consumir_cota_ia('<uuid>', 'voz_ia', 'ref-3', 3); -- consumida
--   select public.consumir_cota_ia('<uuid>', 'voz_ia', 'ref-4', 3); -- esgotada
--
--   -- 2. retry não queima uso novo (mesmo ref da 1ª, DENTRO dos 10 min):
--   select public.consumir_cota_ia('<uuid>', 'voz_ia', 'ref-1', 3); -- ja_contada
--
--   -- 2b. o MESMO ref FORA da janela é uso novo — a idempotência não é eterna
--   -- (este é o teste do furo: se voltar 'ja_contada' aqui, a IA é infinita).
--   -- Envelhece a linha à mão para não esperar 10 minutos:
--   update public.ia_uso_gratis set criado_em = criado_em - interval '11 minutes'
--     where user_id = '<uuid>' and ref = 'ref-1';
--   select public.consumir_cota_ia('<uuid>', 'voz_ia', 'ref-1', 3); -- esgotada
--     -- ('esgotada' porque as 3 do mês já foram; com cota livre daria 'consumida'
--     --  e INSERIRIA uma 2ª linha do mesmo ref — bucket novo, chave única nova.)
--
--   -- 2c. a janela do CRÉDITO (a outra metade): o worker pergunta qual ref usar.
--   insert into public.credit_ledger (user_id, delta, origem, ref, descricao)
--     values ('<uuid>', -1, 'consumo', 'voz_ia:<uuid>:cli:abc:j123', 'OLLI voz');
--   select public.ref_cobranca_ia_recente('<uuid>', 'voz_ia:<uuid>:cli:abc:j');
--     -- devolve 'voz_ia:<uuid>:cli:abc:j123' → o worker REUSA e o índice único
--     -- absorve o retry (não cobra 2x).
--   update public.credit_ledger set criado_em = criado_em - interval '11 minutes'
--     where ref = 'voz_ia:<uuid>:cli:abc:j123';
--   select public.ref_cobranca_ia_recente('<uuid>', 'voz_ia:<uuid>:cli:abc:j');
--     -- devolve NULL → fora da janela é trabalho novo, e cobra.
--
--   -- 3. o usuário NÃO consegue apagar a própria cota:
--   set role authenticated; set request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
--   delete from public.ia_uso_gratis; -- 0 linhas (sem policy de delete)
--   select count(*) from public.ia_uso_gratis; -- vê as próprias, mas não apaga
--   select public.consumir_cota_ia('<uuid>', 'voz_ia', 'x', 3); -- ERRO: permission denied
--   reset role;
