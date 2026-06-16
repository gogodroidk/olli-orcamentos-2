import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusOrcamento, STATUS_LABELS, STATUS_COLORS } from '../types';
import { BorderRadius, Spacing } from '../theme';

interface Props {
  status: StatusOrcamento;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: Props) {
  const color = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];
  const fs = size === 'sm' ? 10 : 12;
  const px = size === 'sm' ? 6 : 10;
  const py = size === 'sm' ? 2 : 4;

  return (
    <View style={[styles.badge, { backgroundColor: color + '20', paddingHorizontal: px, paddingVertical: py }]}>
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
