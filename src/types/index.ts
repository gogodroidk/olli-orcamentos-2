import type { VerticalId, FerramentaId } from '../services/verticais';

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

/**
 * Cláusulas padrão do contrato de prestação de serviço (persistidas na Empresa).
 * Vive aqui, e não em utils/contratoPdf.ts, para o tipo não depender do gerador
 * de PDF — `Empresa` é lida por banco, sync e telas que nada têm com documento.
 *
 * Percentuais são NÚMEROS (2 = 2%). Vazio/ausente = usar o default do app; um
 * valor corrompido também cai no default em vez de imprimir "NaN%" no contrato.
 */
export interface ContratoPadrao {
  garantia?: string;
  multaAtrasoPercent?: number;
  jurosMesPercent?: number;
  avisoPrevioDias?: number;
  foro?: string;
  obrigacoesContratada?: string;
  obrigacoesContratante?: string;
  clausulasExtras?: string;
}

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

  // OFÍCIO (personalização por vertical — F1 do docs/SISTEMA_SUPERIOR.md): deduzido do
  // CNAE no onboarding, editável em "Meu ofício". VAZIO/AUSENTE = fluxo genérico (o mesmo
  // de hoje — usuário existente não perde nada; o gate só ESCONDE p/ quem escolheu outra
  // vertical). Ver src/services/verticais.ts (empresaMostraVertical / ferramentasSugeridas).
  verticais?: VerticalId[];
  ferramentasAtivas?: FerramentaId[];

  // Personalização — padrões usados para pré-preencher novos orçamentos e
  // documentos (o.corMarca segue prevalecendo por orçamento; aqui é só o
  // valor inicial sugerido). Tudo opcional: schema-less no SQLite (id + data
  // JSON), então adicionar estes campos não exige nenhuma migração.
  corMarca?: string;
  validadeDiasPadrao?: number;
  garantiaPadrao?: string;
  condicoesPagamentoPadrao?: string;
  observacoesPadrao?: string;

  // DEDETIZAÇÃO (RDC 52/2009 art. 19 · RDC 622/2022) — dados de compliance da
  // imunizadora usados no Certificado ANVISA. Preenchidos 1x (na 1ª emissão) e
  // reaproveitados. Schema-less (SQLite id + JSON) → sem migração. Ver
  // src/utils/certificadoAnvisaPdf.ts e CertificadoAnvisaScreen.
  licencaSanitaria?: string;
  licencaAmbiental?: string;
  responsavelTecnico?: string;
  responsavelTecnicoRegistro?: string;
  /**
   * Cláusulas padrão do CONTRATO de prestação de serviço, ajustadas uma vez em
   * Conta → Modelos de documento e reaproveitadas em todo contrato novo. Tudo
   * opcional: o que estiver vazio cai no default do app (ver
   * src/utils/contratoPdf.ts → termosPadraoContrato). Schema-less no SQLite
   * (id + data JSON) → nenhuma migração.
   */
  contratoPadrao?: ContratoPadrao;
  /** Modelo de PDF padrão para orçamentos novos (escolhido em Conta → Modelos de documento). */
  modeloPdfPadrao?: ModeloPdfId;
  /** Modelo padrão do recibo (escolhido em Conta → Modelos de documento). */
  modeloReciboPadrao?: ModeloReciboId;
  /**
   * Link "Escrever avaliação" do perfil da empresa no Google (Maps/Perfil da
   * Empresa) — cadastrado em Meu Negócio. Habilita o botão "Pedir avaliação"
   * no recibo/relatório pós-serviço (mestre 1.4): SEM API do Google Business,
   * é só o texto do link embutido numa mensagem de WhatsApp via `abrirWhatsApp`.
   */
  linkGoogleAvaliacoes?: string;
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
  /** LIXEIRA (Frente 1): ISO do momento em que foi excluido (soft delete). Ausente/undefined = ATIVO. */
  excluidoEm?: string;
  /**
   * RELÓGIO DE SYNC: ISO da última escrita. Quem carimba é o BANCO (as `save*`,
   * `delete*` e `restaurar*` de database.ts), nunca a UI — daí ser opcional aqui.
   * O cloudSync usa este campo para decidir quem vence um conflito. Sem ele, um
   * pull de linha ativa apagava um soft delete feito offline (ressurreição do
   * item excluído). Ver migration 20260714_atualizado_em.sql.
   */
  atualizadoEm?: string;
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
  /** LIXEIRA (Frente 1): ISO do soft delete. Ausente = ATIVO. */
  excluidoEm?: string;
  /** RELÓGIO DE SYNC: ISO da última escrita, carimbado pelo banco. Ver `Cliente.atualizadoEm`. */
  atualizadoEm?: string;
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
  /** LIXEIRA (Frente 1): ISO do soft delete. Ausente = ATIVO. */
  excluidoEm?: string;
  /** RELÓGIO DE SYNC: ISO da última escrita, carimbado pelo banco. Ver `Cliente.atualizadoEm`. */
  atualizadoEm?: string;
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

