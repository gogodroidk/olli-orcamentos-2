import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Spacing, useCores, useGradientes, useEstilos, sombrasDe, comAlfa, type Cores } from '../theme';
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
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  const isFramedWeb = Platform.OS === 'web' && typeof window !== 'undefined' && window.self !== window.top;
  const topPad = insets.top + (isFramedWeb ? 30 : 0) + (Platform.OS === 'android' ? 8 : 4);

  return (
    <LinearGradient
      colors={gradientes.header}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: topPad }, style]}
    >
      <View style={styles.glowLeft} />
      <View style={styles.glowRight} />
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Voltar">
            <MaterialCommunityIcons name="chevron-left" size={28} color={gradientes.sobreHeader} />
          </TouchableOpacity>
        ) : null}
        <AnimatedEntrance from="bottom" delay={60} style={{ flex: 1 }}>
          <Text style={[styles.title, compact && styles.titleCompact, { color: gradientes.sobreHeader }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: comAlfa(gradientes.sobreHeader, 0.82) }]} numberOfLines={1}>{subtitle}</Text> : null}
        </AnimatedEntrance>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    container: {
      position: 'relative',
      overflow: 'hidden',
      paddingHorizontal: Spacing.base,
      paddingBottom: Spacing.base,
      borderBottomLeftRadius: BorderRadius.xl,
      borderBottomRightRadius: BorderRadius.xl,
      borderBottomWidth: 1,
      borderBottomColor: c.strokeGlow,
    },
    // glowLeft/glowRight/backBtn: manchas e chip translúcidos DESENHADOS SOBRE
    // o gradiente do header (não sobre uma superfície do app), com o mesmo
    // branco/ciano fixos nos dois modos — o próprio header já muda de cor por
    // baixo (cockpit no escuro, marca no claro) via `gradientes.header`.
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
      ...sombrasDe(c).sm,
    },
    // Sem cor aqui: o texto do header é decidido pelo GRADIENTE do header, e esta
    // fábrica só recebe `Cores`. `onPrimary` seria a resposta para "que texto vai
    // sobre a cor da marca?" — e no modo escuro o header não é feito da marca, é
    // azul-marinho fixo. Uma marca clara pintaria tinta escura ali: 1.10:1.
    title: { fontSize: 22, fontWeight: '800', letterSpacing: 0 },
    titleCompact: { fontSize: 18 },
    subtitle: { fontSize: 13, marginTop: 2 },
  });
