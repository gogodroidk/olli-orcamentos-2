import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type DimensionValue, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, comAlfa, useTema } from '../../theme';
import { CICLO, useReduzirMovimento } from '../../theme/motion';
import { curvas } from './curvas';

interface Props {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Fração da largura ocupada pela faixa de brilho. */
const LARGURA_BRILHO = 0.6;

/**
 * Placeholder de carregamento com um brilho leve passando (só `translateX`, na
 * UI thread). É o ÚNICO loop infinito permitido na fundação de motion — e ele
 * morre junto com o componente (o skeleton sai quando o dado chega).
 *
 * Sem brilho quando: "Reduzir movimento" ligado, ou web (lá o Reanimated roda no
 * thread JS, e um loop em todo loading vira jank). O bloco estático já comunica
 * "carregando" sozinho.
 */
export function Skeleton({ width = '100%', height = 16, radius = BorderRadius.md, style }: Props) {
  const { modo, cores } = useTema();
  const reduzir = useReduzirMovimento();
  const [largura, setLargura] = useState(0);
  const t = useSharedValue(0);
  const animar = !reduzir && Platform.OS !== 'web' && largura > 0;

  useEffect(() => {
    if (!animar) {
      cancelAnimation(t);
      t.set(0);
      return;
    }
    t.set(withRepeat(withTiming(1, { duration: CICLO.shimmer, easing: curvas.standard }), -1, false));
    return () => cancelAnimation(t);
  }, [animar, t]);

  const estiloBrilho = useAnimatedStyle(() => ({
    transform: [{ translateX: -largura + t.get() * largura * 2 }],
  }));

  const onLayout = (e: LayoutChangeEvent) => setLargura(e.nativeEvent.layout.width);

  // O brilho precisa contrastar com a superfície: claro sobre o escuro, e um
  // pouco mais escuro que a superfície quase branca no modo claro.
  const corBrilho = modo === 'escuro' ? comAlfa(cores.accentLight, 0.10) : comAlfa(cores.onSurface, 0.06);

  return (
    <View
      onLayout={onLayout}
      accessibilityRole="progressbar"
      accessibilityLabel="Carregando"
      style={[{ width, height, borderRadius: radius, backgroundColor: cores.surfaceVariant, overflow: 'hidden' }, style]}
    >
      {animar && (
        <Animated.View style={[styles.faixa, { width: largura * LARGURA_BRILHO }, estiloBrilho]}>
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

const styles = StyleSheet.create({
  faixa: { position: 'absolute', top: 0, bottom: 0 },
});
