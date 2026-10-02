/**
 * termometroRegra.ts — a regra PURA do TERMÔMETRO DO ORÇAMENTO (Jogada 9).
 * Sem banco, sem React, sem rede: o service `termometro.ts` lê os eventos do link
 * (`orcamento_eventos`) e chama estas funções; o teste `scripts/teste-termometro.ts`
 * roda tudo isto em `node`.
 *
 * O que entra: o que o cliente FEZ na página do link `/o/<token>` — abriu (1 vez
 * por aba), quanto tempo a página ficou visível, quantas vezes o TOTAL ficou na
 * tela, se tocou em Aprovar ou em pagar. Nada de quem ele é.
 *
 * O que sai, e por quê (regra transparente, sem IA):
 *  - QUENTE  — tocou em Aprovar e não concluiu; OU abriu 3+ vezes em 7 dias; OU
 *              voltou 2+ vezes ao preço; OU abriu nas últimas 24 h e leu 90 s+.
 *  - MORNO   — abriu nos últimos 7 dias, sem os sinais de quente.
 *  - FRIO    — ainda não abriu o link, ou a última abertura foi há mais de 7 dias.
 *  Cada temperatura vem com o PORQUÊ em uma frase — nunca um rótulo sem motivo.
 *
 *  - PRÓXIMA AÇÃO, nesta ordem: proposta vencida → renovar; vence hoje/amanhã →
 *    lembrar a validade; tocou em aprovar → ajudar a fechar; abriu 3x e voltou ao
 *    preço → oferecer parcelar; nem abriu (24 h+) → reenviar ou ligar; recém
 *    enviado → aguardar; abriu e sumiu → perguntar se pode ajudar.
 *
 * HONESTIDADE:
 *  - Só existe termômetro para proposta ABERTA (enviada, vista, em negociação,
 *    aguardando assinatura) que foi pelo LINK. Proposta mandada só em PDF não tem
 *    sinal nenhum: o estado é `sem_link`, e a tela diz isso — nunca "frio".
 *  - Falha de leitura é tratada por quem chama (3 estados): "não consegui ler"
 *    nunca vira "o cliente não abriu".
 *  - As mensagens de WhatsApp NÃO contam ao cliente que ele foi medido ("vi que
 *    você abriu 3 vezes" assusta e não é da conta dele): falam só do orçamento.
 *  - "Abertura" conta qualquer navegador que abriu o link — inclusive o do
 *    próprio prestador. A tela avisa isso na explicação.
 */
import type { Orcamento, StatusOrcamento } from '../types/index.ts';
import { formatCurrency } from '../utils/currency.ts';
import { formatarNumeroExibicao } from '../utils/numeroDocumento.ts';

const MS_MIN = 60_000;
const MS_HORA = 3_600_000;
const MS_DIA = 86_400_000;

/** Aberturas em 7 dias que deixam o orçamento quente. */
export const ABERTURAS_QUENTE = 3;
/** Voltas ao preço que, sozinhas, deixam o orçamento quente. */
export const VOLTAS_PRECO_QUENTE = 2;
/** Segundos de leitura (com abertura nas últimas 24 h) que deixam quente. */
export const SEGUNDOS_LEITURA_QUENTE = 90;
/** Até quantos dias depois da última abertura o orçamento ainda está morno. */
export const DIAS_MORNO = 7;
/** Horas sem abertura depois do envio para sugerir reenviar (antes: aguardar). */
export const HORAS_PARA_REENVIAR = 24;
/** Janela que o app lê do servidor (o resto não entra na conta). */
export const DIAS_JANELA_LEITURA = 60;

/** Status em que a proposta está com o cliente, esperando resposta. */
const ABERTOS: ReadonlySet<StatusOrcamento> = new Set<StatusOrcamento>([
  'enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura',
]);

