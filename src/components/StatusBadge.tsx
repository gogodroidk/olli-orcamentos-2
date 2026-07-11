import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusOrcamento, STATUS_LABELS, STATUS_COLORS } from '../types';
import { BorderRadius, useCores, corStatusOrcamento } from '../theme';

interface Props {
  status: StatusOrcamento;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: Props) {
  const cores = useCores();
  // Fundo = matiz CRUA diluída (é ela que corStatusOrcamento assume como
  // superfície do chip); texto = matiz ajustada por contraste contra esse
  // fundo real. Ver corStatusOrcamento/corCategoriaEmChip em theme/cores.ts.
  const corBase = STATUS_COLORS[status];
  const color = corStatusOrcamento(corBase, cores.surface);
  const label = STATUS_LABELS[status];
  const fs = size === 'sm' ? 10 : 12;
  const px = size === 'sm' ? 6 : 10;
  const py = size === 'sm' ? 2 : 4;

  return (
    <View style={[styles.badge, { backgroundColor: corBase + '20', paddingHorizontal: px, paddingVertical: py }]}>
      <Text style={[styles.text, { color, fontSize: fs }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  text: { fontWeight: '700' },
});
