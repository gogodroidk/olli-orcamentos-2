import React, { useCallback } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, BorderRadius, Spacing, Gradients, Shadow } from '../theme';

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
  const handlePress = useCallback(() => {
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  }, [haptic, onPress]);

  const padV = { sm: 9, md: 13, lg: 16 }[size];
  const padH = { sm: 14, md: 20, lg: 24 }[size];
  const fs = { sm: 13, md: 15, lg: 16 }[size];

  const color = variant === 'outline' ? Colors.primary
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
      <TouchableOpacity
        onPress={handlePress}
        disabled={loading}
        activeOpacity={0.85}
        style={[fullWidth && styles.fullWidth, style]}
      >
        <LinearGradient
          colors={Gradients.primaryDiagonal}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.base, styles.gradientShadow, { paddingVertical: padV, paddingHorizontal: padH }]}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const bg = {
    primary: Colors.primary,
    gradient: Colors.primary,
    success: Colors.success,
    secondary: Colors.secondary,
    danger: Colors.danger,
    outline: 'transparent',
    ghost: 'transparent',
  }[variant];

  const border = variant === 'outline' ? { borderWidth: 1.5, borderColor: Colors.primary } : {};

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.82}
      style={[
        styles.base,
        { backgroundColor: bg, paddingVertical: padV, paddingHorizontal: padH },
        border,
        variant !== 'outline' && variant !== 'ghost' && Shadow.sm,
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
  },
  contentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  gradientShadow: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  fullWidth: { alignSelf: 'stretch' },
  label: { fontWeight: '700', letterSpacing: 0.2 },
  disabled: { opacity: 0.45 },
});
