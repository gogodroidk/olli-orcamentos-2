/**
 * ativacao.ts — o caminho da conta nova até o PRIMEIRO ORÇAMENTO ENVIADO.
 *
 * Por que existe: em 30/09/2026, 47 de 60 contas nunca criaram um orçamento, e de
 * quem cria a mediana até o primeiro é de 44 minutos. O prestador abre o app, vê
 * uma tela vazia, não sabe o que digitar e vai embora. Este módulo tira a folha em
 * branco da frente dele: um ORÇAMENTO DE EXEMPLO do ofício dele, já preenchido, que
 * ele só ajusta (cliente e valores) e envia — e um checklist curto do que falta
 * para o OLLI começar a trabalhar por ele.
 *
 * TypeScript PURO (sem React, sem banco): o app (mobile + desktop) e o painel web
 * importam a MESMA regra — o painel pelo alias `@ativacao` — e os testes rodam em
 * `node` (scripts/teste-ativacao.ts). Cópia divergente entre as duas telas é como
 * a copy já mentiu antes; aqui não tem cópia.
 *
 * REGRAS QUE NÃO SÃO DETALHE:
 *  • VALOR DE EXEMPLO NÃO É TABELA DE PREÇO. Os números abaixo são uma referência
 *    genérica para o orçamento nascer com cara de orçamento — o prestador troca
 *    pelo preço dele. A interface diz isso em voz alta (`AVISO_EXEMPLO`), e nada
 *    aqui se chama "preço oficial", "tabela" ou "preço de mercado".
 *  • 3 ESTADOS: o checklist recebe cada fato como `boolean | null` (`null` = a
 *    leitura não confirmou). Com qualquer `null` ele devolve `indisponivel` e a
 *    tela NÃO desenha nada — nunca um "pendente" falso (que manda o dono refazer o
 *    que já fez) nem um "feito" falso.
 *  • O TESTE DO PRO é concedido pelo SERVIDOR (migration
 *    20260930120000_trial_pro_automatico_primeiro_envio.sql). Esta camada só
 *    decide se há um aviso a MOSTRAR, e só quando a leitura do servidor confirma
 *    o teste ativo com data de término — sem confirmação, sem aviso.
 */
import type { StatusOrcamento } from '../types';
import { SEGMENTO_PARA_VERTICAL } from './verticalSegmento.ts';
import type { VerticalId } from './verticais';
import { normalizarChavePix } from '../utils/pixBrCode.ts';
import { TRIAL_PRO_DIAS, type EstadoOfertaComercial, type ReservaEnvioOrcamento } from './limitesComerciais.ts';

// ─── 1. Orçamento de exemplo por ofício ───────────────────────────────────────

export interface ItemExemplo {
  tipo: 'servico' | 'produto';
  nome: string;
  descricao?: string;
  quantidade: number;
  /** Unidade do domínio (`UNIDADES` em src/types). */
  unidade: 'un' | 'm²' | 'h' | 'm';
  /** Valor de REFERÊNCIA em reais, para o prestador trocar pelo dele. Nunca "oficial". */
  valorReferencia: number;
}

export interface ExemploOrcamento {
  vertical: VerticalId;
  /** Como o cartão chama o exemplo ("Higienização de ar-condicionado"). */
  titulo: string;
  itens: readonly ItemExemplo[];
}

/**
 * Um exemplo curto (2–3 itens) por ofício, com o serviço mais pedido de cada um.
 * Os valores são redondos de propósito: parecem exemplo, não cotação.
 */
