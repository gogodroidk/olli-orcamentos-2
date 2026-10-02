import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { comAlfa, textoSobre, useCores, type Cores } from '../../theme';
import { DISTANCIA, DURACAO, MOLA, atrasoEscalonado, useReduzirMovimento } from '../../theme/motion';
import { curvas } from '../motion/curvas';
import type { TomPin } from './tipos';

/** Cor de preenchimento de cada estado. Mesma régua na legenda da tela. */
export function corDoPin(tom: TomPin, c: Cores): string {
  switch (tom) {
    case 'feita':
      return c.primaryLight;
    case 'agora':
      return c.success;
    case 'proxima':
      return c.accent;
    case 'sem_baixa':
      return c.warning;
    case 'equipe':
      return c.primary;
    default:
      return c.onSurfaceMuted;
  }
}

/** Laranja do anel de chuva (fixo: é o "atenção ao tempo" do app inteiro). */
export const COR_CHUVA = '#F28C28';

interface Props {
  rotulo: string;
  tom: TomPin;
  chuva?: boolean;
  aproximado?: boolean;
  selecionado?: boolean;
  /** Posição na fila de entrada (os pins "caem" em sequência). */
  indice: number;
}

/**
 * Pin numerado do mapa. Entra "caindo" 12 px com fade, em sequência (40 ms por
 * pin); quando o número muda (rota reordenada), dá um pulso curto de escala. Só
 * `transform` e `opacity`; com "Reduzir movimento", aparece pronto.
 */
export function PinView({ rotulo, tom, chuva, aproximado, selecionado, indice }: Props) {
  const c = useCores();
  const reduzir = useReduzirMovimento();
  const y = useSharedValue(reduzir ? 0 : -DISTANCIA.entrada);
  const opacidade = useSharedValue(reduzir ? 1 : 0);
  const escala = useSharedValue(1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: entra uma vez por montagem.
  useEffect(() => {
    if (reduzir) return;
    const atraso = atrasoEscalonado(indice, false);
    y.set(withDelay(atraso, withSpring(0, MOLA.gentle)));
    opacidade.set(withDelay(atraso, withTiming(1, { duration: DURACAO.base, easing: curvas.decelerate })));
    return () => {
      cancelAnimation(y);
      cancelAnimation(opacidade);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pulso só quando o número troca.
  useEffect(() => {
    if (reduzir) return;
    escala.set(withSequence(withTiming(1.18, { duration: DURACAO.fast, easing: curvas.standard }), withSpring(1, MOLA.snappy)));
  }, [rotulo]);

  const estilo = useAnimatedStyle(() => ({
    opacity: opacidade.get(),
    transform: [{ translateY: y.get() }, { scale: escala.get() * (selecionado ? 1.12 : 1) }],
  }));

  const fundo = corDoPin(tom, c);
  const tinta = textoSobre(fundo);

  return (
    <Animated.View style={[styles.caixa, estilo]} pointerEvents="none">
      {aproximado ? <View style={[styles.halo, { borderColor: comAlfa(fundo, 0.55) }]} /> : null}
      {chuva ? <View style={[styles.anel, { borderColor: COR_CHUVA }]} /> : null}
      <View style={[styles.pin, { backgroundColor: fundo, borderColor: selecionado ? c.onSurface : '#FFFFFF' }]}>
        <Text style={[styles.rotulo, { color: tinta }]} numberOfLines={1}>{rotulo}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  caixa: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed' },
  anel: { position: 'absolute', width: 38, height: 38, borderRadius: 19, borderWidth: 3 },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  rotulo: { fontSize: 12.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
