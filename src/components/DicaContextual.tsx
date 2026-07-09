import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, BorderRadius, Spacing } from '../theme';
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
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [ativa, vista] = await Promise.all([estaAtiva(), dicaFoiVista(id)]);
      if (vivo) setVisivel(ativa && !vista);
    })();
    return () => { vivo = false; };
  }, [id]);

  function entendi() {
    Haptics.selectionAsync().catch(() => {});
    setVisivel(false);
    void marcarDicaVista(id);
  }

  if (!visivel) return null;

  return (
    <AnimatedEntrance from="scale" style={style}>
      <View style={styles.card}>
        <MaterialCommunityIcons name={icon} size={16} color={Colors.accentLight} style={styles.icon} />
        <Text style={styles.texto}>{texto}</Text>
        <OlliPressable onPress={entendi} haptic={false} style={styles.btn} accessibilityLabel="Entendi, não mostrar esta dica de novo">
          <Text style={styles.btnText}>Entendi</Text>
        </OlliPressable>
      </View>
    </AnimatedEntrance>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(52,198,217,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(127,233,245,0.30)',
    borderRadius: BorderRadius.md,
    paddingVertical: 9,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  icon: { marginTop: 1 },
  texto: { flex: 1, fontSize: 12.5, color: Colors.onSurface, lineHeight: 17 },
  btn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.full, backgroundColor: 'rgba(127,233,245,0.18)' },
  btnText: { fontSize: 11.5, fontWeight: '800', color: Colors.accentLight },
});
