import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { OlliLogo } from './OlliLogo';

interface Props {
  size?: number;
  /** flutua de leve pra cima e pra baixo. */
  float?: boolean;
  /** estado "negócio fechado": check em menta. */
  approved?: boolean;
  /** legados — aceitos por compatibilidade, sem efeito no símbolo v3. */
  blink?: boolean;
  onDark?: boolean;
}

/**
 * A OLLI — símbolo oficial (rebrand v3) com leve flutuação. Substitui o antigo
 * mascote-robô em todas as telas (chat, onboarding, home…), mantendo a mesma API.
 */
export function OlliMascot({ size = 48, float = true, approved = false }: Props) {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!float) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, { toValue: -size * 0.06, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float, size]);

  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
      <OlliLogo size={size} approved={approved} />
    </Animated.View>
  );
}
