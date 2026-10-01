-- ─────────────────────────────────────────────────────────────────────────────
-- NÚMERO DE DOCUMENTO ÚNICO POR TENANT (orcamentos, recibos)
--
-- HISTÓRICO: nasceu em 27/07 como `20260727_numero_unico_por_tenant.sql.pendente`
--   (extensão fora do glob `*.sql` de propósito, para nenhum "aplica tudo que é
--   novo" levar o índice antes dos gates humanos). Em 01/10/2026 os gates estão
--   cumpridos e o arquivo volta a ser migration de verdade, com timestamp NOVO —
--   reaproveitar o 20260727 colocaria a migration "no passado", e quem compara a
--   lista local com a aplicada poderia achar que ela já rodou.
--
-- GATES (o que mudou de "pendente" para "pode aplicar"):
--   1. Duplicatas reais em produção: auditoria de 30/09/2026 (só leitura) deu ZERO
--      em orcamentos e em recibos. Mesmo assim, o bloco §1 abaixo REFAZ a contagem
--      dentro da migration e ABORTA com a lista se aparecer alguma — ninguém quer
--      que o banco "escolha" qual dos dois orçamentos perde o número.
--   2. Tipo da coluna: o predicado usa `numero::text`, vale para text ou integer.
--   3. Clientes preparados para a colisão 23505 (desde a base de 04/09/2026, já
--      dentro do APK 1.1.4 e do painel no ar):
--      - celular: `tentarRenumerarDocumento` em src/services/cloudSync.ts consulta
--        os pisos local/remoto, renumera, reenvia (até 3 tentativas) e guarda
--        `numeroAnterior`/`renumeradoEm` — o documento NUNCA fica preso sem subir;
--      - painel: a mesma retentativa em webapp/src/olli/mutacoes.ts.
--      `scripts/teste-numero-web.ts` trava os dois handlers e este arquivo juntos.
--
-- APLICAÇÃO: NÃO é automática neste PR. O dono aplica (Supabase MCP/CLI) numa
--   hora de pouco uso. As tabelas são pequenas: o CREATE INDEX trava escrita por
--   frações de segundo. Depois de aplicar, rode as duas consultas do §1 à mão para
--   provar o pós-estado (devem continuar vazias).
--
-- ROLLBACK (se algo inesperado acontecer):
--     drop index if exists public.orcamentos_numero_por_tenant_uidx;
--     drop index if exists public.recibos_numero_por_tenant_uidx;
--   Os clientes continuam funcionando sem o índice (voltam ao estado de hoje).
--
-- O QUE ELE FECHA
--   `numero` é o que o cliente cita quando paga ("depositei do orçamento 00426").
--   O app e o painel já derivam o próximo número do MESMO fato (o maior
--   sequencial entre os documentos existentes — `proximoNaSequencia` em
--   src/database/database.ts e `proximoNumeroDocumento` em webapp/src/olli/
--   mutacoes.ts), o que elimina a colisão do uso normal. Sobra a corrida real:
--   dois aparelhos criando ao mesmo tempo com um deles OFFLINE. Os dois leem o
--   mesmo piso, os dois emitem 00426, e quem sincroniza depois sobe um documento
--   com número já usado. Só o banco pode arbitrar isso.
--
-- O GRÃO É (user_id, numero), NÃO (numero)
--   `user_id` é o tenant: numeração é do PRESTADOR, não global. Em conta com
--   equipe, as linhas nascem no tenant do DONO (ver 20260707_multitenant.sql),
--   então dono e técnicos compartilham uma série só — que é o desejado.
--
-- INCLUI A LIXEIRA de propósito: soft delete não libera número (o cliente pode
--   estar com o PDF na mão). Mesma regra dos dois geradores.
--
-- IDEMPOTENTE: `if not exists` em tudo; rodar duas vezes não faz nada.
-- SEGREDOS: zero.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- §1) Trava: só cria o índice sobre dados limpos. Falhar aqui é o CERTO — a
--     mensagem traz os pares (tenant, número) para renumerar à mão antes de repetir.
--
--     Consultas para conferir antes e depois (as mesmas do bloco):
--       select user_id, numero, count(*), array_agg(id) from public.orcamentos
--        where numero is not null and btrim(numero::text) <> ''
--        group by user_id, numero having count(*) > 1;
--       select user_id, numero, count(*), array_agg(id) from public.recibos
--        where numero is not null and btrim(numero::text) <> ''
--        group by user_id, numero having count(*) > 1;
do $$
declare
  dup_orc text;
  dup_rec text;
begin
  select string_agg(format('%s/%s (%s docs)', user_id, numero, n), '; ')
    into dup_orc
    from (
      select user_id, numero::text as numero, count(*) as n
        from public.orcamentos
       where numero is not null and btrim(numero::text) <> ''
       group by user_id, numero
      having count(*) > 1
       limit 20
    ) d;

  select string_agg(format('%s/%s (%s docs)', user_id, numero, n), '; ')
    into dup_rec
    from (
      select user_id, numero::text as numero, count(*) as n
        from public.recibos
       where numero is not null and btrim(numero::text) <> ''
       group by user_id, numero
      having count(*) > 1
       limit 20
    ) d;

  if dup_orc is not null or dup_rec is not null then
    raise exception 'numero_unico_por_tenant: há números duplicados — renumere antes de aplicar. orcamentos: %; recibos: %',
      coalesce(dup_orc, 'nenhum'), coalesce(dup_rec, 'nenhum');
  end if;
end
$$;

-- §2) Os índices. Parcial: `null`/vazio ficam de fora. Rascunho sem número emitido
--     não é "documento com o número vazio" — se entrasse no índice, o segundo
--     rascunho sem número seria recusado como duplicata.
create unique index if not exists orcamentos_numero_por_tenant_uidx
  on public.orcamentos (user_id, numero)
  where numero is not null and btrim(numero::text) <> '';

create unique index if not exists recibos_numero_por_tenant_uidx
  on public.recibos (user_id, numero)
  where numero is not null and btrim(numero::text) <> '';

comment on index public.orcamentos_numero_por_tenant_uidx is
  'Numeração é por prestador (tenant = user_id do dono). Colisão aqui = 23505; clientes devem renumerar e reenviar, nunca engolir (cloudSync/mutacoes).';

comment on index public.recibos_numero_por_tenant_uidx is
  'Idem orcamentos_numero_por_tenant_uidx: número de recibo é único dentro do tenant.';

commit;
