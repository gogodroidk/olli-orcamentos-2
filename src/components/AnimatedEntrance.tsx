import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, Platform } from 'react-native';
import { Motion, useReducedMotion } from '../theme/motion';

interface Props {
  children: React.ReactNode;
  index?: number;
  style?: ViewStyle | ViewStyle[];
  delay?: number;
  from?: 'bottom' | 'right' | 'scale';
}

const useNativeAnimations = Platform.OS !== 'web';

/**
 * Entrada animada (fade + deslize/escala) para itens de lista e cards.
 * `index` escalona o delay criando o efeito cascata premium.
 */
export function AnimatedEntrance({ children, index = 0, style, delay = 0, from = 'bottom' }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const reduzirMovimento = useReducedMotion();

  useEffect(() => {
    // Acessibilidade: com "Reduzir movimento" ligado, aparece direto no estado
    // final (sem deslize/escala/fade animado) — o conteúdo é o mesmo, sem motion.
    if (reduzirMovimento) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: 380,
      delay: delay + Math.min(index, Motion.maxStagger) * Motion.stagger,
      easing: Motion.easing.standard,
      useNativeDriver: useNativeAnimations,
    }).start();
  }, [reduzirMovimento]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [from === 'bottom' ? 24 : 0, 0] });
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [from === 'right' ? 32 : 0, 0] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [from === 'scale' ? 0.92 : 1, 1] });

  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }, { translateX }, { scale }] }]}>
      {children}
    </Animated.View>
  );
}
