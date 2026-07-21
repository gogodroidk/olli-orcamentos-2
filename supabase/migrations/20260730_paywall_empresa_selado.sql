-- ─────────────────────────────────────────────────────────────────────────────
-- O PLANO EMPRESA (R$ 99/mês) ERA LIBERÁVEL EM UMA LINHA DE SQL — POR DOIS
-- CAMINHOS INDEPENDENTES. Idempotente. Aplicar após 20260707_multitenant.sql e
-- 20260725_equipe_grandfathering.sql. Independente das demais desta leva.
--
-- Caminho 1 = achado A2 de docs/ENXAME/AUDITORIA_BANCO.md.
-- Caminho 2 = achado NOVO desta leva (não estava na auditoria).
--
-- ── CAMINHO 1: `equipe_grandfathered` é auto-concedível ──────────────────────
-- A migration 20260725 termina mandando exatamente o contrário do que o schema
-- faz: "Ninguém pode ESCREVER esta coluna pelo client (…) mantenha-a fora de
-- qualquer policy de UPDATE do client." Mas `organizacoes_owner_update`
-- (20260707) já É uma policy de UPDATE do client, e policy é POR LINHA, não por
-- coluna — cobre toda coluna presente e futura:
--     using (owner_user_id = (select auth.uid()))
-- E o gate lê o flag ANTES de olhar o plano (`worker/src/equipe.js:203`:
-- `if (org.equipe_grandfathered === true) return 'sim';`). Logo:
--     update public.organizacoes set equipe_grandfathered = true
--      where owner_user_id = auth.uid();
-- → Equipe + Mapa liberados sem assinar nada. A condição que o comentário temia
-- já era verdade no dia em que ele foi escrito.
--
-- ── CAMINHO 2: o paywall mora no worker, mas o client fala com o banco ───────
-- `handleConvite` (worker/src/equipe.js:336) faz o gate de plano DIREITO — três
-- estados, fail-closed em 503. Só que criar convite não precisa passar por ele:
-- `convites_gestao_insert` (20260707) permite ao client inserir em `convites`
-- direto no PostgREST com `with check (eh_admin_org(org_id))`. Basta
--     insert into public.convites (org_id, papel, token, expira_em, email)
--     values (<minha org>, 'tecnico', '<22 chars quaisquer>', now() + '7 days', '');
-- e mandar o token ao técnico, que chama `aceitar_convite` normalmente. Equipe
-- inteira de graça, sem o worker jamais ser chamado. O gate de dinheiro estava
-- guardando a porta da frente com a porta dos fundos aberta.
--
-- Por que DROP e não endurecer: nenhum client cria convite. O app chama
-- `POST /equipe/convite` (`src/services/equipe.ts:275` — "criação via worker") e
-- o painel nem oferece o fluxo (`webapp/.../ConvidarDialog.tsx`: "O convite é
-- enviado pelo aplicativo OLLI no celular"). O worker usa service_role e ignora
-- RLS, então ele segue criando convites normalmente. E é bom que o token nasça
-- só lá: `novoToken()` são 128 bits de `crypto.getRandomValues`; um token vindo
-- do client poderia ser adivinhável.
--
-- ENQUANTO ESTA MIGRATION NÃO RODAR: os dois bypasses seguem abertos e o paywall
-- do Empresa é decorativo. Nada QUEBRA sem ela — ela só tira poder de escrita que
-- ninguém legítimo usa.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── CAMINHO 1 ────────────────────────────────────────────────────────────────
-- `equipe_grandfathered` só muda por service_role / migration. Trigger, não
-- policy: policy de UPDATE no Postgres é por LINHA, e o que precisamos proteger é
-- uma COLUNA. (A alternativa "GRANT UPDATE (col1, col2, …)" exigiria revogar o
-- UPDATE de tabela e reconceder coluna a coluna — e toda coluna NOVA nasceria sem
-- grant, quebrando calado no futuro. Trigger não tem esse envelhecimento.)
--
-- ATENÇÃO — ESTA FUNÇÃO NÃO PODE SER `security definer`, ao contrário de quase
-- todas as outras deste banco: dentro de SECURITY DEFINER, `current_user` é o
-- DONO da função (postgres), nunca o chamador. O teste de papel viraria sempre
-- falso e o trigger não bloquearia NADA — passaria na revisão parecendo correto.
-- SECURITY INVOKER é o certo aqui também por privilégio mínimo: a função só lê
-- NEW/OLD, não toca em tabela nenhuma.
--
-- Bloqueia 'authenticated'/'anon' (os ÚNICOS papéis que o PostgREST expõe a um
-- client) e deixa passar service_role/postgres — que é como o worker concede o
-- grandfathering e como a própria 20260725 faz o backfill.
create or replace function public.congelar_equipe_grandfathered()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.equipe_grandfathered is distinct from old.equipe_grandfathered
     and current_user in ('authenticated', 'anon') then
    raise exception 'equipe_grandfathered não é editável pelo aplicativo';
  end if;
  return new;
end;
$$;

drop trigger if exists organizacoes_grandfathered_congelado on public.organizacoes;
create trigger organizacoes_grandfathered_congelado
  before update on public.organizacoes
  for each row execute function public.congelar_equipe_grandfathered();

-- ── CAMINHO 2 ────────────────────────────────────────────────────────────────
-- Criar convite deixa de existir para o client: o único criador é o worker
-- (service_role), que é onde o gate de plano Empresa mora.
drop policy if exists convites_gestao_insert on public.convites;
