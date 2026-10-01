import React, { useCallback, useRef } from 'react';
import { Animated, Pressable, StyleProp, ViewStyle, GestureResponderEvent, Platform, AccessibilityRole, AccessibilityState } from 'react-native';
import { Motion } from '../theme/motion';
import { dispararHaptico, dividirStyle, type HapticKind } from './motion/pressionavel';

interface Props {
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  haptic?: HapticKind;
  scaleTo?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  accessibilityLabel?: string;
  /** Padrão `'button'`. Um switch, uma aba ou uma amostra selecionável não é botão. */
  accessibilityRole?: AccessibilityRole;
  /**
   * Estado anunciado ao leitor de tela (`selected`, `checked`, `expanded`…). Sem
   * isto, uma amostra de cor selecionada é indistinguível das outras para quem não
   * enxerga a borda: a seleção existe só no pixel.
   */
  accessibilityState?: AccessibilityState;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
}

const useNativeAnimations = Platform.OS !== 'web';

/**
 * Botão-base da v3 (Animated): press-scale + haptico consistente.
 * O OlliButton já migrou para `PressableAnimado` (Reanimated, UI thread); este
 * segue servindo OlliCard e as demais áreas tocáveis até a migração delas.
 */
export function OlliPressable({
  onPress,
  onLongPress,
  haptic = 'selection',
  scaleTo = 0.97,
  disabled = false,
  style,
  children,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  hitSlop,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    Animated.timing(scale, {
      toValue: scaleTo,
      duration: Motion.dur.fast,
      useNativeDriver: useNativeAnimations,
    }).start();
  }, [disabled, scale, scaleTo]);

  const handlePressOut = useCallback(() => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 1,
      friction: 6,
      useNativeDriver: useNativeAnimations,
    }).start();
  }, [disabled, scale]);

  const handlePress = useCallback((e: GestureResponderEvent) => {
    if (disabled) return;
    dispararHaptico(haptic);
    onPress?.(e);
  }, [disabled, haptic, onPress]);

  const { layoutStyle, visualStyle } = dividirStyle(style);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      // `disabled` já vai para o Pressable, mas o leitor de tela lê o ESTADO, não a
      // prop: sem isto, um botão desabilitado é anunciado como acionável.
      accessibilityState={{ disabled, ...accessibilityState }}
      hitSlop={hitSlop}
      style={layoutStyle}
    >
      <Animated.View style={[visualStyle, { transform: [{ scale }] }, disabled && { opacity: 0.55 }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
