import React, { useState } from 'react';
import { View, TextInput, StyleSheet, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, type Cores } from '../../theme';

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
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  function aoApertarTecla(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === 'Escape' && valor.length > 0) {
      aoMudar('');
    }
  }

  return (
    <View style={[styles.container, { width: largura }, focado && styles.containerFocado]}>
      <MaterialCommunityIcons name="magnify" size={18} color={cores.onSurfaceMuted} />
      <TextInput
        value={valor}
        onChangeText={aoMudar}
        onKeyPress={aoApertarTecla}
        placeholder={placeholder}
        placeholderTextColor={cores.onSurfaceMuted}
        style={styles.input}
        onFocus={() => setFocado(true)}
        onBlur={() => setFocado(false)}
        returnKeyType="search"
      />
      {valor.length > 0 && (
        <MaterialCommunityIcons
          name="close-circle"
          size={16}
          color={cores.onSurfaceMuted}
          onPress={() => aoMudar('')}
          suppressHighlighting
        />
      )}
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 40,
  },
  containerFocado: {
    borderColor: c.accent,
  },
  input: {
    ...Typography.body,
    flex: 1,
    color: c.onSurface,
    outlineStyle: 'none' as any,
  },
});
