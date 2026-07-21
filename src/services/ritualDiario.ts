import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAgendamentosDoDia, getProximoAgendamento, temPermissaoNotificacao } from './agenda';
import { getClientes, getEmpresa } from '../database/database';
import { reagendarAvisoSaida } from './avisoSaida';
import { calcularSaida } from './etaSaida';
import { enderecoDoAgendamento, linhaBomDiaSaida, origemParaVisita } from './saidaCalculo';
import { orcamentosParaCobrar } from './radarCobranca';
import { clientesParaReconquistar } from './radarClientes';
import { gerarRelatorioDia, relatorioParaTexto } from './relatorioDia';
import { formatCurrency } from '../utils/currency';
import type { Agendamento, Cliente } from '../types';
import {
  RITUAL_NOTIF_MAP_KEY,
  RITUAL_BOM_DIA_TOGGLE_KEY,
  RITUAL_FECHAR_DIA_TOGGLE_KEY,
  RITUAL_DOMINGO_TOGGLE_KEY,
} from './storageKeys';

/**
 * Ritual diário — "Bom dia da OLLI" (~7h) + "Fechar o dia" (~18h). Item 4 do
 * roadmap de engajamento (docs/ENXAME/ENGAJAMENTO_VISAO.md): duas âncoras
 * temporais que só falam quando há dado real, nunca no vazio.
 *
 * HONESTIDADE DE STACK (sem TaskManager/BackgroundFetch neste app): o
 * recálculo só roda com o app ABERTO. Por isso este módulo é
 * REAGENDADO (cancela-e-recria, mesmo padrão de `pmocLembretes.ts`) sempre
 * que o app abre com sessão válida — hoje isso é `cloudSync.syncOnLogin`
 * (cobre boot com sessão E todo sync subsequente) e o toggle de cada canal em
 * `ContaScreen`. O conteúdo agendado é um RETRATO do momento do reagendamento;
 * se o usuário reabrir o app de novo antes do disparo, o retrato é atualizado.
 *
 * REAPROVEITAMENTO — nada aqui reimplementa leitura já existente:
 *  - `getProximoAgendamento` (agenda.ts), `orcamentosParaCobrar`
 *    (radarCobranca.ts), `clientesParaReconquistar` (radarClientes.ts) — os
 *    MESMOS 3 loaders que a Home já roda no primeiro card do dia.
 *  - `gerarRelatorioDia`/`relatorioParaTexto` (relatorioDia.ts) — a MESMA
 *    narrativa que a tela fala em voz alta; a notificação só corta a 1ª frase,
 *    nunca inventa um resumo próprio (copy derivada da fonte).
 *  - `temPermissaoNotificacao` (agenda.ts) — a MESMA checagem dos lembretes de
 *    agenda/PMOC. Este módulo NUNCA pede permissão sozinho (mesma regra de
 *    `pmocLembretes.ts`): se o usuário já liberou pela Agenda (ou pelo toggle
 *    em Conta, que chama `pedirPermissaoNotificacao` explicitamente), o ritual
 *    dispara; se negou, fica quieto até liberar por um desses dois lugares.
 *
 * REGRA DE OURO (ENGAJAMENTO_VISAO.md): sinal real ou silêncio. Nunca "bom dia
 * sem novidades", nunca badge vazio. Teto de 2 notificações de engajamento/dia
 * (as duas âncoras — nada mais entra aqui). Janela 07h-20h; domingo mudo por
 * padrão (toggle liga de volta). "Fechar o dia" que perde a janela de hoje
 * (depois das 20h) NUNCA empurra para amanhã com o relatório de hoje — vira
 * silêncio, ponto final; amanhã o ritual roda com dados de amanhã.
 */

const HORA_BOM_DIA = 7;
const HORA_FECHAR_DIA = 18;
/** Fim da janela de silêncio (docs/ENXAME/COMUNICACAO_VISAO.md: "silêncio 07h-20h"). */
const FIM_JANELA_HORA = 20;
const CANAL_ANDROID_ID = 'ritual-diario';

