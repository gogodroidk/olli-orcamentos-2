import React, { useCallback, useRef } from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, ViewStyle, GestureResponderEvent, Platform, AccessibilityRole, AccessibilityState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Motion } from '../theme/motion';

type HapticKind = 'light' | 'medium' | 'selection' | false;

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

function dispararHaptico(kind: HapticKind) {
  if (kind === false) return;
  if (kind === 'light') { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); return; }
  if (kind === 'medium') { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); return; }
  Haptics.selectionAsync().catch(() => {});
}

/**
 * Botão-base de toda a v3: press-scale + haptico consistente.
 * OlliButton/OlliCard usam por baixo; use direto para qualquer área tocável nova.
 */

// Chaves que afetam o LAYOUT no container pai — precisam morar no Pressable
// externo (flex:1 numa row nao expande nada se ficar na view interna). O resto
// (fundo, padding, borda) fica na Animated.View para escalar junto no press.
const LAYOUT_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'display',
  'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'position', 'top', 'bottom', 'left', 'right', 'zIndex',
]);

function dividirStyle(style: StyleProp<ViewStyle>): { layoutStyle: ViewStyle; visualStyle: ViewStyle } {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const layoutStyle: Record<string, unknown> = {};
  const visualStyle: Record<string, unknown> = {};
  for (const k of Object.keys(flat)) {
    (LAYOUT_KEYS.has(k) ? layoutStyle : visualStyle)[k] = flat[k];
  }
  // altura/largura definem o tamanho do no externo; a view interna preenche.
  if ('height' in layoutStyle || 'minHeight' in layoutStyle) visualStyle['flex'] = 1;
  return { layoutStyle: layoutStyle as ViewStyle, visualStyle: visualStyle as ViewStyle };
}

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
