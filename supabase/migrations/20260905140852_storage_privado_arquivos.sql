-- Storage privado para logos, fotos de serviço, PDFs e anexos.
-- O primeiro segmento do objeto é o user_id dono do tenant. Membros ativos
-- podem operar somente nos owners retornados por public.donos_visiveis().

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('olli-logos', 'olli-logos', false, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('olli-fotos', 'olli-fotos', false, 10485760, array['image/png', 'image/jpeg', 'image/webp']),
  ('olli-documentos', 'olli-documentos', false, 20971520, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists olli_storage_select_visivel on storage.objects;
create policy olli_storage_select_visivel
on storage.objects for select to authenticated
using (
  bucket_id in ('olli-logos', 'olli-fotos', 'olli-documentos')
  and (storage.foldername(name))[1] in (
    select dono::text from public.donos_visiveis() as dono
  )
);

drop policy if exists olli_storage_insert_visivel on storage.objects;
create policy olli_storage_insert_visivel
on storage.objects for insert to authenticated
with check (
  bucket_id in ('olli-logos', 'olli-fotos', 'olli-documentos')
  and (storage.foldername(name))[1] in (
    select dono::text from public.donos_visiveis() as dono
  )
);

drop policy if exists olli_storage_update_visivel on storage.objects;
create policy olli_storage_update_visivel
on storage.objects for update to authenticated
using (
  bucket_id in ('olli-logos', 'olli-fotos', 'olli-documentos')
  and (storage.foldername(name))[1] in (
    select dono::text from public.donos_visiveis() as dono
  )
)
with check (
  bucket_id in ('olli-logos', 'olli-fotos', 'olli-documentos')
  and (storage.foldername(name))[1] in (
    select dono::text from public.donos_visiveis() as dono
  )
);

drop policy if exists olli_storage_delete_visivel on storage.objects;
create policy olli_storage_delete_visivel
on storage.objects for delete to authenticated
using (
  bucket_id in ('olli-logos', 'olli-fotos', 'olli-documentos')
  and (storage.foldername(name))[1] in (
    select dono::text from public.donos_visiveis() as dono
  )
);