export type TipoInteracao = 'abertura' | 'tempo' | 'preco_visto' | 'clique_aprovar' | 'clique_pagar';
const TIPOS: ReadonlySet<string> = new Set(['abertura', 'tempo', 'preco_visto', 'clique_aprovar', 'clique_pagar']);

/** Uma linha de `orcamento_eventos`, já normalizada. */
export interface Interacao {
  tipo: TipoInteracao;
  sessao: string | null;
  /** Só em 'tempo'. */
  segundos: number | null;
  /** ISO do servidor. */
  em: string;
}

/** Linha crua do PostgREST → `Interacao` (ou `null` se não reconhecida). */
export function normalizarInteracao(linha: unknown): (Interacao & { orcamentoId: string }) | null {
  if (!linha || typeof linha !== 'object') return null;
  const l = linha as Record<string, unknown>;
  const tipo = typeof l.tipo === 'string' ? l.tipo : '';
  const em = typeof l.criado_em === 'string' ? l.criado_em : '';
  const orcamentoId = typeof l.orcamento_id === 'string' ? l.orcamento_id : '';
  if (!TIPOS.has(tipo) || !orcamentoId || Number.isNaN(new Date(em).getTime())) return null;
  const seg = typeof l.segundos === 'number' && Number.isFinite(l.segundos) ? Math.max(0, l.segundos) : null;
  return {
    orcamentoId,
    tipo: tipo as TipoInteracao,
    sessao: typeof l.sessao === 'string' ? l.sessao : null,
    segundos: tipo === 'tempo' ? seg : null,
    em,
  };
}

