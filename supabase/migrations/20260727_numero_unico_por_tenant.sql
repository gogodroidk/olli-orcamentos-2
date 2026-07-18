-- ─────────────────────────────────────────────────────────────────────────────
-- NÚMERO DE DOCUMENTO ÚNICO POR TENANT (orcamentos, recibos)
--
-- ⚠️ NÃO APLIQUE ESTE ARQUIVO AINDA. Ele tem um PRÉ-REQUISITO DE CÓDIGO que
--    ainda não existe (item 3 abaixo). Aplicado antes disso, ele TROCA um bug
--    visível por um invisível — que é pior. Leia inteiro antes de rodar.
--
-- O QUE ELE FECHA
--   `numero` é o que o cliente cita quando paga ("depositei do orçamento 00426").
--   Hoje nada no banco impede que dois documentos DIFERENTES nasçam com o mesmo
--   número. O app e o painel já derivam o próximo número do MESMO fato (o maior
--   sequencial entre os documentos existentes — ver `proximoNaSequencia` em
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
-- ── PASSOS HUMANOS, NESTA ORDEM ─────────────────────────────────────────────
--
-- 1. LIMPAR O QUE JÁ ESTÁ DUPLICADO. O índice não nasce sobre dados sujos: se
--    houver duplicata, o CREATE INDEX falha (e falhar aqui é o certo — ninguém
--    quer que o banco "escolha" qual dos dois orçamentos perde o número).
--    Rode ANTES, e renumere à mão o que aparecer:
--
--      select user_id, numero, count(*), array_agg(id)
--        from public.orcamentos
--       where numero is not null and btrim(numero::text) <> ''
--       group by user_id, numero having count(*) > 1;
--
--      select user_id, numero, count(*), array_agg(id)
--        from public.recibos
--       where numero is not null and btrim(numero::text) <> ''
--       group by user_id, numero having count(*) > 1;
--
-- 2. CONFERIR O TIPO DA COLUNA. O predicado usa `numero::text` justamente para
--    valer com `text` ou `integer`. Se `numero` for de outro tipo, ajuste.
--
-- 3. ⚠️ ENSINAR O PUSH A RENUMERAR NA COLISÃO — O PRÉ-REQUISITO.
--    `mirrorPush` (src/database/database.ts) é fire-and-forget e ENGOLE erro:
--    `void pushRow(...).catch(() => {})`. Com este índice no ar e sem tratar o
--    23505, o documento do aparelho que perdeu a corrida FALHA AO SUBIR PARA
--    SEMPRE, calado: ele continua lindo no celular e nunca aparece no painel.
--    Isso é o P0 da casa ("erro nunca vira vazio") na pior forma — perda de dado
--    sem aviso. Antes de aplicar, o caminho de push tem que, ao receber 23505
--    nestes índices, pegar o próximo número livre, regravar o documento local com
--    ele e tentar de novo. O projeto já tem exatamente esse padrão pronto para
--    copiar: `espelharVersaoNuvem` em src/services/clienteLink.ts renumera a
--    versão na colisão de UNIQUE(orcamento_id, numero_versao).
--
-- 4. Só então aplicar este arquivo.
-- ─────────────────────────────────────────────────────────────────────────────

-- Parcial: `null`/vazio ficam de fora. Rascunho sem número emitido não é
-- "documento com o número vazio" — se entrasse no índice, o segundo rascunho sem
-- número seria recusado como duplicata.
create unique index if not exists orcamentos_numero_por_tenant_uidx
  on public.orcamentos (user_id, numero)
  where numero is not null and btrim(numero::text) <> '';

create unique index if not exists recibos_numero_por_tenant_uidx
  on public.recibos (user_id, numero)
  where numero is not null and btrim(numero::text) <> '';

comment on index public.orcamentos_numero_por_tenant_uidx is
  'Numeração é por prestador (tenant = user_id do dono). Colisão aqui = 23505 no push; o cliente deve RENUMERAR e reenviar, nunca engolir (vide espelharVersaoNuvem).';

comment on index public.recibos_numero_por_tenant_uidx is
  'Idem orcamentos_numero_por_tenant_uidx: número de recibo é único dentro do tenant.';
