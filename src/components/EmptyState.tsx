import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, Animated, Easing } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../theme';
import { OlliButton } from './OlliButton';
import { AnimatedEntrance } from './AnimatedEntrance';

interface Props {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

function FloatingIcon({ icon }: { icon: keyof typeof MaterialCommunityIcons.glyphMap }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, { toValue: -5, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View style={[styles.iconWrap, { transform: [{ translateY }] }]}>
      <MaterialCommunityIcons name={icon} size={42} color={cores.accentLight} />
    </Animated.View>
  );
}

export function EmptyState({ icon = 'file-document-outline', title, subtitle, actionLabel, onAction }: Props) {
  const styles = useEstilos(criarEstilos);
  return (
    <AnimatedEntrance from="scale" style={styles.container}>
      <FloatingIcon icon={icon} />
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <OlliButton label={actionLabel} onPress={onAction} style={styles.btn} />
      )}
    </AnimatedEntrance>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
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
      backgroundColor: c.surfaceGlass,
      borderWidth: 1,
      borderColor: c.strokeGlow,
    },
    title: { fontSize: 20, fontWeight: '800', color: c.onSurface, marginTop: Spacing.md, textAlign: 'center' },
    subtitle: { fontSize: 14, color: c.onSurfaceVariant, marginTop: Spacing.sm, textAlign: 'center', lineHeight: 20 },
    btn: { marginTop: Spacing.xl },
  });
