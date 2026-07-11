-- Fecha o backdoor de owner no RLS de organizacao_membros (achado P0-2 da
-- auditoria — docs/AUDITORIA_GERAL.md). Idempotente. Aplicar após
-- 20260707_multitenant.sql / 20260708_multitenant_fixes.sql.
--
-- CENÁRIO DE ATAQUE (o que este arquivo fecha):
--   As policies de UPDATE/DELETE em organizacao_membros já bloqueiam
--   `papel = 'owner'` (ver 20260707_multitenant.sql, membros_admin_update/
--   membros_admin_delete: "and papel <> 'owner'"). Mas a policy de INSERT
--   (membros_admin_insert) só exigia `eh_admin_org(org_id)` — sem checar o
--   papel da linha inserida. Um membro com papel 'admin' podia então:
--     insert into organizacao_membros (org_id, user_id, papel, ativo)
--     values (<org do admin>, <qualquer user_id, inclusive o próprio>, 'owner', true);
--   E como UPDATE/DELETE protegem qualquer linha com papel='owner', essa
--   linha plantada vira irrevogável pelo próprio app — nem o dono legítimo
--   consegue removê-la (as mesmas policies que deveriam proteger o owner
--   passam a proteger o invasor). Backdoor persistente, só limpável com
--   service_role. Isso também abre a porta para 2+ "owners" simultâneos na
--   mesma org, o que quebra a premissa de dono único usada em outros pontos
--   do app (ex.: organizacoes.owner_user_id é UNIQUE, mas nada amarrava
--   organizacao_membros a essa mesma unicidade).
--
-- CORREÇÃO:
--   (a) membros_admin_insert ganha "and papel <> 'owner'" no WITH CHECK —
--       simétrico ao que já existe em UPDATE/DELETE: admin nunca insere
--       (nem promove via insert) uma linha owner. A única linha owner de
--       uma org nasce em criar_organizacao() (SECURITY DEFINER, não passa
--       por esta policy) ou já existe.
--   (b) índice único parcial garante 1 owner por org mesmo se algum caminho
--       futuro (função SECURITY DEFINER, migração de dados, etc.) tentar
--       inserir um segundo — defesa em profundidade, não depende só da RLS.

-- (a) INSERT: admin nunca planta uma linha owner (mesma guarda de UPDATE/DELETE).
drop policy if exists membros_admin_insert on public.organizacao_membros;
create policy membros_admin_insert
  on public.organizacao_membros
  as permissive for insert to authenticated
  with check (public.eh_admin_org(org_id) and papel <> 'owner');

-- (b) No máximo 1 linha papel='owner' por organização.
create unique index if not exists organizacao_membros_um_owner_uidx
  on public.organizacao_membros (org_id)
  where papel = 'owner';
