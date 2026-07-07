import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, Alert, Modal, ScrollView, ActivityIndicator,
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
import { OlliSkeleton } from '../components/OlliSkeleton';
import { getClientes, saveCliente, deleteCliente, getOrcamentos } from '../database/database';
import { getAgendamentos } from '../services/agenda';
import { clientesParaReconquistar } from '../services/radarClientes';
import { useCepLookup } from '../services/cep';
import { Cliente } from '../types';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { isValidCPF, isValidCNPJ } from '../utils/masks';
import { abrirWhatsApp } from '../utils/pdfGenerator';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ClientesScreen() {
  const nav = useNavigation<Nav>();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtered, setFiltered] = useState<Cliente[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Partial<Cliente> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [errors, setErrors] = useState<{ cpf?: string; cnpj?: string; telefone?: string }>({});
  // Cliente "aberto" no menu de ações (CRM: ver orçamentos, novo orçamento, etc.).
  const [acoes, setAcoes] = useState<Cliente | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  // Ids de clientes "sumidos" (radar de reconquista, >= 5 meses sem contato).
  // Calculado UMA VEZ por carregamento da tela (não por item da lista) — o
  // card só consulta este Set (services/radarClientes já fez o trabalho pesado).
  const [radarMeses, setRadarMeses] = useState<Map<string, number>>(new Map());
  const { cepLoading, onCepChange } = useCepLookup(r => {
    setEditing(p => p ? {
      ...p,
      endereco: p.endereco?.trim() ? p.endereco : r.logradouro,
      cidade: r.cidade || p.cidade,
      estado: r.uf || p.estado,
    } : p);
  });

  useFocusEffect(useCallback(() => { load(); loadRadar(); }, []));

  async function load() {
    const all = await getClientes();
    setClientes(all);
    applyFilter(all, query);
    setCarregando(false);
  }

  async function loadRadar() {
    try {
      const lista = await clientesParaReconquistar();
      setRadarMeses(new Map(lista.map(item => [item.cliente.id, item.mesesSemContato])));
    } catch {
      setRadarMeses(new Map());
    }
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

    const nextErrors: { cpf?: string; cnpj?: string; telefone?: string } = {};
    const cpfDigits = (editing.cpf ?? '').replace(/\D/g, '');
    const cnpjDigits = (editing.cnpj ?? '').replace(/\D/g, '');
    const telDigits = (editing.telefone ?? '').replace(/\D/g, '');
    if (cpfDigits.length > 0 && !isValidCPF(editing.cpf!)) {
      nextErrors.cpf = 'CPF inválido';
    }
    if (cnpjDigits.length > 0 && !isValidCNPJ(editing.cnpj!)) {
      nextErrors.cnpj = 'CNPJ inválido';
    }
    if (telDigits.length > 0 && telDigits.length < 10) {
      nextErrors.telefone = 'Telefone incompleto (informe DDD + número)';
    }
    if (nextErrors.cpf || nextErrors.cnpj || nextErrors.telefone) {
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
    setSalvando(true);
    try {
      await saveCliente(c);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setEditing(null);
      load();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Erro', 'Não foi possível salvar o cliente agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleDelete(c: Cliente) {
    // Avisa se há orçamentos/agendamentos vinculados antes de confirmar a exclusão.
    let orcamentosVinculados = 0;
    let agendamentosVinculados = 0;
    try {
      const [orcamentos, agendamentos] = await Promise.all([getOrcamentos(), getAgendamentos()]);
      orcamentosVinculados = orcamentos.filter(o => o.clienteId === c.id).length;
      agendamentosVinculados = agendamentos.filter(a => a.clienteId === c.id).length;
    } catch {
      // Falha na consulta não deve impedir a exclusão — segue sem o aviso extra.
    }

    const partes: string[] = [];
    if (orcamentosVinculados > 0) partes.push(`${orcamentosVinculados} orçamento${orcamentosVinculados === 1 ? '' : 's'}`);
    if (agendamentosVinculados > 0) partes.push(`${agendamentosVinculados} agendamento${agendamentosVinculados === 1 ? '' : 's'}`);

    const mensagem = partes.length > 0
      ? `Este cliente tem ${partes.join(' e ')} no histórico. Eles serão mantidos, mas você não poderá mais acessá-los pelo cadastro do cliente.\n\nExcluir "${c.nome}" mesmo assim?`
      : `Excluir "${c.nome}"?`;

    Alert.alert('Excluir cliente', mensagem, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive', onPress: async () => {
          setExcluindoId(c.id);
          try {
            await deleteCliente(c.id);
            load();
          } catch {
            Alert.alert('Erro', 'Não foi possível excluir o cliente agora. Tente novamente.');
          } finally {
            setExcluindoId(null);
          }
        }
      },
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
      <GradientHeader title="Clientes" subtitle={`${clientes.length} cadastrado${clientes.length === 1 ? '' : 's'}`} onBack={() => goBackOrHome(nav)}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={Colors.onSurfaceVariant} />
          <TextInput style={styles.searchInput} placeholder="Buscar por nome ou telefone..." value={query} onChangeText={handleSearch} placeholderTextColor={Colors.onSurfaceMuted} />
          {query ? <TouchableOpacity onPress={() => handleSearch('')}><MaterialCommunityIcons name="close-circle" size={18} color={Colors.onSurfaceMuted} /></TouchableOpacity> : null}
        </View>
      </GradientHeader>

      {carregando ? (
        <View style={{ padding: Spacing.base, gap: 10 }}>
          {[0, 1, 2].map(i => (
            <View key={i} style={styles.card}>
              <OlliSkeleton width={46} height={46} radius={23} />
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <OlliSkeleton width="55%" height={14} />
                <OlliSkeleton width="35%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ) : (
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
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{c.nome}</Text>
                  {radarMeses.has(c.id) && (
                    <View style={styles.radarBadge}>
                      <Text style={styles.radarBadgeText}>{radarMeses.get(c.id)}+ meses</Text>
                    </View>
                  )}
                </View>
                {c.telefone ? <Text style={styles.info}>{c.telefone}</Text> : null}
                {c.cidade ? <Text style={styles.infoMuted}>{c.cidade}{c.estado ? `, ${c.estado}` : ''}</Text> : null}
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => { setEditing({ ...c }); setIsNew(false); setErrors({}); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="pencil-outline" size={20} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(c)} disabled={excluindoId === c.id} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  {excluindoId === c.id
                    ? <ActivityIndicator size="small" color={Colors.danger} />
                    : <MaterialCommunityIcons name="trash-can-outline" size={20} color={Colors.danger} />}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </AnimatedEntrance>
        )}
        ListEmptyComponent={<EmptyState icon="account-group-outline" title="Nenhum cliente" subtitle="Cadastre seus clientes para agilizar os orçamentos." actionLabel="Novo cliente" onAction={() => { setEditing({}); setIsNew(true); setErrors({}); }} />}
      />
      )}

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
              <OlliInput label="Nome completo" required autoFocus={isNew} value={editing.nome ?? ''} onChangeText={v => setEditing(p => p ? { ...p, nome: v } : p)} placeholder="Ex: João da Silva" leftIcon="account" />
              <OlliInput label="Telefone / WhatsApp" mask="phone" value={editing.telefone ?? ''} onChangeText={v => { setEditing(p => p ? { ...p, telefone: v } : p); setErrors(e => e.telefone ? { ...e, telefone: undefined } : e); }} placeholder="(11) 99999-9999" leftIcon="phone" error={errors.telefone} />
              <OlliInput label="CPF" mask="cpf" value={editing.cpf ?? ''} onChangeText={v => { setEditing(p => p ? { ...p, cpf: v } : p); setErrors(e => e.cpf ? { ...e, cpf: undefined } : e); }} placeholder="000.000.000-00" leftIcon="card-account-details" error={errors.cpf} />
              <OlliInput label="CNPJ" mask="cnpj" value={editing.cnpj ?? ''} onChangeText={v => { setEditing(p => p ? { ...p, cnpj: v } : p); setErrors(e => e.cnpj ? { ...e, cnpj: undefined } : e); }} placeholder="00.000.000/0001-00" leftIcon="domain" error={errors.cnpj} />
              <OlliInput label="Endereço" value={editing.endereco ?? ''} onChangeText={v => setEditing(p => p ? { ...p, endereco: v } : p)} placeholder="Rua, número" leftIcon="map-marker" />
              <OlliInput label="Complemento" value={editing.complemento ?? ''} onChangeText={v => setEditing(p => p ? { ...p, complemento: v } : p)} placeholder="Apto, bloco, referência" />
              <View style={styles.rowFields}>
                <OlliInput label="Cidade" value={editing.cidade ?? ''} onChangeText={v => setEditing(p => p ? { ...p, cidade: v } : p)} placeholder="São Paulo" containerStyle={{ flex: 2, marginRight: 10 }} />
                <OlliInput label="UF" value={editing.estado ?? ''} onChangeText={v => setEditing(p => p ? { ...p, estado: v.toUpperCase().slice(0, 2) } : p)} placeholder="SP" autoCapitalize="characters" maxLength={2} containerStyle={{ flex: 1 }} />
              </View>
              <View style={styles.cepRow}>
                <OlliInput label="CEP" mask="cep" value={editing.cep ?? ''} onChangeText={v => onCepChange(v, masked => setEditing(p => p ? { ...p, cep: masked } : p))} placeholder="00000-000" leftIcon="mailbox" containerStyle={{ flex: 1, marginBottom: 0 }} />
                {cepLoading && <ActivityIndicator size="small" color={Colors.primary} style={styles.cepSpinner} />}
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <OlliButton label="Salvar cliente" variant="gradient" size="lg" fullWidth loading={salvando} onPress={handleSave} disabled={!editing.nome?.trim() || salvando} icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />} />
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  radarBadge: { backgroundColor: 'rgba(247,178,59,0.14)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.34)', borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  radarBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.warning },
  info: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  infoMuted: { fontSize: 12, color: Colors.onSurfaceMuted, marginTop: 1 },
  cardActions: { flexDirection: 'row', gap: 16 },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', ...Shadow.lg, shadowColor: Colors.primary, shadowOpacity: 0.4 },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.onSurface },
  modalFooter: { padding: Spacing.base, paddingBottom: 28, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.outline },
  rowFields: { flexDirection: 'row' },
  cepRow: { flexDirection: 'row', alignItems: 'flex-end' },
  cepSpinner: { marginLeft: 10, marginBottom: 14 },

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
