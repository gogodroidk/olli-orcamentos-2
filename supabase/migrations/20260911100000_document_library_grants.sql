-- O Data API não deve depender dos grants padrão do schema público. Exponha
-- somente as operações previstas; RLS e triggers continuam sendo a segunda
-- camada de autorização.
revoke all on table public.documentos from public, anon, authenticated;
revoke all on table public.documento_versoes from public, anon, authenticated;

grant select, insert, update on table public.documentos to authenticated;
grant select, insert on table public.documento_versoes to authenticated;

-- O Worker/admin usa service_role sob allowlist própria; triggers de congelamento
-- continuam sendo executados mesmo para chamadas privilegiadas.
grant all on table public.documentos to service_role;
grant all on table public.documento_versoes to service_role;
