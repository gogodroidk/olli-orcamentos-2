import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { TabelaDados, Coluna } from '../../components/web/TabelaDados';
import { BarraBusca, normalizarBusca } from '../../components/web/BarraBusca';
import { EmptyState } from '../../components/EmptyState';
import { GuardaPapel } from '../../components/GuardaPapel';
import { PressableWebState } from '../../components/web/pressableWebState';
import { PainelProduto } from './PainelProduto';
import { getProdutos, deleteProduto, getOrcamentos } from '../../database/database';
import { onSyncAplicado } from '../../services/cloudSync';
import { formatCurrency } from '../../utils/currency';
import { ProdutoItem, Orcamento } from '../../types';
import { avisar, confirmar } from './dialogo';
import { margemInfo } from './produtoMargem';

type LinhaProduto = ProdutoItem & { uso: number };

/**
 * Produtos desktop (v4) — tabela com busca e painel lateral de
 * criação/edição (PainelProduto). Reaproveita getProdutos e o
 * gate de papel (`ver_valores_agregados`) já usados na ProdutosScreen
 * mobile, sem tocar nela: o catálogo expõe custo/margem, dado negado ao
 * técnico em qualquer plataforma.
 */
export default function ProdutosDesktopScreen() {
  return (
    <GuardaPapel acao="ver_valores_agregados" area="Produtos">
      <ProdutosDesktopConteudo />
    </GuardaPapel>
  );
}

