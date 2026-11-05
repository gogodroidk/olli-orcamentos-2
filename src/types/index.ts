import type { GeoPrecisao } from '../utils/geoCliente.ts';
import type { EncerramentoOS } from '../utils/encerramentoOS.ts';
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
 * cliente já viu: o `saveOrcamento` recusa mudança comercial e a interface cria
 * uma REVISÃO com outro ID/número ligada ao original. Fonte única da verdade,
 * usada pelo app e por qualquer tela de edição para não divergir a regra.
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
  | 'dedetizacao'
  | 'caixa-dagua'
  | 'piscina'
  | 'extintores'
  | 'outro';

/**
 * Chips de segmento (onboarding e "Meu negócio"). Os ofícios recorrentes (dedetização,
 * caixa d'água, piscina, extintores) têm chip próprio: antes caíam em "Outro" → vertical
 * 'geral', que ESCONDE o documento de ofício de quem mais precisa dele.
 */
export const SEGMENTOS: { id: Segmento; label: string; icon: string }[] = [
  { id: 'ar-condicionado', label: 'Ar-condicionado', icon: 'air-conditioner' },
  { id: 'eletrica', label: 'Elétrica', icon: 'flash' },
  { id: 'hidraulica', label: 'Hidráulica', icon: 'water-pump' },
  { id: 'pintura', label: 'Pintura', icon: 'format-paint' },
  { id: 'dedetizacao', label: 'Dedetização', icon: 'bug-outline' },
  { id: 'caixa-dagua', label: "Caixa d'água", icon: 'water-outline' },
  { id: 'piscina', label: 'Piscina', icon: 'pool' },
  { id: 'extintores', label: 'Extintores', icon: 'fire-extinguisher' },
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
  /** Forma de atuação declarada no onboarding; controla a exigência de CNPJ sem excluir autônomos. */
  tipoNegocio?: 'autonomo' | 'empresa';
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

  // Personalização — padrões centrais usados para pré-preencher novos orçamentos
  // e documentos. O orçamento guarda um snapshot da identidade aplicada para um
  // documento já enviado não mudar retroativamente. Tudo opcional: schema-less no SQLite (id + data
  // JSON), então adicionar estes campos não exige nenhuma migração.
  corMarca?: string;
  validadeDiasPadrao?: number;
  garantiaPadrao?: string;
  condicoesPagamentoPadrao?: string;
  observacoesPadrao?: string;

  // DEDETIZAÇÃO (RDC 622/2022, art. 19, que revogou a RDC 52/2009) — dados de
  // compliance da empresa usados no comprovante de controle de pragas. Preenchidos 1x
  // (na 1ª emissão) e reaproveitados. Schema-less (SQLite id + JSON) → sem migração. Ver
  // src/services/documentosOficio.ts e CertificadoAnvisaScreen.
  licencaSanitaria?: string;
  licencaSanitariaValidade?: string;
  licencaAmbiental?: string;
  licencaAmbientalValidade?: string;
  responsavelTecnico?: string;
  responsavelTecnicoRegistro?: string;
  /** Telefone do Centro de Informação Toxicológica da região (art. 19, X). */
  telefoneCit?: string;
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

  // LUCRO REAL DA VISITA (Onda I4) — custos que o prestador informa UMA vez em
  // Meu Negócio. Tudo opcional e no blob JSON (`empresa.dados`), sem migração.
  // AUSENTE = não informado (o lucro diz o que falta, nunca chuta); 0 = "não
  // tenho esse custo" (afirmação do prestador). Regra em services/lucroVisita.ts.
  /** Quanto custa rodar 1 km (combustível ÷ consumo + desgaste), em R$. */
  custoKm?: number;
  /** Comissão paga por serviço (indicação, técnico, plataforma), em % do valor. */
  comissaoPercentual?: number;
  /**
   * Ponto de SAÍDA (de onde o prestador sai para as visitas), achado pelo endereço
   * do cadastro com o geocodificador grátis do worker (POST /geo). Usado só para
   * ESTIMAR o deslocamento (linha reta × 1,4). Os três andam juntos.
   */
  baseLat?: number;
  baseLon?: number;
  baseGeoPrecisao?: GeoPrecisao;
}

/**
 * Material/gás que SAIU numa OS (baixa leve — Onda I4). Não é estoque: é o
 * registro do que foi usado, que alimenta o Lucro Real da Visita.
 */
