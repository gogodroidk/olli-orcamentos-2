/**
 * TypeScript interfaces matching the Supabase schema for OLLI Orçamentos.
 *
 * Two layers are modelled:
 *  1. Row types — the literal columns of each table (see CLAUDE.md schema).
 *  2. `dados` jsonb payloads — the full domain objects the mobile app stores
 *     (Orcamento / Recibo / Empresa / ModeloOrcamento). These mirror
 *     `src/types/index.ts` in the mobile app so both clients stay compatible.
 *
 * `id` columns are TEXT (client-generated UUID strings). On insert, `user_id`
 * is filled server-side by RLS default (auth.uid()) — never send it.
 */

// ─── Status ────────────────────────────────────────────────────────────────
export type StatusOrcamento =
  | 'rascunho'
  | 'enviado'
  | 'aguardando_assinatura'
  | 'aprovado'
  | 'recusado'
  | 'cancelado';

export const STATUS_ORCAMENTO: StatusOrcamento[] = [
  'rascunho',
  'enviado',
  'aguardando_assinatura',
  'aprovado',
  'recusado',
  'cancelado',
];

export const STATUS_LABELS: Record<StatusOrcamento, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aguardando_assinatura: 'Aguardando assinatura',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
};

export const STATUS_COLORS: Record<StatusOrcamento, string> = {
  rascunho: '#9CA3AF',
  enviado: '#3B82F6',
  aguardando_assinatura: '#F59E0B',
  aprovado: '#10B981',
  recusado: '#EF4444',
  cancelado: '#6B7280',
};

// ─── Shared domain pieces (live inside `dados` jsonb) ────────────────────────
export interface ItemOrcamento {
  id: string;
  tipo: 'servico' | 'produto';
  catalogoId: string;
  nome: string;
  descricao?: string;
  preco: number;
  quantidade: number;
  unidade: string;
  fotoUri?: string;
  subtotal: number;
}

export interface FormaPagamento {
  credito: boolean;
  debito: boolean;
  dinheiro: boolean;
  pix: boolean;
}

// ─── empresa ─────────────────────────────────────────────────────────────────
/** Full company profile stored in empresa.dados (jsonb). */
export interface EmpresaDados {
  id?: string;
  nome: string;
  especialidade: string;
  slogan: string;
  cnpj: string;
  cpf: string;
  endereco: string;
  cidade: string;
  estado: string;
  telefone: string;
  whatsapp: string;
  site: string;
  email: string;
  chavePix: string;
  normas: string;
  logoUri?: string;
  assinaturaUri?: string;
  nomePrestador: string;
}

export interface EmpresaRow {
  user_id: string;
  dados: EmpresaDados | null;
  atualizado_em: string | null;
}

// ─── clientes ────────────────────────────────────────────────────────────────
export interface ClienteRow {
  id: string;
  user_id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  cnpj: string | null;
  endereco: string | null;
  complemento: string | null;
  estado: string | null;
  cidade: string | null;
  cep: string | null;
  criado_em: string | null;
}

// ─── servicos ────────────────────────────────────────────────────────────────
export interface ServicoRow {
  id: string;
  user_id: string;
  nome: string;
  descricao: string | null;
  preco: number | null;
  custo: number | null;
  unidade: string | null;
  foto_uri: string | null;
  criado_em: string | null;
}

// ─── produtos ────────────────────────────────────────────────────────────────
export interface ProdutoRow {
  id: string;
  user_id: string;
  nome: string;
  descricao: string | null;
  preco: number | null;
  custo: number | null;
  marca: string | null;
  modelo: string | null;
  unidade: string | null;
  foto_uri: string | null;
  criado_em: string | null;
}

// ─── orcamentos ──────────────────────────────────────────────────────────────
/** Full Orcamento stored in orcamentos.dados (jsonb). Mirrors the mobile app. */
export interface OrcamentoDados {
  id: string;
  numero: string;
  clienteId: string;
  clienteNome: string;
  clienteTelefone: string;
  clienteCpfCnpj?: string;
  clienteEndereco?: string;
  itens: ItemOrcamento[];
  subtotalServicos: number;
  subtotalProdutos: number;
  subtotal: number;
  desconto: number;
  descontoTipo: 'valor' | 'percentual';
  valorTotal: number;
  status: StatusOrcamento;

