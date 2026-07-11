import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { TabelaDados, Coluna } from '../../components/web/TabelaDados';
import { BarraBusca, normalizarBusca } from '../../components/web/BarraBusca';
import { EmptyState } from '../../components/EmptyState';
import { PressableWebState } from '../../components/web/pressableWebState';
import { PainelServico } from './PainelServico';
import { getServicos, deleteServico } from '../../database/database';
import { onSyncAplicado } from '../../services/cloudSync';
import { usePermissao } from '../../hooks/usePermissao';
import { formatCurrency } from '../../utils/currency';
import { ServicoItem } from '../../types';
import { avisar, confirmar } from './dialogo';
import { margemInfo } from './servicoMargem';

/**
 * Serviços desktop (v4) — tabela com busca e painel lateral de
 * criação/edição (PainelServico). Reaproveita getServicos/saveServico/
 * deleteServico já usados na ServicosScreen mobile, sem tocar nela.
 *
 * Catálogo expõe custo/margem/lucro — valores do negócio negados ao técnico
 * (mesma regra da mobile, 'ver_valores_agregados' via usePermissao). A mobile
 * usa <GuardaPapel> (casca de tela cheia); aqui a casca é a do desktop.
 */
export default function ServicosDesktopScreen() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { pode, carregando: permCarregando } = usePermissao();

  if (permCarregando) {
    return (
      <LayoutDesktop titulo="Serviços" scroll={false}>
        <View style={styles.permCarregando}>
          <ActivityIndicator color={cores.primary} />
        </View>
      </LayoutDesktop>
    );
  }

  if (!pode('ver_valores_agregados')) {
    return (
      <LayoutDesktop titulo="Serviços" subtitulo="Acesso restrito">
        <EmptyState
          icon="lock-outline"
          title="Área restrita"
          subtitle="O catálogo de serviços expõe preços, custos e margens — indisponível para o seu papel atual na equipe. Fale com o administrador da empresa se precisar de acesso."
        />
      </LayoutDesktop>
    );
  }

  return <ServicosConteudo />;
}

