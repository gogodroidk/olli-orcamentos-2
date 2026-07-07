import React, { useState } from 'react';
import { View, TextInput, StyleSheet, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../theme';

interface Props {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  largura?: number;
}

/**
 * Normaliza texto para comparação de busca acento-insensível e
 * case-insensível ("João" é achado por "joao"). Use nos filtros que
 * consomem o `valor` desta barra (ver Orçamentos/Clientes desktop).
 */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Campo de busca client-side usado nas ações de LayoutDesktop (Orçamentos,
 * Clientes...). Controlado — dono da tela guarda `valor` e filtra a lista.
 * Esc limpa o campo (padrão web) sem submeter/navegar.
 */
export function BarraBusca({ valor, aoMudar, placeholder = 'Buscar…', largura = 260 }: Props) {
  const [focado, setFocado] = useState(false);

  function aoApertarTecla(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === 'Escape' && valor.length > 0) {
      aoMudar('');
    }
  }

  return (
    <View style={[styles.container, { width: largura }, focado && styles.containerFocado]}>
      <MaterialCommunityIcons name="magnify" size={18} color={Colors.onSurfaceMuted} />
      <TextInput
        value={valor}
        onChangeText={aoMudar}
        onKeyPress={aoApertarTecla}
        placeholder={placeholder}
        placeholderTextColor={Colors.onSurfaceMuted}
        style={styles.input}
        onFocus={() => setFocado(true)}
        onBlur={() => setFocado(false)}
        returnKeyType="search"
      />
      {valor.length > 0 && (
        <MaterialCommunityIcons
          name="close-circle"
          size={16}
          color={Colors.onSurfaceMuted}
          onPress={() => aoMudar('')}
          suppressHighlighting
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outline,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 40,
  },
  containerFocado: {
    borderColor: Colors.accent,
  },
  input: {
    ...Typography.body,
    flex: 1,
    color: Colors.onSurface,
    outlineStyle: 'none' as any,
  },
});
