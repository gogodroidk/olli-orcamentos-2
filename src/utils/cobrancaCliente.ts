/**
 * COBRAR O CLIENTE COM 1 TOQUE — o prestador cobra o cliente DELE.
 *
 * O dinheiro aqui é do serviço físico que o prestador fez: vai direto da conta do
 * cliente para a conta Pix do prestador. O OLLI só MONTA a mensagem (valor,
 * referência e o Pix Copia e Cola gerado localmente) — não intermedeia, não
 * processa e não confirma pagamento nenhum. Por isso isto vale igual no iOS, no
 * Android da Play e na web: não é compra de bem digital do OLLI (ver a regra das
 * lojas em `screens/PlanosScreen.tsx`, que trata só da assinatura do app).
 *
 * TypeScript PURO (sem React Native, sem banco): o app (Home, Início do desktop,
 * detalhe do orçamento) e o painel web chamam a MESMA função, então o texto e o Pix
 * que saem do celular e do computador são idênticos — e os testes em Node
 * (`scripts/teste-cobranca-posvenda.ts`) exercitam exatamente o que vai para o cliente.
 *
 * REGRA DE OURO (fail-closed em dinheiro): o Pix só entra na mensagem quando a chave
 * foi RECONHECIDA (`normalizarChavePix`) e o código montado passou na conferência
 * completa (`pixCopiaEColaValido`). Sem chave, chave duvidosa ou valor zerado, a
 * mensagem sai SEM Pix — nunca com um Pix vazio ou quebrado — e a tela pede para o
 * prestador cadastrar/corrigir a chave (1 toque até Meu Negócio).
 */
import type { Empresa, Orcamento } from '../types';
import { gerarPixCopiaECola, normalizarChavePix, pixCopiaEColaValido } from './pixBrCode.ts';
import { montarMensagemCobranca } from './mensagensOrcamento.ts';

const MS_POR_DIA = 86_400_000;

/** Por que a cobrança saiu (ou não) com Pix — a tela decide o aviso a partir disto. */
export type SituacaoPix = 'com_pix' | 'sem_chave' | 'chave_invalida' | 'sem_valor';

export interface CobrancaPronta {
  /** O texto que vai no WhatsApp (sempre existe: sem Pix ele cai no fecho padrão). */
  texto: string;
  situacaoPix: SituacaoPix;
  /** Pix Copia e Cola embutido no texto; '' quando `situacaoPix !== 'com_pix'`. */
  pixCopiaECola: string;
  /** Quanto está sendo cobrado (o saldo em aberto). */
  valor: number;
}

export interface EntradaCobranca {
  orcamento: Orcamento;
  empresa: Empresa | null | undefined;
  /** Dias desde a aprovação — escalona o tom (ver `montarMensagemCobranca`). */
  diasParado: number;
  /**
   * Saldo em aberto. Ausente = o total do orçamento (nada pago ainda). Com
   * pagamento parcial, é o que falta — e é ESTE valor que vai no Pix.
   */
  valorEmAberto?: number;
}

/** Arredonda para centavos (o BR Code leva 2 casas; 0,1+0,2 não pode virar 0,30000000000000004). */
function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * A chave Pix que vale para ESTE orçamento: a do próprio orçamento (quando o
 * prestador trocou só nele) ou a do cadastro da empresa.
 */
export function chavePixDoOrcamento(orcamento: Pick<Orcamento, 'chavePix'>, empresa: Pick<Empresa, 'chavePix'> | null | undefined): string {
  return (orcamento.chavePix || empresa?.chavePix || '').trim();
}

/**
 * Monta a cobrança pronta para o WhatsApp. Nunca lança.
 */