export interface MaterialUsado {
  id: string;
  nome: string;
  quantidade: number;
  /** 'un', 'm', 'kg', 'g', 'L'… (texto livre curto). */
  unidade: string;
  /**
   * Custo por unidade em R$. AUSENTE = não sabemos (o lucro avisa "falta o custo
   * de X"); vem do catálogo de produtos quando o item foi escolhido de lá.
   */
  custoUnitario?: number;
  /** Produto do catálogo de onde veio (soft ref), quando houver. */
  produtoId?: string;
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
  /**
   * GEO (Onda I1, migration 20261002100000). Ponto do cliente em graus decimais:
   * `lat`, `lon` e `geoPrecisao` andam JUNTOS (os três ou nenhum). Ausente = ainda
   * não sabemos — nunca 0. Quem preenche é a geocodificação ao salvar
   * (`database.ts` → POST /geo do worker) ou o backfill do cron. Regras em
   * `src/utils/geoCliente.ts`.
   */
  lat?: number;
  lon?: number;
  /** Código IBGE do município (7 dígitos) — chave dos alertas oficiais. Independe do ponto. */
  ibge?: string;
  /** De onde veio o ponto: 'numero' | 'rua' | 'cep' | 'bairro' | 'cidade'. */
  geoPrecisao?: GeoPrecisao;
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
  /**
   * Última alteração deliberada feita pelo prestador no editor. É diferente de
   * `atualizadoEm`, que também muda por sync/status/assinatura. Serve para a UI
   * dizer honestamente "Editado em ..." sem confundir uma visualização do cliente
   * com mudança no conteúdo.
   */
  editadoEm?: string;
  /**
   * ISO do momento em que o orçamento foi DECIDIDO (aprovado, recusado ou
   * convertido direto). Carimbado por `carimbarDecisao` no save; volta a ficar
   * ausente se o orçamento for reaberto. Os KPIs do mês contam pela decisão
   * (COALESCE(decididoEm, dataEmissao)): aprovar em outubro um orçamento emitido em
   * setembro é venda de outubro. Vive no blob (`dados`), sem coluna.
   */
  decididoEm?: string;
  /**
   * ISO da última interação com o cliente sobre este orçamento (criação, envio,
   * visualização, decisão — toda troca de status). Vive no blob, sem coluna.
   */
  ultimaInteracaoEm?: string;
  /**
   * Relação entre uma revisão e o orçamento original. Documentos já enviados ou
   * aceitos não são sobrescritos: "Criar revisão" nasce como outro rascunho,
   * preserva o original e registra de onde veio. Campos aditivos no blob JSON,
   * portanto sem migration e compatíveis com backups antigos.
   */
  revisaoDeId?: string;
  revisaoDeNumero?: string;
  revisaoCriadaEm?: string;
  /** Número original quando uma corrida entre aparelhos exigiu renumeração no sync. */
  numeroAnterior?: string;
  /** ISO da renumeração automática; mantém a trilha sem expor detalhes internos no PDF. */
  renumeradoEm?: string;
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
export type TipoEventoTrilha =
  | 'enviado'
  | 'visualizado'
  | 'aprovado'
  | 'recusado'
  /** O cliente tocou "Já paguei" no link. É AVISO, não confirmação: o prestador confere e registra. */
  | 'pagamento_informado';

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
  /** Número original quando uma corrida entre aparelhos exigiu renumeração no sync. */
  numeroAnterior?: string;
  /** ISO da renumeração automática; trilha de auditoria no blob sincronizado. */
  renumeradoEm?: string;
  // Ciclo comercial (Onda 3): true assim que o PDF do recibo é gerado/compartilhado
  // pelo menos uma vez. `false`/ausente = pagamento registrado mas o PDF do recibo
  // ainda não foi emitido para o cliente (registro rápido de "Registrar pagamento").
  // Campo opcional e aditivo — nenhuma migração necessária (linha vive no blob JSON).
  pdfEmitido?: boolean;
  /** ID do evento no ledger financeiro remoto, quando a gravação online confirmou. */
  pagamentoId?: string;
  /** O evento já foi ligado à linha remota do recibo (NULL -> id, uma vez). */
  ledgerReciboVinculado?: boolean;
  /** Chave de idempotência usada para retentar sem criar outro evento. */
  idempotencyKey?: string;
  /** Estado do espelho no ledger; pendente não significa que a nuvem confirmou. */
  ledgerStatus?: 'pendente' | 'confirmado' | 'falhou';
  /** Código sanitizado da última falha transitória do ledger (sem mensagem bruta). */
  ledgerErro?: 'indisponivel' | 'timeout' | 'offline' | 'nao_autorizado';
  /** Chave privada do comprovante no Storage, quando anexado. */
  comprovanteChave?: string;
  comprovanteHash?: string;
  comprovanteMime?: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';
  comprovanteTamanhoBytes?: number;
  /** Estorno financeiro é um evento explícito; nunca apagar o recibo. */
  estornadoEm?: string;
  motivoEstorno?: string;
}

