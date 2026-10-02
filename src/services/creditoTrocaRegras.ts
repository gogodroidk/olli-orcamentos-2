/**
 * Crédito de troca ("Vim de outro app") — regras PURAS (sem rede, sem Expo).
 *
 * Quem já pagou outro app de orçamento manda o comprovante; um administrador do
 * OLLI confere À MÃO e libera o Pro por até CREDITO_TROCA_MESES_MAX meses, uma vez
 * por conta. Não é venda: não há preço, cobrança nem renovação — por isso aparece
 * igual em todas as plataformas (inclusive no build da Play).
 *
 * A fonte do teto é `limitesComerciais.ts`; a migration
 * 20261002153417_creditos_troca.sql e o worker têm teste de paridade.
 */
import { CREDITO_TROCA_MESES_MAX } from './limitesComerciais.ts';

export type StatusPedidoTroca = 'pendente' | 'aprovado' | 'recusado';

export interface PedidoTroca {
  id: string;
  status: StatusPedidoTroca;
  appAnterior: string;
  venceEm: string | null;
  mesesConcedidos: number | null;
  concedidoAte: string | null;
  motivoRecusa: string | null;
  criadoEm: string;
}

/**
 * Estado do pedido do prestador, em TRÊS estados (nunca colapsar "não sei" em
 * "não tem"): sem pedido, com pedido, ou não deu para ler — neste último a tela
 * NÃO oferece um formulário novo como se não houvesse nada.
 */
export type EstadoPedidoTroca =
  | { tipo: 'carregando' }
  | { tipo: 'sem_sessao' }
  | { tipo: 'indisponivel' }
  | { tipo: 'pronto'; pedido: PedidoTroca | null; totalPedidos: number };

export const APP_ANTERIOR_MIN = 2;
export const APP_ANTERIOR_MAX = 60;
export const OBSERVACAO_MAX = 500;

/** Converte a linha do banco (snake_case) num pedido. Linha estranha = null. */
export function interpretarPedidoTroca(linha: unknown): PedidoTroca | null {
  if (!linha || typeof linha !== 'object') return null;
  const l = linha as Record<string, unknown>;
  const status = l.status;
  if (status !== 'pendente' && status !== 'aprovado' && status !== 'recusado') return null;
  if (typeof l.id !== 'string' || typeof l.app_anterior !== 'string' || typeof l.criado_em !== 'string') return null;
  const meses = typeof l.meses_concedidos === 'number' ? l.meses_concedidos : null;
  return {
    id: l.id,
    status,
    appAnterior: l.app_anterior,
    venceEm: typeof l.vence_em === 'string' ? l.vence_em : null,
    mesesConcedidos: meses,
    concedidoAte: typeof l.concedido_ate === 'string' ? l.concedido_ate : null,
    motivoRecusa: typeof l.motivo_recusa === 'string' ? l.motivo_recusa : null,
    criadoEm: l.criado_em,
  };
}

/** O pedido que manda no estado: o aprovado, senão o pendente, senão o recusado mais recente. */
export function pedidoVigente(lista: readonly PedidoTroca[]): PedidoTroca | null {
  const aprovado = lista.find((p) => p.status === 'aprovado');
  if (aprovado) return aprovado;
  const pendente = lista.find((p) => p.status === 'pendente');
  if (pendente) return pendente;
  return [...lista].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0] ?? null;
}

/** "dd/mm/aaaa" → "aaaa-mm-dd" (vazio = sem data). null = data inválida. */
export function dataBrParaIso(valor: string): string | null | '' {
  const limpo = valor.trim();
  if (!limpo) return '';
  const m = limpo.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  const d = new Date(Date.UTC(Number(aaaa), Number(mm) - 1, Number(dd)));
  if (d.getUTCFullYear() !== Number(aaaa) || d.getUTCMonth() !== Number(mm) - 1 || d.getUTCDate() !== Number(dd)) return null;
  return `${aaaa}-${mm}-${dd}`;
}

