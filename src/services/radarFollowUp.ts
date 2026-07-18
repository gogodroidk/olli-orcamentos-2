/**
 * Radar de follow-up — o passo ANTES do Radar de cobrança (ver
 * `radarCobranca.ts`, mesma pasta, mesmo espírito): "orçamento aprovado não
 * é dinheiro no bolso" pressupõe que o cliente respondeu. Este radar cobre o
 * degrau anterior — a proposta foi ENVIADA/vista e o cliente simplesmente
 * não respondeu. Identifica orçamentos com status de proposta já enviada
 * (`STATUS_PROPOSTA_ENVIADA` — enviado/visualizado/em_negociacao/
 * aguardando_assinatura, ver types/index.ts) parados sem movimentação há
 * N dias. Menos dinheiro perdido por proposta esquecida.
 *
 * REAPROVEITAMENTO — nada aqui reimplementa leitura ou regra já existente:
 *  - getOrcamentos/getClientes/getEmpresa (database.ts) — as MESMAS
 *    listagens que `radarCobranca.ts`/`radarClientes.ts` já usam, sem query
 *    nova.
 *  - STATUS_PROPOSTA_ENVIADA (types/index.ts) — a MESMA lista de status que
 *    já alimenta o KPI "em aberto" e o agregado de parados da HomeScreen
 *    (`getOrcamentosAgregadoPorStatus`/`getOrcamentosParadosAgregado`).
 *    Nenhuma regra nova de "o que conta como proposta enviada" nasce aqui.
 *
 * "Dias parado" usa `atualizadoEm` do orçamento (carimbado pelo BANCO a
 * cada escrita — ver `Cliente.atualizadoEm` em types/index.ts) como proxy de
 * "desde quando ninguém mexe nesta proposta" — mesma regra de
 * `radarCobranca.ts` (`dataAprovacao`). Cai para `criadoEm` só quando
 * `atualizadoEm` estiver ausente (registro legado).
 *
 * GATE DE PLANO: nenhum. Mesmo padrão de `radarCobranca.ts` — a regra de
 * follow-up é livre em todos os planos; se um dia precisar gatear quantos
 * itens aparecem de graça, isso é decisão da TELA que consome
 * `orcamentosParaFollowUp()`, não deste service.
 */
import { getOrcamentos, getClientes, getEmpresa } from '../database/database';
import { montarMensagemFollowUpOrcamento } from '../utils/mensagensOrcamento';
import { Cliente, Empresa, Orcamento, propostaJaEnviada } from '../types';

const MS_POR_DIA = 86400000;
/** Limiar de dias parado (sem resposta do cliente) para entrar no radar. */
const DIAS_LIMIAR = 3;

export interface OrcamentoParaFollowUp {
  orcamento: Orcamento;
  /** Cadastro ATIVO do cliente (getClientes), ou `null` se foi excluído depois
   *  do envio. O orçamento já guarda `clienteNome`/`clienteTelefone`
   *  denormalizados — o follow-up por WhatsApp continua funcionando mesmo com
   *  `cliente: null` (ver `mensagemFollowUp`, que usa o próprio orçamento). */
  cliente: Cliente | null;
  diasParado: number;
}

// Empresa (getEmpresa) cacheada em memória por processo: a mensagem de
// follow-up precisa ser SÍNCRONA (chamada direto no onPress do botão "Chamar
// no WhatsApp"), então buscamos a empresa uma vez em `orcamentosParaFollowUp`
// — que já roda a cada carregamento da tela — e guardamos aqui para
// `mensagemFollowUp` ler sem precisar de await. Mesmo padrão de
// `radarClientes.ts` (`nomePrestadorCache`).
let empresaCache: Empresa | null = null;

/** Data (ISO) usada como proxy de "desde quando esta proposta está parada". */
function dataUltimaMovimentacao(o: Orcamento): string {
  return o.atualizadoEm || o.criadoEm;
}

function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return 0;
  return Math.max(0, Math.floor(ms / MS_POR_DIA));
}

/**
 * Propostas enviadas (status em `STATUS_PROPOSTA_ENVIADA`) sem resposta do
 * cliente há >= 3 dias — ordenadas do que está parado há MAIS tempo primeiro
 * (prioridade de follow-up). Nunca lança: uma falha de leitura (SQLite/rede)
 * deve aparecer como erro explícito para quem chama, não virar lista vazia
 * silenciosa — por isso este service propaga a exceção e é a TELA quem
 * decide o estado de erro (3 estados).
 */
export async function orcamentosParaFollowUp(): Promise<OrcamentoParaFollowUp[]> {
  const [orcamentos, clientes, empresa] = await Promise.all([
    getOrcamentos(), getClientes(), getEmpresa(),
  ]);
  empresaCache = empresa;
  const clientesPorId = new Map(clientes.map(c => [c.id, c] as const));

  const resultado: OrcamentoParaFollowUp[] = [];
  for (const o of orcamentos) {
    if (!propostaJaEnviada(o.status)) continue;
    const diasParado = diasDesde(dataUltimaMovimentacao(o));
    if (diasParado < DIAS_LIMIAR) continue;
    resultado.push({
      orcamento: o,
      cliente: clientesPorId.get(o.clienteId) ?? null,
      diasParado,
    });
  }

  resultado.sort((a, b) => b.diasParado - a.diasParado);
  return resultado;
}

/**
 * Mensagem de WhatsApp pronta para o follow-up de uma proposta parada —
 * 100% derivada dos dados reais do próprio orçamento (número, valor,
 * validade), nada inventado. Síncrona de propósito (usada direto no onPress
 * do botão "Chamar no WhatsApp"): a empresa vem do cache preenchido pela
 * última chamada a `orcamentosParaFollowUp` — sempre chamada antes, ao
 * carregar a tela. Sem cache ainda (ex.: uso isolado), a mensagem sai sem o
 * contato da empresa.
 */
export function mensagemFollowUp(item: OrcamentoParaFollowUp): string {
  return montarMensagemFollowUpOrcamento(item.orcamento, empresaCache);
}
