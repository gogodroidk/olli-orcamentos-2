import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Spacing, sombrasDe, useCores, useEstilos, type Cores } from '../../theme';
import { DURACAO, GESTO, MOLA, duracaoAcessivel, useReduzirMovimento } from '../../theme/motion';
import { curvas } from '../motion/curvas';
import { vibrar } from '../../utils/haptico';
import { filaToast, textoAnunciado, type PedidoToast } from './filaFeedback';

/**
 * HOST DOS TOASTS — monta UMA vez na raiz do app (App.tsx), acima do navegador
 * de telas, para o aviso sobreviver à troca de tela que costuma vir logo depois
 * de um "Salvo".
 *
 * Substitui o `Alert.alert` cinza do sistema para AVISOS que não pedem decisão
 * ("Backup feito", "Não foi possível salvar"): o alerta nativo trava a tela até
 * alguém tocar "OK" e, na web, o `Alert` do react-native-web é mudo — o aviso
 * simplesmente não aparecia.
 *
 * Comportamento:
 * - entra de CIMA com a mola `gentle` e some sozinho depois do tempo de leitura
 *   (`duracaoDoToast`, que cresce com o texto; dobra com leitor de tela ligado);
 * - arrastar pra cima dispensa; tocar no corpo também;
 * - fila: um por vez, o próximo entra quando o atual sair;
 * - leitor de tela: anuncia "Erro:/Pronto:/Aviso:" + mensagem (cor não se ouve);
 * - "Reduzir movimento": sem deslize, só aparece e some.
 *
 * Limite conhecido: fica ABAIXO de um `Modal` nativo aberto (no Android o Modal
 * é outra janela). Telas que avisam de dentro de um Modal fecham o Modal antes,
 * ou continuam com o alerta nativo.
 */
export function ToastHost() {
  const pedido = useSyncExternalStore(filaToast.assinar, filaToast.atual, filaToast.atual);
  if (!pedido) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* key = id: cada toast monta do zero e faz a própria entrada. */}
      <CartaoToast key={pedido.id} pedido={pedido} />
    </View>
  );
}

const ICONE: Record<PedidoToast['tipo'], keyof typeof MaterialCommunityIcons.glyphMap> = {
  sucesso: 'check-circle',
  erro: 'alert-circle',
  info: 'information',
};

