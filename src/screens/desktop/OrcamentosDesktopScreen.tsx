import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { TabelaDados, Coluna } from '../../components/web/TabelaDados';
import { BarraBusca } from '../../components/web/BarraBusca';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { PressableWebState } from '../../components/web/pressableWebState';
import { getOrcamentos } from '../../database/database';
import { onSyncAplicado } from '../../services/cloudSync';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { RootStackParamList, TabParamList } from '../../navigation/AppNavigator';
import { Orcamento, StatusOrcamento, STATUS_LABELS } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<TabParamList, 'OrcamentosTab'>;

// Mesma cobertura de status da tela mobile (src/screens/OrcamentosScreen.tsx) —
// todos os valores reais de StatusOrcamento, sem misturar "Aguardando
// assinatura"/"Cancelado" dentro do filtro "Todos".
const FILTROS_STATUS: Array<{ chave: StatusOrcamento | 'todos'; label: string }> = [
  { chave: 'todos', label: 'Todos' },
  { chave: 'rascunho', label: STATUS_LABELS.rascunho },
  { chave: 'enviado', label: STATUS_LABELS.enviado },
  { chave: 'aguardando_assinatura', label: STATUS_LABELS.aguardando_assinatura },
  { chave: 'aprovado', label: STATUS_LABELS.aprovado },
  { chave: 'recusado', label: STATUS_LABELS.recusado },
  { chave: 'cancelado', label: STATUS_LABELS.cancelado },
];

/**
 * Orçamentos desktop (v4) — tabela com busca, filtro de status e ações por
 * linha. Vive dentro do shell (tab `OrcamentosTab`), reaproveitando os mesmos
 * dados/serviços da tela mobile (`getOrcamentos`), mas sem tocar nela.
 */
export default function OrcamentosDesktopScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
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
      const q = busca.toLowerCase();
      r = r.filter((o) => o.clienteNome.toLowerCase().includes(q) || o.numero.includes(q));
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
          <AcaoIcone icone="pencil-outline" rotulo="Editar" onPress={() => nav.navigate('EditarOrcamento', { orcamentoId: o.id })} />
          <AcaoIcone icone="receipt" rotulo="Recibo" onPress={() => nav.navigate('EmitirRecibo', { orcamentoId: o.id })} />
        </View>
      ),
    },
  ], [nav]);

  return (
    <LayoutDesktop
      titulo="Orçamentos"
      subtitulo={clienteId && clienteNome ? `de ${clienteNome}` : undefined}
      acoes={
        <>
          <BarraBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por cliente ou número…" />
          <Pressable
            onPress={() => nav.navigate('NovoOrcamento', clienteId ? { clienteId } : {})}
            accessibilityRole="button"
            accessibilityLabel="Novo orçamento"
            style={({ hovered }: PressableWebState) => [styles.botaoNovo, hovered && styles.botaoNovoHover]}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#fff" />
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
          <MaterialCommunityIcons name="account-filter-outline" size={18} color={Colors.accentLight} />
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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ hovered }: PressableWebState) => [
        styles.chip,
        ativo && styles.chipAtivo,
        !ativo && hovered && styles.chipHover,
      ]}
    >
      <Text style={[styles.chipLabel, ativo && styles.chipLabelAtivo]}>{label}</Text>
    </Pressable>
  );
}

function AcaoIcone({ icone, rotulo, onPress }: { icone: keyof typeof MaterialCommunityIcons.glyphMap; rotulo: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ hovered }: PressableWebState) => [styles.acaoIcone, hovered && styles.acaoIconeHover]}
    >
      <MaterialCommunityIcons name={icone} size={17} color={Colors.onSurfaceVariant} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  botaoNovo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  botaoNovoHover: {
    backgroundColor: Colors.primaryLight,
  },
  botaoNovoLabel: {
    ...Typography.button,
    color: '#fff',
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outline,
  },
  chipHover: {
    backgroundColor: Colors.surfacePressed,
  },
  chipAtivo: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipLabel: {
    ...Typography.caption,
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.onSurfaceVariant,
  },
  chipLabelAtivo: {
    color: '#fff',
  },
  bannerCliente: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(52,198,217,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(52,198,217,0.28)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  bannerClienteTexto: {
    ...Typography.bodySmall,
    color: Colors.accentLight,
    fontWeight: '700',
    flexShrink: 1,
  },
  celulaTexto: {
    ...Typography.bodySmall,
    color: Colors.onSurface,
  },
  celulaValor: {
    ...Typography.bodySmall,
    color: Colors.onSurface,
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
    backgroundColor: Colors.surfacePressed,
  },
});
