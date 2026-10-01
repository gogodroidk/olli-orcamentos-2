// Import só de TIPO: este módulo é TypeScript puro e roda também nos testes em
// Node (scripts/teste-c5-orcamentos-financeiro.ts), sem React Native nem banco.
import type { Empresa, Orcamento } from '../types';

/**
 * NOVO DOCUMENTO A PARTIR DE OUTRO — a base única de "Duplicar" e "Criar revisão".
 *
 * Antes eram três cópias quase iguais (lista: clonar e revisar; detalhe: duplicar
 * e revisar) e cada uma esquecia um campo diferente. O resultado foi um duplicado
 * para OUTRO cliente saindo com a assinatura de contrato do cliente anterior, com a
 * validade já vencida do original e com a trilha de renumeração de outro número.
 *
 * Regra: o documento novo é um RASCUNHO que ninguém viu nem assinou. Então:
 *   - toda assinatura sai (proposta, contrato e a do prestador no documento — o PDF
 *     volta a usar a assinatura do cadastro da empresa);
 *   - toda data ligada ao documento antigo sai (visita, prestação, agendamento,
 *     sinal); a emissão é hoje;
 *   - a validade é recalculada a partir de hoje pelo padrão da empresa (só quando o
 *     original tinha validade: quem tirou a validade de propósito continua sem);
 *   - numeroAnterior/renumeradoEm (trilha da renumeração do ORIGINAL) saem;
 *   - itens ganham ids novos (o original continua com os dele).
 *
 * A diferença entre os modos é só a relação com o original:
 *   - 'duplicar': documento independente (sem vínculo, sem modelo de origem);
 *   - 'revisao': aponta para o original (o mesmo original de toda a cadeia).
 */
export type ModoNovoDocumento = 'duplicar' | 'revisao';

/** Mesmo padrão do orçamento em branco (NovoOrcamentoScreen.emptyOrcamento). */
export const VALIDADE_DIAS_PADRAO = 15;

export interface EntradaNovoDocumento {
  origem: Orcamento;
  modo: ModoNovoDocumento;
  /** Id do documento novo. */
  id: string;
  /** Número do documento novo (getNextOrcamentoNumber). */
  numero: string;
  /** Gera os ids novos dos itens. */
  gerarId: () => string;
  /** Só `validadeDiasPadrao` é lido. Ausente = 15 dias. */
  empresa?: Pick<Empresa, 'validadeDiasPadrao'> | null;
  /** Relógio injetável (testes). Padrão: agora. */
  agora?: Date;
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** AAAA-MM-DD no fuso LOCAL (mesma regra de `todayISO`). */
function diaLocalIso(d: Date): string {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

/** Dias de validade que valem: inteiro positivo do cadastro, senão o padrão. */
export function diasDeValidade(empresa?: Pick<Empresa, 'validadeDiasPadrao'> | null): number {
  const dias = empresa?.validadeDiasPadrao;
  return typeof dias === 'number' && Number.isInteger(dias) && dias > 0 ? dias : VALIDADE_DIAS_PADRAO;
}

/** Validade em DD/MM/AAAA (o formato que o editor grava) a `dias` de `hoje`. */
export function validadeAPartirDe(hoje: Date, dias: number): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias);
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function baseParaNovoDocumento({
  origem,
  modo,
  id,
  numero,
  gerarId,
  empresa,
  agora = new Date(),
}: EntradaNovoDocumento): Orcamento {
  const agoraIso = agora.toISOString();
  const revisao = modo === 'revisao';
  const tinhaValidade = !!origem.validadeOrcamento?.trim();

  return {
    ...origem,
    id,
    numero,
    status: 'rascunho',
    dataEmissao: diaLocalIso(agora),
    itens: origem.itens.map(item => ({ ...item, id: gerarId() })),

    // Validade recalculada a partir de hoje (nunca herda uma data já vencida).
    validadeOrcamento: tinhaValidade ? validadeAPartirDe(agora, diasDeValidade(empresa)) : undefined,

    // Assinaturas: ninguém assinou este documento.
    assinaturaClienteUri: undefined,
    dataAssinaturaCliente: undefined,
    assinaturaContratoUri: undefined,
    dataAssinaturaContrato: undefined,
    assinaturaPrestadorUri: undefined,

    // Datas do serviço do documento antigo.
    dataVisitaTecnica: undefined,
    dataPrestacaoServico: undefined,
    agendamentoServico: undefined,
    sinalData: undefined,

    // Trilha do ORIGINAL que não pertence ao novo.
    numeroAnterior: undefined,
    renumeradoEm: undefined,
    editadoEm: undefined,
    excluidoEm: undefined,
    criadoDeModeloId: revisao ? origem.criadoDeModeloId : undefined,

    // Relação com o original: só a revisão aponta para ele.
    revisaoDeId: revisao ? (origem.revisaoDeId ?? origem.id) : undefined,
    revisaoDeNumero: revisao ? (origem.revisaoDeNumero ?? origem.numero) : undefined,
    revisaoCriadaEm: revisao ? agoraIso : undefined,

    criadoEm: agoraIso,
    atualizadoEm: agoraIso,
  };
}