  // Detalhes
  laudoTecnico?: string;
  dataEmissao: string;
  dataVisitaTecnica?: string;
  dataPrestacaoServico?: string;
  agendamentoServico?: string;
  condicoesContratuais?: string;
  garantia?: string;
  informacoesAdicionais?: string;

  // Pagamento
  formasPagamento: FormaPagamento;
  chavePix?: string;
  condicoesPagamento?: string;
  sinalPercentual?: number;
  sinalValor?: number;
  sinalData?: string;

  // Personalização
  fotosServico?: string[];
  exibirAssinatura: boolean;
  solicitarAssinaturaCliente: boolean;
  assinaturaPrestadorUri?: string;
  assinaturaClienteUri?: string;
  dataAssinaturaCliente?: string;
  validadeOrcamento?: string;
  exibirAprovacao: boolean;
  exibirRecusa: boolean;

  // Modelo
  modeloNome?: string;
  criadoDeModeloId?: string;

  criadoEm: string;
  atualizadoEm: string;
}

export interface OrcamentoRow {
  id: string;
  user_id: string;
  numero: string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  status: StatusOrcamento;
  subtotal: number | null;
  desconto: number | null;
  valor_total: number | null;
  data_emissao: string | null;
  dados: OrcamentoDados | null;
  criado_em: string | null;
  atualizado_em: string | null;
}

// ─── recibos ─────────────────────────────────────────────────────────────────
/** Full Recibo stored in recibos.dados (jsonb). Mirrors the mobile app. */
export interface ReciboDados {
  id: string;
  numero: string;
  orcamentoId?: string;
  orcamentoNumero?: string;
  clienteId: string;
  clienteNome: string;
  clienteTelefone: string;
  itens: ItemOrcamento[];
  valorRecebido: number;
  formaPagamento: string;
  dataRecebimento: string;
  exibirAssinatura: boolean;
  assinaturaPrestadorUri?: string;
  criadoEm: string;
}

export interface ReciboRow {
  id: string;
  user_id: string;
  numero: string | null;
  orcamento_id: string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  valor_recebido: number | null;
  forma_pagamento: string | null;
  data_recebimento: string | null;
  dados: ReciboDados | null;
  criado_em: string | null;
}

// ─── modelos ─────────────────────────────────────────────────────────────────
/** orcamentoBase stored in modelos.dados (jsonb). */
export interface ModeloDados {
  orcamentoBase: Partial<OrcamentoDados>;
}

export interface ModeloRow {
  id: string;
  user_id: string;
  nome: string;
  descricao: string | null;
  dados: ModeloDados | null;
  criado_em: string | null;
}

// ─── depoimentos ─────────────────────────────────────────────────────────────
export interface DepoimentoRow {
  id: string;
  user_id: string;
  nome_cliente: string;
  estrelas: number;
  texto: string | null;
  criado_em: string | null;
}

// ─── contadores ──────────────────────────────────────────────────────────────
export interface ContadorRow {
  user_id: string;
  chave: string;
  valor: number;
}

// ─── Insert/Update payloads ──────────────────────────────────────────────────
// On insert we omit user_id (RLS default = auth.uid()) and always provide the
// client-generated TEXT id. These helpers describe the writable shape per table.
export type ClienteInput = Omit<ClienteRow, 'user_id'>;
export type ServicoInput = Omit<ServicoRow, 'user_id'>;
export type ProdutoInput = Omit<ProdutoRow, 'user_id'>;
export type OrcamentoInput = Omit<OrcamentoRow, 'user_id'>;
export type ReciboInput = Omit<ReciboRow, 'user_id'>;
export type ModeloInput = Omit<ModeloRow, 'user_id'>;
export type DepoimentoInput = Omit<DepoimentoRow, 'user_id'>;
export type EmpresaInput = Omit<EmpresaRow, 'user_id'>;
export type ContadorInput = Omit<ContadorRow, 'user_id'>;
