import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * onboarding.ts — controle persistido da Central de Ajuda + onboarding (Frente 3).
 *
 * Três estados, todos em AsyncStorage:
 *  - `ajudaAtiva`     : liga/desliga a Central de Ajuda e as dicas contextuais.
 *  - `onboardingVisto`: se o cadastro guiado (OnboardingScreen) já foi concluído/pulado.
 *  - `dicasVistas`    : conjunto de ids de DicaContextual já dispensadas ("entendi").
 *
 * TODAS são preferências deste APARELHO, não dado da conta — mesmo raciocínio já
 * documentado para `ONBOARDED_KEY` em OnboardingScreen.tsx (que este módulo agora
 * possui como fonte única): quem usa este aparelho já viu a introdução e as
 * dicas, seja qual for a conta logada no momento. Por isso NÃO entram em
 * `storageKeys.APP_DATA_STORAGE_KEYS` — sobrevivem ao logout/troca de conta.
 *
 * Cache em memória evita ida ao AsyncStorage a cada render de DicaContextual
 * (que pode aparecer várias vezes na mesma tela).
 */

/** Chave canônica "onboarding concluído/pulado". Reexportada por OnboardingScreen.tsx. */
export const ONBOARDED_KEY = 'olli.onboarded';

/** '0' desliga a Central de Ajuda/dicas; ausente ou '1' = ligada (default true). */
const AJUDA_ATIVA_KEY = 'olli.ajuda.ativa';

/** JSON string[] com os ids de DicaContextual já dispensadas ("entendi"). */
const DICAS_VISTAS_KEY = 'olli.ajuda.dicasVistas';

let cacheAtiva: boolean | null = null;
let cacheDicas: Set<string> | null = null;

/** `true` se a Central de Ajuda/dicas contextuais estão ligadas (default: sim). */
export async function estaAtiva(): Promise<boolean> {
  if (cacheAtiva !== null) return cacheAtiva;
  try {
    const v = await AsyncStorage.getItem(AJUDA_ATIVA_KEY);
    cacheAtiva = v !== '0';
  } catch {
    cacheAtiva = true; // falha de leitura nunca esconde a ajuda
  }
  return cacheAtiva;
}

/** Liga a Central de Ajuda/dicas contextuais. */
export async function ligarAjuda(): Promise<void> {
  cacheAtiva = true;
  try { await AsyncStorage.setItem(AJUDA_ATIVA_KEY, '1'); } catch { /* best-effort */ }
}

/** Desliga a Central de Ajuda/dicas contextuais (o menu "Ajuda" continua acessível). */
export async function desligarAjuda(): Promise<void> {
  cacheAtiva = false;
  try { await AsyncStorage.setItem(AJUDA_ATIVA_KEY, '0'); } catch { /* best-effort */ }
}

async function carregarDicasVistas(): Promise<Set<string>> {
  if (cacheDicas) return cacheDicas;
  try {
    const raw = await AsyncStorage.getItem(DICAS_VISTAS_KEY);
    cacheDicas = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    cacheDicas = new Set<string>();
  }
  return cacheDicas;
}

/** `true` se a dica `id` já foi dispensada ("entendi") neste aparelho. */
export async function dicaFoiVista(id: string): Promise<boolean> {
  const dicas = await carregarDicasVistas();
  return dicas.has(id);
}

/** Marca a dica `id` como vista para sempre (idempotente). */
export async function marcarDicaVista(id: string): Promise<void> {
  const dicas = await carregarDicasVistas();
  if (dicas.has(id)) return;
  dicas.add(id);
  try { await AsyncStorage.setItem(DICAS_VISTAS_KEY, JSON.stringify(Array.from(dicas))); } catch { /* best-effort */ }
}

/** `true` se o onboarding (cadastro guiado) já foi concluído ou pulado. */
export async function onboardingFoiVisto(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(ONBOARDED_KEY)) === '1'; } catch { return false; }
}

/** Marca o onboarding como concluído/pulado (idempotente). Usado pela OnboardingScreen. */
export async function marcarVisto(): Promise<void> {
  try { await AsyncStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* best-effort */ }
}

/**
 * Reseta TODA a experiência de ajuda deste aparelho: religa a Central de Ajuda,
 * esquece as dicas já vistas e faz o onboarding rodar de novo no próximo início
 * do app. Pensado para um botão "Rever apresentação e dicas" em Conta.
 */
export async function resetarAjuda(): Promise<void> {
  cacheAtiva = true;
  cacheDicas = new Set<string>();
  try {
    await AsyncStorage.multiRemove([AJUDA_ATIVA_KEY, DICAS_VISTAS_KEY, ONBOARDED_KEY]);
  } catch {
    /* best-effort — pior caso, o usuário tenta de novo */
  }
}
