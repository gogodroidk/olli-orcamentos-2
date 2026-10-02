import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Spacing, Typography, comAlfa, sombrasDe, textoSobre, useCores, useEstilos, type Cores } from '../../theme';
import { DURACAO, GESTO, MOLA, TOQUE, duracaoAcessivel, useReduzirMovimento } from '../../theme/motion';
import { curvas } from '../motion/curvas';
import { PressableAnimado } from '../motion/PressableAnimado';

type IconeMCI = keyof typeof MaterialCommunityIcons.glyphMap;

/** O item pede à folha: "feche e, com ela já fora da tela, rode isto". */
const ContextoFolha = createContext<(acao: () => void) => void>((acao) => acao());

interface PropsFolha {
  visivel: boolean;
  titulo: string;
  subtitulo?: string;
  /** Chamado quando a folha terminou de sair (por item, toque fora, arrasto ou voltar). */
  aoFechar: () => void;
  children: ReactNode;
}

/**
 * FOLHA DE AÇÕES do detalhe do orçamento ("Compartilhar", "⋯", "Status").
 *
 * Mesma gramática da folha de confirmação (ConfirmSheet): sobe de baixo com a
 * mola `gentle`, véu escuro, pegador no topo, arrastar pra baixo fecha. Só
 * `transform`/`opacity`, na UI thread; com "Reduzir movimento" aparece e some
 * sem deslize.
 *
 * Tocar num item FECHA a folha primeiro e só então roda a ação: várias ações
 * abrem outro Modal (QR do Pix, registrar pagamento, assinatura). No iOS, um
 * Modal pedido enquanto outro ainda está saindo simplesmente não aparece.
 */
export function FolhaAcoes({ visivel, ...resto }: PropsFolha) {
  if (!visivel) return null;
  return <Folha {...resto} />;
}

function Folha({ titulo, subtitulo, aoFechar, children }: Omit<PropsFolha, 'visivel'>) {
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const { height: alturaJanela } = useWindowDimensions();
  const reduzir = useReduzirMovimento();

  const y = useSharedValue(reduzir ? 0 : alturaJanela);
  const veu = useSharedValue(reduzir ? 1 : 0);
  const alturaFolha = useSharedValue(alturaJanela);
  const fechando = useRef(false);
  const acaoPendente = useRef<(() => void) | null>(null);
  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;

  const concluido = useRef(false);
  /** Roda uma vez só: chamado pela animação E pela rede de segurança. */
  const concluir = useCallback(() => {
    if (concluido.current) return;
    concluido.current = true;
    const acao = acaoPendente.current;
    acaoPendente.current = null;
    aoFecharRef.current();
    // A ação roda com a folha já desmontada (ver o porquê no topo).
    if (acao) setTimeout(acao, DURACAO.instant);
  }, []);

  const fechar = useCallback((acao?: () => void) => {
    if (fechando.current) return;
    fechando.current = true;
    acaoPendente.current = acao ?? null;
    const duracao = duracaoAcessivel(DURACAO.fast, reduzir);
    veu.set(withTiming(0, { duration: duracao, easing: curvas.standard }));
    y.set(withTiming(reduzir ? 0 : alturaFolha.get(), { duration: duracao, easing: curvas.standard }, (fim) => {
      if (fim) scheduleOnRN(concluir);
    }));
    // Rede de segurança: animação interrompida não pode deixar a folha presa.
    setTimeout(concluir, duracao + DURACAO.slow);
  }, [reduzir, veu, y, alturaFolha, concluir]);

  useEffect(() => {
    if (fechando.current) return;
    if (reduzir) {
      cancelAnimation(y);
      cancelAnimation(veu);
      y.set(0);
      veu.set(1);
    } else {
      veu.set(withTiming(1, { duration: DURACAO.base, easing: curvas.decelerate }));
      y.set(withSpring(0, MOLA.gentle));
    }
  }, [reduzir, y, veu]);

  useEffect(() => () => {
    cancelAnimation(y);
    cancelAnimation(veu);
  }, [y, veu]);

  const aoMedir = useCallback((e: LayoutChangeEvent) => {
    alturaFolha.set(e.nativeEvent.layout.height + insets.bottom);
  }, [alturaFolha, insets.bottom]);

  const arrastar = Gesture.Pan()
    .activeOffsetY([-GESTO.folgaAtivacao, GESTO.folgaAtivacao])
    .onUpdate((e) => {
      y.set(e.translationY > 0 ? e.translationY : e.translationY * GESTO.resistencia);
    })
    .onEnd((e) => {
      const passou = e.translationY > alturaFolha.get() * GESTO.fracaoFechar;
      if (passou || e.velocityY > GESTO.velocidadeDispensa) {
        scheduleOnRN(fechar);
      } else {
        y.set(withSpring(0, MOLA.snappy));
      }
    });

  const estiloVeu = useAnimatedStyle(() => ({ opacity: veu.get() }));
  const estiloFolha = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => fechar()}
    >
      <GestureHandlerRootView style={styles.raiz}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.veu, estiloVeu]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => fechar()}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
          />
        </Animated.View>
        <Animated.View
          onLayout={aoMedir}
          style={[styles.folha, { paddingBottom: insets.bottom + Spacing.base, maxHeight: alturaJanela * 0.86 }, estiloFolha]}
          accessibilityViewIsModal
          onAccessibilityEscape={() => fechar()}
        >
          <GestureDetector gesture={arrastar}>
            <View style={styles.topo}>
              <View style={styles.pegador} accessibilityElementsHidden importantForAccessibility="no" />
              <Text style={styles.titulo} accessibilityRole="header">{titulo}</Text>
              {subtitulo ? <Text style={styles.subtitulo}>{subtitulo}</Text> : null}
            </View>
          </GestureDetector>
          <ScrollView bounces={false} contentContainerStyle={styles.lista}>
            <ContextoFolha.Provider value={fechar}>{children}</ContextoFolha.Provider>
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

