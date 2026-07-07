import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';

interface Props {
  titulo: string;
  subtitulo?: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
  /** default true — envolve o conteúdo num ScrollView vertical. */
  scroll?: boolean;
}

/**
 * Casca padrão de toda tela desktop (v4): header de página (título + ações à
 * direita) e uma coluna de conteúdo com largura máxima, centralizada com
 * padding generoso. Usado por Inicio/Relatorios/Orcamentos/Clientes/Agenda/
 * Ferramentas desktop — nunca importado por telas mobile.
 */
export function LayoutDesktop({ titulo, subtitulo, acoes, children, scroll = true }: Props) {
  const conteudo = (
    <View style={styles.coluna}>
      <View style={styles.header}>
        <View style={styles.headerTextos}>
          <Text style={styles.titulo}>{titulo}</Text>
          {subtitulo && <Text style={styles.subtitulo}>{subtitulo}</Text>}
        </View>
        {acoes && <View style={styles.acoes}>{acoes}</View>}
      </View>
      {children}
    </View>
  );

  return (
    <View style={styles.fundo}>
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollConteudo}
          showsVerticalScrollIndicator={false}
        >
          {conteudo}
        </ScrollView>
      ) : (
        <View style={styles.semScroll}>{conteudo}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollConteudo: {
    alignItems: 'center',
    paddingBottom: Spacing.xxxl,
  },
  semScroll: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  coluna: {
    width: '100%',
    maxWidth: 1280,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  headerTextos: {
    flexShrink: 1,
    gap: Spacing.xs,
  },
  titulo: {
    ...Typography.h1,
    color: Colors.onBackground,
  },
  subtitulo: {
    ...Typography.body,
    color: Colors.onSurfaceVariant,
  },
  acoes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
  },
});
