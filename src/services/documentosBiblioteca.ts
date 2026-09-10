import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import {
  getDocumentoBiblioteca,
  getDocumentoBibliotecaPorOrigem,
  getDocumentoBibliotecaVersoes,
  saveDocumentoBiblioteca,
  saveDocumentoBibliotecaVersao,
} from '../database/database';
import type {
  DocumentoBibliotecaRegistro,
  DocumentoBibliotecaVersao,
  StatusDocumentoBiblioteca,
  TipoDocumentoBiblioteca,
} from '../types';

export type CriarDocumentoBibliotecaInput = {
  tipo: TipoDocumentoBiblioteca;
  titulo: string;
  clienteId?: string;
  clienteNome?: string;
  origemTipo: DocumentoBibliotecaRegistro['origemTipo'];
  origemId?: string;
  origemNumero?: string;
  dados?: Record<string, unknown>;
  arquivoUri?: string;
  arquivoHash?: string;
  status?: StatusDocumentoBiblioteca;
};

/** Cria um documento e congela a versão 1 do snapshot atual. */
export async function criarDocumentoBiblioteca(input: CriarDocumentoBibliotecaInput): Promise<DocumentoBibliotecaRegistro> {
  const agora = nowISO();
  const documento: DocumentoBibliotecaRegistro = {
    id: generateId(),
    tipo: input.tipo,
    status: input.status ?? 'rascunho',
    titulo: input.titulo.trim(),
    clienteId: input.clienteId,
    clienteNome: input.clienteNome?.trim() ?? '',
    origemTipo: input.origemTipo,
    origemId: input.origemId,
    origemNumero: input.origemNumero,
    versaoAtual: 1,
    dados: { ...(input.dados ?? {}) },
    arquivoUri: input.arquivoUri,
    arquivoHash: input.arquivoHash,
    criadoEm: agora,
    atualizadoEm: agora,
  };
  await saveDocumentoBiblioteca(documento);
  await saveDocumentoBibliotecaVersao({
    id: generateId(), documentoId: documento.id, numeroVersao: 1,
    dados: documento.dados, arquivoUri: documento.arquivoUri, arquivoHash: documento.arquivoHash,
    criadoEm: agora,
  });
  return documento;
}

/** Garante um registro para um contrato/termo derivado do mesmo orçamento sem
 * duplicar a biblioteca ao abrir a prévia várias vezes. */
export async function garantirDocumentoDerivadoDeOrcamento(input: {
  tipo: Extract<TipoDocumentoBiblioteca, 'contrato' | 'garantia' | 'conclusao'>;
  titulo: string;
  orcamentoId: string;
  numero: string;
  clienteId?: string;
  clienteNome: string;
  dados: Record<string, unknown>;
  assinado: boolean;
}): Promise<DocumentoBibliotecaRegistro> {
  const existente = await getDocumentoBibliotecaPorOrigem(input.tipo, 'orcamento', input.orcamentoId);
  const status: StatusDocumentoBiblioteca = input.assinado ? 'assinado' : 'pronto';
  if (!existente) {
    return criarDocumentoBiblioteca({
      tipo: input.tipo, titulo: input.titulo, clienteId: input.clienteId, clienteNome: input.clienteNome,
      origemTipo: 'orcamento', origemId: input.orcamentoId, origemNumero: input.numero,
      dados: input.dados, status,
    });
  }
  // Documento já enviado/assinado é um snapshot do que o cliente recebeu. Não
  // sobrescreva; a próxima edição deve virar revisão explícita.
  if (existente.status === 'enviado' || existente.status === 'assinado') return existente;
  return criarVersaoDocumentoBiblioteca(existente.id, input.dados, { status });
}

/**
 * Cria uma nova versão append-only. Versões enviadas/assinadas não são
 * sobrescritas; o documento atual aponta para o novo snapshot.
 */
export async function criarVersaoDocumentoBiblioteca(
  documentoId: string,
  dados: Record<string, unknown>,
  opcoes: { status?: StatusDocumentoBiblioteca; arquivoUri?: string; arquivoHash?: string; criadoPor?: string } = {},
): Promise<DocumentoBibliotecaRegistro> {
  const atual = await getDocumentoBiblioteca(documentoId);
  if (!atual) throw new Error('documento_nao_encontrado');
  const versoes = await getDocumentoBibliotecaVersoes(documentoId);
  const numero = Math.max(atual.versaoAtual, ...versoes.map(v => v.numeroVersao), 0) + 1;
  const agora = nowISO();
  const versao: DocumentoBibliotecaVersao = {
    id: generateId(), documentoId, numeroVersao: numero, dados: { ...dados },
    arquivoUri: opcoes.arquivoUri, arquivoHash: opcoes.arquivoHash, criadoEm: agora, criadoPor: opcoes.criadoPor,
  };
  await saveDocumentoBibliotecaVersao(versao);
  const atualizado: DocumentoBibliotecaRegistro = {
    ...atual,
    versaoAtual: numero,
    dados: { ...dados },
    arquivoUri: opcoes.arquivoUri ?? atual.arquivoUri,
    arquivoHash: opcoes.arquivoHash ?? atual.arquivoHash,
    status: opcoes.status ?? 'rascunho',
    atualizadoEm: agora,
  };
  await saveDocumentoBiblioteca(atualizado);
  return atualizado;
}

export async function atualizarStatusDocumentoBiblioteca(
  documentoId: string,
  status: StatusDocumentoBiblioteca,
): Promise<DocumentoBibliotecaRegistro> {
  const atual = await getDocumentoBiblioteca(documentoId);
  if (!atual) throw new Error('documento_nao_encontrado');
  const agora = nowISO();
  const atualizado: DocumentoBibliotecaRegistro = {
    ...atual,
    status,
    atualizadoEm: agora,
    enviadoEm: status === 'enviado' ? (atual.enviadoEm ?? agora) : atual.enviadoEm,
    assinadoEm: status === 'assinado' ? (atual.assinadoEm ?? agora) : atual.assinadoEm,
  };
  await saveDocumentoBiblioteca(atualizado);
  return atualizado;
}