/** Registro de biblioteca de documentos. O arquivo/PDF é um artefato; o objeto
 * e suas versões permanecem append-only para não sobrescrever o que o cliente
 * recebeu. */
export type TipoDocumentoBiblioteca =
  | 'orcamento' | 'contrato' | 'garantia' | 'conclusao' | 'recibo'
  | 'ordem_servico' | 'pmoc' | 'laudo' | 'checklist' | 'certificado';

export type StatusDocumentoBiblioteca = 'rascunho' | 'pronto' | 'enviado' | 'assinado' | 'arquivado';

export interface DocumentoBibliotecaRegistro {
  id: string;
  tipo: TipoDocumentoBiblioteca;
  status: StatusDocumentoBiblioteca;
  titulo: string;
  clienteId?: string;
  clienteNome: string;
  origemTipo: 'orcamento' | 'recibo' | 'ordem_servico' | 'pmoc' | 'manual';
  origemId?: string;
  origemNumero?: string;
  versaoAtual: number;
  dados: Record<string, unknown>;
  arquivoUri?: string;
  /** Chave privada do Storage (bucket/caminho), estável entre aparelhos. */
  arquivoChave?: string;
  arquivoHash?: string;
  criadoEm: string;
  atualizadoEm: string;
  enviadoEm?: string;
  assinadoEm?: string;
  excluidoEm?: string;
}

export interface DocumentoBibliotecaVersao {
  id: string;
  documentoId: string;
  numeroVersao: number;
  dados: Record<string, unknown>;
  arquivoUri?: string;
  /** Chave privada do Storage da versão, quando houver artefato remoto. */
  arquivoChave?: string;
  arquivoHash?: string;
  criadoEm: string;
  criadoPor?: string;
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
  /** Técnico da equipe que vai (auth user id). Ausente = sem responsável definido. */
  responsavelId?: string;
  /** Nome do responsável, gravado junto para o celular do técnico não depender da view de perfis. */
  responsavelNome?: string;
  /**
   * Regra de repetição do compromisso. Ausente = acontece uma vez só. As
   * ocorrências futuras NÃO viram linhas: são projetadas na hora pela agenda
   * (`utils/contratoRecorrente.ts:expandirRecorrencia`), então editar a base muda
   * a série inteira e apagar a base apaga a série.
   */
  recorrencia?: RecorrenciaAgendamento;
  /** Último dia (ISO curta 'YYYY-MM-DD') em que a série ainda se repete. Ausente = sem fim. */
  recorrenciaAte?: string;
  /** Visita nascida de um contrato recorrente (`ContratoRecorrente.id`). */
  contratoId?: string;
  /**
   * Exceções da SÉRIE, por ocorrência: a chave é o dia ORIGINAL da ocorrência
   * ('YYYY-MM-DD', fuso do Brasil) e o valor diz o que mudou só nela (cancelada,
   * movida, concluída…). Só vale para agendamento com `recorrencia`. Ausente = a
   * série inteira segue a regra. Aplicadas por `expandirRecorrencia`.
   */
  excecoes?: ExcecoesAgendamento;
  /**
   * Ordem de serviço desta visita. Quando a OS é concluída, a visita ligada vira
   * concluída sozinha (`visitaConcluidaPelaOS`). Visitas de contrato recorrente se
   * ligam à OS pelo id determinístico (`ag_cv_…` ↔ `os_cv_…`), mesmo sem este campo.
   */
  ordemServicoId?: string;
  /**
   * Serviço ao ar livre ou em altura (condensadora, telhado, fachada, jardim,
   * piscina…) — é o que liga a sugestão de remarcar por chuva. AUSENTE = não
   * informado, e isso NÃO é "interna": quem lê nunca trata ausência como `false`.
   * O app sugere pelo ofício (`verticais.ts` → `sugerirVisitaExterna`).
   */
  externa?: boolean;
}

/**
 * O que mudou numa ÚNICA ocorrência de uma série recorrente. Tudo opcional: só o
 * que difere da série é gravado.
 */
