/**
 * RADAR DE DINHEIRO — a regra PURA de "o que está parado esperando o prestador agir".
 *
 * Um lugar só para três perguntas que antes moravam em cópias:
 *   1. dinheiro parado ... orçamento GANHO (aprovado/convertido) com saldo > 0;
 *   2. proposta parada .. proposta já enviada ao cliente, sem mexer há >= 3 dias;
 *   3. cliente sumido ... cliente já atendido, sem interação há >= 150 dias.
 *
 * QUEM USA (e por isso nada aqui importa rede, storage, React ou React Native):
 *   • painel (webapp/, alias `@radar-dinheiro`) — os cartões da tela Início
 *     (`RadarDinheiroCard`, `ParadosCard`, `ClientesEsfriandoCard`) chamam estas
 *     funções via `financeiro.ts`/`radares.ts`, que viraram adaptadores finos;
 *   • worker (`worker/src/resumoDinheiroJob.js`) — o RESUMO DIÁRIO por e-mail calcula
 *     o número com as MESMAS funções, em cima das mesmas linhas do Supabase. O e-mail
 *     das 7h e o painel que ele abre não podem discordar sobre quanto o dono tem a
 *     receber: se discordassem, o dono deixaria de acreditar nos dois;
 *   • app (`radarFollowUp.ts`, `radarClientes.ts`) — os limiares e o conjunto de
 *     status de "interação com o cliente" saem daqui. Os services do app continuam
 *     lendo o SQLite do aparelho (não dá para importar leitura local no servidor),
 *     mas o NÚMERO que decide "parado" e "sumido" é um só.
 *
 * O teste `scripts/teste-radar-dinheiro.ts` confere a regra, e o
 * `worker/scripts/teste-resumo-dinheiro-job.js` confere que o resumo do servidor dá
 * o mesmo resultado que estas funções aplicadas às linhas completas do painel.
 *
 * ═══ AS REGRAS DA CASA QUE ESTAS CONTAS OBEDECEM ═══
 * • NÃO SEI ≠ ZERO: toda soma devolve junto quantas linhas ficaram de fora por falta de
 *   valor (`semValor`). Um "R$ 0,00" em cima de dado faltante é mentira sobre o caixa.
 * • Data ilegível nunca vira "hoje" nem 1970: fica `null` (dinheiro parado continua
 *   aparecendo; proposta parada sem data fica de fora — não inventamos "0 dias").
 * • A lixeira já vem filtrada por quem chama (`excluido_em IS NULL`).
 */
import { STATUS_PROPOSTA_ENVIADA } from '../types/index.ts';

const MS_POR_DIA = 86_400_000;

/** Proposta GANHA — o dinheiro é do prestador, falta entrar. */
export const STATUS_A_RECEBER = ['aprovado', 'convertido'] as const;

/** Proposta VIVA na mão do cliente — é a `STATUS_PROPOSTA_ENVIADA` do app, não uma cópia. */
export const STATUS_EM_JOGO = STATUS_PROPOSTA_ENVIADA;

/** Dias sem mexer para uma proposta enviada contar como parada (radar de follow-up). */
export const LIMIAR_PROPOSTA_PARADA_DIAS = 3;

/** Dias sem interação para um cliente já atendido contar como sumido (~5 meses). */
export const LIMIAR_CLIENTE_SUMIDO_DIAS = 150;

/**
 * Status de orçamento que contam como INTERAÇÃO com o cliente no radar de clientes.
 * Não é a `STATUS_PROPOSTA_ENVIADA`: 'visualizado' e 'em_negociacao' ficam de fora
 * desde a primeira versão do radar do app. Mudar isso é decisão de produto — e agora
 * muda app, painel e e-mail no mesmo commit, porque todos leem daqui.
 */
export const STATUS_INTERACAO_CLIENTE: readonly string[] = ['aprovado', 'enviado', 'aguardando_assinatura'];

const aReceber = new Set<string>(STATUS_A_RECEBER);
const emJogo = new Set<string>(STATUS_EM_JOGO);
const interacao = new Set<string>(STATUS_INTERACAO_CLIENTE);

