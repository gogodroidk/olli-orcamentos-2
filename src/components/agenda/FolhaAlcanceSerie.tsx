import React, { useCallback, useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Spacing, Typography, sombrasDe, useCores, useEstilos, type Cores } from '../../theme';
import { DURACAO, MOLA, duracaoAcessivel, useReduzirMovimento } from '../../theme/motion';
import { curvas } from '../motion/curvas';
import { PressableAnimado } from '../motion';
import { vibrar } from '../../utils/haptico';
import type { AlcanceEdicaoRecorrente } from '../../utils/contratoRecorrente';

const ICONE: Record<AlcanceEdicaoRecorrente, keyof typeof MaterialCommunityIcons.glyphMap> = {
  so_esta: 'calendar-today',
  esta_e_proximas: 'calendar-arrow-right',
  toda_serie: 'calendar-sync-outline',
};

const ROTULO_PADRAO: Record<AlcanceEdicaoRecorrente, { titulo: string; detalhe: string }> = {
  so_esta: { titulo: 'Só esta visita', detalhe: 'As outras repetições ficam como estão.' },
  esta_e_proximas: { titulo: 'Esta e as próximas', detalhe: 'As visitas anteriores não mudam.' },
  toda_serie: { titulo: 'Toda a série', detalhe: 'Muda todas as repetições, inclusive as passadas.' },
};

export interface PedidoAlcance {
  titulo: string;
  mensagem?: string;
  opcoes: AlcanceEdicaoRecorrente[];
  /** Ação que apaga (excluir/cancelar): opções em vermelho e háptico de aviso. */
  destrutivo?: boolean;
  /** Troca o texto de alguma opção (ex.: "Excluir só esta"). */
  rotulos?: Partial<Record<AlcanceEdicaoRecorrente, { titulo: string; detalhe: string }>>;
}

interface Props {
  pedido: PedidoAlcance | null;
  /** `null` = cancelou (tocou fora, Cancelar, voltar). */
  onResposta: (alcance: AlcanceEdicaoRecorrente | null) => void;
  /**
   * `true` desenha por cima do conteúdo atual (sem Modal): usado DENTRO do
   * formulário, que já é um Modal — no iOS um Modal não abre por cima de outro.
   */
  embutida?: boolean;
}

/**
 * FOLHA "QUAL ALCANCE?" — editar, remarcar ou excluir uma visita de série
 * pergunta se vale só para ela, para ela e as próximas, ou para a série toda.
 * Três caminhos + cancelar: o Alert do Android só tem 3 botões, e a folha de
 * confirmação do app é sim/não — por isso esta folha própria, no mesmo desenho.
 */
export function FolhaAlcanceSerie({ pedido, onResposta, embutida }: Props) {
  if (!pedido) return null;
  const chave = `${pedido.titulo}:${pedido.opcoes.join(",")}`;
  if (embutida) return <Folha key={chave} pedido={pedido} onResposta={onResposta} />;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => onResposta(null)}>
      <Folha key={chave} pedido={pedido} onResposta={onResposta} />
    </Modal>
  );
}

/**
 * `const { pedido, perguntar, responder } = usePerguntaAlcance()` —
 * `await perguntar({...})` abre a folha e resolve com o alcance (ou null).
 * Uma pergunta nova com outra aberta fecha a anterior como "cancelou".
 */
export function usePerguntaAlcance() {
  const [pedido, setPedido] = React.useState<PedidoAlcance | null>(null);
  const resolver = useRef<((a: AlcanceEdicaoRecorrente | null) => void) | null>(null);
  const responder = useCallback((a: AlcanceEdicaoRecorrente | null) => {
    const r = resolver.current;
    resolver.current = null;
    setPedido(null);
    r?.(a);
  }, []);
  const perguntar = useCallback((p: PedidoAlcance) => new Promise<AlcanceEdicaoRecorrente | null>((resolve) => {
    resolver.current?.(null);
    resolver.current = resolve;
    setPedido(p);
  }), []);
  // Tela desmontou com pergunta aberta: fecha como "cancelou" (nunca pendura o await).
  useEffect(() => () => { resolver.current?.(null); resolver.current = null; }, []);
  return { pedido, perguntar, responder };
}