export interface ResumoInteracoes {
  /** Aberturas registradas (ou sessões distintas, se o beacon de abertura se perdeu). */
  aberturas: number;
  aberturas7d: number;
  ultimaAbertura: string | null;
  /** Segundos com a página visível, somados. */
  segundos: number;
  /** Vezes em que o total ficou na tela. */
  vistasPreco: number;
  /** Vistas do preço além da primeira ("voltou ao preço"). */
  voltasPreco: number;
  clicouAprovar: boolean;
  clicouPagar: boolean;
  /**
   * O app sabe que o cliente abriu (status "Visualizado", vindo da trilha antiga do
   * link), mas não há evento medido — a abertura foi antes de o termômetro existir.
   */
  abriuSemDetalhe?: boolean;
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export function resumirInteracoes(interacoes: readonly Interacao[], agora: Date): ResumoInteracoes {
  const agoraMs = agora.getTime();
  let aberturasRegistradas = 0;
  let aberturas7d = 0;
  let ultima: number | null = null;
  let ultimaQualquer: number | null = null;
  let segundos = 0;
  let vistasPreco = 0;
  let clicouAprovar = false;
  let clicouPagar = false;
  const sessoes = new Set<string>();
  const sessoes7d = new Set<string>();
  for (const i of interacoes) {
    const t = ms(i.em);
    if (t === null) continue;
    const recente = agoraMs - t <= DIAS_MORNO * MS_DIA;
    if (i.sessao) {
      sessoes.add(i.sessao);
      if (recente) sessoes7d.add(i.sessao);
    }
    if (ultimaQualquer === null || t > ultimaQualquer) ultimaQualquer = t;
    switch (i.tipo) {
      case 'abertura':
        aberturasRegistradas++;
        if (recente) aberturas7d++;
        if (ultima === null || t > ultima) ultima = t;
        break;
      case 'tempo':
        segundos += i.segundos ?? 0;
        break;
      case 'preco_visto':
        vistasPreco++;
        break;
      case 'clique_aprovar':
        clicouAprovar = true;
        break;
      case 'clique_pagar':
        clicouPagar = true;
        break;
    }
  }
  // Beacon de abertura perdido (rede caiu no meio) não pode apagar a visita: se há
  // sinal de uma sessão sem a abertura dela, a sessão conta como uma abertura.
  const aberturas = Math.max(aberturasRegistradas, sessoes.size);
  const ultimaAbertura = ultima ?? ultimaQualquer;
  return {
    aberturas,
    aberturas7d: Math.max(aberturas7d, sessoes7d.size),
    ultimaAbertura: ultimaAbertura === null ? null : new Date(ultimaAbertura).toISOString(),
    segundos: Math.round(segundos),
    vistasPreco,
    voltasPreco: Math.max(0, vistasPreco - 1),
    clicouAprovar,
    clicouPagar,
  };
}

// ─── Textos curtos ────────────────────────────────────────────────────────────

/** "agora há pouco", "há 20 min", "há 3 h", "ontem", "há 5 dias". */
export function haQuanto(iso: string | null, agora: Date): string {
  const t = ms(iso);
  if (t === null) return '';
  const d = Math.max(0, agora.getTime() - t);
  if (d < 2 * MS_MIN) return 'agora há pouco';
  if (d < MS_HORA) return `há ${Math.floor(d / MS_MIN)} min`;
  if (d < MS_DIA) return `há ${Math.floor(d / MS_HORA)} h`;
  const dias = Math.floor(d / MS_DIA);
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}

/** "40 s", "1 min 40 s", "12 min". */
export function duracaoTexto(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const resto = s % 60;
  if (min >= 10 || resto === 0) return `${min} min`;
  return `${min} min ${resto} s`;
}

function vezes(n: number): string {
  return n === 1 ? '1 vez' : `${n} vezes`;
}

/**
 * A linha de números do termômetro: "Abriu 3 vezes · a última há 20 min · voltou
 * 2 vezes ao preço · 1 min 40 s na página". Sem abertura: "Ainda não abriu o link".
 */
export function linhaDoResumo(r: ResumoInteracoes, agora: Date): string {
  if (r.abriuSemDetalhe) return 'Abriu o link antes de o termômetro começar a medir';
  if (r.aberturas === 0) return 'Ainda não abriu o link';
  const partes = [`Abriu ${vezes(r.aberturas)}`];
  const quando = haQuanto(r.ultimaAbertura, agora);
  if (quando) partes.push(r.aberturas === 1 ? quando : `a última ${quando}`);
  if (r.voltasPreco > 0) partes.push(`voltou ${vezes(r.voltasPreco)} ao preço`);
  if (r.segundos >= 5) partes.push(`${duracaoTexto(r.segundos)} na página`);
  if (r.clicouAprovar) partes.push('tocou em Aprovar');
  return partes.join(' · ');
}

// ─── Temperatura + próxima ação ────────────────────────────────────────────────

export type Temperatura = 'quente' | 'morno' | 'frio';

export type TipoAcaoTermometro =
  | 'renovar'
  | 'lembrar_validade'
  | 'ajudar_fechar'
  | 'oferecer_parcelar'
  | 'reenviar'
  | 'aguardar'
  | 'retomar';

export interface AcaoTermometro {
  tipo: TipoAcaoTermometro;
  /** O que fazer, em poucas palavras ("Oferecer parcelar?"). */
  titulo: string;
  /** De onde veio a sugestão, em uma frase. */
  detalhe: string;
}

export type EstadoTermometro =
  /** Status fora do "esperando resposta" (rascunho, aprovado, recusado...). */
  | { tipo: 'fora_do_funil' }
  /** Proposta aberta, mas nunca foi pelo link: não há o que medir. */
  | { tipo: 'sem_link' }
  | {
      tipo: 'medido';
      temperatura: Temperatura;
      /** O motivo da temperatura, em uma frase. */
      porque: string;
      resumo: ResumoInteracoes;
      acao: AcaoTermometro;
    };

export interface EntradaTermometro {
  status: StatusOrcamento;
  /** O orçamento tem link público publicado. */
  temLink: boolean;
  /** Último movimento do orçamento (âncora do "enviado há"). Ilegível = null. */
  enviadoEm: string | null;
  /** Último dia válido (AAAA-MM-DD) ou null. */
  validaAte: string | null;
  /**
   * O app já sabe, por outra fonte, que o cliente abriu (status local
   * "Visualizado", promovido pela trilha do link). Evita dizer "não abriu" para
   * quem abriu antes de o termômetro começar a medir.
   */
  abriuAntes?: boolean;
  interacoes: readonly Interacao[];
}

/** Só a proposta que está com o cliente esperando resposta tem termômetro. */
export function temTermometro(status: StatusOrcamento): boolean {
  return ABERTOS.has(status);
}

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Dias de calendário de hoje até `ymd` (0 = hoje, 1 = amanhã, <0 = passou). null = ilegível. */
export function diasAteValidade(ymd: string | null, agora: Date): number | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const alvo = Date.UTC(y, m - 1, d);
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.round((alvo - hoje) / MS_DIA);
}

