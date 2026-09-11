-- Artefatos de documentos são evidência: cliente autenticado não substitui nem
-- remove PDF/anexo já enviado. Logos e fotos continuam editáveis pelo tenant.

drop policy if exists olli_storage_update_visivel on storage.objects;
create policy olli_storage_update_visivel
on storage.objects for update to authenticated
using (
  bucket_id in ('olli-logos', 'olli-fotos')
  and (storage.foldername(name))[1] in (select dono::text from public.donos_visiveis() as dono)
)
with check (
  bucket_id in ('olli-logos', 'olli-fotos')
  and (storage.foldername(name))[1] in (select dono::text from public.donos_visiveis() as dono)
);

drop policy if exists olli_storage_delete_visivel on storage.objects;
create policy olli_storage_delete_visivel
on storage.objects for delete to authenticated
using (
  bucket_id in ('olli-logos', 'olli-fotos')
  and (storage.foldername(name))[1] in (select dono::text from public.donos_visiveis() as dono)
);