export const EXEMPLOS_POR_VERTICAL: Readonly<Record<VerticalId, ExemploOrcamento>> = {
  refrigeracao: {
    vertical: 'refrigeracao',
    titulo: 'Higienização de ar-condicionado',
    itens: [
      { tipo: 'servico', nome: 'Higienização completa de split (até 12.000 BTUs)', descricao: 'Limpeza de filtros, serpentina, bandeja e dreno, com aplicação de bactericida.', quantidade: 1, unidade: 'un', valorReferencia: 180 },
      { tipo: 'servico', nome: 'Visita técnica e teste de funcionamento', descricao: 'Medição de temperatura e verificação da parte elétrica.', quantidade: 1, unidade: 'un', valorReferencia: 80 },
    ],
  },
  eletrica: {
    vertical: 'eletrica',
    titulo: 'Troca de disjuntor e tomadas',
    itens: [
      { tipo: 'servico', nome: 'Troca de disjuntor no quadro (mão de obra)', quantidade: 1, unidade: 'un', valorReferencia: 90 },
      { tipo: 'servico', nome: 'Instalação de tomada (mão de obra)', quantidade: 2, unidade: 'un', valorReferencia: 60 },
      { tipo: 'produto', nome: 'Disjuntor 20 A', quantidade: 1, unidade: 'un', valorReferencia: 35 },
    ],
  },
  hidraulica: {
    vertical: 'hidraulica',
    titulo: 'Desentupimento e troca de sifão',
    itens: [
      { tipo: 'servico', nome: 'Desentupimento de pia ou ralo', quantidade: 1, unidade: 'un', valorReferencia: 150 },
      { tipo: 'servico', nome: 'Troca de sifão (mão de obra)', quantidade: 1, unidade: 'un', valorReferencia: 70 },
      { tipo: 'produto', nome: 'Sifão sanfonado', quantidade: 1, unidade: 'un', valorReferencia: 25 },
    ],
  },
  pintura: {
    vertical: 'pintura',
    titulo: 'Pintura de parede interna',
    itens: [
      { tipo: 'servico', nome: 'Pintura de parede interna, 2 demãos (mão de obra)', quantidade: 30, unidade: 'm²', valorReferencia: 25 },
      { tipo: 'servico', nome: 'Massa corrida e lixamento', quantidade: 30, unidade: 'm²', valorReferencia: 12 },
    ],
  },
  dedetizacao: {
    vertical: 'dedetizacao',
    titulo: 'Dedetização residencial',
    itens: [
      { tipo: 'servico', nome: 'Dedetização residencial (até 100 m²)', descricao: 'Controle de baratas e formigas, com certificado de execução.', quantidade: 1, unidade: 'un', valorReferencia: 250 },
      { tipo: 'servico', nome: 'Aplicação de gel em cozinha e banheiros', quantidade: 1, unidade: 'un', valorReferencia: 100 },
    ],
  },
  caixa_dagua: {
    vertical: 'caixa_dagua',
    titulo: "Limpeza e desinfecção de caixa d'água",
    itens: [
      { tipo: 'servico', nome: "Limpeza e desinfecção de caixa d'água (até 1.000 litros)", descricao: 'Esvaziamento, escovação das paredes, desinfecção e enxágue, com certificado de limpeza.', quantidade: 1, unidade: 'un', valorReferencia: 250 },
      { tipo: 'servico', nome: 'Vistoria da tampa, da boia e do extravasor', quantidade: 1, unidade: 'un', valorReferencia: 50 },
    ],
  },
  piscina: {
    vertical: 'piscina',
    titulo: 'Manutenção mensal de piscina',
    itens: [
      { tipo: 'servico', nome: 'Visita de limpeza (peneira, escovação e aspiração)', descricao: 'Uma visita por semana, com medição de pH e cloro.', quantidade: 4, unidade: 'un', valorReferencia: 100 },
      { tipo: 'produto', nome: 'Produtos para tratamento da água (cloro e corretor de pH)', quantidade: 1, unidade: 'un', valorReferencia: 80 },
    ],
  },
  extintores: {
    vertical: 'extintores',
    titulo: 'Recarga e inspeção de extintores',
    itens: [
      { tipo: 'servico', nome: 'Recarga de extintor de pó ABC 4 kg', quantidade: 3, unidade: 'un', valorReferencia: 50 },
      { tipo: 'servico', nome: 'Recarga de extintor de CO2 6 kg', quantidade: 1, unidade: 'un', valorReferencia: 90 },
      { tipo: 'servico', nome: 'Visita técnica e inspeção dos extintores', quantidade: 1, unidade: 'un', valorReferencia: 60 },
    ],
  },
  jardinagem: {
    vertical: 'jardinagem',
    titulo: 'Manutenção de jardim',
    itens: [
      { tipo: 'servico', nome: 'Corte de grama com acabamento', quantidade: 100, unidade: 'm²', valorReferencia: 3 },
      { tipo: 'servico', nome: 'Poda de arbustos e cerca viva', quantidade: 1, unidade: 'un', valorReferencia: 120 },
      { tipo: 'servico', nome: 'Recolhimento dos resíduos verdes', quantidade: 1, unidade: 'un', valorReferencia: 60 },
    ],
  },
  geral: {
    vertical: 'geral',
    titulo: 'Serviço com visita técnica',
    itens: [
      { tipo: 'servico', nome: 'Visita técnica e avaliação', quantidade: 1, unidade: 'un', valorReferencia: 60 },
      { tipo: 'servico', nome: 'Mão de obra (hora técnica)', quantidade: 2, unidade: 'h', valorReferencia: 80 },
    ],
  },
};

