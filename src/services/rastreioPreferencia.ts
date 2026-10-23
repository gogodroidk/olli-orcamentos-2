/**
 * Opt-out do rastreio de uso ("Ajudar a melhorar o OLLI", Conta > Privacidade).
 * Parecer LEGAL 22/10 + condições do #214 (24/10): a escolha vive NA CONTA (servidor), vale em qualquer aparelho e
 * desde o 1º evento — o app só envia depois de LER a preferência no servidor. Três estados: ligado | desligado |
 * desconhecido (sem rede, sem login, erro): desconhecido NÃO envia. O aparelho guarda só um espelho para o
 * caso "desligado" (se o servidor não responder, quem desligou continua sem enviar).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser, supabase } from './supabase';
import { interpretarPreferencia, type Preferencia } from './rastreioNucleo';

const CHAVE_ESPELHO = 'olli.rastreio_uso.espelho';
const VALIDADE_MS = 10 * 60 * 1000;
let cache: { valor: Preferencia; em: number } | null = null;

async function lerEspelho(): Promise<'desligado' | null> {
  try {
    return (await AsyncStorage.getItem(CHAVE_ESPELHO)) === 'desligado' ? 'desligado' : null;
  } catch {
    return null;
  }
}

/** Lê a preferência da CONTA. Erro/sem rede/sem login = 'desconhecido' (não envia). */
export async function lerPreferenciaRastreio(): Promise<Preferencia> {
  if (cache && Date.now() - cache.em < VALIDADE_MS) return cache.valor;
  if (!supabase || !(await getCurrentUser())) return 'desconhecido';
  try {
    const { data, error } = await supabase.rpc('rastreio_uso_ativo');
    if (error || typeof data !== 'boolean') return (await lerEspelho()) ?? 'desconhecido';
    const valor: Preferencia = data ? 'ligado' : 'desligado';
    cache = { valor, em: Date.now() };
    try { await AsyncStorage.setItem(CHAVE_ESPELHO, valor); } catch { /* espelho é best-effort */ }
    return valor;
  } catch {
    return (await lerEspelho()) ?? 'desconhecido';
  }
}

/** Grava na CONTA. Só devolve true se o servidor confirmou (o switch não muda sem isso). Desligar apaga o já coletado. */
export async function definirPreferenciaRastreio(ligado: boolean): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('rastreio_uso_definir', { p_ativo: ligado });
    if (error || data !== ligado) return false;
    cache = { valor: ligado ? 'ligado' : 'desligado', em: Date.now() };
    try { await AsyncStorage.setItem(CHAVE_ESPELHO, ligado ? 'ligado' : 'desligado'); } catch { /* idem */ }
    return true;
  } catch {
    return false;
  }
}

/** Logout/troca de conta: esquece o cache (a preferência é da CONTA, não do aparelho). */
export function esquecerPreferenciaRastreio(): void {
  cache = null;
  void AsyncStorage.removeItem(CHAVE_ESPELHO).catch(() => {});
}

export { interpretarPreferencia };
