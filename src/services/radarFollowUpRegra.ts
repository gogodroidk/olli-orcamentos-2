/**
 * radarFollowUpRegra.ts — a regra PURA do radar de follow-up do app (quem cobrar
 * resposta no Início e no Hoje). Sem banco, sem React: o service
 * `radarFollowUp.ts` lê o SQLite e chama estas funções, e o teste
 * `scripts/teste-radar-followup.ts` roda em `node`.
 *
 * O que esta regra decide, e por quê:
 *  1. QUEM JÁ PAGOU NÃO ENTRA. Proposta com recibo ativo (não estornado) ligado a
 *     ela não pede follow-up — o Início mandava "chamar no WhatsApp" o Roberto,
 *     que tinha recibo de R$ 440 pago por Pix. Recibo é como o app registra o
 *     pagamento (inclusive o "Registrar pagamento" rápido, ligado ao ledger).
 *  2. PRIORIDADE = VALOR × RECÊNCIA. Ordenar só por "parado há mais tempo" punha
 *     no topo a proposta de 90 dias que ninguém mais vai fechar. O peso cai com o
 *     tempo parado (dobra a cada 14 dias passados do limiar) e multiplica o valor.
 *  3. EXPIRADA. Passou da validade do orçamento (ou, sem validade cadastrada, de
 *     30 dias da emissão): a ação deixa de ser "cobrar resposta" e vira "renovar"
 *     — e a mensagem diz que o orçamento venceu, em vez de "vale até" uma data
 *     que já passou.
 */
import type { Cliente, Orcamento, Recibo } from '../types/index.ts';
import { propostaJaEnviada } from '../types/index.ts';
import { parseDateBR } from '../utils/date.ts';

const MS_POR_DIA = 86_400_000;

/** Sem validade cadastrada, a proposta vence 30 dias depois da emissão. */
export const DIAS_EXPIRACAO_SEM_VALIDADE = 30;

/** A cada quantos dias além do limiar o peso da recência cai pela metade. */
export const DIAS_MEIA_VIDA_RECENCIA = 14;

export interface OrcamentoParaFollowUp {
  orcamento: Orcamento;
  /** Cadastro ATIVO do cliente, ou `null` se foi excluído depois do envio. O
   *  orçamento já guarda `clienteNome`/`clienteTelefone` denormalizados. */
  cliente: Cliente | null;
  diasParado: number;
  /** Passou da validade (ou de 30 dias da emissão, sem validade): ação "renovar". */
  expirada: boolean;
  /** Último dia válido (AAAA-MM-DD), quando conhecido — o texto "venceu em". */
  validaAte: string | null;
  /** valor × peso da recência — maior primeiro. */
  prioridade: number;
}

/** AAAA-MM-DD do dia LOCAL de `d`. */
function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Aceita DD/MM/AAAA (o que o editor grava) ou ISO; inválido = null. */
function paraYmd(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim();
  if (!v) return null;
  if (v.includes('/')) return parseDateBR(v) || null;
  const ymd = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && parseDateBR(`${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`)
    ? ymd
    : null;
}

/**
 * Último dia em que a proposta vale (AAAA-MM-DD). Validade do orçamento quando
 * existe e é legível; senão emissão (ou criação) + 30 dias. Data ilegível nos
 * dois = `null` (não inventamos vencimento).
 */
export function validaAteYmd(o: Pick<Orcamento, 'validadeOrcamento' | 'dataEmissao' | 'criadoEm'>): string | null {
  const validade = paraYmd(o.validadeOrcamento);
  if (validade) return validade;
  const base = paraYmd(o.dataEmissao) ?? paraYmd(o.criadoEm);
  if (!base) return null;
  const [y, m, d] = base.split('-').map(Number);
  return ymdLocal(new Date(y, m - 1, d + DIAS_EXPIRACAO_SEM_VALIDADE));
}

/** A proposta já passou do último dia válido (comparação por dia local)? */
export function propostaExpirada(validaAte: string | null, agora: Date = new Date()): boolean {
  return validaAte !== null && ymdLocal(agora) > validaAte;
}

/** Peso da recência: 1 até o limiar, cai pela metade a cada 14 dias a mais. */
export function pesoRecencia(diasParado: number, limiarDias: number): number {
  const alem = Math.max(0, diasParado - limiarDias);
  return 0.5 ** (alem / DIAS_MEIA_VIDA_RECENCIA);
}

