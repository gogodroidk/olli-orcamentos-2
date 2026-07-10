import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, type Cores } from '../../theme';
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
export function KpiCard({ titulo, valor, icone, corIcone, rodape, onPress }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  // Default do prop precisa do hook — não dá pra usar `cores.accent` direto na
  // desestruturação (roda antes do corpo da função).
  const corIconeFinal = corIcone ?? cores.accent;

  const conteudo = (
    <>
      <View style={styles.linhaTopo}>
        <Text style={styles.titulo} numberOfLines={1}>{titulo}</Text>
        <View style={[styles.iconeWrap, { backgroundColor: corIconeFinal + '20' }]}>
          <MaterialCommunityIcons name={icone} size={18} color={corIconeFinal} />
        </View>
      </View>
      <Text style={styles.valor} numberOfLines={1}>{valor}</Text>
      {(rodape || onPress) && (
        <View style={styles.rodapeLinha}>
          {rodape ? <Text style={styles.rodape} numberOfLines={1}>{rodape}</Text> : <View style={{ flex: 1 }} />}
          {onPress ? (
            <MaterialCommunityIcons name="arrow-right" size={14} color={cores.onSurfaceMuted} />
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

const criarEstilos = (c: Cores) => StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 220,
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardClicavel: {
    borderColor: c.strokeGlow,
  },
  linhaTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  titulo: {
    ...Typography.label,
    color: c.onSurfaceVariant,
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
    color: c.onSurface,
  },
  rodapeLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  rodape: {
    ...Typography.caption,
    color: c.onSurfaceMuted,
    flexShrink: 1,
  },
});
