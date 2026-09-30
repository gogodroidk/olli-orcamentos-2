-- OLLI Onda 2 / Janela 2.2
-- Migration DRAFT: expansão aditiva do Incremento A.
-- Pré-requisitos do ambiente alvo: papel authenticated e função auth.uid().
-- NÃO aplicar remotamente sem catálogo, revisão, banco efêmero verde e autorização.

begin;

create schema if not exists olli_v2;
comment on schema olli_v2 is
  'OLLI V2 draft. Tenant canônico por organization_id; runtime e produção ainda não autorizados.';

revoke all on schema olli_v2 from public;
grant usage on schema olli_v2 to authenticated;

create table if not exists olli_v2.organizations (
  id uuid primary key,
  display_name text not null
    check (char_length(display_name) between 1 and 160),
  status text not null
    check (status in ('active', 'suspended')),
  version bigint not null default 1
    check (version >= 1),
  v2_commands_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_timestamp_order
    check (updated_at >= created_at)
);

create table if not exists olli_v2.organization_memberships (
  id uuid primary key,
  organization_id uuid not null,
  user_id uuid not null,
  role text not null
    check (role in ('owner', 'admin', 'manager', 'technician', 'viewer')),
  status text not null
    check (status in ('active', 'revoked')),
  capabilities text[] not null default array[]::text[]
    check (
      capabilities <@ array[
        'clients_locations.read',
        'clients_locations.write'
      ]::text[]
    ),
  version bigint not null default 1
    check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memberships_organization_fk
    foreign key (organization_id)
    references olli_v2.organizations (id)
    on update restrict
    on delete restrict,
  constraint organization_memberships_org_user_unique
    unique (organization_id, user_id),
  constraint organization_memberships_capabilities_unique
    check (
      cardinality(capabilities)
      =
      (
        case
          when capabilities @> array['clients_locations.read']::text[]
          then 1
          else 0
        end
        +
        case
          when capabilities @> array['clients_locations.write']::text[]
          then 1
          else 0
        end
      )
    ),
  constraint organization_memberships_timestamp_order
    check (updated_at >= created_at)
);

create index if not exists organization_memberships_user_org_active_idx
  on olli_v2.organization_memberships (user_id, organization_id)
  where status = 'active';

create index if not exists organization_memberships_organization_idx
  on olli_v2.organization_memberships (organization_id);

create table if not exists olli_v2.clients (
  id uuid primary key,
  organization_id uuid not null,
  display_name text not null
    check (char_length(display_name) between 1 and 160),
  status text not null
    check (status in ('active', 'inactive')),
  version bigint not null default 1
    check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_organization_fk
    foreign key (organization_id)
    references olli_v2.organizations (id)
    on update restrict
    on delete restrict,
  constraint clients_organization_id_id_unique
    unique (organization_id, id),
  constraint clients_timestamp_order
    check (updated_at >= created_at)
);

create index if not exists clients_organization_status_idx
  on olli_v2.clients (organization_id, status);

create table if not exists olli_v2.locations (
  id uuid primary key,
  organization_id uuid not null,
  client_id uuid not null,
  label text not null
    check (char_length(label) between 1 and 160),
  status text not null
    check (status in ('active', 'inactive')),
  version bigint not null default 1
    check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_organization_fk
    foreign key (organization_id)
    references olli_v2.organizations (id)
    on update restrict
    on delete restrict,
  constraint locations_client_same_organization_fk
    foreign key (organization_id, client_id)
    references olli_v2.clients (organization_id, id)
    on update restrict
    on delete restrict,
  constraint locations_organization_id_id_unique
    unique (organization_id, id),
  constraint locations_timestamp_order
    check (updated_at >= created_at)
);

create index if not exists locations_organization_client_idx
  on olli_v2.locations (organization_id, client_id);

create index if not exists locations_organization_status_idx
  on olli_v2.locations (organization_id, status);

create table if not exists olli_v2.command_ledger (
  command_id uuid primary key,
  organization_id uuid not null,
  idempotency_key text not null
    check (
      char_length(idempotency_key) between 2 and 128
      and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
    ),
  protocol_version integer not null
    check (protocol_version = 1),
  schema_version integer not null
    check (schema_version = 1),
  aggregate_type text not null
    check (aggregate_type in ('client', 'location')),
  aggregate_id uuid not null,
  expected_version bigint not null
    check (expected_version >= 0),
  operation text not null
    check (operation in (
      'create_client',
      'update_client',
      'create_location',
      'update_location'
    )),
  payload_hash text not null
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid not null,
  state text not null
    check (state in ('processing', 'acked', 'conflict', 'rejected')),
  result_code text,
  canonical_version bigint,
  safe_result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_result) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint command_ledger_organization_fk
    foreign key (organization_id)
    references olli_v2.organizations (id)
    on update restrict
    on delete restrict,
  constraint command_ledger_org_idempotency_unique
    unique (organization_id, idempotency_key),
  constraint command_ledger_operation_shape
    check (
      (
        operation in ('create_client', 'update_client')
        and aggregate_type = 'client'
      )
      or
      (
        operation in ('create_location', 'update_location')
        and aggregate_type = 'location'
      )
    ),
  constraint command_ledger_expected_version_shape
    check (
      (
        operation in ('create_client', 'create_location')
        and expected_version = 0
      )
      or
      (
        operation in ('update_client', 'update_location')
        and expected_version >= 1
      )
    ),
  constraint command_ledger_result_shape
    check (
      (
        state = 'processing'
        and result_code is null
        and canonical_version is null
        and completed_at is null
      )
      or
      (
        state = 'acked'
        and result_code = 'applied'
        and canonical_version >= 1
        and completed_at is not null
      )
      or
      (
        state = 'conflict'
        and result_code = 'expected_version_mismatch'
        and canonical_version >= 1
        and completed_at is not null
      )
      or
      (
        state = 'rejected'
        and result_code in (
          'idempotency_key_reused',
          'authorization_denied',
          'authorization_revoked',
          'co_tenancy_violation',
          'validation_failed'
        )
        and canonical_version is null
        and completed_at is not null
      )
    )
);

