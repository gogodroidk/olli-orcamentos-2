/**
 * Retomada da câmera da OS — a ligação com o aparelho. A regra (quando reabrir,
 * quando NÃO tocar no resultado pendente) mora em `capturaFotoOS.ts`, testada.
 *
 * Fluxo:
 *  OrdemServicoScreen.tirarFoto → marcarCapturaOS() → câmera → limparCapturaOS()
 *  Se o Android matar o app no meio: App.tsx (onReady) → retomarCapturaOSInterrompida()
 *  → anexa a foto pendente à OS → navega para OrdemServico { ordemId }.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  retomarCapturaInterrompida,
  serializarMarcador,
  type OrigemCaptura,
  type ResultadoPendentePicker,
  type Retomada,
} from './capturaFotoOS';
import { CAPTURA_OS_KEY } from './storageKeys';

/** Grava "estou fotografando para a OS X" ANTES de abrir a câmera/galeria. Nunca lança. */
export async function marcarCapturaOS(ordemId: string, origem: OrigemCaptura): Promise<void> {
  try {
    await AsyncStorage.setItem(CAPTURA_OS_KEY, serializarMarcador(ordemId, origem, Date.now()));
  } catch {
    // sem marcador a foto ainda é tirada; só perde a retomada se o app morrer
  }
}

/** A câmera voltou normalmente: o marcador já não é necessário. Nunca lança. */
export async function limparCapturaOS(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CAPTURA_OS_KEY);
  } catch {
    // best-effort
  }
}

/**
 * Chamado no boot (navegação pronta). Se a câmera tinha matado o app, recupera a
 * foto, anexa à OS e devolve qual OS reabrir. Nunca lança.
 */
export async function retomarCapturaOSInterrompida(): Promise<Retomada> {
  try {
    return await retomarCapturaInterrompida({
      lerMarcador: () => AsyncStorage.getItem(CAPTURA_OS_KEY),
      apagarMarcador: () => AsyncStorage.removeItem(CAPTURA_OS_KEY),
      resultadoPendente: async () => {
        // Só o Android devolve resultado pendente; nos outros é sempre null.
        if (Platform.OS !== 'android') return null;
        const ImagePicker = require('expo-image-picker');
        return (await ImagePicker.getPendingResultAsync()) as ResultadoPendentePicker;
      },
      processar: async (uri) => {
        const { processarFotoTemporaria } = await import('../utils/fotosOrcamento');
        return processarFotoTemporaria(uri);
      },
      anexar: async (ordemId, uri) => {
        const { adicionarFotoOS } = await import('./ordemServico');
        await adicionarFotoOS(ordemId, uri);
        const { registrarFotoParaEnvio, enviarFotosPendentes } = await import('./filaFotosNativa');
        await registrarFotoParaEnvio(ordemId, uri);
        void enviarFotosPendentes();
      },
      agora: () => Date.now(),
    });
  } catch {
    return { tipo: 'nada' };
  }
}
