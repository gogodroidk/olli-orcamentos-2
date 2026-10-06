-- UM RECIBO POR PAGAMENTO REGISTRADO — trava no banco (revisão de 06/10/2026, P0).
--
-- A regra "um recibo só pode estar ligado a UM pagamento registrado" hoje vive só num `IF EXISTS (...)`
-- dentro do gatilho `proteger_pagamento_append_only` (migration 20261008090000). Um SELECT sem trava
-- não segura concorrência: duas requisições ligando o MESMO recibo a pagamentos DIFERENTES, ao mesmo
-- tempo, passam as duas pela checagem — e o mesmo recibo passa a "provar" dois pagamentos (receita
-- contada em dobro no recibo). O índice único parcial abaixo faz o BANCO recusar a segunda (23505).
--
-- Mesma semântica do gatilho: só conta `estado = 'registrado'` (um pagamento estornado pode manter o
-- recibo sem impedir que o recibo seja ligado a outro pagamento registrado depois) e ignora NULL
-- (pagamento sem recibo é normal e pode haver vários).
--
-- Pré-checagem em produção (06/10/2026, antes de aplicar): 12 pagamentos, 1 com recibo, 0 recibos
-- duplicados → o índice nasce sem conflito. Tabela minúscula: criação instantânea, sem CONCURRENTLY.
--
-- Aditiva e idempotente. Quem chama continua recebendo o mesmo código de erro do gatilho (23505).

create unique index if not exists pagamentos_recibo_registrado_uidx
  on public.pagamentos (recibo_id)
  where recibo_id is not null and estado = 'registrado';

comment on index public.pagamentos_recibo_registrado_uidx is
  'Um recibo só pode estar ligado a UM pagamento registrado (fecha a corrida do EXISTS do gatilho). Estornado e recibo NULL ficam de fora.';
