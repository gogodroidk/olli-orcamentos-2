import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { BorderRadius, Spacing, Typography, corStatusOrcamento, sombrasDe, useCores, useEstilos, type Cores } from '../../theme';
import { DISTANCIA, DURACAO, MOLA, useReduzirMovimento } from '../../theme/motion';
import { formatCurrency } from '../../utils/currency';
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

/**
 * O CABEÇALHO QUE ENCOLHE (item 2.10): quando o card do cabeçalho sai da tela
 * na rolagem, esta faixa fina (status + total) aparece colada no topo, para o
 * prestador nunca perder de vista em que pé o orçamento está.
 *
 * Ligada à rolagem na UI thread (`rolagem`, de `useAnimatedScrollHandler`): só
 * `opacity` e `translateY`, com a distância do token `DISTANCIA.sutil`. Com
 * "Reduzir movimento" ela só aparece/some, sem deslizar nem esmaecer aos poucos.
 *
 * É informativa (sem toque): a troca de status continua no chip do card e no ⋯.
 * Escondida do leitor de tela — repete o que o card já anuncia.
 */
export function BarraStatusCompacta({ status, total, rolagem, limiar }: {
  status: StatusOrcamento;
  /** `null` = quem vê não pode ver valores. */
  total: number | null;
  /** Deslocamento vertical da rolagem (dp). */
  rolagem: SharedValue<number>;
  /** A partir de quanto rolado o card do cabeçalho já saiu da tela (dp). */
  limiar: SharedValue<number>;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const corBase = STATUS_COLORS[status];
  const corTexto = corStatusOrcamento(corBase, cores.surface);

  const estilo = useAnimatedStyle(() => {
    const fim = limiar.get();
    const y = rolagem.get();
    // Antes de medir o card (limiar 0), a faixa fica escondida.
    if (fim <= 0) return { opacity: 0, transform: [{ translateY: -DISTANCIA.sutil }] };
    if (reduzir) return { opacity: y >= fim ? 1 : 0, transform: [{ translateY: 0 }] };
    const inicio = fim - DISTANCIA.deslize;
    return {
      opacity: interpolate(y, [inicio, fim], [0, 1], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(y, [inicio, fim], [-DISTANCIA.sutil, 0], Extrapolation.CLAMP) }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.barra, estilo]}
    >
      <View style={[styles.ponto, { backgroundColor: corBase }]} />
      <Text style={[styles.barraStatus, { color: corTexto }]} numberOfLines={1}>{STATUS_LABELS[status]}</Text>
      {total !== null ? <Text style={styles.barraTotal} numberOfLines={1}>{formatCurrency(total)}</Text> : null}
    </Animated.View>
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
    barra: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.outline,
      ...sombrasDe(c).sm,
    },
    barraStatus: { flex: 1, fontSize: 13, fontWeight: '800' },
    barraTotal: { fontSize: 14, fontWeight: '800', color: c.accentLight },
  });
