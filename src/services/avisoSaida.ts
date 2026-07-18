import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Agendamento, Cliente, Empresa } from '../types';
import { LEMBRETE_MAP_KEY, SAIDA_AVISO_KEY } from './storageKeys';
import { calcularSaida } from './etaSaida';
import {
  enderecoDoAgendamento,
  origemParaVisita,
  textoNotificacaoSaida,
  type ResultadoSaida,
  type SaidaOk,
} from './saidaCalculo';

/**
 * AVISO "hora de sair" — o Toque 2 da seção 2 de docs/ENXAME/IDEIA_ETA_TRANSITO.md.
 *
 * ─── A DECISÃO DE PRODUTO MAIS IMPORTANTE DESTE ARQUIVO ────────────────────
 * **Esta feature adiciona ZERO notificações novas.** Ela não empilha um aviso
 * em cima dos que já existem: quando o cálculo dá certo, o aviso calculado
 * SUBSTITUI o lembrete fixo de 1h que a agenda já agendou (`agenda.ts` →
 * `agendarLembrete`, `MINUTOS_ANTECEDENCIA_LEMBRETE = 60`), cancelando-o. O
 * prestador recebe a MESMA quantidade de toques, só que um deles passa de
 * "Visita em 1h" (que ignora trânsito) para "Saia às 14:23 para chegar às
 * 15:00".
 *
 * Isso não é economia de código, é a diferença entre a feature sobreviver e
 * morrer: aviso demais vira ruído, ruído vira notificação desligada, e um
 * canal desligado leva junto o lembrete de agenda — que é a coisa mais útil
 * que o app faz. Por isso também NÃO existe aqui o "Toque 3" (o recálculo
 * "o trânsito piorou") do documento: ele seria uma notificação a mais, e o app
 * não tem TaskManager/BackgroundFetch para recalcular com a tela apagada
 * (mesma limitação registrada em `ritualDiario.ts`). Fica para a Fase 2.
 *
 * ─── QUANDO O CÁLCULO FALHA (P0) ───────────────────────────────────────────
 * Não agenda nada e, principalmente, **não cancela nada**. O que já estava de
 * pé continua de pé: o lembrete fixo de 1h, se nenhum cálculo tinha dado certo
 * ainda; ou o aviso calculado anteriormente, se algum tinha. Jamais um "saia
 * agora" com número chutado — errar a hora de sair faz o prestador chegar
 * atrasado no cliente, que é pior do que não ter a função.
 *
 * O "não cancela nada" custou um bug para ficar claro e está anotado no corpo
 * de `reagendarAvisoSaida`: cancelar antes de saber se o novo cálculo daria
 * certo podia deixar o prestador SEM AVISO NENHUM — nem o calculado, nem o
 * fixo — por causa de uma checagem de trânsito que caiu na rua sem sinal.
 *
 * ─── CUSTO ─────────────────────────────────────────────────────────────────
 * Só a PRÓXIMA parada, uma chamada, e só quando ela está a menos de
 * `JANELA_H` horas. É a alavanca da seção 12.4b do doc ("a alavanca do lado
 * caro não é cache, é chamar menos"): não são as 6 visitas do dia, é a uma que
 * está chegando. `THROTTLE_MS` impede que reabrir o app 10× no mesmo intervalo
 * vire 10 chamadas pagas do SKU Pro.
 *
 * ─── IMPORTS (a ordem importa) ─────────────────────────────────────────────
 * Este módulo é FOLHA de propósito: não importa `agenda.ts` nem `database.ts`.
 * Quem lê o banco é `ritualDiario.ts`, que passa os dados prontos. O motivo é
 * concreto: `agenda.ts` PRECISA importar `cancelarAvisoSaida` daqui (senão
 * editar o horário de uma visita deixaria um "saia às 14:23" agendado para a
 * hora velha), e o ciclo de import quebraria o bundle Hermes.
 */

