// @ts-nocheck
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  avaliarNotificacao,
} from '../src/services/notificationPolicy.ts';

let ok = 0;
let falhas = 0;
function checar(nome, atual, esperado) {
  if (JSON.stringify(atual) === JSON.stringify(esperado)) ok += 1;
  else {
    falhas += 1;
    console.error(`FALHOU: ${nome}`, { atual, esperado });
  }
}

const diaUtil = new Date(2026, 7, 31, 10, 0, 0); // segunda-feira
const domingo = new Date(2026, 7, 30, 10, 0, 0);
const noite = new Date(2026, 7, 31, 22, 0, 0);

checar(
  'in-app operacional fica disponível por padrão',
  avaliarNotificacao({ channel: 'in_app', kind: 'operational', now: diaUtil }),
  { allowed: true, reason: 'allowed' },
);
checar(
  'push começa desligado até consentimento',
  avaliarNotificacao({ channel: 'push', kind: 'operational', now: diaUtil }),
  { allowed: false, reason: 'channel_disabled' },
);
checar(
  'e-mail educativo começa desligado',
  avaliarNotificacao({ channel: 'email', kind: 'education', now: diaUtil }),
  { allowed: false, reason: 'channel_disabled' },
);
checar(
  'e-mail transacional de segurança não depende de opt-in de marketing',
  avaliarNotificacao({ channel: 'email', kind: 'security', now: noite }),
  { allowed: true, reason: 'allowed' },
);

const educacaoLigada = { ...DEFAULT_NOTIFICATION_PREFERENCES, emailEducation: true };
checar(
  'educação respeita horário silencioso',
  avaliarNotificacao({ channel: 'email', kind: 'education', now: noite }, educacaoLigada),
  { allowed: false, reason: 'quiet_hours' },
);
checar(
  'domingo fica mudo por padrão',
  avaliarNotificacao({ channel: 'email', kind: 'education', now: domingo }, educacaoLigada),
  { allowed: false, reason: 'sunday_quiet' },
);
checar(
  'engajamento respeita teto diário',
  avaliarNotificacao({ channel: 'email', kind: 'engagement', now: diaUtil, engagementSentToday: 2 }, educacaoLigada),
  { allowed: false, reason: 'daily_cap' },
);
checar(
  'preferência inválida falha fechado',
  avaliarNotificacao({ channel: 'in_app', kind: 'operational', now: diaUtil }, { ...DEFAULT_NOTIFICATION_PREFERENCES, maxEngagementPerDay: 99 }),
  { allowed: false, reason: 'invalid_preferences' },
);

checar(
  'booleano inválido falha fechado',
  avaliarNotificacao({ channel: 'in_app', kind: 'operational', now: diaUtil }, { ...DEFAULT_NOTIFICATION_PREFERENCES, push: 'sim' }),
  { allowed: false, reason: 'invalid_preferences' },
);
checar(
  'canal desconhecido falha fechado',
  avaliarNotificacao({ channel: 'sms', kind: 'operational', now: diaUtil }),
  { allowed: false, reason: 'invalid_context' },
);
checar(
  'categoria desconhecida falha fechado',
  avaliarNotificacao({ channel: 'email', kind: 'marketing', now: diaUtil }),
  { allowed: false, reason: 'invalid_context' },
);
checar(
  'relógio inválido falha fechado',
  avaliarNotificacao({ channel: 'in_app', kind: 'operational', now: new Date('data-impossivel') }),
  { allowed: false, reason: 'invalid_context' },
);
checar(
  'contador negativo falha fechado',
  avaliarNotificacao({ channel: 'email', kind: 'engagement', now: diaUtil, engagementSentToday: -1 }, educacaoLigada),
  { allowed: false, reason: 'invalid_context' },
);
checar(
  'contador fracionário falha fechado',
  avaliarNotificacao({ channel: 'email', kind: 'engagement', now: diaUtil, engagementSentToday: 0.5 }, educacaoLigada),
  { allowed: false, reason: 'invalid_context' },
);

console.log(`\nPolítica de notificações: ${ok} ok, ${falhas} falha(s).`);
if (falhas) process.exit(1);