function classificar(r: ResumoInteracoes, agora: Date): { temperatura: Temperatura; porque: string } {
  const ultima = ms(r.ultimaAbertura);
  const desdeUltima = ultima === null ? null : agora.getTime() - ultima;
  if (r.clicouAprovar) return { temperatura: 'quente', porque: 'Tocou em Aprovar e não concluiu.' };
  if (r.aberturas7d >= ABERTURAS_QUENTE) {
    return { temperatura: 'quente', porque: `Abriu ${vezes(r.aberturas7d)} nos últimos 7 dias.` };
  }
  if (r.voltasPreco >= VOLTAS_PRECO_QUENTE) {
    return { temperatura: 'quente', porque: `Voltou ${vezes(r.voltasPreco)} ao preço.` };
  }
  if (desdeUltima !== null && desdeUltima <= MS_DIA && r.segundos >= SEGUNDOS_LEITURA_QUENTE) {
    return {
      temperatura: 'quente',
      porque: `Abriu nas últimas 24 h e ficou ${duracaoTexto(r.segundos)} na página.`,
    };
  }
  if (r.aberturas === 0) return { temperatura: 'frio', porque: 'Ainda não abriu o link.' };
  if (desdeUltima !== null && desdeUltima <= DIAS_MORNO * MS_DIA) {
    return { temperatura: 'morno', porque: `Abriu ${haQuanto(r.ultimaAbertura, agora)} e ainda não respondeu.` };
  }
  const dias = desdeUltima === null ? null : Math.floor(desdeUltima / MS_DIA);
  return {
    temperatura: 'frio',
    porque: dias === null ? 'Não abre o link há mais de 7 dias.' : `Não abre o link há ${dias} dias.`,
  };
}

function proximaAcao(e: EntradaTermometro, r: ResumoInteracoes, agora: Date): AcaoTermometro {
  const ate = diasAteValidade(e.validaAte, agora);
  if (ate !== null && ate < 0) {
    return { tipo: 'renovar', titulo: 'Oferecer uma proposta atualizada', detalhe: 'A validade desta proposta já passou.' };
  }
  if (ate === 0 || ate === 1) {
    const quando = ate === 0 ? 'hoje' : 'amanhã';
    return { tipo: 'lembrar_validade', titulo: `Avisar que a proposta vence ${quando}`, detalhe: `A validade termina ${quando}.` };
  }
  if (r.clicouAprovar) {
    return { tipo: 'ajudar_fechar', titulo: 'Perguntar se ficou alguma dúvida', detalhe: 'Tocou em Aprovar e não concluiu.' };
  }
  if ((r.aberturas >= ABERTURAS_QUENTE && r.voltasPreco >= 1) || r.voltasPreco >= VOLTAS_PRECO_QUENTE) {
    return {
      tipo: 'oferecer_parcelar',
      titulo: 'Oferecer parcelar?',
      detalhe: `Abriu ${vezes(r.aberturas)} e voltou ao preço: pode estar comparando valores.`,
    };
  }
  if (r.aberturas === 0) {
    const enviado = ms(e.enviadoEm);
    const horas = enviado === null ? null : (agora.getTime() - enviado) / MS_HORA;
    if (horas !== null && horas < HORAS_PARA_REENVIAR) {
      const h = Math.max(1, Math.floor(horas));
      return { tipo: 'aguardar', titulo: 'Aguardar um pouco', detalhe: `Enviado há ${h} h. Vale esperar até amanhã antes de cobrar.` };
    }
    return {
      tipo: 'reenviar',
      titulo: 'Reenviar o link ou ligar',
      detalhe: horas === null
        ? 'O link ainda não foi aberto. Pode ter se perdido na conversa.'
        : `Enviado ${haQuanto(e.enviadoEm, agora)} e o link ainda não foi aberto. Pode ter se perdido na conversa.`,
    };
  }
  return { tipo: 'retomar', titulo: 'Perguntar se pode ajudar', detalhe: 'Abriu e ainda não respondeu.' };
}