export interface FormularioTroca {
  appAnterior: string;
  venceEm: string; // dd/mm/aaaa ou vazio
  observacao: string;
  temComprovante: boolean;
}

/** Valida o formulário antes de subir o arquivo. Devolve a 1ª mensagem de erro ou null. */
export function validarFormularioTroca(f: FormularioTroca, hojeIso: string): string | null {
  const app = f.appAnterior.trim();
  if (app.length < APP_ANTERIOR_MIN) return 'Diga qual app você usava.';
  if (app.length > APP_ANTERIOR_MAX) return `Nome do app com no máximo ${APP_ANTERIOR_MAX} letras.`;
  const vence = dataBrParaIso(f.venceEm);
  if (vence === null) return 'Data de vencimento inválida. Use dd/mm/aaaa.';
  if (vence && vence < hojeIso) return 'Essa assinatura já venceu. O crédito vale para quem ainda tem tempo pago no outro app.';
  if (f.observacao.trim().length > OBSERVACAO_MAX) return `Observação com no máximo ${OBSERVACAO_MAX} letras.`;
  if (!f.temComprovante) return 'Anexe o print ou a foto da assinatura.';
  return null;
}

/** Erros da RPC `solicitar_credito_troca` → texto para o prestador. */
const MENSAGENS: Record<string, string> = {
  sessao_obrigatoria: 'Entre na sua conta para pedir o crédito.',
  app_invalido: 'Diga qual app você usava.',
  observacao_invalida: `Observação com no máximo ${OBSERVACAO_MAX} letras.`,
  vencimento_invalido: 'Data de vencimento inválida ou já passada.',
  comprovante_invalido: 'Não consegui usar esse arquivo. Escolha a imagem de novo.',
  comprovante_inexistente: 'O comprovante não chegou ao servidor. Tente enviar de novo.',
  somente_dono: 'Quem pede o crédito é o dono da conta. Peça para o responsável pela empresa enviar.',
  credito_ja_usado: 'Sua conta já usou o crédito de troca. Ele vale uma vez por conta.',
  pedido_em_analise: 'Você já tem um pedido em análise. Avisamos quando for conferido.',
  limite_pedidos: 'Você chegou ao limite de pedidos. Fale com o suporte pelo WhatsApp.',
};

export function mensagemErroTroca(erro: unknown): string {
  const texto = String((erro as { message?: string } | null)?.message ?? erro ?? '');
  const codigo = Object.keys(MENSAGENS).find((c) => texto.includes(c));
  return codigo ? MENSAGENS[codigo] : 'Não consegui enviar agora. Confira a internet e tente de novo; nada foi cobrado.';
}

function dataBr(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('pt-BR') : '';
}

/** Texto curto do estado para o atalho em Planos e o topo da tela. */
export function resumoPedidoTroca(pedido: PedidoTroca | null): { titulo: string; texto: string } {
  if (!pedido) {
    return {
      titulo: 'Vim de outro app',
      texto: `Já pagou outro app de orçamento? Mande o comprovante e use o Pro sem pagar por até ${CREDITO_TROCA_MESES_MAX} meses.`,
    };
  }
  if (pedido.status === 'pendente') {
    return {
      titulo: 'Crédito de troca em análise',
      texto: 'Recebemos seu comprovante. Uma pessoa do OLLI confere e você recebe o aviso aqui e por e-mail.',
    };
  }
  if (pedido.status === 'aprovado') {
    const ate = dataBr(pedido.concedidoAte);
    return {
      titulo: 'Crédito de troca aprovado',
      texto: ate ? `Pro liberado até ${ate}. Sem cobrança e sem renovação automática.` : 'Pro liberado. Sem cobrança e sem renovação automática.',
    };
  }
  return {
    titulo: 'Crédito de troca recusado',
    texto: pedido.motivoRecusa ? `Motivo: ${pedido.motivoRecusa}` : 'O comprovante não pôde ser confirmado.',
  };
}