/** valor × recência. Valor ilegível/negativo conta 0 (vai para o fim, não some). */
export function prioridadeFollowUp(valor: unknown, diasParado: number, limiarDias: number): number {
  const v = typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? valor : 0;
  return v * pesoRecencia(diasParado, limiarDias);
}

/**
 * Ids de orçamento que já têm pagamento registrado: recibo ATIVO (a lixeira já
 * vem filtrada por quem lê) e NÃO estornado, ligado pelo `orcamentoId`.
 */
export function orcamentosComPagamento(recibos: readonly Pick<Recibo, 'orcamentoId' | 'estornadoEm' | 'excluidoEm'>[]): Set<string> {
  const ids = new Set<string>();
  for (const r of recibos) {
    if (!r.orcamentoId || r.excluidoEm || r.estornadoEm) continue;
    ids.add(r.orcamentoId);
  }
  return ids;
}

function diasDesde(iso: string | undefined, agoraMs: number): number | null {
  const t = iso ? new Date(iso).getTime() : Number.NaN;
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((agoraMs - t) / MS_POR_DIA));
}

/**
 * A lista do radar: propostas enviadas (STATUS_PROPOSTA_ENVIADA), sem pagamento,
 * paradas há >= `limiarDias` — ordenadas por prioridade (valor × recência).
 * "Parado" conta de `atualizadoEm` (cai para `criadoEm` em registro legado); data
 * ilegível fica de fora (nunca vira "parado há 0 dias").
 */
export function selecionarFollowUp(
  orcamentos: readonly Orcamento[],
  recibos: readonly Pick<Recibo, 'orcamentoId' | 'estornadoEm' | 'excluidoEm'>[],
  clientes: readonly Cliente[],
  limiarDias: number,
  agora: Date = new Date(),
): OrcamentoParaFollowUp[] {
  const pagos = orcamentosComPagamento(recibos);
  const clientesPorId = new Map(clientes.map((c) => [c.id, c] as const));
  const agoraMs = agora.getTime();
  const resultado: OrcamentoParaFollowUp[] = [];
  for (const o of orcamentos) {
    if (!propostaJaEnviada(o.status)) continue;
    if (pagos.has(o.id)) continue;
    const diasParado = diasDesde(o.atualizadoEm || o.criadoEm, agoraMs);
    if (diasParado === null || diasParado < limiarDias) continue;
    const validaAte = validaAteYmd(o);
    resultado.push({
      orcamento: o,
      cliente: clientesPorId.get(o.clienteId) ?? null,
      diasParado,
      expirada: propostaExpirada(validaAte, agora),
      validaAte,
      prioridade: prioridadeFollowUp(o.valorTotal, diasParado, limiarDias),
    });
  }
  // Maior prioridade primeiro; empate (ex.: dois sem valor) → o mais recente,
  // que ainda tem mais chance de fechar.
  resultado.sort((a, b) => b.prioridade - a.prioridade || a.diasParado - b.diasParado);
  return resultado;
}

/** DD/MM/AAAA de um AAAA-MM-DD. */
function ymdParaBr(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Mensagem de WhatsApp para RENOVAR uma proposta vencida — derivada só do próprio
 * orçamento (número, valor, data de vencimento). Não promete o mesmo preço: diz
 * que dá para atualizar e mandar de novo.
 */
export function montarMensagemPropostaVencida(
  item: Pick<OrcamentoParaFollowUp, 'orcamento' | 'validaAte'>,
  valorFormatado: string,
  contatoEmpresa?: string | null,
): string {
  const nome = (item.orcamento.clienteNome ?? '').trim().split(/\s+/)[0] || 'tudo bem';
  const quando = item.validaAte ? ` venceu em ${ymdParaBr(item.validaAte)}` : ' venceu';
  const linhas = [
    `Olá, ${nome}! O orçamento nº ${item.orcamento.numero} (${valorFormatado})${quando}.`,
    'Se ainda tiver interesse, eu atualizo e te mando de novo.',
    contatoEmpresa ? `Contato: ${contatoEmpresa}` : '',
  ];
  return linhas.filter(Boolean).join('\n');
}
