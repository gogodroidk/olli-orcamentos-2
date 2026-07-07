import { Easing, Platform, UIManager } from 'react-native';

/**
 * Tokens da linguagem de movimento OLLI (v3).
 * Fonte única de duração/easing/stagger para toda animação do app —
 * qualquer componente novo de motion deve consumir daqui, nunca inventar
 * números soltos.
 */
export const Motion = {
  dur: {
    fast: 160,
    base: 260,
    slow: 420,
    celebrate: 900,
  },
  easing: {
    standard: Easing.out(Easing.cubic),
    spring: Easing.out(Easing.back(1.4)),
    inOut: Easing.inOut(Easing.ease),
  },
  stagger: 55,
  maxStagger: 12,
} as const;

// Habilita LayoutAnimation no Android (é opt-in fora do New Architecture
// clássico; com guard de plataforma e chamada única no módulo).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
