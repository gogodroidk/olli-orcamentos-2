import { Easing } from 'react-native-reanimated';
import { CURVA, type Curva } from '../../theme/motionTokens';

const bezier = (c: Curva) => Easing.bezier(c[0], c[1], c[2], c[3]);

/**
 * As curvas de `CURVA` (motionTokens.ts) já prontas para `withTiming` do
 * Reanimated. Mesmo número, outro motor: o mundo `Animated` usa `Motion.easing`.
 */
export const curvas = {
  standard: bezier(CURVA.standard),
  emphasized: bezier(CURVA.emphasized),
  decelerate: bezier(CURVA.decelerate),
} as const;
