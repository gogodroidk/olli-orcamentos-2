-- Painel admin: "lembrar este aparelho" + derrubar sessões de um usuário.
--
-- 1) admin_trusted_devices
--    Depois que o administrador confirma o TOTP num aparelho, o Worker grava aqui
--    o HASH (sha-256) de um token aleatório e entrega o token num cookie HttpOnly,
--    Secure, SameSite=Strict, Path=/admin. Nas próximas entradas nesse aparelho a
--    senha basta: o Worker acha o hash, confere dono/validade/revogação e trata a
--    sessão como verificada. Aparelho novo (sem cookie) continua pedindo o código.
--    O token em si nunca é gravado. Revogar = preencher revogado_em (a lista fica
--    para histórico). Expira em 30 dias, sem renovação automática.
--
-- 2) admin_revogar_sessoes(p_user)
--    O GoTrue não tem rota administrativa para "sair de todos os aparelhos" de um
--    usuário pelo id. Apagar as linhas de auth.sessions derruba os refresh tokens
--    (cascade em auth.refresh_tokens); o access token já emitido morre sozinho no
--    vencimento (1 h). Só o service_role (Worker) executa.

create table if not exists public.admin_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  nome text not null default 'Navegador' check (char_length(nome) between 1 and 120),
  ip text check (ip is null or char_length(ip) <= 64),
  criado_em timestamptz not null default now(),
  ultimo_uso_em timestamptz,
  expira_em timestamptz not null,
  revogado_em timestamptz
);

create index if not exists admin_trusted_devices_user_idx
  on public.admin_trusted_devices (user_id, criado_em desc);

alter table public.admin_trusted_devices enable row level security;
alter table public.admin_trusted_devices force row level security;
revoke all on table public.admin_trusted_devices from public, anon, authenticated;
grant select, insert, update on table public.admin_trusted_devices to service_role;

comment on table public.admin_trusted_devices is
  'Aparelhos em que um administrador confirmou o TOTP. Guarda só o sha-256 do token do cookie. Escrita/leitura só pelo Worker (service_role).';

create or replace function public.admin_revogar_sessoes(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_user is null then
    raise exception 'p_user obrigatorio';
  end if;
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.admin_revogar_sessoes(uuid) from public, anon, authenticated;
grant execute on function public.admin_revogar_sessoes(uuid) to service_role;
