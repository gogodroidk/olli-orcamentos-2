import React, { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../../theme/motion';

export interface Tilt3DProps {
  children: React.ReactNode;
  /** Amplitude do tilt em graus. */
  intensidade?: number;
  /** Escala no hover. */
  escala?: number;
  style?: StyleProp<ViewStyle>;
  [key: string]: unknown;
}

/**
 * Tilt 3D na WEB: o cartão inclina em perspectiva seguindo o mouse e levanta
 * levemente — a profundidade que o dono pediu, dentro da identidade do app
 * (o brilho fica por conta do `glowCyan`/marca de quem usa este wrapper).
 *
 * Guard-rails (regras do perfil generic-saas): só transform (composited, sem
 * reflow, sem rAF contínuo — só em mousemove); DESLIGA em `prefers-reduced-motion`
 * e em telas sem hover (touch), virando uma `View` estática idêntica. Nada de
 * WebGL, nada de canvas. No nativo este arquivo nem é carregado (ver Tilt3D.tsx).
 */
export function Tilt3D({ children, intensidade = 6, escala = 1.02, style, ...rest }: Tilt3DProps) {
  const ref = useRef<View>(null);
  const reduzir = useReducedMotion();

  useEffect(() => {
    // RNW entrega o nó DOM no ref da View.
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;

    const semHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches;
    if (reduzir || semHover) {
      node.style.transform = '';
      return;
    }

    node.style.transformStyle = 'preserve-3d';
    node.style.transition = 'transform 260ms cubic-bezier(.2,.7,.2,1)';
    node.style.willChange = 'transform';

    let raf = 0;
    const aoMover = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = node.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        node.style.transform =
          `perspective(1100px) rotateY(${px * intensidade}deg) rotateX(${-py * intensidade}deg) scale(${escala})`;
      });
    };
    const aoSair = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      node.style.transform = 'perspective(1100px) rotateY(0deg) rotateX(0deg) scale(1)';
    };

    node.addEventListener('mousemove', aoMover);
    node.addEventListener('mouseleave', aoSair);
    return () => {
      node.removeEventListener('mousemove', aoMover);
      node.removeEventListener('mouseleave', aoSair);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduzir, intensidade, escala]);

  return (
    <View ref={ref} style={style} {...rest}>
      {children}
    </View>
  );
}
