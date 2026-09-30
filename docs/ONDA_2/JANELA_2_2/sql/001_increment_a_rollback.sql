-- OLLI Onda 2 / Janela 2.2
-- Rollback compensatório DRAFT.
-- Preserva schema, dados, memberships, comandos e RLS.
-- Uma retomada exige migration forward revisada; não reabrir grants manualmente.

begin;

update olli_v2.organizations
set
  v2_commands_enabled = false,
  updated_at = greatest(updated_at, now())
where v2_commands_enabled is true;

revoke all on all tables in schema olli_v2 from authenticated;
revoke execute
  on function olli_v2.has_capability(uuid, text)
  from authenticated;
revoke usage on schema olli_v2 from authenticated;

alter table olli_v2.organizations enable row level security;
alter table olli_v2.organizations force row level security;
alter table olli_v2.organization_memberships enable row level security;
alter table olli_v2.organization_memberships force row level security;
alter table olli_v2.clients enable row level security;
alter table olli_v2.clients force row level security;
alter table olli_v2.locations enable row level security;
alter table olli_v2.locations force row level security;
alter table olli_v2.command_ledger enable row level security;
alter table olli_v2.command_ledger force row level security;

comment on schema olli_v2 is
  'OLLI V2 desativada por rollback compensatório; dados e RLS preservados para reconciliação.';

commit;