/** Estilos de PDF do RECIBO (documento próprio, mais simples que o orçamento). */
export type ModeloReciboId =
  | 'classico'   // limpo e centrado (padrão)
  | 'compacto'   // folha menor, espaçamento reduzido
  | 'faixa';     // faixa de marca no topo, mais destaque visual

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
  /**
   * Assinatura do cliente NO CONTRATO de prestação de serviço — campo próprio,
   * separado de `assinaturaClienteUri` de propósito. Aquela é o aceite da
   * PROPOSTA; esta é a assinatura de um documento diferente, com outro texto e
   * outra data. Guardar as duas no mesmo campo faria a assinatura do contrato
   * aparecer no PDF do orçamento (e vice-versa) — o app diria que o cliente
   * assinou algo que ele não viu. Aditivos e opcionais: vivem no blob JSON.
   */
  assinaturaContratoUri?: string;
  dataAssinaturaContrato?: string;
  validadeOrcamento?: string;
  exibirAprovacao: boolean;
  exibirRecusa: boolean;
  corMarca?: string;

  // Modelo
  modeloPdf?: ModeloPdfId;
  modeloNome?: string;
  criadoDeModeloId?: string;

  // Capa do documento (Onda 7 — orçamento/PDF elegante). Define como o PDF
  // COMEÇA: só a logo (padrão), uma foto de capa escolhida, ou sem capa nenhuma.
  // `capaFotoUri` só é usado quando `capaEstilo === 'foto'` (a foto que abre o
  // documento — normalmente uma das fotosServico já anexadas). Ambos opcionais e
  // aditivos: schema-less no SQLite (id + data JSON), sem migração.
  capaEstilo?: 'logo' | 'foto' | 'nenhuma';
  capaFotoUri?: string;

  criadoEm: string;
  atualizadoEm: string;
  /** LIXEIRA (Frente 1): ISO do soft delete. Ausente = ATIVO. Vive no blob JSON. */
  excluidoEm?: string;
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
  /** LIXEIRA (Frente 1): ISO do soft delete. Ausente = ATIVO. Vive no blob JSON. */
  excluidoEm?: string;
  /** RELÓGIO DE SYNC: ISO da última escrita, carimbado pelo banco. Vive no blob JSON
   *  e é espelhado na coluna `atualizado_em` da nuvem. Ver `Cliente.atualizadoEm`. */
  atualizadoEm?: string;
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
  /** LIXEIRA (Frente 1): ISO do soft delete. Ausente = ATIVO. */
  excluidoEm?: string;
  /** RELÓGIO DE SYNC: ISO da última escrita, carimbado pelo banco. Ver `Cliente.atualizadoEm`. */
  atualizadoEm?: string;
}

export interface Depoimento {
  id: string;
  nomeCliente: string;
  estrelas: number;
  texto?: string;
  criadoEm: string;
  /** LIXEIRA (Frente 1): ISO do soft delete. Ausente = ATIVO. */
  excluidoEm?: string;
  /** RELÓGIO DE SYNC: ISO da última escrita, carimbado pelo banco. Ver `Cliente.atualizadoEm`. */
  atualizadoEm?: string;
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
  /** LIXEIRA (Frente 1): ISO do soft delete. Ausente = ATIVO. */
  excluidoEm?: string;
}

