-- Cache de consultas de CNPJ (F1 — cadastro mágico). O worker consulta a BrasilAPI
-- (grátis, mas com fair-use) e guarda o resultado normalizado aqui por 30 dias, para
-- não marretar a API e responder instantâneo em reconsulta. Só o WORKER (service_role)
-- lê/escreve — o app consulta CNPJ SEMPRE pelo worker, nunca direto. NÃO aplicada
-- ainda (o integrador aplica via mcp__supabase__apply_migration). Idempotente.

create table if not exists public.cnpj_cache (
  cnpj text primary key,
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);

alter table public.cnpj_cache enable row level security;
-- SEM policies e SEM grants para papéis públicos: acesso apenas via service_role
-- (que ignora RLS). Um usuário jamais lê/escreve este cache diretamente.
