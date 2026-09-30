import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SupportedStorage } from '@supabase/supabase-js';
import { AuthStorageSeguro, type StorageSeguro } from './authStorageCore';

const secureStoreAdapter: StorageSeguro = {
  getItemAsync: (key) => SecureStore.getItemAsync(key, { keychainService: 'olli.supabase.auth' }),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, {
    keychainService: 'olli.supabase.auth',
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, { keychainService: 'olli.supabase.auth' }),
};

/** Web mantém o storage do navegador; Android/iOS usam Keystore/Keychain. */
export const authStorage: SupportedStorage = Platform.OS === 'web'
  ? (AsyncStorage as SupportedStorage)
  : new AuthStorageSeguro(AsyncStorage, secureStoreAdapter);
