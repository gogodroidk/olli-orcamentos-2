import { podeComPapel, type Acao } from './permissoesPapel.ts';
import { formatCurrency } from './currency.ts';

/**
 * Sinais COMERCIAIS do "Bom dia da OLLI" (ritual diário): o dinheiro parado
 * (`orcamentosParaCobrar`, radarCobranca.ts) e o cliente na hora da manutenção
 * (`clientesParaReconquistar`, radarClientes.ts). TS puro, sem React nem expo —
 * `services/ritualDiario.ts` lê os radares e decide aqui o que vira manchete.
 *
 * QUEM OUVE O QUÊ — os dois radares leem a base local INTEIRA da empresa, e o
 * `Orcamento` não tem dono/responsável (só `clienteId`): não há como recortar
 * "os orçamentos do técnico". Então o recorte é por papel, pela mesma matriz
 * das telas (`utils/permissoesPapel.ts`):
 *  - cobrança = "R$ X parados em N orçamentos" é a soma da empresa → exige
 *    `ver_valores_agregados` (o mesmo gate dos totais do Início desktop);
 *  - pós-venda = lembrar o cliente da próxima manutenção em nome do prestador
 *    é cuidar da carteira de clientes → exige `gerenciar_clientes`. O técnico
 *    só tem `ver_clientes`, e o painel do técnico no desktop não mostra nenhum
 *    dos dois radares.
 * Papel desconhecido nega os dois (`podeComPapel` devolve `null` = "não sei", e
 * só `true` libera — nunca promove "não sei" a dono): o "Bom dia" fica com a
 * visita do dia, ou em silêncio.
 *
 * A Home do celular (`screens/HomeScreen.tsx`) mostra os MESMOS radares e usa
 * esta mesma régua (`ACAO_SINAL`) — o ritual e a tela nunca discordam.
 */

type Conta = Parameters<typeof podeComPapel>[1];

/** A permissão que libera cada sinal comercial. Uma régua só: ritual e Home. */
export const ACAO_SINAL = {
  cobranca: 'ver_valores_agregados',
  posVenda: 'gerenciar_clientes',
} as const satisfies Record<string, Acao>;

export interface SinaisComerciaisPermitidos {
  cobranca: boolean;
  posVenda: boolean;
}

export function sinaisComerciaisPermitidos(conta: Conta): SinaisComerciaisPermitidos {
  return {
    cobranca: podeComPapel(ACAO_SINAL.cobranca, conta) === true,
    posVenda: podeComPapel(ACAO_SINAL.posVenda, conta) === true,
  };
}

/**
 * Um sinal tem 3 estados e nenhum vira o outro: `fora` (o papel não ouve este
 * sinal — nem chega a ser lido), `erro` (a leitura falhou: não sei) e `ok`
 * (a lista lida, possivelmente vazia). Erro NUNCA é tratado como lista vazia.
 */
export type SinalComercial<T> =
  | { status: 'fora' }
  | { status: 'erro' }
  | { status: 'ok'; itens: readonly T[] };

export interface ItemCobranca {
  valor: number;
}

export interface ItemPosVenda {
  cliente: { nome: string };
  mesesSemContato: number;
}

/**
 * Corpo da manchete comercial, na ordem dinheiro parado > cliente sumido, ou
 * `null` (nenhum sinal real → quem chama não agenda nada). Um sinal em `erro`
 * não afirma nada sobre si (nem "nada a cobrar") — só cede a vez ao próximo,
 * que é dado lido de verdade. A copy é a mesma que o ritual já mandava.
 */
export function mancheteComercial(
  cobranca: SinalComercial<ItemCobranca>,
  posVenda: SinalComercial<ItemPosVenda>,
): string | null {
  if (cobranca.status === 'ok' && cobranca.itens.length > 0) {
    const n = cobranca.itens.length;
    const total = cobranca.itens.reduce((s, item) => s + item.valor, 0);
    const pl = n > 1 ? 's' : '';
    return `${formatCurrency(total)} parado${pl} em ${n} orçamento${pl} aprovado${pl} — cobre com 1 toque`;
  }

  if (posVenda.status === 'ok' && posVenda.itens.length > 0) {
    const item = posVenda.itens[0];
    return `${item.cliente.nome}: último serviço há ${item.mesesSemContato} ${item.mesesSemContato === 1 ? 'mês' : 'meses'} — hora de lembrar da manutenção`;
  }

  return null;
}
