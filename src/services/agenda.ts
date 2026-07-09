import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb, moverAgendamentoParaLixeira } from '../database/database';
import { Agendamento } from '../types';
import { pushRow } from './cloudSync';
import { LEMBRETE_MAP_KEY } from './storageKeys';

/**
 * CRUD da Agenda (Fase 2). Mesmo padrão do database.ts: SQLite local,
 * offline-first. As datas (`inicio`/`fim`) são ISO datetime; o filtro por
 * intervalo usa comparação lexicográfica de strings ISO (segura para ordenar).
 */

// ─── LEMBRETES (notificações locais de agendamento) ──────────
// Como o app é offline-first e o usuário depende de lembrar da visita mesmo
// com o app fechado, cada agendamento futuro ganha uma notificação local
// (padrão: 1h antes). Guardamos o id da notificação junto ao id do
// agendamento em AsyncStorage para poder cancelar ao editar/excluir.

/** Minutos de antecedência do lembrete (fixo por enquanto — "configurável simples"). */
export const MINUTOS_ANTECEDENCIA_LEMBRETE = 60;
const CANAL_ANDROID_ID = 'agenda-lembretes';

// Como a UI deve se comportar quando uma notificação chega com o app aberto.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getLembreteMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(LEMBRETE_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setLembreteMap(map: Record<string, string>): Promise<void> {
  try { await AsyncStorage.setItem(LEMBRETE_MAP_KEY, JSON.stringify(map)); } catch {}
}

/** Cria (uma vez) o canal padrão de notificações no Android. Sem efeito no iOS. */
async function garantirCanalAndroid(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CANAL_ANDROID_ID, {
      name: 'Lembretes de agenda',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      // Já retornamos cedo quando não é Android, então a cor é sempre aplicada.
      lightColor: '#34C6D9',
      sound: 'default',
    });
  } catch {}
}