create index if not exists command_ledger_organization_aggregate_idx
  on olli_v2.command_ledger (
    organization_id,
    aggregate_type,
    aggregate_id,
    created_at
  );

create index if not exists command_ledger_actor_created_idx
  on olli_v2.command_ledger (actor_user_id, created_at);

comment on table olli_v2.command_ledger is
  'Ledger idempotente: persiste hash e resultado seguro; payload integral permanece fora.';

create or replace function olli_v2.has_capability(
  p_organization_id uuid,
  p_required_capability text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from olli_v2.organization_memberships as membership
      where membership.organization_id = p_organization_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and (
          (
            p_required_capability = 'clients_locations.read'
            and (
              membership.role in ('owner', 'admin', 'manager', 'viewer')
              or membership.capabilities && array[
                'clients_locations.read',
                'clients_locations.write'
              ]::text[]
            )
          )
          or
          (
            p_required_capability = 'clients_locations.write'
            and (
              membership.role in ('owner', 'admin', 'manager')
              or membership.capabilities @> array[
                'clients_locations.write'
              ]::text[]
            )
          )
        )
    );
$function$;

comment on function olli_v2.has_capability(uuid, text) is
  'SECURITY INVOKER; lê somente a membership do ator visível por RLS, usa auth.uid(), search_path vazio e retorna booleano.';

revoke all on function olli_v2.has_capability(uuid, text) from public;
grant execute on function olli_v2.has_capability(uuid, text) to authenticated;

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

create policy organizations_select_active_membership
  on olli_v2.organizations
  for select
  to authenticated
  using (olli_v2.has_capability(id, 'clients_locations.read'));
create policy organizations_insert_via_gateway_only
  on olli_v2.organizations
  for insert
  to authenticated
  with check (false);
create policy organizations_update_via_gateway_only
  on olli_v2.organizations
  for update
  to authenticated
  using (false)
  with check (false);
create policy organizations_delete_denied
  on olli_v2.organizations
  for delete
  to authenticated
  using (false);

create policy memberships_select_self
  on olli_v2.organization_memberships
  for select
  to authenticated
  using (user_id = (select auth.uid()));
create policy memberships_insert_via_gateway_only
  on olli_v2.organization_memberships
  for insert
  to authenticated
  with check (false);
create policy memberships_update_via_gateway_only
  on olli_v2.organization_memberships
  for update
  to authenticated
  using (false)
  with check (false);
create policy memberships_delete_denied
  on olli_v2.organization_memberships
  for delete
  to authenticated
  using (false);

create policy clients_select_active_membership
  on olli_v2.clients
  for select
  to authenticated
  using (
    olli_v2.has_capability(
      organization_id,
      'clients_locations.read'
    )
  );
create policy clients_insert_via_gateway_only
  on olli_v2.clients
  for insert
  to authenticated
  with check (false);
create policy clients_update_via_gateway_only
  on olli_v2.clients
  for update
  to authenticated
  using (false)
  with check (false);
create policy clients_delete_denied
  on olli_v2.clients
  for delete
  to authenticated
  using (false);

create policy locations_select_active_membership
  on olli_v2.locations
  for select
  to authenticated
  using (
    olli_v2.has_capability(
      organization_id,
      'clients_locations.read'
    )
  );
create policy locations_insert_via_gateway_only
  on olli_v2.locations
  for insert
  to authenticated
  with check (false);
create policy locations_update_via_gateway_only
  on olli_v2.locations
  for update
  to authenticated
  using (false)
  with check (false);
create policy locations_delete_denied
  on olli_v2.locations
  for delete
  to authenticated
  using (false);

create policy command_ledger_select_via_gateway_only
  on olli_v2.command_ledger
  for select
  to authenticated
  using (false);
create policy command_ledger_insert_via_gateway_only
  on olli_v2.command_ledger
  for insert
  to authenticated
  with check (false);
create policy command_ledger_update_via_gateway_only
  on olli_v2.command_ledger
  for update
  to authenticated
  using (false)
  with check (false);
create policy command_ledger_delete_denied
  on olli_v2.command_ledger
  for delete
  to authenticated
  using (false);

revoke all on all tables in schema olli_v2 from public;
revoke all on all tables in schema olli_v2 from authenticated;
grant select on table
  olli_v2.organizations,
  olli_v2.organization_memberships,
  olli_v2.clients,
  olli_v2.locations
to authenticated;

commit;
