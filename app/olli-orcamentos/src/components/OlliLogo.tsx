import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';

interface Props {
  size?: number;
  /** true = mostra o tile azul-profundo atrás (ícone do app); false = só o monograma */
  tile?: boolean;
  /** cor do anel quando tile=false (ex: branco sobre header) */
  ringColor?: string;
}

/**
 * Monograma "O" da marca OLLI: anel em gradiente azul->ciano com um
 * ponto de gelo (frost) na abertura. Vetorial, nítido em qualquer tamanho.
 */
export function OlliLogo({ size = 96, tile = true, ringColor }: Props) {
  const s = size;
  const c = s / 2;
  const r = s * 0.23;
  const sw = s * 0.094;

  return (
    <Svg width={s} height={s} viewBox="0 0 96 96">
      <Defs>
        <LinearGradient id="olliRing" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#0B6FCE" />
          <Stop offset="1" stopColor="#34C6D9" />
        </LinearGradient>
      </Defs>
      {tile && <Rect width="96" height="96" rx="22" fill="#0A2540" />}
      <Circle
        cx="48"
        cy="48"
        r="22"
        fill="none"
        stroke={tile || !ringColor ? 'url(#olliRing)' : ringColor}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray="112 32"
        transform="rotate(-58 48 48)"
      />
      <Circle cx="65" cy="33" r="4.5" fill={tile || !ringColor ? '#34C6D9' : ringColor} />
    </Svg>
  );
}
