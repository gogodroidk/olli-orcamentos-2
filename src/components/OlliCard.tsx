import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Shadow, Spacing } from '../theme';
import { OlliPressable } from './OlliPressable';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  padding?: number;
  variant?: 'default' | 'glass' | 'metric' | 'selected';
}

export function OlliCard({ children, onPress, style, padding = Spacing.base, variant = 'default' }: Props) {
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    overflow: 'hidden',
    ...Shadow.md,
  },
  glass: {
    backgroundColor: Colors.surfaceGlass,
    borderColor: Colors.strokeGlow,
  },
  metric: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  selected: {
    backgroundColor: Colors.surfacePressed,
    borderColor: Colors.accent,
  },
});
