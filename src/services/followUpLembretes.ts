/**
 * followUpLembretes.ts — notificações LOCAIS de follow-up de orçamento (item 2.12):
 *  - D+2 para proposta enviada sem sinal de abertura do link;
 *  - D+5 para proposta vista e não respondida;
 *  - aviso diário "N orçamentos prontos para enviar" (rascunhos com 24h+);
 *  - "Cliente aprovou"/"Cliente recusou", UMA vez por orçamento.
 *
 * A REGRA (quem, quando, que texto, o que cancelar, o que já foi avisado) mora em
 * `followUpLembretesRegra.ts`, pura e testada (scripts/teste-followup-lembretes.ts).
 * Aqui só tem leitura (SQLite/AsyncStorage) e expo-notifications.
 *
 * QUANDO RODA (sem TaskManager/BackgroundFetch neste app — mesma honestidade do
 * `ritualDiario.ts`): depois de cada pull do `cloudSync.syncOnLogin`, que chama
 * `sincronizarStatusLinks` (traz visualização/resposta do link público e avisa a
 * resposta) e em seguida `reagendarFollowUps`. O lembrete agendado é um RETRATO
 * do último sync; quando o cliente responde, o próximo sync o CANCELA.
 *
 * SILÊNCIO: lembretes agendados às 09h (follow-up) e 16h (rascunhos), nunca de
 * madrugada, e nunca no domingo quando o domingo está mudo (a MESMA preferência do
 * Ritual diário, em Conta). O aviso de resposta sai na hora: ele só nasce durante
 * um sync, e o sync só roda com o app aberto — o prestador está usando o celular.
 *
 * PERMISSÃO: nunca pede (mesma regra de `pmocLembretes.ts`/`ritualDiario.ts`).
 * Quem pede é a Agenda ou o toggle em Conta. Sem permissão, os lembretes deste
 * módulo são cancelados e nada é agendado.
 *
 * PLANO: os lembretes D+2/D+5 e o "Proposta vence amanhã" são o "follow-up
 * automático" do Pro (`followup_automatico`). No Grátis só ficam o aviso de
 * rascunhos e o "Cliente aprovou/recusou". Plano que não deu para ler = não mexe
 * (`followUpsDoPlano`). Com o TERMÔMETRO (Pro) liberado, o texto do D+2/D+5
 * acompanha o sinal do link (abriu e voltou ao preço, não abriu...).
 *
 * ERRO NUNCA VIRA VAZIO: se a leitura dos orçamentos, dos lembretes já agendados,
 * do plano ou do estado de "já avisados" falha, NADA é cancelado nem disparado — "não sei" não
 * pode virar "não tem follow-up" (cancelaria lembretes válidos) nem "nunca avisei"
 * (repetiria o "Cliente aprovou" de todo o histórico).
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOrcamentos, getRecibos } from '../database/database';
import { temPermissaoNotificacao } from './agenda';
import { getPreferenciasRitual } from './ritualDiario';
import { RESPOSTAS_AVISADAS_KEY } from './storageKeys';
import { acessoRecursoAgora } from './planos';
import { termometrosSeLiberado } from './termometro';
import {
  ORIGEM_FOLLOWUP,
  decidirAvisosDeResposta,
  followUpsDoPlano,
  lerEstadoRespostas,
  planejarAvisoRascunhos,
  planejarFollowUps,
  reconciliarAgendadas,
  type AgendadaExistente,
  type NotificacaoPlanejada,
  type RespostaDoLink,
} from './followUpLembretesRegra';

export type { RespostaDoLink } from './followUpLembretesRegra';

/** Notificações locais não existem no navegador — o painel web não agenda nada. */
const SUPORTADO = Platform.OS !== 'web';

/**
 * Canal Android PRÓPRIO (não o do Ritual diário): quem silencia "Ritual diário da
 * OLLI" nas configurações do Android não pode perder, sem saber, o "Cliente
 * aprovou" — e o nome do canal tem de dizer o que ele entrega.
 */
export const CANAL_FOLLOWUP_ANDROID_ID = 'orcamentos-followup';

async function garantirCanalAndroid(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CANAL_FOLLOWUP_ANDROID_ID, {
      name: 'Orçamentos: follow-up e respostas do cliente',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#34C6D9',
      sound: 'default',
    });
  } catch {}
}

