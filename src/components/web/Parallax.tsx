import React from 'react';
import { View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';

export interface ParallaxProps extends ViewProps {
  children: React.ReactNode;
  /** Fração da rolagem aplicada como deslocamento (só web). */
  fator?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Parallax de rolagem — EFEITO DE WEB.
 *
 * Esta é a versão NATIVA: PASS-THROUGH puro, igual ao padrão do Tilt3D (ver
 * Tilt3D.tsx). Zero custo no APK/iOS. A mágica vive em `Parallax.web.tsx`,
 * que o Metro escolhe só na web.
 */
export function Parallax({ children, fator: _f, style, ...rest }: ParallaxProps) {
  return (
    <View style={style} {...rest}>
      {children}
    </View>
  );
}
