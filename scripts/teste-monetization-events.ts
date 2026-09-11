import {
  MONETIZATION_EVENT_TYPES,
  MONETIZATION_EVENT_VERSION,
  MONETIZATION_TRIAL_DAYS,
  MONETIZATION_VARIANTS,
  TRIAL_STATES,
  criarEstadoTrial,
  criarEventoMonetizacao,
  encerrarTrial,
  iniciarTrial,
  tornarTrialElegivel,
  trialAtivo,
} from '../worker/src/monetizationEvents.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nMonetização OLLI — contrato local de eventos e trial');

checar('versão do contrato é explícita', MONETIZATION_EVENT_VERSION === '2026-09-01.v1');
checar('eventos do funil são fechados', MONETIZATION_EVENT_TYPES.length === 12 && MONETIZATION_EVENT_TYPES.includes('pdf.shared') && MONETIZATION_EVENT_TYPES.includes('subscription.renewed'));
checar('variantes do experimento são fechadas', MONETIZATION_VARIANTS.join(',') === 'control,contextual_trial');
checar('trial começa com 14 dias de hipótese', MONETIZATION_TRIAL_DAYS === 14);
checar('estados do trial são fechados', TRIAL_STATES.join(',') === 'unstarted,eligible,active,ended,converted,revoked');

const base = {
  type: 'pdf.shared',
  tenantId: 'tenant-01',
  actorKey: 'actor-hmac-01',
  occurredAt: '2026-09-01T12:00:00.000Z',
  dedupeKey: 'quote-001',
  variant: 'contextual_trial' as const,
  metadata: { delivery: 'whatsapp' as const },
};
const evento = criarEventoMonetizacao(base);
checar('evento normaliza e preserva tenant', evento.tenantId === 'tenant-01' && evento.type === 'pdf.shared' && evento.metadata.delivery === 'whatsapp');
checar('idempotência é determinística e tenant-bound', evento.eventId === evento.idempotencyKey && evento.eventId.includes('tenant-01'));
checar('evento não guarda PII nem conteúdo', !('email' in evento) && !('name' in evento) && !('body' in evento) && !('html' in evento));
checar('objeto e metadata são imutáveis', Object.isFrozen(evento) && Object.isFrozen(evento.metadata));
checar('variante inválida falha fechado', erroCodigo(() => criarEventoMonetizacao({ ...base, variant: 'founder' as any })) === 'variante_invalida');
checar('tenant ausente falha fechado', erroCodigo(() => criarEventoMonetizacao({ ...base, tenantId: '' })) === 'tenant_obrigatorio');
checar('PII fora da allow-list falha fechado', erroCodigo(() => criarEventoMonetizacao({ ...base, metadata: { delivery: 'whatsapp', email: 'x@y.test' } as any })) === 'metadata_nao_permitida');
checar('provider pode ser registrado sem escolher a fonte do plano', criarEventoMonetizacao({
  ...base,
  type: 'payment.approved',
  metadata: { provider: 'unknown', plan: 'pro_monthly' },
}).metadata.provider === 'unknown');
checar('evento rejeita tipo desconhecido', erroCodigo(() => criarEventoMonetizacao({ ...base, type: 'user.email' as any })) === 'tipo_evento_invalido');

const inicial = criarEstadoTrial({ tenantId: 'tenant-01' });
checar('estado inicial é unstarted', inicial.state === 'unstarted' && inicial.trialId === null);
const elegivel = tornarTrialElegivel(inicial, {
  tenantId: 'tenant-01',
  trigger: 'first_pdf',
  occurredAt: '2026-09-01T12:00:00.000Z',
});
checar('primeiro marco torna elegível', elegivel.eligible && elegivel.state.state === 'eligible' && elegivel.state.trigger === 'first_pdf');
const duplicado = tornarTrialElegivel(elegivel.state, {
  tenantId: 'tenant-01',
  trigger: 'third_quote',
  occurredAt: '2026-09-01T13:00:00.000Z',
});
checar('segunda elegibilidade não empilha trial', !duplicado.eligible && duplicado.reason === 'trial_ja_consumido' && duplicado.state.state === 'eligible');
checar('tenant divergente falha fechado', erroCodigo(() => tornarTrialElegivel(inicial, { tenantId: 'tenant-02', trigger: 'first_pdf', occurredAt: '2026-09-01T12:00:00Z' })) === 'tenant_trial_divergente');
checar('gatilho desconhecido falha fechado', erroCodigo(() => tornarTrialElegivel(inicial, { tenantId: 'tenant-01', trigger: 'signup' as any, occurredAt: '2026-09-01T12:00:00Z' })) === 'gatilho_trial_invalido');

const ativo = iniciarTrial(elegivel.state, {
  tenantId: 'tenant-01',
  trialId: 'trial-01',
  startedAt: '2026-09-01T12:00:00.000Z',
});
checar('trial ativo calcula fim em 14 dias', ativo.started && ativo.state.state === 'active' && ativo.state.endsAt === '2026-09-15T12:00:00.000Z');
checar('trial ativo é reconhecido antes do fim', trialAtivo(ativo.state, '2026-09-10T00:00:00.000Z') === true);
checar('trial expira no instante do fim', trialAtivo(ativo.state, '2026-09-15T12:00:00.000Z') === false);
checar('início repetido idêntico é idempotente', iniciarTrial(ativo.state, { tenantId: 'tenant-01', trialId: 'trial-01', startedAt: '2026-09-01T12:00:00Z' }).replayed === true);
checar('início com outro id não reabre ativo', erroCodigo(() => iniciarTrial(ativo.state, { tenantId: 'tenant-01', trialId: 'trial-02', startedAt: '2026-09-01T12:00:00Z' })) === 'trial_nao_elegivel');
const encerrado = encerrarTrial(ativo.state, { tenantId: 'tenant-01', endedAt: '2026-09-15T12:00:00Z' });
checar('fim sem pagamento vira ended', encerrado.ended && encerrado.state.state === 'ended' && encerrado.state.convertedAt === null);
checar('fim repetido é idempotente', encerrarTrial(encerrado.state, { tenantId: 'tenant-01', endedAt: '2026-09-15T12:00:00Z' }).replayed === true);
checar('trial encerrado não reabre', erroCodigo(() => iniciarTrial(encerrado.state, { tenantId: 'tenant-01', trialId: 'trial-01', startedAt: '2026-09-16T12:00:00Z' })) === 'trial_nao_elegivel');

if (falhas) {
  console.error('\nFALHOU: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(1);
}
console.log('\nPASSOU: ' + ok + ' ok, 0 falhas');
