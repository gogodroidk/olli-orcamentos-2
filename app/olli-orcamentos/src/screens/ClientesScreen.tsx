import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, Alert, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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

export default function ClientesScreen() {
  const nav = useNavigation();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtered, setFiltered] = useState<Cliente[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Partial<Cliente> | null>(null);
  const [isNew, setIsNew] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const all = await getClientes();
    setClientes(all);
    applyFilter(all, query);
  }

  function applyFilter(data: Cliente[], q: string) {
    if (!q.trim()) { setFiltered(data); return; }
    const lower = q.toLowerCase();
    setFiltered(data.filter(c => c.nome.toLowerCase().includes(lower) || c.telefone.includes(q)));
  }

  function handleSearch(q: string) {
    setQuery(q);
    applyFilter(clientes, q);
  }

  async function handleSave() {
    if (!editing?.nome?.trim()) return;
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
            <View style={styles.card}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{c.nome.charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name}>{c.nome}</Text>
                {c.telefone ? <Text style={styles.info}>{c.telefone}</Text> : null}
                {c.cidade ? <Text style={styles.infoMuted}>{c.cidade}{c.estado ? `, ${c.estado}` : ''}</Text> : null}
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => { setEditing({ ...c }); setIsNew(false); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="pencil-outline" size={20} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          </AnimatedEntrance>
        )}
        ListEmptyComponent={<EmptyState icon="account-group-outline" title="Nenhum cliente" subtitle="Cadastre seus clientes para agilizar os orçamentos." actionLabel="Novo cliente" onAction={() => { setEditing({}); setIsNew(true); }} />}
      />

      <TouchableOpacity style={styles.fab} onPress={() => { setEditing({}); setIsNew(true); }} activeOpacity={0.85}>
        <MaterialCommunityIcons name="plus" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        {editing && (
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isNew ? 'Novo Cliente' : 'Editar Cliente'}</Text>
              <TouchableOpacity onPress={() => setEditing(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="close" size={26} color={Colors.onSurface} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
              <OlliInput label="Nome completo" required value={editing.nome ?? ''} onChangeText={v => setEditing(p => p ? { ...p, nome: v } : p)} placeholder="Ex: João da Silva" leftIcon="account" />
              <OlliInput label="Telefone / WhatsApp" mask="phone" value={editing.telefone ?? ''} onChangeText={v => setEditing(p => p ? { ...p, telefone: v } : p)} placeholder="(11) 99999-9999" leftIcon="phone" />
              <OlliInput label="CPF" mask="cpf" value={editing.cpf ?? ''} onChangeText={v => setEditing(p => p ? { ...p, cpf: v } : p)} placeholder="000.000.000-00" leftIcon="card-account-details" />
              <OlliInput label="CNPJ" mask="cnpj" value={editing.cnpj ?? ''} onChangeText={v => setEditing(p => p ? { ...p, cnpj: v } : p)} placeholder="00.000.000/0001-00" leftIcon="domain" />
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
    </View>
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
});
