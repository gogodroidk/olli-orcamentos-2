import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, RefreshControl, ActivityIndicator, Modal, Image, Platform, Linking,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, corStatusOS, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { EmptyState } from '../components/EmptyState';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { useTipoConta } from '../hooks/useTipoConta';
import { usePermissao } from '../hooks/usePermissao';
import { useVerticais } from '../hooks/useVerticais';
import { modeloChecklistVertical } from '../services/checklistVertical';
// Contrato da ONDA 4 — ÚNICA superfície de import da frente B (além de types).
import {
  getOrdens,
  getMinhasOrdens,
  getOrdem,
  criarOSDeOrcamento,
  criarOSManual,
  atualizarStatusOS,
  atribuirTecnico,
  atualizarChecklist,
  adicionarFotoOS,
} from '../services/ordemServico';
import { STATUS_OS_LABELS, STATUS_OS_CORES, STATUS_LABELS } from '../types';
import type { OrdemServico, StatusOS, ItemChecklist, Orcamento, Cliente } from '../types';
// Superfícies pré-existentes (somente leitura — não modificadas por esta frente):
// orçamentos aprovados/convertidos p/ criar OS, membros da equipe p/ atribuir,
// helper de foto já usado no app, e o id do usuário logado.
import { getOrcamentos, getCliente } from '../database/database';
import { abrirRotaGoogleMaps } from '../services/rotas';
import { abrirWhatsApp } from '../utils/exportarDocumento';
import { listarMembros, type MembroEquipe } from '../services/equipe';
import { getCurrentUser } from '../services/supabase';
import {
  adicionarFotoCamera,
  adicionarFotoGaleria,
  abrirConfiguracoesPermissao,
} from '../utils/fotosOrcamento';
import { generateId } from '../utils/id';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Ordem de exibição dos status no filtro de gestão (mesma ordem do type). */
const STATUS_OS_ORDEM: StatusOS[] = [
  'aberta', 'agendada', 'em_execucao', 'pausada', 'concluida', 'cancelada',
];

