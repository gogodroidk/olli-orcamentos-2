/**
 * MINI-MAPA DO DIA no Painel da Rua (bloco 4 do plano, Onda I2): 160 px com os
 * pins numerados e a linha das paradas, mais "4 visitas · 38 km · termina ~17h30"
 * (estimativa). Tocar abre o Mapa do Dia.
 *
 * Grátis: MapLibre + OpenFreeMap (atribuição visível dentro do mapa), pontos dos
 * clientes já salvos, km estimados no aparelho.
 *
 * Estados (a Rota de Hoje logo abaixo já cuida de "carregando/erro/nada hoje"):
 *  - carregando ou erro da agenda → não desenha (sem 2º aviso igual na tela);
 *  - visitas hoje mas nenhuma com local → linha honesta "N visitas sem local no
 *    mapa · Completar", que abre o Mapa (lá está a lista para completar);
 *  - pelo menos uma com local → o mini-mapa.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../../theme';
import type { Agendamento, Cliente } from '../../types';
import type { ParadaDoDia } from '../../utils/agendaDia';
import { diaNoMapa, linhaDaRota, resumoDoDia } from '../../utils/mapaDia';
import { totaisDaRota } from '../../services/rotaOtimizar';
import { ROTULO_ESTIMATIVA } from '../../services/etaEstimado';
import { MapaBase } from '../mapa/MapaBase';
import type { PinMapa } from '../mapa/tipos';
import { PressableAnimado } from '../motion/PressableAnimado';
import { DicaContextual } from '../DicaContextual';

export const ALTURA_MINI_MAPA = 160;

interface Props {
  estado: 'carregando' | 'ok' | 'erro';
  paradas: readonly ParadaDoDia<Agendamento>[];
  clientes: readonly Cliente[];
  onAbrirMapa: () => void;
}

export function MiniMapaDia({ estado, paradas, clientes, onAbrirMapa }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const dia = useMemo(() => diaNoMapa(paradas, clientes), [paradas, clientes]);
  const pins = useMemo<PinMapa[]>(
    () =>
      dia.comLocal.map((p) => ({
        id: p.id,
        lat: p.ponto.lat,
        lon: p.ponto.lon,
        rotulo: String(p.numero),
        tom: p.estado,
        aproximado: p.aproximado,
        acessibilidade: `Parada ${p.numero}, ${p.nome}`,
      })),
    [dia],
  );
  const linha = useMemo(() => linhaDaRota(dia.comLocal.map((p) => p.ponto)), [dia]);
  const resumo = useMemo(() => {
    const total = paradas.length;
    if (dia.comLocal.length === 0) return null;
    const t = totaisDaRota(
      dia.comLocal.map((p) => ({ id: p.id, ponto: p.ponto, inicioMs: p.inicioMs, duracaoMin: p.duracaoMin, fixa: true })),
      null,
    );
    const ultimo = [...dia.comLocal, ...dia.semLocal].reduce((m, p) => Math.max(m, p.inicioMs + p.duracaoMin * 60_000), 0);
    return resumoDoDia(total, dia.comLocal.length > 1 ? t.km : null, ultimo || null);
  }, [dia, paradas.length]);

  if (estado !== 'ok' || paradas.length === 0) return null;

  if (dia.comLocal.length === 0) {
    return (
      <PressableAnimado
        style={styles.semLocal}
        onPress={onAbrirMapa}
        haptic="selection"
        accessibilityLabel={`${dia.semLocal.length} visitas de hoje sem local no mapa. Abrir o mapa para completar os endereços`}
      >
        <MaterialCommunityIcons name="map-marker-question-outline" size={18} color={cores.warning} />
        <Text style={styles.semLocalTexto}>
          {dia.semLocal.length} {dia.semLocal.length === 1 ? 'visita de hoje está' : 'visitas de hoje estão'} sem local no mapa
        </Text>
        <Text style={styles.link}>Completar</Text>
      </PressableAnimado>
    );
  }

  return (
    <View style={styles.bloco}>
      {dia.comLocal.length >= 2 ? (
        <DicaContextual
          id="home.mini-mapa"
          texto="Veja seu dia no mapa e deixe a OLLI ordenar o caminho."
          icon="map-marker-path"
          style={styles.dica}
        />
      ) : null}
      <PressableAnimado
        style={styles.card}
        escala={0.98}
        onPress={onAbrirMapa}
        haptic="selection"
        accessibilityLabel={`Mapa do dia: ${resumo ?? ''}. Abrir o mapa`}
      >
        <View pointerEvents="none">
          <MapaBase pins={pins} linha={linha} interativo={false} style={styles.mapa} margens={{ topo: 28, base: 28, lados: 28 }} chaveAnimacao={pins.map((p) => p.id).join(',')} />
        </View>
        <View style={styles.rodape}>
          <View style={{ flex: 1 }}>
            <Text style={styles.resumo} numberOfLines={1}>{resumo}</Text>
            <Text style={styles.nota} numberOfLines={1}>
              {dia.semLocal.length > 0 ? `${dia.semLocal.length} sem local no mapa · ` : ''}{ROTULO_ESTIMATIVA}
            </Text>
          </View>
          <View style={styles.verMapa}>
            <Text style={styles.link}>Ver mapa</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={cores.accentLight} />
          </View>
        </View>
      </PressableAnimado>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    bloco: { marginTop: Spacing.lg, marginHorizontal: Spacing.base },
    dica: { marginBottom: Spacing.sm },
    card: {
      backgroundColor: c.surfaceGlass,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: c.outlineDark,
      overflow: 'hidden',
    },
    mapa: { height: ALTURA_MINI_MAPA },
    rodape: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, minHeight: 56 },
    resumo: { fontSize: 14, fontWeight: '800', color: c.onSurface },
    nota: { fontSize: 11.5, color: c.onSurfaceVariant, marginTop: 2, fontWeight: '600' },
    verMapa: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
    link: { fontSize: 13, fontWeight: '800', color: c.accentLight },
    semLocal: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.lg,
      marginHorizontal: Spacing.base,
      paddingHorizontal: Spacing.md,
      minHeight: 52,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: c.outlineDark,
      backgroundColor: c.surfaceGlass,
    },
    semLocalTexto: { flex: 1, fontSize: 13, color: c.onSurfaceVariant, fontWeight: '600' },
  });
