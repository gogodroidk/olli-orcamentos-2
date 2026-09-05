import {
  NOTIFICATION_INBOX_ACTIONS,
  NOTIFICATION_INBOX_JOURNAL_VERSION,
  aplicarComandoInbox,
  criarEstadoInbox,
  projetarEstadoInbox,
} from '../worker/src/notificationInboxJournal.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nCentral OLLI — journal persistível local');

const contexto = { userId: 'user-01', tenantId: 'tenant-a' };
const inicio = criarEstadoInbox(contexto, { agora: '2026-09-01T15:00:00Z' });
checar('ações e versão são fechadas', NOTIFICATION_INBOX_ACTIONS.join(',') === 'insert,read,dismiss,purge_expired' && inicio.version === NOTIFICATION_INBOX_JOURNAL_VERSION);
checar('estado inicial tem revision zero', inicio.revision === 0 && inicio.items.length === 0 && inicio.appliedOperations.length === 0);
checar('estado e coleções são imutáveis', Object.isFrozen(inicio) && Object.isFrozen(inicio.items) && Object.isFrozen(inicio.appliedOperations));

const comandoInsert: any = {
  operationId: 'op-insert-01',
  expectedRevision: 0,
  action: 'insert',
  payload: {
    eventId: 'budget.ready',
    tenantId: 'tenant-a',
    kind: 'operational',
    priority: 'normal',
    title: 'Orçamento pronto',
    body: 'Seu orçamento está pronto para revisão.',
  },
};
const inserido: any = aplicarComandoInbox(inicio, comandoInsert, { contexto, agora: '2026-09-01T15:01:00Z' });
checar('insert incrementa revisão e grava item', inserido.aplicada && inserido.motivo === 'inserida' && inserido.revision === 1 && inserido.estado.items.length === 1);
checar('identidade do item vem do contexto', inserido.estado.items[0].userId === 'user-01' && inserido.estado.items[0].tenantId === 'tenant-a');
checar('estado anterior não foi mutado', inicio.revision === 0 && inicio.items.length === 0);
checar('journal guarda só fingerprint do comando', !JSON.stringify(inserido.estado.appliedOperations).includes('Orçamento pronto') && /^[a-f0-9]{64}$/.test(inserido.estado.appliedOperations[0].commandFingerprint));

const replay: any = aplicarComandoInbox(inserido.estado, comandoInsert, { contexto, agora: '2026-09-01T15:02:00Z' });
checar('replay idêntico não reaplica', !replay.aplicada && replay.motivo === 'operacao_duplicada' && replay.estado === inserido.estado && replay.revision === 1);
checar('replay divergente falha fechado', erroCodigo(() => aplicarComandoInbox(inserido.estado, { ...comandoInsert, payload: { ...comandoInsert.payload, title: 'Outro' } }, { contexto, agora: '2026-09-01T15:02:00Z' })) === 'operation_replay_divergente');
checar('nova operação com revisão antiga conflita', erroCodigo(() => aplicarComandoInbox(inserido.estado, { ...comandoInsert, operationId: 'op-stale' }, { contexto, agora: '2026-09-01T15:02:00Z' })) === 'revision_conflict');

const eventoDuplicado: any = aplicarComandoInbox(inserido.estado, { ...comandoInsert, operationId: 'op-insert-02', expectedRevision: 1 }, { contexto, agora: '2026-09-01T15:02:00Z' });
checar('evento duplicado é auditado sem duplicar item', eventoDuplicado.aplicada && eventoDuplicado.motivo === 'evento_duplicado' && eventoDuplicado.revision === 2 && eventoDuplicado.estado.items.length === 1);

