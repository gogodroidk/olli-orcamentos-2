import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, Alert, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { EmptyState } from '../components/EmptyState';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { getClientes, saveCliente, deleteCliente } from '../database/database';
import { Cliente } from '../types';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { isValidCPF } from '../utils/masks';
import { abrirWhatsApp } from '../utils/pdfGenerator';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ClientesScreen() {
  const nav = useNavigation<Nav>();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtered, setFiltered] = useState<Cliente[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Partial<Cliente> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [errors, setErrors] = useState<{ cpf?: string; cnpj?: string }>({});
  // Cliente "aberto" no menu de ações (CRM: ver orçamentos, novo orçamento, etc.).
  const [acoes, setAcoes] = useState<Cliente | null>(null);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const all = await getClientes();
    setClientes(all);
    applyFilter(all, query);
  }

  function applyFilter(data: Cliente[], q: string) {
    if (!q.trim()) { setFiltered(data); return; }
    const lower = q.toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    setFiltered(data.filter(c =>
      c.nome.toLowerCase().includes(lower) ||
      (qDigits.length > 0 && c.telefone.replace(/\D/g, '').includes(qDigits))
    ));
  }

  function handleSearch(q: string) {
    setQuery(q);
    applyFilter(clientes, q);
  }

  async function handleSave() {
    if (!editing?.nome?.trim()) return;

    const nextErrors: { cpf?: string; cnpj?: string } = {};
    const cpfDigits = (editing.cpf ?? '').replace(/\D/g, '');
    const cnpjDigits = (editing.cnpj ?? '').replace(/\D/g, '');
    if (cpfDigits.length > 0 && !isValidCPF(editing.cpf!)) {
      nextErrors.cpf = 'CPF inválido';
    }
    if (cnpjDigits.length > 0 && cnpjDigits.length !== 14) {
      nextErrors.cnpj = 'CNPJ deve ter 14 dígitos';
    }
    if (nextErrors.cpf || nextErrors.cnpj) {
      setErrors(nextErrors);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    setErrors({});

    const c: Cliente = {
      id: editing.id ?? generateId(),
      nome: editing.nome!,
      telefone: editing.telefone ?? '',
      cpf: editing.cpf, cnpj: editing.cnpj,
      endereco: editing.endereco, complemento: editing.complemento,
      cidade: editing.cidade, estado: editing.estado, cep: editing.cep,
      criadoEm: editing.criadoEm ?? nowISO(),
    };
    await saveCliente(c);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setEditing(null);
    load();
  }

  function handleDelete(c: Cliente) {
    Alert.alert('Excluir cliente', `Excluir "${c.nome}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await deleteCliente(c.id); load(); } },
    ]);
  }

  // ─── AÇÕES DE CRM (a partir do menu do cliente) ───────────────
  function verOrcamentos(c: Cliente) {
    setAcoes(null);
    nav.navigate('Orcamentos', { clienteId: c.id, clienteNome: c.nome });
  }

  function novoOrcamento(c: Cliente) {
    setAcoes(null);
    nav.navigate('NovoOrcamento', { clienteId: c.id });
  }

  function agendarVisita(c: Cliente) {
    setAcoes(null);
    const endereco = [c.endereco, c.complemento, c.cidade, c.estado].filter(Boolean).join(', ');
    nav.navigate('Tabs', {
      screen: 'Agenda',
      params: { novoParaClienteId: c.id, novoParaClienteNome: c.nome, novoEndereco: endereco || undefined },
    });
  }

  async function chamarWhatsApp(c: Cliente) {
    if (!c.telefone?.trim()) {
      Alert.alert('WhatsApp', 'Este cliente não tem telefone cadastrado.');
      return;
    }
    setAcoes(null);
    try {
      await abrirWhatsApp(c.telefone, `Olá ${c.nome}!`);
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir o WhatsApp.');
    }
  }

  function editarCliente(c: Cliente) {
    setAcoes(null);
    setEditing({ ...c });
    setIsNew(false);
    setErrors({});
  }

  return (
    <View style={styles.container}>
      <GradientHeader title="Clientes" subtitle={`${clientes.length} cadastrado${clientes.length === 1 ? '' : 's'}`} onBack={() => nav.goBack()}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={Colors.onSurfaceVariant} />
          <TextInput style={styles.searchInput} placeholder="Buscar por nome ou telefone..." value={query} onChangeText={handleSearch} placeholderTextColor={Colors.onSurfaceMuted} />
          {query ? <TouchableOpacity onPress={() => handleSearch('')}><MaterialCommunityIcons name="close-circle" size={18} color={Colors.onSurfaceMuted} /></TouchableOpacity> : null}
        </View>
      </GradientHeader>

      <FlatList
        data={filtered}
        keyExtractor={c => c.id}
        contentContainerStyle={{ padding: Spacing.base, gap: 10, flexGrow: 1 }}
        renderItem={({ item: c, index }) => (
          <AnimatedEntrance index={index}>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setAcoes(c); }}
            >
              <View style={styles.avatar}><Text style={styles.avatarText}>{c.nome.charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name}>{c.nome}</Text>
                {c.telefone ? <Text style={styles.info}>{c.telefone}</Text> : null}
                {c.cidade ? <Text style={styles.infoMuted}>{c.cidade}{c.estado ? `, ${c.estado}` : ''}</Text> : null}
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => { setEditing({ ...c }); setIsNew(false); setErrors({}); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="pencil-outline" size={20} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </AnimatedEntrance>
        )}
        ListEmptyComponent={<EmptyState icon="account-group-outline" title="Nenhum cliente" subtitle="Cadastre seus clientes para agilizar os orçamentos." actionLabel="Novo cliente" onAction={() => { setEditing({}); setIsNew(true); setErrors({}); }} />}
      />

      <TouchableOpacity style={styles.fab} onPress={() => { setEditing({}); setIsNew(true); setErrors({}); }} activeOpacity={0.85}>
        <MaterialCommunityIcons name="plus" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => { setEditing(null); setErrors({}); }}>
        {editing && (
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isNew ? 'Novo Cliente' : 'Editar Cliente'}</Text>
              <TouchableOpacity onPress={() => { setEditing(null); setErrors({}); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="close" size={26} color={Colors.onSurface} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
              <OlliInput label="Nome completo" required value={editing.nome ?? ''} onChangeText={v => setEditing(p => p ? { ...p, nome: v } : p)} placeholder="Ex: João da Silva" leftIcon="account" />
              <OlliInput label="Telefone / WhatsApp" mask="phone" value={editing.telefone ?? ''} onChangeText={v => setEditing(p => p ? { ...p, telefone: v } : p)} placeholder="(11) 99999-9999" leftIcon="phone" />
              <OlliInput label="CPF" mask="cpf" value={editing.cpf ?? ''} onChangeText={v => { setEditing(p => p ? { ...p, cpf: v } : p); setErrors(e => e.cpf ? { ...e, cpf: undefined } : e); }} placeholder="000.000.000-00" leftIcon="card-account-details" error={errors.cpf} />
              <OlliInput label="CNPJ" mask="cnpj" value={editing.cnpj ?? ''} onChangeText={v => { setEditing(p => p ? { ...p, cnpj: v } : p); setErrors(e => e.cnpj ? { ...e, cnpj: undefined } : e); }} placeholder="00.000.000/0001-00" leftIcon="domain" error={errors.cnpj} />
              <OlliInput label="Endereço" value={editing.endereco ?? ''} onChangeText={v => setEditing(p => p ? { ...p, endereco: v } : p)} placeholder="Rua, número" leftIcon="map-marker" />
              <OlliInput label="Complemento" value={editing.complemento ?? ''} onChangeText={v => setEditing(p => p ? { ...p, complemento: v } : p)} placeholder="Apto, bloco, referência" />
              <View style={styles.rowFields}>
                <OlliInput label="Cidade" value={editing.cidade ?? ''} onChangeText={v => setEditing(p => p ? { ...p, cidade: v } : p)} placeholder="São Paulo" containerStyle={{ flex: 2, marginRight: 10 }} />
                <OlliInput label="UF" value={editing.estado ?? ''} onChangeText={v => setEditing(p => p ? { ...p, estado: v.toUpperCase().slice(0, 2) } : p)} placeholder="SP" autoCapitalize="characters" maxLength={2} containerStyle={{ flex: 1 }} />
              </View>
              <OlliInput label="CEP" mask="cep" value={editing.cep ?? ''} onChangeText={v => setEditing(p => p ? { ...p, cep: v } : p)} placeholder="00000-000" leftIcon="mailbox" />
            </ScrollView>
            <View style={styles.modalFooter}>
              <OlliButton label="Salvar cliente" variant="gradient" size="lg" fullWidth onPress={handleSave} disabled={!editing.nome?.trim()} icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />} />
            </View>
          </View>
        )}
      </Modal>

      {/* MENU DE AÇÕES DO CLIENTE (CRM) */}
      <Modal visible={!!acoes} transparent animationType="fade" onRequestClose={() => setAcoes(null)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setAcoes(null)}>
          <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            {acoes && (
              <>
                <View style={styles.sheetHead}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{acoes.nome.charAt(0).toUpperCase()}</Text></View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.sheetName} numberOfLines={1}>{acoes.nome}</Text>
                    {acoes.telefone ? <Text style={styles.sheetSub}>{acoes.telefone}</Text> : null}
                  </View>
                </View>

                <SheetAction icon="file-document-multiple-outline" color={Colors.primaryLight} label="Ver orçamentos" desc="Histórico deste cliente" onPress={() => verOrcamentos(acoes)} />
                <SheetAction icon="file-plus-outline" color={Colors.accent} label="Novo orçamento" desc="Já com este cliente" onPress={() => novoOrcamento(acoes)} />
                <SheetAction icon="calendar-plus" color="#A78BFA" label="Agendar visita" desc="Adicionar à agenda" onPress={() => agendarVisita(acoes)} />
                <SheetAction icon="whatsapp" color={Colors.whatsapp} label="WhatsApp" desc="Falar com o cliente" onPress={() => chamarWhatsApp(acoes)} />
                <SheetAction icon="pencil-outline" color={Colors.onSurfaceVariant} label="Editar cadastro" desc="Dados do cliente" onPress={() => editarCliente(acoes)} />
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function SheetAction({ icon, color, label, desc, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string; label: string; desc: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.sheetItem} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.sheetIcon, { backgroundColor: color + '1E', borderColor: color + '3A' }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.sheetItemTitle}>{label}</Text>
        <Text style={styles.sheetItemDesc}>{desc}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.onSurfaceMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.lg, paddingHorizontal: 14, paddingVertical: 11, gap: 8, marginTop: 14, borderWidth: 1, borderColor: Colors.outline },
  searchInput: { flex: 1, fontSize: 15, color: Colors.onSurface },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  name: { fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  info: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  infoMuted: { fontSize: 12, color: Colors.onSurfaceMuted, marginTop: 1 },
  cardActions: { flexDirection: 'row', gap: 16 },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', ...Shadow.lg, shadowColor: Colors.primary, shadowOpacity: 0.4 },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.onSurface },
  modalFooter: { padding: Spacing.base, paddingBottom: 28, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.outline },
  rowFields: { flexDirection: 'row' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(5,12,22,0.72)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.outline, paddingHorizontal: Spacing.base, paddingTop: 10, paddingBottom: 32 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.outlineDark, marginBottom: Spacing.base },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.base, paddingHorizontal: 2 },
  sheetName: { fontSize: 17, fontWeight: '800', color: Colors.onSurface },
  sheetSub: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: Spacing.md, marginBottom: 10 },
  sheetIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  sheetItemTitle: { fontSize: 15, fontWeight: '800', color: Colors.onSurface },
  sheetItemDesc: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginTop: 2 },
});
