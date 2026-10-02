import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SupportedStorage } from '@supabase/supabase-js';
import { AuthStorageSeguro, type RelogioSessao, type StorageSeguro } from './authStorageCore';
import { defasagemRelogioMs, registrarDefasagem } from './relogioServidor';

const secureStoreAdapter: StorageSeguro = {
  getItemAsync: (key) => SecureStore.getItemAsync(key, { keychainService: 'olli.supabase.auth' }),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, {
    keychainService: 'olli.supabase.auth',
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, { keychainService: 'olli.supabase.auth' }),
};

/**
 * Relógio da sessão: a defasagem medida pelo cabeçalho `Date` das respostas e
 * pelo `iat` dos tokens novos (services/relogioServidor.ts). É o que impede a
 * rajada de refresh num celular com data/hora errada (services/sessaoRelogio.ts).
 */
const relogioSessao: RelogioSessao = {
  agora: () => Date.now(),
  defasagemAtualMs: () => defasagemRelogioMs(),
  aoMedirDefasagem: (defasagemSeg, agoraMs) => registrarDefasagem(defasagemSeg * 1000, 'jwt', agoraMs),
};

/** Web mantém o storage do navegador; Android/iOS usam Keystore/Keychain. */
export const authStorage: SupportedStorage = Platform.OS === 'web'
  ? (AsyncStorage as SupportedStorage)
  : new AuthStorageSeguro(AsyncStorage, secureStoreAdapter, relogioSessao);
