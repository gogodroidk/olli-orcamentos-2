import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Polyline, Text as SvgText } from 'react-native-svg';
import { BorderRadius, comAlfa, textoSobre, useCores, useEstilos, type Cores } from '../../theme';
import { COR_CHUVA, corDoPin } from './PinView';
import type { MapaBaseProps } from './tipos';

/**
 * ESQUEMA DAS PARADAS — quando não há mapa de fundo (web, ou um APK antigo sem o
 * módulo nativo do MapLibre). Desenha as paradas nas posições RELATIVAS certas
 * (lon × cos(lat), lat) com a linha da rota, e diz em voz alta que é um esquema,
 * "sem mapa de fundo" — nunca um mapa falso.
 */
export function EsquemaRota({ pins, linha, onPinPress, selecionado, style, aviso }: MapaBaseProps & { aviso?: string }) {
  const c = useCores();
  const styles = useEstilos(criarEstilos);
  const [tam, setTam] = useState({ w: 0, h: 0 });

  const projetar = useMemo(() => {
    const pontos = [...pins.map((p) => [p.lon, p.lat] as [number, number]), ...(linha ?? [])];
    if (pontos.length === 0 || tam.w === 0) return null;
    const latMedia = pontos.reduce((s, p) => s + p[1], 0) / pontos.length;
    const k = Math.cos((latMedia * Math.PI) / 180);
    const xs = pontos.map((p) => p[0] * k);
    const ys = pontos.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const margem = 30;
    const larg = Math.max(maxX - minX, 1e-6);
    const alt = Math.max(maxY - minY, 1e-6);
    const escala = Math.min((tam.w - 2 * margem) / larg, (tam.h - 2 * margem) / alt);
    const offX = (tam.w - larg * escala) / 2;
    const offY = (tam.h - alt * escala) / 2;
    return (lon: number, lat: number) => ({ x: offX + (lon * k - minX) * escala, y: tam.h - (offY + (lat - minY) * escala) });
  }, [pins, linha, tam]);

  const aoMedir = (e: LayoutChangeEvent) => setTam({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  return (
    <View style={[styles.caixa, style]} onLayout={aoMedir} accessibilityLabel="Esquema das paradas do dia, sem mapa de fundo">
      {projetar ? (
        <Svg width={tam.w} height={tam.h}>
          {linha && linha.length > 1 ? (
            <Polyline
              points={linha.map(([lon, lat]) => { const p = projetar(lon, lat); return `${p.x},${p.y}`; }).join(' ')}
              fill="none"
              stroke={comAlfa(c.accent, 0.8)}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {pins.map((p) => {
            const { x, y } = projetar(p.lon, p.lat);
            const fundo = corDoPin(p.tom, c);
            return (
              <React.Fragment key={p.id}>
                {p.chuva ? <Circle cx={x} cy={y} r={18} stroke={COR_CHUVA} strokeWidth={3} fill="none" /> : null}
                <Circle cx={x} cy={y} r={selecionado === p.id ? 15 : 13} fill={fundo} stroke={c.surface} strokeWidth={2} />
                <SvgText x={x} y={y + 4} fontSize={12} fontWeight="800" fill={textoSobre(fundo)} textAnchor="middle">{p.rotulo}</SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
      {onPinPress ? (
        // Alvos de toque por cima do SVG (44 px), um por pin.
        pins.map((p) => {
          if (!projetar) return null;
          const { x, y } = projetar(p.lon, p.lat);
          return (
            <Pressable
              key={`toque-${p.id}`}
              onPress={() => onPinPress(p.id)}
              style={[styles.alvo, { left: x - 22, top: y - 22 }]}
              accessibilityRole="button"
              accessibilityLabel={p.acessibilidade}
            />
          );
        })
      ) : null}
      <Text style={styles.legenda}>{aviso ?? 'Esquema das paradas, sem mapa de fundo'}</Text>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    caixa: { backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, overflow: 'hidden', minHeight: 120 },
    alvo: { position: 'absolute', width: 44, height: 44 },
    legenda: {
      position: 'absolute',
      left: 8,
      bottom: 6,
      fontSize: 13,
      fontWeight: '600',
      color: c.onSurfaceMuted,
    },
  });
