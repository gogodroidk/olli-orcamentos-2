export type StatusOrcamento =
  | 'rascunho'
  | 'enviado'
  | 'aguardando_assinatura'
  | 'aprovado'
  | 'recusado'
  | 'cancelado';

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

export interface Empresa {
  id: string;
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

export interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  cpf?: string;
  cnpj?: string;
  endereco?: string;
  complemento?: string;
  estado?: string;
  cidade?: string;
  cep?: string;
  criadoEm: string;
}

export interface ServicoItem {
  id: string;
  nome: string;
  descricao?: string;
  preco: number;
  custo?: number;
  unidade: string;
  fotoUri?: string;
  criadoEm: string;
}

export interface ProdutoItem {
  id: string;
  nome: string;
  descricao?: string;
  preco: number;
  custo?: number;
  marca?: string;
  modelo?: string;
  unidade: string;
  fotoUri?: string;
  criadoEm: string;
}

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

export interface Orcamento {
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

export interface Recibo {
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

export interface ModeloOrcamento {
  id: string;
  nome: string;
  descricao?: string;
  orcamentoBase: Partial<Orcamento>;
  criadoEm: string;
}

export interface Depoimento {
  id: string;
  nomeCliente: string;
  estrelas: number;
  texto?: string;
  criadoEm: string;
}

export type UnidadeMedida =
  | 'un'
  | 'm'
  | 'm²'
  | 'm³'
  | 'kg'
  | 'L'
  | 'h'
  | 'dia'
  | 'pç'
  | 'cx';

export const UNIDADES: UnidadeMedida[] = ['un', 'm', 'm²', 'm³', 'kg', 'L', 'h', 'dia', 'pç', 'cx'];

export const FORMAS_PAGAMENTO_LABELS = {
  credito: 'Crédito',
  debito: 'Débito',
  dinheiro: 'Dinheiro',
  pix: 'PIX',
};
