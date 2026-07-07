import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Alert, Image, Modal,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { getEmpresa, saveEmpresa, getDepoimentos, saveDepoimento, deleteDepoimento } from '../database/database';
import { Empresa, Depoimento, SEGMENTOS, Segmento } from '../types';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { track, Eventos } from '../services/analytics';
import { goBackOrHome } from '../navigation/safeBack';

/**
 * Empresa EM BRANCO para instalações novas (não há seed: getEmpresa() retorna
 * null no primeiro acesso). Sem isto a tela ficava em branco para sempre e o
 * usuário nunca conseguia cadastrar nome/logo/PIX/assinatura — e todo PDF saía
 * sem cabeçalho. Todos os campos obrigatórios do tipo Empresa recebem default
 * válido ('' para string, id fixo) para o objeto nunca conter `undefined`.
 */
function empresaEmBranco(): Empresa {
  return {
    id: 'empresa_1',
    nome: '',
    especialidade: '',
    slogan: '',
    cnpj: '',
    cpf: '',
    endereco: '',
    cidade: '',
    estado: '',
    telefone: '',
    whatsapp: '',
    site: '',
    email: '',
    chavePix: '',
    normas: '',
    nomePrestador: '',
  };
}

export default function MeuNegocioScreen() {
  const nav = useNavigation<any>();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [dirty, setDirty] = useState(false);
  const [depoimentos, setDepoimentos] = useState<Depoimento[]>([]);
  const [showDep, setShowDep] = useState(false);
  const [newDep, setNewDep] = useState<Partial<Depoimento>>({ estrelas: 5 });
  const [salvando, setSalvando] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const [emp, deps] = await Promise.all([getEmpresa(), getDepoimentos()]);
    // Instalação nova ainda sem empresa: inicializa um registro em branco para
    // o formulário aparecer e poder SALVAR (saveEmpresa cria o registro de fato).
    setEmpresa(emp ?? empresaEmBranco());
    setDepoimentos(deps);
    setDirty(false);
  }

  function set(field: keyof Empresa, value: string) {
    setEmpresa(p => p ? { ...p, [field]: value } : p);
    setDirty(true);
  }

  function chooseSegmento(id: Segmento) {
    setEmpresa(p => (p ? { ...p, segmento: id } : p));
    setDirty(true);
    Haptics.selectionAsync().catch(() => {});
    track(Eventos.segmentoChanged, { segmento: id });
  }

  async function handleSave() {
    if (!empresa || salvando) return;
    setSalvando(true);
    try {
      await saveEmpresa(empresa);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDirty(false);
      Alert.alert('Salvo!', 'Dados da empresa atualizados.');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar os dados agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function pickImage(field: 'logoUri' | 'assinaturaUri') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permissão', 'Permita o acesso às fotos.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
    if (!r.canceled && empresa) { setEmpresa({ ...empresa, [field]: r.assets[0].uri }); setDirty(true); }
  }

  async function handleSaveDep() {
    if (!newDep.nomeCliente?.trim()) return;
    await saveDepoimento({ id: generateId(), nomeCliente: newDep.nomeCliente!, estrelas: newDep.estrelas ?? 5, texto: newDep.texto, criadoEm: nowISO() });
    setShowDep(false); setNewDep({ estrelas: 5 }); load();
  }

  if (!empresa) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  return (
    <View style={styles.container}>
      <GradientHeader title="Meu Negócio" subtitle="Aparece no cabeçalho dos seus PDFs" onBack={() => goBackOrHome(nav)} />

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {/* CONTA E BACKUP */}
        <TouchableOpacity style={styles.backupCard} onPress={() => nav.navigate('Tabs', { screen: 'Conta' })} activeOpacity={0.85}>
          <View style={styles.backupIcon}>
            <MaterialCommunityIcons name="cloud-lock-outline" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.backupTitle}>Conta e Backup na nuvem</Text>
            <Text style={styles.backupSubtitle}>Proteja seus dados contra perda do celular</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.primary} />
        </TouchableOpacity>

        {/* LOGO + ASSINATURA */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Identidade visual</Text>
          <View style={styles.brandRow}>
            <View style={styles.brandItem}>
              <TouchableOpacity style={styles.imageBox} onPress={() => pickImage('logoUri')} activeOpacity={0.8}>
                {empresa.logoUri ? <Image source={{ uri: empresa.logoUri }} style={styles.imageFull} resizeMode="contain" /> : (
                  <><MaterialCommunityIcons name="image-plus" size={28} color={Colors.primary} /><Text style={styles.imageHint}>Logo</Text></>
                )}
              </TouchableOpacity>
              <Text style={styles.brandLabel}>Logotipo</Text>
            </View>
            <View style={styles.brandItem}>
              <TouchableOpacity style={styles.imageBox} onPress={() => pickImage('assinaturaUri')} activeOpacity={0.8}>
                {empresa.assinaturaUri ? <Image source={{ uri: empresa.assinaturaUri }} style={styles.imageFull} resizeMode="contain" /> : (
                  <><MaterialCommunityIcons name="draw" size={28} color={Colors.primary} /><Text style={styles.imageHint}>Assinatura</Text></>
                )}
              </TouchableOpacity>
              <Text style={styles.brandLabel}>Assinatura</Text>
            </View>
          </View>
        </View>

        {/* DADOS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dados da empresa</Text>
          <OlliInput label="Nome da empresa" value={empresa.nome} onChangeText={v => set('nome', v)} leftIcon="store" />

          <Text style={styles.segLabel}>Segmento do negócio</Text>
          <Text style={styles.segHint}>O OLLI atende qualquer prestador. O segmento ajusta exemplos e a base técnica.</Text>
          <View style={styles.segRow}>
            {SEGMENTOS.map(s => {
              const active = empresa.segmento === s.id;
              return (
                <TouchableOpacity key={s.id} style={[styles.segChip, active && styles.segChipActive]} onPress={() => chooseSegmento(s.id)} activeOpacity={0.85}>
                  <MaterialCommunityIcons name={s.icon as any} size={16} color={active ? '#0A1626' : Colors.onSurfaceVariant} />
                  <Text style={[styles.segChipText, active && styles.segChipTextActive]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <OlliInput label="Especialidade" value={empresa.especialidade} onChangeText={v => set('especialidade', v)} placeholder="Ex: Assistência técnica de ar condicionado" />
          <OlliInput label="Slogan" value={empresa.slogan} onChangeText={v => set('slogan', v)} placeholder="Frase da sua marca" />
          <OlliInput label="Nome do prestador" value={empresa.nomePrestador} onChangeText={v => set('nomePrestador', v)} leftIcon="account" />
          <View style={styles.rowFields}>
            <OlliInput label="CNPJ" mask="cnpj" value={empresa.cnpj} onChangeText={v => set('cnpj', v)} containerStyle={{ flex: 1, marginRight: 10 }} />
            <OlliInput label="CPF" mask="cpf" value={empresa.cpf} onChangeText={v => set('cpf', v)} containerStyle={{ flex: 1 }} />
          </View>
          <OlliInput label="Endereço" value={empresa.endereco} onChangeText={v => set('endereco', v)} leftIcon="map-marker" />
          <View style={styles.rowFields}>
            <OlliInput label="Cidade" value={empresa.cidade} onChangeText={v => set('cidade', v)} containerStyle={{ flex: 2, marginRight: 10 }} />
            <OlliInput label="UF" value={empresa.estado} onChangeText={v => set('estado', v.toUpperCase().slice(0, 2))} autoCapitalize="characters" maxLength={2} containerStyle={{ flex: 1 }} />
          </View>
          <OlliInput label="Telefone" mask="phone" value={empresa.telefone} onChangeText={v => set('telefone', v)} leftIcon="phone" />
          <OlliInput label="WhatsApp (só números)" mask="phone" value={empresa.whatsapp} onChangeText={v => set('whatsapp', v.replace(/\D/g, ''))} leftIcon="whatsapp" />
          <OlliInput label="Site" value={empresa.site} onChangeText={v => set('site', v)} placeholder="www.suaempresa.com.br" leftIcon="web" autoCapitalize="none" />
          <OlliInput label="E-mail" value={empresa.email} onChangeText={v => set('email', v)} keyboardType="email-address" autoCapitalize="none" leftIcon="email" />
          <OlliInput label="Chave PIX" value={empresa.chavePix} onChangeText={v => set('chavePix', v)} leftIcon="key-variant" />
          <OlliInput label="Normas técnicas" value={empresa.normas} onChangeText={v => set('normas', v)} multiline containerStyle={{ marginBottom: 0 }} />
        </View>

        {/* DEPOIMENTOS */}
        <View style={styles.card}>
          <View style={styles.depHeader}>
            <Text style={styles.cardTitle}>Depoimentos</Text>
            <TouchableOpacity style={styles.addDep} onPress={() => setShowDep(true)}>
              <MaterialCommunityIcons name="plus" size={16} color={Colors.primary} />
              <Text style={styles.addDepText}>Adicionar</Text>
            </TouchableOpacity>
          </View>
          {depoimentos.length === 0 ? (
            <Text style={styles.depEmpty}>Nenhum depoimento. Eles aparecem no rodapé do PDF.</Text>
          ) : depoimentos.map(d => (
            <View key={d.id} style={styles.depItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.depName}>{d.nomeCliente}</Text>
                <Text style={styles.depStars}>{'★'.repeat(d.estrelas)}{'☆'.repeat(5 - d.estrelas)}</Text>
                {d.texto ? <Text style={styles.depText}>{d.texto}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => Alert.alert('Excluir', `Excluir depoimento de "${d.nomeCliente}"?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Excluir', style: 'destructive', onPress: async () => { await deleteDepoimento(d.id); load(); } }])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* SAVE BAR */}
      {dirty && (
        <View style={styles.saveBar}>
          <OlliButton
            label="Salvar alterações"
            variant="gradient"
            size="lg"
            fullWidth
            loading={salvando}
            disabled={salvando}
            onPress={handleSave}
            icon={<MaterialCommunityIcons name="content-save" size={20} color="#fff" />}
          />
        </View>
      )}

      {/* MODAL DEPOIMENTO */}
      <Modal visible={showDep} animationType="slide" onRequestClose={() => setShowDep(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Novo Depoimento</Text>
            <TouchableOpacity onPress={() => { setShowDep(false); setNewDep({ estrelas: 5 }); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="close" size={26} color={Colors.onSurface} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
            <OlliInput label="Nome do cliente" required value={newDep.nomeCliente ?? ''} onChangeText={v => setNewDep(p => ({ ...p, nomeCliente: v }))} placeholder="Nome completo" leftIcon="account" />
            <Text style={styles.starLabel}>Avaliação</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => setNewDep(p => ({ ...p, estrelas: n }))} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={[styles.star, { color: n <= (newDep.estrelas ?? 5) ? '#F59E0B' : '#E5E7EB' }]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
            <OlliInput label="Depoimento (opcional)" value={newDep.texto ?? ''} onChangeText={v => setNewDep(p => ({ ...p, texto: v }))} placeholder="O que o cliente falou..." multiline />
          </ScrollView>
          <View style={styles.modalFooter}>
            <OlliButton label="Salvar depoimento" variant="gradient" size="lg" fullWidth onPress={handleSaveDep} disabled={!newDep.nomeCliente?.trim()} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  backupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primaryContainer, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.base, borderWidth: 1, borderColor: Colors.primary + '40' },
  backupIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  backupTitle: { fontSize: 15, fontWeight: '800', color: Colors.primaryContainerText },
  backupSubtitle: { fontSize: 12, color: Colors.primary, marginTop: 2 },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.base, ...Shadow.sm },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.onSurface, marginBottom: Spacing.base },
  brandRow: { flexDirection: 'row', gap: 16 },
  brandItem: { alignItems: 'center' },
  imageBox: { width: 120, height: 90, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: Colors.primaryContainer + '40' },
  imageFull: { width: '100%', height: '100%' },
  imageHint: { fontSize: 11, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  brandLabel: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 6, fontWeight: '600' },
  rowFields: { flexDirection: 'row' },
  segLabel: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant, marginBottom: 2 },
  segHint: { fontSize: 11.5, color: Colors.onSurfaceMuted, marginBottom: 10 },
  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.base },
  segChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: Colors.outline, backgroundColor: Colors.surfaceVariant },
  segChipActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accentLight },
  segChipText: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant },
  segChipTextActive: { color: '#0A1626' },
  depHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  addDep: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  addDepText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  depEmpty: { fontSize: 13, color: Colors.onSurfaceMuted },
  depItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.outline },
  depName: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  depStars: { fontSize: 15, color: '#F59E0B', marginTop: 2 },
  depText: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 4 },
  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Spacing.base, paddingBottom: 26, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.outline, ...Shadow.lg },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.onSurface },
  modalFooter: { padding: Spacing.base, paddingBottom: 28, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.outline },
  starLabel: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant, marginBottom: 8 },
  starsRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.base },
  star: { fontSize: 34 },
});
