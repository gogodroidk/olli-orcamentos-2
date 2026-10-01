import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { BorderRadius, Spacing, Typography, corStatusOrcamento, sombrasDe, useCores, useEstilos, type Cores } from '../../theme';
import { DURACAO, MOLA, useReduzirMovimento } from '../../theme/motion';
import { STATUS_COLORS, STATUS_LABELS, type StatusOrcamento } from '../../types';
import { ContadorAnimado } from '../motion/ContadorAnimado';
import { PressableAnimado } from '../motion/PressableAnimado';
import { curvas } from '../motion/curvas';

interface Props {
  status: StatusOrcamento;
  /** Linha de baixo do título (data de criação já formatada). */
  quando: string;
  /** Total a exibir; `null` = quem vê não pode ver valores (não mostra nada). */
  total: number | null;
  proximoPasso: string;
  aoTocarStatus: () => void;
  /** O título ("Orçamento nº …") vem da tela, já formatado. */
  children: ReactNode;
}

/**
 * Cabeçalho do detalhe (item 2.10): status em destaque, número, total e a frase
 * "em que pé está". O chip de status é o botão que troca o status (abre a folha).
 *
 * Quando o status MUDA com a tela aberta (marcou aprovado, o cliente respondeu
 * pelo link), o chip troca com um "assentar" de mola `bouncy` — uma vez, só
 * `transform`/`opacity`. Na primeira montagem não anima: abrir a tela não é
 * mudança de status. O total conta até o novo valor (ContadorAnimado).
 */
export function CabecalhoStatus({ status, quando, total, proximoPasso, aoTocarStatus, children }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const corBase = STATUS_COLORS[status];
  const corTexto = corStatusOrcamento(corBase, cores.surface);

  const escala = useSharedValue(1);
  const opacidade = useSharedValue(1);
  const anterior = useRef(status);
  useEffect(() => {
    if (anterior.current === status) return;
    anterior.current = status;
    if (reduzir) return;
    escala.set(0.82);
    opacidade.set(0.35);
    escala.set(withSpring(1, MOLA.bouncy));
    opacidade.set(withTiming(1, { duration: DURACAO.fast, easing: curvas.standard }));
    return () => {
      cancelAnimation(escala);
      cancelAnimation(opacidade);
    };
  }, [status, reduzir, escala, opacidade]);
  const estiloChip = useAnimatedStyle(() => ({
    opacity: opacidade.get(),
    transform: [{ scale: escala.get() }],
  }));

  return (
    <View style={styles.card}>
      <View style={styles.topo}>
        <PressableAnimado
          onPress={aoTocarStatus}
          haptic="selection"
          accessibilityLabel={`Status: ${STATUS_LABELS[status]}. Toque para alterar`}
          hitSlop={6}
        >
          <Animated.View style={[styles.chip, { backgroundColor: `${corBase}22`, borderColor: `${corBase}55` }, estiloChip]}>
            <View style={[styles.ponto, { backgroundColor: corBase }]} />
            <Text style={[styles.chipTexto, { color: corTexto }]}>{STATUS_LABELS[status]}</Text>
            <MaterialCommunityIcons name="chevron-down" size={16} color={corTexto} />
          </Animated.View>
        </PressableAnimado>
        <Text style={styles.quando}>{quando}</Text>
      </View>

      <Text style={styles.titulo} numberOfLines={1}>{children}</Text>

      {total !== null ? (
        <View style={styles.totalLinha}>
          <Text style={styles.totalRotulo}>Total</Text>
          <ContadorAnimado valor={total} formato="brl" style={styles.totalValor} />
        </View>
      ) : null}

      {proximoPasso ? <Text style={styles.proximo}>{proximoPasso}</Text> : null}
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: c.outline,
      padding: Spacing.base,
      marginBottom: 12,
      ...sombrasDe(c).sm,
    },
    topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 10,
      paddingRight: 8,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      minHeight: 32,
    },
    ponto: { width: 8, height: 8, borderRadius: 4 },
    chipTexto: { fontSize: 13, fontWeight: '800' },
    quando: { fontSize: 12, color: c.onSurfaceVariant, flexShrink: 1, textAlign: 'right' },
    titulo: { fontSize: 20, fontWeight: '800', color: c.onSurface, marginTop: 12 },
    totalLinha: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 },
    totalRotulo: { fontSize: 13, color: c.onSurfaceVariant, fontWeight: '600' },
    totalValor: { ...Typography.valueLarge, color: c.accentLight },
    proximo: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 8, lineHeight: 18 },
  });
