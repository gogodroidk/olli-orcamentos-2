import { supabase, getCurrentUser } from './supabase';
import { exportAllData, importAllData, BackupSnapshot } from '../database/database';

const TABLE = 'backups';
const TABLE_VERSIONADO = 'backups_versionados';

/** Tipo de snapshot na tabela versionada (retenção diferente por tipo — ver poda em autoBackup.ts). */
export type TipoBackupVersionado = 'diario' | 'semanal' | 'manual';

export interface BackupVersionadoResumo {
  id: string;
  tipo: TipoBackupVersionado;
  criadoEm: string;
  /** Tamanho aproximado do snapshot em KB (a partir do JSON serializado — só para exibição). */
  tamanhoAprox: number;
}

/** Envia um snapshot completo dos dados locais para a nuvem. Retorna a data. */
export async function backupNow(): Promise<string> {
  if (!supabase) throw new Error('Backup na nuvem não configurado.');
  const user = await getCurrentUser();
  if (!user) throw new Error('Faça login para ativar o backup.');

  const snapshot = await exportAllData();
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: user.id, data: snapshot, updated_at: new Date().toISOString() });
  if (error) throw error;
  return snapshot.exportedAt;
}

/** Baixa o último backup da nuvem e SUBSTITUI os dados locais. Retorna a data. */
export async function restoreFromCloud(): Promise<string> {
  if (!supabase) throw new Error('Backup na nuvem não configurado.');
  const user = await getCurrentUser();
  if (!user) throw new Error('Faça login para restaurar.');

  const { data, error } = await supabase
    .from(TABLE)
    .select('data, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.data) throw new Error('Nenhum backup encontrado na nuvem.');

  await importAllData(data.data);
  return data.updated_at;
}

/** Data do último backup na nuvem, ou null se não houver. */
export async function getCloudBackupDate(): Promise<string | null> {
  if (!supabase) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase
    .from(TABLE)
    .select('updated_at')
    .eq('user_id', user.id)
    .maybeSingle();
  return data?.updated_at ?? null;
}

// ─── Backup VERSIONADO (backups_versionados) ────────────────────────────────
// Diferente da tabela `backups` acima (1 linha por usuário, sempre sobrescrita),
// `backups_versionados` guarda VÁRIAS cópias datadas (diário/semanal/manual).
// Este é o histórico que alimenta o backup automático (services/autoBackup.ts)
// e a tela "Ver cópias de segurança" do ContaScreen. Nunca lança: quem chama
// decide como tratar erro (autoBackup engole tudo; a UI mostra Alert).

/**
 * Insere um snapshot versionado na nuvem. Uso interno de autoBackup.ts (tipo
 * 'diario'/'semanal') e do botão manual "Fazer backup agora" (tipo 'manual').
 * Lança em caso de erro — quem chama decide se engole (auto) ou avisa (manual).
 */
export async function inserirBackupVersionado(tipo: TipoBackupVersionado, snapshot?: BackupSnapshot): Promise<string> {
  if (!supabase) throw new Error('Backup na nuvem não configurado.');
  const user = await getCurrentUser();
  if (!user) throw new Error('Faça login para ativar o backup.');

  const data = snapshot ?? await exportAllData();
  const { error } = await supabase
    .from(TABLE_VERSIONADO)
    .insert({ user_id: user.id, tipo, data });
  if (error) throw error;
  return data.exportedAt;
}

/** Faz um backup MANUAL versionado (botão "Fazer backup agora" do ContaScreen). Não é podado pela retenção automática. */
export async function backupManualVersionado(): Promise<string> {
  return inserirBackupVersionado('manual');
}

/**
 * Lista as cópias de segurança versionadas do usuário (mais recentes primeiro),
 * para a tela "Ver cópias de segurança". `tamanhoAprox` é estimado a partir do
 * tamanho do JSON em KB — só para o usuário ter noção do volume, não é exato
 * (Postgres/JSONB pode armazenar de forma mais compacta).
 */
export async function listBackupsVersionados(): Promise<BackupVersionadoResumo[]> {
  if (!supabase) return [];
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from(TABLE_VERSIONADO)
    .select('id, tipo, data, criado_em')
    .eq('user_id', user.id)
    .order('criado_em', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    tipo: row.tipo,
    criadoEm: row.criado_em,
    tamanhoAprox: Math.max(1, Math.round(JSON.stringify(row.data ?? {}).length / 1024)),
  }));
}

