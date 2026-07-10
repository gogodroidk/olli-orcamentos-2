import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, Alert, RefreshControl, Animated, Modal,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useGradientes, useEstilos, sombrasDe, comAlfa, sobreSecundario, type Cores } from '../theme';
import { OlliCard } from '../components/OlliCard';
import { GradientHeader } from '../components/GradientHeader';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { DicaContextual } from '../components/DicaContextual';
import { CountUp } from '../components/CountUp';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { OlliButton } from '../components/OlliButton';
import { getOrcamentos, deleteOrcamento, saveOrcamento, getNextOrcamentoNumber, getRecibos } from '../database/database';
import { sincronizarStatusLinks } from '../services/clienteLink';
import { onSyncAplicado } from '../services/cloudSync';
import { getStatusFinanceiro, getBadgeFinanceiro, getReciboDoOrcamento, registrarPagamento, StatusFinanceiro } from '../services/pagamentos';
import { DIAS_RETENCAO_LIXEIRA } from '../services/lixeira';
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
  const styles = useEstilos(criarEstilos);
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
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
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
      <MaterialCommunityIcons
        name="cloud-sync-outline"
        size={13}
        color={cores.accent} // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 2.88:1 (7.25:1)
      />
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
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
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
  // Modo de seleção múltipla (exclusão em lote para a Lixeira).
  const [selecionando, setSelecionando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

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
      `O orçamento nº ${o.numero} de ${o.clienteNome} vai para a Lixeira. Você pode restaurá-lo por ${DIAS_RETENCAO_LIXEIRA} dias.`,
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

  // ─── MODO DE SELEÇÃO MÚLTIPLA (exclusão em lote → Lixeira) ─────────────────
  function entrarSelecao(inicialId?: string) {
    setSelecionando(true);
    setSelecionados(inicialId ? new Set([inicialId]) : new Set());
  }

  function sairSelecao() {
    setSelecionando(false);
    setSelecionados(new Set());
  }

  function alternarSelecao(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selecionarTodos() {
    setSelecionados(new Set(filtered.map(o => o.id)));
  }

  function handleExcluirSelecionados() {
    const ids = Array.from(selecionados);
    if (!ids.length) return;
    Alert.alert(
      'Excluir selecionados',
      `${ids.length} orçamento${ids.length === 1 ? '' : 's'} ${ids.length === 1 ? 'vai' : 'vão'} para a Lixeira. Você pode restaurar por ${DIAS_RETENCAO_LIXEIRA} dias.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: async () => {
            try {
              for (const id of ids) {
                try { await deleteOrcamento(id); } catch { /* pula um; segue o lote */ }
              }
            } finally {
              sairSelecao();
              await load();
            }
          },
        },
      ],
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
    const marcado = selecionados.has(o.id);

    return (
      <AnimatedEntrance index={index}>
        <OlliCard
          onPress={() => selecionando ? alternarSelecao(o.id) : nav.navigate('VisualizarOrcamento', { orcamentoId: o.id })}
          variant={selecionando && marcado ? 'selected' : 'default'}
          style={{ marginHorizontal: Spacing.base, marginBottom: 10 }}
        >
          <View style={styles.itemHeader}>
            {selecionando && (
              <MaterialCommunityIcons
                name={marcado ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={22}
                color={marcado ? cores.accent : cores.onSurfaceMuted}
                style={{ marginRight: 12, marginTop: 2 }}
              />
            )}
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

          {/* Em modo de seleção as ações somem — o card inteiro vira alvo do toque. */}
          {!selecionando && (
            <View style={styles.itemActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => nav.navigate('EditarOrcamento', { orcamentoId: o.id })}>
                <MaterialCommunityIcons name="pencil-outline" size={16} color={cores.primary} />
                <Text style={[styles.actionLabel, { color: cores.primary }]}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleClone(o)}>
                <MaterialCommunityIcons name="content-copy" size={16} color={cores.secondary} />
                <Text style={[styles.actionLabel, { color: cores.secondary }]}>Clonar</Text>
              </TouchableOpacity>
              {statusFinanceiro === 'aguardando_pagamento' ? (
                <TouchableOpacity style={styles.actionBtn} onPress={() => abrirRegistrarPagamento(o)}>
                  <MaterialCommunityIcons name="cash-plus" size={16} color={cores.warning} />
                  <Text style={[styles.actionLabel, { color: cores.warning }]}>Pagamento</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.actionBtn} onPress={() => nav.navigate('EmitirRecibo', { orcamentoId: o.id })}>
                  <MaterialCommunityIcons name="receipt" size={16} color={cores.success} />
                  <Text style={[styles.actionLabel, { color: cores.success }]}>Recibo</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(o)}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color={cores.danger} />
                <Text style={[styles.actionLabel, { color: cores.danger }]}>Excluir</Text>
              </TouchableOpacity>
            </View>
          )}
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
          <MaterialCommunityIcons name="magnify" size={20} color={cores.onSurfaceVariant} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por cliente ou número..."
            value={query}
            onChangeText={handleSearch}
            placeholderTextColor={cores.onSurfaceMuted}
          />
          {query ? (
            <TouchableOpacity onPress={() => handleSearch('')} accessibilityRole="button" accessibilityLabel="Limpar busca">
              <MaterialCommunityIcons name="close-circle" size={18} color={cores.onSurfaceMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: sobreSecundario(gradientes.sobreHeader, gradientes.header) }]}>{filtered.length} orçamento{filtered.length !== 1 ? 's' : ''}</Text>
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

      {/* DICA (1º uso) — o que o status significa e como ele anda sozinho. O link
          do cliente é gerado ao abrir o orçamento (gerarLinkOrcamento) e o status
          local avança quando o cliente responde (sincronizarStatusLinks, no foco). */}
      <View style={{ paddingHorizontal: Spacing.base }}>
        <DicaContextual
          id="orcamentos.status-link"
          icon="link-variant"
          texto="O status mostra em que pé está cada proposta. Abra um orçamento para enviar o link ao cliente: quando ele aprova por lá, o status atualiza sozinho aqui."
        />
      </View>

      {/* BANNER DE FILTRO POR CLIENTE (CRM) */}
      {clienteId && (
        <View style={styles.clienteBanner}>
          <MaterialCommunityIcons name="account-filter-outline" size={18} color={cores.accentLight} />
          <Text style={styles.clienteBannerText} numberOfLines={1}>
            Mostrando orçamentos de {clienteNome || 'um cliente'}
          </Text>
          <TouchableOpacity onPress={limparFiltroCliente} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clienteBannerClear}>Limpar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* TOOLBAR DE SELEÇÃO — "Selecionar" (entrada) ou controles do modo lote */}
      {!carregando && filtered.length > 0 && (
        <View style={styles.selToolbar}>
          {selecionando ? (
            <>
              <TouchableOpacity onPress={sairSelecao} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Cancelar seleção">
                <Text style={styles.selCancel}>Cancelar</Text>
              </TouchableOpacity>
              <Text style={styles.selCount}>{selecionados.size} selecionado{selecionados.size === 1 ? '' : 's'}</Text>
              <TouchableOpacity onPress={selecionarTodos} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Selecionar todos">
                <Text style={styles.selAll}>Selecionar todos</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.selEnter} onPress={() => entrarSelecao()} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Selecionar para excluir vários">
              <MaterialCommunityIcons name="checkbox-multiple-marked-outline" size={16} color={cores.accentLight} />
              <Text style={styles.selEnterLabel}>Selecionar</Text>
            </TouchableOpacity>
          )}
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
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: selecionando ? 104 : 80, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[cores.primary]} />}
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
              <MaterialCommunityIcons name="cash-plus" size={22} color={cores.warning} />
              <Text style={styles.modalTitle}>Registrar pagamento</Text>
              <TouchableOpacity onPress={fecharRegistrarPagamento} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close" size={20} color={cores.onSurfaceVariant} />
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
                  <Text style={[styles.formaLabel, formaPagamento === f && { color: cores.onPrimary }]}>{f}</Text>
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

      {/* BARRA DE AÇÃO — excluir selecionados (vai para a Lixeira) */}
      {selecionando && selecionados.size > 0 && (
        <View style={styles.bulkBar}>
          <OlliButton
            label={`Excluir ${selecionados.size} para a Lixeira`}
            variant="danger"
            size="lg"
            fullWidth
            onPress={handleExcluirSelecionados}
            icon={<MaterialCommunityIcons name="trash-can-outline" size={20} color="#fff" />}
          />
        </View>
      )}
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  syncPill: {
    position: 'absolute', top: 8, alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    // Toast/pill flutuante — convenção de "chip escuro" fixa (como um snackbar),
    // independente do tema; não é uma superfície da tela. Mantido.
    backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: c.strokeGlow,
    borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6,
    ...sombrasDe(c).sm,
  },
  syncPillText: { fontSize: 11.5, fontWeight: '700', color: c.accent }, // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 2.88:1 (7.25:1)
  newBtn: {
    // Botão dentro do GradientHeader (sempre colorido, nos dois modos) —
    // glass branco translúcido, mesma convenção do próprio GradientHeader.
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  newBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.surfaceVariant,
    borderWidth: 1, borderColor: c.outline,
    marginTop: 14, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface },

  // totalRow vive dentro do GradientHeader — texto branco fixo, mesma
  // convenção do header (sempre colorido, independente do tema).
  // totalLabel: sem cor aqui — é texto SECUNDÁRIO sobre o gradiente do header,
  // aplicada inline com sobreSecundario(gradientes.sobreHeader, gradientes.header)
  // no ponto de uso. rgba(255,255,255,0.75) fixo media 3.52:1 contra a ponta clara
  // do header (gradientes.header[0] = #0B6FCE) — reprova o alvo de 4.5:1.
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  totalLabel: { fontSize: 12.5, fontWeight: '700' },
  totalValue: { fontSize: 17, color: '#fff', fontWeight: '800' },

  skeletonCard: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.base },

  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.outline,
  },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipLabel: { fontSize: 12, fontWeight: '600', color: c.onSurfaceVariant },
  // Era '#fff' fixo sobre fundo chapado c.primary — vira onPrimary (contraste
  // calculado), correto pra qualquer cor de marca escolhida pelo usuário.
  chipLabelActive: { color: c.onPrimary },

  // rgba(52,198,217,x) era o accent estático — vira o accent do tema.
  clienteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: comAlfa(c.accent, 0.10), borderWidth: 1, borderColor: comAlfa(c.accent, 0.28),
    borderRadius: BorderRadius.md, marginHorizontal: Spacing.base, marginBottom: 4,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  clienteBannerText: { flex: 1, fontSize: 13, fontWeight: '700', color: c.accentLight },
  clienteBannerClear: { fontSize: 13, fontWeight: '800', color: c.accentLight },

  // Toolbar / barra do modo de seleção múltipla
  selToolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingBottom: 6, paddingTop: 2,
  },
  selEnter: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: comAlfa(c.accent, 0.10), borderWidth: 1, borderColor: comAlfa(c.accent, 0.30),
  },
  selEnterLabel: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  selCancel: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant },
  selCount: { fontSize: 13, fontWeight: '800', color: c.onSurface },
  selAll: { fontSize: 13, fontWeight: '800', color: c.accentLight },
  bulkBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: Spacing.base, paddingTop: 10, paddingBottom: 22,
    // rgba(7,17,31,x) é um preto-azulado fixo (bandeja de ação sempre escura,
    // como o rodapé de um bottom sheet); sem equivalente semântico direto no
    // tema — mantido. borda continua no strokeGlow do tema.
    backgroundColor: 'rgba(7,17,31,0.98)', borderTopWidth: 1, borderTopColor: c.strokeGlow,
  },

  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemNome: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  itemMeta: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  itemValor: { fontSize: 15, fontWeight: '700', color: c.primary, marginBottom: 4 },

  itemActions: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.outline,
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
  finReciboRef: { flex: 1, fontSize: 11, color: c.onSurfaceMuted },

  // Modal "Registrar pagamento"
  modalBackdrop: {
    // Scrim padrão de modal — sempre escuro, convenção universal de overlay
    // (independe do tema da tela por baixo). Mantido.
    flex: 1, backgroundColor: 'rgba(6,12,22,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: Spacing.base,
  },
  modalCard: {
    width: '100%', maxWidth: 440,
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline,
    padding: Spacing.base, ...sombrasDe(c).md,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  modalTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: c.onSurface },
  modalSubtitle: { fontSize: 12.5, color: c.onSurfaceVariant, marginBottom: Spacing.base },
  modalFieldLabel: { fontSize: 13, fontWeight: '600', color: c.onSurfaceVariant, marginBottom: 4, marginTop: 8 },
  modalHint: { fontSize: 11.5, color: c.onSurfaceMuted, marginTop: 12, marginBottom: 4, lineHeight: 16 },

  formasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  formaChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface },
  formaChipActive: { backgroundColor: c.primary, borderColor: c.primary },
  formaLabel: { fontSize: 13, fontWeight: '600', color: c.onSurfaceVariant },
});
