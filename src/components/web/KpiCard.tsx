import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../theme';
import { OlliPressable } from '../OlliPressable';

interface Props {
  titulo: string;
  valor: string;
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  corIcone?: string;
  rodape?: string;
  /**
   * Torna o cartão clicável (navega para a lista correspondente já filtrada).
   * Quando ausente, o cartão é puramente apresentacional (comportamento antigo).
   */
  onPress?: () => void;
}

/**
 * Cartão de indicador (KPI) do dashboard desktop. Puramente apresentacional
 * (recebe valor já formatado). Quando `onPress` é fornecido, vira um alvo
 * clicável com feedback de hover/press e uma seta de "abrir" no rodapé — cada
 * número do dashboard leva à lista que o explica.
 */
export function KpiCard({ titulo, valor, icone, corIcone = Colors.accent, rodape, onPress }: Props) {
  const conteudo = (
    <>
      <View style={styles.linhaTopo}>
        <Text style={styles.titulo} numberOfLines={1}>{titulo}</Text>
        <View style={[styles.iconeWrap, { backgroundColor: corIcone + '20' }]}>
          <MaterialCommunityIcons name={icone} size={18} color={corIcone} />
        </View>
      </View>
      <Text style={styles.valor} numberOfLines={1}>{valor}</Text>
      {(rodape || onPress) && (
        <View style={styles.rodapeLinha}>
          {rodape ? <Text style={styles.rodape} numberOfLines={1}>{rodape}</Text> : <View style={{ flex: 1 }} />}
          {onPress ? (
            <MaterialCommunityIcons name="arrow-right" size={14} color={Colors.onSurfaceMuted} />
          ) : null}
        </View>
      )}
    </>
  );

  if (onPress) {
    return (
      <OlliPressable style={[styles.card, styles.cardClicavel]} onPress={onPress} haptic={false}>
        {conteudo}
      </OlliPressable>
    );
  }

  return <View style={styles.card}>{conteudo}</View>;
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 220,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardClicavel: {
    borderColor: Colors.strokeGlow,
  },
  linhaTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  titulo: {
    ...Typography.label,
    color: Colors.onSurfaceVariant,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  iconeWrap: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valor: {
    ...Typography.value,
    color: Colors.onSurface,
  },
  rodapeLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  rodape: {
    ...Typography.caption,
    color: Colors.onSurfaceMuted,
    flexShrink: 1,
  },
});