/**
 * Fila deste módulo: reconciliação e aviso de resposta rodam UM de cada vez.
 * Chamadores concorrentes existem (sync do boot + foco da lista/detalhe chamam
 * `sincronizarStatusLinks`): sem fila, dois leem o mesmo estado antes de um gravar
 * e o "Cliente aprovou" sai em dobro, ou dois reconciliam e agendam o mesmo
 * lembrete duas vezes.
 */
let fila: Promise<unknown> = Promise.resolve();
function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const rodada = fila.then(tarefa, tarefa);
  fila = rodada.catch(() => undefined);
  return rodada;
}

/**
 * Agendamentos deste módulo (marcados com `data.origem === 'followUp'`), lidos do
 * próprio sistema — a fonte da verdade do que está agendado, sem mapa paralelo
 * que possa descolar. `null` = não deu para ler (aí não mexemos em nada).
 */
async function agendadasDoFollowUp(): Promise<AgendadaExistente[] | null> {
  try {
    const todas = await Notifications.getAllScheduledNotificationsAsync();
    const resultado: AgendadaExistente[] = [];
    for (const n of todas) {
      const data = (n.content?.data ?? {}) as { origem?: unknown; chave?: unknown };
      if (data.origem !== ORIGEM_FOLLOWUP) continue;
      resultado.push({ id: n.identifier, chave: typeof data.chave === 'string' ? data.chave : null });
    }
    return resultado;
  } catch {
    return null;
  }
}

async function cancelarIds(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* segue os outros */ }
  }
}

async function agendar(p: NotificacaoPlanejada): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: p.titulo, body: p.corpo, data: { ...p.data } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.alvo, channelId: CANAL_FOLLOWUP_ANDROID_ID },
    });
  } catch {
    // pula este lembrete; o próximo sync tenta de novo (a chave não ficou agendada)
  }
}

/**
 * Cancela TODOS os lembretes de follow-up agendados. Usado no logout (antes de a
 * conta sair do aparelho) e quando a permissão some. NUNCA lança.
 */
export async function cancelarFollowUpLembretes(): Promise<void> {
  if (!SUPORTADO) return;
  // Na fila: um reagendamento em curso não pode agendar DEPOIS deste cancelamento
  // (no logout, sobraria lembrete com nome/valor do cliente da conta que saiu).
  return naFila(cancelarFollowUpLembretesAgora);
}

async function cancelarFollowUpLembretesAgora(): Promise<void> {
  try {
    const existentes = await agendadasDoFollowUp();
    if (existentes) await cancelarIds(existentes.map((e) => e.id));
  } catch {
    // best-effort
  }
}

/**
 * Recalcula os lembretes de follow-up (D+2/D+5) e o aviso diário de rascunhos e
 * RECONCILIA com o que já está agendado: mantém o que não mudou, cancela o que
 * saiu do plano (cliente respondeu, pagou, venceu, excluiu), cria o que entrou.
 * Idempotente. NUNCA lança.
 */
export async function reagendarFollowUps(agora: Date = new Date()): Promise<void> {
  if (!SUPORTADO) return;
  return naFila(() => reagendarFollowUpsAgora(agora));
}

async function reagendarFollowUpsAgora(agora: Date): Promise<void> {
  try {
    if (!(await temPermissaoNotificacao())) {
      await cancelarFollowUpLembretesAgora();
      return;
    }

    // Leituras ANTES de qualquer cancelamento: se uma falhar, o agendamento atual
    // fica como está (erro não vira "não há follow-up").
    let orcamentos: Awaited<ReturnType<typeof getOrcamentos>>;
    let recibos: Awaited<ReturnType<typeof getRecibos>>;
    try {
      [orcamentos, recibos] = await Promise.all([getOrcamentos(), getRecibos()]);
    } catch {
      return;
    }
    const existentes = await agendadasDoFollowUp();
    if (!existentes) return;

    const { domingo } = await getPreferenciasRitual();
    const prefs = { domingoAtivo: domingo };
    // Termômetro (Pro): o texto do lembrete acompanha o sinal do link. Sem plano
    // ou sem leitura = `null` e o texto de sempre (que não afirma nada).
    const sinais = await termometrosSeLiberado(orcamentos, agora);
    // Follow-up automático é do Pro. Plano ilegível = não mexe em nada (nem nos
    // rascunhos: reconciliar só uma parte cancelaria os D+2/D+5 de quem paga).
    const plano = followUpsDoPlano(
      await acessoRecursoAgora('followup_automatico'),
      planejarFollowUps(orcamentos, recibos, agora, prefs, { sinais, avisoValidade: true }),
    );
    if (!plano) return;
    const rascunhos = planejarAvisoRascunhos(orcamentos, agora, prefs);
    if (rascunhos) plano.push(rascunhos);

    const { cancelar, criar } = reconciliarAgendadas(existentes, plano);
    await cancelarIds(cancelar);
    if (criar.length === 0) return;
    await garantirCanalAndroid();
    for (const p of criar) await agendar(p);
  } catch {
    // best-effort: lembrete nunca trava o sync
  }
}

