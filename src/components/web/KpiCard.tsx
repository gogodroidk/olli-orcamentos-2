import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../theme';

interface Props {
  titulo: string;
  valor: string;
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  corIcone?: string;
  rodape?: string;
}

/**
 * Cartão de indicador (KPI) do dashboard desktop — grid de 4 no topo da
 * Início desktop. Puramente apresentacional (recebe valor já formatado).
 */
export function KpiCard({ titulo, valor, icone, corIcone = Colors.accent, rodape }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.linhaTopo}>
        <Text style={styles.titulo} numberOfLines={1}>{titulo}</Text>
        <View style={[styles.iconeWrap, { backgroundColor: corIcone + '20' }]}>
          <MaterialCommunityIcons name={icone} size={18} color={corIcone} />
        </View>
      </View>
      <Text style={styles.valor} numberOfLines={1}>{valor}</Text>
      {rodape && (
        <Text style={styles.rodape} numberOfLines={1}>{rodape}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 220,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  linhaTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  titulo: {
    ...Typography.label,
    color: Colors.onSurfaceVariant,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  iconeWrap: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valor: {
    ...Typography.value,
    color: Colors.onSurface,
  },
  rodape: {
    ...Typography.caption,
    color: Colors.onSurfaceMuted,
  },
});
