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
 * A REGRA (quem entra, em que ordem, quando vence) mora em
 * `radarFollowUpRegra.ts`, pura e testada (scripts/teste-radar-followup.ts):
 * quem já tem recibo/pagamento NÃO entra; a ordem é valor × recência; passada a
 * validade (ou 30 dias da emissão, sem validade) a ação vira "renovar".
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
import { getOrcamentos, getClientes, getEmpresa, getRecibos } from '../database/database';
import { montarMensagemFollowUpOrcamento } from '../utils/mensagensOrcamento';
import { formatCurrency } from '../utils/currency';
import type { Empresa } from '../types';
import { LIMIAR_PROPOSTA_PARADA_DIAS } from './radarDinheiro';
import { montarMensagemPropostaVencida, selecionarFollowUp, type OrcamentoParaFollowUp } from './radarFollowUpRegra';

export type { OrcamentoParaFollowUp } from './radarFollowUpRegra';

/** Limiar de dias parado (sem resposta do cliente) para entrar no radar — o MESMO
 *  do painel e do resumo diário por e-mail (`radarDinheiro.ts`). */
const DIAS_LIMIAR = LIMIAR_PROPOSTA_PARADA_DIAS;

// Empresa (getEmpresa) cacheada em memória por processo: a mensagem de
// follow-up precisa ser SÍNCRONA (chamada direto no onPress do botão "Chamar
// no WhatsApp"), então buscamos a empresa uma vez em `orcamentosParaFollowUp`
// — que já roda a cada carregamento da tela — e guardamos aqui para
// `mensagemFollowUp` ler sem precisar de await. Mesmo padrão de
// `radarClientes.ts` (`nomePrestadorCache`).
let empresaCache: Empresa | null = null;

/**
 * Propostas enviadas (status em `STATUS_PROPOSTA_ENVIADA`) sem resposta do
 * cliente há >= 3 dias e SEM pagamento registrado — ordenadas por prioridade
 * (valor × recência). Não engole erro: uma falha de leitura (SQLite) deve
 * aparecer como erro explícito para quem chama, não virar lista vazia
 * silenciosa — por isso este service propaga a exceção e é a TELA quem
 * decide o estado de erro (3 estados).
 */
export async function orcamentosParaFollowUp(): Promise<OrcamentoParaFollowUp[]> {
  const [orcamentos, clientes, empresa, recibos] = await Promise.all([
    getOrcamentos(), getClientes(), getEmpresa(), getRecibos(),
  ]);
  empresaCache = empresa;
  return selecionarFollowUp(orcamentos, recibos, clientes, DIAS_LIMIAR);
}

/**
 * Mensagem de WhatsApp pronta para o follow-up de uma proposta parada —
 * 100% derivada dos dados reais do próprio orçamento (número, valor,
 * validade), nada inventado. Proposta vencida pede para RENOVAR (dizer "vale
 * até" uma data passada seria mentir). Síncrona de propósito (usada direto no
 * onPress do botão): a empresa vem do cache preenchido pela última chamada a
 * `orcamentosParaFollowUp` — sempre chamada antes, ao carregar a tela. Sem
 * cache ainda (ex.: uso isolado), a mensagem sai sem o contato da empresa.
 */
export function mensagemFollowUp(item: OrcamentoParaFollowUp): string {
  if (item.expirada) {
    return montarMensagemPropostaVencida(
      item,
      formatCurrency(item.orcamento.valorTotal),
      empresaCache?.telefone || empresaCache?.whatsapp || null,
    );
  }
  return montarMensagemFollowUpOrcamento(item.orcamento, empresaCache);
}
