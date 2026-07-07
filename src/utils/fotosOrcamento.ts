import { Linking, Platform } from 'react-native';

/* ─── Fotos do orçamento (tirar na hora / anexar da galeria) ──────────
 * Fluxo: ImagePicker (câmera OU galeria) → comprime com expo-image-manipulator
 * (máx. 1280px, JPEG 0.7) → COPIA para documentDirectory/fotos-orcamento/ com
 * expo-file-system.
 *
 * Por que copiar? A URI que o picker devolve é TEMPORÁRIA (cache do picker/
 * câmera) — pode ser limpa pelo SO a qualquer momento. Se guardássemos essa
 * URI direto no orçamento, a foto sumiria depois de um tempo (ou no próximo
 * boot). Copiando para documentDirectory a foto fica persistente enquanto o
 * app existir, igual ao padrão já usado para PDFs em exportarDocumento.ts.
 *
 * Tudo aqui é NATIVO (câmera/galeria/filesystem não existem na web) — todo
 * módulo nativo é `require`ado dentro das funções (nunca no topo do arquivo),
 * seguindo a lição do crash Hermes: um import de módulo-escopo que não roda
 * em todas as plataformas pode derrubar o app inteiro no boot.
 *
 * NUVEM (futuro): estas URIs são locais ao aparelho — não valem em outro
 * device. Não sobem no sync per-row hoje. Quando existir um bucket de storage
 * (Supabase Storage), trocar aqui por upload + URL pública, mantendo a mesma
 * assinatura para o restante do app não mudar.
 */

export const MAX_FOTOS_ORCAMENTO = 6;
export const PASTA_FOTOS = 'fotos-orcamento/';

const LARGURA_MAX = 1280;
const QUALIDADE_JPEG = 0.7;

export interface ResultadoFoto {
  /** URIs adicionadas com sucesso (já persistentes em documentDirectory). */
  uris: string[];
  /** Mensagem de erro amigável, se algo deu errado (permissão negada, etc). */
  erro?: string;
}

/** Diretório onde as fotos de orçamento ficam salvas, com barra final. */
function pastaFotos(): string {
  // require preguiçoso: expo-file-system não roda na web.
  const FileSystem = require('expo-file-system/legacy');
  return `${FileSystem.documentDirectory}${PASTA_FOTOS}`;
}

