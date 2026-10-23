/**
 * Opt-out do rastreio de uso ("Ajudar a melhorar o OLLI", Conta > Privacidade).
 * Parecer LEGAL 22/10: legítimo interesse com desativação visível, valendo a partir do momento.
 * Três estados (ligado | desligado | desconhecido): falha de leitura NÃO envia.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { interpretarPreferencia, type Preferencia } from './rastreioNucleo';

const CHAVE = 'olli.rastreio_uso';
let cache: Preferencia | null = null;

export async function lerPreferenciaRastreio(): Promise<Preferencia> {
  if (cache) return cache;
  try {
    const p = interpretarPreferencia(await AsyncStorage.getItem(CHAVE));
    cache = p;
    return p;
  } catch {
    return interpretarPreferencia(null, true); // não guarda em cache: tenta de novo no próximo envio
  }
}

export async function definirPreferenciaRastreio(ligado: boolean): Promise<boolean> {
  try {
    await AsyncStorage.setItem(CHAVE, ligado ? 'ligado' : 'desligado');
    cache = ligado ? 'ligado' : 'desligado';
    return true;
  } catch {
    return false; // a tela mostra "não consegui salvar" e mantém o switch como estava
  }
}
