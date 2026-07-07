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
  /** respiração + piscada periódica. Default true — a OLLI "viva". */
  pulse?: boolean;
}

/**
 * A OLLI — símbolo oficial (rebrand v3) com leve flutuação, respiração e
 * piscada periódica. Substitui o antigo mascote-robô em todas as telas
 * (chat, onboarding, home…), mantendo a mesma API.
 */
export function OlliMascot({ size = 48, float = true, approved = false, pulse = true }: Props) {
  const translateY = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(1)).current;
  const blinkOpacity = useRef(new Animated.Value(1)).current;

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

  // Respiração: escala sutil em loop contínuo.
  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1.035, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Piscada: a cada 4-7s, um pulso rápido de opacidade — timers com cleanup rigoroso.
  useEffect(() => {
    if (!pulse) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelado = false;

    const agendarPiscada = () => {
      const espera = 4000 + Math.random() * 3000;
      timeoutId = setTimeout(() => {
        if (cancelado) return;
        Animated.sequence([
          Animated.timing(blinkOpacity, { toValue: 0.72, duration: 90, useNativeDriver: true }),
          Animated.timing(blinkOpacity, { toValue: 1, duration: 90, useNativeDriver: true }),
        ]).start(() => {
          if (!cancelado) agendarPiscada();
        });
      }, espera);
    };

    agendarPiscada();
    return () => {
      cancelado = true;
      clearTimeout(timeoutId);
    };
  }, [pulse]);

  return (
    <Animated.View style={{ transform: [{ translateY }, { scale: breath }], opacity: blinkOpacity }}>
      <OlliLogo size={size} approved={approved} />
    </Animated.View>
  );
}