async function garantirPasta(): Promise<void> {
  const FileSystem = require('expo-file-system/legacy');
  const dir = pastaFotos();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/**
 * Comprime (máx. 1280px de largura, JPEG 0.7) e copia a URI temporária do
 * picker para um arquivo permanente em documentDirectory/fotos-orcamento/.
 * Retorna a URI final ou `null` se algo falhar (imagem corrompida etc.) —
 * o chamador decide se ignora a foto ou avisa o usuário.
 */
async function processarECopiar(uriOrigem: string): Promise<string | null> {
  try {
    const { manipulateAsync, SaveFormat } = require('expo-image-manipulator');
    const FileSystem = require('expo-file-system/legacy');

    const manipulada = await manipulateAsync(
      uriOrigem,
      [{ resize: { width: LARGURA_MAX } }],
      { compress: QUALIDADE_JPEG, format: SaveFormat.JPEG },
    );

    await garantirPasta();
    const nomeArquivo = `foto-${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
    const destino = `${pastaFotos()}${nomeArquivo}`;
    await FileSystem.copyAsync({ from: manipulada.uri, to: destino });
    return destino;
  } catch (e) {
    if (__DEV__) console.warn('[fotosOrcamento] falha ao processar foto:', e);
    return null;
  }
}

/** Quantas fotos ainda cabem até o limite de MAX_FOTOS_ORCAMENTO. */
function vagasRestantes(fotosAtuais: string[]): number {
  return Math.max(0, MAX_FOTOS_ORCAMENTO - fotosAtuais.length);
}

/**
 * Abre a câmera, tira 1 foto, comprime e copia para storage permanente.
 * Se a permissão de câmera for negada, retorna mensagem orientando o usuário
 * a liberar em Ajustes (com atalho via Linking.openSettings).
 */
export async function adicionarFotoCamera(fotosAtuais: string[]): Promise<ResultadoFoto> {
  if (vagasRestantes(fotosAtuais) <= 0) {
    return { uris: [], erro: `Limite de ${MAX_FOTOS_ORCAMENTO} fotos por orçamento atingido.` };
  }

  try {
    const ImagePicker = require('expo-image-picker');

    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (permissao.status !== 'granted') {
      return {
        uris: [],
        erro: permissao.canAskAgain === false
          ? 'PERMISSAO_NEGADA_PERMANENTE'
          : 'Precisamos da câmera para fotografar o serviço.',
      };
    }

    const resultado = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });

    if (resultado.canceled || !resultado.assets?.length) {
      return { uris: [] };
    }

    const uriFinal = await processarECopiar(resultado.assets[0].uri);
    if (!uriFinal) {
      return { uris: [], erro: 'Não foi possível salvar a foto. Tente novamente.' };
    }
    return { uris: [uriFinal] };
  } catch (e) {
    if (__DEV__) console.warn('[fotosOrcamento] adicionarFotoCamera falhou:', e);
    return { uris: [], erro: 'Não foi possível abrir a câmera.' };
  }
}

/**
 * Abre a galeria, permite selecionar várias fotos (respeitando o limite
 * de 6 por orçamento), comprime e copia todas para storage permanente.
 */
export async function adicionarFotoGaleria(fotosAtuais: string[]): Promise<ResultadoFoto> {
  const vagas = vagasRestantes(fotosAtuais);
  if (vagas <= 0) {
    return { uris: [], erro: `Limite de ${MAX_FOTOS_ORCAMENTO} fotos por orçamento atingido.` };
  }

  try {
    const ImagePicker = require('expo-image-picker');

    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissao.status !== 'granted') {
      return {
        uris: [],
        erro: permissao.canAskAgain === false
          ? 'PERMISSAO_NEGADA_PERMANENTE'
          : 'Precisamos de acesso às suas fotos para anexar imagens.',
      };
    }

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: vagas,
    });

    if (resultado.canceled || !resultado.assets?.length) {
      return { uris: [] };
    }

    // Selecionada mais imagens do que o restante permite (o picker às vezes
    // não respeita selectionLimit em todo dispositivo) — corta no limite.
    const escolhidas = resultado.assets.slice(0, vagas);
    const processadas = await Promise.all(escolhidas.map((a: { uri: string }) => processarECopiar(a.uri)));
    const uris = processadas.filter((u: string | null): u is string => !!u);

    if (uris.length === 0) {
      return { uris: [], erro: 'Não foi possível salvar as fotos selecionadas.' };
    }
    return { uris };
  } catch (e) {
    if (__DEV__) console.warn('[fotosOrcamento] adicionarFotoGaleria falhou:', e);
    return { uris: [], erro: 'Não foi possível abrir a galeria.' };
  }
}

/**
 * Remove uma foto do orçamento: apaga o arquivo físico (idempotente — não
 * lança se já não existir) e retorna a lista atualizada de URIs.
 */
export async function removerFoto(fotosAtuais: string[], uri: string): Promise<string[]> {
  try {
    const FileSystem = require('expo-file-system/legacy');
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    if (__DEV__) console.warn('[fotosOrcamento] falha ao apagar arquivo (ignorado):', e);
  }
  return fotosAtuais.filter(f => f !== uri);
}

/**
 * Abre as configurações do app (Ajustes → OLLI → Permissões) para o usuário
 * liberar câmera/galeria manualmente, quando a permissão foi negada de forma
 * permanente ("não perguntar novamente"). Nunca lança.
 */
export async function abrirConfiguracoesPermissao(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await Linking.openSettings();
  } catch (e) {
    if (__DEV__) console.warn('[fotosOrcamento] não consegui abrir configurações:', e);
  }
}
