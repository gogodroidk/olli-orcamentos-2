import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Line } from 'react-native-svg';

interface Props {
  size?: number;
  /** flutua de leve pra cima e pra baixo */
  float?: boolean;
  /** pisca os olhos de vez em quando */
  blink?: boolean;
}

/**
 * Mascote OLLI — assistente de IA da marca (inspirado no Wall-E, geométrico).
 * Cabeça arredondada em gradiente azul->ciano, olhos ciano-gelo, antena.
 */
export function OlliMascot({ size = 48, float = true, blink = true }: Props) {
  const translateY = useRef(new Animated.Value(0)).current;
  const [eyeOpen, setEyeOpen] = useState(true);

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

  const eyeH = eyeOpen ? 7 : 1.5;
  const eyeY = eyeOpen ? 22 : 25;

  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Defs>
          <LinearGradient id="olliHead" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#0B6FCE" />
            <Stop offset="1" stopColor="#34C6D9" />
          </LinearGradient>
        </Defs>
        {/* antena */}
        <Line x1="24" y1="14" x2="24" y2="7" stroke="#34C6D9" strokeWidth="1.6" strokeLinecap="round" />
        <Circle cx="24" cy="6" r="2.2" fill="#7FE9F5" />
        {/* cabeça */}
        <Rect x="7" y="13" width="34" height="28" rx="11" fill="url(#olliHead)" />
        {/* visor escuro */}
        <Rect x="12" y="19" width="24" height="15" rx="7" fill="#0A1626" opacity={0.35} />
        {/* olhos */}
        <Rect x="16.5" y={eyeY} width="6" height={eyeH} rx="3" fill="#7FE9F5" />
        <Rect x="25.5" y={eyeY} width="6" height={eyeH} rx="3" fill="#7FE9F5" />
      </Svg>
    </Animated.View>
  );
}
