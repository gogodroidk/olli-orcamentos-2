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

/**
 * Segmento do negócio. O núcleo do OLLI (orçamento/cliente/agenda/OS/link/cobrança)
 * é genérico para qualquer prestador — o lançamento é vertical (ar-condicionado),
 * mas nada no código do orçamento fica amarrado a HVAC. Etapa 0.1 do PROCESSO.
 */
export type Segmento =
  | 'ar-condicionado'
  | 'eletrica'
  | 'hidraulica'
  | 'pintura'
  | 'outro';

export const SEGMENTOS: { id: Segmento; label: string; icon: string }[] = [
  { id: 'ar-condicionado', label: 'Ar-condicionado', icon: 'air-conditioner' },
  { id: 'eletrica', label: 'Elétrica', icon: 'flash' },
  { id: 'hidraulica', label: 'Hidráulica', icon: 'water-pump' },
  { id: 'pintura', label: 'Pintura', icon: 'format-paint' },
  { id: 'outro', label: 'Outro', icon: 'dots-horizontal' },
];

export interface Empresa {
  id: string;
  nome: string;
  segmento?: Segmento;
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

// ─── AGENDA (Fase 2 — agendamentos/visitas) ──────────────────
export type TipoAgendamento =
  | 'orcamento'
  | 'limpeza'
  | 'instalacao'
  | 'manutencao'
  | 'visita'
  | 'outro';

export type StatusAgendamento = 'agendado' | 'concluido' | 'cancelado';

/**
 * Um compromisso na agenda do prestador (visita, instalação, manutenção…).
 * Offline-first: gravado no SQLite local e espelhado no backup Supabase.
 */
export interface Agendamento {
  id: string;
  clienteId?: string;
  clienteNome: string;
  titulo: string;
  tipo: TipoAgendamento;
  inicio: string; // ISO datetime
  fim?: string;   // ISO datetime
  endereco?: string;
  status: StatusAgendamento;
  orcamentoId?: string;
  observacao?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export const TIPOS_AGENDAMENTO: { id: TipoAgendamento; label: string; icon: string; color: string }[] = [
  { id: 'orcamento', label: 'Orçamento', icon: 'file-document-outline', color: '#34C6D9' },
  { id: 'limpeza', label: 'Limpeza', icon: 'spray-bottle', color: '#2BD787' },
  { id: 'instalacao', label: 'Instalação', icon: 'tools', color: '#0B6FCE' },
  { id: 'manutencao', label: 'Manutenção', icon: 'wrench-outline', color: '#F7B23B' },
  { id: 'visita', label: 'Visita', icon: 'map-marker-radius-outline', color: '#A78BFA' },
  { id: 'outro', label: 'Outro', icon: 'calendar-blank-outline', color: 'rgba(226,232,240,0.62)' },
];

export const TIPO_AGENDAMENTO_LABELS: Record<TipoAgendamento, string> = {
  orcamento: 'Orçamento',
  limpeza: 'Limpeza',
  instalacao: 'Instalação',
  manutencao: 'Manutenção',
  visita: 'Visita',
  outro: 'Outro',
};

export const TIPO_AGENDAMENTO_COLORS: Record<TipoAgendamento, string> = {
  orcamento: '#34C6D9',
  limpeza: '#2BD787',
  instalacao: '#0B6FCE',
  manutencao: '#F7B23B',
  visita: '#A78BFA',
  outro: 'rgba(226,232,240,0.62)',
};

export const STATUS_AGENDAMENTO_LABELS: Record<StatusAgendamento, string> = {
  agendado: 'Agendado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

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

// ─── CÓDIGOS DE ERRO (Etapa 1 — o anzol) ─────────────────────
/**
 * Um código de falha de ar-condicionado. Espelha o schema da planilha do Igor
 * (aba MODELO_DADOS_APP) e do asset `assets/codigos_erro.json` (602 registros).
 * `severidade`: Info | Média | Alta. `confianca`: Alta | Média | Média/Alta | Baixa.
 */
export interface CodigoErro {
  id: number;
  marca: string;
  familia: string;
  tipo: string;
  codigo: string;
  exibicao: string;
  falha: string;
  catBruta: string;
  catApp: string;
  severidade: string;
  causa: string;
  acao: string;
  confianca: string;
  fonteId: string;
  url: string;
  obs: string;
}

/**
 * Caso reportado pelo técnico quando "não achei meu erro" — alimenta o
 * enriquecimento da base. Etapa 1.6 do PROCESSO.
 */
export interface CasoErro {
  id: string;
  marca?: string;
  modelo?: string;
  codigo?: string;
  sintoma?: string;
  criadoEm: string;
}

// ─── DIAGNÓSTICO POR IA (Etapa 2 — a OLLI Técnica) ───────────
export interface DiagnosticoInput {
  marca?: string;
  modelo?: string;
  codigo?: string;
  sintoma?: string;
}

/** Resposta estruturada da OLLI Técnica (formato do briefing do Igor). */
export interface DiagnosticoIA {
  resumo: string;
  significadoProvavel: string;
  causasComuns: string[];
  testesEmOrdem: string[];
  pecasSuspeitas: string[];
  naoFacaAinda: string[];
  nivelConfianca: string; // Alta | Média | Baixa
  confiancaJustificativa?: string;
  mensagemCliente: string;
  sugestaoOrcamento: string;
  fontes: string[];
}

/** De onde veio o diagnóstico: cache local/nuvem, IA ao vivo, ou a base offline. */
export interface DiagnosticoResultado {
  fonte: 'ia' | 'cache' | 'base';
  modelo?: string;
  diagnostico: DiagnosticoIA;
  aviso?: string;
}
