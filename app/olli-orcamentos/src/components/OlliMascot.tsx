import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Rect, Circle, Line } from 'react-native-svg';

interface Props {
  size?: number;
  /** flutua de leve pra cima e pra baixo */
  float?: boolean;
  /** pisca os olhos de vez em quando */
  blink?: boolean;
  /** quando dentro de um tile/superfície escura, usa o ciano no lugar do azul */
  onDark?: boolean;
}

/**
 * Mascote OLLI — assistente de IA da marca (inspirado no Wall-E, geométrico).
 * Cabeça arredondada CHAPADA, olhos ciano-gelo (dois círculos), visor escuro, antena.
 * viewBox 0 0 48 48. Cores fiéis ao design handoff.
 */
export function OlliMascot({ size = 48, float = true, blink = true, onDark = false }: Props) {
  const translateY = useRef(new Animated.Value(0)).current;
  const [eyeOpen, setEyeOpen] = useState(true);

  // Cabeça chapada: azul sobre fundo claro, ciano dentro de tile/escuro
  const headColor = onDark ? '#34C6D9' : '#0B6FCE';
  // Acento (antena): ciano-gelo no escuro, ciano no claro
  const accentColor = onDark ? '#7FE9F5' : '#34C6D9';

  useEffect(() => {
    if (!float) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, { toValue: -size * 0.06, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [float, size]);

  useEffect(() => {
    if (!blink) return;
    const id = setInterval(() => {
      setEyeOpen(false);
      setTimeout(() => setEyeOpen(true), 150);
    }, 3600);
    return () => clearInterval(id);
  }, [blink]);

  // olhos: dois círculos; ao piscar achatam (raio vai a quase zero)
  const eyeR = eyeOpen ? 3.4 : 0.6;

  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        {/* antena */}
        <Line x1="24" y1="11" x2="24" y2="5" stroke={accentColor} strokeWidth="1.6" strokeLinecap="round" />
        <Circle cx="24" cy="4" r="2.6" fill={accentColor} />
        {/* cabeça (chapada) */}
        <Rect x="7" y="11" width="34" height="29" rx="11" fill={headColor} />
        {/* visor escuro (sólido) */}
        <Rect x="11.5" y="16" width="25" height="18" rx="9" fill="#0A2540" />
        {/* olhos (dois círculos ciano-gelo) */}
        <Circle cx="19.5" cy="25" r={eyeR} fill="#7FE9F5" />
        <Circle cx="29.5" cy="25" r={eyeR} fill="#7FE9F5" />
      </Svg>
    </Animated.View>
  );
}
