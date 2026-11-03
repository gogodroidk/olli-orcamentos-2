-- OLLI — auditoria do MCP de cadastro (D-1438 G21).
--
-- Este arquivo foi escrito para a janela de migration. Nesta entrega ele NÃO foi aplicado.
-- Não há dado de cliente aqui e o Worker não lê esta tabela ainda.
--
-- A trilha não guarda telefone, e-mail, CPF, texto de cláusula nem prompt.
-- Só o nome da ferramenta, o código do resultado, os nomes dos campos e hashes.

create table if not exists public.mcp_cadastro_auditoria (
  id              bigint generated always as identity primary key,
  revisao         integer not null check (revisao between 1 and 10000),
  tenant_user_id  uuid not null references auth.users (id) on delete cascade,
  actor_user_id   uuid not null references auth.users (id) on delete cascade,
  ferramenta      text not null check (ferramenta in (
                    'olli_listar_escopos',
                    'olli_buscar',
                    'olli_ler',
                    'olli_propor_cadastro',
                    'olli_propor_edicao',
                    'olli_confirmar',
                    'olli_cancelar',
                    'olli_desfazer',
                    'olli_auditoria',
                    'ferramenta_recusada'
                  )),
  resultado       text not null check (resultado in ('ok', 'negada', 'conflito', 'aplicada', 'cancelada', 'revertida')),
  motivo          text not null check (motivo ~ '^[a-z0-9_]{1,80}$'),
  rascunho_id     text check (rascunho_id is null or rascunho_id ~ '^[A-Za-z0-9._:-]{1,80}$'),
  escopo          text check (escopo is null or escopo in ('cliente', 'produto', 'servico', 'clausula_contrato', 'documento')),
  registro_id     text check (registro_id is null or registro_id ~ '^[A-Za-z0-9._:-]{1,80}$'),
  campos          text[] not null default '{}',
  hash_antes      text check (hash_antes is null or hash_antes ~ '^[a-f0-9]{64}$'),
  hash_depois     text check (hash_depois is null or hash_depois ~ '^[a-f0-9]{64}$'),
  criado_em       timestamptz not null default pg_catalog.now(),
  check (cardinality(campos) <= 8)
);

create index if not exists mcp_cadastro_auditoria_tenant_idx
  on public.mcp_cadastro_auditoria (tenant_user_id, criado_em desc);

alter table public.mcp_cadastro_auditoria enable row level security;
alter table public.mcp_cadastro_auditoria force row level security;

revoke all on table public.mcp_cadastro_auditoria from public, anon, authenticated;
revoke all on sequence public.mcp_cadastro_auditoria_id_seq from public, anon, authenticated;

grant select, insert, delete on table public.mcp_cadastro_auditoria to service_role;
grant usage, select on sequence public.mcp_cadastro_auditoria_id_seq to service_role;

comment on table public.mcp_cadastro_auditoria is
  'Trilha do MCP de cadastro. Sem prompt, sem telefone e sem texto de documento. Append-only, salvo o purge de 90 dias.';

create or replace function public.mcp_cadastro_auditoria_campos_ok()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campo text;
  v_ok text[] := array[
    'nome', 'telefone', 'endereco', 'complemento', 'cidade', 'estado', 'cep',
    'descricao', 'preco', 'custo', 'unidade', 'marca', 'modelo',
    'garantia', 'multaAtrasoPercent', 'jurosMesPercent', 'avisoPrevioDias', 'foro',
    'obrigacoesContratada', 'obrigacoesContratante', 'clausulasExtras',
    'titulo', 'observacoes'
  ];
begin
  if pg_catalog.cardinality(new.campos) > 8 then
    raise exception 'mcp_campos_demais';
  end if;
  foreach v_campo in array new.campos loop
    if not (v_campo = any (v_ok)) then
      raise exception 'mcp_campo_nao_permitido';
    end if;
  end loop;
  if tg_op = 'UPDATE' then
    raise exception 'mcp_auditoria_imutavel';
  end if;
  return new;
end;
$$;

create or replace function public.mcp_cadastro_auditoria_imutavel()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_catalog.current_setting('olli.mcp_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'mcp_auditoria_imutavel';
end;
$$;

drop trigger if exists mcp_cadastro_auditoria_campos on public.mcp_cadastro_auditoria;
create trigger mcp_cadastro_auditoria_campos
  before insert or update on public.mcp_cadastro_auditoria
  for each row execute function public.mcp_cadastro_auditoria_campos_ok();

drop trigger if exists mcp_cadastro_auditoria_trava on public.mcp_cadastro_auditoria;
create trigger mcp_cadastro_auditoria_trava
  before update or delete on public.mcp_cadastro_auditoria
  for each row execute function public.mcp_cadastro_auditoria_imutavel();

create or replace function public.purge_mcp_cadastro_auditoria(
  p_now timestamptz default pg_catalog.now()
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_now is null or p_now > pg_catalog.now() + interval '5 minutes' then
    raise exception 'mcp_purge_relogio_invalido';
  end if;
  perform pg_catalog.set_config('olli.mcp_purge', 'on', true);
  delete from public.mcp_cadastro_auditoria a
   where a.criado_em <= p_now - interval '90 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.mcp_cadastro_auditoria_campos_ok() from public, anon, authenticated;
revoke all on function public.mcp_cadastro_auditoria_imutavel() from public, anon, authenticated;
revoke all on function public.purge_mcp_cadastro_auditoria(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_mcp_cadastro_auditoria(timestamptz) to service_role;

-- Rollback: não aplicar esta migration. Se um dia ela entrar e precisar sair,
-- pare o adaptador do MCP antes e só então drop a tabela numa migration
-- separada e autorizada. Não há dado de negócio nesta tabela.
