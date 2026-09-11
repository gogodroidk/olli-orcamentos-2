import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const migrationPath = path.join(
  repoRoot,
  'supabase',
  'migrations',
  '20260904205858_email_welcome_outbox.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const enqueueStart = sql.indexOf('create or replace function public.enqueue_welcome_email');
const enqueueEnd = sql.indexOf('\n$$;', enqueueStart);
const enqueueSql = enqueueStart >= 0 && enqueueEnd >= 0
  ? sql.slice(enqueueStart, enqueueEnd + 4)
  : '';
let ok = 0;
let falhas = 0;

function checar(nome: string, condicao: unknown) {
  if (condicao) {
    console.log('  ok   ' + nome);
    ok++;
  } else {
    console.error('  FALHA ' + nome);
    falhas++;
  }
}

console.log('\nOLLI — migration de persistência do welcome');
checar('arquivo foi gerado em supabase/migrations', migrationPath.includes(`${path.sep}supabase${path.sep}migrations${path.sep}`));
checar('declara tabela de eventos', /create table if not exists public\.email_welcome_events/i.test(sql));
checar('declara tabela de outbox', /create table if not exists public\.email_outbox/i.test(sql));
checar('evento é idempotente por event_id', /email_welcome_events_event_id_uidx/i.test(sql));
checar('evento é idempotente por chave', /email_welcome_events_idempotency_uidx/i.test(sql));
checar('outbox é idempotente por chave', /email_outbox_idempotency_uidx/i.test(sql));
checar('outbox vincula evento por FK', /references public\.email_welcome_events \(event_id\) on delete cascade/i.test(sql));
checar('estados da outbox coincidem com o contrato', /pending.*sending.*sent.*failed.*dead_letter/s.test(sql));
checar('teto de tentativas é cinco', /attempts\s+integer[^\n]*check \(attempts between 0 and 5\)/i.test(sql));
checar('RLS habilitada nos eventos', /alter table public\.email_welcome_events enable row level security/i.test(sql));
checar('RLS forçada nos eventos', /alter table public\.email_welcome_events force row level security/i.test(sql));
checar('RLS habilitada na outbox', /alter table public\.email_outbox enable row level security/i.test(sql));
checar('RLS forçada na outbox', /alter table public\.email_outbox force row level security/i.test(sql));
checar('clientes não recebem grants', /revoke all on table public\.email_welcome_events from public, anon, authenticated/i.test(sql)
  && /revoke all on table public\.email_outbox from public, anon, authenticated/i.test(sql));
checar('Worker recebe grants explícitos mínimos', /grant select, insert, update, delete on table public\.email_welcome_events to service_role/i.test(sql)
  && /grant select, insert, update, delete on table public\.email_outbox to service_role/i.test(sql));
checar('RPC pública é security invoker', /security invoker[\s\S]*set search_path = ''/i.test(enqueueSql));
checar('RPC pública não é security definer', !/security definer/i.test(enqueueSql));
checar('RPC pública revoga clientes e libera só service_role', /revoke all on function public\.enqueue_welcome_email[\s\S]*from public, anon, authenticated/i.test(sql)
  && /grant execute on function public\.enqueue_welcome_email[\s\S]*to service_role/i.test(sql));
checar('RPC valida tenant pelo contexto', /organizacao_membros[\s\S]*m\.org_id = p_tenant_id[\s\S]*m\.user_id = p_user_id/i.test(sql));
checar('RPC usa conflito idempotente', (sql.match(/on conflict \([^)]*\) do nothing/gi) || []).length >= 2);
checar('RPC rejeita replay divergente', /welcome_event_replay_divergente/i.test(sql) && /welcome_outbox_replay_divergente/i.test(sql));
checar('retorno da RPC não devolve destinatário', /return pg_catalog\.jsonb_build_object[\s\S]*'status', 'pending'/i.test(enqueueSql)
  && !/jsonb_build_object[\s\S]*recipient/i.test(enqueueSql));
checar('trigger privilegiado fica no schema privado', /create or replace function private\.handle_auth_email_confirmed\(\)[\s\S]*security definer[\s\S]*set search_path = ''/i.test(sql));
checar('trigger é separado do sync de perfil', /create trigger on_auth_user_welcome_insert/i.test(sql)
  && /create trigger on_auth_user_welcome_confirmed/i.test(sql)
  && !/create or replace function public\.sync_profile_from_auth/i.test(sql));
checar('trigger cobre confirmação no insert e update', /after insert on auth\.users/i.test(sql)
  && /after update of email_confirmed_at on auth\.users/i.test(sql)
  && /old\.email_confirmed_at is null and new\.email_confirmed_at is not null/i.test(sql));
checar('falha de welcome não bloqueia Auth', /exception[\s\S]*when others[\s\S]*raise warning 'olli_welcome_hook_failed sqlstate=%'[\s\S]*return new/i.test(sql));
checar('log de falha não imprime e-mail nem usuário', /raise warning 'olli_welcome_hook_failed sqlstate=%', sqlstate/i.test(sql));
checar('PII tem ciclo de purge explícito', /pii_purged_at\s+timestamptz/i.test(sql)
  && /status in \('sent', 'dead_letter'\)[\s\S]*interval '30 days'/i.test(sql)
  && /interval '1 year'/i.test(sql));
checar('purge não é agendado automaticamente', !/(cron\.schedule|pg_cron|create extension[^;]*cron)/i.test(sql));
checar('não guarda colunas HTML, corpo ou payload', !/\b(html|body|provider_response|payload)\s+(text|varchar|jsonb|json|bytea)/i.test(sql));
checar('não contém DROP destrutivo executável', !/^\s*(drop|truncate)\s+/im.test(sql));
checar('não contém URL, chave ou segredo', !/(https?:\/\/|api[_-]?key|access[_-]?token|password|service_role_key)/i.test(sql));

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
