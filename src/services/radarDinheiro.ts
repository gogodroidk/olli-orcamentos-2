/**
 * RADAR DE DINHEIRO — a regra PURA de "o que está parado esperando o prestador agir".
 *
 * Um lugar só para três perguntas que antes moravam em cópias:
 *   1. dinheiro parado ... orçamento GANHO (aprovado/convertido) com saldo > 0;
 *   2. proposta parada .. proposta já enviada ao cliente, sem mexer há >= 3 dias;
 *   3. clientes para lembrar .. PÓS-VENDA: cliente com serviço CONCLUÍDO cujo intervalo
 *      do ofício já passou (`src/utils/posVenda.ts` — a regra; aqui só a leitura das
 *      linhas do Supabase). Substituiu, em 30/09/2026, o antigo "cliente sumido"
 *      (150 dias fixos contando proposta só enviada): um conceito só, com um nome só.
 *
 * QUEM USA (e por isso nada aqui importa rede, storage, React ou React Native):
 *   • painel (webapp/, alias `@radar-dinheiro`) — os cartões da tela Início
 *     (`RadarDinheiroCard`, `ParadosCard`, `ClientesEsfriandoCard`) chamam estas
 *     funções via `financeiro.ts`/`radares.ts`, que viraram adaptadores finos;
 *   • worker (`worker/src/resumoDinheiroJob.js`) — o RESUMO DIÁRIO por e-mail calcula
 *     o número com as MESMAS funções, em cima das mesmas linhas do Supabase. O e-mail
 *     das 7h e o painel que ele abre não podem discordar sobre quanto o dono tem a
 *     receber nem sobre quantos clientes ele tem para lembrar: se discordassem, o
 *     dono deixaria de acreditar nos dois;
 *   • app (`radarFollowUp.ts`, `radarClientes.ts`) — o limiar de proposta parada sai
 *     daqui e o pós-venda chama a MESMA `listarClientesParaLembrar` (`utils/posVenda`).
 *     Os services do app continuam lendo o SQLite do aparelho (não dá para importar
 *     leitura local no servidor), mas a REGRA que decide "parado" e "para lembrar" é
 *     uma só.
 *
 * O teste `scripts/teste-radar-dinheiro.ts` confere a regra, e o
 * `worker/scripts/teste-resumo-dinheiro-policy.js` confere que o resumo do servidor dá
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
import {
  type ClienteParaLembrar,
  listarClientesParaLembrar,
  msDe,
  msDoRecibo,
  retornoDoOficio,
  type ServicoConcluido,
} from '../utils/posVenda.ts';
import type { VerticalId } from './verticais.ts';

const MS_POR_DIA = 86_400_000;

/** Proposta GANHA — o dinheiro é do prestador, falta entrar. */
export const STATUS_A_RECEBER = ['aprovado', 'convertido'] as const;

/** Proposta VIVA na mão do cliente — é a `STATUS_PROPOSTA_ENVIADA` do app, não uma cópia. */
export const STATUS_EM_JOGO = STATUS_PROPOSTA_ENVIADA;

/** Dias sem mexer para uma proposta enviada contar como parada (radar de follow-up). */
export const LIMIAR_PROPOSTA_PARADA_DIAS = 3;

/**
 * Orçamento que prova SERVIÇO FECHADO para o pós-venda ("clientes para lembrar") —
 * o mesmo par do dinheiro parado. Proposta só enviada NÃO conta: lead que nunca
 * fechou não é manutenção a lembrar (é o follow-up que cuida dele).
 */
export const STATUS_SERVICO_FECHADO = STATUS_A_RECEBER;

const aReceber = new Set<string>(STATUS_A_RECEBER);
const emJogo = new Set<string>(STATUS_EM_JOGO);
const servicoFechado = new Set<string>(STATUS_SERVICO_FECHADO);

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
    /** Recibo estornado não prova serviço (pós-venda). */
    estornadoEm?: string | null;
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

// Datas do pós-venda (ISO e o DD/MM/AAAA do recibo, sem trocar dia e mês) são lidas
// por `msDe`/`msDoRecibo` de `utils/posVenda.ts` — as MESMAS que o app usa.

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

// ─── 3. CLIENTES PARA LEMBRAR (pós-venda) ───────────────────────────────────

export interface EntradaClientesParaLembrar {
  clientes: readonly ClienteRadarLinha[];
  orcamentos: readonly OrcamentoRadarLinha[];
  agendamentos: readonly AgendaRadarLinha[];
  recibos: readonly ReciboRadarLinha[];
  /** clienteId → ISO até quando ficou adiado no celular (`extras_sync`/'radar.snooze'). */
  adiados: Readonly<Record<string, string>>;
  /** clienteId → ISO do último lembrete enviado, celular OU painel (`extras_sync`/'posvenda.lembrados'). */
  lembrados: Readonly<Record<string, string>>;
  /** Ofícios da empresa (`empresa.dados.verticais`): definem o intervalo. Sem ofício = genérico (6 meses). */
  verticais: readonly VerticalId[] | null | undefined;
}

