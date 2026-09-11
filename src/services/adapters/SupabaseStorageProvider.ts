import type {
  ArquivoArmazenado,
  CategoriaArquivo,
  EnviarArquivoInput,
  StorageProvider,
} from '../ports/StorageProvider';
import type { MotivoFalhaPorta, ResultadoPorta } from '../ports/comum';
import { supabase } from '../supabase';

const BUCKET: Record<CategoriaArquivo, string> = {
  logo: 'olli-logos',
  foto_servico: 'olli-fotos',
  pdf: 'olli-documentos',
  anexo: 'olli-documentos',
};

const LIMITE_BYTES: Record<CategoriaArquivo, number> = {
  logo: 5 * 1024 * 1024,
  foto_servico: 10 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
  anexo: 20 * 1024 * 1024,
};

const MIME_PERMITIDO: Record<CategoriaArquivo, ReadonlySet<string>> = {
  logo: new Set(['image/png', 'image/jpeg', 'image/webp']),
  foto_servico: new Set(['image/png', 'image/jpeg', 'image/webp']),
  pdf: new Set(['application/pdf']),
  anexo: new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
};

const EXTENSAO: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function falha<T>(motivo: MotivoFalhaPorta, mensagem?: string): ResultadoPorta<T> {
  return { ok: false, motivo, mensagem };
}

function bytesDeBase64(valor: string): Uint8Array | null {
  try {
    // Hermes/RN não garante `atob` no global. Decodificar aqui, sem polyfill
    // global, mantém o provider determinístico no Android, no iOS e na web.
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
  } catch {
    return null;
  }
}

function separarChave(chave: string): { bucket: string; caminho: string } | null {
  const indice = chave.indexOf('/');
  if (indice <= 0 || indice === chave.length - 1) return null;
  const bucket = chave.slice(0, indice);
  const caminho = chave.slice(indice + 1);
  if (!Object.values(BUCKET).includes(bucket) || caminho.includes('..')) return null;
  return { bucket, caminho };
}

export class SupabaseStorageProvider implements StorageProvider {
  disponivel(): boolean {
    return supabase !== null;
  }

  async enviar(input: EnviarArquivoInput): Promise<ResultadoPorta<ArquivoArmazenado>> {
    if (!supabase) return falha('nao_configurado');
    if (!MIME_PERMITIDO[input.categoria].has(input.mimeType)) return falha('invalido', 'Tipo de arquivo não permitido.');
    const conteudo = bytesDeBase64(input.conteudoBase64);
    if (!conteudo || conteudo.byteLength === 0) return falha('invalido', 'Arquivo vazio ou inválido.');
    if (conteudo.byteLength > LIMITE_BYTES[input.categoria]) return falha('invalido', 'Arquivo acima do limite permitido.');

    const { data: auth, error: erroAuth } = await supabase.auth.getUser();
    if (erroAuth || !auth.user) return falha('auth');
    const tenantId = input.tenantId?.trim() || auth.user.id;
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return falha('invalido', 'Tenant inválido.');

    const bucket = BUCKET[input.categoria];
    const caminho = `${tenantId}/${input.categoria}/${crypto.randomUUID()}.${EXTENSAO[input.mimeType] ?? 'bin'}`;
    const { error } = await supabase.storage.from(bucket).upload(caminho, conteudo, {
      contentType: input.mimeType,
      cacheControl: '3600',
      upsert: false,
    });
    if (error) return falha(error.message.toLowerCase().includes('unauthorized') ? 'auth' : 'servidor');

    const url = await this.urlDe(`${bucket}/${caminho}`);
    if (!url.ok) return url;
    return {
      ok: true,
      dados: { chave: `${bucket}/${caminho}`, url: url.dados.url, tamanhoBytes: conteudo.byteLength },
    };
  }

  async urlDe(chave: string): Promise<ResultadoPorta<{ url: string }>> {
    if (!supabase) return falha('nao_configurado');
    const alvo = separarChave(chave);
    if (!alvo) return falha('invalido');
    const { data, error } = await supabase.storage.from(alvo.bucket).createSignedUrl(alvo.caminho, 60 * 60);
    if (error || !data?.signedUrl) return falha(error?.message.toLowerCase().includes('unauthorized') ? 'auth' : 'servidor');
    return { ok: true, dados: { url: data.signedUrl } };
  }

  async remover(chave: string): Promise<void> {
    if (!supabase) return;
    const alvo = separarChave(chave);
    if (!alvo) return;
    await supabase.storage.from(alvo.bucket).remove([alvo.caminho]);
  }
}

export const supabaseStorageProvider = new SupabaseStorageProvider();
