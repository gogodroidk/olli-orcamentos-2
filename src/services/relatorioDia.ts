import * as Speech from 'expo-speech';
import {
  getOrcamentos, getRecibos, getClientes, saveRelatorioDia, getRelatorioDia as getRelatorioDiaRow,
} from '../database/database';
import { getAgendamentosDoDia } from './agenda';
import { formatCurrency } from '../utils/currency';
import { todayISO } from '../utils/date';
import { StatusAgendamento } from '../types';

/** true se o ISO/timestamp cai no dia local `dataChave` ('YYYY-MM-DD'). */
function ehDoDia(iso: string | undefined | null, dataChave: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}` === dataChave;
}

export interface RelatorioDia {
  /** 'YYYY-MM-DD' — dia a que este relatório se refere. */
  data: string;
  orcamentos: {
    criados: number;
    criadosValor: number;
    enviados: number;
    enviadosValor: number;
    aprovados: number;
    aprovadosValor: number;
  };
  recibos: {
    emitidos: number;
    totalRecebido: number;
  };
  agendamentos: {
    total: number;
    porStatus: Record<StatusAgendamento, number>;
  };
  clientesNovos: number;
  /** true quando não houve NENHUM movimento no dia (para a narrativa honesta). */
  semMovimentos: boolean;
  /**
   * Nota manual do dono ("como foi o dia / problemas"). Fica DENTRO do snapshot
   * (blob `dados`), então sincroniza junto pelo mesmo caminho LWW — sem coluna
   * nova. A regeração automática do dia preserva a nota já escrita.
   */
  nota?: string;
}

/**
 * Compila o relatório do dia a partir do banco local. Sem parâmetro, usa hoje.
 * Ao gerar o relatório do DIA CORRENTE (hoje), salva automaticamente o snapshot
 * (saveRelatorioDia) para entrar no histórico — dias passados não são resalvos.
 */
export async function gerarRelatorioDia(data?: string): Promise<RelatorioDia> {
  const hoje = todayISO();
  const dataChave = data ?? hoje;

  const [orcamentos, recibos, clientes, agendamentosDoDia] = await Promise.all([
    getOrcamentos(),
    getRecibos(),
    getClientes(),
    // Só sabemos buscar agenda por Date; se for outro dia, reconstrói a partir da chave.
    getAgendamentosDoDia(dataChave === hoje ? new Date() : new Date(`${dataChave}T00:00:00`)),
  ]);

  const orcamentosDoDia = orcamentos.filter(o => ehDoDia(o.criadoEm, dataChave));
  const criados = orcamentosDoDia;
  // 'recusado' fica fora: a narrativa trata 'enviados' como aguardando resposta,
  // e um orcamento ja recusado nao esta aguardando nada.
  const enviados = orcamentosDoDia.filter(o => o.status === 'enviado' || o.status === 'aguardando_assinatura' || o.status === 'aprovado');
  const aprovados = orcamentosDoDia.filter(o => o.status === 'aprovado');

  const recibosDoDia = recibos.filter(r => ehDoDia(r.dataRecebimento, dataChave) || ehDoDia(r.criadoEm, dataChave));
  const clientesNovosDoDia = clientes.filter(c => ehDoDia(c.criadoEm, dataChave));

  const porStatus: Record<StatusAgendamento, number> = { agendado: 0, concluido: 0, cancelado: 0 };
  for (const a of agendamentosDoDia) porStatus[a.status] = (porStatus[a.status] ?? 0) + 1;

  const relatorio: RelatorioDia = {
    data: dataChave,
    orcamentos: {
      criados: criados.length,
      criadosValor: criados.reduce((s, o) => s + o.valorTotal, 0),
      enviados: enviados.length,
      enviadosValor: enviados.reduce((s, o) => s + o.valorTotal, 0),
      aprovados: aprovados.length,
      aprovadosValor: aprovados.reduce((s, o) => s + o.valorTotal, 0),
    },
    recibos: {
      emitidos: recibosDoDia.length,
      totalRecebido: recibosDoDia.reduce((s, r) => s + r.valorRecebido, 0),
    },
    agendamentos: {
      total: agendamentosDoDia.length,
      porStatus,
    },
    clientesNovos: clientesNovosDoDia.length,
    semMovimentos:
      criados.length === 0 && recibosDoDia.length === 0 &&
      agendamentosDoDia.length === 0 && clientesNovosDoDia.length === 0,
  };

  // Snapshot automático só do dia CORRENTE — histórico de dias passados não se
  // reescreve sozinho (o usuário revisita o passado, não o recalcula).
  if (dataChave === hoje) {
    try {
      // PRESERVA a nota manual já escrita: a regeração recomputa os números, mas
      // a nota do dono não pode ser apagada por um foco de tela ou por um sync.
      const anterior = await getRelatorioDiaRow(dataChave);
      const notaAnterior = (anterior?.dados as RelatorioDia | undefined)?.nota;
      if (notaAnterior) relatorio.nota = notaAnterior;
      await saveRelatorioDia(dataChave, relatorio);
    } catch {
      // salvar o snapshot é best-effort: nunca deve quebrar a geração/leitura do relatório
    }
  }

  return relatorio;
}

/**
 * Salva a nota manual do dono para um dia, preservando os números já compilados.
 * Lê o snapshot existente (ou compila na hora, se ainda não houver) e reescreve
 * só a nota — o `criado_em` novo faz a nota vencer no LWW da sincronização.
 */
export async function salvarNotaDia(data: string, nota: string): Promise<void> {
  const row = await getRelatorioDiaRow(data);
  const base = (row?.dados as RelatorioDia | undefined) ?? await gerarRelatorioDia(data);
  const limpa = nota.trim();
  await saveRelatorioDia(data, { ...base, nota: limpa || undefined });
}

/** Nota manual formatada como parágrafo pra colar no fim do texto falado/compartilhado. */
export function notaComoTexto(r: RelatorioDia): string {
  const n = r.nota?.trim();
  return n ? `\n\nMinha nota do dia: ${n}` : '';
}

/** Lê o snapshot salvo de um dia anterior (histórico), ou null se nunca foi gerado/salvo. */
export async function getRelatorioDiaSalvo(data: string): Promise<RelatorioDia | null> {
  const row = await getRelatorioDiaRow(data);
  return row ? (row.dados as RelatorioDia) : null;
}

function pluralizar(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/**
 * Monta a narrativa em PT-BR natural do relatório — para falar (TTS) e para
 * compartilhar (texto). Honesto: dia sem nenhum movimento não inventa nada.
 */
export function relatorioParaTexto(r: RelatorioDia): string {
  if (r.semMovimentos) {
    return 'Hoje foi um dia sem movimentos registrados no app. Nenhum orçamento, recibo, agendamento ou cliente novo. Bora colocar o dia de amanhã pra render!';
  }

  const partes: string[] = [];
  const { orcamentos, recibos, agendamentos, clientesNovos } = r;

  if (orcamentos.criados > 0) {
    partes.push(
      `Hoje você criou ${orcamentos.criados} ${pluralizar(orcamentos.criados, 'orçamento', 'orçamentos')}, somando ${formatCurrency(orcamentos.criadosValor)}`
    );
  }

  if (orcamentos.aprovados > 0) {
    partes.push(
      `Fechou ${orcamentos.aprovados} ${pluralizar(orcamentos.aprovados, 'orçamento aprovado', 'orçamentos aprovados')}, no valor de ${formatCurrency(orcamentos.aprovadosValor)}`
    );
  } else if (orcamentos.enviados > 0) {
    partes.push(
      `Tem ${orcamentos.enviados} ${pluralizar(orcamentos.enviados, 'orçamento enviado', 'orçamentos enviados')} aguardando resposta do cliente`
    );
  }

  if (recibos.emitidos > 0) {
    partes.push(
      `Emitiu ${recibos.emitidos} ${pluralizar(recibos.emitidos, 'recibo', 'recibos')} e recebeu ${formatCurrency(recibos.totalRecebido)}`
    );
  }

  if (agendamentos.total > 0) {
    const concluidos = agendamentos.porStatus.concluido;
    const detalhesAgenda: string[] = [];
    if (concluidos > 0) detalhesAgenda.push(`${concluidos} ${pluralizar(concluidos, 'concluído', 'concluídos')}`);
    if (agendamentos.porStatus.agendado > 0) detalhesAgenda.push(`${agendamentos.porStatus.agendado} ainda ${pluralizar(agendamentos.porStatus.agendado, 'agendado', 'agendados')}`);
    const sufixo = detalhesAgenda.length > 0 ? ` (${detalhesAgenda.join(', ')})` : '';
    partes.push(
      `Teve ${agendamentos.total} ${pluralizar(agendamentos.total, 'compromisso na agenda', 'compromissos na agenda')}${sufixo}`
    );
  }

  if (clientesNovos > 0) {
    partes.push(
      `Cadastrou ${clientesNovos} cliente${clientesNovos > 1 ? 's' : ''} novo${clientesNovos > 1 ? 's' : ''}`
    );
  }

  return partes.join('. ') + '. Foi um dia de trabalho pra você — continue assim!';
}

/**
 * Fala o relatório em voz alta (PT-BR) usando expo-speech. Interrompe qualquer
 * fala anterior antes de começar (evita sobrepor áudio se o usuário reabrir a tela).
 * `onFim` é chamado quando a fala termina naturalmente OU dá erro — a tela usa
 * para voltar o botão de "Parar" para "Ouvir relatório" sem esperar um toque.
 */
export async function falarRelatorio(r: RelatorioDia, onFim?: () => void): Promise<void> {
  const texto = relatorioParaTexto(r) + notaComoTexto(r);
  try {
    await Speech.stop();
  } catch {
    // stop antes de falar é best-effort
  }
  Speech.speak(texto, {
    language: 'pt-BR',
    onDone: onFim,
    onStopped: onFim,
    onError: onFim,
  });
}

/** Interrompe a fala em andamento (usado no botão "Parar" e no cleanup da tela). */
export function pararFala(): void {
  try {
    Speech.stop();
  } catch {
    // nunca deve quebrar o cleanup
  }
}
