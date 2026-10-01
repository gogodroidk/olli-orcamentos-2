/**
 * LINHA DO TEMPO DO ORÇAMENTO — lógica PURA (item 2.10 da Onda 2).
 *
 * Este arquivo NÃO importa `react-native` (só tipos, apagados na execução): o
 * teste `scripts/teste-detalhe-orcamento.ts` roda em Node e trava as regras.
 * O componente `TimelineOrcamento.tsx` só DESENHA o que sai daqui.
 *
 * Etapas: criado → enviado → visualizado → aprovação → pago. Cada uma vem de uma
 * FONTE conhecida, nunca de suposição:
 *   - criado      = `orc.criadoEm` (local);
 *   - enviado     = status local além de rascunho OU o link público existir;
 *   - visualizado = carimbo do link (`visualizado_em`) ou status "Visualizado";
 *   - aprovação   = status local (+ horário da resposta pelo link, ou `decididoEm`);
 *   - pago        = estado financeiro dos recibos (só para quem pode ver valores).
 *
 * Regra P0 "erro nunca vira vazio": a leitura do link tem TRÊS estados
 * (`carregando`, `ok`, `erro`). Com erro, a etapa que depende do link diz que não
 * deu para consultar — nunca "o cliente não abriu".
 */
import type { EventoTrilhaCliente, StatusOrcamento } from '../../types';

export type ChaveEtapa = 'criado' | 'enviado' | 'visualizado' | 'decisao' | 'pago';

/**
 * feito        = aconteceu (com horário quando a fonte tem);
 * atual        = o próximo passo esperado agora;
 * pendente     = ainda vai acontecer;
 * interrompido = o caminho parou aqui (recusado, expirado, cancelado);
 * sem_registro = pode ter acontecido, mas nenhuma fonte registrou (ex.: aprovou
 *                pessoalmente sem abrir o link). Nem "feito" nem "não aconteceu".
 */
export type EstadoEtapa = 'feito' | 'atual' | 'pendente' | 'interrompido' | 'sem_registro';

export type TomEtapa = 'neutro' | 'sucesso' | 'perigo' | 'aviso';

export type LeituraLink = 'carregando' | 'ok' | 'erro';

export type EstadoFinanceiroLinha = 'aguardando_pagamento' | 'parcial' | 'pago' | 'recibo_emitido';

export interface EtapaLinhaDoTempo {
  chave: ChaveEtapa;
  rotulo: string;
  estado: EstadoEtapa;
  tom: TomEtapa;
  /** ISO (ou AAAA-MM-DD) do momento, quando a fonte tem. Ausente = sem horário. */
  em?: string;
  /** Linha de apoio: o que falta, de onde veio, motivo da recusa. */
  detalhe?: string;
}

export interface EntradaLinhaDoTempo {
  status: StatusOrcamento;
  criadoEm: string;
  decididoEm?: string;
  /** Eventos do link público (vazio = sem link ou ainda não lido). */
  trilha: EventoTrilhaCliente[];
  leituraLink: LeituraLink;
  /** `null` = quem está vendo não pode ver valores: a etapa "Pago" não aparece. */
  financeiro: null | {
    estado: EstadoFinanceiroLinha | null;
    /** Data do último recebimento (quando quitado). */
    pagoEm?: string;
    /** Texto pronto do parcial ("Recebido R$ X de R$ Y"), montado pela tela. */
    resumoParcial?: string;
  };
}

/** Status em que a proposta, com certeza, já saiu para o cliente. */
const STATUS_JA_ENVIADO: ReadonlySet<StatusOrcamento> = new Set<StatusOrcamento>([
  'enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura', 'aprovado', 'recusado', 'convertido',
]);

/** Status que contam como "aprovado" (convertido = aprovado que virou OS/contrato). */
export function statusAprovado(status: StatusOrcamento): boolean {
  return status === 'aprovado' || status === 'convertido';
}

export function financeiroQuitado(estado: EstadoFinanceiroLinha | null | undefined): boolean {
  return estado === 'pago' || estado === 'recibo_emitido';
}

function evento(trilha: EventoTrilhaCliente[], tipo: EventoTrilhaCliente['tipo']): EventoTrilhaCliente | undefined {
  return trilha.find(e => e.tipo === tipo);
}