interface PropsItem {
  icon: IconeMCI;
  label: string;
  descricao?: string;
  onPress: () => void;
  /** Ação principal da folha: ícone cheio na cor de destaque. */
  destaque?: boolean;
  /** Bolinha de cor no lugar do ícone (folha de status). */
  corPonto?: string;
  /** Item já escolhido (folha de status): check à direita. */
  selecionado?: boolean;
  disabled?: boolean;
}

/** Linha da folha: ícone, rótulo e uma frase do que acontece ao tocar. */
export function ItemFolha({ icon, label, descricao, onPress, destaque, corPonto, selecionado, disabled }: PropsItem) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const fecharEntao = useContext(ContextoFolha);
  return (
    <PressableAnimado
      onPress={() => fecharEntao(onPress)}
      haptic="selection"
      disabled={disabled}
      escala={TOQUE.escalaCard}
      style={[styles.item, selecionado && styles.itemSelecionado]}
      accessibilityLabel={descricao ? `${label}. ${descricao}` : label}
      accessibilityState={selecionado ? { selected: true } : undefined}
    >
      {corPonto ? (
        <View style={styles.pontoCaixa}>
          <View style={[styles.ponto, { backgroundColor: corPonto }]} />
        </View>
      ) : (
        <View style={[styles.icone, destaque && { backgroundColor: cores.accentLight }]}>
          <MaterialCommunityIcons name={icon} size={20} color={destaque ? textoSobre(cores.accentLight) : cores.accentLight} />
        </View>
      )}
      <View style={styles.itemTextos}>
        <Text style={styles.itemRotulo}>{label}</Text>
        {descricao ? <Text style={styles.itemDescricao}>{descricao}</Text> : null}
      </View>
      {selecionado ? <MaterialCommunityIcons name="check" size={20} color={cores.accentLight} /> : null}
    </PressableAnimado>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    raiz: { flex: 1, justifyContent: 'flex-end' },
    veu: { backgroundColor: 'rgba(7,17,31,0.62)' },
    folha: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: 560,
      backgroundColor: c.surface,
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: c.strokeGlow,
      paddingTop: Spacing.sm,
      ...sombrasDe(c).lg,
    },
    topo: { alignItems: 'center', paddingHorizontal: Spacing.xl, paddingBottom: Spacing.sm },
    pegador: {
      width: 40,
      height: 5,
      borderRadius: BorderRadius.fio,
      backgroundColor: c.outline,
      marginBottom: Spacing.md,
    },
    titulo: { ...Typography.h3, color: c.onSurface, textAlign: 'center' },
    subtitulo: { ...Typography.body, color: c.onSurfaceVariant, textAlign: 'center', marginTop: 4 },
    lista: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, gap: 6 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 56,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      backgroundColor: c.surfacePressed,
    },
    itemSelecionado: { backgroundColor: comAlfa(c.accentLight, 0.12) },
    icone: {
      width: 38,
      height: 38,
      borderRadius: BorderRadius.chip,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: comAlfa(c.accentLight, 0.12),
    },
    pontoCaixa: { width: 38, alignItems: 'center' },
    ponto: { width: 12, height: 12, borderRadius: 6 },
    itemTextos: { flex: 1 },
    itemRotulo: { fontSize: 15, fontWeight: '700', color: c.onSurface },
    itemDescricao: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
  });
