import React from 'react';
import { View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';

export interface FlutuarProps extends ViewProps {
  children: React.ReactNode;
  /** Distância do deslocamento vertical, em px (só web). */
  distancia?: number;
  /** Duração de um ciclo, em ms (só web). */
  duracaoMs?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Float infinito (translateY) — EFEITO DE WEB.
 *
 * Esta é a versão NATIVA: PASS-THROUGH puro, igual ao padrão do Tilt3D (ver
 * Tilt3D.tsx). No APK/iOS não existe "flutuar ao rolar o mouse/scroll" — o
 * componente vira uma `View` idêntica, zero custo. A mágica vive em
 * `Flutuar.web.tsx`, que o Metro escolhe só na web.
 */
export function Flutuar({ children, distancia: _d, duracaoMs: _dur, style, ...rest }: FlutuarProps) {
  return (
    <View style={style} {...rest}>
      {children}
    </View>
  );
}