export interface ExcecaoOcorrencia {
  /** A ocorrência não acontece (as outras da série continuam). */
  cancelada?: true;
  /** Ocorrência MOVIDA: novo início (ISO). */
  inicio?: string;
  /** Novo fim (ISO) da ocorrência movida/encurtada. */
  fim?: string;
  /** Status só desta ocorrência (ex.: concluída enquanto a série segue agendada). */
  status?: StatusAgendamento;
  titulo?: string;
  observacao?: string;
  /** Outro técnico só nesta ocorrência. */
  responsavelId?: string;
  responsavelNome?: string;
}

/** Exceções de uma série, chave = dia original da ocorrência ('YYYY-MM-DD'). */
export type ExcecoesAgendamento = Record<string, ExcecaoOcorrencia>;

/**
 * Duração assumida (minutos) quando o agendamento não tem `fim` — o técnico sabe
 * quando começa, raramente quando acaba. Usada na detecção de conflito por técnico
 * (`encontrarConflitosPorTecnico`) e espelha a estimativa do calendário do painel.
 */
export const DURACAO_PADRAO_AGENDAMENTO_MIN: Record<TipoAgendamento, number> = {
  orcamento: 30,
  visita: 60,
  limpeza: 60,
  manutencao: 60,
  instalacao: 180,
  outro: 60,
};

/** Repetições que a agenda sabe projetar. As mensais em diante são as mesmas do contrato. */
export type RecorrenciaAgendamento =
  | 'semanal'
  | 'quinzenal'
  | 'mensal'
  | 'bimestral'
  | 'trimestral'
  | 'semestral'
  | 'anual';

export const RECORRENCIAS_AGENDAMENTO: ReadonlyArray<{ id: RecorrenciaAgendamento; label: string }> = [
  { id: 'semanal', label: 'Toda semana' },
  { id: 'quinzenal', label: 'A cada 15 dias' },
  { id: 'mensal', label: 'Todo mês' },
  { id: 'bimestral', label: 'A cada 2 meses' },
  { id: 'trimestral', label: 'A cada 3 meses' },
  { id: 'semestral', label: 'A cada 6 meses' },
  { id: 'anual', label: 'Todo ano' },
];

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
  /**
   * Família do aparelho (`ar_condicionado`, `geladeira`, `tv`…).
   * Ausente = ar-condicionado, para o app antigo.
   */
  tipoEquipamento?: string;
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
  /** Riscos desta família no caso. Vazio quando a resposta antiga não trazia. */
  riscos?: string[];
  /** O que separar antes da visita. */
  ferramentas?: string[];
  /** Quando interromper. */
  quandoParar?: string;
  /** Id da família, carimbado pelo worker. A base offline também preenche. */
  tipoEquipamento?: string;
  /** Rótulo em português, carimbado pelo worker ou pela base offline. */
  rotuloEquipamento?: string;
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
  /** ISO da transição para concluída; edição posterior não altera este marco. */
  concluidoEm?: string;
  /** Técnico atribuído (quem executa). Ausente enquanto ninguém foi designado. */
  tecnicoId?: string;
  tecnicoNome?: string;
  dataAgendada?: string; // ISO datetime
  checklist: ItemChecklist[];
  fotos: string[];
  observacoes?: string;
  valor?: number;
  /**
   * Equipamento atendido (`Equipamento.id` → `assets.id`, soft ref). Nasce no
   * check-in pelo QR ("Iniciar atendimento"); é o que monta o histórico da ficha
   * do equipamento e a "última manutenção" da etiqueta pública. Ausente = OS sem
   * equipamento ligado (a verdade de toda OS anterior à migration 20261002153217).
   */
  equipamentoId?: string;
  /**
   * Prazo de garantia DESTA OS como o prestador escreveu ("90 dias", "6 meses").
   * Nasce do orçamento de origem e é editável na OS. Ausente = a OS não declara
   * garantia (o OLLI nunca inventa uma). O último dia é calculado na hora
   * (`utils/garantiaServico.ts`) e vai para a nuvem em `garantia_ate`
   * (migration 20261003103100).
   */
  garantia?: string;
  /** Esta OS é RETORNO DE GARANTIA daquela (id da OS original). */
  garantiaDeOsId?: string;
  /**
   * "Encerrar atendimento" (encerramento em 60 s): passos feitos/pulados, a
   * assinatura do cliente, o recibo e a próxima visita criados no fluxo. Regras e
   * leitura tolerante em `utils/encerramentoOS.ts`. Ausente = a OS nunca passou
   * pelo fluxo (a verdade de toda OS anterior à migration 20261003102500).
   */
  encerramento?: EncerramentoOS;
  /**
   * Baixa leve de material/gás (Onda I4, migration 20261003104000). AUSENTE =
   * não informado; `[]` = "não usei material" (afirmação do técnico). É o que o
   * Lucro Real da Visita usa como custo de material quando existe.
   */
  materiais?: MaterialUsado[];
  criadoEm: string;
  atualizadoEm: string;
  /** LIXEIRA (Frente 1): ISO do soft delete. Ausente = ATIVO. */
  excluidoEm?: string;
}

