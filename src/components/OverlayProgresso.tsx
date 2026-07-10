import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform, ActivityIndicator } from 'react-native';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { Motion } from '../theme/motion';
import { OlliMascot } from './OlliMascot';

interface Props {
  /** Controla a exibição do overlay — some com fade quando vira false. */
  visible: boolean;
  /** Título principal (ex.: "Gerando seu orçamento..."). */
  titulo?: string;
  /** Subtítulo de apoio (ex.: "Deixando bonito para o cliente..."). */
  subtitulo?: string;
}

const useNativeAnimations = Platform.OS !== 'web';

/**
 * Mensagens divertidas que entram em rodízio quando a operação passa de ~4s
 * — o usuário nunca fica olhando pra um texto parado achando que travou.
 */
const MENSAGENS_DEMORA: Array<{ titulo: string; subtitulo: string }> = [
  { titulo: 'Ainda trabalhando nisso...', subtitulo: 'Capricho leva um segundinho a mais.' },
  { titulo: 'Quase lá...', subtitulo: 'Ajustando os últimos detalhes para o cliente.' },
  { titulo: 'Deixando tudo bonito...', subtitulo: 'Um orçamento capricho impressiona mais.' },
  { titulo: 'Só mais um instante...', subtitulo: 'Isso aqui vale a pena esperar.' },
];

const TROCA_MENSAGEM_MS = 4000;

/**
 * Overlay modal escuro de progresso — usado em TODO fluxo de gerar/exportar/
 * compartilhar PDF ou link (a operação mais "silenciosa" do app, onde o
 * usuário fica olhando pra tela sem feedback nenhum por alguns segundos).
 *
 * Mostra a OLLI respirando (OlliMascot) + spinner + título/subtítulo, com
 * fade suave na entrada/saída. Se a operação demorar mais de 4s, o texto
 * entra em rodízio com mensagens variadas — evita a sensação de app travado.
 */
export function OverlayProgresso({
  visible,
  titulo = 'Gerando seu orçamento...',
  subtitulo = 'Deixando bonito para o cliente...',
}: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const opacity = useRef(new Animated.Value(0)).current;
  const [montado, setMontado] = useState(visible);
  const [msgIndex, setMsgIndex] = useState(-1); // -1 = título/subtítulo originais ainda valem

  useEffect(() => {
    if (visible) {
      setMontado(true);
      setMsgIndex(-1);
      Animated.timing(opacity, {
        toValue: 1,
        duration: Motion.dur.base,
        easing: Motion.easing.standard,
        useNativeDriver: useNativeAnimations,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: Motion.dur.fast,
        easing: Motion.easing.standard,
        useNativeDriver: useNativeAnimations,
      }).start(({ finished }) => {
        if (finished) setMontado(false);
      });
    }
  }, [visible]);

  // Rodízio de mensagens divertidas após ~4s de espera — só roda enquanto
  // visível, e para completamente ao fechar (cleanup rigoroso do timer).
  useEffect(() => {
    if (!visible) return;
    let cancelado = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function agendarProxima(atual: number) {
      const t = setTimeout(() => {
        if (cancelado) return;
        setMsgIndex(i => (i + 1) % MENSAGENS_DEMORA.length);
        agendarProxima(atual + 1);
      }, TROCA_MENSAGEM_MS);
      timers.push(t);
    }
    agendarProxima(0);

    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
    };
  }, [visible]);

  if (!montado) return null;

  const textoAtual = msgIndex >= 0 ? MENSAGENS_DEMORA[msgIndex % MENSAGENS_DEMORA.length] : { titulo, subtitulo };

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.backdrop, { opacity }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View style={styles.card}>
        <View style={styles.mascotWrap}>
          <OlliMascot size={56} float pulse />
        </View>
        <ActivityIndicator size="small" color={cores.accentLight} style={styles.spinner} />
        <Text style={styles.titulo} numberOfLines={2}>{textoAtual.titulo}</Text>
        {textoAtual.subtitulo ? (
          <Text style={styles.subtitulo} numberOfLines={2}>{textoAtual.subtitulo}</Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    backdrop: {
      // Véu do modal sempre escuro (ink fixa), não a superfície do tema: é
      // um scrim de contraste atrás do cartão, igual ao véu do GatePro.
      backgroundColor: 'rgba(7,17,31,0.86)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      elevation: 1000,
    },
    card: {
      width: '80%',
      maxWidth: 320,
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: c.strokeGlow,
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.lg,
      ...sombrasDe(c).lg,
    },
    mascotWrap: { marginBottom: Spacing.sm },
    spinner: { marginBottom: Spacing.md },
    titulo: { fontSize: 16, fontWeight: '800', color: c.onSurface, textAlign: 'center' },
    subtitulo: { fontSize: 13, color: c.onSurfaceVariant, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  });