type CanalRitual = 'bomDia' | 'fecharDia';

async function getMapa(): Promise<Partial<Record<CanalRitual, string>>> {
  try {
    const raw = await AsyncStorage.getItem(RITUAL_NOTIF_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setMapa(mapa: Partial<Record<CanalRitual, string>>): Promise<void> {
  try {
    await AsyncStorage.setItem(RITUAL_NOTIF_MAP_KEY, JSON.stringify(mapa));
  } catch {}
}

async function lerToggle(chave: string, defaultAtivo: boolean): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(chave);
    return v === null ? defaultAtivo : v === '1';
  } catch {
    return defaultAtivo;
  }
}

/** Cria (uma vez) o canal Android do ritual. Sem efeito no iOS. Importância
 *  DEFAULT (não HIGH): é um resumo informativo, não um alarme de compromisso. */
async function garantirCanalAndroid(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CANAL_ANDROID_ID, {
      name: 'Ritual diário da OLLI',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#34C6D9',
      sound: 'default',
    });
  } catch {}
}

/** Estado ATUAL (AsyncStorage) dos 3 toggles de preferência do ritual, com os
 *  defaults do produto: os dois canais ligados, domingo mudo. Usado pela tela
 *  de preferências (ContaScreen) e pelo próprio reagendamento. */
export async function getPreferenciasRitual(): Promise<{ bomDia: boolean; fecharDia: boolean; domingo: boolean }> {
  const [bomDia, fecharDia, domingo] = await Promise.all([
    lerToggle(RITUAL_BOM_DIA_TOGGLE_KEY, true),
    lerToggle(RITUAL_FECHAR_DIA_TOGGLE_KEY, true),
    lerToggle(RITUAL_DOMINGO_TOGGLE_KEY, false),
  ]);
  return { bomDia, fecharDia, domingo };
}

/** Liga/desliga um dos 3 canais de preferência. Não reagenda sozinho — quem
 *  chama (ContaScreen) decide quando disparar `reagendarRitualDiario` depois. */
export async function setPreferenciaRitual(canal: 'bomDia' | 'fecharDia' | 'domingo', ativo: boolean): Promise<void> {
  const chave =
    canal === 'bomDia' ? RITUAL_BOM_DIA_TOGGLE_KEY :
    canal === 'fecharDia' ? RITUAL_FECHAR_DIA_TOGGLE_KEY :
    RITUAL_DOMINGO_TOGGLE_KEY;
  await AsyncStorage.setItem(chave, ativo ? '1' : '0');
}

function ehDomingo(d: Date): boolean {
  return d.getDay() === 0;
}

