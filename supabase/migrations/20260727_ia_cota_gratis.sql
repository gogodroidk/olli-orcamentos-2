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
  ref text,
  criado_em timestamptz not null default now()
);

-- Contagem do mês (o filtro que a RPC faz a cada chamada).
create index if not exists ia_uso_gratis_user_periodo_idx
  on public.ia_uso_gratis (user_id, periodo, acao);

-- Idempotência forte por ação. Parcial (só quando há ref) pelo mesmo motivo do
-- credit_ledger: um consumo sem ref é um uso legítimo distinto, não um duplicado.
create unique index if not exists ia_uso_gratis_ref_uidx
  on public.ia_uso_gratis (user_id, acao, ref) where ref is not null;

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
--   'ja_contada' → este `ref` já tinha sido contado (retry) — não gasta de novo
--   'esgotada'   → a cota do mês acabou (daqui em diante o worker exige crédito)
-- Falha de infra não produz resposta nenhuma: a chamada erra, o worker vê o erro
-- e libera (fail-open). Nunca devolve 'esgotada' por dúvida.
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
  v_periodo text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  v_acao text := coalesce(nullif(btrim(p_acao), ''), 'voz_ia');
  v_limite integer := greatest(coalesce(p_limite, 0), 0);
  v_usados integer;
begin
  if p_user is null then
    -- Sem usuário não há cota a debitar; devolver 'esgotada' aqui bloquearia
    -- alguém por um erro de chamada. O worker trata qualquer resposta
    -- inesperada como indisponível e libera.
    return 'indisponivel';
  end if;

  -- Retry da MESMA ação: já foi contada, não conta de novo (e não bloqueia).
  if p_ref is not null and exists (
    select 1 from public.ia_uso_gratis u
    where u.user_id = p_user and u.acao = v_acao and u.ref = p_ref
  ) then
    return 'ja_contada';
  end if;

  select count(*) into v_usados
  from public.ia_uso_gratis u
  where u.user_id = p_user and u.periodo = v_periodo and u.acao = v_acao;

  if v_usados >= v_limite then
    return 'esgotada';
  end if;

  -- `on conflict do nothing`: duas chamadas simultâneas com o mesmo ref não
  -- levantam erro — a segunda simplesmente não insere.
  insert into public.ia_uso_gratis (user_id, periodo, acao, ref)
  values (p_user, v_periodo, v_acao, p_ref)
  on conflict do nothing;

  return 'consumida';
end;
$$;

comment on function public.consumir_cota_ia(uuid, text, text, integer) is
  'Consome 1 uso da cota gratuita mensal de IA (contagem no SERVIDOR, nao no aparelho). Retorna consumida | ja_contada | esgotada. Erro de infra nao vira esgotada: o worker faz fail-open.';

revoke all on function public.consumir_cota_ia(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.consumir_cota_ia(uuid, text, text, integer) to service_role;

-- ── Prova (rodar no SQL editor depois de aplicar) ────────────────────────────
--   -- 1. tem cota: as 3 primeiras passam, a 4ª não (limite 3):
--   select public.consumir_cota_ia('<uuid>', 'voz_ia', 'ref-1', 3); -- consumida
--   select public.consumir_cota_ia('<uuid>', 'voz_ia', 'ref-2', 3); -- consumida
--   select public.consumir_cota_ia('<uuid>', 'voz_ia', 'ref-3', 3); -- consumida
--   select public.consumir_cota_ia('<uuid>', 'voz_ia', 'ref-4', 3); -- esgotada
--
--   -- 2. retry não queima uso novo (mesmo ref da 1ª):
--   select public.consumir_cota_ia('<uuid>', 'voz_ia', 'ref-1', 3); -- ja_contada
--
--   -- 3. o usuário NÃO consegue apagar a própria cota:
--   set role authenticated; set request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
--   delete from public.ia_uso_gratis; -- 0 linhas (sem policy de delete)
--   select count(*) from public.ia_uso_gratis; -- vê as próprias, mas não apaga
--   select public.consumir_cota_ia('<uuid>', 'voz_ia', 'x', 3); -- ERRO: permission denied
--   reset role;
