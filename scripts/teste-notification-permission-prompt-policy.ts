import {
  NOTIFICATION_PERMISSION_PROMPT_COOLDOWN_DAYS,
  NOTIFICATION_PERMISSION_PROMPT_MAX_EXPOSURES,
  NOTIFICATION_PERMISSION_PROMPT_POLICY_VERSION,
  avaliarPromptPermissaoNotificacao,
} from '../src/services/notificationPermissionPromptPolicy.ts';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

console.log('\nNotificações OLLI — política contextual do pré-prompt');

const agora = new Date('2026-09-01T20:10:00Z');
const base: any = {
  channel: 'push',
  permissionState: 'default',
  capabilityAvailable: true,
  preferenceState: 'unset',
  onboardingCompleted: true,
  sessionNumber: 2,
  valueMilestone: 'first_quote_created',
  promptExposureCount: 0,
  lastDismissedAt: null,
  now: agora,
};

checar('versão, cooldown e teto são explícitos', NOTIFICATION_PERMISSION_PROMPT_POLICY_VERSION === '2026-09-01.v1' && NOTIFICATION_PERMISSION_PROMPT_COOLDOWN_DAYS === 30 && NOTIFICATION_PERMISSION_PROMPT_MAX_EXPOSURES === 2);

const elegivel: any = avaliarPromptPermissaoNotificacao(base);
checar('marco de valor após onboarding torna o pré-prompt elegível', elegivel.offerPrompt === true && elegivel.reason === 'eligible' && elegivel.channel === 'push');
checar('copy explica benefício sem prometer venda', elegivel.copy.title.includes('orçamentos') && elegivel.copy.body.includes('avisos essenciais') && !/(desconto|oferta|trial|R\$)/i.test(JSON.stringify(elegivel.copy)));
checar('copy oferece escolha e caminho de configuração', elegivel.copy.primaryAction === 'Ativar notificações' && elegivel.copy.secondaryAction === 'Agora não' && elegivel.copy.settingsHint.includes('Conta > Notificações'));
checar('decisão e copy são imutáveis', Object.isFrozen(elegivel) && Object.isFrozen(elegivel.copy));

const web: any = avaliarPromptPermissaoNotificacao({ ...base, channel: 'web_push', valueMilestone: 'first_pdf_generated' });
checar('Web Push usa copy contextual do computador', web.offerPrompt === true && web.copy.body.includes('neste computador'));
checar('preferência já habilitada ainda pode pedir permissão default', avaliarPromptPermissaoNotificacao({ ...base, preferenceState: 'enabled' }).offerPrompt === true);

checar('onboarding incompleto é protegido', avaliarPromptPermissaoNotificacao({ ...base, onboardingCompleted: false }).reason === 'onboarding_protected');
checar('primeira sessão nunca recebe o pré-prompt', avaliarPromptPermissaoNotificacao({ ...base, sessionNumber: 1 }).reason === 'onboarding_protected');
checar('sem marco de valor não há oferta', avaliarPromptPermissaoNotificacao({ ...base, valueMilestone: 'none' }).reason === 'value_not_reached');
checar('capability ausente falha fechado', avaliarPromptPermissaoNotificacao({ ...base, capabilityAvailable: false }).reason === 'unsupported');
checar('ambiente unsupported falha fechado', avaliarPromptPermissaoNotificacao({ ...base, permissionState: 'unsupported' }).reason === 'unsupported');
checar('permissão concedida não repete prompt', avaliarPromptPermissaoNotificacao({ ...base, permissionState: 'granted' }).reason === 'already_granted');
checar('permissão negada não insiste', avaliarPromptPermissaoNotificacao({ ...base, permissionState: 'denied' }).reason === 'system_denied');
checar('preferência desativada pelo usuário é respeitada', avaliarPromptPermissaoNotificacao({ ...base, preferenceState: 'disabled' }).reason === 'user_disabled');

const dezDiasAtras = new Date(agora.getTime() - 10 * 24 * 60 * 60 * 1000);
checar('adiamento recente ativa cooldown', avaliarPromptPermissaoNotificacao({ ...base, promptExposureCount: 1, lastDismissedAt: dezDiasAtras }).reason === 'cooldown');
const trintaDiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
checar('fim exato do cooldown volta a permitir', avaliarPromptPermissaoNotificacao({ ...base, promptExposureCount: 1, lastDismissedAt: trintaDiasAtras }).offerPrompt === true);
checar('teto de exposições encerra novas ofertas', avaliarPromptPermissaoNotificacao({ ...base, promptExposureCount: 2, lastDismissedAt: trintaDiasAtras }).reason === 'exposure_limit');
checar('teto vence mesmo sem data de adiamento', avaliarPromptPermissaoNotificacao({ ...base, promptExposureCount: 3 }).reason === 'exposure_limit');

checar('relógio regressivo falha fechado', avaliarPromptPermissaoNotificacao({ ...base, lastDismissedAt: new Date(agora.getTime() + 1) }).reason === 'invalid_context');
checar('data inválida falha fechado', avaliarPromptPermissaoNotificacao({ ...base, now: new Date('inválida') }).reason === 'invalid_context');
checar('contador negativo falha fechado', avaliarPromptPermissaoNotificacao({ ...base, promptExposureCount: -1 }).reason === 'invalid_context');
checar('contador fracionário falha fechado', avaliarPromptPermissaoNotificacao({ ...base, sessionNumber: 1.5 }).reason === 'invalid_context');
checar('canal desconhecido falha fechado', avaliarPromptPermissaoNotificacao({ ...base, channel: 'email' }).reason === 'invalid_context');
checar('estado de permissão desconhecido falha fechado', avaliarPromptPermissaoNotificacao({ ...base, permissionState: 'prompt' }).reason === 'invalid_context');
checar('campo extra com token falha fechado', avaliarPromptPermissaoNotificacao({ ...base, token: 'proibido' }).reason === 'invalid_context');
checar('decisão negada nunca carrega copy acionável', avaliarPromptPermissaoNotificacao({ ...base, permissionState: 'denied' }).copy === null);
checar('mesma entrada produz decisão determinística', JSON.stringify(avaliarPromptPermissaoNotificacao(base)) === JSON.stringify(elegivel));
checar('input original não é mutado', base.promptExposureCount === 0 && base.now === agora && Object.keys(base).length === 10);

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);