/** true se `a` e `b` caem no mesmo dia-calendário LOCAL (ignora hora). */
function mesmoDiaCalendario(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Próxima ocorrência de `hora:minuto` estritamente no futuro (hoje se ainda não
 *  passou, senão amanhã). Preserva a hora ao avançar o dia (nunca cruza DST
 *  neste app — sem suporte a fuso não-BR). */
function proximaOcorrencia(hora: number, minuto = 0): Date {
  const d = new Date();
  d.setHours(hora, minuto, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

/** Se `d` cai num domingo e o domingo está mudo, empurra 1 dia (segunda). */
function avancarSeDomingoMudo(d: Date, domingoAtivo: boolean): Date {
  if (domingoAtivo || !ehDomingo(d)) return d;
  const proximo = new Date(d);
  proximo.setDate(proximo.getDate() + 1);
  return proximo;
}

/**
 * "saia às 08h25 (32 min, sem trânsito)" para a primeira visita do dia — o
 * Toque 1 da seção 2 de docs/ENXAME/IDEIA_ETA_TRANSITO.md. `null` sempre que
 * não houver número REAL: sem endereço, sem rede, worker fora, cota estourada.
 *
 * Usa `modo:'planejamento'` (TRAFFIC_UNAWARE → SKU Essentials: metade do preço
 * e o dobro da franquia grátis) e o rótulo "sem trânsito" vai junto na frase,
 * escrito por `linhaBomDiaSaida`. É uma troca deliberada: às 7h da manhã isto é
 * panorama do dia, não a ordem de sair — a ordem de sair é o Toque 2, que paga
 * o SKU Pro para olhar o trânsito de verdade perto da hora. Dizer "sem
 * trânsito" na cara do usuário é o que torna a troca honesta em vez de barata.
 *
 * NUNCA lança: qualquer falha vira `null` e o "Bom dia" sai como antes.
 */
async function linhaDeSaidaParaBomDia(proxima: Agendamento): Promise<string | null> {
  try {
    const inicio = new Date(proxima.inicio);
    if (isNaN(inicio.getTime())) return null;
    const [empresa, clientes, doDia] = await Promise.all([
      getEmpresa().catch(() => null),
      getClientes().catch(() => [] as Cliente[]),
      getAgendamentosDoDia(inicio).catch(() => [] as Agendamento[]),
    ]);
    const origem = origemParaVisita(proxima, doDia, empresa, clientes);
    // Sem origem ou sem destino não há chamada nenhuma: reprovar de graça é
    // metade do controle de custo desta feature.
    if (!origem) return null;
    const destino = enderecoDoAgendamento(proxima, clientes);
    if (!destino) return null;
    const r = await calcularSaida({
      origem: origem.endereco,
      destino,
      chegarEm: inicio,
      modo: 'planejamento',
    });
    return linhaBomDiaSaida(r, new Date());
  } catch {
    return null;
  }
}

/**
 * Recalcula e reagenda o aviso "saia às HH:MM" da PRÓXIMA parada, lendo o banco
 * e entregando tudo pronto para `avisoSaida.ts` (que é folha de propósito — ver
 * o docblock de lá).
 *
 * Roda dentro do reagendamento do ritual, que já é o gatilho certo: acorda com
 * o app aberto e sessão válida, é cancela-e-recria, e não inventa mecanismo
 * novo. Também é exportada para a Home poder pedir um recálculo sob TOQUE do
 * prestador (`forcar`) — o único caminho que ignora o throttle de 4h, porque aí
 * quem pediu a chamada paga foi ele.
 *
 * NUNCA lança.
 */
export async function reagendarAvisoSaidaDoDia(forcar = false): Promise<void> {
  try {
    const proxima = await getProximoAgendamento().catch(() => null);
    const inicio = proxima ? new Date(proxima.inicio) : null;
    const [empresa, clientes, doDia, temPermissao] = await Promise.all([
      getEmpresa().catch(() => null),
      getClientes().catch(() => [] as Cliente[]),
      inicio && !isNaN(inicio.getTime())
        ? getAgendamentosDoDia(inicio).catch(() => [] as Agendamento[])
        : Promise.resolve([] as Agendamento[]),
      temPermissaoNotificacao().catch(() => false),
    ]);
    await reagendarAvisoSaida({ proxima, doDia, empresa, clientes, temPermissao, forcar });
  } catch {
    // best-effort: o lembrete fixo de 1h da agenda continua valendo.
  }
}

/**
 * Manchete do "Bom dia da OLLI": o sinal mais quente entre os 3 loaders da
 * Home, na ordem próxima parada (só conta se for NO DIA-ALVO da notificação)
 * > R$ parado > cliente sumido. `null` = nenhum sinal real → quem chama NÃO
 * agenda nada (nunca "bom dia sem novidades").
 *
 * Cada sinal é buscado isoladamente e nunca propaga erro: uma falha ao ler um
 * deles só derruba AQUELE sinal (cai pro próximo da hierarquia), nunca o
 * reagendamento inteiro — o pior caso aceitável aqui é silêncio, o mesmo
 * resultado de "não há sinal", nunca uma exceção que também derruba o canal
 * "Fechar o dia" no mesmo reagendamento.
 */
async function montarBomDia(alvo: Date): Promise<{ titulo: string; corpo: string } | null> {
  const [proxima, cobranca, radar] = await Promise.all([
    getProximoAgendamento().catch(() => null),
    orcamentosParaCobrar().catch(() => []),
    clientesParaReconquistar().catch(() => []),
  ]);

  if (proxima && mesmoDiaCalendario(new Date(proxima.inicio), alvo)) {
    const inicio = new Date(proxima.inicio);
    if (!isNaN(inicio.getTime())) {
      const hora = `${String(inicio.getHours()).padStart(2, '0')}:${String(inicio.getMinutes()).padStart(2, '0')}`;
      const quem = proxima.clienteNome || proxima.titulo;
      // A ÚNICA frase que faltava no "Bom dia": quando sair. Quando não dá para
      // calcular, `linhaSaida` é null e o corpo sai EXATAMENTE como já saía
      // (cliente, horário, endereço) — falha de trânsito não pode piorar uma
      // notificação que já funciona nem inventar um horário dentro dela.
      const linhaSaida = await linhaDeSaidaParaBomDia(proxima);
      return {
        titulo: 'Bom dia da OLLI',
        corpo: linhaSaida
          ? `Hoje às ${hora}: ${quem} · ${linhaSaida}`
          : `Hoje às ${hora}: ${quem}${proxima.endereco ? ' · ' + proxima.endereco : ''}`,
      };
    }
  }

  if (cobranca.length > 0) {
    const total = cobranca.reduce((s, item) => s + item.valor, 0);
    return {
      titulo: 'Bom dia da OLLI',
      corpo: `${formatCurrency(total)} parado${cobranca.length > 1 ? 's' : ''} em ${cobranca.length} orçamento${cobranca.length > 1 ? 's' : ''} aprovado${cobranca.length > 1 ? 's' : ''} — cobre com 1 toque`,
    };
  }

  if (radar.length > 0) {
    const item = radar[0];
    return {
      titulo: 'Bom dia da OLLI',
      corpo: `${item.cliente.nome} sumiu há ${item.mesesSemContato} ${item.mesesSemContato === 1 ? 'mês' : 'meses'} — hora de chamar de volta`,
    };
  }

  return null;
}

/**
 * Horário de disparo do "Fechar o dia" DE HOJE, ou `null` se hoje já não dá
 * mais tempo (fora da janela 07h-20h). Antes das 18h, dispara às 18h; entre
 * 18h e 20h (app aberto tarde), dispara em breve — ainda vale avisar hoje;
 * depois das 20h, silêncio (nunca empurra o relatório de HOJE pra amanhã).
 */
function horarioFecharHojeOuNull(): Date | null {
  const agora = new Date();
  const hoje = new Date(agora); hoje.setHours(HORA_FECHAR_DIA, 0, 0, 0);
  if (agora.getTime() < hoje.getTime()) return hoje;
  const fimJanela = new Date(agora); fimJanela.setHours(FIM_JANELA_HORA, 0, 0, 0);
  if (agora.getTime() < fimJanela.getTime()) return new Date(agora.getTime() + 5000);
  return null;
}

/**
 * Prévia do "Fechar o dia": `null` se não há relatório (falha de leitura) ou
 * se `semMovimentos` (dia sem nenhum movimento — nunca notifica um dia vazio).
 * A prévia é a 1ª frase da MESMA narrativa que `RelatorioDiaScreen` fala em
 * voz alta (`relatorioParaTexto`) — nunca um resumo reescrito à parte.
 */
async function montarFecharDia(): Promise<{ titulo: string; corpo: string } | null> {
  let relatorio;
  try {
    relatorio = await gerarRelatorioDia();
  } catch {
    return null;
  }
  if (relatorio.semMovimentos) return null;

  const narrativa = relatorioParaTexto(relatorio);
  const previa = narrativa.split('. ')[0];
  return {
    titulo: 'Fechar o dia',
    corpo: `${previa}. Toque para ouvir o relatório.`,
  };
}

/**
 * Cancela os 2 lembretes do ritual (se existirem) e limpa o mapa. Chamado no
 * início de todo reagendamento (padrão cancela-e-recria) e no logout — antes
 * de apagar o mapa que permite cancelá-los, senão o "Bom dia"/"Fechar o dia"
 * da conta anterior continuaria disparando (com dado dela) após a troca de
 * conta no mesmo aparelho. NUNCA lança.
 */
export async function cancelarRitualDiario(): Promise<void> {
  try {
    const mapa = await getMapa();
    for (const id of Object.values(mapa)) {
      if (!id) continue;
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
    }
    await AsyncStorage.removeItem(RITUAL_NOTIF_MAP_KEY);
  } catch {
    // best-effort
  }
}

/**
 * (Re)agenda o ritual diário inteiro: cancela os 2 lembretes anteriores e
 * agenda de novo os que ainda fazem sentido — respeitando os toggles por
 * canal, o domingo mudo e a regra "sinal real ou silêncio". Idempotente por
 * construção (cancela antes de criar): chamar de novo nunca duplica
 * notificação. NUNCA lança — falha aqui não pode travar boot nem sync.
 */
export async function reagendarRitualDiario(): Promise<void> {
  try {
    await cancelarRitualDiario();

    // ANTES dos toggles e ANTES do gate de permissão, de propósito. O aviso
    // "saia às HH:MM" não é um terceiro canal de engajamento: ele SUBSTITUI o
    // lembrete de agenda que já existe (ver avisoSaida.ts), então não obedece
    // aos toggles de "Bom dia"/"Fechar o dia". E ele grava o resultado — inclusive
    // a falha — para a Home mostrar; quem negou notificações continua vendo o
    // horário de saída na tela, que é onde ele vale mais.
    await reagendarAvisoSaidaDoDia();

    const { bomDia: bomDiaAtivo, fecharDia: fecharDiaAtivo, domingo: domingoAtivo } = await getPreferenciasRitual();
    if (!bomDiaAtivo && !fecharDiaAtivo) return; // os 2 canais desligados: nada a fazer

    // Não pedimos permissão aqui (mesma regra de pmocLembretes.ts): quem pede é
    // a Agenda (garantirPermissaoNotificacaoComAviso) ou o toggle em Conta.
    if (!(await temPermissaoNotificacao())) return;

    await garantirCanalAndroid();

    const mapa: Partial<Record<CanalRitual, string>> = {};

    if (bomDiaAtivo) {
      const alvo = avancarSeDomingoMudo(proximaOcorrencia(HORA_BOM_DIA), domingoAtivo);
      const conteudo = await montarBomDia(alvo);
      if (conteudo) {
        try {
          const id = await Notifications.scheduleNotificationAsync({
            content: { title: conteudo.titulo, body: conteudo.corpo, data: { ritual: 'bomDia' as const } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alvo, channelId: CANAL_ANDROID_ID },
          });
          mapa.bomDia = id;
        } catch {
          // pula este canal, tenta o outro
        }
      }
    }

    // "Fechar o dia" é sempre sobre HOJE — se hoje é domingo mudo, não há o que
    // reagendar agora (amanhã o reagendamento roda de novo com o dia certo).
    if (fecharDiaAtivo && !(ehDomingo(new Date()) && !domingoAtivo)) {
      const alvo = horarioFecharHojeOuNull();
      if (alvo) {
        const conteudo = await montarFecharDia();
        if (conteudo) {
          try {
            const id = await Notifications.scheduleNotificationAsync({
              content: { title: conteudo.titulo, body: conteudo.corpo, data: { ritual: 'fecharDia' as const } },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alvo, channelId: CANAL_ANDROID_ID },
            });
            mapa.fecharDia = id;
          } catch {
            // pula este canal
          }
        }
      }
    }

    if (Object.keys(mapa).length > 0) await setMapa(mapa);
  } catch {
    // best-effort: falha no reagendamento do ritual nunca trava boot/sync
  }
}
