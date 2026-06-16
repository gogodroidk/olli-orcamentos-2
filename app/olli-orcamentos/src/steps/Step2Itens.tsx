import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, FlatList, Modal, Alert, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { Orcamento, ItemOrcamento, ServicoItem, ProdutoItem, UNIDADES } from '../types';
import { searchServicos, searchProdutos } from '../database/database';
import { formatCurrency, formatQty, parseNumber } from '../utils/currency';
import { generateId } from '../utils/id';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { OlliButton } from '../components/OlliButton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';

interface Props {
  orc: Orcamento;
  onChangeItens: (itens: ItemOrcamento[]) => void;
  onChangeOrc: (partial: Partial<Orcamento>) => void;
}

type Tab = 'servico' | 'produto';

export default function Step2Itens({ orc, onChangeItens, onChangeOrc }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('servico');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<(ServicoItem | ProdutoItem)[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemOrcamento | null>(null);
  const [isNewItem, setIsNewItem] = useState(false);

  const handleCatalogSearch = useCallback(async (q: string) => {
    setCatalogQuery(q);
    if (q.length < 1) { setCatalogResults([]); return; }
    setCatalogResults(activeTab === 'servico' ? await searchServicos(q) : await searchProdutos(q));
  }, [activeTab]);

  function addFromCatalog(item: ServicoItem | ProdutoItem) {
    Haptics.selectionAsync().catch(() => {});
    const exists = orc.itens.find(i => i.catalogoId === item.id && i.tipo === activeTab);
    if (exists) {
      onChangeItens(orc.itens.map(i =>
        i.catalogoId === item.id && i.tipo === activeTab
          ? { ...i, quantidade: i.quantidade + 1, subtotal: i.preco * (i.quantidade + 1) }
          : i
      ));
    } else {
      onChangeItens([...orc.itens, {
        id: generateId(), tipo: activeTab, catalogoId: item.id,
        nome: item.nome, descricao: item.descricao, preco: item.preco,
        quantidade: 1, unidade: item.unidade, fotoUri: item.fotoUri, subtotal: item.preco,
      }]);
    }
    setShowCatalog(false); setCatalogQuery(''); setCatalogResults([]);
  }

  function addManual() {
    setIsNewItem(true);
    setEditingItem({
      id: generateId(), tipo: activeTab, catalogoId: '',
      nome: '', preco: 0, quantidade: 1, unidade: 'un', subtotal: 0,
    });
  }

  function removeItem(id: string) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    onChangeItens(orc.itens.filter(i => i.id !== id));
  }

  function updateQty(id: string, qty: number) {
    if (qty <= 0) { removeItem(id); return; }
    onChangeItens(orc.itens.map(i => i.id === id ? { ...i, quantidade: qty, subtotal: i.preco * qty } : i));
  }

  function saveEditingItem() {
    if (!editingItem || !editingItem.nome.trim()) return;
    const withSub = { ...editingItem, subtotal: editingItem.preco * editingItem.quantidade };
    const exists = orc.itens.find(i => i.id === editingItem.id);
    onChangeItens(exists ? orc.itens.map(i => i.id === editingItem.id ? withSub : i) : [...orc.itens, withSub]);
    setEditingItem(null);
  }

  const tabItens = orc.itens.filter(i => i.tipo === activeTab);
  const tabTotal = tabItens.reduce((s, i) => s + i.subtotal, 0);
  const servCount = orc.itens.filter(i => i.tipo === 'servico').length;
  const prodCount = orc.itens.filter(i => i.tipo === 'produto').length;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* TABS */}
      <View style={styles.tabs}>
        <TabButton label="Serviços" count={servCount} icon="wrench" active={activeTab === 'servico'} onPress={() => setActiveTab('servico')} />
        <TabButton label="Produtos" count={prodCount} icon="package-variant" active={activeTab === 'produto'} onPress={() => setActiveTab('produto')} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* LISTA */}
        {tabItens.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name={activeTab === 'servico' ? 'wrench-outline' : 'package-variant-closed'} size={44} color={Colors.onSurfaceMuted} />
            <Text style={styles.emptyText}>Nenhum {activeTab === 'servico' ? 'serviço' : 'produto'} adicionado</Text>
          </View>
        ) : tabItens.map((item, idx) => (
          <AnimatedEntrance key={item.id} index={idx}>
            <View style={styles.itemCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{item.nome}</Text>
                {item.descricao ? <Text style={styles.itemDesc} numberOfLines={1}>{item.descricao}</Text> : null}
                <Text style={styles.itemPrice}>{formatCurrency(item.preco)} / {item.unidade}</Text>
                <View style={styles.itemBottom}>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.id, item.quantidade - 1)}>
                      <MaterialCommunityIcons name="minus" size={16} color={Colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{formatQty(item.quantidade)}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.id, item.quantidade + 1)}>
                      <MaterialCommunityIcons name="plus" size={16} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.itemSubtotal}>{formatCurrency(item.subtotal)}</Text>
                </View>
              </View>
              <View style={styles.itemActions}>
                <TouchableOpacity onPress={() => { setIsNewItem(false); setEditingItem(item); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="pencil-outline" size={20} color={Colors.onSurfaceVariant} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          </AnimatedEntrance>
        ))}

        {tabItens.length > 0 && (
          <View style={styles.tabTotalBar}>
            <Text style={styles.tabTotalLabel}>Total {activeTab === 'servico' ? 'serviços' : 'produtos'}</Text>
            <Text style={styles.tabTotalValue}>{formatCurrency(tabTotal)}</Text>
          </View>
        )}

        {/* AÇÕES */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowCatalog(true)} activeOpacity={0.8}>
            <MaterialCommunityIcons name="magnify" size={20} color={Colors.primary} />
            <Text style={styles.actionBtnLabel}>Do catálogo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: Colors.success }]} onPress={addManual} activeOpacity={0.8}>
            <MaterialCommunityIcons name="plus" size={20} color={Colors.success} />
            <Text style={[styles.actionBtnLabel, { color: Colors.success }]}>Adicionar manual</Text>
          </TouchableOpacity>
        </View>

        {/* DESCONTO — agora funcional */}
        <View style={styles.descontoCard}>
          <View style={styles.descontoHeader}>
            <MaterialCommunityIcons name="tag-outline" size={18} color={Colors.onSurfaceVariant} />
            <Text style={styles.descontoTitle}>Desconto</Text>
          </View>
          <View style={styles.descontoRow}>
            <View style={styles.descontoToggle}>
              <TouchableOpacity
                style={[styles.descontoType, orc.descontoTipo === 'valor' && styles.descontoTypeActive]}
                onPress={() => onChangeOrc({ descontoTipo: 'valor' })}
              >
                <Text style={[styles.descontoTypeLabel, orc.descontoTipo === 'valor' && styles.descontoTypeLabelActive]}>R$</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.descontoType, orc.descontoTipo === 'percentual' && styles.descontoTypeActive]}
                onPress={() => onChangeOrc({ descontoTipo: 'percentual' })}
              >
                <Text style={[styles.descontoTypeLabel, orc.descontoTipo === 'percentual' && styles.descontoTypeLabelActive]}>%</Text>
              </TouchableOpacity>
            </View>
            {orc.descontoTipo === 'valor' ? (
              <OlliMoneyInput
                value={orc.desconto}
                onChangeValue={v => onChangeOrc({ desconto: v })}
                containerStyle={{ flex: 1, marginBottom: 0 }}
              />
            ) : (
              <View style={styles.percentField}>
                <TextInput
                  style={styles.percentInput}
                  value={orc.desconto ? String(orc.desconto) : ''}
                  onChangeText={v => onChangeOrc({ desconto: Math.min(100, parseNumber(v)) })}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={Colors.onSurfaceMuted}
                />
                <Text style={styles.percentSign}>%</Text>
              </View>
            )}
          </View>
        </View>

        {/* TOTAL GERAL */}
        <View style={styles.grandTotal}>
          <View>
            <Text style={styles.grandTotalLabel}>Valor total</Text>
            {orc.desconto > 0 && (
              <Text style={styles.grandTotalDiscount}>
                desconto de {orc.descontoTipo === 'percentual' ? `${orc.desconto}%` : formatCurrency(orc.desconto)} aplicado
              </Text>
            )}
          </View>
          <Text style={styles.grandTotalValue}>{formatCurrency(orc.valorTotal)}</Text>
        </View>
      </ScrollView>

      {/* MODAL CATÁLOGO */}
      <Modal visible={showCatalog} animationType="slide" onRequestClose={() => setShowCatalog(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{activeTab === 'servico' ? 'Serviços' : 'Produtos'}</Text>
            <TouchableOpacity onPress={() => { setShowCatalog(false); setCatalogQuery(''); setCatalogResults([]); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="close" size={26} color={Colors.onSurface} />
            </TouchableOpacity>
          </View>
          <View style={{ padding: Spacing.base }}>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={22} color={Colors.onSurfaceVariant} />
              <TextInput
                style={styles.searchInput}
                placeholder={`Buscar ${activeTab === 'servico' ? 'serviço' : 'produto'}...`}
                value={catalogQuery}
                onChangeText={handleCatalogSearch}
                autoFocus
                placeholderTextColor={Colors.onSurfaceMuted}
              />
            </View>
          </View>
          <FlatList
            data={catalogResults}
            keyExtractor={i => i.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: Spacing.base }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.catalogItem} onPress={() => addFromCatalog(item)} activeOpacity={0.7}>
                {item.fotoUri ? (
                  <Image source={{ uri: item.fotoUri }} style={styles.catalogThumb} />
                ) : (
                  <View style={[styles.catalogThumb, styles.catalogThumbPlaceholder]}>
                    <MaterialCommunityIcons name={activeTab === 'servico' ? 'wrench' : 'package-variant'} size={20} color={Colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.catalogName}>{item.nome}</Text>
                  {item.descricao ? <Text style={styles.catalogDesc} numberOfLines={1}>{item.descricao}</Text> : null}
                </View>
                <Text style={styles.catalogPrice}>{formatCurrency(item.preco)}</Text>
                <MaterialCommunityIcons name="plus-circle" size={24} color={Colors.success} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.catalogEmpty}>
                {catalogQuery.length > 0 ? 'Nenhum resultado. Use "Adicionar manual".' : 'Digite para buscar no catálogo...'}
              </Text>
            }
          />
        </View>
      </Modal>

      {/* MODAL EDITAR ITEM */}
      <Modal visible={!!editingItem} animationType="slide" onRequestClose={() => setEditingItem(null)}>
        {editingItem && (
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isNewItem ? 'Novo item' : 'Editar item'}</Text>
              <TouchableOpacity onPress={() => setEditingItem(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="close" size={26} color={Colors.onSurface} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
              <OlliInput label="Nome do item" required value={editingItem.nome} onChangeText={v => setEditingItem(p => p ? { ...p, nome: v } : p)} placeholder="Ex: Limpeza de ar condicionado" />
              <OlliInput label="Descrição" value={editingItem.descricao ?? ''} onChangeText={v => setEditingItem(p => p ? { ...p, descricao: v } : p)} placeholder="Detalhe opcional" multiline />
              <View style={styles.rowFields}>
                <OlliMoneyInput label="Preço unitário" value={editingItem.preco} onChangeValue={v => setEditingItem(p => p ? { ...p, preco: v } : p)} containerStyle={{ flex: 1, marginRight: 10 }} />
                <OlliInput label="Quantidade" value={editingItem.quantidade ? String(editingItem.quantidade) : ''} onChangeText={v => setEditingItem(p => p ? { ...p, quantidade: parseNumber(v) || 1 } : p)} keyboardType="numeric" placeholder="1" containerStyle={{ flex: 1 }} />
              </View>
              <Text style={styles.unidadeLabel}>Unidade</Text>
              <View style={styles.unidadesRow}>
                {UNIDADES.map(u => (
                  <TouchableOpacity key={u} style={[styles.unidade, editingItem.unidade === u && styles.unidadeActive]} onPress={() => setEditingItem(p => p ? { ...p, unidade: u } : p)}>
                    <Text style={[styles.unidadeText, editingItem.unidade === u && { color: '#fff' }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <Text style={styles.editSubtotal}>Subtotal: {formatCurrency((editingItem.preco || 0) * (editingItem.quantidade || 1))}</Text>
              <OlliButton label="Confirmar item" variant="gradient" size="lg" fullWidth onPress={saveEditingItem} disabled={!editingItem.nome.trim()} icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />} />
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

function TabButton({ label, count, icon, active, onPress }: { label: string; count: number; icon: any; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress} activeOpacity={0.7}>
      <MaterialCommunityIcons name={icon} size={18} color={active ? Colors.primary : Colors.onSurfaceMuted} />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      {count > 0 && (
        <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
          <Text style={[styles.tabBadgeText, active && { color: '#fff' }]}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  tab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, gap: 6 },
  tabActive: { borderBottomWidth: 2.5, borderBottomColor: Colors.primary },
  tabLabel: { fontSize: 14, fontWeight: '600', color: Colors.onSurfaceMuted },
  tabLabelActive: { color: Colors.primary },
  tabBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: Colors.outline, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  tabBadgeActive: { backgroundColor: Colors.primary },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant },

  emptyBox: { alignItems: 'center', paddingVertical: 36 },
  emptyText: { fontSize: 14, color: Colors.onSurfaceMuted, marginTop: 8 },

  itemCard: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: 10, ...Shadow.sm,
  },
  itemName: { fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  itemDesc: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  itemPrice: { fontSize: 12, color: Colors.primary, marginTop: 4, fontWeight: '600' },
  itemBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  qtyValue: { fontSize: 15, fontWeight: '800', color: Colors.onSurface, minWidth: 24, textAlign: 'center' },
  itemSubtotal: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  itemActions: { justifyContent: 'space-between', alignItems: 'center', marginLeft: 12, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: Colors.outline },

  tabTotalBar: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: Colors.primaryContainer, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.base },
  tabTotalLabel: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  tabTotalValue: { fontSize: 15, fontWeight: '800', color: Colors.primary },

  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: 14, backgroundColor: Colors.surface },
  actionBtnLabel: { fontSize: 13, color: Colors.primary, fontWeight: '700' },

  descontoCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, marginTop: Spacing.base, ...Shadow.sm },
  descontoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  descontoTitle: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  descontoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  descontoToggle: { flexDirection: 'row', gap: 6 },
  descontoType: { width: 44, height: 50, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.outline, justifyContent: 'center', alignItems: 'center' },
  descontoTypeActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  descontoTypeLabel: { fontSize: 15, fontWeight: '800', color: Colors.onSurfaceVariant },
  descontoTypeLabelActive: { color: '#fff' },
  percentField: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.outline, borderRadius: BorderRadius.md, paddingHorizontal: 14, backgroundColor: Colors.surfaceVariant, minHeight: 50 },
  percentInput: { flex: 1, fontSize: 15, color: Colors.onSurface },
  percentSign: { fontSize: 15, fontWeight: '700', color: Colors.onSurfaceMuted },

  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginTop: Spacing.base, ...Shadow.md },
  grandTotalLabel: { fontSize: 13, color: 'rgba(255,255,255,0.82)', fontWeight: '600' },
  grandTotalDiscount: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  grandTotalValue: { fontSize: 26, fontWeight: '900', color: '#fff' },

  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.onSurface },
  modalFooter: { padding: Spacing.base, paddingBottom: 28, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.outline },
  editSubtotal: { textAlign: 'right', fontSize: 16, fontWeight: '800', color: Colors.primary, marginBottom: 12 },

  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.base, paddingVertical: 12, gap: 10, borderWidth: 1, borderColor: Colors.outline },
  searchInput: { flex: 1, fontSize: 16, color: Colors.onSurface },
  catalogItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  catalogThumb: { width: 46, height: 46, borderRadius: BorderRadius.md },
  catalogThumbPlaceholder: { backgroundColor: Colors.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  catalogName: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  catalogDesc: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  catalogPrice: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  catalogEmpty: { textAlign: 'center', color: Colors.onSurfaceMuted, padding: 32, fontSize: 14 },

  rowFields: { flexDirection: 'row' },
  unidadeLabel: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant, marginBottom: 8 },
  unidadesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unidade: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: Colors.outline },
  unidadeActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  unidadeText: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant },
});
