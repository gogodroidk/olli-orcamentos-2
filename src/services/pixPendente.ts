/**
 * AsyncStorage do "Pagar depois" (regra pura em utils/pixPendente.ts).
 * Best-effort: falha de leitura = cartão não aparece (a pessoa ainda pode gerar outro Pix em Planos);
 * nunca lança.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PIX_PENDENTE_KEY } from './storageKeys';
import { lerPixPendente, paraGuardar } from '../utils/pixPendente';
import type { CobrancaPixPlano } from './pixPlano';

export async function guardarPixPendente(c: CobrancaPixPlano, userId: string): Promise<void> {
  const g = paraGuardar(c, userId);
  try {
    if (g) await AsyncStorage.setItem(PIX_PENDENTE_KEY, JSON.stringify(g));
    else await AsyncStorage.removeItem(PIX_PENDENTE_KEY);
  } catch {
    // sem gravação: só perde o atalho do cartão
  }
}

export async function buscarPixPendente(userId: string): Promise<CobrancaPixPlano | null> {
  try {
    const raw = await AsyncStorage.getItem(PIX_PENDENTE_KEY);
    if (!raw) return null;
    const c = lerPixPendente(JSON.parse(raw), userId);
    if (!c) await AsyncStorage.removeItem(PIX_PENDENTE_KEY);
    return c;
  } catch {
    return null;
  }
}

export async function esquecerPixPendente(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PIX_PENDENTE_KEY);
  } catch {
    // nada a fazer: vence sozinho pela validade
  }
}