/**
 * "Cliente abriu seu orçamento agora" — sai NA HORA (o app está aberto: quem chama
 * é o ouvinte do Realtime em `avisoAberturaCliente.ts`, que só existe com o app
 * ativo). Mesmo canal do follow-up. Nunca pede permissão; sem ela, não avisa.
 * NUNCA lança. Devolve se notificou.
 */
export async function avisarAberturaAgora(titulo: string, corpo: string, orcamentoId: string): Promise<boolean> {
  if (!SUPORTADO) return false;
  return naFila(async () => {
    try {
      if (!(await temPermissaoNotificacao())) return false;
      await garantirCanalAndroid();
      await Notifications.scheduleNotificationAsync({
        content: { title: titulo, body: corpo, data: { origem: 'aberturaCliente', orcamentoId } },
        trigger: { channelId: CANAL_FOLLOWUP_ANDROID_ID },
      });
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Dispara "Cliente aprovou"/"Cliente recusou" para respostas novas do link
 * público — UMA vez por orçamento (conjunto de ids persistido por conta).
 * Chamado por `sincronizarStatusLinks` (clienteLink.ts), que já leu os links.
 *
 * `idsComLink` = todos os orçamentos com link desta conta (para podar o conjunto).
 * O estado é GRAVADO ANTES de notificar: se a leitura ou a gravação falharem,
 * não notifica — repetir o aviso é pior do que perdê-lo. NUNCA lança.
 */
export async function avisarRespostasDoCliente(
  userId: string,
  respostas: readonly RespostaDoLink[],
  idsComLink: readonly string[],
  agora: Date = new Date(),
): Promise<number> {
  if (!SUPORTADO || !userId) return 0;
  return naFila(() => avisarRespostasAgora(userId, respostas, idsComLink, agora));
}

async function avisarRespostasAgora(
  userId: string,
  respostas: readonly RespostaDoLink[],
  idsComLink: readonly string[],
  agora: Date,
): Promise<number> {
  try {
    let raw: string | null;
    try {
      raw = await AsyncStorage.getItem(RESPOSTAS_AVISADAS_KEY);
    } catch {
      return 0; // não consegui LER: não sei quem já foi avisado → não avisa
    }
    let json: unknown = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      // JSON corrompido: tratado como conta nova (só a janela de 48h avisa) e
      // regravado abaixo — senão o aviso ficaria mudo para sempre.
    }
    const estado = lerEstadoRespostas(json);
    const { avisar, novoEstado } = decidirAvisosDeResposta(respostas, idsComLink, estado, userId, agora);
    try {
      await AsyncStorage.setItem(RESPOSTAS_AVISADAS_KEY, JSON.stringify(novoEstado));
    } catch {
      return 0;
    }
    if (avisar.length === 0) return 0;
    if (!(await temPermissaoNotificacao())) return 0;
    await garantirCanalAndroid();
    let enviados = 0;
    for (const a of avisar) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title: a.titulo, body: a.corpo, data: { origem: 'respostaCliente', orcamentoId: a.orcamentoId } },
          trigger: { channelId: CANAL_FOLLOWUP_ANDROID_ID },
        });
        enviados++;
      } catch {
        // segue os outros
      }
    }
    return enviados;
  } catch {
    return 0;
  }
}
