import assert from 'node:assert/strict';
import fs from 'node:fs';

const adapter = fs.readFileSync('src/services/adapters/SupabaseStorageProvider.ts', 'utf8');
const porta = fs.readFileSync('src/services/ports/StorageProvider.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260905140852_storage_privado_arquivos.sql', 'utf8');
const config = fs.readFileSync('supabase/config.toml', 'utf8');

assert.match(porta, /tenantId\?: string/);
assert.match(adapter, /createSignedUrl\(alvo\.caminho, 60 \* 60\)/);
assert.match(adapter, /crypto\.randomUUID\(\)/);
assert.match(adapter, /upsert: false/);
assert.match(adapter, /MIME_PERMITIDO/);
assert.match(adapter, /LIMITE_BYTES/);
assert.match(adapter, /Hermes\/RN não garante `atob`/);
assert.doesNotMatch(adapter, /globalThis\.atob/);
const biblioteca = fs.readFileSync('src/services/documentosBiblioteca.ts', 'utf8');
assert.match(biblioteca, /supabaseStorageProvider\.enviar/);
assert.match(biblioteca, /arquivoChave/);
assert.match(biblioteca, /Crypto\.digest/);
assert.doesNotMatch(adapter, /getPublicUrl|service_role|SUPABASE_SERVICE/);

for (const bucket of ['olli-logos', 'olli-fotos', 'olli-documentos']) {
	assert.ok(migration.includes(`'${bucket}'`), `bucket ${bucket} ausente na migration`);
	assert.ok(config.includes(`[storage.buckets.${bucket}]`), `bucket ${bucket} ausente no config local`);
}
assert.match(migration, /public, file_size_limit/);
assert.match(migration, /false, 5242880/);
assert.match(migration, /public\.donos_visiveis\(\)/);
for (const operacao of ['select', 'insert', 'update', 'delete']) {
	assert.match(migration, new RegExp(`for ${operacao} to authenticated`));
}
assert.doesNotMatch(migration, /to anon|to public/i);

console.log('OK — Storage privado, URLs assinadas, limites e RLS por tenant validados.');
