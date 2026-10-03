-- Token da Meta Conversions API no Supabase Vault (criptografado), lido pelo worker.
--
-- Por quê: o worker olli-diagnostico está no Workers Free, que aceita no máximo 64
-- variáveis (vars + segredos) — e já estava em 64. Em vez de apagar config de outro
-- recurso, o token mora no Vault e o worker busca por esta função (service_role).
--
-- Gravar/trocar o token (SQL Editor ou MCP, nunca em migration/repo):
--   select vault.create_secret('<token>', 'meta_capi_token', 'Meta Conversions API (worker)');
--   select vault.update_secret(id, '<token>') from vault.secrets where name = 'meta_capi_token';
-- Desligar a CAPI: apagar o segredo (o worker diz "DESLIGADA" no log).

create or replace function public.anuncios_meta_token()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'meta_capi_token' limit 1;
$$;

revoke all on function public.anuncios_meta_token() from public, anon, authenticated;
grant execute on function public.anuncios_meta_token() to service_role;
