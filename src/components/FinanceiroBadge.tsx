import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, Typography, comAlfa, useCores } from '../theme';
import { getBadgeFinanceiro, type StatusFinanceiro } from '../services/pagamentos';

/** Estado financeiro derivado do recibo, separado do status comercial do orçamento. */
export function FinanceiroBadge({ status }: { status: StatusFinanceiro | null }) {
  const cores = useCores();
  if (!status) return null;
  const badge = getBadgeFinanceiro(status);

  const tone = status === 'aguardando_pagamento' || status === 'parcial'
    ? cores.warning
    : status === 'pago'
      ? cores.success
      : cores.accentLight;

  return (
    <View
      style={[styles.badge, { backgroundColor: comAlfa(tone, 0.12), borderColor: comAlfa(tone, 0.32) }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Financeiro: ${badge.label}`}
    >
      <MaterialCommunityIcons name={badge.icon} size={14} color={tone} />
      <Text style={[styles.label, { color: tone }]} numberOfLines={1}>{badge.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    maxWidth: 170,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  label: {
    ...Typography.caption,
    fontWeight: '700',
  },
});