/** Só calcula para uma visita que começa dentro desta janela. Além disso, trânsito previsto vale pouco e o app vai reabrir antes. */
const JANELA_H = 12;

/** O aviso dispara este tanto antes da hora de sair — tempo de guardar a ferramenta e ir. */
export const AVISO_ANTES_MIN = 10;

/** Sem tempo hábil para um aviso útil. Abaixo disto, o lembrete fixo já fez o trabalho. */
const MIN_ANTECEDENCIA_MS = 20 * 60 * 1000;

/**
 * Recalcula a MESMA parada no máximo a cada 4h automaticamente. Não é
 * performance, é dinheiro: cada recálculo é uma chamada do SKU Pro (US$ 10 por
 * 1.000). A previsão de trânsito da Google para uma saída das 14h23 quase não
 * muda entre as 8h e as 11h — recalcular de hora em hora gasta e não informa.
 * O prestador ainda pode forçar um recálculo com um toque (`forcar: true`),
 * porque aí ele pediu.
 */
const THROTTLE_MS = 4 * 3600 * 1000;

const CANAL_ANDROID_ID = 'agenda-lembretes';

/** O que fica guardado: a notificação agendada (para poder cancelar) e o ÚLTIMO resultado — inclusive falha. */
interface RegistroSalvo {
  agendamentoId: string;
  /** ISO do início da visita. Muda se o prestador reagendar → o registro velho não vale mais. */
  inicio: string;
  clienteNome: string;
  tentadoEm: string;
  notifId?: string;
  /** `Date` não sobrevive a JSON — guardamos ISO e revivemos na leitura. */
  resultado: ResultadoSaidaSerializado;
}

type ResultadoSaidaSerializado =
  | (Omit<SaidaOk, 'sairEm' | 'chegarEm' | 'sairAgoraChegaEm' | 'calculadoEm'> & {
      sairEm: string; chegarEm: string; sairAgoraChegaEm: string; calculadoEm: string;
    })
  | { estado: 'indisponivel'; erro: string }
  | { estado: 'endereco_insuficiente'; qual: 'origem' | 'destino' | 'ambos' };

export interface AvisoSaida {
  agendamentoId: string;
  inicio: string;
  clienteNome: string;
  /** Quando o app TENTOU calcular. Diferente de `calculadoEm` (quando a Routes API respondeu). */
  tentadoEm: Date;
  resultado: ResultadoSaida;
  /**
   * Há um aviso "saia às HH:MM" na fila de notificações agora. A tela precisa
   * saber: quando existe, o lembrete fixo de 1h JÁ FOI cancelado, e dizer que
   * ele "vale" seria apontar para um aviso que não existe mais.
   */
  avisoAgendado: boolean;
}

function serializar(r: ResultadoSaida): ResultadoSaidaSerializado {
  if (r.estado !== 'ok') return r;
  return {
    ...r,
    sairEm: r.sairEm.toISOString(),
    chegarEm: r.chegarEm.toISOString(),
    sairAgoraChegaEm: r.sairAgoraChegaEm.toISOString(),
    calculadoEm: r.calculadoEm.toISOString(),
  };
}

/**
 * Revive o resultado guardado. Qualquer campo de data ilegível derruba o
 * registro para `indisponivel` em vez de virar `Invalid Date` — que a UI
 * mostraria como "Saia às NaN:NaN" ou, pior, como um horário qualquer.
 */
function reviver(s: ResultadoSaidaSerializado | null | undefined): ResultadoSaida | null {
  if (!s || typeof s !== 'object') return null;
  if (s.estado === 'indisponivel') return { estado: 'indisponivel', erro: String(s.erro || 'indisponivel') };
  if (s.estado === 'endereco_insuficiente') {
    const qual = s.qual === 'origem' || s.qual === 'destino' ? s.qual : 'ambos';
    return { estado: 'endereco_insuficiente', qual };
  }
  if (s.estado !== 'ok') return null;
  const datas = {
    sairEm: new Date(s.sairEm),
    chegarEm: new Date(s.chegarEm),
    sairAgoraChegaEm: new Date(s.sairAgoraChegaEm),
    calculadoEm: new Date(s.calculadoEm),
  };
  for (const d of Object.values(datas)) {
    if (isNaN(d.getTime())) return { estado: 'indisponivel', erro: 'registro_ilegivel' };
  }
  if (!Number.isFinite(s.minutos) || s.minutos <= 0) return { estado: 'indisponivel', erro: 'registro_ilegivel' };
  return { ...s, ...datas };
}

