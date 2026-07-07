import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, FlatList, StyleSheet, DimensionValue, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../theme';
import { OlliSkeleton } from '../OlliSkeleton';
import { EmptyState } from '../EmptyState';
import { PressableWebState } from './pressableWebState';

export type Coluna<T> = {
  chave: string;
  titulo: string;
  largura?: number | string;
  alinhamento?: 'esquerda' | 'direita';
  ordenavel?: boolean;
  render: (item: T) => React.ReactNode;
  /** valor usado na ordenação — se ausente, cai para string vazia (não ordena de fato). */
  valorOrdenacao?: (item: T) => string | number;
  /**
   * Texto completo p/ tooltip nativo do browser (title HTML) quando a célula
   * trunca com ellipsis (numberOfLines=1 no render). RN-Web não repassa a prop
   * `title` de View/Text (framework não a inclui no forwardedProps), então a
   * tabela injeta um wrapper DOM nativo só na web — nulo no nativo.
   */
  tituloCompleto?: (item: T) => string | undefined;
};

/** Wrapper `<span title>` nativo do DOM — único jeito de dar tooltip real no
 * RN-Web (View/Text descartam a prop `title`). No-op fora da web. */
function CelulaComTooltip({ texto, children }: { texto?: string; children: React.ReactNode }) {
  if (Platform.OS !== 'web' || !texto) return <>{children}</>;
  return React.createElement('span', { title: texto, style: { display: 'block', minWidth: 0 } }, children);
}

/** `largura` aceita number|string no contrato (ex.: '20%'); RN tipa `width` como DimensionValue. */
function larguraParaEstilo(largura: number | string | undefined, padrao: DimensionValue): DimensionValue {
  return (largura as DimensionValue | undefined) ?? padrao;
}

interface Props<T extends { id: string }> {
  colunas: Coluna<T>[];
  dados: T[];
  carregando?: boolean;
  aoClicarLinha?: (item: T) => void;
  ordenacaoInicial?: { chave: string; direcao: 'asc' | 'desc' };
  vazio?: React.ReactNode;
}

const ALTURA_LINHA = 52;
const LINHAS_SKELETON = 6;

/**
 * Tabela genérica do kit desktop (v4) — substitui os cards em Orçamentos e
 * Clientes desktop. Ordenação client-side, header sticky, sem paginação
 * (decisão firme da v4 — volume local é pequeno). Não importada por nenhuma
 * tela mobile.
 */