export function prepararCobranca({ orcamento, empresa, diasParado, valorEmAberto }: EntradaCobranca): CobrancaPronta {
  const total = Number.isFinite(orcamento.valorTotal) ? Math.max(0, orcamento.valorTotal) : 0;
  const bruto = typeof valorEmAberto === 'number' && Number.isFinite(valorEmAberto) ? valorEmAberto : total;
  const valor = centavos(Math.max(0, Math.min(bruto, total || bruto)));
  const dias = Number.isFinite(diasParado) ? Math.max(0, Math.floor(diasParado)) : 0;
  const saldo = valor + 0.005 < total ? valor : undefined;

  const semPix = (situacaoPix: SituacaoPix): CobrancaPronta => ({
    texto: montarMensagemCobranca(orcamento, dias, undefined, saldo),
    situacaoPix,
    pixCopiaECola: '',
    valor,
  });

  const bruta = chavePixDoOrcamento(orcamento, empresa);
  if (!bruta) return semPix('sem_chave');
  const chave = normalizarChavePix(bruta);
  if (!chave) return semPix('chave_invalida');
  if (valor <= 0) return semPix('sem_valor');

  const pix = gerarPixCopiaECola({
    chave: chave.chave,
    valor,
    nome: empresa?.nome || empresa?.nomePrestador || '',
    cidade: empresa?.cidade || '',
    txid: orcamento.numero,
  });
  // Trava final: o código que sai tem que passar na conferência EMV + CRC inteira.
  if (!pixCopiaEColaValido(pix)) return semPix('chave_invalida');

  return {
    texto: montarMensagemCobranca(orcamento, dias, pix, saldo),
    situacaoPix: 'com_pix',
    pixCopiaECola: pix,
    valor,
  };
}

/** Aviso curto para a tela quando a cobrança NÃO leva Pix (null = leva Pix, sem aviso). */
export function avisoPix(situacao: SituacaoPix): { titulo: string; acao: string } | null {
  switch (situacao) {
    case 'sem_chave':
      return {
        titulo: 'Cadastre sua chave Pix para a cobrança já ir com o Pix copia e cola e o valor certo.',
        acao: 'Cadastrar chave Pix',
      };
    case 'chave_invalida':
      return {
        titulo: 'Sua chave Pix não parece válida — a cobrança vai sem Pix até você conferir.',
        acao: 'Conferir chave Pix',
      };
    default:
      return null;
  }
}

/* ═════════════  REGISTRO DE ENVIOS (cobrança e lembrete)  ═════════════
 * Mapa id → ISO do último envio. O app guarda no AsyncStorage e sincroniza via
 * `extras_sync` (chaves 'cobranca.enviadas' e 'posvenda.lembrados'); o painel lê e
 * escreve o MESMO formato. Aqui só a parte pura: ler com segurança, gravar podando o
 * que é velho e responder "já foi hoje?".
 */

export type MapaEnvios = Record<string, string>;

/** Envios mais velhos que isto saem do mapa (não mudam mais nenhuma decisão). */
export const DIAS_GUARDAR_ENVIO = 180;

/** Aceita só pares string → ISO legível. Qualquer outra coisa vira mapa vazio. Nunca lança. */
export function lerMapaEnvios(valor: unknown): MapaEnvios {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const mapa: MapaEnvios = {};
  for (const [id, quando] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof quando === 'string' && id && Number.isFinite(new Date(quando).getTime())) mapa[id] = quando;
  }
  return mapa;
}

/** Novo mapa com o envio de `id` carimbado em `agora` e os envios velhos podados. */
export function registrarEnvio(mapa: MapaEnvios, id: string, agora: Date = new Date()): MapaEnvios {
  const limite = agora.getTime() - DIAS_GUARDAR_ENVIO * MS_POR_DIA;
  const novo: MapaEnvios = {};
  for (const [k, v] of Object.entries(lerMapaEnvios(mapa))) {
    if (new Date(v).getTime() >= limite) novo[k] = v;
  }
  if (id) novo[id] = agora.toISOString();
  return novo;
}

/** O envio aconteceu no MESMO dia de calendário local de `agora`? */
export function enviadoHoje(quando: string | null | undefined, agora: Date = new Date()): boolean {
  if (!quando) return false;
  const d = new Date(quando);
  if (!Number.isFinite(d.getTime())) return false;
  return d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth() && d.getDate() === agora.getDate();
}

/**
 * Ordem do radar de cobrança: quem AINDA não foi cobrado hoje vem primeiro (é a
 * próxima ação útil); dentro de cada grupo, o parado há mais tempo primeiro. Quem já
 * foi cobrado hoje não some — o dinheiro continua parado —, só desce e mostra
 * "cobrado hoje", para o radar não insistir no mesmo cliente no mesmo dia.
 */
export function ordenarParaCobrar<T extends { diasParado: number; cobradoHoje: boolean }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => Number(a.cobradoHoje) - Number(b.cobradoHoje) || b.diasParado - a.diasParado);
}

