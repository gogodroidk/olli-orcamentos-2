// Import só de TIPO: este módulo é TypeScript puro e roda nos testes em Node
// (scripts/teste-orcar-rapido.ts), sem React Native nem banco.
import type { ItemOrcamento, Orcamento, ProdutoItem, ServicoItem } from '../types';

/**
 * ORÇAR MAIS RÁPIDO (item 2.11) — as regras puras do editor de orçamento.
 *
 * O caminho principal ficou em 3 passos: Cliente → Itens → Revisar. "Detalhes"
 * (datas, condições, fotos) saiu da fila: já nasce preenchido com o padrão da
 * empresa e é aberto pelo "Ajustar" da revisão, que volta para a revisão.
 */

export type Passo = 'cliente' | 'itens' | 'revisar' | 'ajustar';

/** Rótulos do indicador de progresso (o "Ajustar" vive dentro de "Revisar"). */
export const PASSOS_VISIVEIS = ['Cliente', 'Itens', 'Revisar'] as const;

/** Posição no indicador (0..2). "Ajustar" acende "Revisar". */
export function indiceVisivel(passo: Passo): number {
  if (passo === 'cliente') return 0;
  if (passo === 'itens') return 1;
  return 2;
}

/** Preenchimento da barra (0..1): cada passo já conta como andado ao entrar. */
export function progressoDoPasso(passo: Passo): number {
  return (indiceVisivel(passo) + 1) / PASSOS_VISIVEIS.length;
}

/** Para onde o botão principal leva. `null` = o próximo é salvar. */
export function proximoPasso(passo: Passo): Passo | null {
  if (passo === 'cliente') return 'itens';
  if (passo === 'itens') return 'revisar';
  if (passo === 'ajustar') return 'revisar';
  return null;
}

/** Para onde o "Voltar" leva. `null` = sair do editor (com a pergunta de descartar). */
export function passoAnterior(passo: Passo): Passo | null {
  if (passo === 'itens') return 'cliente';
  if (passo === 'revisar') return 'itens';
  if (passo === 'ajustar') return 'revisar';
  return null;
}

/** Sentido do deslize na troca de passo: avançar entra pela direita. */
export function direcaoDaTroca(de: Passo, para: Passo): 1 | -1 {
  if (de === 'revisar' && para === 'ajustar') return 1;
  if (de === 'ajustar' && para === 'revisar') return -1;
  return indiceVisivel(para) >= indiceVisivel(de) ? 1 : -1;
}

/**
 * Onde o editor abre. Criando com o cliente JÁ ligado ao cadastro (veio do CRM,
 * da página do cliente) o passo "Cliente" não tem o que fazer: abre em Itens. Na
 * edição e no resto, abre no começo. O orçamento de exemplo (ativação) também
 * abre em Itens, já com os itens: o nome do cliente é pedido só no Revisar.
 */
export function passoInicial(opcoes: { edicao: boolean; clienteLigado: boolean; exemplo?: boolean }): Passo {
  return !opcoes.edicao && (opcoes.clienteLigado || opcoes.exemplo) ? 'itens' : 'cliente';
}

/** Rótulo do botão principal — diz o que acontece ao tocar, não "Avançar". */
export function rotuloDoBotaoPrincipal(passo: Passo, edicao: boolean): string {
  if (passo === 'cliente') return 'Escolher itens';
  if (passo === 'itens') return 'Revisar';
  if (passo === 'ajustar') return 'Pronto';
  return edicao ? 'Salvar alterações' : 'Salvar orçamento';
}

/**
 * Por que o botão principal está apagado — o texto aparece ao lado do botão,
 * para ninguém tocar num botão morto sem saber o que falta. `null` = liberado.
 * Regra igual ao `canAdvance` antigo: cliente com nome; pelo menos 1 item; item
 * R$ 0,00 só com a confirmação de cortesia.
 */
export function motivoBloqueio(
  passo: Passo,
  orc: Pick<Orcamento, 'clienteNome' | 'itens'>,
  itensZeroConfirmados: ReadonlySet<string>,
): string | null {
  if (passo === 'cliente') {
    return orc.clienteNome.trim() ? null : 'Escolha ou digite o cliente para continuar.';
  }
  if (passo === 'itens' || passo === 'revisar') {
    if (passo === 'revisar' && !orc.clienteNome.trim()) return 'Digite para quem é o orçamento.';
    if (orc.itens.length === 0) return 'Adicione pelo menos 1 item.';
    const semValor = orc.itens.filter(i => i.preco <= 0 && !itensZeroConfirmados.has(i.id));
    if (semValor.length > 0) {
      return semValor.length === 1
        ? `"${semValor[0].nome}" está sem valor: informe o preço ou confirme que é cortesia.`
        : `${semValor.length} itens estão sem valor: informe o preço ou confirme que são cortesia.`;
    }
  }
  return null;
}

const centavos = (x: number) => Math.round(x * 100) / 100;