/** Monta as etapas na ordem. Nunca lança; entrada estranha vira etapa "pendente". */
export function montarLinhaDoTempo(e: EntradaLinhaDoTempo): EtapaLinhaDoTempo[] {
  const trilha = Array.isArray(e.trilha) ? e.trilha : [];
  const temLink = !!evento(trilha, 'enviado');
  const etapas: EtapaLinhaDoTempo[] = [];

  // 1) Criado — sempre existe.
  etapas.push({ chave: 'criado', rotulo: 'Criado', estado: 'feito', tom: 'neutro', em: e.criadoEm || undefined });

  // 2) Enviado.
  const enviado = STATUS_JA_ENVIADO.has(e.status) || temLink;
  if (enviado) {
    etapas.push({
      chave: 'enviado', rotulo: 'Enviado', estado: 'feito', tom: 'neutro',
      detalhe: temLink ? 'Com o link de aprovação' : undefined,
    });
  } else if (e.status === 'rascunho') {
    etapas.push({ chave: 'enviado', rotulo: 'Enviar ao cliente', estado: 'pendente', tom: 'neutro', detalhe: 'Ainda não enviado' });
  } else {
    // Expirado/cancelado sem link: pode ter saído por PDF ou à mão — não sabemos.
    etapas.push({ chave: 'enviado', rotulo: 'Enviado', estado: 'sem_registro', tom: 'neutro', detalhe: 'Sem registro de envio' });
  }

  // 3) Visualizado.
  const evVisto = evento(trilha, 'visualizado');
  const decidido = statusAprovado(e.status) || e.status === 'recusado';
  if (evVisto || e.status === 'visualizado') {
    etapas.push({ chave: 'visualizado', rotulo: 'Visualizado', estado: 'feito', tom: 'neutro', em: evVisto?.em, detalhe: evVisto ? 'O cliente abriu o link' : undefined });
  } else if (e.leituraLink === 'erro') {
    etapas.push({ chave: 'visualizado', rotulo: 'Visualizado', estado: decidido ? 'sem_registro' : 'pendente', tom: 'aviso', detalhe: 'Não deu para consultar o link agora' });
  } else if (e.leituraLink === 'carregando') {
    etapas.push({ chave: 'visualizado', rotulo: 'Visualizado', estado: decidido ? 'sem_registro' : 'pendente', tom: 'neutro', detalhe: 'Consultando o link do cliente…' });
  } else if (decidido) {
    etapas.push({ chave: 'visualizado', rotulo: 'Visualizado', estado: 'sem_registro', tom: 'neutro', detalhe: 'Sem registro de abertura pelo link' });
  } else if (enviado) {
    etapas.push({
      chave: 'visualizado', rotulo: 'Visualizado', estado: 'pendente', tom: 'neutro',
      detalhe: temLink
        ? 'Aguardando o cliente abrir o link'
        : 'Só dá para saber se o cliente abriu quando a proposta vai pelo link',
    });
  } else {
    etapas.push({ chave: 'visualizado', rotulo: 'Visualizado', estado: 'pendente', tom: 'neutro' });
  }

  // 4) Decisão do cliente.
  const evAprovado = evento(trilha, 'aprovado');
  const evRecusado = evento(trilha, 'recusado');
  let interrompeu = false;
  if (statusAprovado(e.status)) {
    etapas.push({
      chave: 'decisao', rotulo: 'Aprovado', estado: 'feito', tom: 'sucesso',
      em: evAprovado?.em ?? e.decididoEm,
      detalhe: evAprovado ? 'Pelo link do cliente' : e.status === 'convertido' ? 'Convertido' : undefined,
    });
  } else if (e.status === 'recusado') {
    interrompeu = true;
    const motivo = evRecusado?.motivo?.trim();
    etapas.push({
      chave: 'decisao', rotulo: 'Recusado', estado: 'interrompido', tom: 'perigo',
      em: evRecusado?.em ?? e.decididoEm,
      detalhe: motivo ? `Motivo: ${motivo}` : undefined,
    });
  } else if (e.status === 'expirado' || e.status === 'cancelado') {
    interrompeu = true;
    etapas.push({
      chave: 'decisao', rotulo: e.status === 'expirado' ? 'Expirado' : 'Cancelado',
      estado: 'interrompido', tom: 'neutro',
    });
  } else {
    const detalhe = e.status === 'em_negociacao'
      ? 'Em negociação'
      : e.status === 'aguardando_assinatura'
        ? 'Aguardando assinatura'
        : undefined;
    etapas.push({ chave: 'decisao', rotulo: 'Aprovação', estado: 'pendente', tom: 'neutro', detalhe });
  }

  // 5) Pago — só para quem pode ver valores, e não depois de um caminho interrompido.
  if (e.financeiro && !interrompeu) {
    const fin = e.financeiro.estado;
    const avisouPagamento = evento(trilha, 'pagamento_informado');
    if (financeiroQuitado(fin)) {
      etapas.push({ chave: 'pago', rotulo: 'Pago', estado: 'feito', tom: 'sucesso', em: e.financeiro.pagoEm });
    } else if (fin === 'parcial') {
      etapas.push({ chave: 'pago', rotulo: 'Pagamento', estado: 'atual', tom: 'aviso', detalhe: e.financeiro.resumoParcial || 'Pagamento parcial' });
    } else if (avisouPagamento) {
      etapas.push({
        chave: 'pago', rotulo: 'Pagamento', estado: 'pendente', tom: 'aviso', em: avisouPagamento.em,
        detalhe: 'O cliente avisou que já pagou. Confira no banco antes de registrar.',
      });
    } else {
      etapas.push({ chave: 'pago', rotulo: 'Pagamento', estado: 'pendente', tom: 'neutro' });
    }
  }

  // O primeiro passo ainda não dado vira o "atual" (o próximo esperado), a menos
  // que o caminho tenha parado ou já exista um "atual".
  if (!interrompeu && !etapas.some(x => x.estado === 'atual')) {
    const proximo = etapas.find(x => x.estado === 'pendente');
    if (proximo) proximo.estado = 'atual';
  }
  return etapas;
}