/** O termômetro de UM orçamento. Nunca lança. */
export function avaliarTermometro(e: EntradaTermometro, agora: Date): EstadoTermometro {
  if (!temTermometro(e.status)) return { tipo: 'fora_do_funil' };
  const interacoes = Array.isArray(e.interacoes) ? e.interacoes : [];
  // Sinal real sem a linha do link (link apagado/revogado depois) ainda é sinal.
  if (!e.temLink && interacoes.length === 0) return { tipo: 'sem_link' };
  const resumo = resumirInteracoes(interacoes, agora);
  if (resumo.aberturas === 0 && e.abriuAntes) {
    // Abriu, mas sem medida (antes da migration / do worker novo): morno, sem
    // inventar quantas vezes nem quando.
    const semDetalhe: ResumoInteracoes = { ...resumo, aberturas: 1, abriuSemDetalhe: true };
    return {
      tipo: 'medido',
      temperatura: 'morno',
      porque: 'Abriu o link e ainda não respondeu.',
      resumo: semDetalhe,
      acao: proximaAcao(e, semDetalhe, agora),
    };
  }
  const { temperatura, porque } = classificar(resumo, agora);
  return { tipo: 'medido', temperatura, porque, resumo, acao: proximaAcao(e, resumo, agora) };
}

export const ROTULO_TEMPERATURA: Record<Temperatura, string> = {
  quente: 'Quente',
  morno: 'Morno',
  frio: 'Frio',
};

// ─── Mensagens de WhatsApp (o prestador revisa e envia) ────────────────────────

type OrcMensagem = Pick<Orcamento, 'clienteNome' | 'numero' | 'valorTotal'>;

function primeiroNome(nome?: string): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'tudo bem';
}

function ddmm(ymd: string | null): string {
  if (!ymd) return '';
  const [, m, d] = ymd.split('-');
  return `${d}/${m}`;
}

/**
 * Texto de WhatsApp para a ação sugerida. `null` = a ação não tem texto próprio
 * (aguardar, retomar, renovar): quem chama usa a mensagem de follow-up de sempre
 * (ou a de proposta vencida). Derivado só do orçamento — nada de "vi que você abriu".
 */
