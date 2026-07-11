/**
 * Radar de cobrança — aposta nº1 do produto (item 1.1): "orçamento aprovado
 * não é dinheiro no bolso". Identifica orçamentos com status `aprovado` que
 * ainda NÃO têm recibo emitido — o cliente disse sim, mas o pagamento nunca
 * foi registrado. Dá voz a um dado que já existe (o próprio orçamento
 * aprovado) para o prestador cobrar com um toque, na linha do Radar de
 * clientes (mesma pasta, mesmo espírito — ver `radarClientes.ts`).
 *
 * REAPROVEITAMENTO — nada aqui reimplementa leitura ou regra já existente:
 *  - getOrcamentos/getRecibos/getClientes (database.ts) — as MESMAS
 *    listagens que `radarClientes.ts` já usa, sem query nova.
 *  - getReciboDoOrcamento (services/pagamentos.ts) — a MESMA regra que já
 *    decide "este orçamento tem recibo vinculado?", hoje usada pelo KPI
 *    "Contas a receber" do desktop (InicioDesktopScreen). Radar de cobrança
 *    e aquele KPI enxergam exatamente o mesmo dinheiro parado, com uma
 *    única fonte de verdade — nenhuma regra nova de "o que conta como
 *    pago" nasce aqui.
 *
 * "Dias parado" usa `atualizadoEm` do orçamento (carimbado pelo BANCO a
 * cada escrita — ver `Cliente.atualizadoEm` em types/index.ts) como proxy
 * de quando o status virou `aprovado`: o Orcamento não tem um campo
 * `aprovadoEm` dedicado (diferente do plano PMOC). Um orçamento aprovado que
 * ninguém mais editou tem `atualizadoEm` == o momento da aprovação. Cai para
 * `criadoEm` só quando `atualizadoEm` estiver ausente (registro legado).
 *
 * GATE DE PLANO: nenhum. Mesmo padrão de `pagamentos.ts` — a regra de
 * cobrança é livre em todos os planos; se um dia precisar gatear quantos
 * itens aparecem de graça, isso é decisão da TELA que consome
 * `orcamentosParaCobrar()` (mesmo contrato do Radar de clientes), não deste
 * service.
 */
import { getOrcamentos, getRecibos, getClientes } from '../database/database';
import { getReciboDoOrcamento } from './pagamentos';
import { montarMensagemCobranca } from '../utils/mensagensOrcamento';
import { Cliente, Orcamento } from '../types';

const MS_POR_DIA = 86400000;

export interface OrcamentoParaCobrar {
  orcamento: Orcamento;
  /** Cadastro ATIVO do cliente (getClientes), ou `null` se foi excluído depois
   *  da aprovação. O orçamento já guarda `clienteNome`/`clienteTelefone`
   *  denormalizados — a cobrança por WhatsApp continua funcionando mesmo com
   *  `cliente: null` (ver `mensagemCobranca`, que usa o próprio orçamento). */
  cliente: Cliente | null;
  diasParado: number;
  valor: number;
}

/** Data (ISO) usada como proxy de "quando este orçamento foi aprovado". */
function dataAprovacao(o: Orcamento): string {
  return o.atualizadoEm || o.criadoEm;
}

function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return 0;
  return Math.max(0, Math.floor(ms / MS_POR_DIA));
}

/**
 * Orçamentos aprovados sem recibo vinculado — "dinheiro parado" — ordenados
 * do que está parado há MAIS tempo primeiro (prioridade de cobrança). Nunca
 * lança: uma falha de leitura (SQLite/rede) deve aparecer como erro explícito
 * para quem chama, não virar lista vazia silenciosa — por isso este service
 * propaga a exceção e é a TELA quem decide o estado de erro (3 estados).
 */
export async function orcamentosParaCobrar(): Promise<OrcamentoParaCobrar[]> {
  const [orcamentos, recibos, clientes] = await Promise.all([
    getOrcamentos(), getRecibos(), getClientes(),
  ]);
  const clientesPorId = new Map(clientes.map(c => [c.id, c] as const));

  const resultado: OrcamentoParaCobrar[] = [];
  for (const o of orcamentos) {
    if (o.status !== 'aprovado') continue;
    if (getReciboDoOrcamento(o.id, recibos)) continue; // já tem recibo: não é mais "parado"
    resultado.push({
      orcamento: o,
      cliente: clientesPorId.get(o.clienteId) ?? null,
      diasParado: diasDesde(dataAprovacao(o)),
      valor: o.valorTotal,
    });
  }

  resultado.sort((a, b) => b.diasParado - a.diasParado);
  return resultado;
}

/**
 * Mensagem de WhatsApp pronta para cobrar um orçamento aprovado sem
 * pagamento — 100% derivada dos dados reais do próprio orçamento (número,
 * valor, dias parado), nada inventado.
 */
export function mensagemCobranca(item: OrcamentoParaCobrar): string {
  return montarMensagemCobranca(item.orcamento, item.diasParado);
}
