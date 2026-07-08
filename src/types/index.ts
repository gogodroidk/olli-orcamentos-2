/**
 * Status do orçamento ao longo do ciclo comercial (mestre 13/35).
 *
 * COMPAT: os 6 status originais (rascunho/enviado/aguardando_assinatura/
 * aprovado/recusado/cancelado) permanecem com o MESMO id — nenhum dado antigo
 * quebra. Os 4 novos (visualizado/em_negociacao/expirado/convertido) enriquecem
 * a trilha do cliente e o pós-venda:
 *  - visualizado: o cliente ABRIU o link público (trilha vinda do worker).
 *  - em_negociacao: houve conversa/ajuste após o envio (movido à mão pelo dono).
 *  - expirado: passou da validade sem resposta.
 *  - convertido: virou serviço fechado/recibo emitido (pós-aprovação).
 * A ORDEM abaixo é a ordem lógica do funil e alimenta a lista de ações de status.
 */
export type StatusOrcamento =
  | 'rascunho'
  | 'enviado'
  | 'visualizado'
  | 'em_negociacao'
  | 'aguardando_assinatura'
  | 'aprovado'
  | 'recusado'
  | 'expirado'
  | 'cancelado'
  | 'convertido';

export const STATUS_LABELS: Record<StatusOrcamento, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  visualizado: 'Visualizado',
  em_negociacao: 'Em negociação',
  aguardando_assinatura: 'Aguardando assinatura',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  expirado: 'Expirado',
  cancelado: 'Cancelado',
  convertido: 'Convertido',
};

export const STATUS_COLORS: Record<StatusOrcamento, string> = {
  rascunho: '#9CA3AF',
  enviado: '#3B82F6',
  visualizado: '#8B5CF6',
  em_negociacao: '#F59E0B',
  aguardando_assinatura: '#F59E0B',
  aprovado: '#10B981',
  recusado: '#EF4444',
  expirado: '#A16207',
  cancelado: '#6B7280',
  convertido: '#0EA5E9',
};

/**
 * Status que representam uma PROPOSTA JÁ ENVIADA ao cliente (mestre 13.5). Editar
 * um orçamento nestes estados NÃO pode sobrescrever silenciosamente o que o
 * cliente já viu: o `saveOrcamento` grava uma VERSÃO (snapshot) antes. Fonte única
 * da verdade, usada pelo app e por qualquer tela de edição (dentro ou fora do
 * escopo desta frente) para não divergir a regra.
 */
export const STATUS_PROPOSTA_ENVIADA: readonly StatusOrcamento[] = [
  'enviado',
  'visualizado',
  'em_negociacao',
  'aguardando_assinatura',
];

/** True se o status indica uma proposta que o cliente já pode ter visto. */
export function propostaJaEnviada(status: StatusOrcamento): boolean {
  return STATUS_PROPOSTA_ENVIADA.includes(status);
}

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

  // Personalização — padrões usados para pré-preencher novos orçamentos e
  // documentos (o.corMarca segue prevalecendo por orçamento; aqui é só o
  // valor inicial sugerido). Tudo opcional: schema-less no SQLite (id + data
  // JSON), então adicionar estes campos não exige nenhuma migração.
  corMarca?: string;
  validadeDiasPadrao?: number;
  garantiaPadrao?: string;
  condicoesPagamentoPadrao?: string;
  observacoesPadrao?: string;
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

export type ModeloPdfId =
  | 'editorial'
  | 'minimalista'
  | 'bold'
  | 'classico'
  | 'faixa_lateral'
  | 'recibo_compacto'
  | 'premium_capa';

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
  corMarca?: string;

  // Modelo
  modeloPdf?: ModeloPdfId;
  modeloNome?: string;
  criadoDeModeloId?: string;

  criadoEm: string;
  atualizadoEm: string;
}

/**
 * VERSÃO (snapshot) de um orçamento — mestre 13.5. Cada vez que uma proposta JÁ
 * ENVIADA é editada, congelamos o estado ANTERIOR aqui antes de sobrescrever, para
 * nunca "sumir" com o que o cliente já viu. `dados` guarda o Orcamento completo no
 * momento do snapshot (mesmo padrão jsonb das demais tabelas). `numeroVersao` é
 * sequencial por orçamento (1, 2, 3…). É histórico append-only: nunca se edita.
 */
