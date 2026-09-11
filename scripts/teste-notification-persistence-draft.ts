import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}

console.log('\nNotificações OLLI — draft de persistência');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = path.join(root, 'docs', 'ONDA_3', 'JANELA_3_4_NOTIFICATION_PERSISTENCIA', '20260904_notification_persistence.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const lower = sql.toLowerCase();
const tables = [
  'notification_inbox_scopes',
  'notification_inbox_items',
  'notification_inbox_operations',
  'push_device_registrations',
  'notification_delivery_scopes',
  'notification_delivery_entries',
  'notification_delivery_operations',
];

checar('arquivo permanece fora de supabase/migrations', !sqlPath.toLowerCase().includes(`${path.sep}supabase${path.sep}migrations${path.sep}`));
checar('cabeçalho marca LOCAL_ONLY e não aplicar', /local_only[\s\S]*n[aã]o aplicar/i.test(sql));
checar('sete tabelas explícitas estão presentes', tables.every((table) => lower.includes(`create table public.${table}`)));
checar('todas as tabelas habilitam RLS', (lower.match(/enable row level security/g) || []).length === tables.length);
checar('todas as tabelas forçam RLS', (lower.match(/force row level security/g) || []).length === tables.length);
checar('clientes não recebem grants', lower.includes('from public, anon, authenticated') && !/grant[\s\S]{0,120}\bto\s+(anon|authenticated)\b/i.test(sql));
checar('service_role é o único papel com grants', (lower.match(/to service_role/g) || []).length >= 3);
checar('escopo pessoal trata tenant nulo como uma identidade', lower.includes('nulls not distinct'));
checar('FKs de usuário e organização usam cascade', lower.includes('references auth.users (id) on delete cascade') && lower.includes('references public.organizacoes (id) on delete cascade'));
checar('FKs possuem índices úteis para cascade', lower.includes('notification_inbox_scopes_user_idx') && lower.includes('push_device_registrations_user_idx'));
checar('inbox deduplica evento e notification_id por escopo', lower.includes('notification_inbox_items_event_unique') && lower.includes('notification_inbox_items_id_unique'));
checar('journals registram operação, hash e revisão', lower.includes('operation_id') && lower.includes('command_fingerprint') && lower.includes('command_hash') && lower.includes('revision'));
checar('revisões e operações são únicas por escopo', lower.includes('notification_inbox_operations_revision_unique') && lower.includes('notification_delivery_operations_revision_unique'));
checar('device guarda fingerprint HMAC e nunca token bruto', lower.includes('token_fingerprint') && lower.includes("token_fingerprint ~ '^[a-f0-9]{64}$'") && !/\b(push_)?token\s+(text|varchar|character|bytea)/i.test(sql));
checar('identidade da fingerprint tem key id sem segredo', lower.includes('fingerprint_key_id') && !/\b(secret|password|credential|api_key)\s+(text|varchar|character|bytea)/i.test(sql));
checar('estado terminal do device exige motivo e timestamp', lower.includes('push_device_registrations_terminal_check') && lower.includes('revoked_at is not null') && lower.includes('terminal_reason is not null'));
checar('entregas deduplicam event/channel', lower.includes('notification_delivery_entries_identity_unique'));
checar('nenhum provider ou destinatário é persistido', !/\b(provider|recipient|destination|address)\s+(text|varchar|character|bytea)/i.test(sql));
checar('inbox e journals limitam retenção a 90 dias', (lower.match(/interval '90 days'/g) || []).length >= 4);
checar('purge é paginado e usa skip locked', lower.includes('purge_expired_notification_data') && lower.includes('for update skip locked') && lower.includes('p_batch_limit > 1000'));
checar('purge usa SECURITY INVOKER e search_path vazio', lower.includes('security invoker') && lower.includes("set search_path = ''"));
checar('execução pública do purge é revogada', lower.includes('revoke execute on function public.purge_expired_notification_data') && lower.includes('from public, anon, authenticated'));
checar('draft não contém DDL destrutivo amplo', !/\b(drop table|truncate|drop schema)\b/i.test(sql));
checar('draft explicita atomicidade futura de CAS', /cas \+ replay \+ mutation atomicamente/i.test(lower));
checar('draft não cria policy permissiva', !/create\s+policy/i.test(sql));

if (falhas) {
  console.error('\nFALHOU: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(1);
}
console.log('\nPASSOU: ' + ok + ' ok, 0 falhas');
