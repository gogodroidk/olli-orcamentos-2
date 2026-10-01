import React, { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { DISTANCIA, DURACAO, atrasoEscalonado, useReduzirMovimento } from '../../theme/motion';
import { curvas } from './curvas';

interface Props {
  children: React.ReactNode;
  /** Posição na lista: escalona a entrada (`STAGGER.passo` por item, com teto). */
  indice?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Entrada de card/linha: sobe `DISTANCIA.entrada` e ganha opacidade, uma vez,
 * na montagem. Só `transform` e `opacity`, na UI thread.
 *
 * Com "Reduzir movimento" o conteúdo já nasce no estado final — nada fica
 * invisível esperando animação.
 */
export function Aparecer({ children, indice = 0, style }: Props) {
  const reduzir = useReduzirMovimento();
  // 0 = antes de entrar, 1 = no lugar.
  const progresso = useSharedValue(reduzir ? 1 : 0);

  useEffect(() => {
    if (reduzir) {
      cancelAnimation(progresso);
      progresso.set(1);
      return;
    }
    progresso.set(withDelay(
      atrasoEscalonado(indice, false),
      withTiming(1, { duration: DURACAO.base, easing: curvas.emphasized }),
    ));
    return () => cancelAnimation(progresso);
  }, [reduzir, indice, progresso]);

  const estilo = useAnimatedStyle(() => {
    const p = progresso.get();
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * DISTANCIA.entrada }],
    };
  });

  return <Animated.View style={[style, estilo]}>{children}</Animated.View>;
}
