import * as ImagePicker from 'expo-image-picker';
import { fotoPerfilEscolhidaParaDataUri } from './imagemPortatil';

export type ResultadoEscolhaFoto =
  | { ok: true; dataUri: string }
  | { ok: false; motivo: 'cancelado' }
  | { ok: false; motivo: 'permissao'; permanente: boolean; mensagem: string }
  | { ok: false; motivo: 'erro'; mensagem: string };

/**
 * Foto de perfil quadrada, já em data URI pequeno.
 * O recorte 1:1 é o do sistema (câmera/galeria). Sem isso a foto saía
 * `file://` e só existia naquele aparelho.
 */
export async function escolherFotoPerfil(fonte: 'camera' | 'galeria'): Promise<ResultadoEscolhaFoto> {
  const permissao = fonte === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permissao.status !== 'granted') {
    return {
      ok: false,
      motivo: 'permissao',
      permanente: permissao.canAskAgain === false,
      mensagem: fonte === 'camera'
        ? 'Precisamos da câmera para tirar sua foto.'
        : 'Precisamos acessar as fotos para escolher a sua.',
    };
  }

  const opcoes = { allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.8 };
  const escolhida = fonte === 'camera'
    ? await ImagePicker.launchCameraAsync(opcoes)
    : await ImagePicker.launchImageLibraryAsync(opcoes);
  if (escolhida.canceled || !escolhida.assets?.[0]) return { ok: false, motivo: 'cancelado' };

  const convertido = await fotoPerfilEscolhidaParaDataUri(escolhida.assets[0]);
  if (!convertido.ok) return { ok: false, motivo: 'erro', mensagem: convertido.erro };
  return { ok: true, dataUri: convertido.dataUri };
}
