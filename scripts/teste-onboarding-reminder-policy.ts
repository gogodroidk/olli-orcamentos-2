import {
  ONBOARDING_REMINDER_MAX_EMAIL,
  ONBOARDING_REMINDER_MAX_TOTAL,
  ONBOARDING_REMINDER_MIN_INTERVAL_HOURS,
  ONBOARDING_REMINDER_POLICY_VERSION,
  avaliarLembreteAtivacao,
} from '../worker/src/onboardingReminderPolicy.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

console.log('\nOnboarding OLLI — cadência conservadora de lembretes');

const verifiedAt = new Date('2026-09-01T10:00:00Z');
const base: any = {
  tenantId: 'tenant-sintetico-001',
  actorKey: 'actor-sintetico-001',
  accountState: 'active',
  progressStage: 'verified_no_profile',
  verifiedAt,
  now: new Date('2026-09-02T10:00:00Z'),
  educationConsent: { optedIn: false, version: null, recordedAt: null },
  history: [],
};

checar('versão e limites são explícitos', ONBOARDING_REMINDER_POLICY_VERSION === '2026-09-01.v1' && ONBOARDING_REMINDER_MAX_TOTAL === 3 && ONBOARDING_REMINDER_MAX_EMAIL === 2 && ONBOARDING_REMINDER_MIN_INTERVAL_HOURS === 48);
checar('antes de 24 horas não agenda', avaliarLembreteAtivacao({ ...base, now: new Date('2026-09-02T09:59:59Z') }).reason === 'too_early');

const day1: any = avaliarLembreteAtivacao(base);
checar('24 horas liberam somente o lembrete in-app', day1.schedule === true && day1.candidate.window === 'activation_day_1' && day1.candidate.requestedChannels.join(',') === 'in_app');
checar('primeiro toque nunca usa e-mail', day1.candidate.emailConsentVersion === null && day1.candidate.unsubscribeScope === null);
checar('evento é educativo e sem conteúdo', day1.candidate.kind === 'education' && day1.candidate.template === 'onboarding_first_steps' && !/(subject|html|body|recipient|emailAddress)/i.test(JSON.stringify(day1.candidate)));
checar('chaves de replay são determinísticas', day1.candidate.eventId === day1.candidate.idempotencyKey && day1.candidate.eventId.includes('activation_day_1'));
checar('resultado e canais são imutáveis', Object.isFrozen(day1) && Object.isFrozen(day1.candidate) && Object.isFrozen(day1.candidate.requestedChannels));

const optIn: any = { optedIn: true, version: 'education-consent.v1', recordedAt: new Date('2026-09-01T10:05:00Z') };
const day3: any = avaliarLembreteAtivacao({ ...base, now: new Date('2026-09-04T10:00:00Z'), educationConsent: optIn });
checar('72 horas com opt-in liberam in-app e e-mail', day3.candidate.window === 'activation_day_3' && day3.candidate.requestedChannels.join(',') === 'in_app,email');
checar('e-mail carrega consent version e escopo de descadastro', day3.candidate.emailConsentVersion === 'education-consent.v1' && day3.candidate.unsubscribeScope === 'email_education');

const day3SemOptIn: any = avaliarLembreteAtivacao({ ...base, now: new Date('2026-09-04T10:00:00Z') });
checar('72 horas sem opt-in continuam somente in-app', day3SemOptIn.candidate.requestedChannels.join(',') === 'in_app' && day3SemOptIn.candidate.unsubscribeScope === null);

const historicoDay1: any = [{
  reminderKey: day1.candidate.idempotencyKey,
  window: 'activation_day_1',
  channels: ['in_app'],
  decidedAt: new Date('2026-09-02T10:00:00Z'),
  emailConsentVersion: null,
}];
const day3AposDay1: any = avaliarLembreteAtivacao({ ...base, now: new Date('2026-09-04T10:00:00Z'), educationConsent: optIn, history: historicoDay1 });
checar('intervalo exato de 48 horas permite a próxima janela', day3AposDay1.schedule === true && day3AposDay1.candidate.window === 'activation_day_3');
const historicoDay1Tardio: any = [{ ...historicoDay1[0], decidedAt: new Date('2026-09-03T10:00:00Z') }];
checar('intervalo menor que 48 horas ativa cooldown', avaliarLembreteAtivacao({ ...base, now: new Date('2026-09-04T10:00:00Z'), educationConsent: optIn, history: historicoDay1Tardio }).reason === 'cooldown');

