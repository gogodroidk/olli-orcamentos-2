import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated, Platform, AppState } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, useCores, comAlfa } from '../../theme';
import { Motion, useReducedMotion } from '../../theme/motion';
import { SUPABASE_URL } from '../../config';

/**
 * BarraOffline — faixa persistente e discreta do MODO TÉCNICO (Frente 5). O
 * técnico em campo precisa confiar que o toque dele não sumiu: esta faixa
 * mostra offline / sincronizando / tudo salvo, com contagem de pendências.
 *
 * NÃO lê filas internas do cloudSync.ts (arquivo proibido nesta frente — o
 * INTEGRADOR o edita, e ele não expõe fila/contador de push hoje). Em vez
 * disso, expõe seu PRÓPRIO contador de operações em voo: quem muta uma OS
 * (TecnicoHomeScreen/CardOS) envolve a chamada em `comPendencia(...)` — a
 * barra soma ao anunciar, subtrai ao resolver (sucesso OU erro). É o sinal
 * mais honesto disponível sem tocar arquivos fora do escopo desta frente.
 *
 * Conectividade: sem dependência nova (sem NetInfo no projeto). No web usa
 * `navigator.onLine` + eventos 'online'/'offline' (API nativa do browser,
 * sem risco de CORS). No nativo, sonda o próprio backend (Supabase) com um
 * HEAD + timeout: qualquer resposta HTTP — mesmo 404/500 — já prova que a
 * rede está de pé (só um erro de fetch/abort conta como offline).
 */

// ─── Pendências (pub/sub em módulo, escopado a este arquivo) ─────────────
let pendentes = 0;
type Ouvinte = (n: number) => void;
const ouvintes = new Set<Ouvinte>();

function avisarOuvintes(): void {
  for (const fn of ouvintes) {
    try {
      fn(pendentes);
    } catch {
      // um ouvinte quebrado não pode derrubar os demais
    }
  }
}

/** Assina a contagem de operações pendentes (chama já com o valor atual). Devolve o cancelamento. */
export function ouvirPendencias(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  fn(pendentes);
  return () => {
    ouvintes.delete(fn);
  };
}

/**
 * Envolve UMA operação de campo (ex.: `atualizarStatusOS`) contando-a como
 * pendente até resolver — sucesso OU erro. Relança o erro do chamador; só
 * contabiliza. Uso: `await comPendencia(() => atualizarStatusOS(id, status))`.
 */
export async function comPendencia<T>(operacao: () => Promise<T>): Promise<T> {
  pendentes += 1;
  avisarOuvintes();
  try {
    return await operacao();
  } finally {
    pendentes = Math.max(0, pendentes - 1);
    avisarOuvintes();
  }
}

// ─── Sonda de conectividade (sem dependência nova) ────────────────────────
const TIMEOUT_SONDA_MS = 4000;
const INTERVALO_SONDA_MS = 20000;

async function sondarConexao(): Promise<boolean> {
  // Web: navigator.onLine é a API correta do browser — sem risco de CORS
  // (um fetch cross-origin ao Supabase a partir do painel web pode ser
  // bloqueado pelo browser mesmo online, o que daria falso-negativo aqui).
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) return navigator.onLine;
    return true; // sem a API no ambiente: não trava a UI do técnico por rede
  }
  if (!SUPABASE_URL) return true; // sem backend configurado: idem
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_SONDA_MS);
    await fetch(SUPABASE_URL, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    return true; // qualquer resposta HTTP prova que a rede está de pé
  } catch {
    return false;
  }
}

type Fase = 'offline' | 'sincronizando' | 'tudo_salvo';

export function BarraOffline() {
  const [online, setOnline] = useState(true);
  const [pendCount, setPendCount] = useState(0);
  const cores = useCores();
  const reduzirMovimento = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => ouvirPendencias(setPendCount), []);

  useEffect(() => {
    let ativo = true;
    async function checar() {
      const ok = await sondarConexao();
      if (ativo) setOnline(ok);
    }
    checar();
    const id = setInterval(checar, INTERVALO_SONDA_MS);

    // Web: eventos nativos do browser dão feedback instantâneo (sem esperar
    // o próximo tick do intervalo).
    let removerListenersWeb: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const aoFicarOnline = () => setOnline(true);
      const aoFicarOffline = () => setOnline(false);
      window.addEventListener('online', aoFicarOnline);
      window.addEventListener('offline', aoFicarOffline);
      removerListenersWeb = () => {
        window.removeEventListener('online', aoFicarOnline);
        window.removeEventListener('offline', aoFicarOffline);
      };
    }

    // App voltou ao primeiro plano (nativo): reconfirma na hora.
    const appSub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') checar();
    });

    return () => {
      ativo = false;
      clearInterval(id);
      removerListenersWeb?.();
      appSub.remove();
    };
  }, []);

  const fase: Fase = !online ? 'offline' : pendCount > 0 ? 'sincronizando' : 'tudo_salvo';

  // Pisca suave a cada troca de fase — puro feedback, sem exagero. Some com
  // "Reduzir movimento" ligado (renderiza direto no estado final).
  useEffect(() => {
    if (reduzirMovimento) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0.35);
    Animated.timing(opacity, {
      toValue: 1,
      duration: Motion.dur.base,
      useNativeDriver: true,
    }).start();
  }, [fase, reduzirMovimento, opacity]);

  const plural = pendCount === 1 ? '' : 's';
  const CONFIG: Record<Fase, { icon: keyof typeof MaterialCommunityIcons.glyphMap; texto: string; cor: string; bg: string }> = {
    offline: {
      icon: 'cloud-off-outline',
      texto:
        pendCount > 0
          ? `Sem internet · ${pendCount} alteração${plural} salva${plural} no aparelho`
          : 'Sem internet · seu trabalho está salvo no aparelho',
      cor: cores.warning,
      bg: comAlfa(cores.warning, 0.14),
    },
    sincronizando: {
      icon: 'cloud-sync-outline',
      texto: `Sincronizando · ${pendCount} pendente${plural}`,
      cor: cores.accentLight,
      bg: cores.accentContainer,
    },
    tudo_salvo: {
      icon: 'cloud-check-outline',
      texto: 'Tudo salvo na nuvem',
      cor: cores.success,
      bg: cores.successLight,
    },
  };
  const atual = CONFIG[fase];

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: atual.bg, borderBottomColor: atual.cor + '40', opacity }]}
      accessible
      accessibilityLabel={atual.texto}
      accessibilityLiveRegion="polite"
    >
      <MaterialCommunityIcons name={atual.icon} size={14} color={atual.cor} />
      <Text style={[styles.texto, { color: atual.cor }]} numberOfLines={1}>{atual.texto}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: Spacing.base,
    borderBottomWidth: 1,
  },
  texto: { fontSize: 12, fontWeight: '700' },
});