/**
 * As linhas do Supabase viradas nos sinais de "serviço concluído" da regra de
 * pós-venda — a MESMA conversão para o painel (tela Início) e para o resumo diário
 * por e-mail (worker). O app faz a conversão equivalente em cima do SQLite
 * (`servicosConcluidos` em `radarClientes.ts`); quem mexer num lado mexe no outro.
 *  • orçamento aprovado ou convertido — data da aprovação ≈ última escrita
 *    (blob `atualizadoEm` → coluna `atualizado_em` → criação);
 *  • agendamento CONCLUÍDO — pelo fim (ou início);
 *  • recibo NÃO estornado — pela data do recebimento em DD/MM/AAAA (lida sem trocar
 *    dia e mês, `msDoRecibo`), caindo para a criação.
 */
export function servicosConcluidosDasLinhas(
  entrada: Pick<EntradaClientesParaLembrar, 'orcamentos' | 'agendamentos' | 'recibos'>,
): ServicoConcluido[] {
  const servicos: ServicoConcluido[] = [];
  for (const o of entrada.orcamentos) {
    if (!servicoFechado.has(slug(o.status))) continue;
    servicos.push({
      clienteId: o.cliente_id ?? o.dados?.clienteId,
      quando: msDe(o.dados?.atualizadoEm ?? o.atualizado_em ?? o.criado_em ?? o.dados?.criadoEm),
    });
  }
  for (const a of entrada.agendamentos) {
    if (slug(a.status) !== 'concluido') continue;
    servicos.push({ clienteId: a.cliente_id, quando: msDe(a.fim) ?? msDe(a.inicio) });
  }
  for (const r of entrada.recibos) {
    if (r.dados?.estornadoEm) continue; // recebimento estornado não prova serviço
    servicos.push({
      clienteId: r.cliente_id ?? r.dados?.clienteId,
      quando: msDoRecibo(r.dados?.dataRecebimento, r.criado_em ?? r.dados?.criadoEm),
    });
  }
  return servicos;
}

/**
 * Clientes na hora de ser lembrados, a partir das linhas do Supabase — é
 * `listarClientesParaLembrar` (`utils/posVenda.ts`, a regra do celular) com o
 * intervalo do ofício da empresa. Mais atrasado primeiro.
 */
export function listarClientesParaLembrarDasLinhas(
  entrada: EntradaClientesParaLembrar,
  agora: Date = new Date(),
): ClienteParaLembrar[] {
  return listarClientesParaLembrar({
    clientes: entrada.clientes,
    servicos: servicosConcluidosDasLinhas(entrada),
    mesesIntervalo: retornoDoOficio(entrada.verticais).meses,
    lembrados: { ...entrada.lembrados },
    adiados: { ...entrada.adiados },
    agora,
  });
}

// ─── RESUMO (o número do e-mail das 7h) ─────────────────────────────────────

export interface EntradaResumoDinheiro extends EntradaClientesParaLembrar {
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
  /** Os MESMOS "Clientes para lembrar" do cartão do painel e da Home do app. */
  clientesParaLembrar: number;
  /** Há algo para o dono FAZER hoje? Sem isso, nenhum e-mail sai. */
  acionavel: boolean;
}

/**
 * O resumo inteiro, só com contagens e valor (sem nome de cliente, sem telefone):
 * é o que cabe num e-mail sem espalhar dado de terceiro. Acionável = há saldo a
 * receber OU proposta parada OU cliente para lembrar. Orçamento aprovado SEM VALOR
 * sozinho não conta como acionável (não dá para dizer quanto) — ele só aparece como
 * aviso quando o e-mail já sai por outro motivo.
 */
export function resumirDinheiroParado(entrada: EntradaResumoDinheiro, agora: Date = new Date()): ResumoDinheiro {
  const radar = listarDinheiroParado(entrada.orcamentos, entrada.recibos, agora, entrada.orcamentosFinalizados);
  const parados = listarPropostasParadas(entrada.orcamentos, LIMIAR_PROPOSTA_PARADA_DIAS, agora);
  const paraLembrar = listarClientesParaLembrarDasLinhas(entrada, agora);
  const centavos = Math.max(0, Math.round(radar.total * 100));
  return {
    aReceber: {
      centavos,
      itens: radar.itens,
      semValor: radar.semValor,
      diasMaisAntigo: radar.diasMaisAntigo,
    },
    propostasParadas: parados.length,
    clientesParaLembrar: paraLembrar.length,
    acionavel: (centavos > 0 && radar.itens > 0) || parados.length > 0 || paraLembrar.length > 0,
  };
}

