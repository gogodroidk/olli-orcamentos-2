import {
  WELCOME_EVENT_VERSION,
  WELCOME_TEMPLATE_VERSION,
  criarEventoBoasVindas,
  decidirWelcome,
} from '../worker/src/welcomeEvent.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nOnboarding OLLI — evento determinístico de boas-vindas');

const confirmacao: any = {
  userId: 'user-01',
  email: '  Pessoa@EXEMPLO.com\n',
  nome: 'Ana\r\nProfissional',
  confirmedAt: '2026-08-31T12:00:00-03:00',
  // Dado não confiável: não pode escolher o tenant do evento.
  tenantId: 'tenant-forjado',
};
const contexto = { userId: 'user-01', tenantId: 'tenant-confiavel' };
const evento = criarEventoBoasVindas(confirmacao, contexto);
const repetido = criarEventoBoasVindas(confirmacao, contexto);

checar('evento tem tipo e versão', evento.type === 'email.welcome.requested' && evento.version === WELCOME_EVENT_VERSION && evento.templateVersion === WELCOME_TEMPLATE_VERSION);
checar('destinatário normalizado', evento.recipient === 'pessoa@exemplo.com');
checar('nome remove quebras de linha', evento.name === 'Ana Profissional');
checar('tenant vem do contexto confiável', evento.tenantId === 'tenant-confiavel');
checar('payload não troca tenant', evento.tenantId !== confirmacao.tenantId);
checar('finalidade é transacional de onboarding', evento.purpose === 'account_onboarding' && evento.template === 'boas_vindas');
checar('idempotência é estável em retry', evento.idempotencyKey === repetido.idempotencyKey && evento.eventId === repetido.eventId);
checar('evento é imutável', (() => { try { (evento as any).recipient = 'outro@exemplo.com'; return false; } catch { return true; } })());

checar('confirmação nova enfileira', decidirWelcome({ confirmado: true }).enfileirar === true);
checar('retry enviado não duplica', decidirWelcome({ confirmado: true, jaEnviado: true }).motivo === 'ja_enviado');
checar('retry pendente não duplica', decidirWelcome({ confirmado: true, jaPendente: true }).motivo === 'ja_pendente');
checar('cadastro não confirmado fica fora', decidirWelcome({ confirmado: false }).motivo === 'email_nao_confirmado');

checar('contexto de usuário é obrigatório', erroCodigo(() => criarEventoBoasVindas(confirmacao, {})) === 'contexto_usuario_obrigatorio');
checar('e-mail inválido falha fechado', erroCodigo(() => criarEventoBoasVindas({ ...confirmacao, email: 'sem-email' }, contexto)) === 'email_invalido');
checar('timestamp inválido falha fechado', erroCodigo(() => criarEventoBoasVindas({ ...confirmacao, confirmed: true, confirmedAt: 'amanhã' }, contexto)) === 'confirmed_at_invalido');
checar('usuário do payload divergente falha fechado', erroCodigo(() => criarEventoBoasVindas({ ...confirmacao, userId: 'outro' }, contexto)) === 'usuario_contexto_divergente');

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
