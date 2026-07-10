import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, Modal, ActivityIndicator, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { Orcamento, Cliente } from '../types';
import { searchClientes, saveCliente } from '../database/database';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { OlliInput } from '../components/OlliInput';
import { OlliButton } from '../components/OlliButton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { useCepLookup } from '../services/cep';
import { isValidCPF, isValidCNPJ } from '../utils/masks';

interface Props {
  orc: Orcamento;
  onChange: (partial: Partial<Orcamento>) => void;
}

export default function Step1Cliente({ orc, onChange }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Cliente[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [nc, setNc] = useState<Partial<Cliente>>({});
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [ncErrors, setNcErrors] = useState<{ cpf?: string; cnpj?: string; telefone?: string }>({});
  const { cepLoading, onCepChange } = useCepLookup(r => {
    setNc(p => ({
      ...p,
      endereco: p.endereco?.trim() ? p.endereco : r.logradouro,
      cidade: r.cidade || p.cidade,
      estado: r.uf || p.estado,
    }));
  });

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); setShowResults(false); return; }
    const found = await searchClientes(q);
    setResults(found);
    setShowResults(true);
  }, []);

  const selectCliente = useCallback((c: Cliente) => {
    Haptics.selectionAsync().catch(() => {});
    onChange({
      clienteId: c.id,
      clienteNome: c.nome,
      clienteTelefone: c.telefone,
      clienteCpfCnpj: c.cpf ?? c.cnpj,
      clienteEndereco: c.endereco
        ? [c.endereco, c.complemento, c.cidade, c.estado].filter(Boolean).join(', ')
        : undefined,
    });
    setQuery(c.nome);
    setShowResults(false);
  }, [onChange]);

  async function saveNewCliente() {
    if (!nc.nome?.trim()) return;

    // Mesma validação de CPF/CNPJ por dígito verificador do cadastro de
    // clientes (ClientesScreen) — sem isso, este formulário (o mais usado, por
    // ficar dentro do fluxo de orçamento) deixava passar CPF/CNPJ inválido só
    // com a máscara visual, divergindo do outro cadastro de cliente do app.
    const nextErrors: { cpf?: string; cnpj?: string; telefone?: string } = {};
    const cpfDigits = (nc.cpf ?? '').replace(/\D/g, '');
    const cnpjDigits = (nc.cnpj ?? '').replace(/\D/g, '');
    const telDigits = (nc.telefone ?? '').replace(/\D/g, '');
    if (cpfDigits.length > 0 && !isValidCPF(nc.cpf!)) {
      nextErrors.cpf = 'CPF inválido';
    }
    if (cnpjDigits.length > 0 && !isValidCNPJ(nc.cnpj!)) {
      nextErrors.cnpj = 'CNPJ inválido';
    }
    if (telDigits.length > 0 && telDigits.length < 10) {
      nextErrors.telefone = 'Telefone incompleto (informe DDD + número)';
    }
    if (nextErrors.cpf || nextErrors.cnpj || nextErrors.telefone) {
      setNcErrors(nextErrors);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    setNcErrors({});

    const c: Cliente = {
      id: generateId(),
      nome: nc.nome!,
      telefone: nc.telefone ?? '',
      cpf: nc.cpf,
      cnpj: nc.cnpj,
      endereco: nc.endereco,
      complemento: nc.complemento,
      cidade: nc.cidade,
      estado: nc.estado,
      cep: nc.cep,
      criadoEm: nowISO(),
    };
    setSalvandoNovo(true);
    try {
      await saveCliente(c);
      selectCliente(c);
      setShowNew(false);
      setNc({});
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Erro', 'Não foi possível salvar o cliente agora. Tente novamente.');
    } finally {
      setSalvandoNovo(false);
    }
  }

  const selected = !!orc.clienteNome;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.stepTitle}>Para quem é o orçamento?</Text>
      <Text style={styles.stepHint}>Busque um cliente cadastrado ou crie um novo.</Text>

      {/* BUSCA */}
      <View style={styles.searchBox}>
        <MaterialCommunityIcons name="magnify" size={22} color={cores.onSurfaceVariant} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar cliente pelo nome..."
          value={query}
          onChangeText={handleSearch}
          placeholderTextColor={cores.onSurfaceMuted}
        />
        {query ? (
          <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setShowResults(false); }}>
            <MaterialCommunityIcons name="close-circle" size={20} color={cores.onSurfaceMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* AUTOCOMPLETE */}
      {showResults && results.length > 0 && (
        <View style={styles.dropdown}>
          {results.map(c => (
            <TouchableOpacity key={c.id} style={styles.dropItem} onPress={() => selectCliente(c)} activeOpacity={0.7}>
              <View style={styles.dropAvatar}>
                <Text style={styles.dropAvatarText}>{c.nome.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.dropName}>{c.nome}</Text>
                <Text style={styles.dropPhone}>{c.telefone || 'Sem telefone'}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showResults && results.length === 0 && query.length >= 2 && (
        <Text style={styles.noResults}>Nenhum cliente encontrado. Crie um novo abaixo.</Text>
      )}

      {/* SELECIONADO */}
      {selected && (
        <AnimatedEntrance from="scale">
          <View style={styles.selectedCard}>
            <View style={styles.selectedAvatar}>
              {/* #fff: ícone sobre o verde de sucesso — sem token "onSuccess" na
                  paleta; ver relatório da migração. */}
              <MaterialCommunityIcons name="account-check" size={26} color="#fff" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.selectedName}>{orc.clienteNome}</Text>
              {orc.clienteTelefone ? <Text style={styles.selectedInfo}>{orc.clienteTelefone}</Text> : null}
              {orc.clienteCpfCnpj ? <Text style={styles.selectedInfo}>{orc.clienteCpfCnpj}</Text> : null}
              {orc.clienteEndereco ? <Text style={styles.selectedInfo} numberOfLines={2}>{orc.clienteEndereco}</Text> : null}
            </View>
            <TouchableOpacity
              onPress={() => { onChange({ clienteId: '', clienteNome: '', clienteTelefone: '', clienteCpfCnpj: undefined, clienteEndereco: undefined }); setQuery(''); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="close-circle" size={24} color={cores.danger} />
            </TouchableOpacity>
          </View>
        </AnimatedEntrance>
      )}

      {/* NOVO CLIENTE */}
      {!selected && (
        <TouchableOpacity style={styles.newBtn} onPress={() => setShowNew(true)} activeOpacity={0.8}>
          <MaterialCommunityIcons name="account-plus" size={22} color={cores.primary} />
          <Text style={styles.newBtnLabel}>Cadastrar novo cliente</Text>
        </TouchableOpacity>
      )}

      {/* MODAL NOVO CLIENTE */}
      <Modal visible={showNew} animationType="slide" onRequestClose={() => { setShowNew(false); setNcErrors({}); }}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Novo Cliente</Text>
            <TouchableOpacity onPress={() => { setShowNew(false); setNcErrors({}); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
            <OlliInput label="Nome completo" required autoFocus value={nc.nome ?? ''} onChangeText={v => setNc(p => ({ ...p, nome: v }))} placeholder="Ex: João da Silva" leftIcon="account" />
            <OlliInput label="Telefone / WhatsApp" mask="phone" value={nc.telefone ?? ''} onChangeText={v => { setNc(p => ({ ...p, telefone: v })); setNcErrors(e => e.telefone ? { ...e, telefone: undefined } : e); }} placeholder="(11) 99999-9999" leftIcon="phone" error={ncErrors.telefone} />
            <OlliInput label="CPF" mask="cpf" value={nc.cpf ?? ''} onChangeText={v => { setNc(p => ({ ...p, cpf: v })); setNcErrors(e => e.cpf ? { ...e, cpf: undefined } : e); }} placeholder="000.000.000-00" leftIcon="card-account-details" error={ncErrors.cpf} />
            <OlliInput label="CNPJ" mask="cnpj" value={nc.cnpj ?? ''} onChangeText={v => { setNc(p => ({ ...p, cnpj: v })); setNcErrors(e => e.cnpj ? { ...e, cnpj: undefined } : e); }} placeholder="00.000.000/0001-00" leftIcon="domain" error={ncErrors.cnpj} />
            <OlliInput label="Endereço" value={nc.endereco ?? ''} onChangeText={v => setNc(p => ({ ...p, endereco: v }))} placeholder="Rua, número" leftIcon="map-marker" />
            <OlliInput label="Complemento" value={nc.complemento ?? ''} onChangeText={v => setNc(p => ({ ...p, complemento: v }))} placeholder="Apto, bloco, referência" />
            <View style={styles.rowFields}>
              <OlliInput label="Cidade" value={nc.cidade ?? ''} onChangeText={v => setNc(p => ({ ...p, cidade: v }))} placeholder="São Paulo" containerStyle={{ flex: 2, marginRight: 10 }} />
              <OlliInput label="UF" value={nc.estado ?? ''} onChangeText={v => setNc(p => ({ ...p, estado: v.toUpperCase().slice(0, 2) }))} placeholder="SP" autoCapitalize="characters" maxLength={2} containerStyle={{ flex: 1 }} />
            </View>
            <View style={styles.cepRow}>
              <OlliInput label="CEP" mask="cep" value={nc.cep ?? ''} onChangeText={v => onCepChange(v, masked => setNc(p => ({ ...p, cep: masked })))} placeholder="00000-000" leftIcon="mailbox" containerStyle={{ flex: 1, marginBottom: 0 }} />
              {cepLoading && <ActivityIndicator size="small" color={cores.primary} style={styles.cepSpinner} />}
            </View>
          </ScrollView>
          <View style={styles.modalFooter}>
            <OlliButton label="Salvar cliente" variant="gradient" size="lg" fullWidth loading={salvandoNovo} onPress={saveNewCliente} disabled={!nc.nome?.trim() || salvandoNovo} icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  stepTitle: { fontSize: 22, fontWeight: '800', color: c.onSurface, letterSpacing: 0 },
  stepHint: { fontSize: 14, color: c.onSurfaceVariant, marginTop: 4, marginBottom: Spacing.lg },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, paddingVertical: 14,
    gap: 10, ...sombrasDe(c).sm,
    borderWidth: 1, borderColor: c.outline,
  },
  searchInput: { flex: 1, fontSize: 16, color: c.onSurface },
  dropdown: {
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    marginTop: 8, ...sombrasDe(c).md, overflow: 'hidden',
  },
  dropItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: c.outline,
  },
  dropAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  dropAvatarText: { fontSize: 16, fontWeight: '800', color: c.primary },
  dropName: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  dropPhone: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 1 },
  noResults: { fontSize: 13, color: c.onSurfaceMuted, marginTop: 12, textAlign: 'center' },
  selectedCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginTop: Spacing.base,
    borderWidth: 1.5, borderColor: c.success,
    ...sombrasDe(c).md,
  },
  selectedAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.success, justifyContent: 'center', alignItems: 'center' },
  selectedName: { fontSize: 17, fontWeight: '800', color: c.onSurface },
  selectedInfo: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: Spacing.base, paddingVertical: 16,
    borderRadius: BorderRadius.lg, borderWidth: 1.5,
    borderColor: c.primary, borderStyle: 'dashed',
    backgroundColor: c.primaryContainer + '60',
    gap: 8,
  },
  newBtnLabel: { fontSize: 15, color: c.primary, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: c.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56,
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.outline,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: c.onSurface },
  modalFooter: { padding: Spacing.base, paddingBottom: 28, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  rowFields: { flexDirection: 'row' },
  cepRow: { flexDirection: 'row', alignItems: 'flex-end' },
  cepSpinner: { marginLeft: 10, marginBottom: 14 },
});
