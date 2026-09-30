import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { supabaseStorageProvider } from './adapters/SupabaseStorageProvider';

export type ComprovantePagamento = {
  chave: string;
  hash: string;
  mime: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';
  tamanhoBytes: number;
  url: string;
};

const MIME_POR_EXTENSAO: Record<string, ComprovantePagamento['mime']> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
};

/** Faz upload de um comprovante local para o bucket privado, com hash do binário. */
export async function enviarComprovanteLocal(uri: string): Promise<ComprovantePagamento> {
  if (Platform.OS === 'web') throw new Error('No navegador, anexe o comprovante pela versão web.');
  if (!uri?.startsWith('file:')) throw new Error('Comprovante local inválido.');
  const FileSystem = require('expo-file-system/legacy');
  const info = await FileSystem.getInfoAsync(uri);
  if (!info?.exists || typeof info.size !== 'number' || info.size <= 0 || info.size > 20 * 1024 * 1024) {
    throw new Error('O comprovante precisa ter entre 1 byte e 20 MB.');
  }
  const extensao = (uri.split('?')[0].split('.').pop() ?? '').toLowerCase();
  const mime = MIME_POR_EXTENSAO[extensao] ?? 'image/jpeg';
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  if (!base64) throw new Error('Não foi possível ler o comprovante.');
  const bytes = base64ParaBytes(base64);
  if (!bytes) throw new Error('Comprovante inválido.');
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as unknown as BufferSource);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const enviado = await supabaseStorageProvider.enviar({
    categoria: 'anexo', conteudoBase64: base64, mimeType: mime, nome: uri.split('/').pop() ?? 'comprovante',
  });
  if (!enviado.ok) throw new Error('Não foi possível salvar o comprovante na nuvem.');
  return { chave: enviado.dados.chave, url: enviado.dados.url, hash, mime, tamanhoBytes: info.size };
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
  return bytes.length ? Uint8Array.from(bytes) : null;
}
