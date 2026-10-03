import React, { useCallback, useEffect } from 'react';
import {
  Pressable,
  type AccessibilityRole,
  type AccessibilityState,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { DURACAO, MOLA, TOQUE, useReduzirMovimento } from '../../theme/motion';
import { curvas } from './curvas';
import { dispararHaptico, dividirStyle, type HapticKind } from './pressionavel';

interface Props {
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  /** Háptico no toque confirmado. Padrão `false`: vibrar é opt-in. */
  haptic?: HapticKind;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  accessibilityLabel?: string;
  /** O que acontece ao tocar, lido depois do rótulo (o rótulo cobre os filhos). */
  accessibilityHint?: string;
  /** Padrão `'button'`. */
  accessibilityRole?: AccessibilityRole;
  /** Estado anunciado ao leitor de tela (`busy`, `selected`…). `disabled` entra sozinho. */
  accessibilityState?: AccessibilityState;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
  /**
   * Escala ao pressionar. Padrão `TOQUE.escalaPressionado` (0.97). Card grande
   * pede menos (0.98): a mesma redução em pixel parece um "pulo" numa área larga.
   */
  escala?: number;
  /** Atraso do long-press (ms). Padrão do RN (500). */
  delayLongPress?: number;
}

/**
 * Área tocável com retorno "estilo Apple": ao encostar o dedo o conteúdo encolhe
 * para `TOQUE.escalaPressionado` (0.97) e perde um pouco de opacidade; ao soltar
 * volta com a mola `snappy`. A animação roda na UI thread (Reanimated) — o JS
 * ocupado não trava o retorno do toque. Só `transform` e `opacity` mudam.
 *
 * Com "Reduzir movimento" ligado não há escala: só a opacidade troca, na hora.
 * O toque continua dando retorno visível, sem movimento.
 */
export function PressableAnimado({
  onPress,
  onLongPress,
  haptic = false,
  disabled = false,
  style,
  children,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  accessibilityState,
  hitSlop,
  escala = TOQUE.escalaPressionado,
  delayLongPress,
}: Props) {
  const reduzir = useReduzirMovimento();
  // 0 = solto, 1 = pressionado.
  const pressionado = useSharedValue(0);

  useEffect(() => () => cancelAnimation(pressionado), [pressionado]);

  // Desabilitado no meio do toque (ex.: virou "carregando"): não pode ficar encolhido.
  useEffect(() => {
    if (disabled) pressionado.set(0);
  }, [disabled, pressionado]);

  const { layoutStyle, visualStyle } = dividirStyle(style);
  // A opacidade de repouso vem do próprio estilo; desabilitado tem a sua, fixa.
  const opacidadeRepouso = disabled
    ? TOQUE.opacidadeDesabilitado
    : typeof visualStyle.opacity === 'number' ? visualStyle.opacity : 1;
  const escalaAlvo = reduzir ? 1 : escala;

  const estiloAnimado = useAnimatedStyle(() => {
    const p = pressionado.get();
    return {
      opacity: opacidadeRepouso * (1 - (1 - TOQUE.opacidadePressionado) * p),
      transform: [{ scale: 1 - (1 - escalaAlvo) * p }],
    };
  });

  const aoEncostar = useCallback(() => {
    if (disabled) return;
    pressionado.set(reduzir ? 1 : withTiming(1, { duration: DURACAO.instant, easing: curvas.standard }));
  }, [disabled, reduzir, pressionado]);

  const aoSoltar = useCallback(() => {
    pressionado.set(reduzir ? 0 : withSpring(0, MOLA.snappy));
  }, [reduzir, pressionado]);

  const aoTocar = useCallback((e: GestureResponderEvent) => {
    if (disabled) return;
    dispararHaptico(haptic);
    onPress?.(e);
  }, [disabled, haptic, onPress]);

  return (
    <Pressable
      onPress={aoTocar}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      onPressIn={aoEncostar}
      onPressOut={aoSoltar}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      // O leitor de tela lê o ESTADO, não a prop `disabled`.
      accessibilityState={{ disabled, ...accessibilityState }}
      hitSlop={hitSlop}
      style={layoutStyle}
    >
      <Animated.View style={[visualStyle, estiloAnimado]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
