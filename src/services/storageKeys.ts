/**
 * Chaves de AsyncStorage que guardam DADOS do usuário (não preferências do
 * aparelho). Centralizadas aqui para que a limpeza de logout (clearAllLocalData)
 * e os módulos donos de cada chave apontem para a MESMA string — renomear uma
 * chave num lugar só passa a quebrar em tempo de compilação, não silenciosamente.
 *
 * Módulo folha de propósito (só constantes) para poder ser importado por
 * services e screens sem risco de ciclo de import.
 */

/**
 * Mapa `userId → arquivo .db` da partição local (ver `database/particao.ts`).
 *
 * ⚠️ **NÃO** entre com esta chave em `APP_DATA_STORAGE_KEYS`, por mais que o nome
 * pareça "dado de usuário". Ela é o REGISTRO DE POSSE dos bancos do aparelho e
 * precisa SOBREVIVER ao logout e ao "apagar dados".
 *
 * Se ela sumisse, o mapa voltaria vazio → o próximo usuário veria o banco legado
 * "sem dono" e o **adotaria**, herdando os dados de quem estava ali antes. Ou
 * seja: apagar esta chave reintroduz exatamente o vazamento entre contas que a
 * partição existe para impedir — só que ao contrário.
 */
export const DB_PARTICOES_KEY = 'olli.db.particoes';

/** Checklist do dia (HojeScreen). */
export const CHECKLIST_KEY = 'olli.hoje.checklist';
/** Histórico do chat com a OLLI (OlliChatScreen). */
export const CHAT_KEY = 'olli.chat';
/** E-mail aguardando confirmação de login (ContaScreen). */
export const PENDING_EMAIL_KEY = 'olli.pendingEmail';
/** Mapa agendamento→notificação de lembrete (services/agenda). */
export const LEMBRETE_MAP_KEY = 'olli.agenda.lembretes';
/** Mapa ordemDeServiço→notificações de lembrete de vencimento PMOC (services/pmocLembretes). */
export const PMOC_LEMBRETE_MAP_KEY = 'olli.pmoc.lembretes';
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
 * Mapa clienteId→dataAte (ISO) de "adiar" no Radar de clientes
 * (services/radarClientes). Dado de CONTA (decisão do usuário sobre quando
 * voltar a ser cobrado por aquele cliente) — por isso entra em
 * APP_DATA_STORAGE_KEYS: some no logout, senão o próximo usuário do aparelho
 * herdaria os adiamentos de outra pessoa.
 */
export const RADAR_SNOOZE_KEY = 'olli.radar.snooze';

/**
 * Carimbos ISO da ÚLTIMA escrita LOCAL de cada "extra" sincronizado
 * (checklist do Hoje, snooze do radar). Como o valor guardado nessas chaves é
 * um blob sem timestamp próprio, o sync last-write-wins de cloudSync precisa de
 * um carimbo lateral para comparar com o `atualizado_em` da nuvem. São dados de
 * CONTA (acompanham o extra) — entram em APP_DATA_STORAGE_KEYS para sumirem no
 * logout: assim, no próximo login de outra conta, sem carimbo local, a versão da
 * nuvem sempre vence (comportamento correto para aparelho novo/limpo).
 */
export const CHECKLIST_STAMP_KEY = 'olli.hoje.checklist.stamp';
export const RADAR_SNOOZE_STAMP_KEY = 'olli.radar.snooze.stamp';
/**
 * Carimbo ISO da última vez que este aparelho VIU (pull) ou ESCREVEU (push com
 * sucesso) a `empresa` na nuvem (services/cloudSync). A tabela `empresa` é
 * upsert por `user_id` (uma linha por dono) sem coluna de edição própria no
 * tipo do app — sem este carimbo, dois aparelhos do mesmo dono alternando
 * edições se sobrescreviam "último a sincronizar vence" cego, mesmo partindo
 * de uma base desatualizada. Compara com o `atualizado_em` real da linha antes
 * de sobrescrever em qualquer direção (mesmo padrão de CHECKLIST_STAMP_KEY).
 */
export const EMPRESA_STAMP_KEY = 'olli.empresa.stamp';

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
  PMOC_LEMBRETE_MAP_KEY,
  NOTIF_EXPLICADO_KEY,
  AUTO_BACKUP_TOGGLE_KEY,
  AUTO_BACKUP_ULTIMO_KEY,
  RADAR_SNOOZE_KEY,
  CHECKLIST_STAMP_KEY,
  RADAR_SNOOZE_STAMP_KEY,
  EMPRESA_STAMP_KEY,
];