/** O que a interface diz junto do exemplo — em TODA tela que o mostra. */
export const AVISO_EXEMPLO =
  'É um exemplo para você não começar do zero: troque o cliente, os itens e os valores pelos seus antes de enviar. Os valores são só referência, não uma tabela de preços.';

/** Título do cartão de início (o prestador lê isto antes de qualquer outra coisa). */
export const TITULO_PRIMEIRO_ORCAMENTO = 'Seu primeiro orçamento em 1 minuto';

/**
 * O exemplo do ofício. `undefined` (conta sem ofício) devolve `null`: a tela
 * PERGUNTA o ofício em 1 toque, em vez de chutar um — o exemplo de ar-condicionado
 * na tela de um pintor é exatamente a sensação de "isso não é pra mim".
 */
export function exemploOrcamentoPara(vertical: VerticalId | null | undefined): ExemploOrcamento | null {
  if (!vertical) return null;
  return EXEMPLOS_POR_VERTICAL[vertical] ?? null;
}

/** Total do exemplo (o cartão mostra "R$ 260,00 de exemplo"). Soma em centavos para não errar arredondamento. */
export function totalDoExemplo(exemplo: ExemploOrcamento): number {
  const centavos = exemplo.itens.reduce((s, i) => s + Math.round(i.valorReferencia * 100) * i.quantidade, 0);
  return centavos / 100;
}

/**
 * Formato de pré-carga que as DUAS telas de orçamento já entendem:
 * `prefillItems` do app (NovoOrcamentoScreen) e `PrefillItemOrcamento` do painel.
 * O valor vai como `precoSugerido` — o editor continua sendo a autoridade.
 */
export function itensPrefillDoExemplo(exemplo: ExemploOrcamento): {
  tipo: 'servico' | 'produto';
  nome: string;
  descricao?: string;
  quantidade: number;
  unidade: string;
  precoSugerido: number;
}[] {
  return exemplo.itens.map((i) => ({
    tipo: i.tipo,
    nome: i.nome,
    ...(i.descricao ? { descricao: i.descricao } : {}),
    quantidade: i.quantidade,
    unidade: i.unidade,
    precoSugerido: i.valorReferencia,
  }));
}

/**
 * O ofício para o exemplo, com a MESMA precedência do gate de verticais
 * (`useVerticais`): `verticais` explícitas, senão o `segmento` legado. Sem nenhum
 * dos dois, `undefined` (a tela pergunta).
 */
export function verticalDoExemplo(
  dados: { verticais?: readonly VerticalId[] | null; segmento?: string | null } | null | undefined,
): VerticalId | undefined {
  const primeira = dados?.verticais?.[0];
  if (primeira && primeira in EXEMPLOS_POR_VERTICAL) return primeira;
  const segmento = dados?.segmento;
  if (segmento && segmento in SEGMENTO_PARA_VERTICAL) {
    return SEGMENTO_PARA_VERTICAL[segmento as keyof typeof SEGMENTO_PARA_VERTICAL];
  }
  return undefined;
}

/**
 * O cartão "primeiro orçamento" aparece SÓ quando a leitura CONFIRMOU zero
 * orçamentos. `null` (carregando/erro) não mostra: o convite "crie o primeiro"
 * na tela de quem já tem 40 é o erro virando vazio.
 *
 * `downloadConfirmado` é para quem lê um banco LOCAL (o app): enquanto o primeiro
 * download da nuvem não terminou (`useSyncInicial` ≠ 'pronto'), o zero do SQLite
 * é "ainda não baixei", não "a conta não tem". O painel lê direto do servidor e
 * não passa nada (o padrão `true` vale para ele).
 */
export function mostrarCartaoPrimeiroOrcamento(totalOrcamentos: number | null, downloadConfirmado = true): boolean {
  return downloadConfirmado && totalOrcamentos === 0;
}

// ─── 2. Checklist de ativação ─────────────────────────────────────────────────

/**
 * Status de quem JÁ saiu da mão do prestador (o cliente recebeu). Rascunho e
 * cancelado ficam de fora: cancelado pode ter nascido e morrido como rascunho.
 */
export const STATUS_JA_ENVIADO: readonly StatusOrcamento[] = [
  'enviado',
  'visualizado',
  'em_negociacao',
  'aguardando_assinatura',
  'aprovado',
  'recusado',
  'expirado',
  'convertido',
];

export function statusFoiEnviado(status: string | null | undefined): boolean {
  return !!status && (STATUS_JA_ENVIADO as readonly string[]).includes(status);
}

