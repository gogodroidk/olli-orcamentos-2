import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

/** Limites compartilhados com o painel web (`logoUpload.ts`). */
export const IMAGEM_IDENTIDADE_MAX_DIMENSAO = 512;
export const IMAGEM_IDENTIDADE_MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
export const IMAGEM_IDENTIDADE_MAX_DATA_URI_CHARS = 512 * 1024;

export type ResultadoImagemPortatil =
  | { ok: true; dataUri: string }
  | { ok: false; erro: string };

function dataUri(mime: 'png' | 'jpeg', base64?: string): string | null {
  return base64 ? `data:image/${mime};base64,${base64}` : null;
}

function cabeNoCadastro(valor: string | null): valor is string {
  return !!valor && valor.length <= IMAGEM_IDENTIDADE_MAX_DATA_URI_CHARS;
}

/**
 * Converte uma imagem escolhida pelo usuário em conteúdo portátil e limitado.
 *
 * `file://` e `content://` pertencem ao aparelho que escolheu a foto: se forem
 * sincronizados como logo/assinatura, outro celular e o painel recebem um caminho
 * que não existe. Por isso a identidade pequena vive como `data:` URI no blob RLS
 * de `empresa.dados`. Fotos grandes de serviço/anexos continuam fora deste
 * contrato e devem usar Storage privado em uma etapa própria.
 *
 * Nunca lança. Primeiro preserva transparência em PNG; se o resultado ainda for
 * grande, tenta JPEG compactado. A dimensão e o tamanho máximos protegem SQLite,
 * sync, PDF e memória do aparelho.
 */
export async function imagemEscolhidaParaDataUri(
  asset: ImagePickerAsset,
): Promise<ResultadoImagemPortatil> {
  try {
    if (!asset?.uri || (asset.type && asset.type !== 'image')) {
      return { ok: false, erro: 'Escolha um arquivo de imagem válido.' };
    }
    if (
      typeof asset.fileSize === 'number'
      && asset.fileSize > IMAGEM_IDENTIDADE_MAX_ORIGINAL_BYTES
    ) {
      return {
        ok: false,
        erro: 'A imagem original passa de 10 MB. Escolha uma versão menor ou recortada.',
      };
    }

    const contexto = ImageManipulator.manipulate(asset.uri);
    const largura = Number(asset.width) || 0;
    const altura = Number(asset.height) || 0;
    if (Math.max(largura, altura) > IMAGEM_IDENTIDADE_MAX_DIMENSAO) {
      contexto.resize(
        largura >= altura
          ? { width: IMAGEM_IDENTIDADE_MAX_DIMENSAO, height: null }
          : { width: null, height: IMAGEM_IDENTIDADE_MAX_DIMENSAO },
      );
    }

    const imagem = await contexto.renderAsync();
    const png = await imagem.saveAsync({ base64: true, format: SaveFormat.PNG, compress: 1 });
    const pngUri = dataUri('png', png.base64);
    if (cabeNoCadastro(pngUri)) return { ok: true, dataUri: pngUri };

    // Logos fotográficos podem explodir em PNG. Duas tentativas limitadas evitam
    // loops e preservam qualidade suficiente para cabeçalho/assinatura em PDF.
    for (const compress of [0.82, 0.65]) {
      const jpeg = await imagem.saveAsync({ base64: true, format: SaveFormat.JPEG, compress });
      const jpegUri = dataUri('jpeg', jpeg.base64);
      if (cabeNoCadastro(jpegUri)) return { ok: true, dataUri: jpegUri };
    }

    return {
      ok: false,
      erro: 'Não consegui deixar a imagem leve o bastante. Recorte-a e tente novamente.',
    };
  } catch {
    return {
      ok: false,
      erro: 'Não consegui processar essa imagem. Escolha outra foto e tente novamente.',
    };
  }
}
