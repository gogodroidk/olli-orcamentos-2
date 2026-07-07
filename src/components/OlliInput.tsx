import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, Animated, TouchableOpacity,
  TextInputProps, ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, Fonts } from '../theme';
import {
  maskPhone, maskCPF, maskCNPJ, maskCpfCnpj, maskCEP, maskDate,
  maskCurrencyInput, currencyToMask,
} from '../utils/masks';

export type MaskType = 'phone' | 'cpf' | 'cnpj' | 'cpfcnpj' | 'cep' | 'date' | 'none';

interface OlliInputProps extends Omit<TextInputProps, 'onChangeText' | 'value' | 'style'> {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  mask?: MaskType;
  error?: string;
  helper?: string;
  required?: boolean;
  leftIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Ícone à direita (ex.: olho para mostrar/ocultar senha). */
  rightIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Se informado, o ícone à direita vira um botão (ex.: alternar senha). */
  onRightIconPress?: () => void;
  /** Rótulo de acessibilidade do botão do ícone à direita (ex.: "Mostrar senha"). */
  rightIconLabel?: string;
  containerStyle?: ViewStyle;
}

const KEYBOARD_BY_MASK: Record<MaskType, TextInputProps['keyboardType']> = {
  phone: 'phone-pad',
  cpf: 'numeric',
  cnpj: 'numeric',
  cpfcnpj: 'numeric',
  cep: 'numeric',
  date: 'numeric',
  none: 'default',
};

function applyMask(mask: MaskType, raw: string): string {
  switch (mask) {
    case 'phone': return maskPhone(raw);
    case 'cpf': return maskCPF(raw);
    case 'cnpj': return maskCNPJ(raw);
    case 'cpfcnpj': return maskCpfCnpj(raw);
    case 'cep': return maskCEP(raw);
    case 'date': return maskDate(raw);
    default: return raw;
  }
}

/**
 * Input premium e ESTÁVEL (definido no nível de módulo) — não recria o
 * TextInput a cada render, então o teclado NUNCA fecha sozinho.
 * Suporta máscaras BR, ícone, label, erro e borda animada no foco.
 */
function OlliInputBase({
  label, value, onChangeText, mask = 'none', error, helper, required,
  leftIcon, rightIcon, onRightIconPress, rightIconLabel, containerStyle, multiline, keyboardType, ...rest
}: OlliInputProps) {
  const [focused, setFocused] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const animateTo = useCallback((to: number) => {
    Animated.timing(anim, { toValue: to, duration: 150, useNativeDriver: false }).start();
  }, [anim]);

  const handleChange = useCallback((text: string) => {
    onChangeText(mask === 'none' ? text : applyMask(mask, text));
  }, [mask, onChangeText]);

  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? Colors.danger : Colors.outline, error ? Colors.danger : Colors.primary],
  });

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label}>
          {label}{required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      ) : null}

      <Animated.View style={[
        styles.field,
        multiline && styles.fieldMultiline,
        { borderColor, backgroundColor: focused ? Colors.surfaceElevated : Colors.surfaceVariant },
        focused && styles.fieldFocused,
      ]}>
        {leftIcon ? (
          <MaterialCommunityIcons
            name={leftIcon}
            size={20}
            color={focused ? Colors.primary : Colors.onSurfaceMuted}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline]}
          value={value}
          onChangeText={handleChange}
          onFocus={(e) => { setFocused(true); animateTo(1); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); animateTo(0); rest.onBlur?.(e); }}
          placeholderTextColor={Colors.onSurfaceMuted}
          keyboardType={keyboardType ?? KEYBOARD_BY_MASK[mask]}
          multiline={multiline}
          {...rest}
        />
        {rightIcon ? (
          onRightIconPress ? (
            <TouchableOpacity onPress={onRightIconPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={rightIconLabel}>
              <MaterialCommunityIcons name={rightIcon} size={20} color={focused ? Colors.primary : Colors.onSurfaceMuted} style={styles.rightIcon} />
            </TouchableOpacity>
          ) : (
            <MaterialCommunityIcons name={rightIcon} size={20} color={focused ? Colors.primary : Colors.onSurfaceMuted} style={styles.rightIcon} />
          )
        ) : null}
      </Animated.View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

export const OlliInput = React.memo(OlliInputBase);

/* ─── Input de moeda dedicado (valor numérico) ─────────────────── */

interface OlliMoneyInputProps {
  label?: string;
  value: number;
  onChangeValue: (n: number) => void;
  required?: boolean;
  error?: string;
  helper?: string;
  placeholder?: string;
  containerStyle?: ViewStyle;
}

function OlliMoneyInputBase({
  label, value, onChangeValue, required, error, helper, placeholder, containerStyle,
}: OlliMoneyInputProps) {
  const [focused, setFocused] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const animateTo = useCallback((to: number) => {
    Animated.timing(anim, { toValue: to, duration: 150, useNativeDriver: false }).start();
  }, [anim]);

  const handleChange = useCallback((text: string) => {
    const { value: num } = maskCurrencyInput(text);
    onChangeValue(num);
  }, [onChangeValue]);

  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? Colors.danger : Colors.outline, error ? Colors.danger : Colors.primary],
  });

  const display = value ? currencyToMask(value) : '';

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label}>
          {label}{required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      ) : null}
      <Animated.View style={[
        styles.field,
        { borderColor, backgroundColor: focused ? Colors.surfaceElevated : Colors.surfaceVariant },
        focused && styles.fieldFocused,
      ]}>
        <Text style={[styles.currencyPrefix, focused && { color: Colors.primary }]}>R$</Text>
        <TextInput
          style={styles.input}
          value={display}
          onChangeText={handleChange}
          onFocus={() => { setFocused(true); animateTo(1); }}
          onBlur={() => { setFocused(false); animateTo(0); }}
          placeholder={placeholder ?? '0,00'}
          placeholderTextColor={Colors.onSurfaceMuted}
          keyboardType="numeric"
        />
      </Animated.View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

export const OlliMoneyInput = React.memo(OlliMoneyInputBase);

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.base },
  label: { fontSize: 13, fontFamily: Fonts.extraBold, color: Colors.onSurfaceVariant, marginBottom: 7 },
  req: { color: Colors.danger },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.3,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 15,
    minHeight: 52,
  },
  fieldMultiline: { alignItems: 'flex-start', paddingVertical: 10, minHeight: 88 },
  fieldFocused: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 4,
  },
  icon: { marginRight: 10 },
  rightIcon: { marginLeft: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.onSurface,
    paddingVertical: 12,
  },
  inputMultiline: { textAlignVertical: 'top', minHeight: 68 },
  currencyPrefix: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.onSurfaceMuted, marginRight: 8 },
  error: { fontSize: 12, color: Colors.danger, marginTop: 4, fontFamily: Fonts.medium },
  helper: { fontSize: 12, color: Colors.onSurfaceMuted, marginTop: 4 },
});
