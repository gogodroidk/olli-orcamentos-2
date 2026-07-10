import React from 'react';
import { Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, useCores, useGradientes, sombrasDe, textoSobre } from '../theme';
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
  const cores = useCores();
  const gradientes = useGradientes();
  const sombras = sombrasDe(cores);
  const padV = { sm: 9, md: 13, lg: 16 }[size];
  const padH = { sm: 14, md: 20, lg: 24 }[size];
  const fs = { sm: 13, md: 15, lg: 16 }[size];
  const minHeight = { sm: 40, md: 50, lg: 58 }[size];

  // O preenchimento precisa ser conhecido ANTES do rótulo: a cor do texto é função
  // do que está atrás dele. (`outline` e `ghost` não usam `bg` como fundo real —
  // um é translúcido, o outro é transparente — e por isso têm cor própria abaixo.)
  const bg = {
    primary: cores.primary,
    gradient: cores.primary,
    success: cores.success,
    secondary: cores.secondary,
    danger: cores.danger,
    outline: cores.accentContainer,
    ghost: 'transparent',
  }[variant];

  // `onSurface` é o texto sobre a SUPERFÍCIE do app, não sobre o botão. No app
  // dark-only os dois coincidiam (ambos claros) e o erro passou despercebido; no
  // modo claro o rótulo virou tinta escura sobre o azul da marca — 3.44:1, abaixo
  // dos 4.5:1 que 16px exige. `textoSobre` decide olhando o preenchimento real; o
  // gradiente traz a própria cor, já nivelada nas duas pontas por `parLegivel`.
  const color = variant === 'outline' ? cores.accentLight
    : variant === 'ghost' ? cores.onSurfaceVariant
    : variant === 'gradient' ? gradientes.sobreBrand
    : textoSobre(bg);

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
          colors={gradientes.primaryDiagonal}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.base, sombras.glowCyan, { minHeight, paddingVertical: padV, paddingHorizontal: padH }]}
        >
          {content}
        </LinearGradient>
      </OlliPressable>
    );
  }

  const border = variant === 'outline' ? { borderWidth: 1.5, borderColor: cores.strokeGlow } : {};

  return (
    <OlliPressable
      onPress={onPress}
      disabled={disabled || loading}
      haptic={haptic ? 'light' : false}
      style={[
        styles.base,
        { backgroundColor: bg, minHeight, paddingVertical: padV, paddingHorizontal: padH },
        border,
        variant === 'primary' && !disabled && !loading && sombras.glowBlue,
        variant !== 'primary' && variant !== 'outline' && variant !== 'ghost' && sombras.sm,
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
