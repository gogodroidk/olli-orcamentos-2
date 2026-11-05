-- Genesis S2 — schema do genesis.db (SQLite WAL). Estrutura própria; sem código de terceiros.
-- D-0615 (03/11/2026): a tarefa ganha os campos que G1/G2 pediram (requisitos, depois,
-- skill, teto do loop, handoff). A aprovacao ganha veto_ate e rollback (amarelo, D-0618).
-- Contrato só. NÃO criar genesis.db daqui e NÃO aplicar em Supabase, Cloudflare ou produção.
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE agente(id TEXT PRIMARY KEY, papel TEXT NOT NULL, dono TEXT, modelo TEXT, estado TEXT NOT NULL DEFAULT 'dormindo' CHECK(estado IN('dormindo','acordando','ativo','travado','morto')), visto_em TEXT, meta JSON);
CREATE TABLE conexao(de TEXT NOT NULL REFERENCES agente(id), para TEXT NOT NULL REFERENCES agente(id), tipo TEXT NOT NULL DEFAULT 'canal', PRIMARY KEY(de,para,tipo));
CREATE TABLE tarefa(
  id INTEGER PRIMARY KEY,
  dono TEXT REFERENCES agente(id),
  titulo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'fila' CHECK(estado IN('fila','em_andamento','bloqueada','humano','feita','falhou')),
  prioridade INTEGER NOT NULL DEFAULT 2,
  requisitos TEXT,
  depois TEXT,
  skill_ref TEXT,
  criterio_parada TEXT,
  max_iteracoes INTEGER NOT NULL DEFAULT 8 CHECK(max_iteracoes BETWEEN 1 AND 32),
  handoff_path TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  prazo TEXT,
  pai INTEGER REFERENCES tarefa(id)
);
CREATE INDEX tarefa_fila ON tarefa(estado,prioridade,dono);
CREATE TABLE evento(id INTEGER PRIMARY KEY, ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, agente TEXT, tarefa INTEGER, tipo TEXT NOT NULL, custo_usd REAL DEFAULT 0, tokens INTEGER DEFAULT 0, dados JSON);
CREATE INDEX evento_ts ON evento(ts); CREATE INDEX evento_agente ON evento(agente,ts);
CREATE TABLE aprovacao(id INTEGER PRIMARY KEY, tarefa INTEGER REFERENCES tarefa(id), acao TEXT NOT NULL, alcada TEXT NOT NULL CHECK(alcada IN('verde','amarelo','vermelho')), pedida_em TEXT DEFAULT CURRENT_TIMESTAMP, decidida_por TEXT, decisao TEXT CHECK(decisao IN('sim','nao')), decidida_em TEXT, veto_ate TEXT, rollback TEXT);
CREATE TABLE snapshot(id INTEGER PRIMARY KEY, ts TEXT DEFAULT CURRENT_TIMESTAMP, origem TEXT, hash TEXT, caminho TEXT, restaurado_ok INTEGER);
CREATE TABLE orcamento(dia TEXT NOT NULL, agente TEXT NOT NULL, teto_usd REAL NOT NULL, gasto_usd REAL NOT NULL DEFAULT 0, PRIMARY KEY(dia,agente));
-- G14: pulso por agente sai do que já foi registrado. Não é tabela nova.
CREATE VIEW pulso_agente AS
SELECT agente,
       COUNT(*) AS eventos,
       SUM(CASE WHEN tipo = 'entrega' THEN 1 ELSE 0 END) AS entregas,
       ROUND(SUM(custo_usd), 4) AS custo_usd,
       SUM(tokens) AS tokens
FROM evento
WHERE agente IS NOT NULL
GROUP BY agente;