async function lerRegistro(): Promise<RegistroSalvo | null> {
  try {
    const raw = await AsyncStorage.getItem(SAIDA_AVISO_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === 'object' && typeof obj.agendamentoId === 'string' ? obj : null;
  } catch {
    return null;
  }
}

async function gravarRegistro(r: RegistroSalvo): Promise<void> {
  try {
    await AsyncStorage.setItem(SAIDA_AVISO_KEY, JSON.stringify(r));
  } catch {
    // best-effort: sem o registro a Home só não mostra o card; nada quebra.
  }
}

/**
 * O aviso de saída da parada `agendamentoId` (ou de qualquer parada, se
 * omitido): cancela a notificação agendada e apaga o registro.
 *
 * `agenda.ts` chama isto ao SALVAR e ao EXCLUIR um agendamento, e esse é o
 * ponto inteiro da função: sem ela, mudar a visita das 15h para as 17h
 * deixaria um "Saia às 14:23" agendado para a hora velha — um aviso errado, que
 * é o único resultado pior do que não ter aviso nenhum. NUNCA lança.
 */
export async function cancelarAvisoSaida(agendamentoId?: string): Promise<void> {
  try {
    const reg = await lerRegistro();
    if (!reg) return;
    if (agendamentoId && reg.agendamentoId !== agendamentoId) return;
    if (reg.notifId && Platform.OS !== 'web') {
      try { await Notifications.cancelScheduledNotificationAsync(reg.notifId); } catch {}
    }
    await AsyncStorage.removeItem(SAIDA_AVISO_KEY);
  } catch {
    // best-effort
  }
}

/**
 * O aviso calculado SUBSTITUI o lembrete fixo de 1h daquela visita — é o que
 * mantém a conta de notificações em zero a mais (ver o docblock do topo).
 *
 * Mexe direto no mapa de `agenda.ts` (`LEMBRETE_MAP_KEY`) em vez de chamar a
 * função de lá porque `agenda.ts` importa ESTE módulo; o caminho inverso
 * fecharia um ciclo de import. A chave é a mesma constante em
 * `storageKeys.ts`, então renomear quebra em tempo de compilação nos dois
 * lados — que era o motivo de aquele arquivo existir.
 *
 * Se falhar, o pior caso é o prestador receber os dois avisos: chato, nunca
 * errado. Por isso é best-effort e roda DEPOIS de o aviso novo estar agendado.
 */
async function substituirLembreteFixo(agendamentoId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LEMBRETE_MAP_KEY);
    const mapa: Record<string, string> = raw ? JSON.parse(raw) : {};
    const notifId = mapa[agendamentoId];
    if (!notifId) return;
    try { await Notifications.cancelScheduledNotificationAsync(notifId); } catch {}
    delete mapa[agendamentoId];
    await AsyncStorage.setItem(LEMBRETE_MAP_KEY, JSON.stringify(mapa));
  } catch {
    // best-effort
  }
}

export interface DadosAvisoSaida {
  /** A PRÓXIMA parada — só ela. Não são as 6 visitas do dia (ver CUSTO no topo). */
  proxima: Agendamento | null;
  /** Agendamentos do MESMO dia da próxima parada: é de onde sai a origem (a visita anterior). */
  doDia: readonly Agendamento[];
  empresa: Empresa | null;
  clientes: readonly Cliente[];
  /** Já sabido por quem chama (`agenda.temPermissaoNotificacao`). Este módulo NUNCA pede permissão. */
  temPermissao: boolean;
  /** Toque explícito do prestador em "Atualizar": ignora throttle e cache. */
  forcar?: boolean;
  agora?: Date;
}