export function TabelaDados<T extends { id: string }>({
  colunas,
  dados,
  carregando = false,
  aoClicarLinha,
  ordenacaoInicial,
  vazio,
}: Props<T>) {
  const [ordenacao, setOrdenacao] = useState(ordenacaoInicial ?? null);

  const dadosOrdenados = useMemo(() => {
    if (!ordenacao) return dados;
    const coluna = colunas.find((c) => c.chave === ordenacao.chave);
    if (!coluna) return dados;
    const valorDe = coluna.valorOrdenacao ?? (() => '');
    const copia = [...dados];
    copia.sort((a, b) => {
      const va = valorDe(a);
      const vb = valorDe(b);
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), 'pt-BR');
      }
      return ordenacao.direcao === 'asc' ? cmp : -cmp;
    });
    return copia;
  }, [dados, ordenacao, colunas]);

  function alternarOrdenacao(chave: string) {
    setOrdenacao((atual) => {
      if (!atual || atual.chave !== chave) return { chave, direcao: 'asc' };
      if (atual.direcao === 'asc') return { chave, direcao: 'desc' };
      return null;
    });
  }

  if (!carregando && dados.length === 0) {
    return (
      <View style={styles.wrap}>
        {vazio ?? <EmptyState icon="table-off" title="Nada por aqui" subtitle="Nenhum registro encontrado." />}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.tabela}>
          {/* Header sticky: fora do ScrollView vertical das linhas, sempre visível
              enquanto a lista rola (a rolagem horizontal continua compartilhada). */}
          <View style={styles.header}>
            {colunas.map((coluna) => (
              <CelulaHeader
                key={coluna.chave}
                coluna={coluna}
                ordenacao={ordenacao}
                onPress={coluna.ordenavel ? () => alternarOrdenacao(coluna.chave) : undefined}
              />
            ))}
          </View>

          {carregando ? (
            <View>
              {Array.from({ length: LINHAS_SKELETON }).map((_, i) => (
                <View key={i} style={styles.linha}>
                  {colunas.map((coluna) => (
                    <View
                      key={coluna.chave}
                      style={[
                        styles.celula,
                        { width: larguraParaEstilo(coluna.largura, 160), alignItems: coluna.alinhamento === 'direita' ? 'flex-end' : 'flex-start' },
                      ]}
                    >
                      <OlliSkeleton width="70%" height={12} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : (
            // FlatList (virtualizada) em vez de ScrollView+map: com centenas de
            // linhas, montar tudo de uma vez pesa o DOM na web. ALTURA_LINHA fixa
            // permite getItemLayout, evitando medição custosa a cada render.
            <FlatList
              data={dadosOrdenados}
              keyExtractor={(item) => item.id}
              style={styles.corpoScroll}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => <LinhaTabela item={item} colunas={colunas} onPress={aoClicarLinha} />}
              getItemLayout={(_, index) => ({ length: ALTURA_LINHA, offset: ALTURA_LINHA * index, index })}
              initialNumToRender={20}
              windowSize={8}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function CelulaHeader<T>({
  coluna,
  ordenacao,
  onPress,
}: {
  coluna: Coluna<T>;
  ordenacao: { chave: string; direcao: 'asc' | 'desc' } | null;
  onPress?: () => void;
}) {
  const ativa = ordenacao?.chave === coluna.chave;
  const conteudo = (
    <View
      style={[
        styles.celulaHeaderConteudo,
        { justifyContent: coluna.alinhamento === 'direita' ? 'flex-end' : 'flex-start' },
      ]}
    >
      <Text style={[styles.tituloHeader, ativa && styles.tituloHeaderAtivo]}>{coluna.titulo}</Text>
      {coluna.ordenavel && (
        <MaterialCommunityIcons
          name={ativa && ordenacao?.direcao === 'asc' ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={ativa ? Colors.accent : Colors.onSurfaceMuted}
          style={{ opacity: ativa ? 1 : 0.4 }}
        />
      )}
    </View>
  );

  const largura = larguraParaEstilo(coluna.largura, 160);

  if (!onPress) {
    return <View style={[styles.celulaHeader, { width: largura }]}>{conteudo}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ordenar por ${coluna.titulo}`}
      style={({ hovered, focused }: PressableWebState) => [
        styles.celulaHeader,
        { width: largura },
        hovered && styles.celulaHeaderHover,
        focused && styles.celulaFocada,
      ]}
    >
      {conteudo}
    </Pressable>
  );
}

function LinhaTabela<T extends { id: string }>({
  item,
  colunas,
  onPress,
}: {
  item: T;
  colunas: Coluna<T>[];
  onPress?: (item: T) => void;
}) {
  const conteudo = colunas.map((coluna) => (
    <View
      key={coluna.chave}
      style={[
        styles.celula,
        { width: larguraParaEstilo(coluna.largura, 160), alignItems: coluna.alinhamento === 'direita' ? 'flex-end' : 'flex-start' },
      ]}
    >
      <CelulaComTooltip texto={coluna.tituloCompleto?.(item)}>
        {coluna.render(item)}
      </CelulaComTooltip>
    </View>
  ));

  if (!onPress) {
    return <View style={styles.linha}>{conteudo}</View>;
  }

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      style={({ hovered, focused }: PressableWebState) => [styles.linha, hovered && styles.linhaHover, focused && styles.celulaFocada]}
    >
      {conteudo}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    overflow: 'hidden',
  },
  tabela: {
    minWidth: '100%',
  },
  header: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceVariant,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outline,
  },
  corpoScroll: {
    maxHeight: ALTURA_LINHA * 10,
  },
  celulaHeader: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  celulaHeaderHover: {
    backgroundColor: Colors.surfacePressed,
  },
  celulaFocada: {
    outlineWidth: 2,
    outlineColor: Colors.accent,
    outlineStyle: 'solid',
    outlineOffset: -2,
  } as any,
  celulaHeaderConteudo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tituloHeader: {
    ...Typography.label,
    color: Colors.onSurfaceVariant,
    textTransform: 'uppercase',
    fontSize: 11,
  },
  tituloHeaderAtivo: {
    color: Colors.onSurface,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ALTURA_LINHA,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outline,
  },
  linhaHover: {
    backgroundColor: Colors.surfacePressed,
    cursor: 'pointer' as any,
  },
  celula: {
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
});
