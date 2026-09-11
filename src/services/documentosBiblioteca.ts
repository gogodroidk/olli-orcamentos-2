import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { supabaseStorageProvider } from './adapters/SupabaseStorageProvider';
import {
  getDocumentoBiblioteca,
  getDocumentoBibliotecaPorOrigem,
  getDocumentoBibliotecaVersoes,
  saveDocumentoBibliotecaComVersao,
  saveDocumentoBiblioteca,
} from '../database/database';
import type {
  DocumentoBibliotecaRegistro,
  DocumentoBibliotecaVersao,
  Recibo,
  OrdemServico,
  PmocPlano,
  PmocPlanoVersao,
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
  arquivoChave?: string;
  arquivoHash?: string;
  status?: StatusDocumentoBiblioteca;
};

const TRANSICOES_STATUS_DOCUMENTO: Readonly<Record<StatusDocumentoBiblioteca, readonly StatusDocumentoBiblioteca[]>> = {
  rascunho: ['rascunho', 'pronto', 'enviado', 'arquivado'],
  pronto: ['pronto', 'enviado', 'assinado', 'arquivado'],
  enviado: ['enviado', 'assinado', 'arquivado'],
  assinado: ['assinado', 'arquivado'],
  arquivado: ['arquivado'],
};

/**
 * Tenta promover um PDF local para o Storage privado. O arquivo local continua
 * sendo o fallback permanente (offline/web); quando o upload funciona, a chave
 * fica no registro e uma URL assinada é usada apenas para a sessão atual.
 */
async function promoverPdfParaStorage(arquivoUri?: string): Promise<{
  arquivoUri: string;
  arquivoChave: string;
  arquivoHash: string;
} | null> {
  if (!arquivoUri || Platform.OS === 'web' || !arquivoUri.startsWith('file:')) return null;
  try {
    // require dentro do caminho nativo: nenhum módulo de filesystem entra no bundle web.
    const FileSystem = require('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(arquivoUri);
    if (!info?.exists || typeof info.size !== 'number' || info.size <= 0 || info.size > 20 * 1024 * 1024) return null;
    const base64 = await FileSystem.readAsStringAsync(arquivoUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) return null;
    const bytes = base64ParaBytes(base64);
    if (!bytes) return null;
    // TS 6 tipa `Uint8Array` como ArrayBufferLike; o runtime do expo-crypto
    // aceita a view normalmente, então estreitamos aqui sem copiar o PDF.
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as unknown as BufferSource);
    const arquivoHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    const enviado = await supabaseStorageProvider.enviar({
      categoria: 'pdf',
      conteudoBase64: base64,
      mimeType: 'application/pdf',
      nome: arquivoUri.split('/').pop() ?? 'documento.pdf',
    });
    if (!enviado.ok) return null;
    return { arquivoUri: enviado.dados.url, arquivoChave: enviado.dados.chave, arquivoHash };
  } catch {
    return null;
  }
}

function base64ParaBytes(valor: string): Uint8Array | null {
  const limpo = valor.replace(/\s/g, '');
  if (!limpo || limpo.length % 4 === 1) return null;
  const tabela = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let acumulado = 0;
  let bits = 0;
  for (let i = 0; i < limpo.length; i += 1) {
    const caractere = limpo[i];
    if (caractere === '=') break;
    const valorCaractere = tabela.indexOf(caractere);
    if (valorCaractere < 0) return null;
    acumulado = (acumulado << 6) | valorCaractere;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acumulado >> bits) & 0xff);
    }
  }
  return bytes.length > 0 ? Uint8Array.from(bytes) : null;
}

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
    arquivoChave: input.arquivoChave,
    arquivoHash: input.arquivoHash,
    criadoEm: agora,
    atualizadoEm: agora,
  };
  const versaoInicial: DocumentoBibliotecaVersao = {
    id: generateId(), documentoId: documento.id, numeroVersao: 1,
    dados: documento.dados, arquivoUri: documento.arquivoUri, arquivoChave: documento.arquivoChave, arquivoHash: documento.arquivoHash,
    criadoEm: agora,
  };
  await saveDocumentoBibliotecaComVersao(documento, versaoInicial);
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
  if (JSON.stringify(existente.dados) === JSON.stringify(input.dados) && existente.status === status) return existente;
  return criarVersaoDocumentoBiblioteca(existente.id, input.dados, { status });
}

export async function garantirDocumentoRecibo(recibo: Recibo): Promise<DocumentoBibliotecaRegistro> {
  const existente = await getDocumentoBibliotecaPorOrigem('recibo', 'recibo', recibo.id);
  const dados = { recibo: { ...recibo } };
  if (existente) {
    if (['enviado', 'assinado', 'arquivado'].includes(existente.status)) return existente;
    if (JSON.stringify(existente.dados) === JSON.stringify(dados)) return existente;
    return criarVersaoDocumentoBiblioteca(existente.id, dados, { status: 'pronto' });
  }
  return criarDocumentoBiblioteca({
    tipo: 'recibo',
    titulo: `Recibo nº ${recibo.numero}`,
    clienteId: recibo.clienteId,
    clienteNome: recibo.clienteNome,
    origemTipo: 'recibo',
    origemId: recibo.id,
    origemNumero: recibo.numero,
    dados,
    status: 'pronto',
  });
}