const notificationId = eventoDuplicado.estado.items[0].notificationId;
const lido: any = aplicarComandoInbox(eventoDuplicado.estado, { operationId: 'op-read-01', expectedRevision: 2, action: 'read', payload: { notificationId } }, { contexto, agora: '2026-09-01T15:03:00Z' });
checar('read é revisionado e auditável', lido.estado.items[0].status === 'read' && lido.estado.items[0].readAt === '2026-09-01T15:03:00.000Z' && lido.revision === 3);
checar('relógio regressivo falha fechado', erroCodigo(() => aplicarComandoInbox(lido.estado, { operationId: 'op-dismiss-old', expectedRevision: 3, action: 'dismiss', payload: { notificationId } }, { contexto, agora: '2026-09-01T14:00:00Z' })) === 'clock_skew');
checar('outro tenant não acessa estado', erroCodigo(() => projetarEstadoInbox(lido.estado, { contexto: { userId: 'user-01', tenantId: 'tenant-b' } })) === 'escopo_divergente');

const dispensado: any = aplicarComandoInbox(lido.estado, { operationId: 'op-dismiss-01', expectedRevision: 3, action: 'dismiss', payload: { notificationId } }, { contexto, agora: '2026-09-01T15:04:00Z' });
checar('dismiss vira terminal sem reabrir read', dispensado.estado.items[0].status === 'dismissed' && dispensado.estado.items[0].readAt === '2026-09-01T15:03:00.000Z');

const comExpiracao: any = aplicarComandoInbox(dispensado.estado, {
  operationId: 'op-insert-expiring',
  expectedRevision: 4,
  action: 'insert',
  payload: {
    eventId: 'education.tip-01',
    kind: 'education',
    priority: 'low',
    title: 'Dica rápida',
    body: 'Revise os dados antes de enviar.',
    expiresAt: '2026-09-01T16:00:00Z',
  },
}, { contexto, agora: '2026-09-01T15:05:00Z' });
checar('segundo evento entra na revisão esperada', comExpiracao.estado.items.length === 2 && comExpiracao.revision === 5);

const semExpirados: any = aplicarComandoInbox(comExpiracao.estado, { operationId: 'op-purge-01', expectedRevision: 5, action: 'purge_expired' }, { contexto, agora: '2026-09-01T15:30:00Z' });
checar('purge antes da hora preserva itens', semExpirados.motivo === 'nenhum_expirado' && semExpirados.estado.items.length === 2);
const purgado: any = aplicarComandoInbox(semExpirados.estado, { operationId: 'op-purge-02', expectedRevision: 6, action: 'purge_expired' }, { contexto, agora: '2026-09-01T16:00:00Z' });
checar('purge remove somente expirado', purgado.motivo === 'expirados_removidos' && purgado.estado.items.length === 1 && purgado.estado.items[0].notificationId === notificationId);

const projecao: any = projetarEstadoInbox(purgado.estado, { contexto, agora: '2026-09-01T16:01:00Z' });
checar('projeção não expõe journal interno', !('appliedOperations' in projecao) && !('scopeKey' in projecao));
checar('projeção e itens são imutáveis', Object.isFrozen(projecao) && Object.isFrozen(projecao.items) && projecao.items.every(Object.isFrozen));

checar('ação desconhecida falha fechado', erroCodigo(() => aplicarComandoInbox(purgado.estado, { operationId: 'op-unknown', expectedRevision: 7, action: 'send' }, { contexto, agora: '2026-09-01T16:02:00Z' })) === 'action_invalida');
checar('operationId inválido falha fechado', erroCodigo(() => aplicarComandoInbox(purgado.estado, { operationId: '../x', expectedRevision: 7, action: 'purge_expired' }, { contexto, agora: '2026-09-01T16:02:00Z' })) === 'operation_id_invalido');
checar('createdAt futuro falha fechado', erroCodigo(() => aplicarComandoInbox(purgado.estado, { operationId: 'op-future', expectedRevision: 7, action: 'insert', payload: { ...comandoInsert.payload, eventId: 'future', createdAt: '2026-09-01T18:00:00Z' } }, { contexto, agora: '2026-09-01T16:02:00Z' })) === 'created_at_futuro');
checar('tenant forjado no payload falha fechado', erroCodigo(() => aplicarComandoInbox(purgado.estado, { operationId: 'op-forged', expectedRevision: 7, action: 'insert', payload: { ...comandoInsert.payload, eventId: 'forged', tenantId: 'tenant-b' } }, { contexto, agora: '2026-09-01T16:02:00Z' })) === 'tenant_contexto_divergente');

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
