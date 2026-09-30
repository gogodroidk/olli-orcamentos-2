import {
  WELCOME_OUTBOX_CONTRACT_VERSION,
  prepararWelcomeOutbox,
} from '../worker/src/welcomeOutboxContract.js';

let ok = 0;
let falhas = 0;

function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nOnboarding OLLI — contrato confirmação para outbox');

const confirmacao: any = {
  eventId: 'auth-confirmed:user-01',
  userId: 'user-01',
  email: '  Pessoa@EXEMPLO.com ',
  nome: 'Ana Profissional',
  confirmedAt: '2026-09-01T12:00:00-03:00',
  tenantId: 'tenant-forjado',
  html: '<b>não copiar</b>',
  segredo: 'não copiar',
};
const contexto: any = { userId: 'user-01', tenantId: 'tenant-confiavel' };
const estado: any = { jaEnviado: false, jaPendente: false };
const snapshotEntrada = JSON.stringify({ confirmacao, contexto, estado });

const novo: any = prepararWelcomeOutbox(
  confirmacao,
  contexto,
  estado,
  { agora: '2026-09-01T15:00:00.000Z' },
);

checar('contrato expõe versão explícita', novo.version === WELCOME_OUTBOX_CONTRACT_VERSION);
checar('confirmação nova enfileira', novo.enfileirar === true && novo.motivo === 'novo_evento');
checar('evento e item compartilham idempotência', novo.evento.idempotencyKey === novo.item.idempotencyKey);
checar('item nasce pendente', novo.item.status === 'pending' && novo.item.attempts === 0);
checar('tenant vem somente do contexto', novo.evento.tenantId === 'tenant-confiavel' && novo.evento.tenantId !== confirmacao.tenantId);
checar('destinatário é normalizado', novo.evento.recipient === 'pessoa@exemplo.com' && novo.item.recipient === 'pessoa@exemplo.com');
checar('entrada não é mutada', JSON.stringify({ confirmacao, contexto, estado }) === snapshotEntrada);
checar('decisão, evento e item são imutáveis', Object.isFrozen(novo) && Object.isFrozen(novo.evento) && Object.isFrozen(novo.item));

const chavesPublicas = new Set([
  ...Object.keys(novo),
  ...Object.keys(novo.evento),
  ...Object.keys(novo.item),
]);
checar('saída não carrega corpo ou segredo', !['html', 'texto', 'text', 'segredo', 'secret', 'respostaDoProvider'].some((chave) => chavesPublicas.has(chave)));
checar('item não carrega tenant forjado', !Object.values(novo.item).includes('tenant-forjado'));

const repetido: any = prepararWelcomeOutbox(confirmacao, contexto, estado, { agora: '2026-09-01T15:05:00.000Z' });
checar('retry mantém chave determinística', repetido.evento.idempotencyKey === novo.evento.idempotencyKey && repetido.item.idempotencyKey === novo.item.idempotencyKey);

const enviado: any = prepararWelcomeOutbox(confirmacao, contexto, { jaEnviado: true });
checar('já enviado não duplica', enviado.enfileirar === false && enviado.motivo === 'ja_enviado' && !('evento' in enviado) && !('item' in enviado));
checar('decisão de já enviado é imutável', Object.isFrozen(enviado));

const pendente: any = prepararWelcomeOutbox(confirmacao, contexto, { jaPendente: true });
checar('já pendente não duplica', pendente.enfileirar === false && pendente.motivo === 'ja_pendente' && !('evento' in pendente));

const naoConfirmado: any = prepararWelcomeOutbox({ email: 'pessoa@exemplo.com' }, contexto, estado);
checar('não confirmado não enfileira', naoConfirmado.enfileirar === false && naoConfirmado.motivo === 'email_nao_confirmado');

checar('e-mail inválido falha fechado', erroCodigo(() => prepararWelcomeOutbox({ ...confirmacao, email: 'sem-email' }, contexto, estado)) === 'email_invalido');
checar('usuário divergente falha fechado', erroCodigo(() => prepararWelcomeOutbox({ ...confirmacao, userId: 'outro' }, contexto, estado)) === 'usuario_contexto_divergente');
checar('timestamp inválido falha fechado', erroCodigo(() => prepararWelcomeOutbox({ ...confirmacao, confirmed: true, confirmedAt: 'data-impossivel' }, contexto, estado)) === 'confirmed_at_invalido');
checar('relógio inválido falha fechado', erroCodigo(() => prepararWelcomeOutbox(confirmacao, contexto, estado, { agora: 'quando der' })) === 'agora_invalido');

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
