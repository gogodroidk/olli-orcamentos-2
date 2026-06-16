import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing } from '../theme';
import { OlliButton } from './OlliButton';

interface Props {
  icon?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = 'file-document-outline', title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name={icon as any} size={64} color={Colors.onSurfaceMuted} />
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <OlliButton label={actionLabel} onPress={onAction} style={styles.btn} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xxl,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.onSurface, marginTop: Spacing.md, textAlign: 'center' },
  subtitle: { fontSize: 14, color: Colors.onSurfaceVariant, marginTop: Spacing.sm, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: Spacing.xl },
});
