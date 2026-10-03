import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb, moverAgendamentoParaLixeira } from '../database/database';
import type { Agendamento, OrdemServico } from '../types';
import { pushRow } from './cloudSync';
import { cancelarAvisoSaida } from './avisoSaida';
import { LEMBRETE_MAP_KEY } from './storageKeys';
import {
  expandirRecorrencia,
  excecoesParaTexto,
  idAgendamentoDaOS,
  lerExcecoes,
  planejarEdicaoRecorrente,
  planejarLembretes,
  visitaConcluidaPelaOS,
  type AlcanceEdicaoRecorrente,
  type MudancaOcorrencia,
  type OcorrenciaAgendamento,
  type PlanoEdicaoRecorrente,
} from '../utils/contratoRecorrente';
import { generateId } from '../utils/id';
import { aplicarExtrasAoPlano, type ExtrasEdicaoSerie } from '../utils/agendaVisual';
import { externaParaSqlite, lerExterna } from './verticais';

// Conflito por técnico (com duração por tipo): função pura, reexportada para as telas.
export { encontrarConflitosPorTecnico, type CandidatoConflito } from '../utils/contratoRecorrente';
import {
  escolherProximaParada, escolherProximaSaida, filtrarVisitasSemBaixa, limitesDoDiaLocal,
  JANELA_EM_ANDAMENTO_DIAS, JANELA_PROXIMA_PARADA_DIAS, JANELA_SEM_BAIXA_DIAS,
} from '../utils/agendaDia';
import { aplicarEscopo, type EscopoConhecido } from '../utils/agendaDominio';
import { alcanceDaBaixa } from '../utils/linhaDoTempoHoje';

const MS_DIA = 24 * 60 * 60 * 1000;

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

/**
 * Minutos de antecedência do lembrete (fixo — cego a trânsito, de propósito:
 * ele funciona offline, sem API e sem custo, e por isso é o CHÃO desta feature).
 *
 * O "a que horas eu preciso sair" (`services/avisoSaida.ts`) SUBSTITUI este
 * lembrete quando — e só quando — consegue calcular a hora de saída com o
 * trânsito. Falhou o cálculo (offline, API fora, endereço ruim)? Este lembrete
 * continua de pé, intacto. É o fallback explícito: o prestador nunca fica sem
 * aviso, e nunca recebe um aviso com hora inventada.
 */
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

/**
 * Estado da permissão de notificação SEM pedir nada: 'concedida', 'negada' (o
 * sistema bloqueia — só os ajustes do aparelho resolvem) ou 'nao_perguntada'.
 * `null` = não deu para ler — "não sei" não vira "bloqueada" nem "liberada".
 */
export async function estadoPermissaoNotificacao(): Promise<'concedida' | 'negada' | 'nao_perguntada' | null> {
  try {
    const permissao = await Notifications.getPermissionsAsync();
    if (permissao.granted === true) return 'concedida';
    return permissao.status === 'denied' ? 'negada' : 'nao_perguntada';
  } catch {
    return null;
  }
}

/** true se a permissão de notificação já está concedida (sem pedir de novo). */
export async function temPermissaoNotificacao(): Promise<boolean> {
  try {
    const permissao = await Notifications.getPermissionsAsync();
    return permissao.granted === true;
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
    if (atual.granted === true) return true;
    const pedida = await Notifications.requestPermissionsAsync();
    return pedida.granted === true;
  } catch {
    return false;
  }
}

/**
 * Cancela os lembretes deste agendamento: o da própria linha e os de TODAS as
 * ocorrências da série (chaves `<id>@<dia>`). Sem o prefixo, editar uma série
 * deixaria tocando os lembretes das ocorrências no horário velho.
 */
async function cancelarLembrete(agendamentoId: string): Promise<void> {
  const map = await getLembreteMap();
  const chaves = Object.keys(map).filter((k) => k === agendamentoId || k.startsWith(`${agendamentoId}@`));
  if (!chaves.length) return;
  for (const chave of chaves) {
    try { await Notifications.cancelScheduledNotificationAsync(map[chave]); } catch {}
    delete map[chave];
  }
  await setLembreteMap(map);
}

/**
 * (Re)agenda os lembretes locais de um agendamento: cancela os anteriores (da linha
 * e de todas as ocorrências) e cria um por OCORRÊNCIA ainda `agendado`,
 * `MINUTOS_ANTECEDENCIA_LEMBRETE` minutos antes do início (`planejarLembretes`).
 * Série: só as ocorrências dos próximos `JANELA_LEMBRETES_DIAS` dias, chave
 * `<id>@<dia>` (a mesma do aviso de saída) — cancelada não toca, movida toca no
 * horário novo, concluída só ela para de tocar. A janela anda a cada
 * `resincronizarLembretes` (após o sync). Avulso: o próprio, chave = id.
 * Não lança: falha de notificação nunca deve impedir salvar o agendamento.
 */
