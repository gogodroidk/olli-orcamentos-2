/**
 * Chaves de AsyncStorage que guardam DADOS do usuário (não preferências do
 * aparelho). Centralizadas aqui para que a limpeza de logout (clearAllLocalData)
 * e os módulos donos de cada chave apontem para a MESMA string — renomear uma
 * chave num lugar só passa a quebrar em tempo de compilação, não silenciosamente.
 *
 * Módulo folha de propósito (só constantes) para poder ser importado por
 * services e screens sem risco de ciclo de import.
 */

/** Checklist do dia (HojeScreen). */
export const CHECKLIST_KEY = 'olli.hoje.checklist';
/** Histórico do chat com a OLLI (OlliChatScreen). */
export const CHAT_KEY = 'olli.chat';
/** E-mail aguardando confirmação de login (ContaScreen). */
export const PENDING_EMAIL_KEY = 'olli.pendingEmail';
/** Mapa agendamento→notificação de lembrete (services/agenda). */
export const LEMBRETE_MAP_KEY = 'olli.agenda.lembretes';
/** Aviso de lembretes já explicado (AgendaScreen) — por conta, re-explica após logout com limpeza. */
export const NOTIF_EXPLICADO_KEY = 'olli.agenda.notifExplicado';
/**
 * Toggle do backup automático (services/autoBackup + ContaScreen). Default
 * ligado quando ausente — string '0' desliga explicitamente. É preferência de
 * CONTA (o usuário decide se quer gastar dado móvel com backup diário), por
 * isso entra em APP_DATA_STORAGE_KEYS: zera no logout/troca de conta, senão o
 * próximo usuário do aparelho herdaria a escolha de outra pessoa.
 */
export const AUTO_BACKUP_TOGGLE_KEY = 'olli.autoBackup.ativo';
/** Carimbo ISO do último backup automático 'diario' bem-sucedido (services/autoBackup). */
export const AUTO_BACKUP_ULTIMO_KEY = 'olli.autoBackup.ultimo';

/**
 * Todas as chaves de dados do usuário, para a limpeza de logout remover de uma
 * vez (allow-list explícita — nunca AsyncStorage.clear()). NÃO inclui a chave de
 * onboarding ('olli.onboarded', preferência do aparelho) nem a sessão do Supabase.
 */
export const APP_DATA_STORAGE_KEYS = [
  CHECKLIST_KEY,
  CHAT_KEY,
  PENDING_EMAIL_KEY,
  LEMBRETE_MAP_KEY,
  NOTIF_EXPLICADO_KEY,
  AUTO_BACKUP_TOGGLE_KEY,
  AUTO_BACKUP_ULTIMO_KEY,
];