function CartaoToast({ pedido }: { pedido: PedidoToast }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const reduzir = useReduzirMovimento();

  // Deslocamento vertical (0 = no lugar; negativo = acima da tela) e opacidade.
  const y = useSharedValue(0);
  const opacidade = useSharedValue(0);
  // Distância até sair totalmente pelo topo: conhecida só depois do 1º layout.
  const foraDaTela = useSharedValue(0);
  const entrou = useRef(false);
  const saindo = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [leitorDeTela, setLeitorDeTela] = useState(false);

  const cor = pedido.tipo === 'sucesso' ? cores.success : pedido.tipo === 'erro' ? cores.danger : cores.accentLight;

  const remover = useCallback(() => filaToast.dispensar(pedido.id), [pedido.id]);

  const sair = useCallback(() => {
    if (saindo.current) return;
    saindo.current = true;
    if (timer.current) clearTimeout(timer.current);
    const duracao = duracaoAcessivel(DURACAO.base, reduzir);
    opacidade.set(withTiming(0, { duration: duracao, easing: curvas.standard }));
    y.set(withTiming(reduzir ? 0 : -foraDaTela.get(), { duration: duracao, easing: curvas.standard }, (terminou) => {
      if (terminou) scheduleOnRN(remover);
    }));
    // Rede de segurança: se a animação for interrompida (app em segundo plano no
    // meio do caminho), o toast não pode ficar preso na fila travando os próximos.
    setTimeout(remover, duracao + DURACAO.slow);
  }, [reduzir, opacidade, y, foraDaTela, remover]);

  const agendarSaida = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const tempo = leitorDeTela ? pedido.duracaoMs * 2 : pedido.duracaoMs;
    timer.current = setTimeout(sair, tempo);
  }, [leitorDeTela, pedido.duracaoMs, sair]);

  const pausar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Leitor de tela: anuncia e dá o dobro do tempo (quem ouve leva mais que quem lê).
  useEffect(() => {
    let vivo = true;
    try {
      AccessibilityInfo.isScreenReaderEnabled?.()
        .then(v => { if (vivo) setLeitorDeTela(!!v); })
        .catch(() => {});
      AccessibilityInfo.announceForAccessibility?.(textoAnunciado(pedido));
    } catch {
      // Plataforma sem a API (web antiga): o toast continua visível.
    }
    if (pedido.tipo === 'sucesso') vibrar('sucesso');
    else if (pedido.tipo === 'erro') vibrar('erro');
    return () => { vivo = false; };
  }, [pedido]);

  useEffect(() => {
    if (entrou.current && !saindo.current) agendarSaida();
  }, [agendarSaida]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    cancelAnimation(y);
    cancelAnimation(opacidade);
  }, [y, opacidade]);

  const aoMedir = useCallback((e: LayoutChangeEvent) => {
    const distancia = e.nativeEvent.layout.height + insets.top + Spacing.md;
    foraDaTela.set(distancia);
    if (entrou.current) return;
    entrou.current = true;
    if (reduzir) {
      y.set(0);
      opacidade.set(1);
    } else {
      y.set(-distancia);
      y.set(withSpring(0, MOLA.gentle));
      opacidade.set(withTiming(1, { duration: DURACAO.fast, easing: curvas.decelerate }));
    }
    agendarSaida();
  }, [insets.top, reduzir, y, opacidade, foraDaTela, agendarSaida]);

  const arrastar = Gesture.Pan()
    .activeOffsetY([-GESTO.folgaAtivacao, GESTO.folgaAtivacao])
    .onStart(() => {
      scheduleOnRN(pausar);
    })
    .onUpdate((e) => {
      // Pra cima acompanha o dedo; pra baixo é borracha (não há pra onde ir).
      y.set(e.translationY < 0 ? e.translationY : e.translationY * GESTO.resistencia);
    })
    .onEnd((e) => {
      if (e.translationY < -GESTO.limiarDispensa || e.velocityY < -GESTO.velocidadeDispensa) {
        scheduleOnRN(sair);
      } else {
        y.set(withSpring(0, MOLA.snappy));
        scheduleOnRN(agendarSaida);
      }
    });

  const estilo = useAnimatedStyle(() => ({
    opacity: opacidade.get(),
    transform: [{ translateY: y.get() }],
  }));

  const tocarAcao = () => {
    vibrar('leve');
    try { pedido.acao?.aoTocar(); } finally { sair(); }
  };

  return (
    <GestureDetector gesture={arrastar}>
      <Animated.View
        onLayout={aoMedir}
        style={[styles.posicao, { top: insets.top + Spacing.sm }, estilo]}
        accessibilityRole="alert"
      >
        {/* O botão da ação é IRMÃO do corpo, não filho: um Pressable acessível
            vira um elemento único para o VoiceOver e esconde os filhos — o
            "Desfazer" ficaria inalcançável por quem usa leitor de tela. */}
        <View style={[styles.cartao, { borderLeftColor: cor }]}>
          <Pressable
            onPress={sair}
            accessibilityRole="button"
            accessibilityLabel={textoAnunciado(pedido)}
            accessibilityHint="Toque para dispensar"
            style={styles.corpo}
          >
            <MaterialCommunityIcons name={ICONE[pedido.tipo]} size={22} color={cor} />
            <View style={styles.textos}>
              {pedido.titulo ? <Text style={styles.titulo} numberOfLines={2}>{pedido.titulo}</Text> : null}
              <Text style={styles.mensagem} numberOfLines={4}>{pedido.mensagem}</Text>
            </View>
          </Pressable>
          {pedido.acao ? (
            <Pressable
              onPress={tocarAcao}
              accessibilityRole="button"
              accessibilityLabel={pedido.acao.rotulo}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              style={({ pressed }) => [styles.acao, pressed && styles.acaoPressionada]}
            >
              <Text style={[styles.acaoTexto, { color: cores.accentLight }]}>{pedido.acao.rotulo}</Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    posicao: {
      position: 'absolute',
      left: Spacing.base,
      right: Spacing.base,
      alignItems: 'center',
    },
    cartao: {
      width: '100%',
      maxWidth: 520,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.base,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderLeftWidth: 4,
      borderColor: c.outline,
      backgroundColor: c.surfaceElevated,
      ...sombrasDe(c).lg,
    },
    corpo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    textos: { flex: 1 },
    titulo: { fontSize: 15, fontWeight: '800', color: c.onSurface, marginBottom: 2 },
    mensagem: { fontSize: 14, lineHeight: 20, color: c.onSurface },
    acao: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: BorderRadius.md },
    acaoPressionada: { backgroundColor: c.surfacePressed },
    acaoTexto: { fontSize: 14, fontWeight: '800' },
  });
