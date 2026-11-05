/**
 * Textos da escolha de layout do documento (Conta → Modelos de documento).
 *
 * Cada frase descreve o que o CSS do PDF faz de verdade
 * (`src/utils/pdfGenerator.ts` → cssModelos, `src/utils/reciboPdf.ts`).
 * Não promete conversão, prazo nem efeito jurídico: o modelo só muda o visual.
 * Cliente, itens, preços e condições ficam iguais. O documento já enviado
 * guarda a cópia do modelo daquele dia.
 */
import type { VerticalId } from '../services/verticais.ts';
import type { ModeloPdfId, ModeloReciboId } from '../types/index.ts';

export type EsquemaLayout =
  | 'editorial'
  | 'capa'
  | 'limpo'
  | 'cabecalho'
  | 'classico'
  | 'faixa'
  | 'compacto';

export interface ModeloLayout<Id extends string> {
  id: Id;
  nome: string;
  /** Uma linha: o que muda no papel. */
  resumo: string;
  /** Quando faz sentido escolher, em linguagem de quem está no serviço. */
  quandoUsar: string;
  color: string;
  /** Nome do ícone MaterialCommunityIcons. O cartão mostra o esquema, não só o ícone. */
  icon: string;
  esquema: EsquemaLayout;
}

export const TEXTO_LAYOUT_SO_VISUAL =
  'Isto muda só como o documento fica para o seu cliente. Cliente, itens, preços e condições não mudam. O orçamento já enviado guarda o modelo daquele dia.';

export const TEXTO_RECIBO_SO_VISUAL =
  'Isto muda só o visual do recibo. Valor, data e forma de pagamento continuam os mesmos.';

export const TEXTO_PREVIA_EXEMPLO =
  'A miniatura é um esquema. Ver como fica abre o documento de exemplo, com nome fictício. Nada é enviado ao cliente.';

export const MODELOS_ORCAMENTO: readonly ModeloLayout<ModeloPdfId>[] = [
  {
    id: 'editorial',
    nome: 'Editorial',
    resumo: 'Faixa fina na lateral e marca d\'água com a cor da empresa.',
    quandoUsar: 'Use no dia a dia, quando quiser a cara da empresa no papel sem página extra.',
    color: '#0B6FCE',
    icon: 'file-document-edit-outline',
    esquema: 'editorial',
  },
  {
    id: 'premium_capa',
    nome: 'Premium com capa',
    resumo: 'A primeira folha é uma capa com a logo (ou o nome) e o orçamento vem depois.',
    quandoUsar: 'Use em serviço grande, quando a primeira página deve apresentar a empresa e o cliente. A marca d\'água sai, porque a capa já carrega a marca.',
    color: '#0A2547',
    icon: 'book-open-page-variant-outline',
    esquema: 'capa',
  },
  {
    id: 'minimalista',
    nome: 'Minimalista',
    resumo: 'Sem marca d\'água, sem faixa e sem depoimentos. Fotos menores.',
    quandoUsar: 'Use quando o cliente pediu só os números, numa folha limpa.',
    color: '#64748B',
    icon: 'file-document-outline',
    esquema: 'limpo',
  },
  {
    id: 'bold',
    nome: 'Bold',
    resumo: 'Cabeçalho inteiro na cor da empresa e o total no mesmo bloco colorido.',
    quandoUsar: 'Use quando a marca precisa aparecer de longe, no topo da folha.',
    color: '#19D3E6',
    icon: 'view-dashboard-outline',
    esquema: 'cabecalho',
  },
  {
    id: 'classico',
    nome: 'Clássico',
    resumo: 'Letra de documento, borda dupla e cabeçalho centralizado. Sem marca d\'água.',
    quandoUsar: 'Use quando o papel precisa parecer formal, como vistoria ou certificado.',
    color: '#8B5E34',
    icon: 'script-text-outline',
    esquema: 'classico',
  },
  {
    id: 'faixa_lateral',
    nome: 'Faixa lateral',
    resumo: 'Uma faixa colorida na esquerda com o nome da empresa e o número, na vertical.',
    quandoUsar: 'Use em relatório de campo, quando o papel fica numa pilha e a empresa precisa ser achada pela lateral.',
    color: '#0E7C66',
    icon: 'page-layout-sidebar-left',
    esquema: 'faixa',
  },
  {
    id: 'recibo_compacto',
    nome: 'Recibo compacto',
    resumo: 'O mesmo orçamento, com menos espaço entre os blocos e título menor.',
    quandoUsar: 'Use em serviço pequeno, para caber em menos papel. Não é o recibo de pagamento — esse tem a seção própria abaixo.',
    color: '#B4451F',
    icon: 'receipt-text-outline',
    esquema: 'compacto',
  },
];

export const MODELOS_RECIBO: readonly ModeloLayout<ModeloReciboId>[] = [
  {
    id: 'classico',
    nome: 'Clássico',
    resumo: 'Título centralizado e blocos com folga.',
    quandoUsar: 'Use no recibo do dia a dia, quando há espaço de sobra na folha.',
    color: '#0B6FCE',
    icon: 'receipt-text-outline',
    esquema: 'classico',
  },
  {
    id: 'compacto',
    nome: 'Compacto',
    resumo: 'Margem menor e título mais baixo.',
    quandoUsar: 'Use quando o recibo é curto e você quer gastar menos papel.',
    color: '#64748B',
    icon: 'receipt-text-check-outline',
    esquema: 'compacto',
  },
  {
    id: 'faixa',
    nome: 'Faixa de marca',
    resumo: 'Uma faixa colorida no topo, com a cor da empresa.',
    quandoUsar: 'Use quando o recibo precisa mostrar a marca antes do valor.',
    color: '#0E7C66',
    icon: 'card-text-outline',
    esquema: 'faixa',
  },
];

/**
 * Sugestão de visual por ofício. É dica, não regra: o prestador escolhe outro.
 * O rótulo tem de ser o mesmo de `verticalPorId` — o teste prende os dois.
 * Ofício sem entrada aqui não ganha selo (não inventamos sugestão).
 */
const SUGESTAO_POR_OFICIO: Partial<Record<VerticalId, { modeloId: ModeloPdfId; oficio: string }>> = {
  refrigeracao: { modeloId: 'faixa_lateral', oficio: 'Refrigeração e Climatização' },
  eletrica: { modeloId: 'faixa_lateral', oficio: 'Elétrica' },
  hidraulica: { modeloId: 'faixa_lateral', oficio: 'Hidráulica' },
  extintores: { modeloId: 'classico', oficio: 'Extintores e Prevenção de Incêndio' },
  dedetizacao: { modeloId: 'classico', oficio: 'Dedetização e Controle de Pragas' },
  caixa_dagua: { modeloId: 'classico', oficio: "Limpeza de Caixa d'Água" },
  pintura: { modeloId: 'recibo_compacto', oficio: 'Pintura e Acabamento' },
  jardinagem: { modeloId: 'recibo_compacto', oficio: 'Jardinagem e Paisagismo' },
};

export function sugestaoParaOficio(
  ids: readonly string[] | null | undefined,
): { modeloId: ModeloPdfId; oficio: string } | null {
  if (!ids?.length) return null;
  for (const id of ids) {
    if (!Object.hasOwn(SUGESTAO_POR_OFICIO, id)) continue;
    return SUGESTAO_POR_OFICIO[id as VerticalId] ?? null;
  }
  return null;
}