/** true se a permissão de notificação já está concedida (sem pedir de novo). */
export async function temPermissaoNotificacao(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Pede permissão de notificação ao usuário (se ainda não decidiu antes).
 * Retorna true se concedida. Não mostra nenhum texto — a tela chamadora é
 * responsável pelo aviso amigável antes de chamar isto na primeira vez.
 */
export async function pedirPermissaoNotificacao(): Promise<boolean> {
  try {
    const atual = await Notifications.getPermissionsAsync();
    if (atual.status === 'granted') return true;
    const pedida = await Notifications.requestPermissionsAsync();
    return pedida.status === 'granted';
  } catch {
    return false;
  }
}

/** Cancela (se existir) a notificação de lembrete agendada para este agendamento. */
async function cancelarLembrete(agendamentoId: string): Promise<void> {
  const map = await getLembreteMap();
  const notifId = map[agendamentoId];
  if (!notifId) return;
  try { await Notifications.cancelScheduledNotificationAsync(notifId); } catch {}
  delete map[agendamentoId];
  await setLembreteMap(map);
}

/**
 * (Re)agenda o lembrete local de um agendamento: cancela o anterior (se
 * houver) e cria um novo, `MINUTOS_ANTECEDENCIA_LEMBRETE` minutos antes do
 * início — só se o horário do lembrete ainda estiver no futuro e o
 * agendamento não estiver cancelado/concluído. Não lança: falha de
 * notificação nunca deve impedir salvar o agendamento.
 */
async function agendarLembrete(a: Agendamento): Promise<void> {
  try {
    await cancelarLembrete(a.id);
    if (a.status !== 'agendado') return;
    const inicio = new Date(a.inicio);
    if (isNaN(inicio.getTime())) return;
    const dataLembrete = new Date(inicio.getTime() - MINUTOS_ANTECEDENCIA_LEMBRETE * 60 * 1000);
    if (dataLembrete.getTime() <= Date.now()) return; // horário do lembrete já passou

    const temPermissao = await temPermissaoNotificacao();
    if (!temPermissao) return; // não pede permissão aqui; quem chama já deve ter pedido

    await garantirCanalAndroid();

    const horaTxt = `${String(inicio.getHours()).padStart(2, '0')}:${String(inicio.getMinutes()).padStart(2, '0')}`;
    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Visita em ${MINUTOS_ANTECEDENCIA_LEMBRETE >= 60 ? `${Math.round(MINUTOS_ANTECEDENCIA_LEMBRETE / 60)}h` : `${MINUTOS_ANTECEDENCIA_LEMBRETE}min`}`,
        body: `${a.titulo} · ${a.clienteNome} às ${horaTxt}${a.endereco ? ' · ' + a.endereco : ''}`,
        data: { agendamentoId: a.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: dataLembrete,
        channelId: CANAL_ANDROID_ID,
      },
    });

    const map = await getLembreteMap();
    map[a.id] = notifId;
    await setLembreteMap(map);
  } catch {
    // Falha ao agendar notificação nunca deve travar o salvamento do agendamento.
  }
}

/**
 * Cancela TODAS as notificações de lembrete agendadas neste aparelho e limpa o
 * mapa agendamento→notificação. Usado no logout com "apagar dados": sem isto, os
 * lembretes da conta anterior (com nome/endereço do cliente) continuariam
 * disparando após a troca de conta — e, sem o mapa, ficariam impossíveis de
 * cancelar pelo app. Todas as notificações agendadas do app são lembretes de
 * agenda, então cancelar tudo é seguro. NUNCA lança.
 */
export async function cancelarTodosLembretes(): Promise<void> {
  if (Platform.OS !== 'web') {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {
      // best-effort: se o cancelamento falhar, ainda limpamos o mapa abaixo.
    }
  }
  try {
    await AsyncStorage.removeItem(LEMBRETE_MAP_KEY);
  } catch {
    // best-effort
  }
}

/**
 * Reconcilia os lembretes locais com o estado atual da tabela `agendamentos`.
 * Cancela todos os lembretes agendados e reagenda a partir do banco (só os
 * agendamentos com status 'agendado' e horário de lembrete ainda no futuro).
 * Chamado após o pull do sync e após um restore de backup — caminhos que gravam
 * direto no SQLite sem passar por saveAgendamento, deixando notificações no
 * horário velho, órfãs (agendamento excluído na nuvem) ou faltando. NUNCA lança.
 */
export async function resincronizarLembretes(): Promise<void> {
  try {
    await cancelarTodosLembretes();
    const agendamentos = await getAgendamentos();
    for (const a of agendamentos) {
      try {
        await agendarLembrete(a);
      } catch {
        // pula agendamento problemático, segue o resto
      }
    }
  } catch {
    // best-effort: reconciliação de lembretes nunca afeta os dados locais
  }
}

function rowToAgendamento(r: any): Agendamento {
  return {
    id: r.id,
    clienteId: r.cliente_id ?? undefined,
    clienteNome: r.cliente_nome,
    titulo: r.titulo,
    tipo: r.tipo,
    inicio: r.inicio,
    fim: r.fim ?? undefined,
    endereco: r.endereco ?? undefined,
    status: r.status,
    orcamentoId: r.orcamento_id ?? undefined,
    observacao: r.observacao ?? undefined,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
    excluidoEm: r.excluido_em ?? undefined,
  };
}

/** Todos os agendamentos ATIVOS (fora da lixeira), do mais antigo para o mais recente. */
export async function getAgendamentos(): Promise<Agendamento[]> {
  const db = await getDb();
  // LIXEIRA: exclui soft-deletados — senão eles reaparecem em Agenda/Home/relatórios.
  const rows = await db.getAllAsync<any>('SELECT * FROM agendamentos WHERE excluido_em IS NULL ORDER BY inicio ASC');
  return rows.map(rowToAgendamento);
}

/**
 * Agendamentos ATIVOS cujo início cai no intervalo [inicioISO, fimISO).
 * Use os limites do dia/semana/mês como ISO datetime.
 */
export async function getAgendamentosRange(inicioISO: string, fimISO: string): Promise<Agendamento[]> {
  const db = await getDb();
  // LIXEIRA: exclui soft-deletados (mesmo motivo de getAgendamentos).
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM agendamentos WHERE excluido_em IS NULL AND inicio >= ? AND inicio < ? ORDER BY inicio ASC',
    [inicioISO, fimISO]
  );
  return rows.map(rowToAgendamento);
}

/** Agendamentos do dia informado (Date local). Default: hoje. */
export async function getAgendamentosDoDia(dia: Date = new Date()): Promise<Agendamento[]> {
  const inicio = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 0, 0, 0, 0);
  const fim = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1, 0, 0, 0, 0);
  return getAgendamentosRange(inicio.toISOString(), fim.toISOString());
}

/**
 * Próxima parada: o agendamento futuro mais próximo (não cancelado), ou null.
 * Usado na Home ("AO VIVO · PRÓXIMA PARADA"). Comparação por ISO datetime.
 */
export async function getProximoAgendamento(): Promise<Agendamento | null> {
  const db = await getDb();
  const agora = new Date().toISOString();
  // LIXEIRA: exclui soft-deletados — senão a Home sugere uma visita já excluída.
  const row = await db.getFirstAsync<any>(
    "SELECT * FROM agendamentos WHERE excluido_em IS NULL AND inicio >= ? AND status != 'cancelado' ORDER BY inicio ASC LIMIT 1",
    [agora],
  );
  return row ? rowToAgendamento(row) : null;
}

// SEM filtro de excluido_em de propósito: leitura por id serve tanto o detalhe
// de um agendamento ativo quanto o fluxo de restaurar/ver da lixeira.
export async function getAgendamento(id: string): Promise<Agendamento | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM agendamentos WHERE id = ?', [id]);
  return row ? rowToAgendamento(row) : null;
}

/** Cria ou atualiza (upsert) um agendamento. */
export async function saveAgendamento(a: Agendamento): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO agendamentos
       (id, cliente_id, cliente_nome, titulo, tipo, inicio, fim, endereco, status, orcamento_id, observacao, criado_em, atualizado_em, excluido_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    // `excluido_em` PRECISA entrar aqui: INSERT OR REPLACE reescreve a linha INTEIRA,
    // e sem a coluna um save sobre um item que está na LIXEIRA o RESSUSCITARIA
    // (getAgendamento(id) não filtra de propósito — detalhe/restauração o alcançam).
    // Item ativo tem `excluidoEm` undefined → grava null, que é exatamente o correto.
    [a.id, a.clienteId ?? null, a.clienteNome, a.titulo, a.tipo, a.inicio,
     a.fim ?? null, a.endereco ?? null, a.status, a.orcamentoId ?? null,
     a.observacao ?? null, a.criadoEm, a.atualizadoEm, a.excluidoEm ?? null]
  );
  // Espelha na nuvem em background (fire-and-forget; no-op se offline/deslogado).
  try { void pushRow('agendamentos', a).catch(() => {}); } catch {}
  // Reagenda o lembrete local (cancela o anterior e cria um novo, se aplicável).
  // Fire-and-forget: nunca deve travar o salvamento por causa de notificação.
  void agendarLembrete(a).catch(() => {});
}

/**
 * EXCLUIR (usuário) = SOFT DELETE → LIXEIRA. `moverAgendamentoParaLixeira` (em
 * database.ts) já carimba `excluido_em`/`atualizado_em` e espelha na nuvem
 * (mirrorPush) — antes este DELETE era definitivo e um pull da nuvem podia
 * ressuscitar o item; agora ele só some das listas normais e fica recuperável.
 * Mantém o cancelamento do lembrete local (item na lixeira não deve notificar).
 */
export async function deleteAgendamento(id: string): Promise<void> {
  await moverAgendamentoParaLixeira(id);
  void cancelarLembrete(id).catch(() => {});
}
