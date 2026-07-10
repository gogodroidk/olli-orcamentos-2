import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, Alert, Modal, ScrollView, ActivityIndicator, RefreshControl, Animated,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { EmptyState } from '../components/EmptyState';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { DicaContextual } from '../components/DicaContextual';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { getClientes, saveCliente, deleteCliente, getOrcamentos } from '../database/database';
import { getAgendamentos } from '../services/agenda';
import { DIAS_RETENCAO_LIXEIRA } from '../services/lixeira';
import { clientesParaReconquistar } from '../services/radarClientes';
import { useCepLookup } from '../services/cep';
import { onSyncAplicado } from '../services/cloudSync';
import { Cliente } from '../types';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { isValidCPF, isValidCNPJ } from '../utils/masks';
import { abrirWhatsApp } from '../utils/pdfGenerator';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

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
      <MaterialCommunityIcons
        name="cloud-sync-outline"
        size={13}
        color={cores.accent} // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 3.28:1 (8.27:1)
      />
      <Text style={styles.syncPillText}>Sincronizando...</Text>
    </Animated.View>
  );
}

export default function ClientesScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
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
  const [refreshing, setRefreshing] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  // Modo de seleção múltipla (exclusão em lote para a Lixeira).
  const [selecionando, setSelecionando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
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

  // Recarrega quando um sync com a nuvem terminar (ex.: login recém-feito
  // trazendo clientes que ainda não existiam localmente).
  useEffect(() => onSyncAplicado(() => { setSincronizando(true); load(); loadRadar(); }), []);

  async function load() {
    const all = await getClientes();
    setClientes(all);
    applyFilter(all, query);
    setCarregando(false);
  }

  const refresh = async () => { setRefreshing(true); await Promise.all([load(), loadRadar()]); setRefreshing(false); };

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

    const aviso = partes.length > 0
      ? `Este cliente tem ${partes.join(' e ')} no histórico. Eles serão mantidos.\n\n`
      : '';
    const mensagem = `${aviso}"${c.nome}" vai para a Lixeira. Você pode restaurá-lo por ${DIAS_RETENCAO_LIXEIRA} dias.`;

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

  // ─── MODO DE SELEÇÃO MÚLTIPLA (exclusão em lote → Lixeira) ─────────────────
  function entrarSelecao(inicialId?: string) {
    setAcoes(null);
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
    setSelecionados(new Set(filtered.map(c => c.id)));
  }

  function handleExcluirSelecionados() {
    const ids = Array.from(selecionados);
    if (!ids.length) return;
    Alert.alert(
      'Excluir selecionados',
      `${ids.length} cliente${ids.length === 1 ? '' : 's'} ${ids.length === 1 ? 'vai' : 'vão'} para a Lixeira. Você pode restaurar por ${DIAS_RETENCAO_LIXEIRA} dias.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive', onPress: async () => {
            try {
              for (const id of ids) {
                try { await deleteCliente(id); } catch { /* pula um; segue o lote */ }
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
      {sincronizando && <SincronizandoPill onDone={() => setSincronizando(false)} />}
      <GradientHeader title="Clientes" subtitle={`${clientes.length} cadastrado${clientes.length === 1 ? '' : 's'}`} onBack={() => goBackOrHome(nav)}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={cores.onSurfaceVariant} />
          <TextInput style={styles.searchInput} placeholder="Buscar por nome ou telefone..." value={query} onChangeText={handleSearch} placeholderTextColor={cores.onSurfaceMuted} />
          {query ? <TouchableOpacity onPress={() => handleSearch('')} accessibilityRole="button" accessibilityLabel="Limpar busca"><MaterialCommunityIcons name="close-circle" size={18} color={cores.onSurfaceMuted} /></TouchableOpacity> : null}
        </View>
      </GradientHeader>

      {/* DICA (1º uso) — o que a tela faz. Tocar num cliente abre o menu de ações
          (verOrcamentos / novoOrcamento / agendarVisita / chamarWhatsApp / editar). */}
      {/* Sem padding VERTICAL: DicaContextual devolve null quando dispensada, mas o
          wrapper continua na arvore — um View com paddingTop e sem filho ainda ocupa
          essa altura, deixando um vao permanente depois do "Entendi". O card da dica
          ja traz o proprio marginTop. */}
      <View style={{ paddingHorizontal: Spacing.base }}>
        <DicaContextual
          id="clientes.acoes"
          icon="gesture-tap"
          texto="Cadastre seus clientes aqui. Toque em um cliente para criar orçamento, agendar visita ou chamar no WhatsApp na hora."
        />
      </View>

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
        contentContainerStyle={{ paddingTop: Spacing.base, paddingHorizontal: Spacing.base, gap: 10, flexGrow: 1, paddingBottom: (selecionando ? 100 : Spacing.base + 80) + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[cores.primary]} tintColor={cores.primary} />}
        renderItem={({ item: c, index }) => {
          const marcado = selecionados.has(c.id);
          return (
          <AnimatedEntrance index={index}>
            <TouchableOpacity
              style={[styles.card, selecionando && marcado && styles.cardSelected]}
              activeOpacity={0.85}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                if (selecionando) alternarSelecao(c.id); else setAcoes(c);
              }}
              onLongPress={() => { Haptics.selectionAsync().catch(() => {}); entrarSelecao(c.id); }}
            >
              {selecionando && (
                <MaterialCommunityIcons
                  name={marcado ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={24}
                  color={marcado ? cores.accentLight : cores.onSurfaceMuted}
                  style={{ marginRight: 10 }}
                />
              )}
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
              {!selecionando && (
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => { setEditing({ ...c }); setIsNew(false); setErrors({}); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={`Editar ${c.nome}`}>
                    <MaterialCommunityIcons name="pencil-outline" size={20} color={cores.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(c)} disabled={excluindoId === c.id} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={`Excluir ${c.nome}`}>
                    {excluindoId === c.id
                      ? <ActivityIndicator size="small" color={cores.danger} />
                      : <MaterialCommunityIcons name="trash-can-outline" size={20} color={cores.danger} />}
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          </AnimatedEntrance>
          );
        }}
        ListHeaderComponent={
          !carregando && filtered.length > 0 ? (
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
          ) : null
        }
        ListEmptyComponent={<EmptyState icon="account-group-outline" title="Nenhum cliente" subtitle="Cadastre seus clientes para agilizar os orçamentos." actionLabel="Novo cliente" onAction={() => { setEditing({}); setIsNew(true); setErrors({}); }} />}
      />
      )}

      {!selecionando && (
        <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 24 }]} onPress={() => { setEditing({}); setIsNew(true); setErrors({}); }} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Novo cliente">
          <MaterialCommunityIcons name="plus" size={28} color={cores.onPrimary} />
        </TouchableOpacity>
      )}

      {/* BARRA DE AÇÃO — excluir selecionados (vai para a Lixeira) */}
      {selecionando && selecionados.size > 0 && (
        <View style={[styles.bulkBar, { paddingBottom: insets.bottom + 16 }]}>
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

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => { setEditing(null); setErrors({}); }}>
        {editing && (
          <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isNew ? 'Novo Cliente' : 'Editar Cliente'}</Text>
              <TouchableOpacity onPress={() => { setEditing(null); setErrors({}); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
                <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
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
                {cepLoading && <ActivityIndicator size="small" color={cores.primary} style={styles.cepSpinner} />}
              </View>
            </ScrollView>
            <View style={[styles.modalFooter, { paddingBottom: insets.bottom + Spacing.base }]}>
              <OlliButton label="Salvar cliente" variant="gradient" size="lg" fullWidth loading={salvando} onPress={handleSave} disabled={!editing.nome?.trim() || salvando} icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />} />
            </View>
          </KeyboardAvoidingView>
        )}
      </Modal>

      {/* MENU DE AÇÕES DO CLIENTE (CRM) */}
      <Modal visible={!!acoes} transparent animationType="fade" onRequestClose={() => setAcoes(null)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setAcoes(null)}>
          <TouchableOpacity style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} activeOpacity={1} onPress={() => {}}>
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

                <SheetAction icon="file-document-multiple-outline" color={cores.primaryLight} label="Ver orçamentos" desc="Histórico deste cliente" onPress={() => verOrcamentos(acoes)} />
                <SheetAction
                  icon="file-plus-outline"
                  color={cores.accent} // contraste-ok: prop só vira o fundo/borda translúcidos do chip (color+'1E'/'3A' sobre c.surface — não se toca); o ícone real usa iconColor=cores.accentLight, que já mede 4.73:1 no claro / 6.23:1 no escuro sobre esse fundo (4.73:1)
                  iconColor={cores.accentLight}
                  label="Novo orçamento"
                  desc="Já com este cliente"
                  onPress={() => novoOrcamento(acoes)}
                />
                <SheetAction icon="calendar-plus" color="#A78BFA" label="Agendar visita" desc="Adicionar à agenda" onPress={() => agendarVisita(acoes)} />
                <SheetAction icon="whatsapp" color={cores.whatsapp} label="WhatsApp" desc="Falar com o cliente" onPress={() => chamarWhatsApp(acoes)} />
                <SheetAction icon="pencil-outline" color={cores.onSurfaceVariant} label="Editar cadastro" desc="Dados do cliente" onPress={() => editarCliente(acoes)} />
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function SheetAction({ icon, color, iconColor, label, desc, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string; iconColor?: string; label: string; desc: string; onPress: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <TouchableOpacity style={styles.sheetItem} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.sheetIcon, { backgroundColor: color + '1E', borderColor: color + '3A' }]}>
        {/* `color` pinta a tinta/borda do chip (fundo — não se toca). O glifo pode precisar
            de um tom mais escuro para passar contraste sobre esse chip claro: `iconColor`. */}
        <MaterialCommunityIcons name={icon} size={20} color={iconColor ?? color} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.sheetItemTitle}>{label}</Text>
        <Text style={styles.sheetItemDesc}>{desc}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
    </TouchableOpacity>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  syncPill: {
    position: 'absolute', top: 8, alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    // Pill sempre escura de propósito (como um toast): flutua sobre o header,
    // que é sempre um banner colorido/escuro nos dois modos (ver GradientHeader).
    backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: c.strokeGlow,
    borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6,
    ...sombrasDe(c).sm,
  },
  // Pill escura FIXA (rgba(10,22,38,0.92)) nos dois modos: o primeiro plano tem que
  // ficar CLARO nos dois. `accentLight` escurece no claro (#197884 → 3.28:1, reprova
  // texto); `accent` fica #34C6D9 nos dois modos (8.27:1). No escuro os dois são iguais.
  syncPillText: { fontSize: 11.5, fontWeight: '700', color: c.accent }, // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 3.28:1 (8.27:1)
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.lg, paddingHorizontal: 14, paddingVertical: 11, gap: 8, marginTop: 14, borderWidth: 1, borderColor: c.outline },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, ...sombrasDe(c).sm },
  cardSelected: { backgroundColor: c.surfacePressed, borderWidth: 1, borderColor: c.accent },
  selToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 },
  // Cyan fixo (não segue a cor de marca escolhida): decorativo, sem chave semântica exata.
  selEnter: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(52,198,217,0.10)', borderWidth: 1, borderColor: 'rgba(52,198,217,0.30)',
  },
  selEnterLabel: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  selCancel: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant },
  selCount: { fontSize: 13, fontWeight: '800', color: c.onSurface },
  selAll: { fontSize: 13, fontWeight: '800', color: c.accentLight },
  bulkBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: Spacing.base, paddingTop: 10, paddingBottom: 22,
    // Barra sempre escura de propósito (like a toast/bottom-bar): sem chave que
    // represente "fundo escuro fixo" nos dois modos — ver rule 7 da migração.
    backgroundColor: 'rgba(7,17,31,0.98)', borderTopWidth: 1, borderTopColor: c.strokeGlow,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: c.primary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: c.onSurface },
  // Amarelo/warning fixo do handoff cockpit; próximo de `warningLight` mas alfa/hex não batem (ver rule 7).
  radarBadge: { backgroundColor: 'rgba(247,178,59,0.14)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.34)', borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  radarBadgeText: { fontSize: 10, fontWeight: '800', color: c.warning },
  info: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },
  infoMuted: { fontSize: 12, color: c.onSurfaceMuted, marginTop: 1 },
  cardActions: { flexDirection: 'row', gap: 16 },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center', ...sombrasDe(c).lg, shadowColor: c.primary, shadowOpacity: 0.4 },
  modal: { flex: 1, backgroundColor: c.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.outline },
  modalTitle: { fontSize: 20, fontWeight: '800', color: c.onSurface },
  modalFooter: { padding: Spacing.base, paddingBottom: 28, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  rowFields: { flexDirection: 'row' },
  cepRow: { flexDirection: 'row', alignItems: 'flex-end' },
  cepSpinner: { marginLeft: 10, marginBottom: 14 },

  // Scrim do bottom sheet: escurece o fundo sempre, nos dois modos (convenção
  // padrão de overlay de modal — sem chave "scrim" na paleta).
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(5,12,22,0.72)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: c.outline, paddingHorizontal: Spacing.base, paddingTop: 10, paddingBottom: 32 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.outlineDark, marginBottom: Spacing.base },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.base, paddingHorizontal: 2 },
  sheetName: { fontSize: 17, fontWeight: '800', color: c.onSurface },
  sheetSub: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.md, marginBottom: 10 },
  sheetIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  sheetItemTitle: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  sheetItemDesc: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2 },
});