const day7Direto: any = avaliarLembreteAtivacao({ ...base, now: new Date('2026-09-08T10:00:00Z'), educationConsent: optIn });
checar('avaliação tardia escolhe a janela mais atual', day7Direto.candidate.window === 'activation_day_7' && day7Direto.candidate.template === 'onboarding_last_nudge');

const historicoComDoisEmails: any = [
  { reminderKey: 'r1', window: 'activation_day_1', channels: ['in_app'], decidedAt: new Date('2026-09-02T10:00:00Z'), emailConsentVersion: null },
  { reminderKey: 'r2', window: 'activation_day_3', channels: ['in_app', 'email'], decidedAt: new Date('2026-09-04T10:00:00Z'), emailConsentVersion: 'education-consent.v1' },
];
const day7SegundoEmail: any = avaliarLembreteAtivacao({ ...base, now: new Date('2026-09-08T10:00:00Z'), educationConsent: optIn, history: historicoComDoisEmails });
checar('day 7 pode ser o segundo e último e-mail', day7SegundoEmail.candidate.requestedChannels.join(',') === 'in_app,email');

const tresHistoricos: any = [
  ...historicoComDoisEmails,
  { reminderKey: 'r3', window: 'activation_day_7', channels: ['in_app', 'email'], decidedAt: new Date('2026-09-08T10:00:00Z'), emailConsentVersion: 'education-consent.v1' },
];
checar('três lembretes encerram a cadência', avaliarLembreteAtivacao({ ...base, now: new Date('2026-09-12T10:00:00Z'), educationConsent: optIn, history: tresHistoricos }).reason === 'cadence_exhausted');
checar('primeiro orçamento encerra imediatamente', avaliarLembreteAtivacao({ ...base, progressStage: 'first_quote_complete' }).reason === 'activation_complete');
checar('conta suspensa não recebe lembrete', avaliarLembreteAtivacao({ ...base, accountState: 'suspended' }).reason === 'account_inactive');
checar('conta excluída não recebe lembrete', avaliarLembreteAtivacao({ ...base, accountState: 'deleted' }).reason === 'account_inactive');

checar('opt-in sem versão falha fechado', avaliarLembreteAtivacao({ ...base, educationConsent: { optedIn: true, version: null, recordedAt: new Date('2026-09-01T10:05:00Z') } }).reason === 'invalid_context');
checar('opt-in futuro falha fechado', avaliarLembreteAtivacao({ ...base, educationConsent: { optedIn: true, version: 'v1', recordedAt: new Date('2026-09-03T10:00:00Z') } }).reason === 'invalid_context');
checar('relógio anterior à verificação falha fechado', avaliarLembreteAtivacao({ ...base, now: new Date('2026-09-01T09:00:00Z') }).reason === 'invalid_context');
checar('campo extra com destinatário falha fechado', avaliarLembreteAtivacao({ ...base, recipient: 'pessoa@exemplo.com' }).reason === 'invalid_context');
checar('tenant inseguro falha fechado', avaliarLembreteAtivacao({ ...base, tenantId: '../tenant' }).reason === 'invalid_context');
checar('janela duplicada no histórico falha fechado', avaliarLembreteAtivacao({ ...base, now: new Date('2026-09-08T10:00:00Z'), history: [historicoDay1[0], { ...historicoDay1[0], reminderKey: 'outra' }] }).reason === 'invalid_history');
checar('histórico com e-mail no primeiro toque falha fechado', avaliarLembreteAtivacao({ ...base, now: new Date('2026-09-08T10:00:00Z'), history: [{ ...historicoDay1[0], channels: ['in_app', 'email'], emailConsentVersion: 'v1' }] }).reason === 'invalid_history');
checar('histórico de e-mail sem consent version falha fechado', avaliarLembreteAtivacao({ ...base, now: new Date('2026-09-08T10:00:00Z'), history: [{ reminderKey: 'r2', window: 'activation_day_3', channels: ['in_app', 'email'], decidedAt: new Date('2026-09-04T10:00:00Z'), emailConsentVersion: null }] }).reason === 'invalid_history');
checar('histórico futuro falha fechado', avaliarLembreteAtivacao({ ...base, history: [{ ...historicoDay1[0], decidedAt: new Date('2026-09-03T10:00:00Z') }] }).reason === 'invalid_history');
checar('mesma entrada produz candidato determinístico', JSON.stringify(avaliarLembreteAtivacao(base)) === JSON.stringify(day1));
checar('input original não é mutado', base.history.length === 0 && base.verifiedAt === verifiedAt && Object.keys(base).length === 8);

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