export type PassoAtivacaoId = 'empresa' | 'primeiro_envio' | 'pix' | 'primeiro_recibo';

export interface PassoAtivacao {
  id: PassoAtivacaoId;
  titulo: string;
  descricao: string;
  feito: boolean;
}

/** Cada fato é `true`/`false` quando a leitura confirmou, `null` quando não. */
export interface FatosAtivacao {
  /** Nome da empresa E logo cadastrados (o que aparece no topo do PDF). */
  empresaComLogo: boolean | null;
  /** Pelo menos 1 orçamento já saiu para um cliente. */
  primeiroOrcamentoEnviado: boolean | null;
  /** Chave Pix cadastrada E reconhecida (`normalizarChavePix`) — o cliente paga sem pedir "me passa o Pix". */
  chavePix: boolean | null;
  /**
   * Há algo no campo da chave, mas não é uma chave Pix que reconhecemos (CNPJ com
   * dígito errado, celular sem DDD…). O passo vira "Corrigir chave Pix" em vez de
   * "cadastrar". Opcional: quem não informa vê o texto de cadastro.
   */
  chavePixInvalida?: boolean | null;
  /** Pelo menos 1 recibo emitido. */
  primeiroRecibo: boolean | null;
}

export type ChecklistAtivacao =
  | { estado: 'indisponivel' }
  | { estado: 'concluido'; total: number }
  /** Conta que já trabalha (ver `contaMadura`): o checklist é ruído, some. */
  | { estado: 'madura' }
  | { estado: 'pendente'; passos: PassoAtivacao[]; feitos: number; total: number; proximo: PassoAtivacao };

const PASSOS: readonly { id: PassoAtivacaoId; fato: keyof FatosAtivacao; titulo: string; descricao: string }[] = [
  {
    id: 'empresa',
    fato: 'empresaComLogo',
    titulo: 'Dados da empresa com logo',
    descricao: 'Nome e logo saem no topo de cada orçamento e recibo.',
  },
  {
    id: 'primeiro_envio',
    fato: 'primeiroOrcamentoEnviado',
    titulo: 'Primeiro orçamento enviado',
    descricao: 'Mande por PDF, link ou WhatsApp. O exemplo do seu ofício já vem pronto.',
  },
  {
    id: 'pix',
    fato: 'chavePix',
    titulo: 'Chave Pix cadastrada',
    descricao: 'Para o cliente pagar você sem precisar pedir a chave.',
  },
  {
    id: 'primeiro_recibo',
    fato: 'primeiroRecibo',
    titulo: 'Primeiro recibo emitido',
    descricao: 'Quando o cliente pagar, registre e mande o recibo.',
  },
];

/** O passo do Pix quando há uma chave no cadastro que não reconhecemos. */
const PASSO_PIX_CORRIGIR = {
  titulo: 'Corrigir chave Pix',
  descricao: 'A chave cadastrada não foi reconhecida. Até corrigir, as cobranças vão sem Pix.',
} as const;

/** A partir de quantos orçamentos (com 1 recibo) a conta já trabalha de verdade. */
export const ORCAMENTOS_CONTA_MADURA = 3;

/**
 * Conta que já trabalha: 3 ou mais orçamentos E pelo menos 1 recibo. Para ela, o
 * "Deixe o OLLI pronto para trabalhar" no topo do Início é ruído (a GR Tech, com
 * 12 orçamentos e 8 recibos, via o checklist só por causa do logo). Só decide com
 * leitura CONFIRMADA: `null` (não sei) nunca conta como madura nem como nova.
 */
export function contaMadura(totalOrcamentos: number | null | undefined, temRecibo: boolean | null | undefined): boolean {
  return typeof totalOrcamentos === 'number' && totalOrcamentos >= ORCAMENTOS_CONTA_MADURA && temRecibo === true;
}

/**
 * O checklist curto de ativação. Some sozinho quando tudo está feito
 * (`concluido`), some para a conta que já trabalha (`madura`, quando quem chama
 * informa o total de orçamentos) e NÃO aparece quando algum fato não foi
 * confirmado (`indisponivel`) — ver regra dos 3 estados no topo do arquivo.
 */