export interface OrcamentoVersao {
  id: string;
  orcamentoId: string;
  numeroVersao: number;
  /** Snapshot íntegro do orçamento no momento em que esta versão foi congelada. */
  dados: Orcamento;
  criadoEm: string;
}

/**
 * Um EVENTO da trilha do cliente no link público (mestre 13): o que o cliente fez
 * com a proposta. Derivado da tabela `orcamentos_publicos` (visualizado/respondido)
 * — não é uma tabela própria, é a leitura normalizada que o app monta para exibir
 * a linha do tempo. `motivo` só existe em recusa (resposta_cliente do worker).
 */
export type TipoEventoTrilha = 'enviado' | 'visualizado' | 'aprovado' | 'recusado';

export interface EventoTrilhaCliente {
  tipo: TipoEventoTrilha;
  /** ISO do momento do evento (quando conhecido). */
  em?: string;
  /** Mensagem/motivo do cliente (ex.: motivo da recusa). Nunca contém dado sensível. */
  motivo?: string;
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
  // Ciclo comercial (Onda 3): true assim que o PDF do recibo é gerado/compartilhado
  // pelo menos uma vez. `false`/ausente = pagamento registrado mas o PDF do recibo
  // ainda não foi emitido para o cliente (registro rápido de "Registrar pagamento").
  // Campo opcional e aditivo — nenhuma migração necessária (linha vive no blob JSON).
  pdfEmitido?: boolean;
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

// ─── ORDENS DE SERVIÇO (Onda 4 — OS mínima + app do técnico) ─────────────────
/**
 * Status da Ordem de Serviço ao longo da execução. `aberta` (criada, sem data) →
 * `agendada` (tem data/técnico) → `em_execucao` → `pausada` (interrompida) →
 * `concluida`/`cancelada` (terminais). A ORDEM abaixo é a ordem lógica do fluxo.
 * COMPAT com a coluna `status` (check) de public.ordens_servico — mesmos 6 ids.
 */
export type StatusOS =
  | 'aberta'
  | 'agendada'
  | 'em_execucao'
  | 'pausada'
  | 'concluida'
  | 'cancelada';

/** Um item do checklist de execução da OS (passo a marcar em campo). */
export interface ItemChecklist {
  id: string;
  texto: string;
  feito: boolean;
}

/**
 * Uma Ordem de Serviço executável. Nasce de um orçamento APROVADO (`orcamentoId`
 * copia cliente/título/valor) ou é criada à mão. Offline-first: gravada no SQLite
 * local e espelhada em public.ordens_servico (jsonb checklist/fotos na nuvem).
 * `tecnicoId` é a ATRIBUIÇÃO (quem executa), não o dono da linha — os dados
 * continuam do owner (multi-tenant por camada de acesso).
 */
export interface OrdemServico {
  id: string;
  numero: string;
  /** Origem: id do orçamento aprovado que gerou esta OS (ausente em OS avulsa). */
  orcamentoId?: string;
  clienteId?: string;
  clienteNome: string;
  titulo: string;
  descricao?: string;
  status: StatusOS;
  /** Técnico atribuído (quem executa). Ausente enquanto ninguém foi designado. */
  tecnicoId?: string;
  tecnicoNome?: string;
  dataAgendada?: string; // ISO datetime
  checklist: ItemChecklist[];
  fotos: string[];
  observacoes?: string;
  valor?: number;
  criadoEm: string;
  atualizadoEm: string;
}

export const STATUS_OS_LABELS: Record<StatusOS, string> = {
  aberta: 'Aberta',
  agendada: 'Agendada',
  em_execucao: 'Em execução',
  pausada: 'Pausada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const STATUS_OS_CORES: Record<StatusOS, string> = {
  aberta: '#9CA3AF',
  agendada: '#3B82F6',
  em_execucao: '#F59E0B',
  pausada: '#A78BFA',
  concluida: '#10B981',
  cancelada: '#6B7280',
};
