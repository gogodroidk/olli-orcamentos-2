import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Colors, Gradients, Shadow, Spacing } from '../theme';
import { AnimatedEntrance } from './AnimatedEntrance';

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
  const isFramedWeb = Platform.OS === 'web' && typeof window !== 'undefined' && window.self !== window.top;
  const topPad = insets.top + (isFramedWeb ? 30 : 0) + (Platform.OS === 'android' ? 8 : 4);

  return (
    <LinearGradient
      colors={Gradients.header}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: topPad }, style]}
    >
      <View style={styles.glowLeft} />
      <View style={styles.glowRight} />
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Voltar">
            <MaterialCommunityIcons name="chevron-left" size={28} color="#fff" />
          </TouchableOpacity>
        ) : null}
        <AnimatedEntrance from="bottom" delay={60} style={{ flex: 1 }}>
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </AnimatedEntrance>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base,
    borderBottomLeftRadius: BorderRadius.xl,
    borderBottomRightRadius: BorderRadius.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.strokeGlow,
  },
  glowLeft: {
    position: 'absolute',
    left: -56,
    top: 8,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(52,198,217,0.13)',
  },
  glowRight: {
    position: 'absolute',
    right: -48,
    bottom: -66,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(11,111,206,0.16)',
  },
  row: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginLeft: -4,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    ...Shadow.sm,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0 },
  titleCompact: { fontSize: 18 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 2 },
});
