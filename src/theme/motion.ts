import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing, Platform, UIManager } from 'react-native';
import { DURACAO } from './motionTokens';

// Tokens puros (durações, molas, curvas, distâncias, stagger) e os helpers de
// "Reduzir movimento". Moram num arquivo sem `react-native` para o teste rodar
// em Node; aqui só são reexportados.
export * from './motionTokens';

/**
 * Tokens da linguagem de movimento OLLI (v3).
 * Fonte única de duração/easing/stagger para toda animação do app —
 * qualquer componente novo de motion deve consumir daqui, nunca inventar
 * números soltos.
 */
export const Motion = {
  // Mesma escala de `DURACAO` (motionTokens.ts) — a antiga `base` 260/`slow` 420
  // foi alinhada a 240/360 para não haver duas tabelas de duração no app.
  dur: {
    instant: DURACAO.instant,
    fast: DURACAO.fast,
    base: DURACAO.base,
    slow: DURACAO.slow,
    celebrate: 900,
  },
  easing: {
    standard: Easing.out(Easing.cubic),
    spring: Easing.out(Easing.back(1.4)),
    inOut: Easing.inOut(Easing.ease),
  },
  stagger: 55,
  maxStagger: 12,
  /**
   * Tremida de "código errado" (campo de 6 dígitos): ±6px, 3 idas e voltas, dentro
   * de `dur.base`. Só translateX — nunca mexe em layout. Com "Reduzir movimento",
   * não treme: a cor e o texto do erro contam a mesma coisa.
   */
  tremida: { distancia: 6, ciclos: 3 },
  /**
   * Tokens dos efeitos WEB-ONLY (CSS transform via `Element.animate`/DOM, ver
   * Tilt3D.web.tsx) — Flutuar, Parallax e a CTA fixa da landing consomem daqui,
   * nunca número solto. `easingCss` é string CSS (não `Easing` do RN), porque
   * quem lê estes tokens é a Web Animations API, não `Animated`.
   */
  web: {
    float: { distanciaPx: 8, duracaoMs: 4000, easingCss: 'ease-in-out' as const },
    parallax: { fator: 0.15 },
  },
} as const;

// Habilita LayoutAnimation no Android (é opt-in fora do New Architecture
// clássico; com guard de plataforma e chamada única no módulo).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Último valor conhecido da preferência, compartilhado entre instâncias. O hook
 * resolve assíncrono; sem este cache, TODO componente montado depois do boot
 * (um toast, uma folha) nascia com `false` e animava o primeiro quadro mesmo com
 * "Reduzir movimento" ligado. Lido uma vez no import e mantido pelo listener.
 */
let reduzirConhecido = false;
try {
  AccessibilityInfo.isReduceMotionEnabled?.()
    .then(v => { reduzirConhecido = !!v; })
    .catch(() => {});
} catch {
  // API ausente: fica false (anima normalmente).
}

/**
 * `true` quando o usuário pediu MENOS movimento no sistema (iOS/Android "Reduzir
 * movimento", ou `prefers-reduced-motion: reduce` no web via react-native-web).
 * Componentes de motion devem pular o timing e renderizar direto no estado final
 * quando isto for verdadeiro — o conteúdo é idêntico, só sem a animação. Começa
 * `false` (resolve async) e atualiza ao vivo se a preferência mudar. Nunca lança.
 */
export function useReduzirMovimento(): boolean {
  const [reduzir, setReduzir] = useState(reduzirConhecido);
  useEffect(() => {
    let vivo = true;
    try {
      AccessibilityInfo.isReduceMotionEnabled?.()
        .then(v => { reduzirConhecido = !!v; if (vivo) setReduzir(!!v); })
        .catch(() => {});
    } catch {
      // API ausente em alguma plataforma → mantém false (anima normalmente)
    }
    let sub: { remove?: () => void } | undefined;
    try {
      sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => {
        reduzirConhecido = !!v;
        if (vivo) setReduzir(!!v);
      }) as { remove?: () => void } | undefined;
    } catch {
      // sem listener → sem atualizacao ao vivo, apenas o valor inicial
    }
    return () => { vivo = false; sub?.remove?.(); };
  }, []);
  return reduzir;
}

/** Nome antigo de `useReduzirMovimento` — mantido para os componentes existentes. */
export const useReducedMotion = useReduzirMovimento;
