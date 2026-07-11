import React, { useCallback, useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../../theme/motion';
import { useLandingScrollY } from './LandingScroll';

export interface ParallaxProps {
  children: React.ReactNode;
  /** Fração da rolagem aplicada como deslocamento vertical (translateY). */
  fator?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Parallax sutil no HERO da landing: desloca o elemento em `translateY`
 * proporcional à rolagem (fator pequeno) — EFEITO DE WEB. Mesmo padrão do
 * Tilt3D (ver Tilt3D.web.tsx): a ref na View vira nó DOM, só `transform`
 * (composited, sem reflow). A posição de rolagem vem de `useLandingScrollY`
 * (ver LandingScroll.tsx) — já throttled a 1×/frame via `requestAnimationFrame`
 * pelo único `onScroll` real da landing (a janela não rola nesta página).
 *
 * Guard-rails: DESLIGA em `prefers-reduced-motion` e em telas sem hover
 * (touch — mesmo critério do Tilt3D). No nativo este arquivo nem é carregado
 * (ver Parallax.tsx).
 */
export function Parallax({ children, fator = 0.15, style }: ParallaxProps) {
  const ref = useRef<View>(null);
  const reduzir = useReducedMotion();
  const ligado = useRef(false);

  useEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;

    const semHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches;
    ligado.current = !reduzir && !semHover;

    if (ligado.current) {
      node.style.willChange = 'transform';
    } else {
      node.style.transform = '';
      node.style.willChange = '';
    }
  }, [reduzir]);

  const aoRolar = useCallback((y: number) => {
    const node = ref.current as unknown as HTMLElement | null;
    if (!node || !ligado.current) return;
    node.style.transform = `translateY(${(y * fator).toFixed(2)}px)`;
  }, [fator]);

  useLandingScrollY(aoRolar);

  return (
    <View ref={ref} style={style}>
      {children}
    </View>
  );
}
