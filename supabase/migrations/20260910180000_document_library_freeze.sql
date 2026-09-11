-- Fecha ownership, parent/child tenant e edição destrutiva da biblioteca.
-- As versões são append-only até para chamadas privilegiadas; arquivamento é o
-- caminho reversível de produto.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documentos'::regclass
      and conname = 'documentos_user_id_id_key'
  ) then
    alter table public.documentos add constraint documentos_user_id_id_key unique (user_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documento_versoes'::regclass
      and conname = 'documento_versoes_documento_user_fk'
  ) then
    alter table public.documento_versoes
      add constraint documento_versoes_documento_user_fk
      foreign key (user_id, documento_id)
      references public.documentos (user_id, id)
      on delete cascade;
  end if;
end;
$$;

create or replace function public.proteger_documento_biblioteca()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'documento_arquivado_preserva_historico' using errcode = '55000';
  end if;
  if new.user_id is distinct from old.user_id
     or new.criado_por is distinct from old.criado_por then
    raise exception 'tenant_documento_imutavel' using errcode = '42501';
  end if;
  if old.status in ('enviado', 'assinado', 'arquivado') then
    if new.tipo is distinct from old.tipo
       or new.titulo is distinct from old.titulo
       or new.cliente_id is distinct from old.cliente_id
       or new.cliente_nome is distinct from old.cliente_nome
       or new.origem_tipo is distinct from old.origem_tipo
       or new.origem_id is distinct from old.origem_id
       or new.origem_numero is distinct from old.origem_numero
       or new.versao_atual is distinct from old.versao_atual
       or new.dados is distinct from old.dados
       or new.arquivo_uri is distinct from old.arquivo_uri
       or new.arquivo_chave is distinct from old.arquivo_chave
       or new.arquivo_hash is distinct from old.arquivo_hash
       or new.enviado_em is distinct from old.enviado_em
       or new.assinado_em is distinct from old.assinado_em then
      raise exception 'documento_congelado_exige_nova_versao' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists documentos_proteger_tenant_e_congelamento on public.documentos;
create trigger documentos_proteger_tenant_e_congelamento
before update or delete on public.documentos
for each row execute function public.proteger_documento_biblioteca();

create or replace function public.proteger_versao_documento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'versao_documento_append_only' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.documentos d
    where d.id = new.documento_id and d.user_id = new.user_id
  ) then
    raise exception 'tenant_versao_documento_invalido' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists documento_versoes_append_only on public.documento_versoes;
create trigger documento_versoes_append_only
before insert or update or delete on public.documento_versoes
for each row execute function public.proteger_versao_documento();

revoke all on function public.proteger_documento_biblioteca() from public, anon, authenticated;
revoke all on function public.proteger_versao_documento() from public, anon, authenticated;
