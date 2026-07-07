import React from 'react';
import { Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, Gradients, Shadow } from '../theme';
import { OlliPressable } from './OlliPressable';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'gradient' | 'success' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  haptic?: boolean;
}

export function OlliButton({
  label, onPress, variant = 'primary', size = 'md',
  loading, disabled, style, textStyle, icon, fullWidth, haptic = true,
}: Props) {
  const padV = { sm: 9, md: 13, lg: 16 }[size];
  const padH = { sm: 14, md: 20, lg: 24 }[size];
  const fs = { sm: 13, md: 15, lg: 16 }[size];
  const minHeight = { sm: 40, md: 50, lg: 58 }[size];

  const color = variant === 'outline' ? Colors.accentLight
    : variant === 'ghost' ? Colors.onSurfaceVariant
    : Colors.onSurface;

  const content = loading ? (
    <ActivityIndicator size="small" color={color} />
  ) : (
    <View style={styles.contentRow}>
      {icon}
      <Text style={[styles.label, { color, fontSize: fs, marginLeft: icon ? 7 : 0 }, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  // Variante gradiente premium
  if (variant === 'gradient' && !disabled) {
    return (
      <OlliPressable
        onPress={onPress}
        disabled={loading}
        haptic={haptic ? 'light' : false}
        style={[fullWidth && styles.fullWidth, style]}
      >
        <LinearGradient
          colors={Gradients.primaryDiagonal}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.base, Shadow.glowCyan, { minHeight, paddingVertical: padV, paddingHorizontal: padH }]}
        >
          {content}
        </LinearGradient>
      </OlliPressable>
    );
  }

  const bg = {
    primary: Colors.primary,
    gradient: Colors.primary,
    success: Colors.success,
    secondary: Colors.secondary,
    danger: Colors.danger,
    outline: 'rgba(52,198,217,0.08)',
    ghost: 'transparent',
  }[variant];

  const border = variant === 'outline' ? { borderWidth: 1.5, borderColor: Colors.strokeGlow } : {};

  return (
    <OlliPressable
      onPress={onPress}
      disabled={disabled || loading}
      haptic={haptic ? 'light' : false}
      style={[
        styles.base,
        { backgroundColor: bg, minHeight, paddingVertical: padV, paddingHorizontal: padH },
        border,
        variant === 'primary' && !disabled && !loading && Shadow.glowBlue,
        variant !== 'primary' && variant !== 'outline' && variant !== 'ghost' && Shadow.sm,
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {content}
    </OlliPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
  },
  contentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  label: { fontWeight: '800', letterSpacing: 0 },
  disabled: { opacity: 0.45 },
});
