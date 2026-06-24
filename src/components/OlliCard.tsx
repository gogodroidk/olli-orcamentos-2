import React from 'react';
import { TouchableOpacity, View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Shadow, Spacing } from '../theme';

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
      <TouchableOpacity activeOpacity={0.86} onPress={onPress} accessibilityRole="button">
        {inner}
      </TouchableOpacity>
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
