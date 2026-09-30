import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260904212747_email_welcome_dispatch_runtime.sql'), 'utf8');
const consumer = fs.readFileSync(path.join(root, 'worker', 'src', 'welcomeOutboxConsumer.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'worker', 'src', 'index.js'), 'utf8');
const wrangler = fs.readFileSync(path.join(root, 'worker', 'wrangler.jsonc'), 'utf8');
const rpc = fs.readFileSync(path.join(root, 'worker', 'src', 'emailRpc.js'), 'utf8');
const producao = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260929200000_email_producao_lembretes.sql'), 'utf8');
const producaoSemComentario = producao.replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '');
// Bloco de vars de produção (topo) x staging (env.staging): o staging vem depois de `"staging": {`.
const inicioStaging = wrangler.indexOf('"staging": {');
const varsProducao = wrangler.slice(0, inicioStaging);
const varsStaging = wrangler.slice(inicioStaging);

console.log('\nOLLI — dispatch runtime do welcome');
checar('migration foi criada pela CLI no diretório canônico', sql.length > 1000);
checar('confirmações ficam em hold por padrão', /dispatch_scope text not null default 'hold'/.test(sql));
checar('scope possui allowlist fechada', /'hold', 'simulator', 'production'/.test(sql));
checar('uma conta recebe uma vez por versão', /unique index[\s\S]*user_id, template_version/.test(sql));
checar('claim usa SKIP LOCKED', /for update skip locked/i.test(sql));
checar('claim possui token criptográfico', /pg_catalog\.gen_random_uuid\(\)/.test(sql));
checar('claim possui lease limitado', /p_lease_seconds < 30[\s\S]*p_lease_seconds > 300/.test(sql));
checar('claim recupera sending com lease expirado', /status = 'sending'[\s\S]*lease_expires_at <= p_now/.test(sql));
checar('claim respeita teto de cinco', /attempts < 5/.test(sql));
checar('settle faz CAS por token e tentativa', /claim_token = p_claim_token[\s\S]*attempts = p_attempts/.test(sql));
checar('settle só agenda retry abaixo do teto', /v_retryable and v_attempts < 5/.test(sql));
checar('funções são invoker', (sql.match(/security invoker/gi) || []).length >= 2);
checar('funções não são definer', !/security definer/i.test(sql));
checar('funções revogam clientes', (sql.match(/from public, anon, authenticated/gi) || []).length === 2);
checar('funções liberam somente service_role', (sql.match(/to service_role/gi) || []).length === 2);
checar('migration não altera trigger de Auth', !/create\s+trigger|drop\s+trigger|alter\s+table\s+auth\.users/i.test(sql));
checar('migration não possui DROP ou TRUNCATE', !/^\s*(drop|truncate)\b/im.test(sql));
checar('consumer exige scope exato', /claim\.dispatchScope === mode/.test(consumer));
checar('simulador aceita só endereço oficial', /SIMULATOR_RECIPIENT = 'delivered@resend\.dev'/.test(consumer));
checar('consumer usa adapter Resend testado', /criarResendTransactionalAdapter/.test(consumer));
checar('consumer usa renderer testado', /renderizarEmailBoasVindas/.test(consumer));
checar('respostas externas têm leitura limitada', /lerJsonLimitado/.test(consumer) && /EMAIL_RPC_MAX_RESPONSE_BYTES/.test(rpc) && /reader\.cancel/.test(rpc));
checar('scheduled registra a Promise no contexto', /ctx\.waitUntil\(processarWelcomeOutbox\(env\)\)/.test(index));
checar('cron está configurado', /"crons"\s*:\s*\["\* \* \* \* \*"\]/.test(wrangler));
checar('produção envia de verdade (dono autorizou em 29/09)', /"WELCOME_DISPATCH_MODE"\s*:\s*"production"/.test(varsProducao));
checar('staging continua sem envio', /"WELCOME_DISPATCH_MODE"\s*:\s*"off"/.test(varsStaging) && !/"WELCOME_DISPATCH_MODE"\s*:\s*"production"/.test(varsStaging));
checar('lembretes ligados só na produção', /"EMAIL_LEMBRETES_MODE"\s*:\s*"production"/.test(varsProducao) && /"EMAIL_LEMBRETES_MODE"\s*:\s*"off"/.test(varsStaging));
checar('batch de produção é pequeno (3) e o de staging, um', /"WELCOME_BATCH_LIMIT"\s*:\s*"3"/.test(varsProducao) && /"WELCOME_BATCH_LIMIT"\s*:\s*"1"/.test(varsStaging));
checar('URL de descadastro aponta para a rota do worker', /"EMAIL_DESCADASTRO_URL"\s*:\s*"https:\/\/diagnostico\.olliorcamentos\.online\/email\/descadastrar"/.test(varsProducao));
checar('scheduled também roda a seleção de lembretes', /ctx\.waitUntil\(processarLembretesEmail\(env/.test(index));

console.log('\nOLLI — migration de produção + lembretes (20260929200000)');
checar('boas-vindas antigas presas em hold são descartadas sem envio', /update public\.email_outbox o\s+set status = 'dead_letter',\s+error_code = 'descartado_antes_do_envio'[\s\S]*?o\.status = 'pending'\s+and o\.dispatch_scope = 'hold'/.test(producaoSemComentario));
checar('descarte não finge tentativa (attempts = 0 permitido só para descarte/supressão)', /attempts = 0\s+and error_code in \('descartado_antes_do_envio', 'suprimido_antes_do_envio'\)/.test(producaoSemComentario));
checar('escopo das linhas NOVAS vem da config (trigger BEFORE INSERT)', /before insert on public\.email_outbox/.test(producaoSemComentario) && /private\.email_dispatch_config/.test(producaoSemComentario));
checar('config liga boas-vindas e lembretes em production', /values \('boas_vindas', 'production'\), \('lembretes', 'production'\)/.test(producaoSemComentario));
checar('trigger não mexe em linhas antigas (só INSERT)', !/before update on public\.email_outbox|after update on public\.email_outbox/.test(producaoSemComentario));
checar('catálogo de modelos é fechado', /email_outbox_template_catalogo_check[\s\S]*'lembrete_ativacao', 'lembrete_ativacao\.v1', 'activation_reminder'[\s\S]*'lembrete_assinatura', 'lembrete_assinatura\.v1', 'billing_reminder'/.test(producaoSemComentario));
checar('parâmetros do lembrete são pequenos (≤ 1 KiB) e sem HTML', /pg_column_size\(template_dados\) <= 1024/.test(producaoSemComentario));
checar('supressão por conta com RLS forçada e sem acesso de cliente', /create table if not exists public\.email_supressoes/.test(producaoSemComentario) && /alter table public\.email_supressoes force row level security/.test(producaoSemComentario) && /revoke all on table public\.email_supressoes from public, anon, authenticated/.test(producaoSemComentario));
checar('descadastro cancela lembretes pendentes', /error_code = 'suprimido_antes_do_envio'[\s\S]*o\.status in \('pending', 'failed'\)/.test(producaoSemComentario));
checar('enqueue amarra a chave à conta', /lembrete_chave_divergente/.test(producaoSemComentario));
checar('enqueue serializa por conta (advisory lock)', /pg_advisory_xact_lock/.test(producaoSemComentario));
checar('enqueue: 2 ativações no máximo, 48h entre elas', />= 2 then[\s\S]*teto_ativacao/.test(producaoSemComentario) && /interval '48 hours'[\s\S]*intervalo_minimo/.test(producaoSemComentario));
checar('enqueue: 1 cobrança por semana (sequência de renovação conta uma)', /interval '7 days'[\s\S]*sequencia[\s\S]*limite_semanal/.test(producaoSemComentario));
checar('enqueue: nunca cobrança para conta sem orçamento', /v_orcamentos < 1 then[\s\S]*conta_sem_orcamento/.test(producaoSemComentario));
checar('enqueue: teto diário global', /teto_diario/.test(producaoSemComentario));
checar('candidatos não devolvem e-mail', !/'email'\s*,\s*u\.email|'recipient'/.test(producaoSemComentario.slice(producaoSemComentario.indexOf('listar_candidatos_lembrete_email'), producaoSemComentario.indexOf('enqueue_lembrete_email'))));
const definers = (producaoSemComentario.match(/security definer/gi) || []).length;
const searchPathVazio = (producaoSemComentario.match(/set search_path = ''/g) || []).length;
checar('toda função da migration fixa search_path vazio', searchPathVazio >= definers + 2);
const novasRpcs = ['registrar_supressao_email(uuid, text, text)', 'registrar_supressao_email_por_provider(text, text)', 'listar_candidatos_lembrete_email(timestamptz, integer, integer)', 'enqueue_lembrete_email(uuid, text, text, text, text, jsonb, integer, timestamptz)'];
checar('RPCs novas: revogadas de cliente e liberadas só ao service_role', novasRpcs.every((f) => producaoSemComentario.includes(`revoke all on function public.${f}\n  from public, anon, authenticated;`) && producaoSemComentario.includes(`grant execute on function public.${f}\n  to service_role;`)));
checar('claim recriado continua invoker e só para service_role', /create function public\.claim_email_welcome_outbox[\s\S]*?security invoker[\s\S]*?grant execute on function public\.claim_email_welcome_outbox\(text, text, integer, integer, timestamptz\)\s+to service_role/.test(producaoSemComentario));
checar('claim devolve user_id e template_dados', /dispatch_scope text,\s+user_id uuid,\s+template_dados jsonb/.test(producaoSemComentario));
checar('migration não apaga tabela nem dados (sem DROP TABLE/TRUNCATE/DELETE fora do purge)', !/drop\s+table|truncate/i.test(producaoSemComentario) && (producaoSemComentario.match(/delete from/gi) || []).length === 2);
checar('não há segredo literal nos novos arquivos', !/(sb_secret_|service_role_key\s*=|re_[A-Za-z0-9]{20,})/.test(sql + consumer + wrangler));

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