/**
 * (Re)calcula e (re)agenda o aviso de saída da próxima parada. Idempotente por
 * construção (cancela antes de criar). NUNCA lança — falha aqui não pode travar
 * boot, sync nem o salvamento de um agendamento.
 *
 * O resultado é SEMPRE persistido, inclusive quando é falha, e SEMPRE fora do
 * gate de permissão de notificação: a Home mostra o card mesmo para quem negou
 * notificações, e mostra "não deu pra checar o trânsito" em vez de sumir com
 * ele. Sumir com o card transformaria "não sei" em "não tem".
 */
export async function reagendarAvisoSaida(d: DadosAvisoSaida): Promise<ResultadoSaida | null> {
  try {
    const agora = d.agora ?? new Date();
    const proxima = d.proxima;

    // Sem parada elegível: cancela o que houver e não deixa registro velho para trás.
    if (!proxima || proxima.status !== 'agendado') {
      await cancelarAvisoSaida();
      return null;
    }
    const inicioMs = Date.parse(proxima.inicio);
    if (!Number.isFinite(inicioMs)) {
      await cancelarAvisoSaida();
      return null;
    }
    const faltaMs = inicioMs - agora.getTime();
    if (faltaMs < MIN_ANTECEDENCIA_MS || faltaMs > JANELA_H * 3600 * 1000) {
      // Longe demais (o app reabre antes) ou perto demais (não dá para avisar a
      // tempo). Nos dois casos o lembrete fixo de 1h continua valendo sozinho.
      await cancelarAvisoSaida();
      return null;
    }

    const anterior = await lerRegistro();
    const mesmaParada = anterior?.agendamentoId === proxima.id && anterior?.inicio === proxima.inicio;
    if (!d.forcar && mesmaParada && anterior) {
      const idade = agora.getTime() - Date.parse(anterior.tentadoEm);
      // Já calculamos esta parada há pouco e o aviso já está agendado: nada a
      // fazer. Este `return` é o que impede 10 aberturas do app virarem 10
      // chamadas pagas.
      if (Number.isFinite(idade) && idade >= 0 && idade < THROTTLE_MS) {
        return reviver(anterior.resultado);
      }
    }

    // ─── POR QUE O CANCELAMENTO NÃO É INCONDICIONAL AQUI ─────────────────────
    // A versão anterior deste arquivo cancelava o aviso agendado ANTES de saber
    // se o novo cálculo daria certo (o padrão cancela-e-recria dos outros
    // módulos). Parece inofensivo e não é: quando um cálculo dá certo, ele
    // CANCELA o lembrete fixo de 1h. Se 4h depois o recálculo caísse na rua sem
    // sinal, o app teria destruído o aviso bom e não teria nada para pôr no
    // lugar — nem o calculado, nem o fixo. O prestador ficaria SEM AVISO NENHUM
    // por causa de uma checagem de trânsito que falhou. É o pior desfecho
    // possível desta feature, e vinha de graça.
    //
    // Então: aviso de OUTRA parada morre já (ele fala de uma visita que não é
    // mais a próxima); aviso da MESMA parada só é trocado quando existe um
    // número novo para colocar no lugar dele.
    if (!mesmaParada) await cancelarAvisoSaida();

    const destino = enderecoDoAgendamento(proxima, d.clientes);
    const origem = origemParaVisita(proxima, d.doDia, d.empresa, d.clientes);

    const resultado = await calcularSaida({
      origem: origem?.endereco ?? null,
      destino,
      chegarEm: new Date(inicioMs),
      // 'confirmacao' = TRAFFIC_AWARE + departureTime = trânsito PREVISTO para a
      // hora da saída. É o SKU caro, e é o certo aqui: este número vira um
      // horário que o prestador vai obedecer. O barato ('planejamento', sem
      // trânsito) fica para a linha do "Bom dia", que é panorama, não ordem.
      modo: 'confirmacao',
      forcar: d.forcar,
      agora,
    });

    const registro: RegistroSalvo = {
      agendamentoId: proxima.id,
      inicio: proxima.inicio,
      clienteNome: proxima.clienteNome || proxima.titulo || '',
      tentadoEm: agora.toISOString(),
      resultado: serializar(resultado),
      // Herda o aviso que já estava na fila para ESTA MESMA parada. Se o
      // cálculo abaixo der certo, ele é substituído; se não, ele sobrevive —
      // um número de 4h atrás para um horário de saída absoluto continua sendo
      // informação melhor do que silêncio.
      notifId: mesmaParada ? anterior?.notifId : undefined,
    };

    // Só existe notificação com número. Sem `ok`, nada é cancelado e nada é
    // agendado: o que já estava de pé (o aviso anterior ou o lembrete fixo de
    // 1h) continua de pé. É o fallback explícito que o P0 exige.
    if (resultado.estado === 'ok' && !resultado.atrasado && d.temPermissao && Platform.OS !== 'web') {
      const alertaMs = resultado.sairEm.getTime() - AVISO_ANTES_MIN * 60_000;
      if (alertaMs > agora.getTime()) {
        const texto = textoNotificacaoSaida(resultado, proxima, agora);
        try {
          await garantirCanalAndroid();
          const notifId = await Notifications.scheduleNotificationAsync({
            content: {
              title: texto.titulo,
              body: texto.corpo,
              data: { agendamentoId: proxima.id, avisoSaida: true as const },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(alertaMs),
              channelId: CANAL_ANDROID_ID,
            },
          });
          // O novo já está na fila: agora sim o antigo pode sair, sem nunca ter
          // existido um instante em que não havia aviso nenhum.
          if (registro.notifId && registro.notifId !== notifId) {
            try { await Notifications.cancelScheduledNotificationAsync(registro.notifId); } catch {}
          }
          registro.notifId = notifId;
          await substituirLembreteFixo(proxima.id);
        } catch {
          // Falhou ao agendar: mantém o `notifId` herdado e não mexe no fixo. O
          // prestador recebe o aviso de sempre — nunca fica sem nenhum.
        }
      }
    }

    await gravarRegistro(registro);
    return resultado;
  } catch {
    return null;
  }
}

