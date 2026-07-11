import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Spacing, BorderRadius, Typography, useEstilos, type Cores } from '../../theme';
import { PressableWebState } from './pressableWebState';

export interface ItemChipFiltro<K extends string = string> {
  chave: K;
  rotulo: string;
  /**
   * Cor do TEXTO/ícone quando ativo — precisa vir ajustada por contraste
   * (ex.: `corStatusOS`/`corStatusOrcamento`), nunca a matiz crua.
   */
  cor?: string;
  /**
   * Cor do FUNDO tintado + dot + borda quando ativo — é sobre ELA que `cor`
   * é calculada, então tem que ser a matiz CRUA (`STATUS_COLORS[x]`), não a
   * ajustada; ajustada aqui quebra a suposição de contraste (ver
   * `corCategoriaEmChip` em theme/cores.ts). Sem `corFundo`, cai em `cor`
   * (compatível com quem já passa uma cor só seguramente crua/de tema).
   */
  corFundo?: string;
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
        // Fundo/dot/borda usam a matiz crua (`corFundo`); sem ela, cai na
        // mesma `cor` recebida (compatibilidade com quem já passa algo seguro).
        const fundo = item.corFundo ?? cor;
        return (
          <Pressable
            key={item.chave}
            onPress={() => aoSelecionar(item.chave)}
            accessibilityRole="button"
            accessibilityLabel={`Filtrar por ${item.rotulo}`}
            accessibilityState={{ selected: ativo }}
            style={({ hovered, focused }: PressableWebState) => [
              styles.chip,
              ativo && (fundo ? { backgroundColor: `${fundo}1c`, borderColor: fundo } : styles.chipAtivoNeutro),
              !ativo && hovered && styles.chipHover,
              focused && styles.focoVisivel,
            ]}
          >
            {fundo && <View style={[styles.dot, { backgroundColor: fundo }]} />}
            <Text style={[styles.rotulo, ativo && (cor ? { color: cor } : styles.rotuloAtivoNeutro)]}>
              {item.rotulo}
            </Text>
            {typeof item.contagem === 'number' && (
              <View
                style={[
                  styles.contador,
                  ativo && (fundo ? { backgroundColor: `${fundo}2a` } : styles.contadorAtivoNeutro),
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