function ProdutosDesktopConteudo() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [produtos, setProdutos] = useState<ProdutoItem[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [produtoEditando, setProdutoEditando] = useState<ProdutoItem | null>(null);
  const [painelVisivel, setPainelVisivel] = useState(false);

  const carregar = useCallback(async () => {
    const [p, o] = await Promise.all([getProdutos(), getOrcamentos()]);
    setProdutos(p);
    setOrcamentos(o);
    setCarregando(false);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => onSyncAplicado(carregar), [carregar]);

  // Uso por produto (join client-side, mesmo padrão do "último orçamento" de
  // Clientes): em quantos orçamentos DISTINTOS o produto aparece — revela os
  // campeões de venda do catálogo.
  const usoPorProduto = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const o of orcamentos) {
      const idsNoOrcamento = new Set(
        o.itens.filter((i) => i.tipo === 'produto').map((i) => i.catalogoId)
      );
      for (const id of idsNoOrcamento) {
        mapa.set(id, (mapa.get(id) ?? 0) + 1);
      }
    }
    return mapa;
  }, [orcamentos]);

  const linhas: LinhaProduto[] = useMemo(() => {
    let r: LinhaProduto[] = produtos.map((p) => ({
      ...p,
      uso: usoPorProduto.get(p.id) ?? 0,
    }));
    if (busca.trim()) {
      const q = normalizarBusca(busca);
      r = r.filter((p) =>
        normalizarBusca(p.nome).includes(q) ||
        normalizarBusca(p.descricao ?? '').includes(q) ||
        normalizarBusca(p.marca ?? '').includes(q) ||
        normalizarBusca(p.modelo ?? '').includes(q)
      );
    }
    return r;
  }, [produtos, busca, usoPorProduto]);

  function abrirNovo() {
    setProdutoEditando(null);
    setPainelVisivel(true);
  }

  function abrirEdicao(p: ProdutoItem) {
    setProdutoEditando(p);
    setPainelVisivel(true);
  }

  async function excluir(p: ProdutoItem) {
    if (!(await confirmar('Excluir produto', `Excluir "${p.nome}"? Essa ação não pode ser desfeita.`))) return;
    try {
      await deleteProduto(p.id);
      carregar();
    } catch {
      avisar('Erro', 'Não foi possível excluir o produto agora. Tente novamente.');
    }
  }

  const colunas: Coluna<LinhaProduto>[] = useMemo(() => [
    {
      chave: 'nome',
      titulo: 'Produto',
      largura: '26%',
      ordenavel: true,
      valorOrdenacao: (p) => p.nome,
      render: (p) => (
        <View style={styles.produtoCelula}>
          {p.fotoUri ? (
            <Image source={{ uri: p.fotoUri }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <MaterialCommunityIcons name="package-variant" size={16} color={cores.primary} />
            </View>
          )}
          <Text style={styles.celulaTexto} numberOfLines={1}>{p.nome}</Text>
        </View>
      ),
      tituloCompleto: (p) => p.nome,
    },
    {
      chave: 'marcaModelo',
      titulo: 'Marca / Modelo',
      largura: 170,
      ordenavel: true,
      valorOrdenacao: (p) => [p.marca, p.modelo].filter(Boolean).join(' · '),
      render: (p) => (
        <Text style={styles.celulaTexto} numberOfLines={1}>
          {[p.marca, p.modelo].filter(Boolean).join(' · ') || '—'}
        </Text>
      ),
      tituloCompleto: (p) => [p.marca, p.modelo].filter(Boolean).join(' · ') || undefined,
    },
    {
      chave: 'preco',
      titulo: 'Preço',
      largura: 110,
      alinhamento: 'direita',
      ordenavel: true,
      valorOrdenacao: (p) => p.preco,
      render: (p) => <Text style={styles.celulaPreco}>{formatCurrency(p.preco)}</Text>,
    },
    {
      chave: 'custo',
      titulo: 'Custo',
      largura: 110,
      alinhamento: 'direita',
      ordenavel: true,
      valorOrdenacao: (p) => p.custo ?? -1,
      render: (p) => (
        <Text style={styles.celulaTexto}>{p.custo ? formatCurrency(p.custo) : '—'}</Text>
      ),
    },
    {
      chave: 'margem',
      titulo: 'Margem',
      largura: 100,
      alinhamento: 'direita',
      ordenavel: true,
      valorOrdenacao: (p) => margemInfo(p.preco, p.custo)?.pct ?? -1,
      render: (p) => <CelulaMargem preco={p.preco} custo={p.custo} />,
    },
    {
      chave: 'unidade',
      titulo: 'Unidade',
      largura: 90,
      ordenavel: true,
      valorOrdenacao: (p) => p.unidade,
      render: (p) => <Text style={styles.celulaTexto}>{p.unidade}</Text>,
    },
    {
      chave: 'uso',
      titulo: 'Uso',
      largura: 80,
      alinhamento: 'direita',
      ordenavel: true,
      valorOrdenacao: (p) => p.uso,
      render: (p) => (
        <Text style={styles.celulaTexto}>{p.uso > 0 ? `${p.uso} orç.` : '—'}</Text>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: 120,
      render: (p) => (
        <View style={styles.acoesLinha}>
          <AcaoIcone icone="pencil-outline" rotulo="Editar" onPress={() => abrirEdicao(p)} />
          <AcaoIcone icone="trash-can-outline" rotulo="Excluir" onPress={() => excluir(p)} perigo />
        </View>
      ),
    },
  ], [styles, cores]);

  return (
    <LayoutDesktop
      titulo="Produtos"
      subtitulo={`${produtos.length} no catálogo`}
      acoes={
        <>
          <BarraBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome, marca ou modelo…" />
          <Pressable
            onPress={abrirNovo}
            accessibilityRole="button"
            accessibilityLabel="Novo produto"
            style={({ hovered, focused }: PressableWebState) => [styles.botaoNovo, hovered && styles.botaoNovoHover, focused && styles.focoVisivel]}
          >
            <MaterialCommunityIcons name="plus" size={18} color={cores.onPrimary} />
            <Text style={styles.botaoNovoLabel}>Novo produto</Text>
          </Pressable>
        </>
      }
    >
      <TabelaDados<LinhaProduto>
        colunas={colunas}
        dados={linhas}
        carregando={carregando}
        aoClicarLinha={(p) => abrirEdicao(p)}
        ordenacaoInicial={{ chave: 'nome', direcao: 'asc' }}
        vazio={
          <EmptyState
            icon="package-variant-closed"
            title="Nenhum produto"
            subtitle="Cadastre peças e materiais para incluir nos orçamentos."
            actionLabel="Novo produto"
            onAction={abrirNovo}
          />
        }
      />

      <PainelProduto
        produto={produtoEditando}
        visivel={painelVisivel}
        aoFechar={() => setPainelVisivel(false)}
        aoSalvar={carregar}
      />
    </LayoutDesktop>
  );
}

/** Pill de margem — verde fixo, mesma tag "lucro X%" da ProdutosScreen
 * mobile, sem faixas por limiar. Só aparece quando o produto tem custo
 * cadastrado (sem custo, sem margem). */
function CelulaMargem({ preco, custo }: { preco: number; custo?: number }) {
  const styles = useEstilos(criarEstilos);
  const margem = margemInfo(preco, custo);
  if (!margem) return <Text style={styles.celulaTexto}>—</Text>;

  return (
    <View style={styles.margemPill}>
      <Text style={styles.margemPillTexto}>{margem.pct}%</Text>
    </View>
  );
}

function AcaoIcone({
  icone, rotulo, onPress, perigo,
}: {
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  rotulo: string;
  onPress: () => void;
  perigo?: boolean;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <Pressable
      onPress={(e) => { e.stopPropagation(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ hovered, focused }: PressableWebState) => [
        styles.acaoIcone,
        hovered && (perigo ? styles.acaoIconeHoverPerigo : styles.acaoIconeHover),
        focused && styles.focoVisivel,
      ]}
    >
      <MaterialCommunityIcons name={icone} size={17} color={perigo ? cores.danger : cores.onSurfaceVariant} />
    </Pressable>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  focoVisivel: {
    outlineWidth: 2,
    outlineColor: c.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  } as any,
  botaoNovo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: c.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  botaoNovoHover: {
    backgroundColor: c.primaryLight,
  },
  botaoNovoLabel: {
    ...Typography.button,
    color: c.onPrimary,
    fontSize: 13,
  },
  produtoCelula: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minWidth: 0,
  },
  thumb: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
  },
  thumbPlaceholder: {
    backgroundColor: c.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.outline,
  },
  celulaTexto: {
    ...Typography.bodySmall,
    color: c.onSurface,
    flexShrink: 1,
  },
  celulaPreco: {
    ...Typography.bodySmall,
    color: c.onSurface,
    fontWeight: '700',
  },
  margemPill: {
    backgroundColor: c.successLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  margemPillTexto: {
    fontSize: 12,
    fontWeight: '700',
    color: c.success,
  },
  acoesLinha: {
    flexDirection: 'row',
    gap: 2,
  },
  acaoIcone: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acaoIconeHover: {
    backgroundColor: c.surfacePressed,
  },
  acaoIconeHoverPerigo: {
    backgroundColor: c.dangerLight,
  },
});
