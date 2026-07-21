-- ─────────────────────────────────────────────────────────────────────────────
-- A1 (P0) — NINGUÉM ENTRA NA MINHA ORG SEM TER ACEITADO NADA
-- Achado A1 de docs/ENXAME/AUDITORIA_BANCO.md. Idempotente.
-- Aplicar APÓS 20260707_multitenant.sql / 20260708_multitenant_fixes.sql /
-- 20260718_rls_owner_backdoor.sql. Independente das demais desta leva.
--
-- O QUE ESTAVA ABERTO
--   `membros_admin_insert` (20260707, endurecida em 20260718) valida QUEM insere
--   (`eh_admin_org(org_id)`) e QUAL PAPEL (`papel <> 'owner'`). Ela nunca validou
--   QUEM ESTÁ SENDO INSERIDO. Não há vínculo com `convites`, nem com aceite.
--
-- POR QUE ISSO É EXFILTRAÇÃO, E NÃO "CONVITE INDESEJADO"
--   A identidade de tenant do app é DERIVADA desta tabela. `equipe.ts` lê a
--   membresia ativa; `contextoEquipe.ts` classifica quem não é 'owner' como
--   MEMBRO; `cloudSync.ts` passa a gravar toda linha de TABELAS_TENANT_EQUIPE com
--   `user_id = <dono da org>`; e `pushAllLocal` empurra a base LOCAL INTEIRA.
--   Então basta:
--     1. `select public.criar_organizacao('x')`          -- grátis, qualquer autenticado
--     2. `insert into organizacao_membros (org_id, user_id, papel, ativo)
--         values (<minha org>, <uid da vítima>, 'tecnico', true);`
--   e no próximo sync o aparelho da VÍTIMA reescreve a base dela dentro do meu
--   tenant. A RLS aprova cada linha — do ponto de vista dela a escrita é legítima.
--   Ela não perde uma cópia: perde a POSSE. E o `uid` da vítima não é segredo — é
--   a coluna de tenant, presente em toda linha que qualquer ex-técnico sincronizou.
--
-- A CORREÇÃO: (a) fechar o INSERT direto; (b) congelar a chave no UPDATE.
--
-- (a) POR QUE DAR **DROP** E NÃO ENDURECER A POLICY
--   O caminho legítimo de entrada é `aceitar_convite(token)` — SECURITY DEFINER,
--   exige o token de 128 bits, e é chamado PELO PRÓPRIO CONVIDADO (consentimento
--   por construção). `criar_organizacao()` é SECURITY DEFINER também. NENHUMA das
--   duas passa por esta policy.
--   Prova de que SECURITY DEFINER de fato ignora esta RLS (e portanto que este
--   DROP não quebra o produto): `criar_organizacao` insere `papel = 'owner'`, o
--   que a policy REJEITA desde 20260718. Se a função estivesse sujeita a ela,
--   criar organização estaria quebrado em produção desde aquele dia — e não está.
--   E nenhum client insere aqui: `src/services/equipe.ts` e
--   `webapp/src/pages/olli/equipe/useEquipe.ts` só fazem SELECT e UPDATE(ativo).
--   Sem policy de INSERT, o PostgREST recusa a escrita de `authenticated` (42501)
--   — mesmo desenho já usado em `credit_ledger` e `webhook_events`.
--
-- (b) POR QUE O TRIGGER TAMBÉM É NECESSÁRIO
--   Fechar só o INSERT deixa a MESMA exfiltração acessível por UPDATE: a PK é
--   (org_id, user_id) e `membros_admin_update` permite ao admin alterar qualquer
--   linha da própria org com `papel <> 'owner'`. Quem tem UM técnico legítimo
--   (todo cliente Empresa tem) faria `update organizacao_membros set user_id =
--   <uid da vítima>` e chegaria no mesmo lugar. A RLS não enxerga OLD → trigger.
--   `bloquear_troca_user_id` (20260708) NÃO serve aqui: ela referencia
--   `old.criado_por`, coluna que esta tabela não tem — usá-la levantaria
--   "record old has no field criado_por" em todo UPDATE de membro.
--
-- ENQUANTO ESTA MIGRATION NÃO RODAR: qualquer autenticado — inclusive um técnico
-- JÁ DESLIGADO, que guardou o uid do ex-patrão — captura a base FUTURA da vítima.
-- ─────────────────────────────────────────────────────────────────────────────

-- (a) INSERT direto em organizacao_membros deixa de existir para o client.
--     Entrar numa org passa a ter um único caminho: aceitar_convite(token).
drop policy if exists membros_admin_insert on public.organizacao_membros;

-- (b) (org_id, user_id) é IMUTÁVEL. Vale para TODO mundo, inclusive service_role
--     e o SQL editor: é a chave de identidade do tenant, e trocá-la nunca é uma
--     operação legítima (aceitar_convite só faz `on conflict do update` de
--     papel/ativo; definirAtivoMembro só escreve `ativo`). Corrigir uma linha
--     errada = apagar e recriar, deixando rastro.
create or replace function public.bloquear_troca_membro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'organizacao_membros.user_id é imutável';
  end if;
  if new.org_id is distinct from old.org_id then
    raise exception 'organizacao_membros.org_id é imutável';
  end if;
  return new;
end;
$$;

revoke execute on function public.bloquear_troca_membro() from anon, public;

drop trigger if exists organizacao_membros_chave_imutavel on public.organizacao_membros;
create trigger organizacao_membros_chave_imutavel
  before update on public.organizacao_membros
  for each row execute function public.bloquear_troca_membro();

-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE ESTA MIGRATION **NÃO** RESOLVE (fica para a leva do app — src/):
--   `src/services/equipe.ts:104` lê a membresia com `.limit(1)` SEM `order by` e
--   sem preferir `papel='owner'`. Com A1 fechado ninguém mais planta a linha, mas
--   quem for membro legítimo de duas orgs continua tendo o tenant de escrita
--   escolhido pelo Postgres. O painel já faz o certo
--   (`webapp/src/olli/mutacoes.ts`: `.order("criado_em", { ascending: true })`).
-- ─────────────────────────────────────────────────────────────────────────────