async function agendarLembrete(a: Agendamento): Promise<void> {
  try {
    await cancelarLembrete(a.id);
    const planejados = planejarLembretes(a, new Date(), MINUTOS_ANTECEDENCIA_LEMBRETE);
    if (!planejados.length) return;

    const temPermissao = await temPermissaoNotificacao();
    if (!temPermissao) return; // não pede permissão aqui; quem chama já deve ter pedido

    await garantirCanalAndroid();

    const map = await getLembreteMap();
    for (const { chave, disparo, ocorrencia: o } of planejados) {
      try {
        const inicio = new Date(o.inicio);
        const horaTxt = `${String(inicio.getHours()).padStart(2, '0')}:${String(inicio.getMinutes()).padStart(2, '0')}`;
        map[chave] = await Notifications.scheduleNotificationAsync({
          content: {
            title: `Visita em ${MINUTOS_ANTECEDENCIA_LEMBRETE >= 60 ? `${Math.round(MINUTOS_ANTECEDENCIA_LEMBRETE / 60)}h` : `${MINUTOS_ANTECEDENCIA_LEMBRETE}min`}`,
            body: `${o.titulo} · ${o.clienteNome} às ${horaTxt}${o.endereco ? ' · ' + o.endereco : ''}`,
            // agendamentoId = a LINHA (quem abre a notificação abre a base); a
            // ocorrência vai junto para a tela saber qual dia foi.
            data: { agendamentoId: a.id, ocorrenciaId: chave },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: disparo,
            channelId: CANAL_ANDROID_ID,
          },
        });
      } catch {
        // uma ocorrência que falhou não derruba as outras
      }
    }
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
  // `cancelAllScheduledNotificationsAsync` acima derrubou TAMBÉM o aviso "saia
  // às HH:MM" (ele é uma notificação como as outras). Sem esta linha o registro
  // sobreviveria apontando para um id morto, e a Home mostraria como agendado um
  // aviso que não vai tocar mais.
  await cancelarAvisoSaida();
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
    // LÊ antes de cancelar: a leitura agora pode lançar (exceções ilegíveis numa
    // série, `lerExcecoes`). Cancelar primeiro faria "não consegui ler a agenda"
    // virar "nenhum lembrete" — o aparelho ficaria mudo sem ninguém saber.
    const agendamentos = await getAgendamentos();
    await cancelarTodosLembretes();
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

// ─── SOBREPOSIÇÃO DE HORÁRIO (aviso não-bloqueante ao salvar) ─
/**
 * Agendamento ATIVO (não cancelado) cujo intervalo cruza com [inicio, fim) do
 * candidato — mesmo dia "de graça" (dois intervalos em dias diferentes nunca
 * se cruzam por timestamp). Passe `ignorarId` ao EDITAR, senão o item colide
 * consigo mesmo. Sem `fim` definido (nem no candidato, nem no item salvo),
 * assume 1h de duração só para efeito da comparação (não altera nada gravado).
 * Puro — opera sobre a lista JÁ carregada em memória (`itens`), sem query nova;
 * é aviso, não validação: quem chama decide se deixa salvar mesmo assim.
 */
export function encontrarConflitoDeHorario(
  itens: Agendamento[],
  candidato: { inicio: Date; fim?: Date },
  ignorarId?: string,
): Agendamento | null {
  const DURACAO_PADRAO_MS = 60 * 60 * 1000;
  const ini = candidato.inicio.getTime();
  if (isNaN(ini)) return null;
  const fim = candidato.fim ? candidato.fim.getTime() : ini + DURACAO_PADRAO_MS;
  for (const a of itens) {
    if (a.id === ignorarId || a.status === 'cancelado') continue;
    const aIni = new Date(a.inicio).getTime();
    if (isNaN(aIni)) continue;
    const aFim = a.fim ? new Date(a.fim).getTime() : aIni + DURACAO_PADRAO_MS;
    if (isNaN(aFim)) continue;
    if (ini < aFim && fim > aIni) return a;
  }
  return null;
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
    responsavelId: r.responsavel_id ?? undefined,
    responsavelNome: r.responsavel_nome ?? undefined,
    recorrencia: r.recorrencia ?? undefined,
    recorrenciaAte: r.recorrencia_ate ?? undefined,
    contratoId: r.contrato_id ?? undefined,
    // Lança se ilegível: "não sei o que foi cancelado" não vira "nada foi".
    excecoes: lerExcecoes(r.excecoes),
    ordemServicoId: r.ordem_servico_id ?? undefined,
    // 1/0/NULL → boolean | undefined. NULL é "não informado", nunca "interna".
    externa: lerExterna(r.externa),
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

/**
 * Agendamentos do intervalo [inicioISO, fimISO) COM as ocorrências projetadas das
 * séries recorrentes (que começaram antes do intervalo e ainda valem nele). A
 * ocorrência projetada tem id `<base>@<dia>` e `ocorrenciaDe` = base — quem edita
 * abre a base (`idBaseDaOcorrencia`). Agenda, Hoje, Próxima parada, Relatório do
 * dia e "Bom dia" leem daqui; só os lembretes locais seguem com as linhas reais.
 */
export async function getAgendamentosExpandidos(inicioISO: string, fimISO: string): Promise<OcorrenciaAgendamento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM agendamentos WHERE excluido_em IS NULL AND (
       (inicio >= ? AND inicio < ?)
       OR (recorrencia IS NOT NULL AND inicio < ? AND (recorrencia_ate IS NULL OR recorrencia_ate >= ?))
     ) ORDER BY inicio ASC`,
    [inicioISO, fimISO, fimISO, inicioISO.slice(0, 10)],
  );
  return rows
    .map(rowToAgendamento)
    .flatMap((a) => expandirRecorrencia(a, inicioISO, fimISO))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/**
 * Agendamentos do dia informado (Date local; default: hoje), COM as repetições
 * das séries recorrentes. Antes lia só as linhas cujo `inicio` caía no dia, e uma
 * manutenção semanal sumia do Hoje, do Relatório do dia e do "Bom dia" a partir
 * da 2ª semana. Repetição projetada tem id `<base>@<dia>`.
 */
export async function getAgendamentosDoDia(dia: Date = new Date()): Promise<OcorrenciaAgendamento[]> {
  const { inicio, fim } = limitesDoDiaLocal(dia);
  return getAgendamentosExpandidos(inicio.toISOString(), fim.toISOString());
}

/**
 * Próxima parada (card do Início, no celular e no desktop): a primeira visita ativa
 * dos próximos 60 dias, já com as séries recorrentes, cujo fim
 * (COALESCE(fim, inicio + 1h)) ainda não passou. Cancelada e concluída não
 * contam. A visita EM ANDAMENTO continua sendo a próxima parada até terminar
 * (o rótulo vira "AGORA", ver `rotuloQuandoVisita`). `null` = nada marcado.
 */
export async function getProximoAgendamento(agora: Date = new Date()): Promise<OcorrenciaAgendamento | null> {
  const desde = new Date(agora.getTime() - JANELA_EM_ANDAMENTO_DIAS * MS_DIA);
  const ate = new Date(agora.getTime() + JANELA_PROXIMA_PARADA_DIAS * MS_DIA);
  // LIXEIRA: getAgendamentosExpandidos já exclui soft-deletados.
  const ocorrencias = await getAgendamentosExpandidos(desde.toISOString(), ate.toISOString());
  return escolherProximaParada(ocorrencias, agora);
}

/**
 * Próxima SAÍDA (aviso "saia às" e "Bom dia"): a primeira visita ativa dos
 * próximos 60 dias, já com as séries recorrentes, que ainda NÃO começou. A visita
 * em andamento fica de fora de propósito: ela é a Próxima parada do Início, mas o
 * aviso de saída tem que mirar a SEGUINTE (ver `escolherProximaSaida`).
 * Exige escopo CONHECIDO (`EscopoConhecido`) e filtra ANTES de escolher: o
 * técnico sai para a visita DELE, não a do colega. Sem papel, quem chama fica quieto.
 */
export async function getProximaSaida(escopo: EscopoConhecido, agora: Date = new Date()): Promise<OcorrenciaAgendamento | null> {
  const ate = new Date(agora.getTime() + JANELA_PROXIMA_PARADA_DIAS * MS_DIA);
  const ocorrencias = await getAgendamentosExpandidos(agora.toISOString(), ate.toISOString());
  return escolherProximaSaida(aplicarEscopo(ocorrencias, escopo), agora);
}

/**
 * Visitas dos últimos 60 dias que já terminaram e seguem "agendado" (ninguém
 * deu baixa). Mais recente primeiro. Séries recorrentes ficam de fora enquanto o
 * status for da série inteira (ver `filtrarVisitasSemBaixa`). Propaga erro de
 * leitura: quem mostra decide o estado de erro (nunca vira lista vazia).
 */
export async function getVisitasSemBaixa(agora: Date = new Date()): Promise<Agendamento[]> {
  const desde = new Date(agora.getTime() - JANELA_SEM_BAIXA_DIAS * MS_DIA);
  const linhas = await getAgendamentosRange(desde.toISOString(), agora.toISOString());
  return filtrarVisitasSemBaixa(linhas, agora);
}

// SEM filtro de excluido_em de propósito: leitura por id serve tanto o detalhe
// de um agendamento ativo quanto o fluxo de restaurar/ver da lixeira.
export async function getAgendamento(id: string): Promise<Agendamento | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM agendamentos WHERE id = ?', [id]);
  return row ? rowToAgendamento(row) : null;
}

/**
 * A linha INTEIRA do agendamento (INSERT OR REPLACE reescreve tudo).
 * `excluido_em` PRECISA entrar: sem a coluna, um save sobre um item que está na
 * LIXEIRA o RESSUSCITARIA (getAgendamento(id) não filtra de propósito —
 * detalhe/restauração o alcançam). Item ativo tem `excluidoEm` undefined → grava
 * null, que é exatamente o correto. Mesma lógica para responsável/recorrência/contrato.
 */
const SQL_SALVAR_AGENDAMENTO = `INSERT OR REPLACE INTO agendamentos
       (id, cliente_id, cliente_nome, titulo, tipo, inicio, fim, endereco, status, orcamento_id, observacao, criado_em, atualizado_em, excluido_em,
        responsavel_id, responsavel_nome, recorrencia, recorrencia_ate, contrato_id, excecoes, ordem_servico_id, externa)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

function valoresDoAgendamento(a: Agendamento): (string | number | null)[] {
  return [a.id, a.clienteId ?? null, a.clienteNome, a.titulo, a.tipo, a.inicio,
    a.fim ?? null, a.endereco ?? null, a.status, a.orcamentoId ?? null,
    a.observacao ?? null, a.criadoEm, a.atualizadoEm, a.excluidoEm ?? null,
    a.responsavelId ?? null, a.responsavelId ? (a.responsavelNome ?? null) : null,
    a.recorrencia ?? null, a.recorrencia ? (a.recorrenciaAte ?? null) : null, a.contratoId ?? null,
    // Exceção só existe em série: tirar a repetição apaga as exceções junto.
    a.recorrencia ? excecoesParaTexto(a.excecoes) : null, a.ordemServicoId ?? null,
    externaParaSqlite(a.externa)];
}

/** Cria ou atualiza (upsert) um agendamento. */
export async function saveAgendamento(entrada: Agendamento): Promise<void> {
  const db = await getDb();
  // `externa` (Onda I1): os formulários remontam o agendamento campo a campo e
  // ainda não conhecem este campo. Objeto SEM a chave = "o formulário não sabe" →
  // mantém o gravado (senão editar o horário apagaria o "externa" marcado em outro
  // lugar). Com a chave, mesmo `undefined`, é escolha explícita ("Não sei").
  let a = entrada;
  if (!('externa' in entrada)) {
    const gravado = await db.getFirstAsync<{ externa: number | null }>('SELECT externa FROM agendamentos WHERE id = ?', [entrada.id]);
    const externa = lerExterna(gravado?.externa);
    if (externa !== undefined) a = { ...entrada, externa };
  }
  await db.runAsync(SQL_SALVAR_AGENDAMENTO, valoresDoAgendamento(a));
  // Espelha na nuvem em background (fire-and-forget; no-op se offline/deslogado).
  try { void pushRow('agendamentos', a).catch(() => {}); } catch {}
  // Reagenda o lembrete local (cancela o anterior e cria um novo, se aplicável).
  // Fire-and-forget: nunca deve travar o salvamento por causa de notificação.
  void agendarLembrete(a).catch(() => {});
  // E derruba o aviso "saia às HH:MM" desta visita, que foi calculado para o
  // horário/endereço ANTIGOS. Mudar a visita das 15h para as 17h sem isto
  // deixaria um "Saia às 14:23" agendado para a hora velha — pior do que não
  // ter aviso. O `agendarLembrete` acima já recolocou o lembrete fixo de 1h no
  // lugar, então o prestador nunca fica sem nada; o aviso calculado volta no
  // próximo reagendamento do ritual.
  void cancelarAvisoSaida(a.id).catch(() => {});
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
  // Item na lixeira não notifica — nem o lembrete fixo, nem o "saia às HH:MM".
  void cancelarAvisoSaida(id).catch(() => {});
}

// ─── SÉRIE: editar só esta / esta e as próximas / a série toda ───────────────

/**
 * Edita uma ocorrência de série recorrente (`idOcorrencia` = `'<base>@<dia>'`, ou o
 * id da base para a 1ª ocorrência) com o alcance escolhido pelo prestador. A regra é
 * `planejarEdicaoRecorrente` (pura, testada); aqui só lê a base e grava as linhas —
 * cada gravação passa por `saveAgendamento` (nuvem + lembretes por ocorrência).
 *
 * LANÇA quando não dá para fazer o que foi pedido (base inexistente, não é série,
 * dia fora da série, horário inválido): nada é gravado pela metade antes da checagem.
 * Em "esta e as próximas" a série NOVA é gravada antes do corte da antiga: se a 2ª
 * escrita falhar, sobra a série antiga inteira (visita a mais), nunca um buraco.
 */
export async function editarRecorrente(
  idOcorrencia: string,
  alcance: AlcanceEdicaoRecorrente,
  mudanca: MudancaOcorrencia,
  extras?: ExtrasEdicaoSerie,
): Promise<PlanoEdicaoRecorrente> {
  const baseId = idOcorrencia.split('@')[0];
  const base = await getAgendamento(baseId);
  if (!base) throw new Error('Agendamento não encontrado neste aparelho.');
  // Cliente/tipo/endereço/regra vão para a linha certa (série nova ou base); lança
  // antes de gravar se o alcance não comporta a mudança.
  const plano = aplicarExtrasAoPlano(
    planejarEdicaoRecorrente(base, idOcorrencia, alcance, mudanca, { agora: new Date(), novoId: generateId() }),
    alcance,
    extras,
  );
  if (plano.novaSerie) await saveAgendamento(plano.novaSerie);
  await saveAgendamento(plano.base);
  return plano;
}

// ─── Baixa rápida (linha do tempo do Hoje) ───────────────────────────────────

/**
 * Dá baixa (ou desfaz a baixa) numa visita do dia direto do Hoje. Visita de série
 * muda SÓ esta ocorrência (exceção da série, via `editarRecorrente`), nunca a série
 * inteira; visita avulsa muda a própria linha. Ver `alcanceDaBaixa`.
 *
 * LANÇA se não conseguir gravar (visita sumiu do aparelho, foi para a lixeira,
 * erro de banco): a tela mostra o erro e o estado anterior continua valendo.
 */
export async function mudarStatusVisitaDoDia(
  v: OcorrenciaAgendamento,
  status: 'concluido' | 'agendado',
): Promise<void> {
  if (alcanceDaBaixa(v) === 'so_esta_da_serie') {
    await editarRecorrente(v.id, 'so_esta', { status });
    return;
  }
  const atual = await getAgendamento(v.id);
  if (!atual || atual.excluidoEm) throw new Error('Esta visita não está mais na sua agenda.');
  await saveAgendamento({ ...atual, status, atualizadoEm: new Date().toISOString() });
}

// ─── OS concluída → visita concluída ──────────────────────────────────────────

/**
 * Marca como concluída a visita ligada à OS que acabou de ser concluída: pelo campo
 * `ordem_servico_id` ou, nas visitas de contrato recorrente, pelo id determinístico
 * (`os_cv_…` ↔ `ag_cv_…`). Série: conclui só a ocorrência do dia da OS. Chamado por
 * `saveOrdemServico`. Devolve quantas visitas mudaram. Erro de leitura/escrita
 * PROPAGA (a OS já foi gravada; quem salvou decide o aviso).
 */
export async function concluirVisitasDaOS(
  os: Pick<OrdemServico, 'id' | 'status' | 'dataAgendada' | 'concluidoEm'>,
): Promise<number> {
  if (os.status !== 'concluida') return 0;
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM agendamentos WHERE excluido_em IS NULL AND (ordem_servico_id = ? OR id = ?)',
    [os.id, idAgendamentoDaOS(os.id) ?? ''],
  );
  let mudaram = 0;
  const agora = new Date();
  for (const r of rows) {
    const concluida = visitaConcluidaPelaOS(rowToAgendamento(r), os, agora);
    if (!concluida) continue;
    await saveAgendamento(concluida);
    mudaram++;
  }
  return mudaram;
}