/* ═════════════  COBRANÇA NO LINK PÚBLICO (/o/<token>)  ═════════════
 * O que o snapshot do link leva para a página do cliente cobrar O MESMO valor que o
 * WhatsApp cobraria. Antes a página só conhecia o total: quem já tinha pago a entrada
 * via o QR do valor inteiro (e pagava a mais), e o Pix só aparecia se o CLIENTE
 * tivesse tocado "Aprovar" no link — o prestador que fechou na conversa e marcou
 * "aprovado" no app mandava o link e a página pedia aprovação de novo.
 */

/** Entrada/sinal configurado no orçamento (o mesmo cálculo do PDF), ou `null`. */
export interface SinalDoOrcamento {
  valor: number;
  percentual: number | null;
  /** Data combinada para a entrada, como o prestador digitou (DD/MM/AAAA). */
  data: string;
}

/** O que vai em `dados` do link para a página cobrar certo. */
export interface CobrancaDoLink {
  /** Status do orçamento no app no momento do envio (a decisão do prestador). */
  statusApp: Orcamento['status'];
  /**
   * `true` = o prestador já fechou (aprovado/convertido no app) e há valor a receber:
   * a página mostra o Pix mesmo que o cliente nunca tenha tocado "Aprovar".
   */
  cobrarAgora: boolean;
  /**
   * Quanto o Pix da página cobra: a entrada (se há sinal e nada foi pago), senão o
   * saldo em aberto. `0` = já está tudo pago. `null` = NÃO SEI (não deu para ler os
   * recebimentos) — a página então não monta Pix nenhum, em vez de cobrar o total
   * de quem talvez já tenha pago parte.
   */
  valorACobrar: number | null;
  /** Rótulo do valor cobrado: entrada, saldo (já pagou parte) ou o total. */
  cobrancaTipo: 'sinal' | 'saldo' | 'total' | null;
  sinal: SinalDoOrcamento | null;
}

/** Entrada/sinal do orçamento, limitada ao total — mesma regra do `renderSinal` do PDF. */
export function sinalDoOrcamento(
  orcamento: Pick<Orcamento, 'valorTotal' | 'sinalValor' | 'sinalPercentual' | 'sinalData'>,
): SinalDoOrcamento | null {
  const total = Math.max(0, Number(orcamento.valorTotal) || 0);
  let valor = 0;
  let percentual: number | null = null;
  if (typeof orcamento.sinalValor === 'number' && orcamento.sinalValor > 0) {
    valor = Math.min(orcamento.sinalValor, total);
    percentual = total > 0 ? Math.round((valor / total) * 100) : null;
  } else if (typeof orcamento.sinalPercentual === 'number' && orcamento.sinalPercentual > 0 && total > 0) {
    percentual = Math.min(100, Math.max(0, orcamento.sinalPercentual));
    valor = total * (percentual / 100);
  }
  if (!(valor > 0)) return null;
  return { valor: centavos(valor), percentual, data: orcamento.sinalData ?? '' };
}

/**
 * Monta a cobrança do link. `recebido` = soma dos recebimentos (recibos não
 * estornados) deste orçamento; `null` quando a leitura falhou (3 estados: o "não
 * sei" nunca vira "nada pago"). Nunca lança.
 */
export function cobrancaDoLink(
  orcamento: Pick<Orcamento, 'status' | 'valorTotal' | 'sinalValor' | 'sinalPercentual' | 'sinalData'>,
  recebido: number | null,
): CobrancaDoLink {
  const total = centavos(Math.max(0, Number(orcamento.valorTotal) || 0));
  const sinal = sinalDoOrcamento(orcamento);
  const statusApp = orcamento.status;
  const fechado = statusApp === 'aprovado' || statusApp === 'convertido';

  if (recebido === null || !Number.isFinite(recebido)) {
    return { statusApp, cobrarAgora: false, valorACobrar: null, cobrancaTipo: null, sinal };
  }

  const pago = centavos(Math.max(0, recebido));
  const saldo = centavos(Math.max(0, total - pago));
  let valorACobrar = saldo;
  let cobrancaTipo: CobrancaDoLink['cobrancaTipo'] = pago > 0 ? 'saldo' : 'total';
  // Entrada: só enquanto nada foi pago e ela é menor que o total (entrada = total é o total).
  if (pago <= 0 && sinal && sinal.valor + 0.005 < total) {
    valorACobrar = sinal.valor;
    cobrancaTipo = 'sinal';
  }
  if (!(valorACobrar > 0)) cobrancaTipo = null;

  return { statusApp, cobrarAgora: fechado && valorACobrar > 0, valorACobrar, cobrancaTipo, sinal };
}