/** Item novo a partir do catálogo (1 unidade, preço do cadastro). */
export function itemDoCatalogo(
  item: ServicoItem | ProdutoItem,
  tipo: 'servico' | 'produto',
  id: string,
): ItemOrcamento {
  return {
    id, tipo, catalogoId: item.id,
    nome: item.nome, descricao: item.descricao, preco: item.preco,
    quantidade: 1, unidade: item.unidade, fotoUri: item.fotoUri, subtotal: centavos(item.preco),
  };
}

/**
 * Coloca um item do catálogo no orçamento: se já está (mesmo `catalogoId` e tipo)
 * soma 1 na quantidade; senão entra com 1. `novoId` só vem quando entrou linha nova.
 */
export function adicionarDoCatalogo(
  itens: readonly ItemOrcamento[],
  item: ServicoItem | ProdutoItem,
  tipo: 'servico' | 'produto',
  gerarId: () => string,
): { itens: ItemOrcamento[]; novoId?: string } {
  const existe = itens.find(i => i.catalogoId === item.id && i.tipo === tipo);
  if (existe) {
    return {
      itens: itens.map(i => (i === existe
        ? { ...i, quantidade: i.quantidade + 1, subtotal: centavos(i.preco * (i.quantidade + 1)) }
        : i)),
    };
  }
  const novoId = gerarId();
  return { itens: [...itens, itemDoCatalogo(item, tipo, novoId)], novoId };
}

/** Quantas unidades deste item do catálogo já estão no orçamento (0 = nenhuma). */
export function quantidadeNoOrcamento(
  itens: readonly ItemOrcamento[],
  catalogoId: string,
  tipo: 'servico' | 'produto',
): number {
  return itens
    .filter(i => i.catalogoId === catalogoId && i.tipo === tipo)
    .reduce((s, i) => s + i.quantidade, 0);
}

/**
 * Chips de "Você mais usa": tira o que já está no orçamento (para o chip não
 * repetir o que a pessoa já pôs) e corta em `limite`. A ordem de uso vem do banco.
 */
export function sugestoesParaAdicionar<T extends { item: { id: string }; uso: number }>(
  maisUsados: readonly T[],
  itens: readonly ItemOrcamento[],
  tipo: 'servico' | 'produto',
  limite = 6,
): T[] {
  const noOrcamento = new Set(itens.filter(i => i.tipo === tipo && i.catalogoId).map(i => i.catalogoId));
  return maisUsados.filter(s => s.uso > 0 && !noOrcamento.has(s.item.id)).slice(0, Math.max(0, limite));
}

/**
 * "Repetir o último orçamento deste cliente": o que vem do anterior.
 *
 * Vem: os itens (ids novos, com os PREÇOS DAQUELE orçamento — a tela diz isso),
 * o desconto e os textos comerciais que o anterior tinha preenchidos (condições
 * de pagamento, contratuais, garantia).
 * NÃO vem: nada que é daquela visita (laudo, fotos, informações adicionais,
 * datas), nem assinatura, status, número ou validade — o documento novo segue
 * sendo um rascunho de hoje. O cliente continua o do orçamento atual.
 */
export function repetirDoUltimo(
  origem: Pick<Orcamento, 'itens' | 'desconto' | 'descontoTipo' | 'condicoesPagamento' | 'condicoesContratuais' | 'garantia'>,
  gerarId: () => string,
): Partial<Orcamento> {
  const itens = origem.itens.map((i): ItemOrcamento => ({
    ...i,
    id: gerarId(),
    subtotal: centavos(i.preco * i.quantidade),
  }));
  const parcial: Partial<Orcamento> = {
    itens,
    desconto: Number.isFinite(origem.desconto) && origem.desconto > 0 ? origem.desconto : 0,
    descontoTipo: origem.descontoTipo === 'percentual' ? 'percentual' : 'valor',
  };
  if (origem.condicoesPagamento?.trim()) parcial.condicoesPagamento = origem.condicoesPagamento;
  if (origem.condicoesContratuais?.trim()) parcial.condicoesContratuais = origem.condicoesContratuais;
  if (origem.garantia?.trim()) parcial.garantia = origem.garantia;
  return parcial;
}

/**
 * Itens R$ 0,00 que vieram de um orçamento JÁ SALVO e que entram confirmados
 * como cortesia. Só vale para origem FORA de rascunho: o "Rascunho" salva sem
 * passar pela confirmação de cortesia (item do Autopilot sem preço, por exemplo),
 * então item R$ 0,00 de rascunho NÃO vira cortesia sozinho — o técnico informa o
 * preço ou confirma, como em qualquer item novo.
 */
export function idsDeCortesia(
  itens: readonly ItemOrcamento[],
  statusOrigem: Orcamento['status'] | undefined,
): string[] {
  if (!statusOrigem || statusOrigem === 'rascunho') return [];
  return itens.filter(i => i.preco <= 0).map(i => i.id);
}

/** Carga do atalho "Repetir o último orçamento" em 3 estados (erro nunca vira "não tem"). */
export type EstadoUltimoOrcamento =
  | { estado: 'carregando' }
  | { estado: 'erro' }
  | { estado: 'pronto'; orcamento: Orcamento | null };