const slug = (s?: string | null) => (s ?? '').trim().toLowerCase();

// ─── Formas de linha (colunas do Supabase + o pedaço do blob `dados` que importa) ──

/** O pedaço do blob `dados` do orçamento que o radar lê (fallback das colunas). */
export interface OrcamentoRadarBlob {
  valorTotal?: unknown;
  subtotal?: unknown;
  atualizadoEm?: string | null;
  criadoEm?: string | null;
  numero?: string | null;
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  clienteId?: string | null;
}

export interface OrcamentoRadarLinha {
  id?: string | null;
  numero?: string | null;
  cliente_id?: string | null;
  cliente_nome?: string | null;
  status?: string | null;
  valor_total?: number | null;
  subtotal?: number | null;
  criado_em?: string | null;
  atualizado_em?: string | null;
  dados?: OrcamentoRadarBlob | null;
}

export interface ReciboRadarLinha {
  orcamento_id?: string | null;
  cliente_id?: string | null;
  valor_recebido?: number | null;
  criado_em?: string | null;
  dados?: {
    orcamentoId?: string | null;
    valorRecebido?: unknown;
    dataRecebimento?: string | null;
    clienteId?: string | null;
    criadoEm?: string | null;
  } | null;
}

export interface ClienteRadarLinha {
  id?: string | null;
  nome?: string | null;
  telefone?: string | null;
}

export interface AgendaRadarLinha {
  cliente_id?: string | null;
  status?: string | null;
  inicio?: string | null;
  fim?: string | null;
}

// ─── Leitura tolerante de valor e data ──────────────────────────────────────

function numero(c: unknown): number | null {
  return typeof c === 'number' && Number.isFinite(c) ? c : null;
}

/** Valor do orçamento: coluna → blob. `null` = não sei (nunca vira zero). */
export function valorOrcamento(o: OrcamentoRadarLinha): number | null {
  for (const c of [o.valor_total, o.dados?.valorTotal, o.subtotal, o.dados?.subtotal]) {
    const v = numero(c);
    if (v !== null) return v;
  }
  return null;
}

/** Valor de um recibo: coluna → blob. `null` = não sei (não vira zero). */
export function valorRecibo(r: ReciboRadarLinha): number | null {
  for (const c of [r.valor_recebido, r.dados?.valorRecebido]) {
    const v = numero(c);
    if (v !== null) return v;
  }
  return null;
}

/** Última mexida (atualizado_em → criado_em, coluna antes do blob). NaN quando nenhuma é legível. */
export function ultimaMexidaMs(o: OrcamentoRadarLinha): number {
  for (const iso of [o.atualizado_em, o.dados?.atualizadoEm, o.criado_em, o.dados?.criadoEm]) {
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (Number.isFinite(t)) return t;
  }
  return Number.NaN;
}

