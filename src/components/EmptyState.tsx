import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Colors, Spacing } from '../theme';
import { OlliButton } from './OlliButton';

interface Props {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = 'file-document-outline', title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name={icon} size={42} color={Colors.accentLight} />
      </View>
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
  iconWrap: {
    width: 86,
    height: 86,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.strokeGlow,
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.onSurface, marginTop: Spacing.md, textAlign: 'center' },
  subtitle: { fontSize: 14, color: Colors.onSurfaceVariant, marginTop: Spacing.sm, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: Spacing.xl },
});
