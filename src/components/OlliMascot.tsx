import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';

// react-native-web NÃO tem driver nativo de Animated: com useNativeDriver:true na web,
// todo restart do loop cai pro driver JS e roda no thread JS PARA SEMPRE (jank + a página
// nunca fica ociosa). Na web, driver JS explícito e — combinado com pulse={false} no Hero —
// nada de loop infinito acima da dobra.
const USA_DRIVER_NATIVO = Platform.OS !== 'web';
import { OlliLogo } from './OlliLogo';
import { useReducedMotion } from '../theme/motion';

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
  const reduzirMovimento = useReducedMotion();

  useEffect(() => {
    // Acessibilidade: com "Reduzir movimento" ligado, a OLLI fica parada no
    // estado final (sem flutuação) — mesmo símbolo, sem o loop infinito.
    if (!float || reduzirMovimento || !USA_DRIVER_NATIVO) {
      translateY.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, { toValue: -size * 0.06, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: USA_DRIVER_NATIVO }),
        Animated.timing(translateY, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: USA_DRIVER_NATIVO }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float, size, reduzirMovimento]);

  // Respiração: escala sutil em loop contínuo.
  useEffect(() => {
    if (!pulse || reduzirMovimento || !USA_DRIVER_NATIVO) {
      breath.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1.035, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: USA_DRIVER_NATIVO }),
        Animated.timing(breath, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: USA_DRIVER_NATIVO }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduzirMovimento]);

  // Piscada: a cada 4-7s, um pulso rápido de opacidade — timers com cleanup rigoroso.
  useEffect(() => {
    if (!pulse || reduzirMovimento || !USA_DRIVER_NATIVO) {
      blinkOpacity.setValue(1);
      return;
    }
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelado = false;

    const agendarPiscada = () => {
      const espera = 4000 + Math.random() * 3000;
      timeoutId = setTimeout(() => {
        if (cancelado) return;
        Animated.sequence([
          Animated.timing(blinkOpacity, { toValue: 0.72, duration: 90, useNativeDriver: USA_DRIVER_NATIVO }),
          Animated.timing(blinkOpacity, { toValue: 1, duration: 90, useNativeDriver: USA_DRIVER_NATIVO }),
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
  }, [pulse, reduzirMovimento]);

  return (
    <Animated.View style={{ transform: [{ translateY }, { scale: breath }], opacity: blinkOpacity }}>
      <OlliLogo size={size} approved={approved} />
    </Animated.View>
  );
}
