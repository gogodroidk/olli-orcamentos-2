-- Lease e idempotência da fila (D-0676). Soma ao contrato acima.
-- Não é migration de Supabase, Cloudflare ou produção. O banco fica só em memória.
ALTER TABLE tarefa ADD COLUMN chave TEXT;
ALTER TABLE tarefa ADD COLUMN lease_ate TEXT;
ALTER TABLE tarefa ADD COLUMN lease_por TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS tarefa_chave ON tarefa(chave) WHERE chave IS NOT NULL;
