import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { BorderRadius, Spacing, useEstilos, sombrasDe, type Cores } from '../theme';
import { OlliPressable } from './OlliPressable';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  padding?: number;
  variant?: 'default' | 'glass' | 'metric' | 'selected';
}

export function OlliCard({ children, onPress, style, padding = Spacing.base, variant = 'default' }: Props) {
  const styles = useEstilos(criarEstilos);
  const variantStyle =
    variant === 'glass' ? styles.glass :
    variant === 'metric' ? styles.metric :
    variant === 'selected' ? styles.selected :
    null;

  const inner = (
    <View style={[styles.card, variantStyle, { padding }, style]}>
      {children}
    </View>
  );

  if (onPress) {
    return (
      <OlliPressable onPress={onPress} scaleTo={0.98} haptic="selection">
        {inner}
      </OlliPressable>
    );
  }
  return inner;
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: c.outline,
      overflow: 'hidden',
      ...sombrasDe(c).md,
    },
    glass: {
      backgroundColor: c.surfaceGlass,
      borderColor: c.strokeGlow,
    },
    metric: {
      backgroundColor: c.surfaceElevated,
      // Hairline branca fixa antes (rgba(255,255,255,0.12)) — some no claro.
      // `outlineDark` é a mesma hairline adaptada ao modo.
      borderColor: c.outlineDark,
    },
    selected: {
      backgroundColor: c.surfacePressed,
      borderColor: c.accent,
    },
  });
