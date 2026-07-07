import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, Alert, Modal, ScrollView, Image, RefreshControl, Animated,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { EmptyState } from '../components/EmptyState';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { getProdutos, saveProduto, deleteProduto } from '../database/database';
import { onSyncAplicado } from '../services/cloudSync';
import { ProdutoItem, UNIDADES } from '../types';
import { formatCurrency } from '../utils/currency';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { goBackOrHome } from '../navigation/safeBack';

function margemPct(preco?: number, custo?: number): string | null {
  if (!preco || !custo || custo === 0) return null;
  return `${Math.round(((preco - custo) / preco) * 100)}%`;
}

/**
 * Pill discreto "Sincronizando..." — some com fade sozinho depois de exibido.
 * Dá feedback visual de que a tela está de fato conectada à nuvem quando o
 * `onSyncAplicado` recarrega os dados em segundo plano.
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

export default function ProdutosScreen() {
  const nav = useNavigation();
  const [items, setItems] = useState<ProdutoItem[]>([]);
  const [filtered, setFiltered] = useState<ProdutoItem[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Partial<ProdutoItem> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  // Recarrega quando um sync com a nuvem terminar (ex.: login recém-feito
  // trazendo produtos que ainda não existiam localmente).
  useEffect(() => onSyncAplicado(() => { setSincronizando(true); load(); }), []);

  async function load() {
    const all = await getProdutos();
    setItems(all);
    applyFilter(all, query);
    setCarregando(false);
  }

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  function applyFilter(data: ProdutoItem[], q: string) {
    if (!q.trim()) { setFiltered(data); return; }
    const lower = q.toLowerCase();
    setFiltered(data.filter(p =>
      p.nome.toLowerCase().includes(lower) ||
      (p.descricao ?? '').toLowerCase().includes(lower) ||
      (p.marca ?? '').toLowerCase().includes(lower) ||
      (p.modelo ?? '').toLowerCase().includes(lower)
    ));
  }

  async function handleSave() {
    if (!editing?.nome?.trim()) return;
    const p: ProdutoItem = {
      id: editing.id ?? generateId(),
      nome: editing.nome!, descricao: editing.descricao,
      preco: editing.preco ?? 0, custo: editing.custo,
      marca: editing.marca, modelo: editing.modelo,
      unidade: editing.unidade ?? 'un', fotoUri: editing.fotoUri,
      criadoEm: editing.criadoEm ?? nowISO(),
    };

    if (p.preco <= 0) {
      Alert.alert(
        'Preço zerado',
        'Este produto está com preço R$ 0,00. Se for adicionado a um orçamento assim, o cliente não pagará nada por ele. Deseja salvar mesmo assim?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Salvar assim mesmo', style: 'destructive', onPress: () => void persistProduto(p) },
        ]
      );
      return;
    }
    await persistProduto(p);
  }

  async function persistProduto(p: ProdutoItem) {
    setSalvando(true);
    try {
      await saveProduto(p);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setEditing(null);
      load();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Erro', 'Não foi possível salvar o produto agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function pickFoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permissão', 'Permita o acesso às fotos.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!r.canceled) setEditing(p => p ? { ...p, fotoUri: r.assets[0].uri } : p);
  }

  return (
    <View style={styles.container}>
      {sincronizando && <SincronizandoPill onDone={() => setSincronizando(false)} />}
      <GradientHeader title="Produtos" subtitle={`${items.length} no catálogo`} onBack={() => goBackOrHome(nav)}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={Colors.onSurfaceVariant} />
          <TextInput style={styles.searchInput} placeholder="Buscar produto..." value={query} onChangeText={q => { setQuery(q); applyFilter(items, q); }} placeholderTextColor={Colors.onSurfaceMuted} />
        </View>
      </GradientHeader>

      {carregando ? (
        <View style={{ padding: Spacing.base, gap: 10 }}>
          {[0, 1, 2].map(i => (
            <View key={i} style={styles.card}>
              <OlliSkeleton width={52} height={52} radius={BorderRadius.md} />
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <OlliSkeleton width="60%" height={14} />
                <OlliSkeleton width="35%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ) : (
      <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        contentContainerStyle={{ padding: Spacing.base, gap: 10, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Colors.primary]} tintColor={Colors.primary} />}
        renderItem={({ item: p, index }) => (
          <AnimatedEntrance index={index}>
            <View style={styles.card}>
              {p.fotoUri ? <Image source={{ uri: p.fotoUri }} style={styles.thumb} /> : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}><MaterialCommunityIcons name="package-variant" size={22} color={Colors.primary} /></View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name}>{p.nome}</Text>
                {(p.marca || p.modelo) ? <Text style={styles.desc}>{[p.marca, p.modelo].filter(Boolean).join(' · ')}</Text> : null}
                <View style={styles.tagsRow}>
                  <Text style={styles.price}>{formatCurrency(p.preco)} / {p.unidade}</Text>
                  {margemPct(p.preco, p.custo) && (
                    <View style={styles.margemTag}><Text style={styles.margemText}>lucro {margemPct(p.preco, p.custo)}</Text></View>
                  )}
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => setEditing({ ...p })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><MaterialCommunityIcons name="pencil-outline" size={20} color={Colors.primary} /></TouchableOpacity>
                <TouchableOpacity onPress={() => Alert.alert('Excluir', `Excluir "${p.nome}"?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Excluir', style: 'destructive', onPress: async () => { try { await deleteProduto(p.id); load(); } catch { Alert.alert('Erro', 'Não foi possível excluir o produto agora. Tente novamente.'); } } }])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          </AnimatedEntrance>
        )}
        ListEmptyComponent={<EmptyState icon="package-variant-closed" title="Nenhum produto" subtitle="Cadastre peças e materiais para incluir nos orçamentos." actionLabel="Novo produto" onAction={() => setEditing({ unidade: 'un', preco: 0 })} />}
      />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setEditing({ unidade: 'un', preco: 0 })} activeOpacity={0.85}>
        <MaterialCommunityIcons name="plus" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        {editing && (
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing.id ? 'Editar Produto' : 'Novo Produto'}</Text>
              <TouchableOpacity onPress={() => setEditing(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><MaterialCommunityIcons name="close" size={26} color={Colors.onSurface} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={styles.fotoBtn} onPress={pickFoto} activeOpacity={0.8}>
                {editing.fotoUri ? <Image source={{ uri: editing.fotoUri }} style={styles.fotoPreview} /> : (
                  <><MaterialCommunityIcons name="camera-plus-outline" size={30} color={Colors.primary} /><Text style={styles.fotoBtnLabel}>Adicionar foto</Text></>
                )}
              </TouchableOpacity>
              <OlliInput label="Nome do produto" required value={editing.nome ?? ''} onChangeText={v => setEditing(p => p ? { ...p, nome: v } : p)} placeholder="Ex: Fluido refrigerante R-410A" />
              <OlliInput label="Descrição" value={editing.descricao ?? ''} onChangeText={v => setEditing(p => p ? { ...p, descricao: v } : p)} placeholder="Especificação do produto" multiline />
              <View style={styles.rowFields}>
                <OlliInput label="Marca" value={editing.marca ?? ''} onChangeText={v => setEditing(p => p ? { ...p, marca: v } : p)} placeholder="Ex: Midea" containerStyle={{ flex: 1, marginRight: 10 }} />
                <OlliInput label="Modelo" value={editing.modelo ?? ''} onChangeText={v => setEditing(p => p ? { ...p, modelo: v } : p)} placeholder="Ex: 12.000 BTUs" containerStyle={{ flex: 1 }} />
              </View>
              <View style={styles.rowFields}>
                <OlliMoneyInput label="Preço de venda" value={editing.preco ?? 0} onChangeValue={v => setEditing(p => p ? { ...p, preco: v } : p)} containerStyle={{ flex: 1, marginRight: 10 }} />
                <OlliMoneyInput label="Custo (opcional)" value={editing.custo ?? 0} onChangeValue={v => setEditing(p => p ? { ...p, custo: v || undefined } : p)} containerStyle={{ flex: 1 }} />
              </View>
              {margemPct(editing.preco, editing.custo) && (
                <View style={styles.margemBanner}>
                  <MaterialCommunityIcons name="trending-up" size={18} color={Colors.success} />
                  <Text style={styles.margemBannerText}>Margem de {margemPct(editing.preco, editing.custo)} · Lucro {formatCurrency((editing.preco ?? 0) - (editing.custo ?? 0))}</Text>
                </View>
              )}
              {!editing.preco && (
                <View style={styles.avisoBanner}>
                  <MaterialCommunityIcons name="alert-outline" size={18} color={Colors.danger} />
                  <Text style={styles.avisoBannerText}>Preço zerado — este produto entrará de graça em qualquer orçamento.</Text>
                </View>
              )}
              <Text style={styles.unidadeLabel}>Unidade de medida</Text>
              <View style={styles.unidadesRow}>
                {UNIDADES.map(u => (
                  <TouchableOpacity key={u} style={[styles.unidade, editing.unidade === u && styles.unidadeActive]} onPress={() => setEditing(p => p ? { ...p, unidade: u } : p)}>
                    <Text style={[styles.unidadeText, editing.unidade === u && { color: Colors.onSurface }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <OlliButton label="Salvar produto" variant="gradient" size="lg" fullWidth loading={salvando} onPress={handleSave} disabled={!editing.nome?.trim() || salvando} icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />} />
            </View>
          </View>
        )}
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
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.lg, paddingHorizontal: 14, paddingVertical: 11, gap: 8, marginTop: 14, borderWidth: 1, borderColor: Colors.outline },
  searchInput: { flex: 1, fontSize: 15, color: Colors.onSurface },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, ...Shadow.sm },
  thumb: { width: 52, height: 52, borderRadius: BorderRadius.md },
  thumbPlaceholder: { backgroundColor: Colors.surfaceVariant, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.outline },
  name: { fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  desc: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  price: { fontSize: 13, color: Colors.primary, fontWeight: '700' },
  margemTag: { backgroundColor: Colors.successLight, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  margemText: { fontSize: 11, color: Colors.success, fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 16, marginLeft: 8 },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', ...Shadow.lg, shadowColor: Colors.primary, shadowOpacity: 0.4 },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.onSurface },
  modalFooter: { padding: Spacing.base, paddingBottom: 28, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.outline },
  fotoBtn: { height: 120, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.base, overflow: 'hidden', backgroundColor: Colors.surfaceVariant },
  fotoPreview: { width: '100%', height: '100%' },
  fotoBtnLabel: { fontSize: 13, color: Colors.primary, fontWeight: '700', marginTop: 4 },
  margemBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.successLight, borderRadius: BorderRadius.md, padding: 12, marginBottom: Spacing.base },
  margemBannerText: { fontSize: 13, color: Colors.success, fontWeight: '700' },
  avisoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.danger + '1A', borderRadius: BorderRadius.md, padding: 12, marginBottom: Spacing.base, borderWidth: 1, borderColor: Colors.danger + '40' },
  avisoBannerText: { fontSize: 13, color: Colors.danger, fontWeight: '700', flex: 1 },
  unidadeLabel: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant, marginBottom: 8 },
  unidadesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unidade: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: Colors.outline },
  unidadeActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  unidadeText: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant },
  rowFields: { flexDirection: 'row' },
});
