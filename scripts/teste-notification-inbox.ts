import {
  NOTIFICATION_INBOX_STATES,
  criarNotificacao,
  dispensarNotificacao,
  inserirNotificacao,
  listarNotificacoes,
  marcarLida,
  estadoTerminal,
} from '../worker/src/notificationInbox.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nCentral in-app OLLI — contrato local');
const contexto = { userId: 'user-01', tenantId: 'tenant-a' };
const outraConta = { userId: 'user-02', tenantId: 'tenant-b' };
const base = {
  eventId: 'budget.ready',
  kind: 'operational',
  priority: 'normal',
  title: 'Orçamento pronto',
  body: 'Seu orçamento já pode ser revisado.',
};

checar('estados da inbox são fechados', NOTIFICATION_INBOX_STATES.join(',') === 'unread,read,dismissed');
const item = criarNotificacao({ ...base, title: '  Orçamento\npronto  ', body: '<script>não executar</script> pronto' }, { contexto, agora: '2026-08-31T12:00:00.000Z' });
checar('identidade vem do contexto confiável', item.userId === 'user-01' && item.tenantId === 'tenant-a' && item.channel === 'in_app');
checar('texto fica plain-text e limitado', !/[\r\n]/.test(item.title) && !item.title.includes('<script>'));
checar('item nasce não lido', item.status === 'unread' && item.readAt === null && item.dismissedAt === null);
checar('URL externa insegura falha fechado', erroCodigo(() => criarNotificacao({ ...base, actionUrl: 'javascript:alert(1)' }, { contexto, agora: '2026-08-31T12:00:00Z' })) === 'action_url_invalida');
checar('tenant do payload divergente falha fechado', erroCodigo(() => criarNotificacao({ ...base, tenantId: 'tenant-b' }, { contexto, agora: '2026-08-31T12:00:00Z' })) === 'tenant_contexto_divergente');
checar('kind desconhecido falha fechado', erroCodigo(() => criarNotificacao({ ...base, kind: 'marketing' }, { contexto, agora: '2026-08-31T12:00:00Z' })) === 'kind_invalido');

const primeira = inserirNotificacao([], item);
const duplicada = inserirNotificacao(primeira.lista, criarNotificacao(base, { contexto, agora: '2026-08-31T12:01:00Z' }));
checar('primeiro evento entra uma vez', primeira.inserida && primeira.lista.length === 1);
checar('retry do mesmo evento é idempotente', !duplicada.inserida && duplicada.motivo === 'evento_duplicado' && duplicada.lista.length === 1);
const isolada = inserirNotificacao(duplicada.lista, criarNotificacao(base, { contexto: outraConta, agora: '2026-08-31T12:02:00Z' }));
checar('mesmo event_id em outro tenant não colide', isolada.inserida && isolada.lista.length === 2);

const expirando = criarNotificacao({ ...base, eventId: 'old', expiresAt: '2026-08-31T12:30:00Z' }, { contexto, agora: '2026-08-31T12:00:00Z' });
const estado = inserirNotificacao(isolada.lista, expirando).lista;
const visiveis = listarNotificacoes(estado, { contexto, agora: '2026-08-31T12:10:00Z' });
const expirados = listarNotificacoes(estado, { contexto, agora: '2026-08-31T13:00:00Z' });
checar('listagem filtra pelo tenant e respeita expiração', visiveis.length === 2 && expirados.length === 1);
checar('listagem de outra conta não vaza dados', listarNotificacoes(estado, { contexto: outraConta }).length === 1);

const lida = marcarLida(estado, item.notificationId, { contexto, agora: '2026-08-31T12:11:00Z' });
const lidaNovamente = marcarLida(lida.lista, item.notificationId, { contexto, agora: '2026-08-31T12:12:00Z' });
checar('marcar lida é auditável', lida.alterada && lida.lista.find((x) => x.notificationId === item.notificationId)?.status === 'read');
checar('repetir leitura não altera o carimbo', !lidaNovamente.alterada && lidaNovamente.lista.find((x) => x.notificationId === item.notificationId)?.readAt === '2026-08-31T12:11:00.000Z');
checar('outro tenant não pode marcar item alheio', !marcarLida(estado, item.notificationId, { contexto: outraConta, agora: '2026-08-31T12:12:00Z' }).alterada);
const dispensada = dispensarNotificacao(lida.lista, item.notificationId, { contexto, agora: '2026-08-31T12:13:00Z' });
const dispensadaNovamente = dispensarNotificacao(dispensada.lista, item.notificationId, { contexto, agora: '2026-08-31T12:14:00Z' });
checar('dispensa vira estado terminal', dispensada.lista.find((x) => x.notificationId === item.notificationId)?.status === 'dismissed' && estadoTerminal(dispensada.lista.find((x) => x.notificationId === item.notificationId)));
checar('repetir dispensa não reabre nem altera', !dispensadaNovamente.alterada && dispensadaNovamente.lista.find((x) => x.notificationId === item.notificationId)?.dismissedAt === '2026-08-31T12:13:00.000Z');
checar('operação não muta a lista original', estado.find((x) => x.notificationId === item.notificationId)?.status === 'unread');

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