/**
 * Matizes de CATEGORIA. São DADOS, não cores de texto: `#2BD787` significa "limpeza".
 * Foram escolhidos num app dark-only e medem 1.88:1 a 2.05:1 sobre branco. Quem pinta
 * rótulo ou ícone com eles tem de passar por `corCategoria(matiz, fundo)` — a
 * luminosidade cede contra o fundo real, o matiz (que é o significado) não se move.
 * Como preenchimento translúcido (`cor + '22'`) ou borda, o valor cru continua certo.
 */
export const TIPOS_AGENDAMENTO: { id: TipoAgendamento; label: string; icon: string; color: string }[] = [
  { id: 'orcamento', label: 'Orçamento', icon: 'file-document-outline', color: '#34C6D9' },
  { id: 'limpeza', label: 'Limpeza', icon: 'spray-bottle', color: '#2BD787' },
  { id: 'instalacao', label: 'Instalação', icon: 'tools', color: '#0B6FCE' },
  { id: 'manutencao', label: 'Manutenção', icon: 'wrench-outline', color: '#F7B23B' },
  { id: 'visita', label: 'Visita', icon: 'map-marker-radius-outline', color: '#A78BFA' },
  // Era rgba(226,232,240,0.62) — cinza quase branco, 1.15:1 sobre o fundo claro. Um
  // matiz opaco: `corCategoria` faz o resto em cada modo.
  { id: 'outro', label: 'Outro', icon: 'calendar-blank-outline', color: '#64748B' },
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
  outro: '#64748B',
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
  /** LIXEIRA (Frente 1): ISO do soft delete. Ausente = ATIVO. */
  excluidoEm?: string;
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

// ─── EQUIPAMENTOS / ATIVOS HVAC (PMOC Fase 1 — inventário + etiqueta QR) ──────
/**
 * Situação (ciclo de vida OPERACIONAL) de um equipamento HVAC. Espelha EXATAMENTE
 * o check da coluna `situacao` de public.assets (ver 20260709_pmoc_fundacao.sql):
 * mesmos 9 ids, na mesma ordem lógica de vida do ativo. `ativo` é o default.
 *
 * CAVEAT LEGAL PMOC (inegociável): isto é ESTADO OPERACIONAL do ativo, NUNCA uma
 * declaração de conformidade legal. Um equipamento `ativo` não significa "em
 * conformidade com a norma X" — conformidade depende de plano PMOC vigente,
 * responsável técnico habilitado e periodicidades cumpridas (fases seguintes).
 */
export type SituacaoEquipamento =
  | 'ativo'
  | 'reserva'
  | 'parado'
  | 'em_manutencao'
  | 'interditado'
  | 'desativado'
  | 'retirado'
  | 'substituido'
  | 'descartado';

/** Criticidade operacional do ativo (impacto de uma parada). Opcional na linha. */
export type CriticidadeEquipamento = 'baixa' | 'media' | 'alta' | 'critica';

/**
 * Um equipamento HVAC do inventário PMOC (público.assets local). Offline-first:
 * gravado no SQLite local (tabela `equipamentos`) e espelhado em public.assets
 * (fotos como jsonb array na nuvem, TEXT JSON no local — ver cloudSync).
 *
 * `qrToken` é a IDENTIDADE PÚBLICA OPACA do ativo (o que vai no adesivo/etiqueta):
 * único, aleatório e url-safe (~32 chars). É GERADO PELO BANCO (DEFAULT no INSERT)
 * — o app NUNCA o cria nem o edita; recebe-o no primeiro pull e o preserva/reenvia
 * nos upserts seguintes (ver cloudSync.equipamentoToRow). Numa linha ainda não
 * sincronizada (criada offline, sem token do banco), `qrToken` fica vazio ('') até
 * o próximo pull trazer o token gerado pelo DEFAULT.
 *
 * `qrRevogadoEm` preenchido = o token vigente está revogado (a página pública nega
 * o scan). `situacao` é o estado operacional (ver caveat legal em SituacaoEquipamento).
 */
export interface Equipamento {
  id: string;
  /** Cliente dono do equipamento (id do app; soft ref, sem FK dura). */
  clienteId?: string;
  /** Unidade/local de atendimento (soft ref; fase de locais). */
  localId?: string;
  /** Código do prestador (ex.: "AC-014"). */
  codigoInterno?: string;
  /** Código/patrimônio do cliente. */
  patrimonio?: string;
  fabricante?: string;
  modelo?: string;
  numeroSerie?: string;
  /** Categoria HVAC (ver CATEGORIAS_HVAC). */
  categoria?: string;
  /** Capacidade em BTU/h (nem todo ativo tem). */
  capacidadeBtu?: number;
  /** Tensão como texto livre ('220V', '380V trifásico', …). */
  tensao?: string;
  /** Fluido refrigerante ('R410A', 'R32', …). */
  refrigerante?: string;
  /** Localização textual curta que cabe no adesivo ("Sala 302 - 3º andar"). */
  localizacao?: string;
  situacao: SituacaoEquipamento;
  criticidade?: CriticidadeEquipamento;
  /** Token QR opaco vindo do banco (DEFAULT). O app nunca gera/edita — só preserva. */
  qrToken: string;
  /** Se preenchido, o token vigente está revogado (página pública nega o scan). */
  qrRevogadoEm?: string;
  /** URIs das fotos do ativo (placa/local/etiqueta). jsonb array na nuvem. */
  fotos: string[];
  criadoEm: string;
  atualizadoEm: string;
  /** LIXEIRA (Frente 1): ISO do soft delete. Ausente = ATIVO. */
  excluidoEm?: string;
}

export const STATUS_EQUIP_LABELS: Record<SituacaoEquipamento, string> = {
  ativo: 'Ativo',
  reserva: 'Reserva',
  parado: 'Parado',
  em_manutencao: 'Em manutenção',
  interditado: 'Interditado',
  desativado: 'Desativado',
  retirado: 'Retirado',
  substituido: 'Substituído',
  descartado: 'Descartado',
};

export const STATUS_EQUIP_CORES: Record<SituacaoEquipamento, string> = {
  ativo: '#10B981',
  reserva: '#3B82F6',
  parado: '#9CA3AF',
  em_manutencao: '#F59E0B',
  interditado: '#EF4444',
  desativado: '#6B7280',
  retirado: '#6B7280',
  substituido: '#A78BFA',
  descartado: '#78716C',
};

/** Categoria de equipamento HVAC — ids usados no campo `categoria` do ativo. */
export type CategoriaHvac =
  | 'split'
  | 'multisplit'
  | 'cassete'
  | 'piso_teto'
  | 'janela'
  | 'portatil'
  | 'vrf'
  | 'chiller'
  | 'fancoil'
  | 'camara_frio'
  | 'condensadora'
  | 'outro';

/**
 * Catálogo de categorias HVAC (id + rótulo PT-BR + ícone MaterialCommunityIcons)
 * para os chips/seletor do inventário. `categoria` na linha é texto livre (o banco
 * não restringe), mas o app oferece este conjunto padrão para consistência.
 */
export const CATEGORIAS_HVAC: { id: CategoriaHvac; label: string; icon: string }[] = [
  { id: 'split', label: 'Split', icon: 'air-conditioner' },
  { id: 'multisplit', label: 'Multi-split', icon: 'air-conditioner' },
  { id: 'cassete', label: 'Cassete', icon: 'view-grid-outline' },
  { id: 'piso_teto', label: 'Piso-teto', icon: 'arrow-expand-vertical' },
  { id: 'janela', label: 'Janela', icon: 'window-closed-variant' },
  { id: 'portatil', label: 'Portátil', icon: 'fan' },
  { id: 'vrf', label: 'VRF/VRV', icon: 'sitemap-outline' },
  { id: 'chiller', label: 'Chiller', icon: 'snowflake' },
  { id: 'fancoil', label: 'Fancoil', icon: 'hvac' },
  { id: 'camara_frio', label: 'Câmara fria', icon: 'fridge-outline' },
  { id: 'condensadora', label: 'Condensadora', icon: 'radiator' },
  { id: 'outro', label: 'Outro', icon: 'dots-horizontal' },
];

// ─── PMOC Fase 2 — plano de manutenção, periodicidade, ordens recorrentes ─────
//
// CAVEAT LEGAL (herdado de 20260709_pmoc_fundacao.sql): nada aqui declara
// conformidade legal. `situacao` do plano é OPERACIONAL. As periodicidades, as
// atividades e as referências normativas são DADOS versionados (vivem em
// `PmocPlanoVersao.dados`), nunca constantes de código: prazo de norma muda, e
// quem valida é o responsável técnico habilitado — não o app.

/**
 * Uma periodicidade do plano: "trocar filtro a cada 3 meses nos splits".
 *
 * `frequencia` é `string`, não union type, DE PROPÓSITO. Uma union seria uma
 * constante de código disfarçada — mudar a norma exigiria republicar o app. O
 * valor é validado em runtime contra `FREQUENCIAS_PMOC`, que é só o vocabulário
 * que o app sabe calcular hoje; o plano pode carregar outros.
 */
export interface PmocPeriodicidade {
  id: string;
  nome: string;
  /** 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' — ver FREQUENCIAS_PMOC. */
  frequencia: string;
  /** Atividades a executar na visita (viram o checklist da OS gerada). */
  atividades: string[];
  /** Escopo: categorias de equipamento (vazio = todos os do plano). */
  categorias?: string[];
  /** Escopo fino: ids de equipamento (vence `categorias` quando presente). */
  equipamentoIds?: string[];
  /** Referência normativa citada pelo responsável técnico. Texto livre, nunca afirmação do app. */
  referencia?: string;
}

/** Frequências que o app sabe transformar em períodos. Meses por ciclo. */
export const FREQUENCIAS_PMOC: ReadonlyArray<{ id: string; label: string; meses: number }> = [
  { id: 'mensal', label: 'Mensal', meses: 1 },
  { id: 'bimestral', label: 'Bimestral', meses: 2 },
  { id: 'trimestral', label: 'Trimestral', meses: 3 },
  { id: 'semestral', label: 'Semestral', meses: 6 },
  { id: 'anual', label: 'Anual', meses: 12 },
];

/** Situação OPERACIONAL do plano (jamais "conforme com a norma X"). */
export type SituacaoPmoc =
  | 'rascunho'
  | 'em_revisao'
  | 'aguardando_aprovacao_tecnica'
  | 'aprovado'
  | 'vigente'
  | 'substituido'
  | 'suspenso'
  | 'encerrado';

export interface PmocPlano {
  id: string;
  clienteId?: string;
  contratoId?: string;
  numero?: string;
  titulo: string;
  situacao: SituacaoPmoc;
  /** Aponta para `PmocPlanoVersao.numeroVersao` vigente. */
  versaoVigente?: number;
  criadoEm: string;
  atualizadoEm?: string;
  /** LIXEIRA: ISO do soft delete. Ausente = ATIVO. */
  excluidoEm?: string;
}

/** Conteúdo versionado do plano. APPEND-ONLY: versão aprovada nunca é reescrita. */
export interface PmocPlanoVersao {
  id: string;
  planoId: string;
  numeroVersao: number;
  periodicidades: PmocPeriodicidade[];
  /** Equipamentos cobertos pelo plano (ids de `Equipamento`). */
  equipamentoIds: string[];
  /** Referências normativas que o responsável técnico registrou. Dados, não afirmação. */
  referencias?: string[];
  responsavelTecnico?: string;
  /** Número/referência do documento de responsabilidade (ART/TRT/RRT — o conselho varia). */
  docResponsabilidade?: string;
  /** Aprovação TÉCNICA (operacional), não declaração de conformidade legal. */
  aprovadoEm?: string;
  criadoEm: string;
}

/**
 * Uma linha do livro-caixa da geração recorrente. A chave lógica
 * (planoId, equipamentoId, periodo, periodicidadeId) é UNIQUE no banco — é o que
 * impede dois aparelhos de gerarem a mesma visita duas vezes.
 */
export interface PmocOrdemGerada {
  id: string;
  planoId: string;
  equipamentoId: string;
  /** '2026-07' (mensal) | '2026-T3' (trimestral) | '2026-S1' | '2026' (anual). */
  periodo: string;
  periodicidadeId: string;
  /** `OrdemServico.id` criada para esta visita. */
  ordemId: string;
  /** Data (ISO curta) em que a manutenção do período vence. */
  vencimento?: string;
  criadoEm: string;
  atualizadoEm?: string;
  excluidoEm?: string;
}
