import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, StatusBar, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Gradients, Spacing } from '../theme';

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: ViewStyle;
  compact?: boolean;
}

export function GradientHeader({ title, subtitle, onBack, right, children, style, compact }: Props) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top + (Platform.OS === 'android' ? 8 : 4);

  return (
    <LinearGradient
      colors={Gradients.header}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: topPad }, style]}
    >
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="chevron-left" size={28} color="#fff" />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginLeft: -8, marginRight: 4 },
  title: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  titleCompact: { fontSize: 18 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 2 },
});
