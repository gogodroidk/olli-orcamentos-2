import { Platform } from 'react-native';

/* ─── Conversão de imagem para data URI (multiplataforma) ─────────────
 * O HTML do PDF precisa de imagens embutidas como data URI:
 *  - No NATIVO (ios/android) URIs `file://` NÃO renderizam no expo-print,
 *    então lemos o arquivo via expo-file-system e montamos o base64.
 *  - Na WEB o expo-file-system não funciona; convertemos a URI
 *    (`blob:` / `data:` / `http(s):`) para data URL com fetch → blob → FileReader.
 *
 * Em qualquer falha retornamos `null` para o PDF seguir SEM a imagem
 * (nunca quebrar o documento por causa de uma foto/logo).
 */

const isWeb = Platform.OS === 'web';

/** Lê uma URI (web) e devolve um data URL (`data:...;base64,...`). */
async function webUriToDataUri(uri: string): Promise<string | null> {
  try {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
    if (!g || typeof g.fetch !== 'function' || typeof g.FileReader === 'undefined') {
      return null;
    }
    const res = await g.fetch(uri);
    if (!res || !res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new g.FileReader();
      reader.onloadend = () => {
        const r = reader.result;
        resolve(typeof r === 'string' && r.startsWith('data:') ? r : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Lê uma URI local (nativo) via expo-file-system e devolve um data URL. */
async function nativeUriToDataUri(uri: string): Promise<string | null> {
  try {
    // require dentro do ramo nativo: o módulo nunca é avaliado na web.
    const FileSystem = require('expo-file-system/legacy');
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    return null;
  }
}

/**
 * Converte uma URI de imagem em data URL embutível no HTML.
 * Retorna `null` se não houver URI ou a conversão falhar.
 */
export async function imagemParaDataUri(uri?: string): Promise<string | null> {
  if (!uri) return null;
  // Já é um data URL — usar como está em qualquer plataforma.
  if (uri.startsWith('data:')) return uri;
  return isWeb ? webUriToDataUri(uri) : nativeUriToDataUri(uri);
}