function Folha({ pedido, onResposta }: { pedido: PedidoAlcance; onResposta: Props['onResposta'] }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const reduzir = useReduzirMovimento();
  const { height } = useWindowDimensions();
  const y = useSharedValue(reduzir ? 0 : height);
  const veu = useSharedValue(reduzir ? 1 : 0);
  const respondido = useRef(false);

  useEffect(() => {
    if (pedido.destrutivo) vibrar('aviso');
  }, [pedido.destrutivo]);

  useEffect(() => {
    if (reduzir) {
      y.set(0);
      veu.set(1);
    } else {
      veu.set(withTiming(1, { duration: DURACAO.base, easing: curvas.decelerate }));
      y.set(withSpring(0, MOLA.gentle));
    }
    return () => {
      cancelAnimation(y);
      cancelAnimation(veu);
    };
  }, [reduzir, y, veu]);

  // A resposta chega UMA vez só (fim da animação OU a rede de segurança abaixo).
  const entregue = useRef(false);
  const entregar = useCallback((alcance: AlcanceEdicaoRecorrente | null) => {
    if (entregue.current) return;
    entregue.current = true;
    onResposta(alcance);
  }, [onResposta]);

  const responder = useCallback((alcance: AlcanceEdicaoRecorrente | null) => {
    if (respondido.current) return;
    respondido.current = true;
    const duracao = duracaoAcessivel(DURACAO.fast, reduzir);
    veu.set(withTiming(0, { duration: duracao, easing: curvas.standard }));
    y.set(withTiming(reduzir ? 0 : height, { duration: duracao, easing: curvas.standard }, (fim) => {
      if (fim) scheduleOnRN(entregar, alcance);
    }));
    // Rede de segurança: animação interrompida não deixa a escolha pendurada.
    setTimeout(() => entregar(alcance), duracao + DURACAO.slow);
  }, [reduzir, veu, y, height, entregar]);

  const estiloVeu = useAnimatedStyle(() => ({ opacity: veu.get() }));
  const estiloFolha = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const corAcao = pedido.destrutivo ? cores.danger : cores.accentLight;

  return (
    <View style={[StyleSheet.absoluteFill, styles.raiz]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.veu, estiloVeu]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => responder(null)} accessibilityRole="button" accessibilityLabel="Cancelar" />
      </Animated.View>
      <Animated.View style={[styles.folha, { paddingBottom: insets.bottom + Spacing.lg }, estiloFolha]} accessibilityViewIsModal>
        <View style={styles.pegador} />
        <Text style={styles.titulo} accessibilityRole="header">{pedido.titulo}</Text>
        {pedido.mensagem ? <Text style={styles.mensagem}>{pedido.mensagem}</Text> : null}
        <View style={styles.opcoes}>
          {pedido.opcoes.map((op) => {
            const r = pedido.rotulos?.[op] ?? ROTULO_PADRAO[op];
            return (
              <PressableAnimado
                key={op}
                style={styles.opcao}
                onPress={() => { if (!pedido.destrutivo) vibrar('leve'); responder(op); }}
                accessibilityLabel={`${r.titulo}. ${r.detalhe}`}
                escala={0.98}
              >
                <View style={[styles.opcaoIcone, { backgroundColor: corAcao + '1F' }]}>
                  <MaterialCommunityIcons name={ICONE[op]} size={20} color={corAcao} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.opcaoTitulo, pedido.destrutivo && { color: cores.danger }]}>{r.titulo}</Text>
                  <Text style={styles.opcaoDetalhe}>{r.detalhe}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
              </PressableAnimado>
            );
          })}
        </View>
        <PressableAnimado style={styles.cancelar} onPress={() => responder(null)} accessibilityLabel="Cancelar">
          <Text style={styles.cancelarTexto}>Cancelar</Text>
        </PressableAnimado>
      </Animated.View>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  raiz: { justifyContent: 'flex-end', zIndex: 50, elevation: 50 },
  veu: { backgroundColor: 'rgba(7,17,31,0.62)' },
  folha: {
    alignSelf: 'center', width: '100%', maxWidth: 560,
    backgroundColor: c.surface,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1, borderBottomWidth: 0, borderColor: c.strokeGlow,
    paddingTop: Spacing.sm, paddingHorizontal: Spacing.lg,
    ...sombrasDe(c).lg,
  },
  pegador: { alignSelf: 'center', width: 40, height: 5, borderRadius: BorderRadius.fio, backgroundColor: c.outline, marginBottom: Spacing.lg },
  titulo: { ...Typography.h3, color: c.onSurface, textAlign: 'center' },
  mensagem: { ...Typography.body, color: c.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 21 },
  opcoes: { gap: Spacing.sm, marginTop: Spacing.lg },
  opcao: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline,
    paddingHorizontal: 14, paddingVertical: 12, minHeight: 60,
  },
  opcaoIcone: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  opcaoTitulo: { ...Typography.h4, color: c.onSurface },
  opcaoDetalhe: { ...Typography.caption, color: c.onSurfaceVariant, marginTop: 2 },
  cancelar: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: Spacing.sm },
  cancelarTexto: { ...Typography.button, color: c.onSurfaceVariant },
});
