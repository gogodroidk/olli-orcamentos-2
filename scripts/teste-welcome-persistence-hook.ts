import fs from 'node:fs';
import {
  WELCOME_PERSISTENCE_HOOK_VERSION,
  persistirWelcomeConfirmacao,
} from '../worker/src/welcomePersistenceHook.js';

let ok = 0;
let falhas = 0;

function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

async function erroCodigo(fn: () => Promise<unknown>) {
  try { await fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

async function checarErro(nome: string, fn: () => Promise<unknown>, esperado: string) {
  checar(nome, await erroCodigo(fn) === esperado);
}

const userId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const forgedTenantId = '33333333-3333-4333-8333-333333333333';
const confirmacao: any = {
  eventId: 'auth-confirmed:11111111',
  userId,
  email: '  Pessoa@EXEMPLO.com ',
  nome: 'Ana Profissional',
  confirmedAt: '2026-09-04T12:00:00-03:00',
  tenantId: forgedTenantId,
  html: '<b>não copiar</b>',
  segredo: 'não copiar',
};
const contexto: any = { userId, tenantId };
const entradaAntes = JSON.stringify({ confirmacao, contexto });
let chamadas = 0;
let payloadRecebido: any = null;

console.log('\nOnboarding OLLI — adaptador puro do hook para a RPC');

const resultado: any = await persistirWelcomeConfirmacao(confirmacao, contexto, {
  enfileirar: async (payload: any) => {
    chamadas++;
    payloadRecebido = payload;
    return {
      eventId: payload.eventId,
      idempotencyKey: payload.idempotencyKey,
      eventInserted: true,
      outboxInserted: true,
      status: 'pending',
    };
  },
});

checar('versão explícita', resultado.version === WELCOME_PERSISTENCE_HOOK_VERSION);
checar('RPC é chamada uma vez', chamadas === 1);
checar('payload contém somente os campos da RPC', JSON.stringify(Object.keys(payloadRecebido).sort()) === JSON.stringify(['confirmedAt', 'eventId', 'idempotencyKey', 'recipient', 'source', 'tenantId', 'userId'].sort()));
checar('tenant vem do contexto confiável', payloadRecebido.tenantId === tenantId && payloadRecebido.tenantId !== forgedTenantId);
checar('e-mail é normalizado', payloadRecebido.recipient === 'pessoa@exemplo.com');
checar('idempotência é preservada', payloadRecebido.idempotencyKey === 'welcome:11111111-1111-4111-8111-111111111111:boas_vindas.v1');
checar('resultado expõe somente projeção sanitizada', JSON.stringify(Object.keys(resultado).sort()) === JSON.stringify(['eventId', 'eventInserted', 'idempotencyKey', 'outboxInserted', 'status', 'version'].sort()));
checar('resultado não carrega PII/body/segredo', !['recipient', 'name', 'html', 'texto', 'secret', 'providerId'].some((chave) => chave in resultado));
checar('payload e resultado são imutáveis', Object.isFrozen(payloadRecebido) && Object.isFrozen(resultado));
checar('entrada original não é mutada', JSON.stringify({ confirmacao, contexto }) === entradaAntes);

await checarErro('não confirmado falha antes da RPC', async () => persistirWelcomeConfirmacao({ email: confirmacao.email }, contexto, { enfileirar: async () => { chamadas++; return {} as any; } }), 'email_nao_confirmado');
await checarErro('usuário não-UUID falha antes da RPC', async () => persistirWelcomeConfirmacao({ ...confirmacao, userId: 'user-01' }, { ...contexto, userId: 'user-01' }, { enfileirar: async () => { chamadas++; return {} as any; } }), 'usuario_uuid_invalido');
await checarErro('tenant não-UUID falha fechado', async () => persistirWelcomeConfirmacao(confirmacao, { ...contexto, tenantId: 'tenant-01' }, { enfileirar: async () => { chamadas++; return {} as any; } }), 'tenant_uuid_invalido');
await checarErro('dependência ausente falha fechado', async () => persistirWelcomeConfirmacao(confirmacao, contexto, {}), 'dependencia_enfileirar_obrigatoria');
await checarErro('erro da RPC não é engolido', async () => persistirWelcomeConfirmacao(confirmacao, contexto, { enfileirar: async () => { throw new Error('rpc_fora'); } }), 'rpc_fora');

const respostaBase = {
  eventId: 'auth-confirmed:11111111',
  idempotencyKey: 'welcome:11111111-1111-4111-8111-111111111111:boas_vindas.v1',
  eventInserted: true,
  outboxInserted: true,
  status: 'pending',
};
await checarErro('evento divergente falha fechado', async () => persistirWelcomeConfirmacao(confirmacao, contexto, { enfileirar: async () => ({ ...respostaBase, eventId: 'outro' }) }), 'rpc_resultado_evento_divergente');
await checarErro('idempotência divergente falha fechado', async () => persistirWelcomeConfirmacao(confirmacao, contexto, { enfileirar: async () => ({ ...respostaBase, idempotencyKey: 'outro' }) }), 'rpc_resultado_idempotencia_divergente');
await checarErro('campo extra na resposta falha fechado', async () => persistirWelcomeConfirmacao(confirmacao, contexto, { enfileirar: async () => ({ ...respostaBase, recipient: 'pessoa@exemplo.com' }) }), 'rpc_resultado_formato_invalido');
await checarErro('booleano inválido na resposta falha fechado', async () => persistirWelcomeConfirmacao(confirmacao, contexto, { enfileirar: async () => ({ ...respostaBase, eventInserted: 'true' }) }), 'rpc_resultado_event_inserted_invalido');
await checarErro('status diferente de pending falha fechado', async () => persistirWelcomeConfirmacao(confirmacao, contexto, { enfileirar: async () => ({ ...respostaBase, status: 'sent' }) }), 'rpc_resultado_status_invalido');

const fonte = fs.readFileSync(new URL('../worker/src/welcomePersistenceHook.js', import.meta.url), 'utf8');
const fonteExecutavel = fonte
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');
checar('adaptador não faz fetch próprio', !/\bfetch\s*\(/.test(fonteExecutavel));
checar('adaptador não importa Supabase/provider', !/supabase|resend|service_role|api[_-]?key/i.test(fonteExecutavel));
checar('adaptador não guarda body/template HTML', !/\b(html|body|providerResponse)\s*:/i.test(fonteExecutavel));

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
