import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { CICLO, PULSO, useReduzirMovimento } from '../../theme/motion';
import { curvas } from './curvas';

interface Props {
  /** Diâmetro do ponto (dp). O halo cresce a partir dele. */
  tamanho: number;
  cor: string;
  /**
   * Muda o número → dispara uma nova série de ondas (ex.: a tela voltou ao foco).
   * Sem mudar, o pulso roda uma vez na montagem e para.
   */
  gatilho?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Ponto do "agora" com um halo que pulsa `PULSO.repeticoes` vezes e PARA. Não é
 * loop infinito: o movimento chama o olho para a visita em andamento quando a
 * tela abre, e depois o ponto fica parado (sem gastar quadro no bolso).
 *
 * Só `transform` (scale) e `opacity`, na UI thread. Com "Reduzir movimento" o
 * halo nem aparece — o ponto preenchido e o rótulo "Agora" já dizem tudo.
 */
export function PulsoAgora({ tamanho, cor, gatilho = 0, style }: Props) {
  const reduzir = useReduzirMovimento();
  // 0 = halo do tamanho do ponto e visível; 1 = halo grande e invisível.
  const onda = useSharedValue(1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `gatilho` é o disparo de propósito (nova série de ondas a cada foco).
  useEffect(() => {
    if (reduzir) {
      cancelAnimation(onda);
      onda.set(1);
      return;
    }
    onda.set(0);
    onda.set(withRepeat(
      withTiming(1, { duration: CICLO.pulso, easing: curvas.decelerate }),
      PULSO.repeticoes,
      false,
    ));
    return () => cancelAnimation(onda);
  }, [reduzir, gatilho, onda]);

  const estiloHalo = useAnimatedStyle(() => {
    const p = onda.get();
    return {
      opacity: PULSO.opacidadeHalo * (1 - p),
      transform: [{ scale: 1 + (PULSO.escalaHalo - 1) * p }],
    };
  });

  const redondo = { width: tamanho, height: tamanho, borderRadius: tamanho / 2 };

  return (
    <View style={[redondo, style]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {!reduzir && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, redondo, { backgroundColor: cor }, estiloHalo]} />
      )}
      <View style={[redondo, { backgroundColor: cor }]} />
    </View>
  );
}
