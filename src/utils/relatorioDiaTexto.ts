/**
 * Partes PURAS do relatório do dia (tipo, resumo da agenda com escopo e a
 * narrativa falada/compartilhada). Ficam fora de `services/relatorioDia.ts`
 * (que puxa expo-speech e o banco) para o teste em `node` alcançar a regra.
 * Só `import type` e utils puros daqui para fora.
 */
import type { Agendamento, StatusAgendamento } from '../types';
import { aplicarEscopo, escopoConhecido, type EscopoAgenda } from './agendaDominio.ts';
import { formatCurrency } from './currency.ts';

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
    /**
     * De quem são as visitas contadas: `equipe` (gestão/conta pessoal), `propria`
     * (técnico: só as dele) ou `indisponivel` (não deu para saber o papel; os
     * números ficam zerados e a narrativa diz que a agenda ficou de fora, nunca
     * "nenhum agendamento"). Ausente nos retratos salvos antes desta regra.
     */
    escopo?: 'equipe' | 'propria' | 'indisponivel';
  };
  clientesNovos: number;
  /** true quando não houve NENHUM movimento no dia (para a narrativa honesta). */
  semMovimentos: boolean;
  /**
   * Nota manual do dono ("como foi o dia / problemas"). Fica DENTRO do snapshot
   * (blob `dados`), então sincroniza junto pelo mesmo caminho — sem coluna nova.
   * A regeração automática do dia preserva a nota já escrita.
   */
  nota?: string;
  /**
   * Carimbo AUTORAL da nota (ISO de quando foi escrita/apagada). É o LWW PRÓPRIO
   * da nota, separado do `criado_em` do snapshot: o snapshot é cache derivado e
   * recomputado por aparelho, mas a nota é autorada. Sem isto, uma simples
   * visualização (criado_em novo, sem nota) apagava a nota escrita em outro
   * aparelho. O merge por campo em cloudSync usa este carimbo.
   */
  notaEm?: string;
}

/**
 * Resumo da agenda do dia já no escopo de quem está usando (mesma regra da
 * Agenda/Hoje): técnico conta só as visitas dele. Sem escopo conhecido, não
 * conta nada e marca `indisponivel`.
 */
export function resumirAgendaDoDia(
  itens: readonly Pick<Agendamento, 'responsavelId' | 'status'>[],
  escopo: EscopoAgenda,
): RelatorioDia['agendamentos'] {
  const porStatus: Record<StatusAgendamento, number> = { agendado: 0, concluido: 0, cancelado: 0 };
  if (!escopoConhecido(escopo)) return { total: 0, porStatus, escopo: 'indisponivel' };
  const visiveis = aplicarEscopo(itens, escopo);
  for (const a of visiveis) porStatus[a.status] = (porStatus[a.status] ?? 0) + 1;
  return { total: visiveis.length, porStatus, escopo: escopo.status };
}

/** Agenda que não deu para ler no escopo certo. */
export function agendaIndisponivel(r: Pick<RelatorioDia, 'agendamentos'>): boolean {
  return r.agendamentos.escopo === 'indisponivel';
}

/**
 * Nada registrado entre o que se SABE (orçamentos, recibos, clientes e a
 * agenda, quando legível). O ritual usa para não notificar um dia em que o
 * único "movimento" seria o aviso de agenda indisponível.
 */
export function semMovimentosConhecidos(r: RelatorioDia): boolean {
  return r.orcamentos.criados === 0 && r.recibos.emitidos === 0 && r.clientesNovos === 0 && r.agendamentos.total === 0;
}

/** Nota manual formatada como parágrafo pra colar no fim do texto falado/compartilhado. */
export function notaComoTexto(r: RelatorioDia): string {
  const n = r.nota?.trim();
  return n ? `\n\nMinha nota do dia: ${n}` : '';
}

function pluralizar(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

const AGENDA_FORA = 'A agenda ficou fora deste resumo: não consegui confirmar quais visitas são suas';

/**
 * Monta a narrativa em PT-BR natural do relatório — para falar (TTS) e para
 * compartilhar (texto). Honesto: dia sem nenhum movimento não inventa nada, e
 * agenda ilegível no escopo certo é dita como tal, nunca como "sem agenda".
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

  if (agendaIndisponivel(r)) {
    partes.push(AGENDA_FORA);
  } else if (agendamentos.total > 0) {
    const concluidos = agendamentos.porStatus.concluido;
    const detalhesAgenda: string[] = [];
    if (concluidos > 0) detalhesAgenda.push(`${concluidos} ${pluralizar(concluidos, 'concluído', 'concluídos')}`);
    if (agendamentos.porStatus.agendado > 0) detalhesAgenda.push(`${agendamentos.porStatus.agendado} ainda ${pluralizar(agendamentos.porStatus.agendado, 'agendado', 'agendados')}`);
    const sufixo = detalhesAgenda.length > 0 ? ` (${detalhesAgenda.join(', ')})` : '';
    const onde = agendamentos.escopo === 'propria' ? 'na sua agenda' : 'na agenda';
    partes.push(
      `Teve ${agendamentos.total} ${pluralizar(agendamentos.total, `compromisso ${onde}`, `compromissos ${onde}`)}${sufixo}`
    );
  }

  if (clientesNovos > 0) {
    partes.push(
      `Cadastrou ${clientesNovos} cliente${clientesNovos > 1 ? 's' : ''} novo${clientesNovos > 1 ? 's' : ''}`
    );
  }

  // Só o aviso da agenda: não há dia de trabalho para comemorar, só o que se sabe.
  if (semMovimentosConhecidos(r)) {
    return `${AGENDA_FORA}. Fora a agenda, nenhum orçamento, recibo ou cliente novo registrado.`;
  }

  return partes.join('. ') + '. Foi um dia de trabalho pra você — continue assim!';
}
