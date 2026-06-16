import { supabase, getCurrentUser } from './supabase';
import { exportAllData, importAllData } from '../database/database';

const TABLE = 'backups';

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
