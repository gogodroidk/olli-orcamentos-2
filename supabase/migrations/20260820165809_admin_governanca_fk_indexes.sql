-- Cobertura das FKs administrativas para que exclusão/anonimização de uma
-- conta em auth.users não precise varrer as tabelas inteiras.
create index if not exists admin_memberships_criado_por_idx
  on public.admin_memberships (criado_por)
  where criado_por is not null;

create index if not exists assinaturas_admin_override_by_idx
  on public.assinaturas (admin_override_by)
  where admin_override_by is not null;
