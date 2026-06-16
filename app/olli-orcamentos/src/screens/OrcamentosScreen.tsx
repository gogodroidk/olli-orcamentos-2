import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { OlliCard } from '../components/OlliCard';
import { GradientHeader } from '../components/GradientHeader';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { getOrcamentos, deleteOrcamento, saveOrcamento, getNextOrcamentoNumber } from '../database/database';
import { formatCurrency } from '../utils/currency';
import { formatDate, nowISO } from '../utils/date';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Orcamento, StatusOrcamento } from '../types';
import { generateId } from '../utils/id';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_FILTERS: Array<{ key: StatusOrcamento | 'todos'; label: string }> = [
  { key: 'todos', label: 'Todos' },
  { key: 'rascunho', label: 'Rascunho' },
  { key: 'enviado', label: 'Enviado' },
  { key: 'aprovado', label: 'Aprovado' },
  { key: 'recusado', label: 'Recusado' },
];

export default function OrcamentosScreen() {
  const nav = useNavigation<Nav>();
  const [all, setAll] = useState<Orcamento[]>([]);
  const [filtered, setFiltered] = useState<Orcamento[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusOrcamento | 'todos'>('todos');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getOrcamentos();
    setAll(data);
    applyFilters(data, query, statusFilter);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function applyFilters(data: Orcamento[], q: string, s: typeof statusFilter) {
    let r = data;
    if (s !== 'todos') r = r.filter(o => o.status === s);
    if (q.trim()) {
      const lower = q.toLowerCase();
      r = r.filter(o =>
        o.clienteNome.toLowerCase().includes(lower) ||
        o.numero.includes(lower)
      );
    }
    setFiltered(r);
  }

  function handleSearch(q: string) {
    setQuery(q);
    applyFilters(all, q, statusFilter);
  }

  function handleStatusFilter(s: typeof statusFilter) {
    setStatusFilter(s);
    applyFilters(all, query, s);
  }

  async function handleDelete(o: Orcamento) {
    Alert.alert(
      'Excluir orçamento',
      `Deseja excluir o orçamento nº ${o.numero} de ${o.clienteNome}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: async () => {
            await deleteOrcamento(o.id);
            load();
          },
        },
      ]
    );
  }

  async function handleClone(o: Orcamento) {
    const cloneId = generateId();
    const numero = await getNextOrcamentoNumber();
    const clone: Orcamento = {
      ...o,
      id: cloneId,
      numero,
      status: 'rascunho',
      // não herdar dados específicos do orçamento original
      assinaturaClienteUri: undefined,
      dataAssinaturaCliente: undefined,
      assinaturaPrestadorUri: undefined,
      criadoDeModeloId: undefined,
      criadoEm: nowISO(),
      atualizadoEm: nowISO(),
    };
    await saveOrcamento(clone);
    load();
    nav.navigate('EditarOrcamento', { orcamentoId: cloneId });
  }

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderItem = ({ item: o }: { item: Orcamento }) => (
    <OlliCard
      onPress={() => nav.navigate('VisualizarOrcamento', { orcamentoId: o.id })}
      style={{ marginHorizontal: Spacing.base, marginBottom: 10 }}
    >
      <View style={styles.itemHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemNome} numberOfLines={1}>{o.clienteNome}</Text>
          <Text style={styles.itemMeta}>Nº {o.numero} · {formatDate(o.criadoEm)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.itemValor}>{formatCurrency(o.valorTotal)}</Text>
          <StatusBadge status={o.status} size="sm" />
        </View>
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => nav.navigate('EditarOrcamento', { orcamentoId: o.id })}>
          <MaterialCommunityIcons name="pencil-outline" size={16} color={Colors.primary} />
          <Text style={[styles.actionLabel, { color: Colors.primary }]}>Editar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleClone(o)}>
          <MaterialCommunityIcons name="content-copy" size={16} color={Colors.secondary} />
          <Text style={[styles.actionLabel, { color: Colors.secondary }]}>Clonar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => nav.navigate('EmitirRecibo', { orcamentoId: o.id })}>
          <MaterialCommunityIcons name="receipt" size={16} color={Colors.success} />
          <Text style={[styles.actionLabel, { color: Colors.success }]}>Recibo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(o)}>
          <MaterialCommunityIcons name="trash-can-outline" size={16} color={Colors.danger} />
          <Text style={[styles.actionLabel, { color: Colors.danger }]}>Excluir</Text>
        </TouchableOpacity>
      </View>
    </OlliCard>
  );

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Orçamentos"
        subtitle={`${all.length} no total`}
        right={
          <TouchableOpacity style={styles.newBtn} onPress={() => nav.navigate('NovoOrcamento', {})} activeOpacity={0.85}>
            <MaterialCommunityIcons name="plus" size={20} color="#fff" />
            <Text style={styles.newBtnLabel}>Novo</Text>
          </TouchableOpacity>
        }
      >
        <View style={styles.searchRow}>
          <MaterialCommunityIcons name="magnify" size={20} color={Colors.onSurfaceVariant} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por cliente ou número..."
            value={query}
            onChangeText={handleSearch}
            placeholderTextColor={Colors.onSurfaceMuted}
          />
          {query ? (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color={Colors.onSurfaceMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </GradientHeader>

      {/* FILTER CHIPS */}
      <View>
        <FlatList
          horizontal
          data={STATUS_FILTERS}
          keyExtractor={i => i.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingVertical: 8, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.chip, statusFilter === item.key && styles.chipActive]}
              onPress={() => handleStatusFilter(item.key)}
            >
              <Text style={[styles.chipLabel, statusFilter === item.key && styles.chipLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* LIST */}
      <FlatList
        data={filtered}
        keyExtractor={o => o.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: 80, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          <EmptyState
            icon="file-document-outline"
            title="Nenhum orçamento"
            subtitle={query ? 'Nenhum resultado para sua busca.' : 'Crie seu primeiro orçamento!'}
            actionLabel={!query ? 'Criar orçamento' : undefined}
            onAction={!query ? () => nav.navigate('NovoOrcamento', {}) : undefined}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  newBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceVariant,
    borderWidth: 1, borderColor: Colors.outline,
    marginTop: 14, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.onSurface },

  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.outline,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipLabel: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  chipLabelActive: { color: '#fff' },

  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemNome: { fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  itemMeta: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  itemValor: { fontSize: 15, fontWeight: '700', color: Colors.primary, marginBottom: 4 },

  itemActions: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.outline,
    marginTop: 10, paddingTop: 8, gap: 4,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 3, paddingVertical: 4,
  },
  actionLabel: { fontSize: 11, fontWeight: '700' },
});
