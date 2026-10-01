import React from 'react';
import type { AccessibilityRole, AccessibilityState, GestureResponderEvent, StyleProp, ViewStyle } from 'react-native';
import { TOQUE } from '../theme/motion';
import { PressableAnimado } from './motion/PressableAnimado';
import type { HapticKind } from './motion/pressionavel';

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

/**
 * Área tocável histórica do app (OlliCard, Conta e ~25 telas). Desde a Onda 2
 * (item 2.3) é só um ADAPTADOR de nomes sobre `PressableAnimado`: o retorno do
 * toque roda na UI thread (Reanimated), com a mola `snappy` dos tokens e
 * respeitando "Reduzir movimento". Antes era `Animated` com `friction: 6` cravado
 * — dois motores e duas sensações de toque no mesmo app.
 *
 * Mantém a API antiga (`scaleTo`, háptico de seleção por padrão) para os
 * call-sites não precisarem mudar.
 */
export function OlliPressable({
  haptic = 'selection',
  scaleTo = TOQUE.escalaPressionado,
  ...resto
}: Props) {
  return <PressableAnimado haptic={haptic} escala={scaleTo} {...resto} />;
}