/**
 * Pedido de orçamento feito por quem escaneou a etiqueta QR do equipamento
 * (página pública /q/<token>). Gravado SÓ pelo worker (service_role) em
 * `public.pedidos_orcamento_qr`; o app lê e marca como atendido. O primeiro
 * contato continua humano: o app só mostra o pedido e abre o WhatsApp.
 */
export interface PedidoOrcamentoQr {
  id: string;
  equipamentoId: string;
  nome: string;
  /** Só dígitos, com DDI 55 (normalizado pelo worker). */
  telefone: string;
  mensagem?: string;
  criadoEm: string;
  /** ISO de quando o prestador marcou como atendido. Ausente = novo. */
  atendidoEm?: string;
  /**
   * 'garantia' = "Voltou o problema: chamar a garantia" (o worker só aceita com
   * garantia vigente confirmada). Ausente/'orcamento' = pedido de orçamento.
   */
  motivo?: 'orcamento' | 'garantia';
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

// ─── CONTRATO RECORRENTE POR ATIVO (Onda D — ação 6) ──────────────────────────
//
// O contrato liga CLIENTE + ATIVO(S) + PERIODICIDADE + VALOR. O sistema gera
// sozinho a próxima visita (OS + agendamento) sem duplicar; o PMOC é um caso
// particular (mesmo vocabulário de periodicidade, `FREQUENCIAS_PMOC`, e o plano
// PMOC continua apontando para o contrato por `pmoc_plans.contract_id`).
// Mora na tabela `service_contracts` (fundação PMOC), estendida pela migration
// 20260930130500. Regras puras em `utils/contratoRecorrente.ts`.

/**
 * Situação OPERACIONAL do contrato (subconjunto do CHECK de `service_contracts`).
 * Só `vigente` gera visita. Nada aqui é afirmação de conformidade legal.
 */
export type SituacaoContrato = 'rascunho' | 'vigente' | 'suspenso' | 'encerrado' | 'cancelado';

/**
 * O que é atendido: um equipamento do inventário (`assetId` → `assets.id`) OU um
 * ativo descrito em texto (piscina, caixa d'água, imóvel…) — nem todo ofício tem
 * equipamento com etiqueta, e obrigar o cadastro HVAC para uma piscina seria mentir.
 */
export interface AtivoContrato {
  id: string;
  nome: string;
  assetId?: string;
}

/** Como o valor do contrato é cobrado: por mês ou a cada visita feita. */
export type ModoCobrancaContrato = 'mensal' | 'por_visita';

export interface ContratoRecorrente {
  id: string;
  /** Dono do tenant (somente leitura: vem do banco; nunca é escolhido pela tela). */
  userId?: string;
  numero?: string;
  titulo: string;
  clienteId?: string;
  /** Cópia do nome para listar sem depender do cadastro local (o telefone é lido na hora de cobrar). */
  clienteNome?: string;
  endereco?: string;
  situacao: SituacaoContrato;
  /** 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' (FREQUENCIAS_PMOC). */
  periodicidade: string;
  /** Primeira visita, ISO curta 'YYYY-MM-DD'. O dia do mês vira a âncora das próximas. */
  dataInicio: string;
  /** Última data coberta pelo contrato (inclusive). Ausente = por prazo indeterminado. */
  dataFim?: string;
  renovacao?: 'manual' | 'automatica';
  /** Horário da visita no fuso do Brasil, 'HH:MM'. */
  horarioVisita: string;
  ativos: AtivoContrato[];
  /** O que se faz em cada visita — vira o checklist da OS (por ativo). */
  atividades: string[];
  modoCobranca: ModoCobrancaContrato;
  /** Valor em reais: por mês (`mensal`) ou por visita (`por_visita`). */
  valor: number;
  responsavelId?: string;
  responsavelNome?: string;
  observacoes?: string;
  criadoEm: string;
  atualizadoEm: string;
  excluidoEm?: string;
}
