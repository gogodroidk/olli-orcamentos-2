import { supabase, getCurrentUser } from './supabase';
import { exportAllData, importAllData, BackupSnapshot } from '../database/database';
import { garantirContextoEquipe } from './cloudSync';
import { motivoBackupNuvem, type MotivoBackupNuvem } from './contextoEquipe';
import { formatDateTime } from '../utils/date';

const TABLE = 'backups';
const TABLE_VERSIONADO = 'backups_versionados';

// ─── Guarda de tenant: quem pode SUBIR um snapshot ──────────────────────────
// Esta guarda mora AQUI, e não em quem chama, porque aqui é onde o `user_id` é
// carimbado na linha — é o carimbo que causa o dano, então é o carimbo que
// precisa ser defendido. O snapshot de `exportAllData()` é INTEIRO e o SQLite
// local não tem coluna de tenant: no aparelho de um MEMBRO de equipe ele contém
// a base do DONO (veio pelo sync). Gravá-lo sob o `user_id` do membro põe a
// carteira de clientes do dono dentro do tenant de outra pessoa — que a leva
// embora ao ser desligada da equipe (a linha é dela e sobrevive à saída).
//
// Guardar os DOIS pontos de carimbo (`backupNow` e `inserirBackupVersionado`)
// cobre de uma vez os três caminhos que existem hoje: o backup automático
// (autoBackup.ts), o botão "Fazer backup agora" (backupManualVersionado, que
// delega para inserirBackupVersionado) e qualquer chamada futura de backupNow.
// O botão manual é o mais perigoso dos três: o usuário o dispara de propósito,
// na hora que quiser, sem esperar as 24h do automático.
//
// Ver `motivoBackupNuvem`/`backupNuvemPermitido` em contextoEquipe.ts para o
// porquê de `desconhecido` também não passar (não saber de quem é o banco nunca
// autoriza copiá-lo para um tenant).

/** Motivo pelo qual esta conta pode — ou não — subir snapshot. Nunca lança. */
export async function estadoBackupNuvem(): Promise<MotivoBackupNuvem> {
  try {
    return motivoBackupNuvem(await garantirContextoEquipe());
  } catch {
    return 'indeterminado'; // fail-closed: não consegui decidir = não pode
  }
}

/**
 * Mensagens de recusa. São o texto que o usuário lê no Alert do botão manual,
 * então dizem o que aconteceu e o que fazer — sem culpar quem apertou e sem
 * jargão de tenant/RLS.
 */
const RECUSA: Record<Exclude<MotivoBackupNuvem, 'permitido'>, string> = {
  somente_dono:
    'O backup desta conta é feito pelo dono da empresa. Os seus registros já entram na cópia dele.',
  indeterminado:
    'Não deu para confirmar esta conta agora. Tente de novo daqui a pouco.',
};

/** Lança se quem está logado não pode subir snapshot. Chamada antes de qualquer `exportAllData()`. */
async function exigirPermissaoBackupNuvem(): Promise<void> {
  const motivo = await estadoBackupNuvem();
  if (motivo === 'permitido') return;
  throw new Error(RECUSA[motivo]);
}

/**
 * O que a tela Conta ESCREVE para cada motivo de recusa. Mora aqui, junto da
 * guarda, por dois motivos: mobile e desktop leem a mesma frase (não dá para
 * corrigir uma e esquecer a outra), e a frase não pode divergir do que a guarda
 * de fato faz. `permitido` fica de fora de propósito — nesse caso a tela tem
 * algo melhor a dizer: a data da última cópia.
 */
export const COPY_BACKUP_NUVEM: Record<
  Exclude<MotivoBackupNuvem, 'permitido'>,
  { status: string; detalhe: string }
> = {
  somente_dono: {
    status: 'Backup da conta: com o dono da empresa',
    detalhe: 'Os dados desta conta são da empresa e entram na cópia do dono. Não há nada para fazer aqui.',
  },
  indeterminado: {
    status: 'Backup automático: em espera',
    detalhe: 'Ainda não deu para confirmar esta conta. Tente de novo daqui a pouco.',
  },
};

/** Como a tela Conta pinta a linha de estado do backup. `icone` é um nome de MaterialCommunityIcons. */
export interface ResumoBackupNuvem {
  icone: 'cloud-check' | 'cloud-alert' | 'cloud-sync-outline' | 'office-building-outline';
  tom: 'success' | 'warning' | 'muted';
  texto: string;
}

/**
 * A linha de estado do backup, em 3 estados + o motivo — decidida uma vez só,
 * para mobile e desktop.
 *
 * O bug que ela fecha: a frase era montada apenas do toggle e da data. Para um
 * MEMBRO de equipe o toggle segue ligado e a data congela, então a tela dizia
 * "Backup automático: ativo" enquanto a guarda acima recusava todo snapshot — o
 * técnico se achava protegido e o único sinal contrário era um console.warn.
 *
 * `motivo === null` é o CARREGANDO e nunca vira "ativo" por otimismo: enquanto
 * não sabemos, a tela diz que está verificando.
 */
export function resumoBackupNuvem(
  motivo: MotivoBackupNuvem | null,
  autoAtivo: boolean,
  ultimo: string | null,
): ResumoBackupNuvem {
  if (motivo === null) return { icone: 'cloud-sync-outline', tom: 'muted', texto: 'Verificando o backup…' };
  if (motivo === 'somente_dono') {
    return { icone: 'office-building-outline', tom: 'muted', texto: COPY_BACKUP_NUVEM.somente_dono.status };
  }
  if (motivo === 'indeterminado') {
    return { icone: 'cloud-alert', tom: 'warning', texto: COPY_BACKUP_NUVEM.indeterminado.status };
  }
  if (!autoAtivo) return { icone: 'cloud-alert', tom: 'warning', texto: 'Backup automático: desativado' };
  return ultimo
    ? { icone: 'cloud-check', tom: 'success', texto: `Backup automático: ativo — última cópia ${formatDateTime(ultimo)}` }
    : { icone: 'cloud-alert', tom: 'warning', texto: 'Backup automático: ativo — ainda sem cópias' };
}

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
  await exigirPermissaoBackupNuvem();

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
 *
 * A guarda de tenant roda ANTES do `exportAllData()`: nada de fotografar a base
 * inteira para descobrir depois que ela não podia ser enviada.
 */
export async function inserirBackupVersionado(tipo: TipoBackupVersionado, snapshot?: BackupSnapshot): Promise<string> {
  if (!supabase) throw new Error('Backup na nuvem não configurado.');
  const user = await getCurrentUser();
  if (!user) throw new Error('Faça login para ativar o backup.');
  await exigirPermissaoBackupNuvem();

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