export function calcularChecklistAtivacao(
  fatos: FatosAtivacao,
  maturidade?: { totalOrcamentos: number | null },
): ChecklistAtivacao {
  if (maturidade && contaMadura(maturidade.totalOrcamentos, fatos.primeiroRecibo)) return { estado: 'madura' };
  if (PASSOS.some((p) => fatos[p.fato] === null || fatos[p.fato] === undefined)) return { estado: 'indisponivel' };
  const passos = PASSOS.map((p): PassoAtivacao => {
    const corrigirPix = p.id === 'pix' && fatos.chavePix !== true && fatos.chavePixInvalida === true;
    return {
      id: p.id,
      titulo: corrigirPix ? PASSO_PIX_CORRIGIR.titulo : p.titulo,
      descricao: corrigirPix ? PASSO_PIX_CORRIGIR.descricao : p.descricao,
      feito: fatos[p.fato] === true,
    };
  });
  const feitos = passos.filter((p) => p.feito).length;
  const proximo = passos.find((p) => !p.feito);
  if (!proximo) return { estado: 'concluido', total: passos.length };
  return { estado: 'pendente', passos, feitos, total: passos.length, proximo };
}

/** Texto não vazio (espaços não contam como cadastrado). */
function preenchido(valor: unknown): boolean {
  return typeof valor === 'string' && valor.trim().length > 0;
}

/**
 * Os fatos que vêm do cadastro da empresa. `undefined` = leitura não confirmada
 * (carregando/erro) → fatos `null`. `null` = leitura OK e a conta não tem empresa
 * cadastrada → fatos `false` (é verdade: não tem).
 *
 * A chave Pix só conta como cadastrada quando `normalizarChavePix` a reconhece —
 * a MESMA régua das cobranças (que saem SEM Pix com chave duvidosa). Riscar
 * "Chave Pix cadastrada" com um CNPJ de dígito errado era dizer "pronto" para
 * uma cobrança que vai sair sem Pix.
 */
export function fatosDaEmpresa(
  empresa: { nome?: string | null; logoUri?: string | null; chavePix?: string | null } | null | undefined,
): Pick<FatosAtivacao, 'empresaComLogo' | 'chavePix' | 'chavePixInvalida'> {
  if (empresa === undefined) return { empresaComLogo: null, chavePix: null, chavePixInvalida: null };
  const temAlgo = !!empresa && preenchido(empresa.chavePix);
  const reconhecida = temAlgo && normalizarChavePix(empresa?.chavePix) !== null;
  return {
    empresaComLogo: !!empresa && preenchido(empresa.nome) && preenchido(empresa.logoUri),
    chavePix: reconhecida,
    chavePixInvalida: temAlgo && !reconhecida,
  };
}

// ─── 3. Aviso do teste do Pro liberado no 1º envio ────────────────────────────

export interface AvisoTrialAutomatico {
  titulo: string;
  mensagem: string;
  terminaEm: string;
}

/** Data em pt-BR no fuso do Brasil (o término vem em UTC do servidor). */
export function dataCurtaBr(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * Há um aviso "Liberamos o Pro" a mostrar depois de um envio?
 *
 * Só quando: (1) o envio passou pela cota do Grátis (`dentro_da_cota`) — quem já
 * estava no Pro/teste não é "liberado" de novo; (2) a leitura do servidor DEPOIS
 * da confirmação diz teste `active` com término no futuro. Leitura que falhou
 * (`oferta === null`) não gera aviso: não anunciamos o que não confirmamos.
 */
export function avisoTrialAutomatico(
  reserva: Pick<ReservaEnvioOrcamento, 'motivo' | 'planoEfetivo'> | null | undefined,
  oferta: Pick<EstadoOfertaComercial, 'trialEstado' | 'trialTerminaEm' | 'planoEfetivo'> | null | undefined,
  agora: number = Date.now(),
): AvisoTrialAutomatico | null {
  if (!reserva || reserva.motivo !== 'dentro_da_cota' || reserva.planoEfetivo !== 'gratis') return null;
  if (!oferta || oferta.trialEstado !== 'active' || oferta.planoEfetivo === 'gratis') return null;
  const termino = oferta.trialTerminaEm ? Date.parse(oferta.trialTerminaEm) : Number.NaN;
  if (!Number.isFinite(termino) || termino <= agora) return null;
  const terminaEm = oferta.trialTerminaEm as string;
  return {
    titulo: `Liberamos o Pro por ${TRIAL_PRO_DIAS} dias`,
    mensagem:
      `Seu orçamento foi enviado e, de presente, o Pro está liberado até ${dataCurtaBr(terminaEm)}: ` +
      'orçamentos sem limite e os recursos do Pro. Sem cartão e sem cobrança automática. ' +
      'Quando o teste acabar, a conta volta ao Grátis e seus dados continuam salvos.',
    terminaEm,
  };
}