export async function garantirDocumentoOrdemServico(os: OrdemServico): Promise<DocumentoBibliotecaRegistro> {
  const existente = await getDocumentoBibliotecaPorOrigem('ordem_servico', 'ordem_servico', os.id);
  const dados = { ordemServico: { ...os } };
  const status: StatusDocumentoBiblioteca = os.status === 'concluida' ? 'pronto' : 'rascunho';
  if (existente) {
    if (['enviado', 'assinado', 'arquivado'].includes(existente.status)) return existente;
    if (JSON.stringify(existente.dados) === JSON.stringify(dados) && existente.status === status) return existente;
    return criarVersaoDocumentoBiblioteca(existente.id, dados, { status });
  }
  return criarDocumentoBiblioteca({
    tipo: 'ordem_servico', titulo: `Relatório da OS ${os.numero}`, clienteId: os.clienteId,
    clienteNome: os.clienteNome, origemTipo: 'ordem_servico', origemId: os.id, origemNumero: os.numero,
    dados, status,
  });
}

export async function garantirDocumentoPmoc(plano: PmocPlano, versao: PmocPlanoVersao): Promise<DocumentoBibliotecaRegistro> {
  const existente = await getDocumentoBibliotecaPorOrigem('pmoc', 'pmoc', plano.id);
  const dados = { plano: { ...plano }, versao: { ...versao } };
  if (existente) {
    if (['enviado', 'assinado', 'arquivado'].includes(existente.status)) return existente;
    if (JSON.stringify(existente.dados) === JSON.stringify(dados)) return existente;
    return criarVersaoDocumentoBiblioteca(existente.id, dados, { status: 'pronto' });
  }
  return criarDocumentoBiblioteca({
    tipo: 'pmoc', titulo: plano.numero ? `PMOC ${plano.numero} · ${plano.titulo}` : `PMOC · ${plano.titulo}`,
    clienteId: plano.clienteId, clienteNome: '', origemTipo: 'pmoc', origemId: plano.id, origemNumero: plano.numero,
    dados, status: 'pronto',
  });
}

/**
 * Cria uma nova versão append-only. Versões enviadas/assinadas não são
 * sobrescritas; o documento atual aponta para o novo snapshot.
 */
export async function criarVersaoDocumentoBiblioteca(
  documentoId: string,
  dados: Record<string, unknown>,
  opcoes: { status?: StatusDocumentoBiblioteca; arquivoUri?: string; arquivoChave?: string; arquivoHash?: string; criadoPor?: string } = {},
): Promise<DocumentoBibliotecaRegistro> {
  const atual = await getDocumentoBiblioteca(documentoId);
  if (!atual) throw new Error('documento_nao_encontrado');
  const versoes = await getDocumentoBibliotecaVersoes(documentoId);
  const numero = Math.max(atual.versaoAtual, ...versoes.map(v => v.numeroVersao), 0) + 1;
  const agora = nowISO();
  const versao: DocumentoBibliotecaVersao = {
    id: generateId(), documentoId, numeroVersao: numero, dados: { ...dados },
    arquivoUri: opcoes.arquivoUri, arquivoChave: opcoes.arquivoChave, arquivoHash: opcoes.arquivoHash, criadoEm: agora, criadoPor: opcoes.criadoPor,
  };
  const atualizado: DocumentoBibliotecaRegistro = {
    ...atual,
    versaoAtual: numero,
    dados: { ...dados },
    arquivoUri: opcoes.arquivoUri ?? atual.arquivoUri,
    arquivoChave: opcoes.arquivoChave ?? atual.arquivoChave,
    arquivoHash: opcoes.arquivoHash ?? atual.arquivoHash,
    status: opcoes.status ?? 'rascunho',
    atualizadoEm: agora,
  };
  await saveDocumentoBibliotecaComVersao(atualizado, versao);
  return atualizado;
}

export async function atualizarStatusDocumentoBiblioteca(
  documentoId: string,
  status: StatusDocumentoBiblioteca,
): Promise<DocumentoBibliotecaRegistro> {
  const atual = await getDocumentoBiblioteca(documentoId);
  if (!atual) throw new Error('documento_nao_encontrado');
  if (!TRANSICOES_STATUS_DOCUMENTO[atual.status].includes(status)) {
    throw new Error('transicao_status_documento_invalida');
  }
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

/** Marca que a exportação foi concluída. No web `arquivoUri` pode faltar porque
 * o navegador controla o destino do print; o status ainda fica rastreável. */
export async function registrarArtefatoDocumentoBiblioteca(
  documentoId: string,
  arquivoUri?: string,
  arquivoHash?: string,
): Promise<DocumentoBibliotecaRegistro> {
  const atual = await getDocumentoBiblioteca(documentoId);
  if (!atual) throw new Error('documento_nao_encontrado');
  // Depois de enviado/assinado/arquivado o artefato é evidência congelada.
  // Uma segunda via nunca substitui silenciosamente o PDF que o cliente recebeu;
  // o caminho correto é uma nova versão do documento.
  if (['enviado', 'assinado', 'arquivado'].includes(atual.status)) {
    return atual;
  }
  const remoto = await promoverPdfParaStorage(arquivoUri);
  const agora = nowISO();
  const atualizado: DocumentoBibliotecaRegistro = {
    ...atual,
    status: atual.status === 'assinado' ? 'assinado' : 'enviado',
    arquivoUri: remoto?.arquivoUri ?? arquivoUri ?? atual.arquivoUri,
    arquivoChave: remoto?.arquivoChave ?? atual.arquivoChave,
    arquivoHash: remoto?.arquivoHash ?? arquivoHash ?? atual.arquivoHash,
    enviadoEm: atual.enviadoEm ?? agora,
    atualizadoEm: agora,
  };
  await saveDocumentoBiblioteca(atualizado);
  return atualizado;
}
