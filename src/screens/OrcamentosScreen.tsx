import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, Alert, RefreshControl, Animated, Modal,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { OlliCard } from '../components/OlliCard';
import { GradientHeader } from '../components/GradientHeader';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { CountUp } from '../components/CountUp';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { OlliButton } from '../components/OlliButton';
import { getOrcamentos, deleteOrcamento, saveOrcamento, getNextOrcamentoNumber, getRecibos } from '../database/database';
import { sincronizarStatusLinks } from '../services/clienteLink';
import { onSyncAplicado } from '../services/cloudSync';
import { getStatusFinanceiro, getBadgeFinanceiro, getReciboDoOrcamento, registrarPagamento, StatusFinanceiro } from '../services/pagamentos';
import { formatCurrency } from '../utils/currency';
import { formatDate, nowISO, todayISO } from '../utils/date';
import { isoToBR } from '../utils/masks';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { Orcamento, StatusOrcamento, Recibo, STATUS_LABELS } from '../types';
import { generateId } from '../utils/id';

const FORMAS_PAGAMENTO_RAPIDO = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência'];

/** Badge compacto de estado financeiro — só aparece em orçamentos aprovados/convertidos. */
function BadgeFinanceiroPill({ status }: { status: StatusFinanceiro }) {
  const b = getBadgeFinanceiro(status);
  return (
    <View style={[styles.finBadge, { backgroundColor: b.color + '20', borderColor: b.color + '55' }]}>
      <MaterialCommunityIcons name={b.icon} size={11} color={b.color} />
      <Text style={[styles.finBadgeText, { color: b.color }]}>{b.label}</Text>
    </View>
  );
}

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Orcamentos'>;

/**
 * Pill discreto "Sincronizando..." — some com fade sozinho depois de exibido.
 * Dá feedback visual de que a tela está de fato conectada à nuvem quando o
 * `onSyncAplicado` recarrega os dados em segundo plano (sem isso o usuário só
 * vê a lista "piscar" sem entender por quê).
 */
function SincronizandoPill({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onDone(); });
  }, [opacity]);

  return (
    <Animated.View pointerEvents="none" style={[styles.syncPill, { opacity }]}>
      <MaterialCommunityIcons name="cloud-sync-outline" size={13} color={Colors.accentLight} />
      <Text style={styles.syncPillText}>Sincronizando...</Text>
    </Animated.View>
  );
}

// Derivado da fonte única e exaustiva (STATUS_LABELS, na ordem do type) — assim
// os 10 status ficam sempre cobertos e nenhum orçamento (ex.: "Visualizado",
// "Em negociação", "Expirado", "Convertido") fica preso só no filtro "Todos"
// quando a lista de status cresce. Mesmo padrão do STATUS_MANUAIS em
// VisualizarOrcamentoScreen. "Todos" continua como primeira opção.
const STATUS_FILTERS: Array<{ key: StatusOrcamento | 'todos'; label: string }> = [
  { key: 'todos', label: 'Todos' },
  ...(Object.keys(STATUS_LABELS) as StatusOrcamento[]).map(key => ({ key, label: STATUS_LABELS[key] })),
];

