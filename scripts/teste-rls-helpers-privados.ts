/**
 * Contrato estático dos helpers de RLS fora do schema exposto.
 *
 * O banco live não é tocado por este teste. Ele prende os invariantes que
 * precisam acompanhar a migration até a janela autorizada: implementação
 * privilegiada em `private`, wrappers públicos invoker, identidade por
 * `auth.uid()`, e nenhum EXECUTE anônimo/público.
 */
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260906120000_rls_helpers_private_schema.sql', 'utf8');
let ok = 0;
let falhas = 0;

function checar(nome: string, condicao: unknown): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

const privados = ['eh_membro_ativo', 'eh_gestao', 'eh_admin_org', 'donos_visiveis', 'perfil_visivel'];
const bloco = (nome: string, schema: 'private' | 'public'): string => {
  const inicio = sql.indexOf(`function ${schema}.${nome}`);
  if (inicio < 0) return '';
  const fim = sql.indexOf('$$;', inicio);
  return fim < 0 ? sql.slice(inicio) : sql.slice(inicio, fim + 3);
};

console.log('\nSupabase — helpers de RLS no schema privado');
checar('schema private é criado', /create schema if not exists private;/i.test(sql));
checar('schema private não é público', /revoke all on schema private from public;/i.test(sql));
checar('schema private não entra no Data API local', !/schemas\s*=\s*\[[^\]]*private/i.test(readFileSync('supabase/config.toml', 'utf8')));
checar('usage privado é explícito', /grant usage on schema private to authenticated, service_role;/i.test(sql));

for (const nome of privados) {
  const interno = bloco(nome, 'private');
  const publico = bloco(nome, 'public');
  checar(`${nome} tem implementação privada`, interno.length > 0);
  checar(`${nome} privado é SECURITY DEFINER`, /security definer/i.test(interno));
  checar(`${nome} privado trava search_path`, /set search_path\s*=\s*''/i.test(interno));
  checar(`${nome} privado usa auth.uid()`, /auth\.uid\(\)/i.test(interno));
  checar(`${nome} público é SECURITY INVOKER`, /security invoker/i.test(publico));
  checar(`${nome} público delega ao private`, new RegExp(`private\\.${nome}\\(`, 'i').test(publico));
  checar(`${nome} não libera EXECUTE para anon/public`, new RegExp(`revoke all on function public\\.${nome}\\([^) ]*\\) from public, anon;`, 'i').test(sql));
  checar(`${nome} libera apenas authenticated/service_role`, new RegExp(`grant execute on function public\\.${nome}\\([^) ]*\\) to authenticated, service_role;`, 'i').test(sql));
}

checar('perfil privado usa a implementação privada de eh_gestao', /private\.eh_gestao\(meu\.org_id\)/i.test(bloco('perfil_visivel', 'private')));
checar('donos_visiveis mantém união do usuário atual', /select \(select auth\.uid\(\)\)\s+union/i.test(bloco('donos_visiveis', 'private')));
checar('nenhum helper público novo é SECURITY DEFINER', privados.every((nome) => !/security definer/i.test(bloco(nome, 'public'))));

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