/**
 * Restaura uma cópia de segurança ESPECÍFICA (por id), escolhida na lista da UI.
 *
 * DIFERENÇA DE INTENÇÃO vs `restoreFromCloud()` (restaurar-o-último-backup):
 * `restoreFromCloud()` traz "o que a nuvem tem agora" — pode ser um snapshot
 * MAIS VELHO que as tabelas relacionais já sincronizadas neste ou noutro
 * aparelho, então NÃO propaga de volta (pushToCloud omitido/false): um push
 * cego reverteria dados mais novos que já estão na nuvem.
 * Aqui o usuário está DELIBERADAMENTE escolhendo "quero voltar para o estado
 * de tal dia" entre várias cópias — é uma decisão explícita de reverter, e o
 * usuário ESPERA que essa reversão se propague para o painel web e os outros
 * aparelhos dele. Por isso chamamos `importAllData(snapshot, { pushToCloud: true })`.
 * O resto do fluxo (transação atômica, limpeza de tombstones locais/nuvem,
 * resincronização de lembretes) já vem de `importAllData` — não duplicar aqui.
 */
export async function restoreBackupById(id: string): Promise<string> {
  if (!supabase) throw new Error('Backup na nuvem não configurado.');
  const user = await getCurrentUser();
  if (!user) throw new Error('Faça login para restaurar.');

  const { data, error } = await supabase
    .from(TABLE_VERSIONADO)
    .select('data, criado_em')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.data || typeof data.data !== 'object') {
    throw new Error('Essa cópia de segurança não foi encontrada ou está corrompida.');
  }

  await importAllData(data.data, { pushToCloud: true });
  return data.criado_em;
}

/**
 * Apaga cópias excedentes por tipo, mantendo as `manter` mais recentes de cada
 * `tipo` (o parâmetro é uma lista para podar 'diario' e 'semanal' numa
 * chamada). 'manual' nunca é passado aqui — cópias manuais não são podadas
 * automaticamente (o usuário decide apagar, se um dia isso for exposto na UI).
 * Nunca lança: a poda é housekeeping, uma falha nela não pode derrubar o
 * backup que acabou de ser feito com sucesso.
 */
export async function podarBackupsVersionados(regras: { tipo: TipoBackupVersionado; manter: number }[]): Promise<void> {
  if (!supabase) return;
  const user = await getCurrentUser();
  if (!user) return;

  for (const { tipo, manter } of regras) {
    try {
      const { data, error } = await supabase
        .from(TABLE_VERSIONADO)
        .select('id, criado_em')
        .eq('user_id', user.id)
        .eq('tipo', tipo)
        .order('criado_em', { ascending: false });
      if (error || !data) continue;
      const excedentes = data.slice(manter);
      if (!excedentes.length) continue;
      await supabase
        .from(TABLE_VERSIONADO)
        .delete()
        .in('id', excedentes.map((r: any) => r.id));
    } catch {
      // housekeeping: nunca lança
    }
  }
}

/** Data do backup versionado mais recente (qualquer tipo), ou null. Usado no resumo da tela Conta. */
export async function getUltimoBackupVersionadoData(): Promise<string | null> {
  if (!supabase) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase
    .from(TABLE_VERSIONADO)
    .select('criado_em')
    .eq('user_id', user.id)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.criado_em ?? null;
}

/** Data do backup versionado 'semanal' mais recente, ou null. Usado por autoBackup.ts para decidir se cria um novo. */
export async function getUltimoBackupSemanalData(): Promise<string | null> {
  if (!supabase) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase
    .from(TABLE_VERSIONADO)
    .select('criado_em')
    .eq('user_id', user.id)
    .eq('tipo', 'semanal')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.criado_em ?? null;
}

/** true se já existe backup 'diario' nas últimas `horas` horas. Usado por autoBackup.ts para o throttle diário. */
export async function existeBackupDiarioRecente(horas: number): Promise<boolean> {
  if (!supabase) return false;
  const user = await getCurrentUser();
  if (!user) return false;
  const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from(TABLE_VERSIONADO)
    .select('id')
    .eq('user_id', user.id)
    .eq('tipo', 'diario')
    .gte('criado_em', desde)
    .limit(1)
    .maybeSingle();
  return !!data;
}
