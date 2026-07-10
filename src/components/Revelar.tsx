import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import {
  Animated, Dimensions, NativeScrollEvent, NativeSyntheticEvent, View, ViewStyle,
} from 'react-native';
import { Motion, useReducedMotion } from '../theme/motion';

/**
 * REVELAR — revela um bloco (fade + translateY) quando ele ENTRA na viewport ao
 * rolar. Reimplementa em RN o "scroll reveal" que virou padrao em landing de SaaS
 * (referencia 21st.dev). So transform/opacity com native driver; respeita
 * reduced-motion (aparece direto, sem animar). Uma vez revelado, para de medir.
 *
 * Uso: envolva a ScrollView em <RevealProvider>, ligue o onScroll dela em
 * useRevealScrollHandler(), e envolva cada secao em <Revelar>.
 */

type Ctx = { subscribe: (fn: () => void) => () => void; ping: () => void } | null;
const RevealCtx = createContext<Ctx>(null);

export function RevealProvider({ children }: { children: React.ReactNode }) {
  const subs = useRef(new Set<() => void>()).current;
  const subscribe = useCallback((fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; }, [subs]);
  const ping = useCallback(() => { subs.forEach((f) => f()); }, [subs]);
  return <RevealCtx.Provider value={{ subscribe, ping }}>{children}</RevealCtx.Provider>;
}

/** Handler para o onScroll da ScrollView: dispara a checagem de reveal das secoes. */
export function useRevealScrollHandler() {
  const ctx = useContext(RevealCtx);
  return useCallback((_e: NativeSyntheticEvent<NativeScrollEvent>) => { ctx?.ping(); }, [ctx]);
}

export function Revelar({
  children, style, deslocamento = 26,
}: { children: React.ReactNode; style?: ViewStyle; deslocamento?: number }) {
  const ctx = useContext(RevealCtx);
  const reduzir = useReducedMotion();
  const ref = useRef<View>(null);
  const t = useRef(new Animated.Value(0)).current;
  const revelado = useRef(false);

  useEffect(() => {
    if (reduzir) { t.setValue(1); revelado.current = true; return; }
    let vivo = true;
    const revelar = () => {
      if (!vivo || revelado.current) return;
      revelado.current = true;
      Animated.timing(t, {
        toValue: 1, duration: Motion.dur.slow, easing: Motion.easing.standard, useNativeDriver: true,
      }).start();
    };
    const checar = () => {
      if (!vivo || revelado.current || !ref.current) return;
      // measureInWindow: posicao na tela, robusta a qualquer aninhamento (nao
      // depende de o bloco ser filho direto do conteudo da ScrollView).
      ref.current.measureInWindow((_x, y, _w, h) => {
        const alturaTela = Dimensions.get('window').height;
        // revela quando o topo do bloco cruza 90% da tela (um pouco antes de
        // aparecer inteiro — parece mais natural).
        if (y < alturaTela * 0.9 && y + h > 0) revelar();
      });
    };
    // Checagem inicial: o que ja esta visivel no load aparece sem depender de rolar.
    const id = setTimeout(checar, 60);
    const unsub = ctx?.subscribe(checar);
    return () => { vivo = false; clearTimeout(id); unsub?.(); };
  }, [ctx, reduzir, t]);

  return (
    // View externa (host mensuravel; collapsable=false pro Android nao a otimizar).
    // A animada por dentro so mexe em opacity/transform.
    <View ref={ref} style={style} collapsable={false}>
      <Animated.View
        style={{
          opacity: t,
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [deslocamento, 0] }) }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}
