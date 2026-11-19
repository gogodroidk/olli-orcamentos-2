/**
 * Chave remota da navegação v1.3 (CQ-APP-13-B). Lê no boot o último valor
 * guardado e, em segundo plano, pergunta ao Worker para o PRÓXIMO boot.
 * Nunca lança: falha = fica com o que estava.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { aplicarChaveRemotaSalva, chaveRemotaDesliga } from './uiFlags';

const CHAVE = 'olli:ui_v2_nav_remoto';

export async function carregarChaveRemotaUi(): Promise<void> {
  try {
    aplicarChaveRemotaSalva(await AsyncStorage.getItem(CHAVE));
  } catch {
    // armazenamento indisponível: vale o build
  }
}

export async function atualizarChaveRemotaUi(base: string, fetchImpl: typeof fetch = fetch, prazoMs = 5000): Promise<void> {
  if (!base) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), prazoMs);
  try {
    const r = await fetchImpl(`${base}/app/versao-minima`, { signal: ctrl.signal });
    if (!r.ok) return;
    const desliga = chaveRemotaDesliga(await r.json());
    if (desliga === null) return;
    await AsyncStorage.setItem(CHAVE, desliga ? 'desligada' : 'ligada');
  } catch {
    // rede fora: mantém o último valor conhecido
  } finally {
    clearTimeout(t);
  }
}