/**
 * Frase curta do cabeçalho: em que pé o orçamento está e o que vem depois.
 * Derivada do status e do financeiro — nunca promete o que o app não fez.
 */
export function proximoPassoDoStatus(status: StatusOrcamento, fin: EstadoFinanceiroLinha | null): string {
  if (statusAprovado(status)) {
    if (financeiroQuitado(fin)) return 'Pago. Hora de pedir uma avaliação.';
    if (fin === 'parcial') return 'Aprovado. Falta receber o saldo.';
    if (fin === 'aguardando_pagamento') return 'Aprovado. Próximo passo: receber.';
    return 'Aprovado. Próximo passo: agendar o serviço.';
  }
  switch (status) {
    case 'rascunho': return 'Rascunho. Próximo passo: enviar ao cliente.';
    case 'enviado': return 'Enviado. Aguardando o cliente.';
    case 'visualizado': return 'O cliente abriu a proposta. Aguardando a resposta.';
    case 'em_negociacao': return 'Em negociação com o cliente.';
    case 'aguardando_assinatura': return 'Aguardando a assinatura do cliente.';
    case 'recusado': return 'O cliente recusou. Dá para criar uma revisão.';
    case 'expirado': return 'A validade passou. Dá para criar uma revisão.';
    case 'cancelado': return 'Orçamento cancelado.';
    default: return '';
  }
}

// ─── Celebração: só na TRANSIÇÃO, e só uma vez por orçamento ─────────────────

export type MotivoCelebracao = 'aprovado' | 'pago';

export interface RetratoCelebracao {
  status: StatusOrcamento;
  quitado: boolean;
}

/**
 * Qual celebração a mudança `antes → depois` merece. A primeira leitura da tela
 * (`antes` nulo) NUNCA celebra: abrir um orçamento aprovado há meses não é festa.
 * Pago tem prioridade (quem quitou já tinha aprovado).
 */
export function celebracaoDaTransicao(antes: RetratoCelebracao | null, depois: RetratoCelebracao): MotivoCelebracao | null {
  if (!antes) return null;
  if (depois.quitado && !antes.quitado) return 'pago';
  if (statusAprovado(depois.status) && !statusAprovado(antes.status)) return 'aprovado';
  return null;
}

export function chaveCelebracao(orcamentoId: string, motivo: MotivoCelebracao): string {
  return `${orcamentoId}:${motivo}`;
}

/** Teto da lista guardada no aparelho (as mais antigas saem primeiro). */
export const MAX_CELEBRACOES_GUARDADAS = 300;

/** Lê a lista persistida com tolerância: qualquer coisa que não seja lista de texto vira vazia. */
export function lerCelebracoes(bruto: unknown): string[] {
  return Array.isArray(bruto) ? bruto.filter((x): x is string => typeof x === 'string') : [];
}

/** Acrescenta a chave (sem duplicar) e corta pelo teto. */
export function registrarCelebracao(lista: string[], chave: string): string[] {
  const semEla = lista.filter(x => x !== chave);
  semEla.push(chave);
  return semEla.slice(-MAX_CELEBRACOES_GUARDADAS);
}
