-- ─────────────────────────────────────────────────────────────────────────────
-- credit_ledger IMUTÁVEL DE VERDADE (prioridade 15 do plano: "credit_ledger imutável")
--
-- O QUE JÁ ERA VERDADE: o usuário não escreve no ledger. A tabela tem RLS ligada e
-- só a policy de SELECT do próprio extrato; sem policy de INSERT/UPDATE/DELETE,
-- `authenticated` não tem por onde gravar, e o saldo é derivado (SUM), não uma
-- coluna materializada que possa divergir. Isso continua valendo.
--
-- O QUE NÃO ERA: o comentário da migration original diz "Append-only por desenho:
-- não há caminho de UPDATE/DELETE". Isso é verdade para o CLIENTE — e só. O worker
-- usa `service_role`, que **ignora RLS por definição**. Então hoje um bug no worker,
-- um `UPDATE` manual no SQL editor "só pra corrigir rapidinho", ou a chave
-- service_role vazando permitem REESCREVER histórico financeiro sem deixar rastro.
-- Num ledger, isso não é um risco de segurança abstrato: é a diferença entre ter e
-- não ter contabilidade.
--
-- ESTE ARQUIVO fecha isso com TRIGGER, que vale para TODO mundo — inclusive o
-- service_role, inclusive o dono no painel do Supabase. RLS protege de quem está
-- fora; trigger protege de nós mesmos.
--
-- COMO SE CORRIGE UM ERRO, ENTÃO? Lançando uma linha nova com `origem = 'ajuste'`
-- (o CHECK da coluna já previa esse valor desde o dia 1 — o desenho sempre foi de
-- estorno, não de edição). É a regra mais velha da contabilidade: não se apaga
-- lançamento, faz-se o contrário dele. O saldo é SUM(delta), então um `-50` de
-- ajuste desfaz um `+50` errado e a história fica visível.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.credit_ledger_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception
      'credit_ledger é append-only: UPDATE proibido. Para corrigir, INSIRA uma linha com origem=''ajuste'' e delta invertido (o saldo é SUM(delta)).'
      using errcode = 'check_violation';
  end if;

  -- DELETE tem UMA exceção legítima, e só uma: a EXCLUSÃO DE CONTA (LGPD, direito de
  -- eliminação). O `user_id` tem `on delete cascade` para `auth.users`, e o
  -- `/conta/excluir` do worker apaga a linha em auth.users — o cascade então limpa o
  -- ledger daquele usuário. Bloquear DELETE sem ressalva quebraria esse direito.
  --
  -- Como separar o cascade de um DELETE manual: no cascade, a linha do usuário JÁ FOI
  -- removida quando este trigger roda (o Postgres aplica a ação referencial depois de
  -- apagar o pai, na mesma transação). Se o dono ainda existe, então não é cascade —
  -- é alguém apagando lançamento de um usuário vivo. Isso não passa.
  if tg_op = 'DELETE' then
    if exists (select 1 from auth.users u where u.id = old.user_id) then
      raise exception
        'credit_ledger é append-only: DELETE proibido enquanto o usuário existir. Para corrigir, INSIRA um ''ajuste''. (A exclusão de conta LGPD apaga por cascade e é permitida.)'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  return null;
end;
$$;

comment on function public.credit_ledger_append_only() is
  'Torna credit_ledger append-only para TODOS os papeis, inclusive service_role (RLS nao alcanca o service_role; trigger alcanca). UPDATE sempre proibido; DELETE so no cascade da exclusao de conta (LGPD). Correcao = nova linha com origem=ajuste.';

drop trigger if exists credit_ledger_sem_update on public.credit_ledger;
create trigger credit_ledger_sem_update
  before update on public.credit_ledger
  for each row execute function public.credit_ledger_append_only();

drop trigger if exists credit_ledger_sem_delete on public.credit_ledger;
create trigger credit_ledger_sem_delete
  before delete on public.credit_ledger
  for each row execute function public.credit_ledger_append_only();

-- ── Prova (rodar no SQL editor depois de aplicar) ────────────────────────────
--   -- 1. UPDATE é rejeitado mesmo com service_role:
--   update public.credit_ledger set delta = 999 where id = (select id from public.credit_ledger limit 1);
--   -- ERROR: credit_ledger é append-only: UPDATE proibido...
--
--   -- 2. DELETE de usuário vivo é rejeitado:
--   delete from public.credit_ledger where id = (select id from public.credit_ledger limit 1);
--   -- ERROR: credit_ledger é append-only: DELETE proibido...
--
--   -- 3. A exclusão de conta (LGPD) continua funcionando:
--   -- delete from auth.users where id = '<uuid de teste>';  → cascade limpa o ledger, sem erro.
--
--   -- 4. O estorno correto:
--   insert into public.credit_ledger (user_id, delta, origem, ref, descricao)
--   values ('<uuid>', -50, 'ajuste', 'estorno:<ref-original>', 'Estorno de credito lancado errado');
