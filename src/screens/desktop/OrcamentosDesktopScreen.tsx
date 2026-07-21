import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, comAlfa, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { TabelaDados, Coluna } from '../../components/web/TabelaDados';
import { BarraBusca, normalizarBusca } from '../../components/web/BarraBusca';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { PressableWebState } from '../../components/web/pressableWebState';
import { getOrcamentos, edicaoBloqueada } from '../../database/database';
import { onSyncAplicado } from '../../services/cloudSync';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { RootStackParamList, TabParamList } from '../../navigation/AppNavigator';
import { Orcamento, StatusOrcamento, STATUS_LABELS } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<TabParamList, 'OrcamentosTab'>;

// Mesma cobertura da tela mobile (src/screens/OrcamentosScreen.tsx): derivado da
// fonte única e exaustiva (STATUS_LABELS, na ordem do type), para os 10 status
// ficarem sempre cobertos — nenhum ("Visualizado"/"Em negociação"/"Expirado"/
// "Convertido") fica preso só no "Todos" quando a lista cresce. "Todos" primeiro.
const FILTROS_STATUS: Array<{ chave: StatusOrcamento | 'todos'; label: string }> = [
  { chave: 'todos', label: 'Todos' },
  ...(Object.keys(STATUS_LABELS) as StatusOrcamento[]).map(chave => ({ chave, label: STATUS_LABELS[chave] })),
];

/**
 * Orçamentos desktop (v4) — tabela com busca, filtro de status e ações por
 * linha. Vive dentro do shell (tab `OrcamentosTab`), reaproveitando os mesmos
 * dados/serviços da tela mobile (`getOrcamentos`), mas sem tocar nela.
 *
 * SEM paginação de propósito (P1-13, revertido): as colunas da TabelaDados
 * são ordenáveis (Número/Cliente/Valor/Status) e o sort é client-side sobre
 * o array recebido — paginar aqui faria "Valor" ordenar só a primeira
 * página carregada, não o total. O volume local é pequeno (histórico de uma
 * empresa, não multi-tenant), então getOrcamentos() completo + filtro em
 * memória é seguro. O ganho de perf vem de cache-then-revalidate, não de
 * paginação: `carregando` só liga no MOUNT (nada em tela ainda); foco/sync
 * subsequentes recarregam em segundo plano sem apagar a tabela pra "piscar"
 * de novo (mesmo padrão de ClientesDesktopScreen/ProdutosDesktopScreen).
 */