/** ms da data, ou `null` quando não dá para ler (nunca vira "hoje" nem 1970). */
function ms(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * 'DD/MM/AAAA' → 'YYYY-MM-DD', ou null. Mesma regra de `brParaYmd`
 * (`webapp/src/olli/datas.ts`), repetida aqui porque este módulo não pode importar
 * o painel. A data do recibo mora no blob em DD/MM/AAAA; `new Date()` direto nela
 * lê MM/DD e 10 de julho vira 7 de outubro.
 */
function brParaYmd(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((br ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Quando o dinheiro deste recibo entrou (blob DD/MM/AAAA → criado_em). */
function msRecibo(r: ReciboRadarLinha): number | null {
  const br = r.dados?.dataRecebimento;
  if (br) {
    const ymd = brParaYmd(br);
    if (ymd) return ms(ymd);
  }
  return ms(r.criado_em ?? r.dados?.criadoEm);
}

// ─── 1. DINHEIRO PARADO ─────────────────────────────────────────────────────

/** Uma linha do dinheiro parado: um orçamento GANHO que ainda não foi pago por inteiro. */
export interface DinheiroParadoLinha<D = OrcamentoRadarBlob> {
  id: string;
  numero: string;
  cliente: string;
  /** Telefone cru do blob (vazio → sem WhatsApp possível). */
  telefone: string;
  /** Ainda devido (valor do orçamento − recibos dele). Sempre > 0. */
  saldo: number;
  /** Valor CHEIO aprovado — é dele que a mensagem de cobrança fala. */
  valorTotal: number;
  /** Quanto já entrou deste orçamento. 0 = ninguém pagou nada ainda. */
  jaPago: number;
  /** Dias desde a última mexida. `null` = nenhuma data legível (a linha CONTINUA aparecendo). */
  dias: number | null;
  status: string;
  /** O blob do orçamento (quem chama usa para montar a mensagem de cobrança). */
  dados: D | null;
}

export interface RadarDinheiroResultado<D = OrcamentoRadarBlob> {
  linhas: DinheiroParadoLinha<D>[];
  total: number;
  itens: number;
  /** Ganhos que ficaram de FORA por não ter valor legível (nunca somados como zero). */
  semValor: number;
  jaRecebido: number;
  quitados: number;
  /** Dias do item mais antigo. `null` = nenhuma linha, ou nenhuma data legível. */
  diasMaisAntigo: number | null;
}

/**
 * Orçamento ganho (aprovado OU convertido) com SALDO > 0, abatendo os recibos dele —
 * o superconjunto declarado da regra antiga do app (aprovado sem recibo), explicado em
 * `webapp/src/pages/olli/inicio/financeiro.ts`: pagamento parcial continua sendo
 * dinheiro parado, e o painel/e-mail nunca mostram MENOS que o celular.
 *
 * `orcamentosFinalizados` = ids com ordem de serviço CONCLUÍDA: o serviço foi
 * entregue e o dono fecha o ciclo por lá, então sai do radar.
 *
 * O saldo é POR orçamento, travado em 0 no piso: um cliente que pagou a mais não
 * abate a dívida de OUTRO cliente.
 */
export function listarDinheiroParado<O extends OrcamentoRadarLinha>(
  orcamentos: readonly O[],
  recibos: readonly ReciboRadarLinha[],
  agora: Date = new Date(),
  orcamentosFinalizados: ReadonlySet<string> = new Set(),
): RadarDinheiroResultado<NonNullable<O['dados']>> {
  const recebidoPorOrc = new Map<string, number>();
  for (const r of recibos) {
    const orcId = (r.orcamento_id ?? r.dados?.orcamentoId ?? '').trim();
    if (!orcId) continue; // recibo avulso (sem orçamento) não abate ninguém
    const v = valorRecibo(r);
    if (v === null) continue;
    recebidoPorOrc.set(orcId, (recebidoPorOrc.get(orcId) ?? 0) + v);
  }

  const linhas: DinheiroParadoLinha<NonNullable<O['dados']>>[] = [];
  let total = 0;
  let semValor = 0;
  let jaRecebido = 0;
  let quitados = 0;

  for (const o of orcamentos) {
    if (orcamentosFinalizados.has((o.id ?? '').trim())) continue;
    const s = slug(o.status);
    if (!aReceber.has(s)) continue;
    const v = valorOrcamento(o);
    if (v === null) {
      semValor++;
      continue;
    }
    const pago = recebidoPorOrc.get((o.id ?? '').trim()) ?? 0;
    jaRecebido += Math.min(pago, v);
    const saldo = Math.max(0, v - pago);
    if (saldo <= 0) {
      quitados++;
      continue;
    }
    total += saldo;

    const t = ultimaMexidaMs(o);
    linhas.push({
      id: (o.id ?? '').trim(),
      numero: (o.numero ?? o.dados?.numero ?? '').trim(),
      cliente: (o.cliente_nome ?? o.dados?.clienteNome ?? '').trim() || 'Cliente não informado',
      telefone: (o.dados?.clienteTelefone ?? '').trim(),
      saldo,
      valorTotal: v,
      jaPago: Math.min(pago, v),
      dias: Number.isFinite(t) ? Math.max(0, Math.floor((agora.getTime() - t) / MS_POR_DIA)) : null,
      status: s,
      dados: (o.dados ?? null) as NonNullable<O['dados']> | null,
    });
  }

  // Mais parado primeiro; sem data vai para o fim; empate de dias → maior saldo antes.
  linhas.sort((a, b) => {
    if (a.dias === b.dias) return b.saldo - a.saldo;
    if (a.dias === null) return 1;
    if (b.dias === null) return -1;
    return b.dias - a.dias;
  });

  return {
    linhas,
    total,
    itens: linhas.length,
    semValor,
    jaRecebido,
    quitados,
    diasMaisAntigo: linhas.length > 0 ? linhas[0].dias : null,
  };
}

// ─── 2. PROPOSTAS PARADAS ───────────────────────────────────────────────────

export interface PropostaParada {
  id: string;
  numero: string;
  cliente: string;
  /** Telefone cru do blob (pode ser vazio → sem WhatsApp possível). */
  telefone: string;
  valor: number | null;
  status: string;
  /** Dias inteiros desde a última mexida no orçamento. */
  dias: number;
}

/**
 * Propostas já enviadas ao cliente (`STATUS_EM_JOGO`) sem mexer há >= `minDias`.
 * Mais parado primeiro. Sem data legível → fica de fora (não inventamos "0 dias").
 */
export function listarPropostasParadas(
  orcamentos: readonly OrcamentoRadarLinha[],
  minDias: number = LIMIAR_PROPOSTA_PARADA_DIAS,
  agora: Date = new Date(),
): PropostaParada[] {
  const parados: PropostaParada[] = [];
  for (const o of orcamentos) {
    const s = slug(o.status);
    if (!emJogo.has(s)) continue;
    const t = ultimaMexidaMs(o);
    if (!Number.isFinite(t)) continue;
    const dias = Math.floor((agora.getTime() - t) / MS_POR_DIA);
    if (dias < minDias) continue;
    parados.push({
      id: (o.id ?? '').trim(),
      numero: (o.numero ?? o.dados?.numero ?? '').trim(),
      cliente: (o.cliente_nome ?? o.dados?.clienteNome ?? '').trim() || 'Cliente não informado',
      telefone: (o.dados?.clienteTelefone ?? '').trim(),
      valor: valorOrcamento(o),
      status: s,
      dias,
    });
  }
  return parados.sort((a, b) => b.dias - a.dias);
}

// ─── 3. CLIENTES SUMIDOS ────────────────────────────────────────────────────

export interface ClienteSumido {
  id: string;
  nome: string;
  telefone: string;
  /** ISO da última interação real (nunca vazio: sem interação o cliente não entra). */
  ultimaInteracao: string;
  /** Meses arredondados desde então (dias/30, piso de 1) — o número da mensagem. */
  meses: number;
  dias: number;
}

export interface EntradaClientesSumidos {
  clientes: readonly ClienteRadarLinha[];
  orcamentos: readonly OrcamentoRadarLinha[];
  agendamentos: readonly AgendaRadarLinha[];
  recibos: readonly ReciboRadarLinha[];
  /** clienteId → ISO até quando ficou adiado no celular (`extras_sync`/'radar.snooze'). */
  adiados: Readonly<Record<string, string>>;
}

/**
 * Clientes que JÁ FORAM ATENDIDOS e sumiram há >= 150 dias — quem sumiu há mais tempo
 * primeiro. Três fontes de última interação: orçamento com status de interação (pelo
 * criado_em), agendamento CONCLUÍDO (pelo fim, senão início) e recibo (pela data de
 * recebimento do blob). Cliente sem NENHUMA interação nunca entra — é lead frio.
 * Respeita o "adiar" feito no celular.
 */
export function listarClientesSumidos(entrada: EntradaClientesSumidos, agora: Date = new Date()): ClienteSumido[] {
  const { clientes, orcamentos, agendamentos, recibos, adiados } = entrada;

  const ultima = new Map<string, number>();
  const registrar = (clienteId?: string | null, quando?: number | null) => {
    const id = (clienteId ?? '').trim();
    if (!id || quando === null || quando === undefined) return;
    const atual = ultima.get(id);
    if (atual === undefined || quando > atual) ultima.set(id, quando);
  };

  for (const o of orcamentos) {
    if (!interacao.has(slug(o.status))) continue;
    registrar(o.cliente_id ?? o.dados?.clienteId, ms(o.criado_em ?? o.dados?.criadoEm));
  }
  for (const a of agendamentos) {
    if (slug(a.status) !== 'concluido') continue;
    const fim = ms(a.fim);
    const inicio = ms(a.inicio);
    registrar(a.cliente_id, fim === null ? inicio : inicio === null ? fim : Math.max(fim, inicio));
  }
  for (const r of recibos) {
    registrar(r.cliente_id ?? r.dados?.clienteId, msRecibo(r));
  }

  const agoraMs = agora.getTime();
  const resultado: ClienteSumido[] = [];
  for (const c of clientes) {
    const id = (c.id ?? '').trim();
    if (!id) continue;
    const quando = ultima.get(id);
    if (quando === undefined) continue; // nunca interagiu → lead frio, fora do radar

    const ate = ms(adiados[id]);
    if (ate !== null && ate > agoraMs) continue; // adiado no celular, ainda vigente

    const dias = Math.floor((agoraMs - quando) / MS_POR_DIA);
    if (dias < LIMIAR_CLIENTE_SUMIDO_DIAS) continue;

    resultado.push({
      id,
      nome: (c.nome ?? '').trim() || 'Cliente sem nome',
      telefone: (c.telefone ?? '').trim(),
      ultimaInteracao: new Date(quando).toISOString(),
      meses: Math.max(1, Math.round(dias / 30)),
      dias,
    });
  }
  return resultado.sort((a, b) => b.dias - a.dias);
}

// ─── RESUMO (o número do e-mail das 7h) ─────────────────────────────────────

export interface EntradaResumoDinheiro extends EntradaClientesSumidos {
  /** Ids de orçamento com ordem de serviço concluída (saem do dinheiro parado). */
  orcamentosFinalizados: ReadonlySet<string>;
}

export interface ResumoDinheiro {
  aReceber: {
    /** Soma dos saldos, em centavos inteiros (o e-mail não carrega float). */
    centavos: number;
    itens: number;
    semValor: number;
    diasMaisAntigo: number | null;
  };
  propostasParadas: number;
  clientesSumidos: number;
  /** Há algo para o dono FAZER hoje? Sem isso, nenhum e-mail sai. */
  acionavel: boolean;
}

/**
 * O resumo inteiro, só com contagens e valor (sem nome de cliente, sem telefone):
 * é o que cabe num e-mail sem espalhar dado de terceiro. Acionável = há saldo a
 * receber OU proposta parada OU cliente sumido. Orçamento aprovado SEM VALOR sozinho
 * não conta como acionável (não dá para dizer quanto) — ele só aparece como aviso
 * quando o e-mail já sai por outro motivo.
 */
export function resumirDinheiroParado(entrada: EntradaResumoDinheiro, agora: Date = new Date()): ResumoDinheiro {
  const radar = listarDinheiroParado(entrada.orcamentos, entrada.recibos, agora, entrada.orcamentosFinalizados);
  const parados = listarPropostasParadas(entrada.orcamentos, LIMIAR_PROPOSTA_PARADA_DIAS, agora);
  const sumidos = listarClientesSumidos(entrada, agora);
  const centavos = Math.max(0, Math.round(radar.total * 100));
  return {
    aReceber: {
      centavos,
      itens: radar.itens,
      semValor: radar.semValor,
      diasMaisAntigo: radar.diasMaisAntigo,
    },
    propostasParadas: parados.length,
    clientesSumidos: sumidos.length,
    acionavel: (centavos > 0 && radar.itens > 0) || parados.length > 0 || sumidos.length > 0,
  };
}
