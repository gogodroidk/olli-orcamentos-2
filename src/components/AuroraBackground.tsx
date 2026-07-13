import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { useReducedMotion } from '../theme/motion';
import { comAlfa } from '../theme';

/**
 * Fundo AURORA — orbes de cor que derivam devagar atras do conteudo. Reimplementa,
 * em RN puro, o efeito "aurora/gradient glow" que virou padrao em landing de SaaS
 * (referencia: os componentes AuroraBackground/Aurora Flow do 21st.dev). NAO usa
 * WebGL/canvas (a regra 7 do gate proibe canvas continuo atras de conteudo): sao
 * Animated.View com blend de baixa opacidade, animando SO transform e opacity
 * (native driver). Atmosferico, para a LANDING/telas de marca — nunca atras de
 * formulario/tabela/tarefa.
 *
 * Respeita reduced-motion: quando o usuario pede menos movimento, os orbes ficam
 * parados no estado final (o visual continua, so nao anima). `pausado` congela
 * (ex.: fora da viewport) para nao gastar frame a toa.
 */
type Props = {
  /** Cores dos orbes (2–4). Default: derivadas da marca pelo chamador. */
  cores: readonly string[];
  /** 0–1: intensidade (opacidade base dos orbes). Default 0.5. */
  intensidade?: number;
  /** Congela a animacao (ex.: secao fora da tela). */
  pausado?: boolean;
  style?: ViewStyle;
};

// Posicoes/tamanhos relativos e fases de cada orbe — numeros de layout, nao de
// motion (por isso ficam aqui, nao nos tokens). Cada orbe deriva num ciclo proprio
// para o conjunto nunca "repetir" de forma obvia.
const ORBES = [
  { topPct: -0.15, leftPct: -0.12, size: 1.05, dur: 13000, dx: 26, dy: 20, delay: 0 },
  { topPct: 0.10, leftPct: 0.55, size: 0.85, dur: 17000, dx: -30, dy: 24, delay: 1200 },
  { topPct: 0.45, leftPct: 0.05, size: 0.95, dur: 15000, dx: 22, dy: -26, delay: 2400 },
  { topPct: 0.30, leftPct: 0.30, size: 0.7, dur: 19000, dx: -18, dy: -20, delay: 600 },
] as const;

function Orbe({ cor, cfg, intensidade, animar }: {
  cor: string; cfg: (typeof ORBES)[number]; intensidade: number; animar: boolean;
}) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Na WEB, orbes ESTÁTICAS: o loop contínuo rodaria pra sempre no thread JS
    // (RNW sem driver nativo) e travaria a tela de login/onboarding. Fundo parado
    // continua bonito e a página assenta.
    if (!animar || Platform.OS === 'web') { t.stopAnimation(); t.setValue(0); return; }
    // Vai-e-volta suave (0→1→0) num loop longo; o delay defasa os orbes.
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: cfg.dur, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(t, { toValue: 0, duration: cfg.dur, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    const timer = setTimeout(() => anim.start(), cfg.delay);
    return () => { clearTimeout(timer); anim.stop(); };
  }, [animar, cfg, t]);

  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, cfg.dx] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, cfg.dy] });
  const scale = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1] });
  const opacity = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [intensidade, intensidade * 1.25, intensidade] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.orbeWrap,
        {
          top: pct(cfg.topPct), left: pct(cfg.leftPct),
          width: ORBE_BASE * cfg.size, height: ORBE_BASE * cfg.size,
          borderRadius: (ORBE_BASE * cfg.size) / 2,
          backgroundColor: comAlfa(cor, 0.9),
          opacity: animar ? opacity : intensidade,
          transform: animar ? [{ translateX }, { translateY }, { scale }] : [],
        },
        // No web (o site de marketing e web-first) um blur real deixa o aurora
        // genuinamente suave; no nativo o blend de baixa opacidade ja resolve.
        Platform.OS === 'web' ? ({ filter: 'blur(48px)' } as unknown as ViewStyle) : null,
      ]}
    />
  );
}

const ORBE_BASE = 320;
// Posicoes sao relativas a uma "tela" de referencia; um multiplicador simples
// espalha os orbes de forma consistente sem precisar medir o container.
function pct(p: number) { return p * 520; }

export function AuroraBackground({ cores, intensidade = 0.5, pausado = false, style }: Props) {
  const reduzir = useReducedMotion();
  const animar = !reduzir && !pausado;
  // Emparelha cada orbe a uma cor (cicla se houver menos cores que orbes).
  const paleta = useMemo(
    () => ORBES.map((_, i) => cores[i % Math.max(1, cores.length)] ?? cores[0] ?? '#0B6FCE'),
    [cores],
  );

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.container, style]}>
      {ORBES.map((cfg, i) => (
        <Orbe key={i} cor={paleta[i]} cfg={cfg} intensidade={intensidade} animar={animar} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // overflow hidden para os orbes que "vazam" nao criarem scroll/artefato.
  container: { overflow: 'hidden' },
  orbeWrap: { position: 'absolute' },
});
