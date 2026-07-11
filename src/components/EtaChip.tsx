import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, comAlfa, useCores, useEstilos, type Cores } from '../theme';
import { Motion, useReducedMotion } from '../theme/motion';
import { OlliPressable } from './OlliPressable';
import { OlliSkeleton } from './OlliSkeleton';
import type { ResultadoEta } from '../services/eta';

export interface EtaChipProps {
  /** Resultado de `getEta()`. `null` enquanto a busca está em andamento (shimmer). */
  resultado: ResultadoEta | null;
  /** Hora do compromisso (opcional) — usada para colorir o chip pela folga até lá. */
  horario?: Date;
  /** Toque no chip "sem localização" — o chamador deve tentar `getEta` de novo. */
  onTentarNovamente?: () => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatarHora(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

type Tom = 'neutro' | 'sucesso' | 'aviso' | 'perigo' | 'mudo';

/**
 * Folga = horário do compromisso menos a chegada estimada.
 * > 15 min de sobra → verde; 0–15 → âmbar; negativa (vai chegar depois) → vermelho.
 * Sem `horario` para comparar, o chip fica neutro (só informa o tempo de viagem).
 */
function tomDaFolga(chegada: Date, horario?: Date): Tom {
  if (!horario || isNaN(horario.getTime())) return 'neutro';
  const folgaMin = (horario.getTime() - chegada.getTime()) / 60000;
  if (folgaMin < 0) return 'perigo';
  if (folgaMin <= 15) return 'aviso';
  return 'sucesso';
}

function coresDoTom(tom: Tom, cores: Cores): { bg: string; fg: string; borda: string } {
  switch (tom) {
    case 'sucesso':
      return { bg: cores.successLight, fg: cores.success, borda: comAlfa(cores.success, 0.4) };
    case 'aviso':
      return { bg: cores.warningLight, fg: cores.warning, borda: comAlfa(cores.warning, 0.4) };
    case 'perigo':
      return { bg: cores.dangerLight, fg: cores.danger, borda: comAlfa(cores.danger, 0.4) };
    case 'mudo':
      return { bg: cores.surfaceVariant, fg: cores.onSurfaceMuted, borda: cores.outline };
    default:
      return { bg: cores.accentContainer, fg: cores.accentLight, borda: comAlfa(cores.accentLight, 0.35) };
  }
}

/**
 * Chip presentacional do ETA com trânsito — mostra o tempo até a próxima
 * parada, colorido pela folga contra o horário do compromisso (quando dado).
 * Sem estado próprio de busca: quem chama controla `resultado` (`null` =
 * carregando) via `getEta()` — este componente só decide COMO mostrar.
 *
 * Motion: só opacity (fade-in ao trocar de estado), respeitando
 * `useReducedMotion` — sem movimento nenhum quando o usuário pediu menos
 * animação no sistema.
 */
export function EtaChip({ resultado, horario, onTentarNovamente }: EtaChipProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzirMovimento = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduzirMovimento ? 1 : 0)).current;
  const chaveEstado = resultado?.estado ?? 'carregando';

  useEffect(() => {
    if (reduzirMovimento) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: Motion.dur.base,
      easing: Motion.easing.standard,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveEstado, reduzirMovimento]);

  // carregando (getEta ainda não resolveu) — shimmer curto, formato do chip real.
  if (!resultado) {
    return <OlliSkeleton width={172} height={26} radius={BorderRadius.full} style={styles.skeleton} />;
  }

  if (resultado.estado === 'sem_localizacao') {
    const tom = coresDoTom('mudo', cores);
    return (
      <Animated.View style={{ opacity }}>
        <OlliPressable
          style={[styles.chip, { backgroundColor: tom.bg, borderColor: tom.borda }]}
          onPress={onTentarNovamente}
          haptic="selection"
          accessibilityLabel="Ativar localização para ver o tempo até o destino"
        >
          <MaterialCommunityIcons name="map-marker-off-outline" size={14} color={tom.fg} />
          <Text style={[styles.texto, { color: tom.fg }]} numberOfLines={1}>
            Ative a localização pra ver o tempo até o destino
          </Text>
        </OlliPressable>
      </Animated.View>
    );
  }

  if (resultado.estado === 'indisponivel') {
    const tom = coresDoTom('mudo', cores);
    return (
      <Animated.View style={{ opacity }}>
        <View style={[styles.chip, { backgroundColor: tom.bg, borderColor: tom.borda }]}>
          <MaterialCommunityIcons name="clock-outline" size={14} color={tom.fg} />
          <Text style={[styles.texto, { color: tom.fg }]} numberOfLines={1}>Tempo indisponível agora</Text>
        </View>
      </Animated.View>
    );
  }

  // estado === 'ok'
  const tom = coresDoTom(tomDaFolga(resultado.chegada, horario), cores);
  return (
    <Animated.View style={{ opacity }}>
      <View style={[styles.chip, { backgroundColor: tom.bg, borderColor: tom.borda }]}>
        <MaterialCommunityIcons name="car-clock" size={14} color={tom.fg} />
        <Text style={[styles.texto, { color: tom.fg }]} numberOfLines={1}>
          Saindo agora: {resultado.minutos} min · chega {formatarHora(resultado.chegada)}
        </Text>
      </View>
    </Animated.View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  texto: { fontSize: 11.5, fontWeight: '700' },
  skeleton: { alignSelf: 'flex-start' },
});