/** Mesmo canal Android dos lembretes de agenda: é o mesmo assunto (o compromisso), e o usuário só gerencia um. */
async function garantirCanalAndroid(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CANAL_ANDROID_ID, {
      name: 'Lembretes de agenda',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#34C6D9',
      sound: 'default',
    });
  } catch {}
}

/**
 * O aviso guardado para a parada `agendamentoId` — ou `null` se o registro é de
 * OUTRA parada (ou de outro horário da mesma). A conferência de identidade é o
 * ponto: mostrar na Home o "saia às 14:23" calculado para a visita de ontem
 * seria um número certo na tela errada. NUNCA lança.
 */
export async function lerAvisoSaida(
  agendamentoId: string | null | undefined,
  inicio?: string,
): Promise<AvisoSaida | null> {
  try {
    if (!agendamentoId) return null;
    const reg = await lerRegistro();
    if (!reg || reg.agendamentoId !== agendamentoId) return null;
    if (inicio && reg.inicio !== inicio) return null;
    const resultado = reviver(reg.resultado);
    const tentadoEm = new Date(reg.tentadoEm);
    if (!resultado || isNaN(tentadoEm.getTime())) return null;
    return {
      agendamentoId: reg.agendamentoId,
      inicio: reg.inicio,
      clienteNome: reg.clienteNome,
      tentadoEm,
      resultado,
      avisoAgendado: !!reg.notifId,
    };
  } catch {
    return null;
  }
}
