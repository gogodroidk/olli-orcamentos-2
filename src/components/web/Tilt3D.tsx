import React from 'react';
import { View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';

export interface Tilt3DProps extends ViewProps {
  children: React.ReactNode;
  /** Amplitude do tilt em graus (só web). */
  intensidade?: number;
  /** Escala no hover (só web). */
  escala?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Tilt 3D (perspective/rotateX/rotateY seguindo o ponteiro) — EFEITO DE WEB.
 *
 * Esta é a versão NATIVA: PASS-THROUGH puro. No APK/iOS não há mouse, então o
 * componente é uma `View` idêntica — zero custo, bundle nativo intocado. A mágica
 * vive em `Tilt3D.web.tsx`, que o Metro escolhe só na web. Assim a landing ganha
 * profundidade no navegador sem tocar em nada do aplicativo.
 */
export function Tilt3D({ children, intensidade: _i, escala: _e, style, ...rest }: Tilt3DProps) {
  return (
    <View style={style} {...rest}>
      {children}
    </View>
  );
}
