import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { temPermissaoNotificacao } from './agenda';
import { PMOC_LEMBRETE_MAP_KEY } from './storageKeys';

/**
 * Lembrete proativo de PMOC vencendo (item 1.2 do roadmap — "O OLLI já sabe,
 * falta ele falar"). O `PmocOrdemGerada.vencimento` já existe (services/pmoc.ts);
 * este módulo só dá voz a ele.
 *
 * Reaproveita o MESMO mecanismo de notificação LOCAL já em produção para os
 * lembretes de agenda: `expo-notifications`, com o handler global já registrado
 * uma única vez por processo em `services/agenda.ts`
 * (`Notifications.setNotificationHandler`, importado cedo pelo app) e a MESMA
 * checagem de permissão (`temPermissaoNotificacao`, reaproveitada daqui — não
 * pedimos permissão de novo: se o usuário já liberou para a agenda, os
 * lembretes de PMOC também disparam; se negou, ficam quietos até ele liberar
 * por lá). NÃO é um novo sistema de push — é o mesmo agendamento local, só que
 * TRÊS avisos (15/7/1 dias) por visita em vez de um.
 *
 * A chave do mapa é o id da ORDEM DE SERVIÇO (`OrdemServico.id`), não da
 * reserva `PmocOrdemGerada`: assim, cancelar ao concluir/cancelar a OS (gancho
 * em `services/ordemServico.ts`) não precisa descobrir se aquela OS nasceu de
 * um plano PMOC — cancelar por um id que nunca teve lembrete agendado é um
 * no-op seguro, então o gancho serve QUALQUER OS sem checar a origem.
 */

/** Dias de antecedência do lembrete, do mais distante ao mais próximo do vencimento. */
export const DIAS_ANTECEDENCIA_PMOC = [15, 7, 1] as const;
/** Hora local do disparo (09h — início do expediente, dá tempo de agir no dia). */
const HORA_LEMBRETE_PMOC = 9;
const CANAL_ANDROID_ID = 'pmoc-lembretes';

async function getMapa(): Promise<Record<string, string[]>> {
  try {
    const raw = await AsyncStorage.getItem(PMOC_LEMBRETE_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setMapa(mapa: Record<string, string[]>): Promise<void> {
  try {
    await AsyncStorage.setItem(PMOC_LEMBRETE_MAP_KEY, JSON.stringify(mapa));
  } catch {}
}

/** Cria (uma vez) o canal PMOC no Android. Sem efeito no iOS. */
async function garantirCanalAndroid(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CANAL_ANDROID_ID, {
      name: 'Lembretes de PMOC',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#34C6D9',
      sound: 'default',
    });
  } catch {}
}

/**
 * 'YYYY-MM-DD' (vencimento) + dias de antecedência → Date LOCAL às
 * HORA_LEMBRETE_PMOC. `null` se o vencimento não casar o formato esperado.
 * Construção local (não `new Date(iso)`) de propósito: `vencimento` é uma
 * data-calendário sem fuso, e parsear como UTC deslocaria o dia em fusos
 * negativos (Brasil) — o técnico veria o aviso um dia adiantado ou atrasado.
 */
function dataDoLembrete(vencimento: string, diasAntes: number): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(vencimento);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(ano, mes - 1, dia, HORA_LEMBRETE_PMOC, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - diasAntes);
  return d;
}

/**
 * Cancela (se existirem) os lembretes PMOC agendados para esta OS e limpa a
 * entrada do mapa. No-op silencioso se `ordemId` nunca teve lembrete — é o
 * caso de toda OS que não nasceu de um plano PMOC, então pode ser chamado sem
 * checar a origem da OS. NUNCA lança.
 */
export async function cancelarLembretesPmoc(ordemId: string): Promise<void> {
  try {
    const mapa = await getMapa();
    const ids = mapa[ordemId];
    if (!ids || !ids.length) return;
    for (const notifId of ids) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notifId);
      } catch {}
    }
    delete mapa[ordemId];
    await setMapa(mapa);
  } catch {
    // best-effort: falha ao cancelar nunca pode travar quem chamou
  }
}

export interface LembretePmocInput {
  /** `OrdemServico.id` da visita gerada — chave do mapa e do toque na notificação. */
  ordemId: string;
  /** `PmocOrdemGerada.vencimento` ('YYYY-MM-DD'). Ausente/vazio → nada a agendar (não é erro). */
  vencimento?: string;
  /** Nome curto do equipamento, para o corpo da notificação (ex.: 'Split Sala 302'). */
  tituloEquipamento: string;
  clienteNome?: string;
}

/**
 * (Re)agenda os lembretes de vencimento PMOC de uma visita: cancela os
 * anteriores desta OS (se houver) e cria um novo por dia de antecedência que
 * ainda esteja no futuro. Idempotente por construção — cancelar antes de criar
 * significa que chamar de novo para a MESMA OS nunca duplica notificação.
 * Espelha `agenda.ts.agendarLembrete`. NUNCA lança: falha de notificação jamais
 * pode travar a geração de ordens PMOC.
 */
export async function agendarLembretesPmoc(input: LembretePmocInput): Promise<void> {
  try {
    await cancelarLembretesPmoc(input.ordemId);
    if (!input.vencimento) return; // sem vencimento conhecido: nada a agendar

    const temPermissao = await temPermissaoNotificacao();
    if (!temPermissao) return; // não pede permissão aqui — mesma regra da agenda

    await garantirCanalAndroid();

    const dataTxt = input.vencimento.split('-').reverse().join('/'); // 'YYYY-MM-DD' → 'DD/MM/YYYY'
    const novosIds: string[] = [];
    for (const dias of DIAS_ANTECEDENCIA_PMOC) {
      const quando = dataDoLembrete(input.vencimento, dias);
      if (!quando || quando.getTime() <= Date.now()) continue; // já passou: não agenda no passado

      const prazoTxt = dias === 1 ? '1 dia' : `${dias} dias`;
      try {
        const notifId = await Notifications.scheduleNotificationAsync({
          content: {
            title: `PMOC vence em ${prazoTxt}`,
            body: `${input.tituloEquipamento}${input.clienteNome ? ' · ' + input.clienteNome : ''} — manutenção vence em ${dataTxt}`,
            data: { ordemId: input.ordemId },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: quando,
            channelId: CANAL_ANDROID_ID,
          },
        });
        novosIds.push(notifId);
      } catch {
        // pula este aviso específico, tenta os demais
      }
    }

    if (novosIds.length) {
      const mapa = await getMapa();
      mapa[input.ordemId] = novosIds;
      await setMapa(mapa);
    }
  } catch {
    // Falha ao agendar lembrete PMOC nunca deve travar a geração de ordens.
  }
}

/**
 * Cancela TODOS os lembretes PMOC agendados neste aparelho e limpa o mapa.
 * Usado no logout com "apagar dados" — mesmo motivo de `cancelarTodosLembretes`
 * (agenda): sem isto, os lembretes de vencimento da conta anterior continuariam
 * disparando após a troca de conta. NUNCA lança.
 */
export async function cancelarTodosLembretesPmoc(): Promise<void> {
  try {
    const mapa = await getMapa();
    if (Platform.OS !== 'web') {
      for (const ids of Object.values(mapa)) {
        for (const notifId of ids) {
          try {
            await Notifications.cancelScheduledNotificationAsync(notifId);
          } catch {}
        }
      }
    }
    try {
      await AsyncStorage.removeItem(PMOC_LEMBRETE_MAP_KEY);
    } catch {}
  } catch {
    // best-effort
  }
}
