import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated, StyleSheet, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Gradients, Shadow, Typography } from '../theme';
import { Motion } from '../theme/motion';

interface Props {
  visible: boolean;
  tipo: 'gerado' | 'aprovado';
  onDone?: () => void;
}

const useNativeAnimations = Platform.OS !== 'web';
const N_PARTICULAS = 14;
const CORES_PARTICULA = [Colors.accent, Colors.success, Colors.primaryLight, '#F7B23B'];

const TEXTOS: Record<Props['tipo'], string> = {
  gerado: 'Orçamento pronto!',
  aprovado: 'Negócio fechado!',
};

interface Particula {
  angulo: number;
  distancia: number;
  cor: string;
  rotacaoFinal: number;
}

function gerarParticulas(): Particula[] {
  return Array.from({ length: N_PARTICULAS }).map((_, i) => ({
    angulo: (Math.PI * 2 * i) / N_PARTICULAS + (Math.random() * 0.5 - 0.25),
    distancia: 70 + Math.random() * 55,
    cor: CORES_PARTICULA[i % CORES_PARTICULA.length],
    rotacaoFinal: Math.random() * 360,
  }));
}

/**
 * Overlay de celebração — orçamento gerado / negócio aprovado.
 * Não bloqueia toque (pointerEvents="none") e se desmonta sozinha via onDone.
 */
export function Celebracao({ visible, tipo, onDone }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const particulas = useMemo(() => gerarParticulas(), [visible]);

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: Motion.dur.celebrate,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: useNativeAnimations,
    }).start(() => {
      onDone?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tipo]);

  if (!visible) return null;

  const checkScale = progress.interpolate({
    inputRange: [0, 0.35, 0.55, 1],
    outputRange: [0, 1.1, 1, 1],
    extrapolate: 'clamp',
  });
  const checkOpacity = progress.interpolate({
    inputRange: [0, 0.15, 0.85, 1],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });
  const textoOpacity = progress.interpolate({
    inputRange: [0, 0.3, 0.85, 1],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });
  const textoTranslateY = progress.interpolate({
    inputRange: [0, 0.3],
    outputRange: [10, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.centro}>
        {particulas.map((p, i) => {
          const tx = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.cos(p.angulo) * p.distancia],
            extrapolate: 'clamp',
          });
          const ty = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.sin(p.angulo) * p.distancia],
            extrapolate: 'clamp',
          });
          const opacity = progress.interpolate({
            inputRange: [0, 0.2, 0.9, 1],
            outputRange: [0, 1, 1, 0],
            extrapolate: 'clamp',
          });
          const rotate = progress.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', `${p.rotacaoFinal}deg`],
          });
          return (
            <Animated.View
              key={i}
              style={[
                styles.particula,
                {
                  backgroundColor: p.cor,
                  opacity,
                  transform: [{ translateX: tx }, { translateY: ty }, { rotate }],
                },
              ]}
            />
          );
        })}

        <Animated.View
          style={[
            styles.checkCircle,
            Shadow.glowCyan,
            { opacity: checkOpacity, transform: [{ scale: checkScale }] },
          ]}
        >
          <LinearGradient
            colors={Gradients.success}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.checkGradient}
          >
            <MaterialCommunityIcons name="check-bold" size={54} color="#fff" />
          </LinearGradient>
        </Animated.View>

        <Animated.Text
          style={[
            Typography.h3,
            styles.texto,
            { opacity: textoOpacity, transform: [{ translateY: textoTranslateY }] },
          ]}
        >
          {TEXTOS[tipo]}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
  },
  checkGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  particula: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  texto: {
    marginTop: 18,
    color: '#fff',
    textAlign: 'center',
  },
});
