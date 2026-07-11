import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Spacing, BorderRadius, Typography, useEstilos, type Cores } from '../../theme';
import { PressableWebState } from './pressableWebState';

export interface ItemChipFiltro<K extends string = string> {
  chave: K;
  rotulo: string;
  /** Cor de destaque do chip quando ativo (dot + texto + fundo tintado). Sem cor = neutro (tema). */
  cor?: string;
  /** Contagem exibida num badge ao lado do rótulo (ex.: nº de itens naquele status). */
  contagem?: number;
}

interface Props<K extends string> {
  itens: ItemChipFiltro<K>[];
  selecionado: K;
  aoSelecionar: (chave: K) => void;
}

/**
 * Fileira de chips de filtro (um ativo por grupo, com contagem) — primitiva
 * compartilhada do kit desktop v4 (Equipamentos, Recibos, Ordens de serviço,
 * PMOC, Lixeira, Equipe...). Client-side, sem paginação; hover/focus-visible
 * no padrão do kit (ver TabelaDados/ClientesDesktopScreen). `hovered`/`focused`
 * são opcionais (ver PressableWebState) — em telas MOBILE (ex.: AgendaScreen)
 * o componente funciona igual, só sem os efeitos de hover/teclado (web-only).
 */
export function ChipsFiltro<K extends string>({ itens, selecionado, aoSelecionar }: Props<K>) {
  const styles = useEstilos(criarEstilos);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.linha}
    >
      {itens.map((item) => {
        const ativo = item.chave === selecionado;
        const cor = item.cor;
        return (
          <Pressable
            key={item.chave}
            onPress={() => aoSelecionar(item.chave)}
            accessibilityRole="button"
            accessibilityLabel={`Filtrar por ${item.rotulo}`}
            accessibilityState={{ selected: ativo }}
            style={({ hovered, focused }: PressableWebState) => [
              styles.chip,
              ativo && (cor ? { backgroundColor: `${cor}1c`, borderColor: cor } : styles.chipAtivoNeutro),
              !ativo && hovered && styles.chipHover,
              focused && styles.focoVisivel,
            ]}
          >
            {cor && <View style={[styles.dot, { backgroundColor: cor }]} />}
            <Text style={[styles.rotulo, ativo && (cor ? { color: cor } : styles.rotuloAtivoNeutro)]}>
              {item.rotulo}
            </Text>
            {typeof item.contagem === 'number' && (
              <View
                style={[
                  styles.contador,
                  ativo && (cor ? { backgroundColor: `${cor}2a` } : styles.contadorAtivoNeutro),
                ]}
              >
                <Text style={[styles.contadorTexto, ativo && (cor ? { color: cor } : styles.rotuloAtivoNeutro)]}>
                  {item.contagem}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  focoVisivel: {
    outlineWidth: 2,
    outlineColor: c.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  } as any,
  scroll: {
    flexGrow: 0,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.outline,
  },
  chipHover: {
    backgroundColor: c.surfacePressed,
  },
  chipAtivoNeutro: {
    backgroundColor: c.primaryContainer,
    borderColor: c.primary,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  rotulo: {
    ...Typography.bodySmall,
    color: c.onSurfaceVariant,
    fontWeight: '600' as const,
  },
  rotuloAtivoNeutro: {
    color: c.onSurface,
  },
  contador: {
    minWidth: 20,
    paddingHorizontal: 5,
    height: 20,
    borderRadius: BorderRadius.full,
    backgroundColor: c.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contadorAtivoNeutro: {
    backgroundColor: c.surface,
  },
  contadorTexto: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: '700' as const,
    color: c.onSurfaceVariant,
  },
});
