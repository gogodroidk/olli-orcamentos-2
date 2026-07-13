import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, FlatList, StyleSheet, DimensionValue, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, type Cores } from '../../theme';
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
  /**
   * Chamado quando o usuário rola perto do fim da lista — opcional, usada só
   * pelas telas com paginação incremental (ex.: Orçamentos desktop, que pede
   * mais páginas ao SQLite em vez de carregar o histórico inteiro de uma vez).
   * Sem paginação (maioria das telas), simplesmente não é passada — sem
   * mudança de comportamento (`onEndReached` undefined não faz nada no FlatList).
   */
  aoFimDaLista?: () => void;
  /** true enquanto uma página adicional está sendo buscada — mostra um rodapé de carregamento sem esconder as linhas já carregadas. */
  carregandoMais?: boolean;
}

const ALTURA_LINHA = 52;
const LINHAS_SKELETON = 6;

/**
 * Tabela genérica do kit desktop (v4) — substitui os cards em Orçamentos e
 * Clientes desktop. Ordenação client-side (sobre os dados JÁ carregados) e
 * header sticky. Continua SEM paginação própria por padrão — decisão firme da
 * v4, volume local é pequeno na maioria das telas — mas aceita `aoFimDaLista`
 * opcional para as poucas telas que pedem mais dados ao SQLite conforme o
 * usuário rola (ex.: Orçamentos desktop). Não importada por nenhuma tela mobile.
 */
export function TabelaDados<T extends { id: string }>({
  colunas,
  dados,
  carregando = false,
  aoClicarLinha,
  ordenacaoInicial,
  vazio,
  aoFimDaLista,
  carregandoMais = false,
}: Props<T>) {
  const [ordenacao, setOrdenacao] = useState(ordenacaoInicial ?? null);
  const styles = useEstilos(criarEstilos);

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

  // useCallback: mantém a IDENTIDADE de renderItem/keyExtractor estável entre
  // re-renders da tabela que não mudam `colunas`/`aoClicarLinha` (ex.: alternar
  // ordenação só troca `dadosOrdenados`). Combinado com LinhaTabela memoizada
  // (React.memo), uma linha só reconcilia de verdade se o próprio item mudar.
  const renderItem = useCallback(
    ({ item }: { item: T }) => <LinhaTabela item={item} colunas={colunas} onPress={aoClicarLinha} />,
    [colunas, aoClicarLinha]
  );
  const keyExtractor = useCallback((item: T) => item.id, []);

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
              keyExtractor={keyExtractor}
              style={styles.corpoScroll}
              showsVerticalScrollIndicator={false}
              renderItem={renderItem}
              getItemLayout={(_, index) => ({ length: ALTURA_LINHA, offset: ALTURA_LINHA * index, index })}
              initialNumToRender={20}
              windowSize={8}
              onEndReached={aoFimDaLista}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                carregandoMais ? (
                  <View style={styles.rodapeCarregandoMais}>
                    <OlliSkeleton width={120} height={12} />
                  </View>
                ) : null
              }
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function CelulaHeaderBase<T>({
  coluna,
  ordenacao,
  onPress,
}: {
  coluna: Coluna<T>;
  ordenacao: { chave: string; direcao: 'asc' | 'desc' } | null;
  onPress?: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
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
          color={ativa ? cores.accent : cores.onSurfaceMuted}
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

// React.memo: o header não é virtualizado (poucas colunas, sempre montado),
// mas re-renderiza a cada alternância de ordenação — memoizar evita refazer o
// trabalho das colunas que não mudaram de estado "ativa". Cast preserva o
// genérico <T> (React.memo por si só devolveria um componente não-genérico).
const CelulaHeader = React.memo(CelulaHeaderBase) as typeof CelulaHeaderBase;

function LinhaTabelaBase<T extends { id: string }>({
  item,
  colunas,
  onPress,
}: {
  item: T;
  colunas: Coluna<T>[];
  onPress?: (item: T) => void;
}) {
  const styles = useEstilos(criarEstilos);
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
      // SEM accessibilityRole="button": no react-native-web isso renderiza um <button>,
      // e as células frequentemente contêm botões de ação (Ver/editar) → <button> DENTRO de
      // <button> = HTML inválido + erro de hidratação em massa (um por linha, em toda tabela
      // do desktop). Como <div> clicável a linha continua abrindo no clique; o acesso por
      // TECLADO fica nos botões de ação explícitos das células (que seguem sendo <button>).
      style={({ hovered, focused }: PressableWebState) => [styles.linha, hovered && styles.linhaHover, focused && styles.celulaFocada]}
    >
      {conteudo}
    </Pressable>
  );
}

// React.memo: cada linha só reconcilia de verdade se `item`, `colunas` ou
// `onPress` mudarem de fato — um re-render da tabela por causa de outra parte
// da tela (ex.: cabeçalho, totais) não obriga a passar por TODAS as linhas
// visíveis de novo. Cast preserva o genérico <T> pelo mesmo motivo do header.
const LinhaTabela = React.memo(LinhaTabelaBase) as typeof LinhaTabelaBase;

const criarEstilos = (c: Cores) => StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    overflow: 'hidden',
  },
  tabela: {
    minWidth: '100%',
  },
  header: {
    flexDirection: 'row',
    backgroundColor: c.surfaceVariant,
    borderBottomWidth: 1,
    borderBottomColor: c.outline,
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
    backgroundColor: c.surfacePressed,
  },
  celulaFocada: {
    outlineWidth: 2,
    outlineColor: c.accent,
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
    color: c.onSurfaceVariant,
    textTransform: 'uppercase',
    fontSize: 11,
  },
  tituloHeaderAtivo: {
    color: c.onSurface,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ALTURA_LINHA,
    borderBottomWidth: 1,
    borderBottomColor: c.outline,
  },
  linhaHover: {
    backgroundColor: c.surfacePressed,
    cursor: 'pointer' as any,
  },
  celula: {
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  rodapeCarregandoMais: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
});
