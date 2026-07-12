import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, StyleSheet, ViewStyle, Easing, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, comAlfa, useTema } from '../theme';
import { useReducedMotion } from '../theme/motion';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

/**
 * Placeholder com shimmer — usado em TODO loading da v3.
 * Nunca deixe uma tela carregando vazia ou só com spinner: use isto no
 * formato aproximado do conteúdo real.
 */
export function OlliSkeleton({ width = '100%', height = 16, radius = BorderRadius.md, style }: SkeletonProps) {
  const { modo, cores } = useTema();
  const reduzir = useReducedMotion();
  const [w, setW] = useState(0);
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // reduced-motion: sem shimmer (o box de superfície estático já sinaliza o
    // carregamento). Sem o loop, t=0 → o brilho fica fora da tela, invisível.
    if (reduzir) return;
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [t, reduzir]);

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const translateX = t.interpolate({
    inputRange: [0, 1],
    outputRange: [-w, w],
  });

  // O brilho precisa CONTRASTAR com a superfície por baixo, não só existir:
  // no escuro é um glint ciano claro sobre o fundo escuro (como antes); no
  // claro a superfície já é quase branca, então o brilho precisa ser mais
  // ESCURO que ela para o movimento aparecer (pedido explícito da migração).
  const corBrilho = modo === 'escuro' ? comAlfa(cores.accentLight, 0.10) : comAlfa(cores.onSurface, 0.06);

  return (
    <View
      onLayout={onLayout}
      style={[
        { width: width as ViewStyle['width'], height, borderRadius: radius, backgroundColor: cores.surfaceVariant, overflow: 'hidden' },
        style,
      ]}
    >
      {w > 0 && (
        <Animated.View
          style={[styles.shimmerWrap, { width: w * 0.6, transform: [{ translateX }] }]}
        >
          <LinearGradient
            colors={['transparent', corBrilho, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

interface LinesProps {
  count?: number;
  style?: ViewStyle;
}

const LARGURAS = ['100%', '85%', '60%'] as const;

/** Bloco de N linhas de texto simulado (títulos, listas, parágrafos). */
function Lines({ count = 3, style }: LinesProps) {
  return (
    <View style={[{ gap: 8 }, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <OlliSkeleton key={i} width={LARGURAS[i % LARGURAS.length]} height={12} />
      ))}
    </View>
  );
}

OlliSkeleton.Lines = Lines;

const styles = StyleSheet.create({
  shimmerWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
});