/** Data ISO → "12/03 às 14:30" (curto). Vazio se não houver data. */
function formatarDataCurta(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${mes} às ${hora}:${min}`;
}

/** Valor numérico → "R$ 1.234,56". */
function formatarValor(v?: number): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─────────────────────────────────────────────────────────────
// Badge de status da OS (rótulo + cor do contrato).
// ─────────────────────────────────────────────────────────────
function StatusOSBadge({ status }: { status: StatusOS }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const corBase = STATUS_OS_CORES[status];
  const cor = corBase ? corStatusOS(corBase, cores.surface) : cores.onSurfaceVariant;
  const fundo = corBase ?? cores.onSurfaceVariant;
  return (
    <View style={[styles.statusBadge, { backgroundColor: fundo + '22', borderColor: fundo + '66' }]}>
      <Text style={[styles.statusBadgeText, { color: cor }]}>{STATUS_OS_LABELS[status] ?? status}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Tela principal — role-aware ("interface por função").
// ─────────────────────────────────────────────────────────────
export default function OrdemServicoScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { org, carregando: carregandoConta } = useTipoConta();
  const { pode, papel } = usePermissao();
  const insets = useSafeAreaInsets();

  // GESTÃO = quem pode ver a agenda/relatórios da equipe (owner/admin/gestor) ou
  // conta pessoal (dono de si). TÉCNICO = papel 'tecnico' numa organização.
  const ehTecnico = papel === 'tecnico';
  const ehGestao = !ehTecnico;

  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState<StatusOS | 'todas'>('todas');
  const [busca, setBusca] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  // Detalhe (modal full-screen) — mantém a OS aberta.
  const [detalheId, setDetalheId] = useState<string | null>(null);
  // "+ Nova OS" (só gestão).
  const [showNova, setShowNova] = useState(false);

  useEffect(() => {
    let ativo = true;
    getCurrentUser()
      .then((u) => { if (ativo) setUserId(u?.id ?? null); })
      .catch(() => {});
    return () => { ativo = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      // Técnico só vê as próprias OS; sem id ainda, mostra vazio (não vaza tudo).
      const lista = ehTecnico
        ? (userId ? await getMinhasOrdens(userId) : [])
        : await getOrdens();
      // Mais recentes primeiro (atualizadoEm desc).
      lista.sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''));
      setOrdens(lista);
    } catch {
      setOrdens([]);
    } finally {
      setCarregando(false);
    }
  }, [ehTecnico, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Recarrega quando o id do técnico chega depois do primeiro foco.
  useEffect(() => { if (ehTecnico && userId) load(); }, [ehTecnico, userId, load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtradas = useMemo(() => {
    let r = ordens;
    if (ehGestao && filtro !== 'todas') r = r.filter((o) => o.status === filtro);
    const q = busca.trim().toLowerCase();
    if (q) {
      r = r.filter((o) =>
        (o.clienteNome || '').toLowerCase().includes(q) ||
        (o.titulo || '').toLowerCase().includes(q) ||
        (o.numero || '').toLowerCase().includes(q),
      );
    }
    return r;
  }, [ordens, filtro, busca, ehGestao]);

  function abrirDetalhe(id: string) {
    Haptics.selectionAsync().catch(() => {});
    setDetalheId(id);
  }

  const renderItem = ({ item, index }: { item: OrdemServico; index: number }) => {
    const feitos = item.checklist?.filter((c) => c.feito).length ?? 0;
    const total = item.checklist?.length ?? 0;
    const data = formatarDataCurta(item.dataAgendada);
    return (
      <AnimatedEntrance index={index}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => abrirDetalhe(item.id)}
        >
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.cardTitulo} numberOfLines={1}>{item.titulo || 'Ordem de serviço'}</Text>
              <Text style={styles.cardCliente} numberOfLines={1}>{item.clienteNome || 'Sem cliente'}</Text>
            </View>
            <StatusOSBadge status={item.status} />
          </View>

          <View style={styles.cardMetaRow}>
            <Text style={styles.cardMeta} numberOfLines={1}>Nº {item.numero}</Text>
            {data ? (
              <View style={styles.metaChip}>
                <MaterialCommunityIcons name="calendar-clock-outline" size={12} color={cores.onSurfaceVariant} />
                <Text style={styles.metaChipText}>{data}</Text>
              </View>
            ) : null}
            {total > 0 ? (
              <View style={styles.metaChip}>
                <MaterialCommunityIcons name="checkbox-marked-outline" size={12} color={cores.onSurfaceVariant} />
                <Text style={styles.metaChipText}>{feitos}/{total}</Text>
              </View>
            ) : null}
            {(item.fotos?.length ?? 0) > 0 ? (
              <View style={styles.metaChip}>
                <MaterialCommunityIcons name="image-multiple-outline" size={12} color={cores.onSurfaceVariant} />
                <Text style={styles.metaChipText}>{item.fotos.length}</Text>
              </View>
            ) : null}
          </View>

          {ehGestao && item.tecnicoNome ? (
            <View style={styles.tecnicoRow}>
              <MaterialCommunityIcons name="account-hard-hat" size={13} color={cores.accentLight} />
              <Text style={styles.tecnicoText} numberOfLines={1}>{item.tecnicoNome}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </AnimatedEntrance>
    );
  };

  // ─── Carregando conta (papel ainda indefinido) ───────────────
  if (carregandoConta) {
    return (
      <View style={styles.container}>
        <GradientHeader onBack={() => goBackOrHome(nav)} title="Ordens de serviço" />
        <View style={{ padding: Spacing.base, gap: 12 }}>
          <OlliSkeleton width="100%" height={92} radius={18} />
          <OlliSkeleton width="100%" height={92} radius={18} />
          <OlliSkeleton width="100%" height={92} radius={18} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GradientHeader
        onBack={() => goBackOrHome(nav)}
        title={ehTecnico ? 'Minhas OS' : 'Ordens de serviço'}
        subtitle={ehTecnico ? 'Suas ordens em campo' : org?.nome}
        right={
          ehGestao ? (
            <TouchableOpacity
              style={styles.newBtn}
              activeOpacity={0.85}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowNova(true); }}
            >
              <MaterialCommunityIcons name="plus" size={20} color="#fff" />
              <Text style={styles.newBtnLabel}>Nova OS</Text>
            </TouchableOpacity>
          ) : undefined
        }
      >
        <View style={styles.searchRow}>
          <MaterialCommunityIcons name="magnify" size={20} color={cores.onSurfaceVariant} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por cliente, título ou nº..."
            value={busca}
            onChangeText={setBusca}
            placeholderTextColor={cores.onSurfaceMuted}
          />
          {busca ? (
            <TouchableOpacity onPress={() => setBusca('')} accessibilityRole="button" accessibilityLabel="Limpar busca">
              <MaterialCommunityIcons name="close-circle" size={18} color={cores.onSurfaceMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </GradientHeader>

      {/* Filtro por status — só na gestão (o técnico vê a fila enxuta dele). */}
      {ehGestao && (
        <View>
          <FlatList
            horizontal
            data={['todas', ...STATUS_OS_ORDEM] as Array<StatusOS | 'todas'>}
            keyExtractor={(k) => k}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingVertical: 8, gap: 8 }}
            renderItem={({ item: k }) => {
              const ativo = filtro === k;
              const label = k === 'todas' ? 'Todas' : STATUS_OS_LABELS[k];
              return (
                <TouchableOpacity
                  style={[styles.chip, ativo && styles.chipActive]}
                  onPress={() => setFiltro(k)}
                >
                  <Text style={[styles.chipLabel, ativo && styles.chipLabelActive]}>{label}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {carregando ? (
        <View style={{ paddingHorizontal: Spacing.base, paddingTop: 8, gap: 12 }}>
          <OlliSkeleton width="100%" height={92} radius={18} />
          <OlliSkeleton width="100%" height={92} radius={18} />
          <OlliSkeleton width="100%" height={92} radius={18} />
        </View>
      ) : (
        <FlatList
          data={filtradas}
          keyExtractor={(o) => o.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 90 + insets.bottom, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[cores.primary]} tintColor={cores.accentLight} />}
          ListEmptyComponent={
            <EmptyState
              icon="clipboard-check-outline"
              title={ehTecnico ? 'Nenhuma OS para você' : 'Nenhuma ordem de serviço'}
              subtitle={
                busca
                  ? 'Nenhum resultado para sua busca.'
                  : ehTecnico
                  ? 'Quando o escritório te atribuir uma ordem, ela aparece aqui.'
                  : 'Crie a primeira ordem a partir de um orçamento aprovado ou manualmente.'
              }
              actionLabel={ehGestao && !busca ? 'Nova OS' : undefined}
              onAction={ehGestao && !busca ? () => setShowNova(true) : undefined}
            />
          }
        />
      )}

      {/* Detalhe da OS (modal full-screen) */}
      {detalheId && (
        <DetalheOS
          ordemId={detalheId}
          ehGestao={ehGestao}
          podeAtribuir={ehGestao && pode('ver_agenda_equipe')}
          orgId={org?.id}
          onFechar={() => setDetalheId(null)}
          onMudou={() => load()}
        />
      )}

      {/* Nova OS (gestão) */}
      {showNova && (
        <NovaOS
          onFechar={() => setShowNova(false)}
          onCriada={(id) => {
            setShowNova(false);
            load();
            setDetalheId(id);
          }}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Detalhe da OS — ações de campo (técnico) / gestão completa.
// ─────────────────────────────────────────────────────────────
function DetalheOS({
  ordemId, ehGestao, podeAtribuir, orgId, onFechar, onMudou,
}: {
  ordemId: string;
  ehGestao: boolean;
  podeAtribuir: boolean;
  orgId?: string;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const [ordem, setOrdem] = useState<OrdemServico | null>(null);
  // Contato/endereço do cliente para Ligar/WhatsApp/Ir até lá — a OS não os
  // carrega (só clienteId), então buscamos o Cliente à parte quando há id.
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvandoStatus, setSalvandoStatus] = useState<StatusOS | null>(null);
  const [addingFoto, setAddingFoto] = useState(false);
  const [showAtribuir, setShowAtribuir] = useState(false);

  // Debounce do autosave do checklist para não gravar a cada toque.
  const checklistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const o = await getOrdem(ordemId);
    setOrdem(o);
    setCarregando(false);
    // Busca o contato/endereço do cliente (não bloqueia a OS já exibida).
    if (o?.clienteId) {
      try { setCliente(await getCliente(o.clienteId)); } catch { setCliente(null); }
    } else {
      setCliente(null);
    }
  }, [ordemId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Derivados do cliente para os atalhos de campo (vazio = botão não aparece).
  const telefoneCliente = cliente?.telefone?.trim() || '';
  const enderecoCliente = cliente
    ? [cliente.endereco, cliente.cidade, cliente.estado].map((p) => (p || '').trim()).filter(Boolean).join(', ')
    : '';

  // Checklist pronto do ofício (vazio p/ 'geral'/sem ofício → botão some).
  const { verticais } = useVerticais();
  const modeloOficio = modeloChecklistVertical(verticais?.[0]);

  // Limpa o timer do checklist ao desmontar (evita gravar em componente morto).
  useEffect(() => () => {
    if (checklistTimer.current) clearTimeout(checklistTimer.current);
  }, []);

  async function mudarStatus(status: StatusOS) {
    if (!ordem || ordem.status === status) return;
    Haptics.selectionAsync().catch(() => {});
    setSalvandoStatus(status);
    try {
      await atualizarStatusOS(ordem.id, status);
      // Updater funcional: parte do estado ATUAL (não do 'ordem' do closure, que
      // pode estar stale após o await — ex.: edições otimistas de checklist com
      // debounce pendente). Preserva tudo e só troca o status.
      setOrdem((prev) => (prev ? { ...prev, status } : prev));
      onMudou();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Não deu', e?.message ?? 'Não consegui mudar o status agora.');
    } finally {
      setSalvandoStatus(null);
    }
  }

  function toggleItem(itemId: string) {
    if (!ordem) return;
    Haptics.selectionAsync().catch(() => {});
    // Updater funcional: computa a nova lista a partir do estado ATUAL e reusa a
    // mesma referência para persistir — sem clobber entre mutações concorrentes.
    let listaParaSalvar: ItemChecklist[] | null = null;
    setOrdem((prev) => {
      if (!prev) return prev;
      const novo = prev.checklist.map((c) => (c.id === itemId ? { ...c, feito: !c.feito } : c));
      listaParaSalvar = novo;
      return { ...prev, checklist: novo };
    });
    if (!listaParaSalvar) return;
    const paraSalvar = listaParaSalvar;
    // Autosave com debounce (offline-first: o service persiste local e sincroniza).
    if (checklistTimer.current) clearTimeout(checklistTimer.current);
    checklistTimer.current = setTimeout(() => {
      atualizarChecklist(ordem.id, paraSalvar).then(onMudou).catch(() => Alert.alert('Não deu', 'Não consegui salvar a alteração do checklist. Tente de novo.'));
    }, 500);
  }

  function adicionarItem(texto: string) {
    if (!ordem) return;
    const t = texto.trim();
    if (!t) return;
    const item: ItemChecklist = { id: generateId(), texto: t, feito: false };
    // Updater funcional: acrescenta ao estado ATUAL (não ao closure), preservando
    // toggles/remoções concorrentes; persiste a mesma lista recém-computada.
    let listaParaSalvar: ItemChecklist[] | null = null;
    setOrdem((prev) => {
      if (!prev) return prev;
      const novo = [...prev.checklist, item];
      listaParaSalvar = novo;
      return { ...prev, checklist: novo };
    });
    if (!listaParaSalvar) return;
    atualizarChecklist(ordem.id, listaParaSalvar).then(onMudou).catch(() => Alert.alert('Não deu', 'Não consegui salvar a alteração do checklist. Tente de novo.'));
  }

  /** Kickstart: aplica o checklist do ofício, pulando itens de texto já presente. */
  function aplicarModeloChecklist() {
    if (!ordem || modeloOficio.length === 0) return;
    Haptics.selectionAsync().catch(() => {});
    let listaParaSalvar: ItemChecklist[] | null = null;
    setOrdem((prev) => {
      if (!prev) return prev;
      const existentes = new Set(prev.checklist.map((c) => c.texto.trim().toLowerCase()));
      const novos: ItemChecklist[] = modeloOficio
        .filter((t) => !existentes.has(t.trim().toLowerCase()))
        .map((t) => ({ id: generateId(), texto: t, feito: false }));
      if (novos.length === 0) return prev;
      const novo = [...prev.checklist, ...novos];
      listaParaSalvar = novo;
      return { ...prev, checklist: novo };
    });
    if (!listaParaSalvar) return;
    atualizarChecklist(ordem.id, listaParaSalvar).then(onMudou).catch(() => Alert.alert('Não deu', 'Não consegui salvar a alteração do checklist. Tente de novo.'));
  }

  function removerItem(itemId: string) {
    if (!ordem) return;
    // Updater funcional: remove a partir do estado ATUAL e persiste a mesma lista.
    let listaParaSalvar: ItemChecklist[] | null = null;
    setOrdem((prev) => {
      if (!prev) return prev;
      const novo = prev.checklist.filter((c) => c.id !== itemId);
      listaParaSalvar = novo;
      return { ...prev, checklist: novo };
    });
    if (!listaParaSalvar) return;
    atualizarChecklist(ordem.id, listaParaSalvar).then(onMudou).catch(() => Alert.alert('Não deu', 'Não consegui salvar a alteração do checklist. Tente de novo.'));
  }

  async function tirarFoto(origem: 'camera' | 'galeria') {
    if (!ordem) return;
    setAddingFoto(true);
    try {
      const res = origem === 'camera'
        ? await adicionarFotoCamera(ordem.fotos)
        : await adicionarFotoGaleria(ordem.fotos);

      if (res.erro === 'PERMISSAO_NEGADA_PERMANENTE') {
        Alert.alert(
          origem === 'camera' ? 'Câmera bloqueada' : 'Galeria bloqueada',
          'Libere o acesso nas configurações do app para anexar fotos.',
          [
            { text: 'Agora não', style: 'cancel' },
            { text: 'Abrir ajustes', onPress: () => abrirConfiguracoesPermissao() },
          ],
        );
        return;
      }
      if (res.erro) {
        Alert.alert('Não deu', res.erro);
        return;
      }
      if (!res.uris.length) return; // usuário cancelou

      // Persiste cada foto via o contrato; atualiza o estado ao final.
      for (const uri of res.uris) {
        await adicionarFotoOS(ordem.id, uri);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const atualizado = await getOrdem(ordem.id);
      if (atualizado) setOrdem(atualizado);
      onMudou();
    } catch (e: any) {
      Alert.alert('Não deu', e?.message ?? 'Não consegui salvar a foto agora.');
    } finally {
      setAddingFoto(false);
    }
  }

  const feitos = ordem?.checklist?.filter((c) => c.feito).length ?? 0;
  const total = ordem?.checklist?.length ?? 0;
  const concluida = ordem?.status === 'concluida';

  return (
    <Modal visible animationType="slide" onRequestClose={onFechar} presentationStyle="fullScreen">
      <View style={styles.detalheContainer}>
        <GradientHeader
          onBack={onFechar}
          title={ordem?.titulo || 'Ordem de serviço'}
          subtitle={ordem?.numero ? `Nº ${ordem.numero}` : undefined}
          right={ordem ? <StatusOSBadge status={ordem.status} /> : undefined}
        />

        {carregando || !ordem ? (
          <View style={{ padding: Spacing.base, gap: 12 }}>
            <OlliSkeleton width="100%" height={80} radius={16} />
            <OlliSkeleton width="100%" height={120} radius={16} />
            <OlliSkeleton width="100%" height={160} radius={16} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{
              paddingTop: Spacing.base, paddingHorizontal: Spacing.base,
              gap: Spacing.base, paddingBottom: 120 + insets.bottom,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Resumo */}
            <View style={styles.bloco}>
              <LinhaInfo icon="account-outline" label="Cliente" valor={ordem.clienteNome || '—'} />
              {ordem.dataAgendada ? (
                <LinhaInfo icon="calendar-clock-outline" label="Agendada" valor={formatarDataCurta(ordem.dataAgendada)} />
              ) : null}
              {typeof ordem.valor === 'number' ? (
                <LinhaInfo icon="cash" label="Valor" valor={formatarValor(ordem.valor)} />
              ) : null}
              {ordem.tecnicoNome ? (
                <LinhaInfo icon="account-hard-hat" label="Técnico" valor={ordem.tecnicoNome} />
              ) : null}
              {ordem.descricao ? (
                <Text style={styles.descricao}>{ordem.descricao}</Text>
              ) : null}
            </View>

            {/* Atalhos de campo — o técnico liga e vai até o cliente sem sair da OS. */}
            {(telefoneCliente || enderecoCliente) ? (
              <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
                {telefoneCliente ? (
                  <AcaoRapida
                    icon="phone"
                    label="Ligar"
                    cor={cores.success}
                    onPress={() =>
                      Linking.openURL(`tel:${telefoneCliente.replace(/[^\d+]/g, '')}`).catch(() =>
                        Alert.alert('Ops', 'Não consegui abrir o telefone.'),
                      )
                    }
                  />
                ) : null}
                {telefoneCliente ? (
                  <AcaoRapida
                    icon="whatsapp"
                    label="WhatsApp"
                    cor="#25D366"
                    onPress={() => abrirWhatsApp(telefoneCliente, `Olá! Sobre o serviço "${ordem.titulo}".`)}
                  />
                ) : null}
                {enderecoCliente ? (
                  <AcaoRapida
                    icon="map-marker-outline"
                    label="Ir até lá"
                    cor={cores.primary}
                    onPress={() => abrirRotaGoogleMaps(enderecoCliente)}
                  />
                ) : null}
              </View>
            ) : null}

            {/* Atribuir técnico (só gestão com permissão) */}
            {podeAtribuir && (
              <TouchableOpacity
                style={styles.atribuirBtn}
                activeOpacity={0.85}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowAtribuir(true); }}
              >
                <MaterialCommunityIcons name="account-arrow-right-outline" size={18} color={cores.accentLight} />
                <Text style={styles.atribuirBtnText}>
                  {ordem.tecnicoNome ? 'Trocar técnico' : 'Atribuir técnico'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Status — mudança rápida */}
            <View style={styles.bloco}>
              <Text style={styles.blocoTitulo}>Status</Text>
              <View style={styles.statusGrid}>
                {STATUS_OS_ORDEM.filter((s) => s !== 'cancelada' || ehGestao).map((s) => {
                  const ativo = ordem.status === s;
                  const corBase = STATUS_OS_CORES[s];
                  const cor = corBase ? corStatusOS(corBase, cores.surface) : cores.primary;
                  const fundo = corBase ?? cores.primary;
                  const salvando = salvandoStatus === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.statusOpt, ativo && { backgroundColor: fundo + '22', borderColor: cor }]}
                      activeOpacity={0.85}
                      disabled={salvando}
                      onPress={() => mudarStatus(s)}
                    >
                      {salvando ? (
                        <ActivityIndicator size="small" color={cor} />
                      ) : (
                        <Text style={[styles.statusOptText, ativo && { color: cor }]}>{STATUS_OS_LABELS[s]}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Checklist */}
            <View style={styles.bloco}>
              <View style={styles.blocoHeaderRow}>
                <Text style={styles.blocoTitulo}>Checklist</Text>
                {total > 0 ? <Text style={styles.blocoContador}>{feitos}/{total}</Text> : null}
              </View>
              {ordem.checklist.length === 0 ? (
                <>
                  <Text style={styles.vazioTexto}>Nenhum item ainda. Adicione o que precisa ser feito.</Text>
                  {modeloOficio.length > 0 ? (
                    <TouchableOpacity
                      style={styles.atribuirBtn}
                      activeOpacity={0.85}
                      onPress={aplicarModeloChecklist}
                      accessibilityRole="button"
                      accessibilityLabel="Usar checklist do meu ofício"
                    >
                      <MaterialCommunityIcons name="clipboard-list-outline" size={18} color={cores.accentLight} />
                      <Text style={styles.atribuirBtnText}>Usar checklist do meu ofício</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                ordem.checklist.map((c) => (
                  <View key={c.id} style={styles.checkRow}>
                    <TouchableOpacity
                      style={styles.checkTap}
                      activeOpacity={0.7}
                      onPress={() => toggleItem(c.id)}
                    >
                      <MaterialCommunityIcons
                        name={c.feito ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={22}
                        color={c.feito ? cores.success : cores.onSurfaceVariant}
                      />
                      <Text style={[styles.checkTexto, c.feito && styles.checkTextoFeito]} numberOfLines={2}>
                        {c.texto}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removerItem(c.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Remover item"
                    >
                      <MaterialCommunityIcons name="close" size={18} color={cores.onSurfaceMuted} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
              <AdicionarItemChecklist onAdicionar={adicionarItem} />
            </View>

            {/* Fotos */}
            <View style={styles.bloco}>
              <Text style={styles.blocoTitulo}>Fotos do serviço</Text>
              {ordem.fotos.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {ordem.fotos.map((uri) => (
                      <Image key={uri} source={{ uri }} style={styles.foto} />
                    ))}
                  </View>
                </ScrollView>
              ) : (
                <Text style={styles.vazioTexto}>Registre o antes e o depois direto do campo.</Text>
              )}
              <View style={styles.fotoBtnRow}>
                <TouchableOpacity style={styles.fotoBtn} activeOpacity={0.85} disabled={addingFoto} onPress={() => tirarFoto('camera')}>
                  {addingFoto ? (
                    <ActivityIndicator size="small" color={cores.accentLight} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="camera-plus-outline" size={18} color={cores.accentLight} />
                      <Text style={styles.fotoBtnText}>Câmera</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.fotoBtn} activeOpacity={0.85} disabled={addingFoto} onPress={() => tirarFoto('galeria')}>
                  <MaterialCommunityIcons name="image-multiple-outline" size={18} color={cores.accentLight} />
                  <Text style={styles.fotoBtnText}>Galeria</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Observações — só leitura (registradas na criação da OS) */}
            {ordem.observacoes ? (
              <View style={styles.bloco}>
                <Text style={styles.blocoTitulo}>Observações</Text>
                <Text style={styles.descricao}>{ordem.observacoes}</Text>
              </View>
            ) : null}

            {/* Concluir — grande, para o técnico fechar em 1 toque */}
            <OlliButton
              label={concluida ? 'Serviço concluído' : 'Concluir serviço'}
              variant={concluida ? 'success' : 'gradient'}
              size="lg"
              fullWidth
              loading={salvandoStatus === 'concluida'}
              disabled={concluida}
              onPress={() => mudarStatus('concluida')}
              icon={<MaterialCommunityIcons name="check-circle-outline" size={22} color="#fff" />}
              style={{ marginTop: Spacing.sm }}
            />
          </ScrollView>
        )}
      </View>

      {/* Modal atribuir técnico */}
      {showAtribuir && ordem && (
        <ModalAtribuir
          orgId={orgId}
          ordemId={ordem.id}
          tecnicoAtual={ordem.tecnicoId}
          onFechar={() => setShowAtribuir(false)}
          onAtribuido={(id, nome) => {
            setOrdem((prev) => (prev ? { ...prev, tecnicoId: id, tecnicoNome: nome } : prev));
            setShowAtribuir(false);
            onMudou();
          }}
        />
      )}
    </Modal>
  );
}

/** Linha ícone + label + valor no bloco de resumo. */
function LinhaInfo({ icon, label, valor }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; valor: string }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons name={icon} size={16} color={cores.onSurfaceVariant} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValor} numberOfLines={1}>{valor}</Text>
    </View>
  );
}

/** Atalho de campo (Ligar / WhatsApp / Ir até lá) — pílula colorida com feedback tátil. */
function AcaoRapida({
  icon, label, cor, onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  cor: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: BorderRadius.full,
        backgroundColor: cor + '1E',
        borderWidth: 1,
        borderColor: cor + '55',
      }}
    >
      <MaterialCommunityIcons name={icon} size={18} color={cor} />
      <Text style={{ color: cor, fontWeight: '700', fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Campo inline para adicionar um item ao checklist. */
function AdicionarItemChecklist({ onAdicionar }: { onAdicionar: (texto: string) => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [texto, setTexto] = useState('');
  function confirmar() {
    if (!texto.trim()) return;
    onAdicionar(texto);
    setTexto('');
  }
  return (
    <View style={styles.addItemRow}>
      <TextInput
        style={styles.addItemInput}
        value={texto}
        onChangeText={setTexto}
        placeholder="Adicionar item..."
        placeholderTextColor={cores.onSurfaceMuted}
        onSubmitEditing={confirmar}
        returnKeyType="done"
      />
      <TouchableOpacity onPress={confirmar} style={styles.addItemBtn} accessibilityRole="button" accessibilityLabel="Adicionar item">
        <MaterialCommunityIcons name="plus" size={20} color={cores.accentLight} />
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal — atribuir técnico (lista membros da equipe).
// ─────────────────────────────────────────────────────────────
function ModalAtribuir({
  orgId, ordemId, tecnicoAtual, onFechar, onAtribuido,
}: {
  orgId?: string;
  ordemId: string;
  tecnicoAtual?: string;
  onFechar: () => void;
  onAtribuido: (id: string, nome: string) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const [membros, setMembros] = useState<MembroEquipe[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      if (!orgId) { setCarregando(false); return; }
      const lista = await listarMembros(orgId);
      if (!ativo) return;
      // Membros ativos; técnicos no topo (são os que executam em campo).
      const ativos = lista.filter((m) => m.ativo);
      const peso = (p: MembroEquipe['papel']) => (p === 'tecnico' ? 0 : 1);
      ativos.sort((a, b) => peso(a.papel) - peso(b.papel));
      setMembros(ativos);
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [orgId]);

  async function atribuir(m: MembroEquipe) {
    const nome = m.nome || m.email || 'Técnico';
    setSalvandoId(m.userId);
    try {
      await atribuirTecnico(ordemId, m.userId, nome);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onAtribuido(m.userId, nome);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Não deu', e?.message ?? 'Não consegui atribuir agora.');
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFechar}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Atribuir técnico</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.base }}>
            {carregando ? (
              <View style={{ gap: 10 }}>
                <OlliSkeleton width="100%" height={56} radius={14} />
                <OlliSkeleton width="100%" height={56} radius={14} />
              </View>
            ) : membros.length === 0 ? (
              <Text style={styles.vazioTexto}>
                {orgId ? 'Nenhum membro ativo na equipe. Convide técnicos na tela Equipe.' : 'Crie a conta empresa para ter uma equipe.'}
              </Text>
            ) : (
              membros.map((m) => {
                const nome = m.nome || m.email || 'Técnico';
                const inicial = nome.charAt(0).toUpperCase();
                const atual = m.userId === tecnicoAtual;
                return (
                  <TouchableOpacity
                    key={m.userId}
                    style={[styles.membroRow, atual && styles.membroRowAtual]}
                    activeOpacity={0.85}
                    disabled={salvandoId === m.userId}
                    onPress={() => atribuir(m)}
                  >
                    <View style={styles.membroAvatar}>
                      <Text style={styles.membroAvatarText}>{inicial}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.membroNome} numberOfLines={1}>{nome}</Text>
                      <Text style={styles.membroPapel}>{m.papel === 'tecnico' ? 'Técnico' : m.papel}</Text>
                    </View>
                    {salvandoId === m.userId ? (
                      <ActivityIndicator size="small" color={cores.accentLight} />
                    ) : atual ? (
                      <MaterialCommunityIcons name="check-circle" size={22} color={cores.success} />
                    ) : (
                      <MaterialCommunityIcons name="chevron-right" size={22} color={cores.onSurfaceMuted} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal — Nova OS (de orçamento aprovado OU manual).
// ─────────────────────────────────────────────────────────────
function NovaOS({ onFechar, onCriada }: { onFechar: () => void; onCriada: (id: string) => void }) {
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const [modo, setModo] = useState<'escolha' | 'orcamento' | 'manual'>('escolha');
  const [criando, setCriando] = useState(false);

  return (
    <Modal visible animationType="slide" onRequestClose={onFechar} presentationStyle="fullScreen">
      <View style={styles.detalheContainer}>
        <GradientHeader
          onBack={modo === 'escolha' ? onFechar : () => setModo('escolha')}
          title="Nova ordem de serviço"
          subtitle={modo === 'orcamento' ? 'De um orçamento aprovado' : modo === 'manual' ? 'Manual' : undefined}
        />

        {modo === 'escolha' && (
          <ScrollView contentContainerStyle={{
            paddingTop: Spacing.base, paddingHorizontal: Spacing.base,
            gap: Spacing.md, paddingBottom: Spacing.base + insets.bottom,
          }}>
            <OpcaoNova
              icon="file-check-outline"
              titulo="De um orçamento aprovado"
              descricao="Traz cliente, título e valor de um orçamento fechado."
              onPress={() => setModo('orcamento')}
            />
            <OpcaoNova
              icon="clipboard-plus-outline"
              titulo="Manual"
              descricao="Crie uma OS do zero, sem orçamento vinculado."
              onPress={() => setModo('manual')}
            />
          </ScrollView>
        )}

        {modo === 'orcamento' && (
          <NovaOSDeOrcamento
            criando={criando}
            onCriar={async (orcamentoId) => {
              setCriando(true);
              try {
                const os = await criarOSDeOrcamento(orcamentoId);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                onCriada(os.id);
              } catch (e: any) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                Alert.alert('Não deu', e?.message ?? 'Não consegui criar a OS agora.');
              } finally {
                setCriando(false);
              }
            }}
          />
        )}

        {modo === 'manual' && (
          <NovaOSManual
            criando={criando}
            onCriar={async (parcial) => {
              setCriando(true);
              try {
                const os = await criarOSManual(parcial);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                onCriada(os.id);
              } catch (e: any) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                Alert.alert('Não deu', e?.message ?? 'Não consegui criar a OS agora.');
              } finally {
                setCriando(false);
              }
            }}
          />
        )}
      </View>
    </Modal>
  );
}

function OpcaoNova({ icon, titulo, descricao, onPress }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap; titulo: string; descricao: string; onPress: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <TouchableOpacity style={styles.opcaoCard} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.opcaoIcon}>
        <MaterialCommunityIcons name={icon} size={24} color={cores.accentLight} />
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={styles.opcaoTitulo}>{titulo}</Text>
        <Text style={styles.opcaoDesc}>{descricao}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color={cores.onSurfaceMuted} />
    </TouchableOpacity>
  );
}

/** Passo "de um orçamento aprovado" — lista orçamentos aprovados/convertidos. */
function NovaOSDeOrcamento({ criando, onCriar }: { criando: boolean; onCriar: (orcamentoId: string) => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [todos, ordens] = await Promise.all([getOrcamentos(), getOrdens()]);
        // Um orçamento gera no máximo uma OS: esconde os que já têm ordem gerada
        // (cruza pelo orcamentoId) para o duplicado nem aparecer na lista.
        const jaComOS = new Set(
          ordens.map((os) => os.orcamentoId).filter((id): id is string => !!id),
        );
        const elegiveis = todos.filter(
          (o) => (o.status === 'aprovado' || o.status === 'convertido') && !jaComOS.has(o.id),
        );
        if (ativo) setOrcamentos(elegiveis);
      } catch {
        if (ativo) setOrcamentos([]);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, []);

  if (carregando) {
    return (
      <View style={{ padding: Spacing.base, gap: 10 }}>
        <OlliSkeleton width="100%" height={70} radius={16} />
        <OlliSkeleton width="100%" height={70} radius={16} />
      </View>
    );
  }

  if (orcamentos.length === 0) {
    return (
      <EmptyState
        icon="file-check-outline"
        title="Nenhum orçamento aprovado"
        subtitle="Aprove ou converta um orçamento para poder gerar uma ordem de serviço a partir dele."
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={orcamentos}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{
          paddingTop: Spacing.base, paddingHorizontal: Spacing.base,
          gap: 10, paddingBottom: 100 + insets.bottom,
        }}
        renderItem={({ item: o }) => {
          const sel = selecionado === o.id;
          return (
            <TouchableOpacity
              style={[styles.orcRow, sel && styles.orcRowSel]}
              activeOpacity={0.85}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelecionado(o.id); }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.orcCliente} numberOfLines={1}>{o.clienteNome}</Text>
                <Text style={styles.orcMeta}>Nº {o.numero} · {STATUS_LABELS[o.status]}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.orcValor}>{formatarValor(o.valorTotal)}</Text>
                {sel ? <MaterialCommunityIcons name="check-circle" size={20} color={cores.success} style={{ marginTop: 4 }} /> : null}
              </View>
            </TouchableOpacity>
          );
        }}
      />
      <View style={[styles.rodapeAcao, { paddingBottom: insets.bottom + Spacing.base }]}>
        <OlliButton
          label="Gerar ordem de serviço"
          variant="gradient"
          size="lg"
          fullWidth
          loading={criando}
          disabled={!selecionado}
          onPress={() => selecionado && onCriar(selecionado)}
          icon={<MaterialCommunityIcons name="clipboard-check-outline" size={20} color="#fff" />}
        />
      </View>
    </View>
  );
}

/** Passo "manual" — form mínimo (cliente + título; descrição opcional). */
function NovaOSManual({ criando, onCriar }: { criando: boolean; onCriar: (parcial: Partial<OrdemServico>) => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const [clienteNome, setClienteNome] = useState('');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');

  const valido = clienteNome.trim().length > 0 && titulo.trim().length > 0;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: Spacing.base, paddingHorizontal: Spacing.base,
        gap: Spacing.sm, paddingBottom: 120 + insets.bottom,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <OlliInput
        label="Cliente"
        required
        value={clienteNome}
        onChangeText={setClienteNome}
        placeholder="Nome do cliente"
        leftIcon="account-outline"
      />
      <OlliInput
        label="Título do serviço"
        required
        value={titulo}
        onChangeText={setTitulo}
        placeholder="Ex.: Manutenção do ar-condicionado"
        leftIcon="clipboard-text-outline"
      />
      <Text style={styles.manualLabel}>Descrição (opcional)</Text>
      <TextInput
        style={styles.obsInput}
        value={descricao}
        onChangeText={setDescricao}
        placeholder="Detalhes do que precisa ser feito..."
        placeholderTextColor={cores.onSurfaceMuted}
        multiline
      />
      <OlliButton
        label="Criar ordem de serviço"
        variant="gradient"
        size="lg"
        fullWidth
        loading={criando}
        disabled={!valido}
        onPress={() => onCriar({
          clienteNome: clienteNome.trim(),
          titulo: titulo.trim(),
          descricao: descricao.trim() || undefined,
        })}
        icon={<MaterialCommunityIcons name="clipboard-check-outline" size={20} color="#fff" />}
        style={{ marginTop: Spacing.base }}
      />
    </ScrollView>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  detalheContainer: { flex: 1, backgroundColor: c.background },

  // Dentro do GradientHeader (sempre colorido, nos dois modos) — glass branco
  // fixo, mesma convenção do próprio GradientHeader.
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full,
  },
  newBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.surfaceVariant, borderWidth: 1, borderColor: c.outline,
    marginTop: 14, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.base, paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface },

  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline,
  },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipLabel: { fontSize: 12, fontWeight: '600', color: c.onSurfaceVariant },
  // Era '#fff' fixo sobre fundo chapado c.primary — vira onPrimary (contraste
  // calculado), correto pra qualquer cor de marca escolhida pelo usuário.
  chipLabelActive: { color: c.onPrimary },

  // Card da OS
  card: {
    backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outlineDark,
    marginHorizontal: Spacing.base, marginBottom: 10, padding: Spacing.base, ...sombrasDe(c).sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  // Era '#fff' fixo — o card fica sobre a superfície da tela (c.surfaceGlass,
  // quase branco no claro), ficava ilegível; vira onSurface do tema.
  cardTitulo: { fontSize: 15.5, fontWeight: '800', color: c.onSurface },
  cardCliente: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  cardMeta: { fontSize: 12, color: c.onSurfaceMuted, fontWeight: '600' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaChipText: { fontSize: 11.5, color: c.onSurfaceVariant, fontWeight: '600' },
  tecnicoRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  tecnicoText: { fontSize: 12, color: c.accentLight, fontWeight: '700' },

  statusBadge: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },

  // Detalhe
  bloco: {
    backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.base, ...sombrasDe(c).sm,
  },
  blocoHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Era '#fff' fixo sobre c.surfaceGlass — mesmo motivo do cardTitulo acima.
  blocoTitulo: { fontSize: 15, fontWeight: '800', color: c.onSurface, marginBottom: 4 },
  blocoContador: { fontSize: 13, fontWeight: '800', color: c.accentLight },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  infoLabel: { fontSize: 13, color: c.onSurfaceVariant, width: 72 },
  // Era '#fff' fixo sobre c.surfaceGlass — mesmo motivo do cardTitulo acima.
  infoValor: { flex: 1, fontSize: 14, color: c.onSurface, fontWeight: '700', textAlign: 'right' },
  descricao: { fontSize: 13.5, color: c.onSurfaceVariant, lineHeight: 20, marginTop: 8 },

  atribuirBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.accentContainer, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.strokeGlow, paddingVertical: 13,
  },
  atribuirBtnText: { fontSize: 14.5, fontWeight: '800', color: c.accentLight },

  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  statusOpt: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: BorderRadius.full,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, minWidth: 92, alignItems: 'center',
  },
  statusOptText: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant },

  vazioTexto: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 19, marginTop: 6 },

  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.outline },
  checkTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Era '#fff' fixo sobre c.surfaceGlass — mesmo motivo do cardTitulo acima.
  checkTexto: { flex: 1, fontSize: 14, color: c.onSurface },
  checkTextoFeito: { color: c.onSurfaceMuted, textDecorationLine: 'line-through' },

  addItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  addItemInput: {
    flex: 1, backgroundColor: c.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.outline, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: c.onSurface,
  },
  addItemBtn: {
    width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.accentContainer, borderWidth: 1, borderColor: c.strokeGlow,
  },

  foto: { width: 96, height: 96, borderRadius: BorderRadius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline },
  fotoBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  fotoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: c.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.strokeGlow, paddingVertical: 12,
  },
  fotoBtnText: { fontSize: 13.5, fontWeight: '800', color: c.accentLight },

  obsInput: {
    backgroundColor: c.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: c.onSurface,
    minHeight: 88, textAlignVertical: 'top', marginTop: 4,
  },
  manualLabel: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant, marginTop: 6, marginBottom: 2 },

  // Sheets / modais
  // Scrim padrão de modal — sempre escuro, convenção universal de overlay.
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: Platform.OS === 'ios' ? 24 : 8 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, borderBottomWidth: 1, borderBottomColor: c.outline },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: c.onSurface },

  membroRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceGlass,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.md, marginBottom: 10,
  },
  membroRowAtual: { borderColor: c.success, backgroundColor: c.successLight },
  membroAvatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  membroAvatarText: { fontSize: 18, fontWeight: '800', color: c.accentLight },
  // Era '#fff' fixo sobre c.surfaceGlass — mesmo motivo do cardTitulo acima.
  membroNome: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  membroPapel: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },

  // Nova OS
  opcaoCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceGlass,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.base, ...sombrasDe(c).sm,
  },
  opcaoIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: c.accentContainer, alignItems: 'center', justifyContent: 'center' },
  // Era '#fff' fixo sobre c.surfaceGlass — mesmo motivo do cardTitulo acima.
  opcaoTitulo: { fontSize: 16, fontWeight: '800', color: c.onSurface },
  opcaoDesc: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 3, lineHeight: 18 },

  orcRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceGlass,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.base,
  },
  orcRowSel: { borderColor: c.accent, backgroundColor: c.accentContainer },
  // Era '#fff' fixo sobre c.surfaceGlass — mesmo motivo do cardTitulo acima.
  orcCliente: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  orcMeta: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  orcValor: { fontSize: 15, fontWeight: '800', color: c.primaryLight },

  rodapeAcao: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: Spacing.base, backgroundColor: c.background,
    borderTopWidth: 1, borderTopColor: c.outline,
  },
});
