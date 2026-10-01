import React, { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
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
import { BorderRadius, Spacing, Typography, sombrasDe, useCores, useEstilos, type Cores } from '../../theme';
import { DURACAO, GESTO, MOLA, duracaoAcessivel, useReduzirMovimento } from '../../theme/motion';
import { curvas } from '../motion/curvas';
import { OlliButton } from '../OlliButton';
import { vibrar } from '../../utils/haptico';
import { filaConfirmacao, type PedidoConfirmar } from './filaFeedback';

/**
 * HOST DA FOLHA DE CONFIRMAÇÃO — monta UMA vez na raiz (App.tsx). As telas
 * chamam `await confirmar({ titulo, mensagem, destrutivo })` e recebem `true`
 * só se a pessoa tocou no botão de confirmar; qualquer outra saída (Cancelar,
 * tocar fora, arrastar pra baixo, voltar do Android) é `false`.
 *
 * Folha que sobe de baixo, ao alcance do polegar, com a pegadinha (grabber) no
 * topo: arrastar pra baixo fecha. Ação destrutiva vem em vermelho, com háptico de
 * aviso ao abrir — o mesmo vocabulário da folha de ações do iOS, feita aqui para
 * o Android ter a mesma qualidade (o `Alert` nativo do Android é uma caixa cinza
 * com botões em caixa-alta, e na web ele nem aparece).
 *
 * É um `Modal` de propósito: confirmar pode ser chamado de dentro de outro Modal
 * (lista de backups, menu de ações) e precisa ficar POR CIMA dele — no Android
 * cada Modal é uma janela nova, empilhada; na web é um portal no fim do body.
 * Dentro do Modal do Android os gestos exigem um GestureHandlerRootView próprio.
 * No iOS esta folha NÃO é usada: o UIKit recusa apresentar um Modal irmão por
 * cima de outro já aberto, então `confirmar()` vai direto ao alerta nativo
 * (ver index.ts).
 */
export function ConfirmSheetHost() {
  const pedido = useSyncExternalStore(filaConfirmacao.assinar, filaConfirmacao.atual, filaConfirmacao.atual);
  if (!pedido) return null;
  return <FolhaConfirmacao key={pedido.id} pedido={pedido} />;
}

function FolhaConfirmacao({ pedido }: { pedido: PedidoConfirmar }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const { height: alturaJanela } = useWindowDimensions();
  const reduzir = useReduzirMovimento();

  // y: 0 = folha no lugar; positivo = abaixo (fechando). Começa fora da tela.
  const y = useSharedValue(reduzir ? 0 : alturaJanela);
  const veu = useSharedValue(reduzir ? 1 : 0);
  const alturaFolha = useSharedValue(alturaJanela);
  const respondido = useRef(false);

  const finalizar = useCallback((valor: boolean) => {
    filaConfirmacao.responder(pedido.id, valor);
  }, [pedido.id]);

  /** Fecha animando e só então responde: o `await` da tela volta com a folha já fora. */
  const fechar = useCallback((valor: boolean) => {
    if (respondido.current) return;
    respondido.current = true;
    const duracao = duracaoAcessivel(DURACAO.base, reduzir);
    veu.set(withTiming(0, { duration: duracao, easing: curvas.standard }));
    y.set(withTiming(reduzir ? 0 : alturaFolha.get(), { duration: duracao, easing: curvas.standard }, (terminou) => {
      if (terminou) scheduleOnRN(finalizar, valor);
    }));
    // Rede de segurança: animação interrompida não pode deixar o `await` pendurado.
    setTimeout(() => finalizar(valor), duracao + DURACAO.slow);
  }, [reduzir, veu, y, alturaFolha, finalizar]);

  // Aviso tátil uma vez por folha (o componente monta com key = id).
  useEffect(() => {
    if (pedido.destrutivo) vibrar('aviso');
  }, [pedido.destrutivo]);

  // Entrada. `reduzir` resolve assíncrono (começa false): se virar true depois,
  // a folha vai direto ao lugar, sem deslize.
  useEffect(() => {
    if (respondido.current) return;
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
      // Pra baixo acompanha o dedo; pra cima é borracha (a folha já está no topo dela).
      y.set(e.translationY > 0 ? e.translationY : e.translationY * GESTO.resistencia);
    })
    .onEnd((e) => {
      const passouDoLimiar = e.translationY > alturaFolha.get() * GESTO.fracaoFechar;
      if (passouDoLimiar || e.velocityY > GESTO.velocidadeDispensa) {
        scheduleOnRN(fechar, false);
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
      onRequestClose={() => fechar(false)}
    >
      <GestureHandlerRootView style={styles.raiz}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.veu, estiloVeu]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => fechar(false)}
            accessibilityRole="button"
            accessibilityLabel={pedido.rotuloCancelar}
          />
        </Animated.View>
        <GestureDetector gesture={arrastar}>
          <Animated.View
            onLayout={aoMedir}
            style={[styles.folha, { paddingBottom: insets.bottom + Spacing.lg }, estiloFolha]}
            accessibilityViewIsModal
            onAccessibilityEscape={() => fechar(false)}
          >
            <View style={styles.pegador} accessibilityElementsHidden importantForAccessibility="no" />
            {pedido.destrutivo ? (
              <View style={[styles.icone, { backgroundColor: cores.dangerLight }]}>
                <MaterialCommunityIcons name="alert-outline" size={24} color={cores.danger} />
              </View>
            ) : null}
            <Text style={styles.titulo} accessibilityRole="header">{pedido.titulo}</Text>
            {pedido.mensagem ? <Text style={styles.mensagem}>{pedido.mensagem}</Text> : null}
            <View style={styles.acoes}>
              <OlliButton
                label={pedido.rotuloConfirmar}
                variant={pedido.destrutivo ? 'danger' : 'primary'}
                onPress={() => fechar(true)}
                fullWidth
                // Destrutivo já vibrou o aviso ao abrir; confirmar não vibra de novo.
                haptic={!pedido.destrutivo}
              />
              <OlliButton
                label={pedido.rotuloCancelar}
                variant="ghost"
                onPress={() => fechar(false)}
                fullWidth
                haptic={false}
              />
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    raiz: { flex: 1, justifyContent: 'flex-end' },
    // Véu sempre escuro (mesmo do DialogoDesktopHost/OverlayProgresso): decisão
    // pede contraste forte nos dois modos.
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
      paddingHorizontal: Spacing.xl,
      alignItems: 'center',
      ...sombrasDe(c).lg,
    },
    pegador: {
      width: 40,
      height: 5,
      borderRadius: BorderRadius.fio,
      backgroundColor: c.outline,
      marginBottom: Spacing.lg,
    },
    icone: {
      width: 48,
      height: 48,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    titulo: { ...Typography.h3, color: c.onSurface, textAlign: 'center' },
    mensagem: {
      ...Typography.body,
      color: c.onSurfaceVariant,
      textAlign: 'center',
      marginTop: Spacing.sm,
      lineHeight: 21,
    },
    acoes: { alignSelf: 'stretch', gap: Spacing.sm, marginTop: Spacing.xl },
  });
