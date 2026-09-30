-- Índices de cobertura das FKs de tenant detectadas pelo Supabase Advisor.
-- Parciais porque o welcome pode existir antes de uma organização ser criada.

create index if not exists email_welcome_events_tenant_created_idx
  on public.email_welcome_events (tenant_id, created_at desc)
  where tenant_id is not null;

create index if not exists email_outbox_tenant_created_idx
  on public.email_outbox (tenant_id, created_at desc)
  where tenant_id is not null;