export default function OrcamentosDesktopScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const clienteId = route.params?.clienteId;
  const clienteNome = route.params?.clienteNome;

  const [todos, setTodos] = useState<Orcamento[]>([]);
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<StatusOrcamento | 'todos'>('todos');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const dados = await getOrcamentos();
    setTodos(dados);
    setCarregando(false);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => onSyncAplicado(carregar), [carregar]);

  const filtrados = useMemo(() => {
    let r = todos;
    if (clienteId) r = r.filter((o) => o.clienteId === clienteId);
    if (statusFiltro !== 'todos') r = r.filter((o) => o.status === statusFiltro);
    if (busca.trim()) {
      const q = normalizarBusca(busca);
      r = r.filter((o) => normalizarBusca(o.clienteNome).includes(q) || o.numero.includes(q));
    }
    return r;
  }, [todos, clienteId, statusFiltro, busca]);

  const colunas: Coluna<Orcamento>[] = useMemo(() => [
    {
      chave: 'numero',
      titulo: 'Número',
      largura: 110,
      ordenavel: true,
      valorOrdenacao: (o) => o.numero,
      render: (o) => <Text style={styles.celulaTexto}>Nº {o.numero}</Text>,
    },
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: '26%',
      ordenavel: true,
      valorOrdenacao: (o) => o.clienteNome,
      render: (o) => <Text style={styles.celulaTexto} numberOfLines={1}>{o.clienteNome}</Text>,
      tituloCompleto: (o) => o.clienteNome,
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: 140,
      alinhamento: 'direita',
      ordenavel: true,
      valorOrdenacao: (o) => o.valorTotal,
      render: (o) => <Text style={styles.celulaValor}>{formatCurrency(o.valorTotal)}</Text>,
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: 170,
      ordenavel: true,
      valorOrdenacao: (o) => STATUS_LABELS[o.status],
      render: (o) => <StatusBadge status={o.status} size="sm" />,
    },
    {
      chave: 'data',
      titulo: 'Data',
      largura: 120,
      ordenavel: true,
      valorOrdenacao: (o) => o.criadoEm,
      render: (o) => <Text style={styles.celulaTexto}>{formatDate(o.criadoEm)}</Text>,
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: 120,
      render: (o) => (
        <View style={styles.acoesLinha}>
          <AcaoIcone icone="eye-outline" rotulo="Ver" onPress={() => nav.navigate('VisualizarOrcamento', { orcamentoId: o.id })} />
          {/* Editar SOME depois que o cliente recebeu o documento — mesma regra do
              app mobile (`OrcamentosScreen`) e do painel (`FormOrcamento`). O
              `saveOrcamento` recusa a edição de um orçamento aceito, então este
              lápis abria a tela inteira só para falhar no "Salvar", com o que o
              usuário digitou indo junto. "Ver" ao lado leva à tela que tem
              "Duplicar", que é o caminho que funciona. */}
          {!edicaoBloqueada(o.status) && (
            <AcaoIcone icone="pencil-outline" rotulo="Editar" onPress={() => nav.navigate('EditarOrcamento', { orcamentoId: o.id })} />
          )}
          <AcaoIcone icone="receipt" rotulo="Recibo" onPress={() => nav.navigate('EmitirRecibo', { orcamentoId: o.id })} />
        </View>
      ),
    },
  ], [nav, styles]);

  return (
    <LayoutDesktop
      titulo="Orçamentos"
      subtitulo={
        clienteId && clienteNome
          ? `de ${clienteNome}`
          : `${filtrados.length} orçamento${filtrados.length === 1 ? '' : 's'}`
      }
      acoes={
        <>
          <BarraBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por cliente ou número…" />
          <Pressable
            onPress={() => nav.navigate('NovoOrcamento', clienteId ? { clienteId } : {})}
            accessibilityRole="button"
            accessibilityLabel="Novo orçamento"
            style={({ hovered, focused }: PressableWebState) => [styles.botaoNovo, hovered && styles.botaoNovoHover, focused && styles.focoVisivel]}
          >
            <MaterialCommunityIcons name="plus" size={18} color={cores.onPrimary} />
            <Text style={styles.botaoNovoLabel}>Novo orçamento</Text>
          </Pressable>
        </>
      }
    >
      <View style={styles.chips}>
        {FILTROS_STATUS.map((f) => (
          <Chip
            key={f.chave}
            label={f.label}
            ativo={statusFiltro === f.chave}
            onPress={() => setStatusFiltro(f.chave)}
          />
        ))}
      </View>

      {clienteId && (
        <View style={styles.bannerCliente}>
          <MaterialCommunityIcons name="account-filter-outline" size={18} color={cores.accentLight} />
          <Text style={styles.bannerClienteTexto} numberOfLines={1}>
            Mostrando orçamentos de {clienteNome || 'um cliente'}
          </Text>
        </View>
      )}

      <TabelaDados<Orcamento>
        colunas={colunas}
        dados={filtrados}
        carregando={carregando}
        aoClicarLinha={(o) => nav.navigate('VisualizarOrcamento', { orcamentoId: o.id })}
        ordenacaoInicial={{ chave: 'data', direcao: 'desc' }}
        vazio={
          <EmptyState
            icon="file-document-outline"
            title="Nenhum orçamento"
            subtitle={busca ? 'Nenhum resultado para sua busca.' : 'Crie seu primeiro orçamento!'}
            actionLabel={!busca ? 'Criar orçamento' : undefined}
            onAction={!busca ? () => nav.navigate('NovoOrcamento', clienteId ? { clienteId } : {}) : undefined}
          />
        }
      />
    </LayoutDesktop>
  );
}

function Chip({ label, ativo, onPress }: { label: string; ativo: boolean; onPress: () => void }) {
  const styles = useEstilos(criarEstilos);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ hovered, focused }: PressableWebState) => [
        styles.chip,
        ativo && styles.chipAtivo,
        !ativo && hovered && styles.chipHover,
        focused && styles.focoVisivel,
      ]}
    >
      <Text style={[styles.chipLabel, ativo && styles.chipLabelAtivo]}>{label}</Text>
    </Pressable>
  );
}

function AcaoIcone({ icone, rotulo, onPress }: { icone: keyof typeof MaterialCommunityIcons.glyphMap; rotulo: string; onPress: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <Pressable
      onPress={(e) => { e.stopPropagation(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ hovered, focused }: PressableWebState) => [styles.acaoIcone, hovered && styles.acaoIconeHover, focused && styles.focoVisivel]}
    >
      <MaterialCommunityIcons name={icone} size={17} color={cores.onSurfaceVariant} />
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.outline,
  },
  chipHover: {
    backgroundColor: c.surfacePressed,
  },
  chipAtivo: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  chipLabel: {
    ...Typography.caption,
    fontWeight: '600',
    color: c.onSurfaceVariant,
  },
  chipLabelAtivo: {
    color: c.onPrimary,
  },
  bannerCliente: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    // rgba(52,198,217,...) era o cyan de marca (#34C6D9) fixo — agora acompanha
    // o accent escolhido no tema via comAlfa.
    backgroundColor: comAlfa(c.accent, 0.10),
    borderWidth: 1,
    borderColor: comAlfa(c.accent, 0.28),
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  bannerClienteTexto: {
    ...Typography.bodySmall,
    color: c.accentLight,
    fontWeight: '700',
    flexShrink: 1,
  },
  celulaTexto: {
    ...Typography.bodySmall,
    color: c.onSurface,
  },
  celulaValor: {
    ...Typography.bodySmall,
    color: c.onSurface,
    fontWeight: '700',
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
});
