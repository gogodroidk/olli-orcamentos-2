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
import { getOrcamentos, getRecibos, getClientes, getEmpresa } from '../database/database';
import { getReciboDoOrcamento } from './pagamentos';
import { lerCobrancasEnviadas, registrarCobrancaEnviada } from './registroEnvios';
import { pagamentosInformadosPeloCliente } from './clienteLink';
import { enviadoHoje, ordenarParaCobrar, prepararCobranca, type SituacaoPix } from '../utils/cobrancaCliente';
import { abrirWhatsApp } from '../utils/exportarDocumento';
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
  /** Pix Copia e Cola PRONTO (valor embutido) para o WhatsApp; '' quando a
   *  cobrança vai sem Pix (ver `situacaoPix`). Pré-computado aqui (empresa lida 1x)
   *  para a tela não precisar montar o BR Code por item. */
  pixCopiaECola: string;
  /** Por que o Pix entrou ou não — a tela mostra "Cadastrar chave Pix" a partir disto. */
  situacaoPix: SituacaoPix;
  /** Texto pronto do WhatsApp (o mesmo de `mensagemCobranca`). */
  mensagem: string;
  /** ISO da última cobrança enviada por aqui (1 toque), ou null. */
  cobradoEm: string | null;
  /** Já cobrado HOJE: o item desce na lista e mostra "cobrado hoje" (não insiste). */
  cobradoHoje: boolean;
  /** ISO de quando o cliente tocou "Já paguei" no link — aviso para conferir, ou null. */
  pagamentoInformadoEm: string | null;
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
  const [orcamentos, recibos, clientes, empresa, cobrancas, informados] = await Promise.all([
    getOrcamentos(), getRecibos(), getClientes(), getEmpresa(),
    // Os dois abaixo só ROTULAM/REORDENAM ("cobrado hoje", "cliente avisou que
    // pagou") e nunca lançam: falha = mapa vazio = o item aparece sem rótulo. A lista
    // em si (o dinheiro parado) depende só das leituras locais acima.
    lerCobrancasEnviadas(), pagamentosInformadosPeloCliente(),
  ]);
  const clientesPorId = new Map(clientes.map(c => [c.id, c] as const));
  const agora = new Date();

  const resultado: OrcamentoParaCobrar[] = [];
  for (const o of orcamentos) {
    if (o.status !== 'aprovado') continue;
    if (getReciboDoOrcamento(o.id, recibos)) continue; // já tem recibo: não é mais "parado"
    const diasParado = diasDesde(dataAprovacao(o));
    // Mensagem + Pix prontos (valor = total devido), pela MESMA função do painel.
    // Sem chave válida, a mensagem sai sem Pix e `situacaoPix` diz o porquê.
    const cobranca = prepararCobranca({ orcamento: o, empresa, diasParado });
    const cobradoEm = cobrancas[o.id] ?? null;
    resultado.push({
      orcamento: o,
      cliente: clientesPorId.get(o.clienteId) ?? null,
      diasParado,
      valor: o.valorTotal,
      pixCopiaECola: cobranca.pixCopiaECola,
      situacaoPix: cobranca.situacaoPix,
      mensagem: cobranca.texto,
      cobradoEm,
      cobradoHoje: enviadoHoje(cobradoEm, agora),
      pagamentoInformadoEm: informados.get(o.id) ?? null,
    });
  }

  return ordenarParaCobrar(resultado);
}

/**
 * Mensagem de WhatsApp pronta para cobrar um orçamento aprovado sem
 * pagamento — 100% derivada dos dados reais do próprio orçamento (número,
 * valor, dias parado), nada inventado.
 */
export function mensagemCobranca(item: OrcamentoParaCobrar): string {
  return item.mensagem;
}

/** Telefone para cobrar: o denormalizado no orçamento, ou o do cadastro ativo. */
export function telefoneDaCobranca(item: OrcamentoParaCobrar): string {
  return (item.orcamento.clienteTelefone || item.cliente?.telefone || '').trim();
}

/**
 * Cobrar com 1 toque: abre o WhatsApp do cliente com a mensagem pronta e registra a
 * data do envio (o radar não insiste no mesmo dia). `false` = sem telefone (a tela
 * avisa); o registro só acontece depois de o WhatsApp abrir sem erro.
 */
export async function cobrarNoWhatsApp(item: OrcamentoParaCobrar): Promise<boolean> {
  const telefone = telefoneDaCobranca(item);
  if (!telefone) return false;
  await abrirWhatsApp(telefone, item.mensagem);
  await registrarCobrancaEnviada(item.orcamento.id);
  return true;
}