function ServicosConteudo() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [servicos, setServicos] = useState<ServicoItem[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [servicoEditando, setServicoEditando] = useState<ServicoItem | null>(null);
  const [painelVisivel, setPainelVisivel] = useState(false);

  const carregar = useCallback(async () => {
    const s = await getServicos();
    setServicos(s);
    setCarregando(false);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => onSyncAplicado(carregar), [carregar]);

  const linhas: ServicoItem[] = useMemo(() => {
    if (!busca.trim()) return servicos;
    const q = normalizarBusca(busca);
    return servicos.filter((s) =>
      normalizarBusca(s.nome).includes(q) ||
      normalizarBusca(s.descricao ?? '').includes(q)
    );
  }, [servicos, busca]);

  function abrirNovo() {
    setServicoEditando(null);
    setPainelVisivel(true);
  }

  function abrirEdicao(s: ServicoItem) {
    setServicoEditando(s);
    setPainelVisivel(true);
  }

  async function excluir(s: ServicoItem) {
    if (!confirmar('Excluir serviço', `Excluir "${s.nome}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await deleteServico(s.id);
      carregar();
    } catch {
      avisar('Erro', 'Não foi possível excluir o serviço agora. Tente novamente.');
    }
  }

  const colunas: Coluna<ServicoItem>[] = useMemo(() => [
    {
      chave: 'nome',
      titulo: 'Serviço',
      largura: '32%',
      ordenavel: true,
      valorOrdenacao: (s) => s.nome,
      tituloCompleto: (s) => s.descricao,
      render: (s) => (
        <View style={styles.celulaServico}>
          {s.fotoUri ? (
            <Image source={{ uri: s.fotoUri }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <MaterialCommunityIcons name="wrench-outline" size={16} color={cores.primary} />
            </View>
          )}
          <View style={styles.celulaServicoTextos}>
            <Text style={styles.celulaTexto} numberOfLines={1}>{s.nome}</Text>
            {s.descricao ? <Text style={styles.celulaDescricao} numberOfLines={1}>{s.descricao}</Text> : null}
          </View>
        </View>
      ),
    },
    {
      chave: 'preco',
      titulo: 'Preço',
      largura: 130,
      alinhamento: 'direita',
      ordenavel: true,
      valorOrdenacao: (s) => s.preco,
      render: (s) => <Text style={styles.celulaPreco}>{formatCurrency(s.preco)}</Text>,
    },
    {
      chave: 'custo',
      titulo: 'Custo',
      largura: 120,
      alinhamento: 'direita',
      ordenavel: true,
      valorOrdenacao: (s) => s.custo ?? -1,
      render: (s) => <Text style={styles.celulaTexto}>{s.custo ? formatCurrency(s.custo) : '—'}</Text>,
    },
    {
      chave: 'margem',
      titulo: 'Margem',
      largura: 100,
      alinhamento: 'direita',
      ordenavel: true,
      valorOrdenacao: (s) => margemInfo(s.preco, s.custo)?.pct ?? -1,
      render: (s) => {
        const margem = margemInfo(s.preco, s.custo);
        if (margem === null) return <Text style={styles.celulaTexto}>—</Text>;
        return (
          <Text style={[styles.celulaTexto, styles.celulaMargem]}>
            {margem.pct}%
          </Text>
        );
      },
    },
    {
      chave: 'unidade',
      titulo: 'Unidade',
      largura: 100,
      ordenavel: true,
      valorOrdenacao: (s) => s.unidade,
      render: (s) => <Text style={styles.celulaTexto}>{s.unidade}</Text>,
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: 120,
      render: (s) => (
        <View style={styles.acoesLinha}>
          <AcaoIcone icone="pencil-outline" rotulo="Editar" onPress={() => abrirEdicao(s)} />
          <AcaoIcone icone="trash-can-outline" rotulo="Excluir" onPress={() => excluir(s)} perigo />
        </View>
      ),
    },
  ], [cores, styles]);

  return (
    <LayoutDesktop
      titulo="Serviços"
      subtitulo={`${servicos.length} serviço${servicos.length === 1 ? '' : 's'} no catálogo`}
      acoes={
        <>
          <BarraBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome ou descrição…" />
          <Pressable
            onPress={abrirNovo}
            accessibilityRole="button"
            accessibilityLabel="Novo serviço"
            style={({ hovered, focused }: PressableWebState) => [styles.botaoNovo, hovered && styles.botaoNovoHover, focused && styles.focoVisivel]}
          >
            <MaterialCommunityIcons name="plus" size={18} color={cores.onPrimary} />
            <Text style={styles.botaoNovoLabel}>Novo serviço</Text>
          </Pressable>
        </>
      }
    >
      <TabelaDados<ServicoItem>
        colunas={colunas}
        dados={linhas}
        carregando={carregando}
        aoClicarLinha={(s) => abrirEdicao(s)}
        ordenacaoInicial={{ chave: 'nome', direcao: 'asc' }}
        vazio={
          <EmptyState
            icon="wrench-outline"
            title="Nenhum serviço"
            subtitle="Cadastre seus serviços para montar orçamentos em segundos."
            actionLabel="Novo serviço"
            onAction={abrirNovo}
          />
        }
      />

      <PainelServico
        servico={servicoEditando}
        visivel={painelVisivel}
        aoFechar={() => setPainelVisivel(false)}
        aoSalvar={carregar}
      />
    </LayoutDesktop>
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
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ hovered, focused }: PressableWebState) => [
        styles.acaoIcone,
        hovered && (perigo ? styles.acaoIconePerigoHover : styles.acaoIconeHover),
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
  permCarregando: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl,
  },
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
  celulaServico: {
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
    backgroundColor: c.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celulaServicoTextos: {
    flexShrink: 1,
    minWidth: 0,
  },
  celulaTexto: {
    ...Typography.bodySmall,
    color: c.onSurface,
  },
  celulaDescricao: {
    ...Typography.caption,
    color: c.onSurfaceVariant,
    marginTop: 1,
  },
  celulaPreco: {
    ...Typography.bodySmall,
    color: c.primary,
    fontWeight: '700',
  },
  celulaMargem: {
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
  acaoIconePerigoHover: {
    backgroundColor: c.dangerLight,
  },
});
