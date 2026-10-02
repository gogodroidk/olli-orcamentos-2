import { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, AccessibilityInfo } from 'react-native';
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { vibrar } from '../utils/haptico';
import { Typography, useCores, useGradientes, useEstilos, sombrasDe, type Cores } from '../theme';
import { DISTANCIA, Motion, useReduzirMovimento } from '../theme/motion';
import { curvas } from './motion/curvas';

interface Props {
  visible: boolean;
  tipo: 'gerado' | 'aprovado' | 'pago';
  onDone?: () => void;
}

/** Confete curto: poucas peças, uma rajada só (sem loop). */
const N_PARTICULAS = 14;

const TEXTOS: Record<Props['tipo'], string> = {
  gerado: 'Orçamento salvo!',
  aprovado: 'Negócio fechado!',
  pago: 'Pagamento recebido!',
};

interface Particula {
  id: number;
  dx: number;
  dy: number;
  cor: string;
  rotacaoFinal: number;
}

function gerarParticulas(coresParticula: string[]): Particula[] {
  return Array.from({ length: N_PARTICULAS }).map((_, i) => {
    const angulo = (Math.PI * 2 * i) / N_PARTICULAS + (Math.random() * 0.5 - 0.25);
    const distancia = 70 + Math.random() * 55;
    return {
      id: i,
      dx: Math.cos(angulo) * distancia,
      dy: Math.sin(angulo) * distancia,
      cor: coresParticula[i % coresParticula.length],
      rotacaoFinal: Math.random() * 360,
    };
  });
}

/**
 * Overlay de celebração — orçamento gerado, negócio aprovado ou pagamento quitado.
 *
 * Reanimated na UI thread, só `transform`/`opacity`, uma rajada de
 * `Motion.dur.celebrate` (sem loop). Não bloqueia toque (pointerEvents="none") e
 * avisa o fim por `onDone`. Com "Reduzir movimento" não desenha nada: fica o
 * háptico de sucesso e o anúncio do leitor de tela, e `onDone` sai na hora.
 */
export function Celebracao({ visible, tipo, onDone }: Props) {
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const progresso = useSharedValue(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  // '#F7B23B' é um dourado de confete decorativo, sem chave semântica no tema
  // (não é `warning` — aquele é ajustado por contraste, este é só celebração).
  const coresParticula = useMemo(
    () => [cores.accent, cores.success, cores.primaryLight, '#F7B23B'],
    [cores],
  );
  // Peças novas a cada celebração; fora dela, nenhuma.
  const particulas = useMemo(() => (visible ? gerarParticulas(coresParticula) : []), [visible, coresParticula]);

  // Háptico e anúncio: uma vez por celebração, com ou sem movimento.
  useEffect(() => {
    if (!visible) return;
    vibrar('sucesso');
    AccessibilityInfo.announceForAccessibility?.(TEXTOS[tipo]);
  }, [visible, tipo]);

  useEffect(() => {
    if (!visible) {
      cancelAnimation(progresso);
      progresso.set(0);
      return;
    }
    const terminar = () => onDoneRef.current?.();
    if (reduzir) {
      const id = setTimeout(terminar, 0);
      return () => clearTimeout(id);
    }
    progresso.set(0);
    progresso.set(withTiming(1, { duration: Motion.dur.celebrate, easing: curvas.decelerate }, (fim) => {
      if (fim) scheduleOnRN(terminar);
    }));
    return () => cancelAnimation(progresso);
  }, [visible, reduzir, progresso]);

  const estiloCheck = useAnimatedStyle(() => {
    const p = progresso.get();
    return {
      opacity: interpolate(p, [0, 0.15, 0.85, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(p, [0, 0.35, 0.55, 1], [0.6, 1.08, 1, 1], Extrapolation.CLAMP) }],
    };
  });
  const estiloTexto = useAnimatedStyle(() => {
    const p = progresso.get();
    return {
      opacity: interpolate(p, [0, 0.3, 0.85, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(p, [0, 0.3], [DISTANCIA.entrada, 0], Extrapolation.CLAMP) }],
    };
  });

  if (!visible || reduzir) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.centro}>
        {particulas.map((p) => (
          <PecaConfete key={p.id} particula={p} progresso={progresso} estilo={styles.particula} />
        ))}

        <Animated.View style={[styles.checkCircle, sombrasDe(cores).glowCyan, estiloCheck]}>
          <LinearGradient
            colors={gradientes.success}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.checkGradient}
          >
            {/* Branco fixo: o gradiente de sucesso é calibrado por contraste
                contra branco (ver criarGradientes). */}
            <MaterialCommunityIcons name={tipo === 'pago' ? 'cash-check' : 'check-bold'} size={54} color="#fff" />
          </LinearGradient>
        </Animated.View>

        <Animated.Text style={[Typography.h3, styles.texto, estiloTexto]}>
          {TEXTOS[tipo]}
        </Animated.Text>
      </View>
    </View>
  );
}

function PecaConfete({ particula, progresso, estilo }: {
  particula: Particula;
  progresso: SharedValue<number>;
  estilo: object;
}) {
  const { dx, dy, rotacaoFinal } = particula;
  const animado = useAnimatedStyle(() => {
    const p = progresso.get();
    // Rajada para fora e uma leve "queda" no fim (p²): confete, não fogos.
    return {
      opacity: interpolate(p, [0, 0.15, 0.75, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: dx * p },
        { translateY: dy * p + DISTANCIA.deslize * p * p },
        { rotate: `${rotacaoFinal * p}deg` },
      ],
    };
  });
  return <Animated.View style={[estilo, { backgroundColor: particula.cor }, animado]} />;
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
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
      borderRadius: 2,
    },
    texto: {
      marginTop: 18,
      // Flutua sobre a tela por trás (sem fundo próprio): segue a tinta do modo.
      color: c.onSurface,
      textAlign: 'center',
    },
  });
