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
checar('respostas externas têm leitura limitada', /MAX_RESPONSE_BYTES/.test(consumer) && /reader\.cancel/.test(consumer));
checar('scheduled registra a Promise no contexto', /ctx\.waitUntil\(processarWelcomeOutbox\(env\)\)/.test(index));
checar('cron está configurado', /"crons"\s*:\s*\["\* \* \* \* \*"\]/.test(wrangler));
checar('deploy inicial permanece em simulator', /"WELCOME_DISPATCH_MODE"\s*:\s*"simulator"/.test(wrangler));
checar('batch inicial é exatamente um', /"WELCOME_BATCH_LIMIT"\s*:\s*"1"/.test(wrangler));
checar('não há segredo literal nos novos arquivos', !/(sb_secret_|service_role_key\s*=|re_[A-Za-z0-9]{20,})/.test(sql + consumer + wrangler));

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
