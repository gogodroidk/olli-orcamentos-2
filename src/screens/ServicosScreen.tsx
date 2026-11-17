import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, Alert, Modal, ScrollView, Image, RefreshControl, Animated,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { vibrar } from '../utils/haptico';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { EmptyState } from '../components/EmptyState';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { getServicos, saveServico, deleteServico } from '../database/database';
import { onSyncAplicado } from '../services/cloudSync';
import { ServicoItem, UNIDADES } from '../types';
import { filtrarServicos, margemInfo, mensagemExcluirServico, seloMargem, textoListaServicos } from './desktop/servicoMargem';
import { formatCurrency } from '../utils/currency';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { goBackOrHome } from '../navigation/safeBack';
import { GuardaPapel } from '../components/GuardaPapel';

/**
 * Pill discreto "Sincronizando..." — some com fade sozinho depois de exibido.
 * Dá feedback visual de que a tela está de fato conectada à nuvem quando o
 * `onSyncAplicado` recarrega os dados em segundo plano.
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
      <MaterialCommunityIcons name="cloud-sync-outline" size={13} color={cores.accentLight} />
      <Text style={styles.syncPillText}>Sincronizando...</Text>
    </Animated.View>
  );
}

export default function ServicosScreen() {
  // Catálogo expõe custo/margem/lucro — valores do negócio negados ao técnico.
  return (
    <GuardaPapel acao="ver_valores_agregados" area="Serviços">
      <ServicosConteudo />
    </GuardaPapel>
  );
}

function ServicosConteudo() {
  const nav = useNavigation();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ServicoItem[]>([]);
  const [filtered, setFiltered] = useState<ServicoItem[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Partial<ServicoItem> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  // A busca vive no estado E num ref: o `load` do foco/sync é estável e precisa
  // do termo ATUAL. Fechar sobre o `query` do primeiro render zerava o filtro
  // ao voltar na aba, com o texto ainda escrito na caixa.
  const queryRef = useRef(query);
  queryRef.current = query;

  const load = useCallback(async () => {
    const all = await getServicos();
    setItems(all);
    setFiltered(filtrarServicos(all, queryRef.current));
    setCarregando(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Recarrega quando um sync com a nuvem terminar (ex.: login recém-feito
  // trazendo serviços que ainda não existiam localmente).
  useEffect(() => onSyncAplicado(() => { setSincronizando(true); void load(); }), [load]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  function aoBuscar(q: string) {
    setQuery(q);
    setFiltered(filtrarServicos(items, q));
  }

  async function handleSave() {
    if (!editing?.nome?.trim()) return;
    const s: ServicoItem = {
      id: editing.id ?? generateId(),
      nome: editing.nome!, descricao: editing.descricao,
      preco: editing.preco ?? 0, custo: editing.custo,
      unidade: editing.unidade ?? 'un', fotoUri: editing.fotoUri,
      criadoEm: editing.criadoEm ?? nowISO(),
    };

    if (s.preco <= 0) {
      Alert.alert(
        'Preço zerado',
        'Este serviço está com preço R$ 0,00. Se for adicionado a um orçamento assim, o cliente não pagará nada por ele. Deseja salvar mesmo assim?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Salvar assim mesmo', style: 'destructive', onPress: () => void persistServico(s) },
        ]
      );
      return;
    }
    await persistServico(s);
  }

  async function persistServico(s: ServicoItem) {
    setSalvando(true);
    try {
      await saveServico(s);
      vibrar('sucesso');
      setEditing(null);
      load();
    } catch {
      vibrar('erro');
      Alert.alert('Erro', 'Não foi possível salvar o serviço agora. Tente novamente.');
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
      <GradientHeader title="Serviços" subtitle={`${items.length} no catálogo`} onBack={() => goBackOrHome(nav)}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={cores.onSurfaceVariant} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar serviço..."
            value={query}
            onChangeText={aoBuscar}
            placeholderTextColor={cores.onSurfaceMuted}
            accessibilityLabel="Buscar serviço"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => aoBuscar('')} accessibilityRole="button" accessibilityLabel="Limpar busca" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close-circle" size={18} color={cores.onSurfaceMuted} />
            </TouchableOpacity>
          )}
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
        keyExtractor={s => s.id}
        contentContainerStyle={{ paddingTop: Spacing.base, paddingHorizontal: Spacing.base, gap: 10, flexGrow: 1, paddingBottom: Spacing.base + insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[cores.primary]} tintColor={cores.primary} />}
        renderItem={({ item: s, index }) => {
          const selo = seloMargem(s.preco, s.custo);
          const precoZerado = !(s.preco > 0);
          return (
          <AnimatedEntrance index={index}>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardCorpo}
                onPress={() => setEditing({ ...s })}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${s.nome}`}
                activeOpacity={0.75}
              >
                {s.fotoUri ? <Image source={{ uri: s.fotoUri }} style={styles.thumb} /> : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]}><MaterialCommunityIcons name="wrench" size={22} color={cores.primary} /></View>
                )}
                <View style={styles.cardTextos}>
                  <Text style={styles.name}>{s.nome}</Text>
                  {s.descricao ? <Text style={styles.desc} numberOfLines={1}>{s.descricao}</Text> : null}
                  <View style={styles.tagsRow}>
                    <Text style={[styles.price, precoZerado && styles.priceZerado]}>{formatCurrency(s.preco)} / {s.unidade}</Text>
                    {selo && (
                      <View style={[styles.margemTag, selo.tom === 'prejuizo' && styles.margemTagPrejuizo]}>
                        <Text style={[styles.margemText, selo.tom === 'prejuizo' && styles.margemTextPrejuizo]}>{selo.texto}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Alert.alert(
                  'Excluir serviço',
                  mensagemExcluirServico(s.nome),
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Excluir', style: 'destructive', onPress: async () => { try { await deleteServico(s.id); void load(); } catch { Alert.alert('Erro', 'Não foi possível excluir o serviço agora. Tente novamente.'); } } },
                  ],
                )}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Excluir ${s.nome}`}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={cores.danger} />
              </TouchableOpacity>
            </View>
          </AnimatedEntrance>
          );
        }}
        ListEmptyComponent={(() => {
          const texto = textoListaServicos(items.length, filtered.length, query);
          if (texto.estado === 'sem-resultado') {
            return <EmptyState icon="magnify" title={texto.titulo} subtitle={texto.subtitulo} actionLabel="Limpar busca" onAction={() => aoBuscar('')} />;
          }
          return <EmptyState icon="wrench-outline" title={texto.titulo} subtitle={texto.subtitulo} actionLabel="Novo serviço" onAction={() => setEditing({ unidade: 'un', preco: 0 })} />;
        })()}
      />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => setEditing({ unidade: 'un', preco: 0 })}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Novo serviço"
      >
        <MaterialCommunityIcons name="plus" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        {editing && (
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing.id ? 'Editar Serviço' : 'Novo Serviço'}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fechar" onPress={() => setEditing(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><MaterialCommunityIcons name="close" size={26} color={cores.onSurface} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={styles.fotoBtn} onPress={pickFoto} activeOpacity={0.8}>
                {editing.fotoUri ? <Image source={{ uri: editing.fotoUri }} style={styles.fotoPreview} /> : (
                  <><MaterialCommunityIcons name="camera-plus-outline" size={30} color={cores.primary} /><Text style={styles.fotoBtnLabel}>Adicionar foto</Text></>
                )}
              </TouchableOpacity>
              <OlliInput label="Nome do serviço" required value={editing.nome ?? ''} onChangeText={v => setEditing(p => p ? { ...p, nome: v } : p)} placeholder="Ex: Instalação de ar condicionado" />
              <OlliInput label="Descrição" value={editing.descricao ?? ''} onChangeText={v => setEditing(p => p ? { ...p, descricao: v } : p)} placeholder="O que está incluso" multiline />
              <View style={styles.rowFields}>
                <OlliMoneyInput label="Preço de venda" value={editing.preco ?? 0} onChangeValue={v => setEditing(p => p ? { ...p, preco: v } : p)} containerStyle={{ flex: 1, marginRight: 10 }} />
                <OlliMoneyInput label="Custo (opcional)" value={editing.custo ?? 0} onChangeValue={v => setEditing(p => p ? { ...p, custo: v || undefined } : p)} containerStyle={{ flex: 1 }} />
              </View>
              {seloMargem(editing.preco, editing.custo)?.tom === 'prejuizo' && (
                <View style={styles.prejuizoBanner}>
                  <MaterialCommunityIcons name="trending-down" size={18} color={cores.warning} />
                  <Text style={styles.prejuizoBannerText}>
                    Preço abaixo do custo · {seloMargem(editing.preco, editing.custo)?.texto} · você perde {formatCurrency((editing.custo ?? 0) - (editing.preco ?? 0))} por {editing.unidade ?? 'un'}. Dá para salvar — confira se é isso que você quer.
                  </Text>
                </View>
              )}
              {seloMargem(editing.preco, editing.custo)?.tom === 'lucro' && margemInfo(editing.preco, editing.custo) && (
                <View style={styles.margemBanner}>
                  <MaterialCommunityIcons name="trending-up" size={18} color={cores.success} />
                  <Text style={styles.margemBannerText}>Margem de {margemInfo(editing.preco, editing.custo)?.pct}% · Lucro {formatCurrency(margemInfo(editing.preco, editing.custo)?.lucro ?? 0)}</Text>
                </View>
              )}
              {!editing.preco && (
                <View style={styles.avisoBanner}>
                  <MaterialCommunityIcons name="alert-outline" size={18} color={cores.danger} />
                  <Text style={styles.avisoBannerText}>Preço zerado — este serviço entrará de graça em qualquer orçamento.</Text>
                </View>
              )}
              <Text style={styles.unidadeLabel}>Unidade de medida</Text>
              <View style={styles.unidadesRow}>
                {UNIDADES.map(u => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unidade, editing.unidade === u && styles.unidadeActive]}
                    onPress={() => setEditing(p => p ? { ...p, unidade: u } : p)}
                    accessibilityRole="button"
                    accessibilityLabel={`Unidade ${u}`}
                    accessibilityState={{ selected: editing.unidade === u }}
                  >
                    <Text style={[styles.unidadeText, editing.unidade === u && styles.unidadeTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={[styles.modalFooter, { paddingBottom: insets.bottom + Spacing.base }]}>
              <OlliButton label="Salvar serviço" variant="gradient" size="lg" fullWidth loading={salvando} onPress={handleSave} disabled={!editing.nome?.trim() || salvando} icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />} />
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  // Toast/pill flutuante — convenção de "chip escuro" fixa (snackbar),
  // independente do tema. Mantido.
  syncPill: {
    position: 'absolute', top: 8, alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: c.strokeGlow,
    borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6,
    ...sombrasDe(c).sm,
  },
  syncPillText: { fontSize: 13, fontWeight: '700', color: c.accentLight },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.lg, paddingHorizontal: 14, paddingVertical: 11, gap: 8, marginTop: 14, borderWidth: 1, borderColor: c.outline },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, ...sombrasDe(c).sm },
  cardCorpo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  cardTextos: { flex: 1, marginLeft: 12 },
  thumb: { width: 52, height: 52, borderRadius: BorderRadius.md },
  thumbPlaceholder: { backgroundColor: c.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  desc: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  price: { fontSize: 13, color: c.primary, fontWeight: '700' },
  priceZerado: { color: c.danger },
  margemTag: { backgroundColor: c.successLight, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  margemTagPrejuizo: { backgroundColor: c.dangerLight },
  margemText: { fontSize: 13, color: c.success, fontWeight: '700' },
  margemTextPrejuizo: { color: c.danger },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center', ...sombrasDe(c).lg, shadowColor: c.primary, shadowOpacity: 0.4 },
  modal: { flex: 1, backgroundColor: c.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.outline },
  modalTitle: { fontSize: 20, fontWeight: '800', color: c.onSurface },
  modalFooter: { padding: Spacing.base, paddingBottom: 28, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  fotoBtn: { height: 120, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: c.primary, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.base, overflow: 'hidden', backgroundColor: c.primaryContainer + '40' },
  fotoPreview: { width: '100%', height: '100%' },
  fotoBtnLabel: { fontSize: 13, color: c.primary, fontWeight: '700', marginTop: 4 },
  margemBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.successLight, borderRadius: BorderRadius.md, padding: 12, marginBottom: Spacing.base },
  margemBannerText: { fontSize: 13, color: c.success, fontWeight: '700', flex: 1 },
  prejuizoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.warningLight, borderRadius: BorderRadius.md, padding: 12, marginBottom: Spacing.base },
  prejuizoBannerText: { fontSize: 13, color: c.warning, fontWeight: '700', flex: 1 },
  avisoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.danger + '1A', borderRadius: BorderRadius.md, padding: 12, marginBottom: Spacing.base, borderWidth: 1, borderColor: c.danger + '40' },
  avisoBannerText: { fontSize: 13, color: c.danger, fontWeight: '700', flex: 1 },
  unidadeLabel: { fontSize: 13, fontWeight: '600', color: c.onSurfaceVariant, marginBottom: 8 },
  unidadesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unidade: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: c.outline },
  unidadeActive: { backgroundColor: c.primary, borderColor: c.primary },
  unidadeText: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant },
  unidadeTextActive: { color: c.onPrimary },
  rowFields: { flexDirection: 'row' },
});
