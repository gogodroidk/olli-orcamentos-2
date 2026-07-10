import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../theme';
import { AnimatedEntrance } from './AnimatedEntrance';
import { OlliPressable } from './OlliPressable';
import { estaAtiva, dicaFoiVista, marcarDicaVista } from '../services/onboarding';

interface Props {
  /** Id ÚNICO e estável da dica (ex.: "home.botao-orcar"). Usado pra nunca mostrar 2x. */
  id: string;
  /** Texto curto explicando o elemento a que a dica se refere. */
  texto: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  style?: ViewStyle;
}

/**
 * DicaContextual — balão curto explicando UM elemento da tela, uma única vez
 * por aparelho. Respeita o toggle "Mostrar dicas e ajuda" (services/onboarding
 * → estaAtiva) e some para sempre assim que o usuário toca em "Entendi".
 *
 * NÃO INVASIVA de propósito: renderiza INLINE (fluxo normal do layout), logo
 * abaixo/perto do elemento que ela explica — nunca como overlay absoluto que
 * poderia tampar outro botão ou travar o toque em algo embaixo. Enquanto a
 * checagem assíncrona (ajuda ligada? dica já vista?) não responde, ou quando a
 * dica não deve aparecer, o componente não ocupa espaço nenhum (retorna null).
 */
export function DicaContextual({ id, texto, icon = 'lightbulb-on-outline', style }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [visivel, setVisivel] = useState(false);

  // Reavalia SEMPRE que a tela ganha foco (useFocusEffect), não só no mount: se o
  // usuário desliga o toggle na Conta e volta para uma aba já montada (ex.: Home),
  // a dica precisa sumir na hora. Ler só no mount deixava a dica na tela apesar do
  // switch desligado. "Some pra sempre no Entendi" continua: após marcarDicaVista,
  // dicaFoiVista(id) volta true e a reavaliação mantém a dica escondida.
  // `vivo` (limpo no blur/desmontagem) evita setState depois de sair da tela.
  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      (async () => {
        const [ativa, vista] = await Promise.all([estaAtiva(), dicaFoiVista(id)]);
        if (vivo) setVisivel(ativa && !vista);
      })();
      return () => { vivo = false; };
    }, [id]),
  );

  function entendi() {
    Haptics.selectionAsync().catch(() => {});
    setVisivel(false);
    void marcarDicaVista(id);
  }

  if (!visivel) return null;

  return (
    <AnimatedEntrance from="scale" style={style}>
      <View style={styles.card}>
        <MaterialCommunityIcons name={icon} size={16} color={cores.accentLight} style={styles.icon} />
        <Text style={styles.texto}>{texto}</Text>
        <OlliPressable onPress={entendi} haptic={false} style={styles.btn} accessibilityLabel="Entendi, não mostrar esta dica de novo">
          <Text style={styles.btnText}>Entendi</Text>
        </OlliPressable>
      </View>
    </AnimatedEntrance>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      // rgba(52,198,217,0.10) era o accent em baixa opacidade — é exatamente
      // o que `accentContainer` já representa.
      backgroundColor: c.accentContainer,
      borderWidth: 1,
      // rgba(127,233,245,0.30) era o accentLight legado como borda-brilho —
      // o mesmo papel de `strokeGlow`.
      borderColor: c.strokeGlow,
      borderRadius: BorderRadius.md,
      paddingVertical: 9,
      paddingHorizontal: Spacing.md,
      marginTop: Spacing.sm,
    },
    icon: { marginTop: 1 },
    texto: { flex: 1, fontSize: 12.5, color: c.onSurface, lineHeight: 17 },
    btn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.full, backgroundColor: c.accentContainer },
    btnText: { fontSize: 11.5, fontWeight: '800', color: c.accentLight },
  });
