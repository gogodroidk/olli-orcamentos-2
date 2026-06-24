import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from 'react-native-svg';

interface Props {
  size?: number;
  /** desenha um tile arredondado azul-profundo atrás (contexto de ícone). */
  tile?: boolean;
  /** estado "negócio fechado": check em menta + olhos claros. */
  approved?: boolean;
  /** legados — aceitos por compatibilidade, sem efeito no símbolo v3. */
  ringColor?: string;
  onDark?: boolean;
}

/**
 * Símbolo oficial OLLI — rebrand v3 (fonte da verdade: pacote de Identidade Visual).
 * Balão-documento + olhos + check, gradiente #3FD8EA→#0B6FCE. viewBox 0 0 64 64.
 * `approved` mostra o check em menta (#2BE39A) — o estado de orçamento aceito.
 */
export function OlliLogo({ size = 96, tile = false, approved = false }: Props) {
  const eyeFill = approved ? '#C7FBE6' : '#7FE9F5';
  const checkStroke = approved ? '#2BE39A' : '#EAFEFF';
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="olliG" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3FD8EA" />
          <Stop offset="1" stopColor="#0B6FCE" />
        </LinearGradient>
      </Defs>
      {tile && <Rect x="2" y="2" width="60" height="60" rx="16" fill="#0A2547" />}
      {/* rabinho do balão */}
      <Path d="M22 49 L12 59.5 L30 50 Z" fill="url(#olliG)" />
      {/* corpo balão-documento */}
      <Rect x="9" y="8" width="46" height="44" rx="14.5" fill="url(#olliG)" />
      {/* glint premium */}
      <Rect x="13" y="11.5" width="38" height="15" rx="9" fill="#ffffff" fillOpacity={0.1} />
      {/* olhos */}
      <Rect x="20" y="18.5" width="8.5" height="11" rx="4.2" fill={eyeFill} />
      <Rect x="35.5" y="18.5" width="8.5" height="11" rx="4.2" fill={eyeFill} />
      {/* check */}
      <Path d="M19 41 l6.6 6.9 l16 -15" fill="none" stroke={checkStroke} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