export function mensagemDaAcao(
  tipo: TipoAcaoTermometro,
  orc: OrcMensagem,
  opts: { validaAte?: string | null; contato?: string | null; agora?: Date } = {},
): string | null {
  const nome = primeiroNome(orc.clienteNome);
  const numero = formatarNumeroExibicao(orc.numero);
  const valor = formatCurrency(typeof orc.valorTotal === 'number' ? orc.valorTotal : 0);
  const contato = opts.contato ? `Contato: ${opts.contato}` : '';
  let linhas: string[];
  switch (tipo) {
    case 'lembrar_validade': {
      const ate = diasAteValidade(opts.validaAte ?? null, opts.agora ?? new Date());
      const data = ddmm(opts.validaAte ?? null);
      const quando = ate === 0 ? 'até hoje' : ate === 1 ? `até amanhã (${data})` : data ? `até ${data}` : 'até a data de validade';
      linhas = [
        `Olá, ${nome}! Passando para lembrar que o orçamento nº ${numero} (${valor}) vale ${quando}.`,
        'Se quiser garantir esse valor, é só aprovar pelo link que te mandei. Qualquer dúvida, estou à disposição.',
      ];
      break;
    }
    case 'ajudar_fechar':
      linhas = [
        `Olá, ${nome}! Ficou alguma dúvida sobre o orçamento nº ${numero} (${valor})?`,
        'Se quiser, te ajudo a finalizar por aqui.',
      ];
      break;
    case 'oferecer_parcelar':
      linhas = [
        `Olá, ${nome}! Sobre o orçamento nº ${numero} (${valor}): se ajudar, posso ver com você uma forma de pagamento parcelada.`,
        'Me fala o que fica melhor pra você.',
      ];
      break;
    case 'reenviar':
      linhas = [
        `Olá, ${nome}! Te enviei o orçamento nº ${numero} (${valor}) e queria confirmar se chegou certinho.`,
        'Se preferir, te mando de novo ou explico por aqui.',
      ];
      break;
    default:
      return null;
  }
  return [...linhas, contato].filter(Boolean).join('\n');
}

// ─── "Cliente abriu seu orçamento agora" (app aberto) ──────────────────────────

/** Mesmo orçamento não avisa de novo antes disto. */
export const MINUTOS_SILENCIO_AVISO_ABERTURA = 30;
/** Evento mais velho que isto (reconexão do Realtime) não vira "agora". */
export const MINUTOS_EVENTO_RECENTE = 5;

export interface EventoAbertura {
  orcamentoId: string;
  tipo: string;
  em: string;
}

/**
 * Decide se a abertura que acabou de chegar vira notificação. Avisa quando: é
 * 'abertura', aconteceu há no máximo 5 min, o orçamento está no aparelho e ainda
 * esperando resposta, e esse orçamento não foi avisado nos últimos 30 min.
 * `ultimosAvisos` (orcamentoId → ms do último aviso) volta podado.
 */
export function decidirAvisoAbertura(
  ev: EventoAbertura,
  orc: (Pick<Orcamento, 'status' | 'clienteNome' | 'numero' | 'valorTotal'> & { excluidoEm?: string | null }) | null,
  ultimosAvisos: Readonly<Record<string, number>>,
  agora: Date,
): { aviso: { titulo: string; corpo: string } | null; ultimosAvisos: Record<string, number> } {
  const agoraMs = agora.getTime();
  const silencio = MINUTOS_SILENCIO_AVISO_ABERTURA * MS_MIN;
  const podados: Record<string, number> = {};
  for (const [id, t] of Object.entries(ultimosAvisos)) {
    if (Number.isFinite(t) && agoraMs - t < silencio) podados[id] = t;
  }
  const t = ms(ev.em);
  const recente = t !== null && agoraMs - t <= MINUTOS_EVENTO_RECENTE * MS_MIN;
  if (ev.tipo !== 'abertura' || !ev.orcamentoId || !recente || !orc || orc.excluidoEm || !temTermometro(orc.status)) {
    return { aviso: null, ultimosAvisos: podados };
  }
  if (podados[ev.orcamentoId] !== undefined) return { aviso: null, ultimosAvisos: podados };
  podados[ev.orcamentoId] = agoraMs;
  const nome = (orc.clienteNome ?? '').trim().split(/\s+/)[0] || 'O cliente';
  return {
    aviso: {
      titulo: 'Cliente abriu seu orçamento agora',
      corpo: `${nome} está vendo o orçamento nº ${formatarNumeroExibicao(orc.numero)} (${formatCurrency(orc.valorTotal ?? 0)}). Bom momento para chamar no WhatsApp.`,
    },
    ultimosAvisos: podados,
  };
}
