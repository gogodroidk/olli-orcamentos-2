import React, { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Motion, useReducedMotion } from '../../theme/motion';

export interface FlutuarProps {
  children: React.ReactNode;
  /** Distância do deslocamento vertical, em px. */
  distancia?: number;
  /** Duração de um ciclo (ida), em ms. */
  duracaoMs?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Float suave e infinito (translateY, ease-in-out, alternate) na WEB — o
 * "flutuando" do mascote no hero. Mesmo padrão do Tilt3D (ver Tilt3D.web.tsx):
 * a ref na View vira nó DOM, o efeito mexe só em `transform` (composited, sem
 * reflow) via Web Animations API (`Element.animate`) — sem `setInterval`, sem
 * `<style>` global injetado.
 *
 * Guard-rail: DESLIGA em `prefers-reduced-motion` — vira uma View estática
 * idêntica. No nativo este arquivo nem é carregado (ver Flutuar.tsx).
 */
export function Flutuar({
  children,
  distancia = Motion.web.float.distanciaPx,
  duracaoMs = Motion.web.float.duracaoMs,
  style,
}: FlutuarProps) {
  const ref = useRef<View>(null);
  const reduzir = useReducedMotion();

  useEffect(() => {
    // RNW entrega o nó DOM no ref da View.
    const node = ref.current as unknown as HTMLElement | null;
    if (!node || typeof node.animate !== 'function') return;

    if (reduzir) {
      node.style.transform = '';
      return;
    }

    node.style.willChange = 'transform';
    const animacao = node.animate(
      [{ transform: 'translateY(0px)' }, { transform: `translateY(-${distancia}px)` }],
      { duration: duracaoMs, iterations: Infinity, direction: 'alternate', easing: Motion.web.float.easingCss },
    );

    return () => {
      animacao.cancel();
      node.style.willChange = '';
    };
  }, [reduzir, distancia, duracaoMs]);

  return (
    <View ref={ref} style={style}>
      {children}
    </View>
  );
}