export default function OrcamentosScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  // Filtro por cliente (CRM): quando aberto a partir de um cliente.
  const [clienteId, setClienteId] = useState<string | undefined>(route.params?.clienteId);
  const clienteNome = route.params?.clienteNome;
  const [all, setAll] = useState<Orcamento[]>([]);
  const [filtered, setFiltered] = useState<Orcamento[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusOrcamento | 'todos'>('todos');
  const [refreshing, setRefreshing] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  // Recibos vinculados aos orçamentos (badge financeiro: aguardando pagamento /
  // pago / recibo emitido). Recarregado junto com a lista de orçamentos.
  const [recibos, setRecibos] = useState<Recibo[]>([]);

  // Modal "Registrar pagamento" — rápido, sem sair da lista.
  const [orcPagamento, setOrcPagamento] = useState<Orcamento | null>(null);
  const [valorPagamento, setValorPagamento] = useState(0);
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [dataPagamento, setDataPagamento] = useState(isoToBR(todayISO()));
  const [registrando, setRegistrando] = useState(false);

  const load = useCallback(async () => {
    const [data, listaRecibos] = await Promise.all([getOrcamentos(), getRecibos()]);
    setAll(data);
    setRecibos(listaRecibos);
    applyFilters(data, query, statusFilter, clienteId);
    setCarregando(false);
  }, [clienteId]);

  useFocusEffect(useCallback(() => {
    load();
    // sincronizarStatusLinks() nunca lança — é seguro chamar sem try/catch.
    // Se algum orçamento mudou de status (cliente aprovou/recusou pelo link),
    // recarrega a lista para refletir o novo status.
    sincronizarStatusLinks().then(alterados => {
      if (alterados > 0) load();
    });
  }, [load]));

  // Recarrega a lista quando o sync em segundo plano (login/foreground) traz
  // dados novos da nuvem — sem isso, um aparelho recém-logado podia mostrar a
  // lista vazia até o usuário sair e voltar para a tela.
  useEffect(() => onSyncAplicado(() => { setSincronizando(true); load(); }), [load]);

  function applyFilters(data: Orcamento[], q: string, s: typeof statusFilter, cliId?: string) {
    let r = data;
    if (cliId) r = r.filter(o => o.clienteId === cliId);
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

  function limparFiltroCliente() {
    setClienteId(undefined);
    applyFilters(all, query, statusFilter, undefined);
  }

  function handleSearch(q: string) {
    setQuery(q);
    applyFilters(all, q, statusFilter, clienteId);
  }

  function handleStatusFilter(s: typeof statusFilter) {
    setStatusFilter(s);
    applyFilters(all, query, s, clienteId);
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
            try {
              await deleteOrcamento(o.id);
              load();
            } catch (e) {
              Alert.alert('Erro', 'Não foi possível excluir o orçamento agora. Tente novamente.');
            }
          },
        },
      ]
    );
  }

  async function handleClone(o: Orcamento) {
    try {
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
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível clonar o orçamento agora. Tente novamente.');
    }
  }

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  /** Abre o modal "Registrar pagamento" pré-preenchido com o valor do orçamento. */
  function abrirRegistrarPagamento(o: Orcamento) {
    setOrcPagamento(o);
    setValorPagamento(o.valorTotal);
    setFormaPagamento('PIX');
    setDataPagamento(isoToBR(todayISO()));
  }

  function fecharRegistrarPagamento() {
    if (registrando) return; // não fecha no meio de um salvamento em andamento
    setOrcPagamento(null);
  }

  async function confirmarRegistrarPagamento() {
    if (!orcPagamento) return;
    if (!valorPagamento) {
      Alert.alert('Atenção', 'Informe o valor recebido.');
      return;
    }
    setRegistrando(true);
    try {
      await registrarPagamento({
        orcamento: orcPagamento,
        valorRecebido: valorPagamento,
        formaPagamento,
        dataRecebimento: dataPagamento,
      });
      setOrcPagamento(null);
      await load();
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível registrar o pagamento agora. Tente novamente.');
    } finally {
      setRegistrando(false);
    }
  }

  const renderItem = ({ item: o, index }: { item: Orcamento; index: number }) => {
    const statusFinanceiro = getStatusFinanceiro(o, recibos);
    const reciboVinculado = statusFinanceiro ? getReciboDoOrcamento(o.id, recibos) : null;

    return (
      <AnimatedEntrance index={index}>
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

          {statusFinanceiro && (
            <View style={styles.finRow}>
              <BadgeFinanceiroPill status={statusFinanceiro} />
              {reciboVinculado && (
                <Text style={styles.finReciboRef} numberOfLines={1}>Recibo Nº {reciboVinculado.numero}</Text>
              )}
            </View>
          )}

          <View style={styles.itemActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => nav.navigate('EditarOrcamento', { orcamentoId: o.id })}>
              <MaterialCommunityIcons name="pencil-outline" size={16} color={Colors.primary} />
              <Text style={[styles.actionLabel, { color: Colors.primary }]}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleClone(o)}>
              <MaterialCommunityIcons name="content-copy" size={16} color={Colors.secondary} />
              <Text style={[styles.actionLabel, { color: Colors.secondary }]}>Clonar</Text>
            </TouchableOpacity>
            {statusFinanceiro === 'aguardando_pagamento' ? (
              <TouchableOpacity style={styles.actionBtn} onPress={() => abrirRegistrarPagamento(o)}>
                <MaterialCommunityIcons name="cash-plus" size={16} color={Colors.warning} />
                <Text style={[styles.actionLabel, { color: Colors.warning }]}>Pagamento</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.actionBtn} onPress={() => nav.navigate('EmitirRecibo', { orcamentoId: o.id })}>
                <MaterialCommunityIcons name="receipt" size={16} color={Colors.success} />
                <Text style={[styles.actionLabel, { color: Colors.success }]}>Recibo</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(o)}>
              <MaterialCommunityIcons name="trash-can-outline" size={16} color={Colors.danger} />
              <Text style={[styles.actionLabel, { color: Colors.danger }]}>Excluir</Text>
            </TouchableOpacity>
          </View>
        </OlliCard>
      </AnimatedEntrance>
    );
  };

  return (
    <View style={styles.container}>
      {sincronizando && <SincronizandoPill onDone={() => setSincronizando(false)} />}
      <GradientHeader
        onBack={() => goBackOrHome(nav)}
        title="Orçamentos"
        subtitle={clienteId && clienteNome ? `de ${clienteNome}` : undefined}
        right={
          <TouchableOpacity style={styles.newBtn} onPress={() => nav.navigate('NovoOrcamento', clienteId ? { clienteId } : {})} activeOpacity={0.85}>
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
            <TouchableOpacity onPress={() => handleSearch('')} accessibilityRole="button" accessibilityLabel="Limpar busca">
              <MaterialCommunityIcons name="close-circle" size={18} color={Colors.onSurfaceMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{filtered.length} orçamento{filtered.length !== 1 ? 's' : ''}</Text>
          <CountUp
            value={filtered.reduce((s, o) => s + o.valorTotal, 0)}
            format="currency"
            style={styles.totalValue}
          />
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

      {/* BANNER DE FILTRO POR CLIENTE (CRM) */}
      {clienteId && (
        <View style={styles.clienteBanner}>
          <MaterialCommunityIcons name="account-filter-outline" size={18} color={Colors.accentLight} />
          <Text style={styles.clienteBannerText} numberOfLines={1}>
            Mostrando orçamentos de {clienteNome || 'um cliente'}
          </Text>
          <TouchableOpacity onPress={limparFiltroCliente} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clienteBannerClear}>Limpar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* LIST */}
      {carregando ? (
        <View style={{ paddingTop: 8, paddingHorizontal: Spacing.base, gap: 10 }}>
          {[0, 1, 2].map(i => (
            <View key={i} style={styles.skeletonCard}>
              <OlliSkeleton width="55%" height={15} />
              <OlliSkeleton width="35%" height={12} style={{ marginTop: 8 }} />
              <OlliSkeleton width="40%" height={20} style={{ marginTop: 12 }} />
            </View>
          ))}
        </View>
      ) : (
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
              subtitle={
                query ? 'Nenhum resultado para sua busca.'
                  : clienteId ? `${clienteNome || 'Este cliente'} ainda não tem orçamentos. Crie o primeiro!`
                  : 'Crie seu primeiro orçamento!'
              }
              actionLabel={!query ? 'Criar orçamento' : undefined}
              onAction={!query ? () => nav.navigate('NovoOrcamento', clienteId ? { clienteId } : {}) : undefined}
            />
          }
        />
      )}

      {/* MODAL "Registrar pagamento" — rápido, direto da lista, sem gerar PDF ainda. */}
      <Modal visible={!!orcPagamento} transparent animationType="fade" onRequestClose={fecharRegistrarPagamento}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="cash-plus" size={22} color={Colors.warning} />
              <Text style={styles.modalTitle}>Registrar pagamento</Text>
              <TouchableOpacity onPress={fecharRegistrarPagamento} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close" size={20} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            {orcPagamento && (
              <Text style={styles.modalSubtitle}>
                Orçamento nº {orcPagamento.numero} · {orcPagamento.clienteNome}
              </Text>
            )}

            <OlliMoneyInput label="Valor recebido" required value={valorPagamento} onChangeValue={setValorPagamento} />
            <OlliInput label="Data do recebimento" mask="date" value={dataPagamento} onChangeText={setDataPagamento} placeholder="DD/MM/AAAA" leftIcon="calendar" />

            <Text style={styles.modalFieldLabel}>Forma de pagamento</Text>
            <View style={styles.formasGrid}>
              {FORMAS_PAGAMENTO_RAPIDO.map(f => (
                <TouchableOpacity key={f} style={[styles.formaChip, formaPagamento === f && styles.formaChipActive]} onPress={() => setFormaPagamento(f)} activeOpacity={0.8}>
                  <Text style={[styles.formaLabel, formaPagamento === f && { color: '#fff' }]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalHint}>
              O recibo em PDF pode ser gerado depois em "Emitir recibo" — o pagamento já fica registrado aqui.
            </Text>

            <OlliButton
              label="Confirmar pagamento"
              variant="success"
              size="lg"
              fullWidth
              loading={registrando}
              onPress={confirmarRegistrarPagamento}
              disabled={!valorPagamento}
              icon={<MaterialCommunityIcons name="check-circle-outline" size={20} color="#fff" />}
              style={{ marginTop: 4 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  syncPill: {
    position: 'absolute', top: 8, alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: Colors.strokeGlow,
    borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6,
    ...Shadow.sm,
  },
  syncPillText: { fontSize: 11.5, fontWeight: '700', color: Colors.accentLight },
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

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  totalLabel: { fontSize: 12.5, color: 'rgba(255,255,255,0.75)', fontWeight: '700' },
  totalValue: { fontSize: 17, color: '#fff', fontWeight: '800' },

  skeletonCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: Spacing.base },

  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.outline,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipLabel: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  chipLabelActive: { color: '#fff' },

  clienteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(52,198,217,0.10)', borderWidth: 1, borderColor: 'rgba(52,198,217,0.28)',
    borderRadius: BorderRadius.md, marginHorizontal: Spacing.base, marginBottom: 4,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  clienteBannerText: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.accentLight },
  clienteBannerClear: { fontSize: 13, fontWeight: '800', color: Colors.accent },

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

  // Badge de estado financeiro (Aguardando pagamento / Pago / Recibo emitido)
  finRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  finBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: BorderRadius.full, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  finBadgeText: { fontSize: 10.5, fontWeight: '800' },
  finReciboRef: { flex: 1, fontSize: 11, color: Colors.onSurfaceMuted },

  // Modal "Registrar pagamento"
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(6,12,22,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: Spacing.base,
  },
  modalCard: {
    width: '100%', maxWidth: 440,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.outline,
    padding: Spacing.base, ...Shadow.md,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  modalTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.onSurface },
  modalSubtitle: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginBottom: Spacing.base },
  modalFieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant, marginBottom: 4, marginTop: 8 },
  modalHint: { fontSize: 11.5, color: Colors.onSurfaceMuted, marginTop: 12, marginBottom: 4, lineHeight: 16 },

  formasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  formaChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.outline, backgroundColor: Colors.surface },
  formaChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  formaLabel: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant },
});
