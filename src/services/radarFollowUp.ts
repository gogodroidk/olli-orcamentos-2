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
 * TEXTO PELO SINAL (termômetro, Pro): quando o plano libera, a mensagem do
 * "Chamar no WhatsApp" acompanha o que o cliente fez no link (ver `mensagemFollowUp`).
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
import { LIMIAR_PROPOSTA_PARADA_DIAS, contarRascunhosEsquecidos } from './radarDinheiro';
import { montarMensagemPropostaVencida, selecionarFollowUp, validaAteYmd, type OrcamentoParaFollowUp } from './radarFollowUpRegra';
import { termometrosSeLiberado } from './termometro';
import { mensagemDaAcao, type EstadoTermometro } from './termometroRegra';

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

// Termômetro (Pro) dos orçamentos do radar, preenchido EM SEGUNDO PLANO: a lista
// do Início/Hoje não espera a rede. Quando o botão "Chamar no WhatsApp" é tocado,
// a mensagem usa o sinal se ele já chegou; senão, a de sempre.
let sinaisCache: ReadonlyMap<string, EstadoTermometro> = new Map();

/**
 * Propostas enviadas (status em `STATUS_PROPOSTA_ENVIADA`) sem resposta do
 * cliente há >= 3 dias e SEM pagamento registrado — ordenadas por prioridade
 * (valor × recência). Não engole erro: uma falha de leitura (SQLite) deve
 * aparecer como erro explícito para quem chama, não virar lista vazia
 * silenciosa — por isso este service propaga a exceção e é a TELA quem
 * decide o estado de erro (3 estados).
 */
export async function orcamentosParaFollowUp(): Promise<OrcamentoParaFollowUp[]> {
  return (await radarPropostas()).followUp;
}

/**
 * Follow-up + rascunhos esquecidos numa LEITURA só do SQLite (a Home precisa dos dois e
 * lia `orcamentos` duas vezes). `rascunhos` é a MESMA regra do painel
 * (`contarRascunhosEsquecidos`): `null` = não sei (rascunhos sem data legível), nunca 0.
 * Propaga erro de leitura — quem chama decide o estado.
 */
export async function radarPropostas(): Promise<{ followUp: OrcamentoParaFollowUp[]; rascunhos: number | null }> {
  const [orcamentos, clientes, empresa, recibos] = await Promise.all([
    getOrcamentos(), getClientes(), getEmpresa(), getRecibos(),
  ]);
  empresaCache = empresa;
  const lista = selecionarFollowUp(orcamentos, recibos, clientes, DIAS_LIMIAR);
  void termometrosSeLiberado(lista.map((i) => i.orcamento)).then((mapa) => {
    sinaisCache = mapa ?? new Map();
  });
  const rascunhos = contarRascunhosEsquecidos(
    orcamentos.map((o) => ({ status: o.status, criado_em: o.criadoEm, atualizado_em: o.atualizadoEm })),
    DIAS_LIMIAR,
  );
  return { followUp: lista, rascunhos };
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
  // Termômetro (Pro): vence amanhã → lembrar a validade; voltou ao preço →
  // oferecer parcelar; não abriu → confirmar se chegou. O texto nunca conta ao
  // cliente que ele foi medido.
  const sinal = sinaisCache.get(item.orcamento.id);
  if (sinal?.tipo === 'medido') {
    const texto = mensagemDaAcao(sinal.acao.tipo, item.orcamento, {
      validaAte: validaAteYmd(item.orcamento),
      contato: empresaCache?.telefone || empresaCache?.whatsapp || null,
    });
    if (texto) return texto;
  }
  return montarMensagemFollowUpOrcamento(item.orcamento, empresaCache);
}
