import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, RefreshControl, Modal, Image, Platform, Share,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, useCores, useGradientes, useEstilos, sombrasDe, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { EmptyState } from '../components/EmptyState';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { DicaContextual } from '../components/DicaContextual';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { usePermissao } from '../hooks/usePermissao';
// Contrato da FRENTE A — ÚNICA superfície de import desta frente (além de types).
import {
  getEquipamentos,
  getEquipamento,
  salvarEquipamento,
  removerEquipamento,
  revogarQr,
  adicionarFotoEquip,
  urlEtiqueta,
} from '../services/equipamentos';
import {
  STATUS_EQUIP_LABELS,
  STATUS_EQUIP_CORES,
  CATEGORIAS_HVAC,
} from '../types';
import type {
  Equipamento,
  SituacaoEquipamento,
  CriticidadeEquipamento,
  CategoriaHvac,
  Cliente,
} from '../types';
// Superfície pré-existente (só leitura — o seletor de cliente reusa a busca do app).
import { searchClientes } from '../database/database';
// Helper de foto já usado no app (câmera/galeria + compressão + storage permanente).
// CUIDADO: adicionarFotoEquip do service MESCLA [...atuais, ...novas], não substitui.
import {
  adicionarFotoCamera,
  adicionarFotoGaleria,
  abrirConfiguracoesPermissao,
} from '../utils/fotosOrcamento';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Ordem de exibição das situações no filtro (mesma ordem lógica do type/contrato). */
const SITUACOES_ORDEM: SituacaoEquipamento[] = [
  'ativo', 'reserva', 'parado', 'em_manutencao', 'interditado',
  'desativado', 'retirado', 'substituido', 'descartado',
];

/**
 * Criticidades (id + rótulo + cor) para o seletor no form e o chip no detalhe.
 * Função (não array de módulo): as cores vêm da paleta atual — um array fixo
 * congelaria as cores no import, como o resto desta migração evita.
 */
function criarCriticidades(c: Cores): { id: CriticidadeEquipamento; label: string; cor: string }[] {
  return [
    { id: 'baixa', label: 'Baixa', cor: c.onSurfaceVariant },
    { id: 'media', label: 'Média', cor: c.warning },
    { id: 'alta', label: 'Alta', cor: '#F97316' },
    { id: 'critica', label: 'Crítica', cor: c.danger },
  ];
}

/** Rótulo curto da categoria a partir do id (texto livre → melhor esforço). */
function labelCategoria(id?: string): string {
  if (!id) return '';
  const found = CATEGORIAS_HVAC.find((c) => c.id === id);
  return found ? found.label : id;
}

/** Ícone da categoria (fallback para um genérico de ar-condicionado). */
function iconeCategoria(id?: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const found = CATEGORIAS_HVAC.find((c) => c.id === id);
  return (found?.icon as keyof typeof MaterialCommunityIcons.glyphMap) ?? 'air-conditioner';
}

/** "9.000 BTU" a partir do número (vazio se ausente/ inválido). */
function formatarBtu(v?: number): string {
  if (typeof v !== 'number' || Number.isNaN(v) || v <= 0) return '';
  return `${v.toLocaleString('pt-BR')} BTU`;
}

// ─────────────────────────────────────────────────────────────
// Badge de situação (rótulo + cor do contrato).
// ─────────────────────────────────────────────────────────────
function SituacaoBadge({ situacao }: { situacao: SituacaoEquipamento }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const cor = STATUS_EQUIP_CORES[situacao] ?? cores.onSurfaceVariant;
  return (
    <View style={[styles.statusBadge, { backgroundColor: cor + '22', borderColor: cor + '66' }]}>
      <Text style={[styles.statusBadgeText, { color: cor }]}>
        {STATUS_EQUIP_LABELS[situacao] ?? situacao}
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════
// Tela principal — inventário de equipamentos HVAC (PMOC Fase 1).
// ═════════════════════════════════════════════════════════════
export default function EquipamentoScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  // Atalho para os Planos PMOC (Fase 2): só quem gerencia planos vê (o técnico não).
  const { pode } = usePermissao();

  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState<SituacaoEquipamento | 'todas'>('todas');
  const [busca, setBusca] = useState('');

  // Detalhe (modal full-screen).
  const [detalheId, setDetalheId] = useState<string | null>(null);
  // Form de novo/editar (id = edição; 'novo' = criar).
  const [editando, setEditando] = useState<Equipamento | 'novo' | null>(null);

  const load = useCallback(async () => {
    try {
      const lista = await getEquipamentos();
      // Mais recentes primeiro (atualizadoEm desc).
      lista.sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''));
      setEquipamentos(lista);
    } catch {
      setEquipamentos([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtrados = useMemo(() => {
    let r = equipamentos;
    if (filtro !== 'todas') r = r.filter((e) => e.situacao === filtro);
    const q = busca.trim().toLowerCase();
    if (q) {
      r = r.filter((e) =>
        (e.codigoInterno || '').toLowerCase().includes(q) ||
        (e.numeroSerie || '').toLowerCase().includes(q) ||
        (e.patrimonio || '').toLowerCase().includes(q) ||
        (e.fabricante || '').toLowerCase().includes(q) ||
        (e.modelo || '').toLowerCase().includes(q) ||
        (e.localizacao || '').toLowerCase().includes(q),
      );
    }
    return r;
  }, [equipamentos, filtro, busca]);

  function abrirDetalhe(id: string) {
    Haptics.selectionAsync().catch(() => {});
    setDetalheId(id);
  }

  const renderItem = ({ item, index }: { item: Equipamento; index: number }) => {
    const titulo = item.codigoInterno
      || [item.fabricante, item.modelo].filter(Boolean).join(' ')
      || labelCategoria(item.categoria)
      || 'Equipamento';
    const linha2 = [labelCategoria(item.categoria), formatarBtu(item.capacidadeBtu)]
      .filter(Boolean).join(' · ');
    return (
      <AnimatedEntrance index={index}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => abrirDetalhe(item.id)}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <MaterialCommunityIcons name={iconeCategoria(item.categoria)} size={22} color={cores.accentLight} />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 10 }}>
              <Text style={styles.cardTitulo} numberOfLines={1}>{titulo}</Text>
              {linha2 ? <Text style={styles.cardSub} numberOfLines={1}>{linha2}</Text> : null}
            </View>
            <SituacaoBadge situacao={item.situacao} />
          </View>

          <View style={styles.cardMetaRow}>
            {item.numeroSerie ? (
              <View style={styles.metaChip}>
                <MaterialCommunityIcons name="barcode" size={12} color={cores.onSurfaceVariant} />
                <Text style={styles.metaChipText} numberOfLines={1}>{item.numeroSerie}</Text>
              </View>
            ) : null}
            {item.localizacao ? (
              <View style={styles.metaChip}>
                <MaterialCommunityIcons name="map-marker-outline" size={12} color={cores.onSurfaceVariant} />
                <Text style={styles.metaChipText} numberOfLines={1}>{item.localizacao}</Text>
              </View>
            ) : null}
            {(item.fotos?.length ?? 0) > 0 ? (
              <View style={styles.metaChip}>
                <MaterialCommunityIcons name="image-multiple-outline" size={12} color={cores.onSurfaceVariant} />
                <Text style={styles.metaChipText}>{item.fotos.length}</Text>
              </View>
            ) : null}
            {item.qrRevogadoEm ? (
              <View style={styles.metaChip}>
                <MaterialCommunityIcons name="qrcode-remove" size={12} color={cores.danger} />
                <Text style={[styles.metaChipText, { color: cores.danger }]}>QR revogado</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      </AnimatedEntrance>
    );
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        onBack={() => goBackOrHome(nav)}
        title="Equipamentos"
        subtitle="Inventário HVAC · PMOC"
        right={
          <TouchableOpacity
            style={styles.newBtn}
            activeOpacity={0.85}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setEditando('novo'); }}
          >
            <MaterialCommunityIcons name="plus" size={20} color="#fff" />
            <Text style={styles.newBtnLabel}>Novo</Text>
          </TouchableOpacity>
        }
      >
        <View style={styles.searchRow}>
          <MaterialCommunityIcons name="magnify" size={20} color={cores.onSurfaceVariant} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por código, série, marca ou local..."
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
        {pode('ver_valores_agregados') && (
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Pmoc'); }}
            accessibilityRole="button"
            accessibilityLabel="Planos de manutenção PMOC"
            style={styles.pmocAtalho}
          >
            <MaterialCommunityIcons name="calendar-sync-outline" size={16} color="#fff" />
            <Text style={styles.pmocAtalhoText}>Planos de manutenção (PMOC)</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={gradientes.sobreHeader} />
          </TouchableOpacity>
        )}
      </GradientHeader>

      {/* Filtro por situação. */}
      <View>
        <FlatList
          horizontal
          data={['todas', ...SITUACOES_ORDEM] as Array<SituacaoEquipamento | 'todas'>}
          keyExtractor={(k) => k}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingVertical: 8, gap: 8 }}
          renderItem={({ item: k }) => {
            const ativo = filtro === k;
            const label = k === 'todas' ? 'Todas' : STATUS_EQUIP_LABELS[k];
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

      {/* DICA (1º uso) — a etiqueta QR da porta física.
          A página pública `/q/<token>` (worker/src/pmoc.js) mostra DE PROPÓSITO só o
          mínimo: prestador, código, categoria, situação e um contato. Nada de
          histórico, cliente, endereço, contrato ou valores — é uma etiqueta colada
          numa porta, qualquer um escaneia. E o `qrToken` nasce vazio: o backend o
          gera no primeiro sync (services/equipamentos.ts). O texto abaixo precisa
          respeitar as duas coisas. */}
      <View style={{ paddingHorizontal: Spacing.base }}>
        <DicaContextual
          id="equipamento.etiqueta-qr"
          icon="qrcode"
          texto="Depois de sincronizar com a nuvem, cada equipamento ganha uma etiqueta QR para colar na porta. Quem escanear vê a identificação do aparelho e como falar com o responsável pela manutenção."
        />
      </View>

      {carregando ? (
        <View style={{ paddingHorizontal: Spacing.base, paddingTop: 8, gap: 12 }}>
          <OlliSkeleton width="100%" height={92} radius={18} />
          <OlliSkeleton width="100%" height={92} radius={18} />
          <OlliSkeleton width="100%" height={92} radius={18} />
        </View>
      ) : (
        <FlatList
          data={filtrados}
          keyExtractor={(e) => e.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 90, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[cores.primary]} tintColor={cores.accentLight} />}
          ListEmptyComponent={
            <EmptyState
              icon="air-conditioner"
              title={busca || filtro !== 'todas' ? 'Nada por aqui' : 'Nenhum equipamento ainda'}
              subtitle={
                busca || filtro !== 'todas'
                  ? 'Nenhum equipamento bate com esse filtro. Tente outra busca.'
                  : 'Cadastre o primeiro ar-condicionado do inventário e gere a etiqueta QR para a porta.'
              }
              actionLabel={!busca && filtro === 'todas' ? 'Novo equipamento' : undefined}
              onAction={!busca && filtro === 'todas' ? () => setEditando('novo') : undefined}
            />
          }
        />
      )}

      {/* Detalhe (modal full-screen) */}
      {detalheId && (
        <DetalheEquipamento
          equipamentoId={detalheId}
          onFechar={() => setDetalheId(null)}
          onEditar={(eq) => { setDetalheId(null); setEditando(eq); }}
          onMudou={() => load()}
          onRemovido={() => { setDetalheId(null); load(); }}
        />
      )}

      {/* Form novo/editar (modal full-screen) */}
      {editando && (
        <FormEquipamento
          inicial={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={(id) => {
            setEditando(null);
            load();
            // Só abre o detalhe se temos um id real (edição, ou criação cujo
            // service devolveu a linha persistida). Sem id, apenas atualiza a lista.
            if (id) setDetalheId(id);
          }}
        />
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════
// Detalhe do equipamento — dados + fotos + etiqueta/QR + revogar.
// ═════════════════════════════════════════════════════════════
function DetalheEquipamento({
  equipamentoId, onFechar, onEditar, onMudou, onRemovido,
}: {
  equipamentoId: string;
  onFechar: () => void;
  onEditar: (eq: Equipamento) => void;
  onMudou: () => void;
  onRemovido: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const CRITICIDADES = criarCriticidades(cores);
  const [eq, setEq] = useState<Equipamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [addingFoto, setAddingFoto] = useState(false);
  const [revogando, setRevogando] = useState(false);
  const [showEtiqueta, setShowEtiqueta] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const e = await getEquipamento(equipamentoId);
    setEq(e);
    setCarregando(false);
  }, [equipamentoId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function tirarFoto(origem: 'camera' | 'galeria') {
    if (!eq) return;
    setAddingFoto(true);
    try {
      const res = origem === 'camera'
        ? await adicionarFotoCamera(eq.fotos)
        : await adicionarFotoGaleria(eq.fotos);

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

      // O service mescla [...atuais, ...novas] a cada chamada — passamos uma URI
      // por vez (ele preserva as já existentes) para não duplicar/substituir.
      for (const uri of res.uris) {
        await adicionarFotoEquip(eq.id, uri);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const atualizado = await getEquipamento(eq.id);
      if (atualizado) setEq(atualizado);
      onMudou();
    } catch (e: any) {
      Alert.alert('Não deu', e?.message ?? 'Não consegui salvar a foto agora.');
    } finally {
      setAddingFoto(false);
    }
  }

  function confirmarRevogar() {
    if (!eq) return;
    Alert.alert(
      'Revogar QR?',
      'A etiqueta atual deixa de funcionar: quem escanear o QR verá que ele foi revogado. Use quando o adesivo for perdido, copiado ou trocado. Esta ação não pode ser desfeita pelo app.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revogar',
          style: 'destructive',
          onPress: async () => {
            setRevogando(true);
            try {
              await revogarQr(eq.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              const atualizado = await getEquipamento(eq.id);
              if (atualizado) setEq(atualizado);
              onMudou();
            } catch (err: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
              Alert.alert('Não deu', err?.message ?? 'Não consegui revogar o QR agora.');
            } finally {
              setRevogando(false);
            }
          },
        },
      ],
    );
  }

  function confirmarRemover() {
    if (!eq) return;
    Alert.alert(
      'Excluir equipamento?',
      'O equipamento e suas fotos saem do inventário. Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await removerEquipamento(eq.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              onRemovido();
            } catch (err: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
              Alert.alert('Não deu', err?.message ?? 'Não consegui excluir agora.');
            }
          },
        },
      ],
    );
  }

  const titulo = eq
    ? (eq.codigoInterno || [eq.fabricante, eq.modelo].filter(Boolean).join(' ') || labelCategoria(eq.categoria) || 'Equipamento')
    : 'Equipamento';
  const criticidade = eq?.criticidade ? CRITICIDADES.find((c) => c.id === eq.criticidade) : undefined;

  return (
    <Modal visible animationType="slide" onRequestClose={onFechar} presentationStyle="fullScreen">
      <View style={styles.detalheContainer}>
        <GradientHeader
          onBack={onFechar}
          title={titulo}
          subtitle={eq ? labelCategoria(eq.categoria) || undefined : undefined}
          right={eq ? <SituacaoBadge situacao={eq.situacao} /> : undefined}
        />

        {carregando || !eq ? (
          <View style={{ padding: Spacing.base, gap: 12 }}>
            <OlliSkeleton width="100%" height={80} radius={16} />
            <OlliSkeleton width="100%" height={120} radius={16} />
            <OlliSkeleton width="100%" height={160} radius={16} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: Spacing.base, paddingBottom: 120, gap: Spacing.base }}
            showsVerticalScrollIndicator={false}
          >
            {/* Ficha técnica */}
            <View style={styles.bloco}>
              <Text style={styles.blocoTitulo}>Ficha técnica</Text>
              <LinhaInfo icon="tag-outline" label="Código" valor={eq.codigoInterno || '—'} />
              <LinhaInfo icon="factory" label="Fabricante" valor={eq.fabricante || '—'} />
              <LinhaInfo icon="cog-outline" label="Modelo" valor={eq.modelo || '—'} />
              <LinhaInfo icon="barcode" label="Nº série" valor={eq.numeroSerie || '—'} />
              {eq.patrimonio ? <LinhaInfo icon="clipboard-list-outline" label="Patrimônio" valor={eq.patrimonio} /> : null}
              {formatarBtu(eq.capacidadeBtu) ? <LinhaInfo icon="snowflake" label="Capacidade" valor={formatarBtu(eq.capacidadeBtu)} /> : null}
              {eq.tensao ? <LinhaInfo icon="flash-outline" label="Tensão" valor={eq.tensao} /> : null}
              {eq.refrigerante ? <LinhaInfo icon="water-outline" label="Refrigerante" valor={eq.refrigerante} /> : null}
              {eq.localizacao ? <LinhaInfo icon="map-marker-outline" label="Local" valor={eq.localizacao} /> : null}
              {criticidade ? (
                <View style={styles.infoRow}>
                  <MaterialCommunityIcons name="alert-outline" size={16} color={cores.onSurfaceVariant} />
                  <Text style={styles.infoLabel}>Criticidade</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <View style={[styles.critChip, { backgroundColor: criticidade.cor + '22', borderColor: criticidade.cor + '66' }]}>
                      <Text style={[styles.critChipText, { color: criticidade.cor }]}>{criticidade.label}</Text>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>

            {/* Caveat legal PMOC — nunca declarar conformidade automática. */}
            <View style={styles.caveat}>
              <MaterialCommunityIcons name="information-outline" size={15} color={cores.onSurfaceVariant} />
              <Text style={styles.caveatText}>
                A situação indica o estado operacional do equipamento — não é uma
                declaração de conformidade com o PMOC nem com norma legal.
              </Text>
            </View>

            {/* Fotos */}
            <View style={styles.bloco}>
              <Text style={styles.blocoTitulo}>Fotos</Text>
              {eq.fotos.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {eq.fotos.map((uri) => (
                      <Image key={uri} source={{ uri }} style={styles.foto} />
                    ))}
                  </View>
                </ScrollView>
              ) : (
                <Text style={styles.vazioTexto}>Registre a placa de dados, a etiqueta e o local de instalação.</Text>
              )}
              <View style={styles.fotoBtnRow}>
                <TouchableOpacity style={styles.fotoBtn} activeOpacity={0.85} disabled={addingFoto} onPress={() => tirarFoto('camera')}>
                  <MaterialCommunityIcons name="camera-plus-outline" size={18} color={cores.accentLight} />
                  <Text style={styles.fotoBtnText}>Câmera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.fotoBtn} activeOpacity={0.85} disabled={addingFoto} onPress={() => tirarFoto('galeria')}>
                  <MaterialCommunityIcons name="image-multiple-outline" size={18} color={cores.accentLight} />
                  <Text style={styles.fotoBtnText}>Galeria</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Etiqueta / QR */}
            <View style={styles.bloco}>
              <Text style={styles.blocoTitulo}>Etiqueta / QR</Text>
              {eq.qrRevogadoEm ? (
                <View style={styles.qrRevogadoBox}>
                  <MaterialCommunityIcons name="qrcode-remove" size={20} color={cores.danger} />
                  <Text style={styles.qrRevogadoText}>
                    QR revogado. Gere uma nova etiqueta com a equipe responsável para voltar a usar o scan.
                  </Text>
                </View>
              ) : eq.qrToken ? (
                <>
                  <Text style={styles.vazioTexto}>
                    A etiqueta física leva ao histórico deste equipamento quando escaneada.
                  </Text>
                  <TouchableOpacity
                    style={styles.acaoLinha}
                    activeOpacity={0.85}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowEtiqueta(true); }}
                  >
                    <MaterialCommunityIcons name="qrcode" size={20} color={cores.accentLight} />
                    <Text style={styles.acaoLinhaText}>Ver etiqueta / QR</Text>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={styles.vazioTexto}>
                  A etiqueta é gerada assim que o equipamento sincroniza com a nuvem. Fique online um instante e volte aqui.
                </Text>
              )}
            </View>

            {/* Ações */}
            <View style={{ gap: 10 }}>
              <OlliButton
                label="Editar equipamento"
                variant="secondary"
                size="lg"
                fullWidth
                onPress={() => onEditar(eq)}
                icon={<MaterialCommunityIcons name="pencil-outline" size={20} color="#fff" />}
              />
              {eq.qrToken && !eq.qrRevogadoEm ? (
                <OlliButton
                  label="Revogar QR"
                  variant="outline"
                  size="lg"
                  fullWidth
                  loading={revogando}
                  onPress={confirmarRevogar}
                  icon={<MaterialCommunityIcons name="qrcode-remove" size={20} color={cores.danger} />}
                />
              ) : null}
              <TouchableOpacity
                style={styles.excluirBtn}
                activeOpacity={0.85}
                onPress={confirmarRemover}
                accessibilityRole="button"
                accessibilityLabel="Excluir equipamento"
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={cores.danger} />
                <Text style={styles.excluirBtnText}>Excluir equipamento</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>

      {/* Etiqueta / QR (sheet) */}
      {showEtiqueta && eq && (
        <EtiquetaSheet
          titulo={titulo}
          qrToken={eq.qrToken}
          onFechar={() => setShowEtiqueta(false)}
        />
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Sheet da etiqueta — mostra a URL pública + botões copiar/compartilhar.
// ─────────────────────────────────────────────────────────────
function EtiquetaSheet({
  titulo, qrToken, onFechar,
}: {
  titulo: string;
  qrToken: string;
  onFechar: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const url = urlEtiqueta(qrToken);

  async function compartilhar() {
    Haptics.selectionAsync().catch(() => {});
    try {
      await Share.share({ message: `Etiqueta do equipamento ${titulo}: ${url}` });
    } catch {
      // usuário cancelou o share sheet — silêncio
    }
  }

  async function copiar() {
    // Sem dependência de clipboard no app: na web usamos a Clipboard API do
    // navegador (quando disponível); no nativo caímos no share sheet, que sempre
    // existe. Nada de módulo exótico/nativo aqui (lição Hermes).
    if (Platform.OS === 'web') {
      try {
        const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(url);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Alert.alert('Copiado', 'O link da etiqueta foi copiado.');
          return;
        }
      } catch {
        // sem permissão de clipboard no navegador — cai no compartilhar
      }
    }
    compartilhar();
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFechar}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Etiqueta / QR</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.base }}>
            <View style={styles.qrIconWrap}>
              <MaterialCommunityIcons name="qrcode" size={64} color={cores.accentLight} />
            </View>
            <Text style={styles.etiquetaHint}>
              Este é o endereço que o QR da porta aponta. Imprima a etiqueta a partir
              deste link ou compartilhe com quem for gerá-la.
            </Text>
            <View style={styles.urlBox}>
              <Text style={styles.urlText} numberOfLines={2} selectable>{url}</Text>
            </View>
            <View style={styles.etiquetaBtnRow}>
              <TouchableOpacity style={styles.etiquetaBtn} activeOpacity={0.85} onPress={copiar}>
                <MaterialCommunityIcons name="content-copy" size={18} color={cores.accentLight} />
                <Text style={styles.etiquetaBtnText}>{Platform.OS === 'web' ? 'Copiar link' : 'Copiar'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.etiquetaBtn} activeOpacity={0.85} onPress={compartilhar}>
                <MaterialCommunityIcons name="share-variant" size={18} color={cores.accentLight} />
                <Text style={styles.etiquetaBtnText}>Compartilhar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════
// Form de novo/editar equipamento.
// ═════════════════════════════════════════════════════════════
function FormEquipamento({
  inicial, onFechar, onSalvo,
}: {
  inicial: Equipamento | null;
  onFechar: () => void;
  /** id da linha salva (vazio se o service não devolveu id — ver salvar()). */
  onSalvo: (id: string) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const CRITICIDADES = criarCriticidades(cores);
  const [categoria, setCategoria] = useState<CategoriaHvac | undefined>(
    (inicial?.categoria as CategoriaHvac | undefined) ?? undefined,
  );
  const [codigoInterno, setCodigoInterno] = useState(inicial?.codigoInterno ?? '');
  const [fabricante, setFabricante] = useState(inicial?.fabricante ?? '');
  const [modelo, setModelo] = useState(inicial?.modelo ?? '');
  const [numeroSerie, setNumeroSerie] = useState(inicial?.numeroSerie ?? '');
  const [patrimonio, setPatrimonio] = useState(inicial?.patrimonio ?? '');
  const [capacidadeBtu, setCapacidadeBtu] = useState(
    typeof inicial?.capacidadeBtu === 'number' ? String(inicial.capacidadeBtu) : '',
  );
  const [tensao, setTensao] = useState(inicial?.tensao ?? '');
  const [refrigerante, setRefrigerante] = useState(inicial?.refrigerante ?? '');
  const [localizacao, setLocalizacao] = useState(inicial?.localizacao ?? '');
  const [criticidade, setCriticidade] = useState<CriticidadeEquipamento | undefined>(inicial?.criticidade);
  const [situacao, setSituacao] = useState<SituacaoEquipamento>(inicial?.situacao ?? 'ativo');
  const [clienteId, setClienteId] = useState<string | undefined>(inicial?.clienteId);
  const [clienteNome, setClienteNome] = useState<string>('');
  const [fotos, setFotos] = useState<string[]>(inicial?.fotos ?? []);

  const [salvando, setSalvando] = useState(false);
  const [addingFoto, setAddingFoto] = useState(false);
  const [showCliente, setShowCliente] = useState(false);

  // Só o número inteiro de BTU (o campo é numérico livre).
  function onBtuChange(v: string) {
    setCapacidadeBtu(v.replace(/\D/g, ''));
  }

  async function anexarFotos(origem: 'camera' | 'galeria') {
    setAddingFoto(true);
    try {
      const res = origem === 'camera'
        ? await adicionarFotoCamera(fotos)
        : await adicionarFotoGaleria(fotos);

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
      if (!res.uris.length) return; // cancelou
      // No form, guardamos as URIs em estado; persistem no salvarEquipamento.
      setFotos((atuais) => [...atuais, ...res.uris]);
      Haptics.selectionAsync().catch(() => {});
    } catch (e: any) {
      Alert.alert('Não deu', e?.message ?? 'Não consegui anexar a foto agora.');
    } finally {
      setAddingFoto(false);
    }
  }

  function removerFotoLocal(uri: string) {
    setFotos((atuais) => atuais.filter((f) => f !== uri));
  }

  async function salvar() {
    // Um cadastro mínimo útil precisa de ALGO que identifique o ativo: exigimos
    // categoria OU código OU série (senão vira uma linha vazia sem valor).
    const temIdentificacao = !!categoria || !!codigoInterno.trim() || !!numeroSerie.trim();
    if (!temIdentificacao) {
      Alert.alert('Falta identificar', 'Escolha a categoria ou informe um código/número de série para cadastrar o equipamento.');
      return;
    }

    const btu = capacidadeBtu ? parseInt(capacidadeBtu, 10) : undefined;

    // Monta o Equipamento preservando os campos que o app NÃO edita (qrToken,
    // qrRevogadoEm, criadoEm, atualizadoEm, localId). Numa criação, esses campos
    // ficam com defaults seguros — o service/DB da Frente A gera id/token/datas.
    const base: Equipamento = inicial ?? {
      id: '',
      qrToken: '',
      fotos: [],
      situacao: 'ativo',
      criadoEm: '',
      atualizadoEm: '',
    };

    const equipamento: Equipamento = {
      ...base,
      categoria: categoria ?? undefined,
      codigoInterno: codigoInterno.trim() || undefined,
      fabricante: fabricante.trim() || undefined,
      modelo: modelo.trim() || undefined,
      numeroSerie: numeroSerie.trim() || undefined,
      patrimonio: patrimonio.trim() || undefined,
      capacidadeBtu: btu && !Number.isNaN(btu) ? btu : undefined,
      tensao: tensao.trim() || undefined,
      refrigerante: refrigerante.trim() || undefined,
      localizacao: localizacao.trim() || undefined,
      criticidade,
      situacao,
      clienteId: clienteId || undefined,
      fotos,
    };

    setSalvando(true);
    try {
      const salvo = await salvarEquipamento(equipamento);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // O service PODE devolver o equipamento persistido (com id/token/datas do
      // DB) ou nada — tratamos os dois casos sem depender do tipo de retorno.
      // Cast via unknown p/ não acoplar à assinatura exata da Frente A.
      const salvoObj = salvo as unknown as { id?: string } | undefined;
      const id = salvoObj?.id || equipamento.id;
      onSalvo(id);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Não deu', e?.message ?? 'Não consegui salvar o equipamento agora.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onFechar} presentationStyle="fullScreen">
      <View style={styles.detalheContainer}>
        <GradientHeader
          onBack={onFechar}
          title={inicial ? 'Editar equipamento' : 'Novo equipamento'}
          subtitle="Inventário HVAC · PMOC"
        />

        <ScrollView
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: 130, gap: Spacing.md }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Categoria (chips) */}
          <View>
            <Text style={styles.formLabel}>Categoria</Text>
            <View style={styles.chipsWrap}>
              {CATEGORIAS_HVAC.map((c) => {
                const ativo = categoria === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.catChip, ativo && styles.catChipActive]}
                    activeOpacity={0.85}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setCategoria(ativo ? undefined : c.id); }}
                  >
                    <MaterialCommunityIcons
                      name={c.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                      size={15}
                      color={ativo ? cores.accentLight : cores.onSurfaceVariant}
                    />
                    <Text style={[styles.catChipText, ativo && styles.catChipTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <OlliInput label="Código interno" value={codigoInterno} onChangeText={setCodigoInterno} placeholder="Ex.: AC-014" leftIcon="tag-outline" autoCapitalize="characters" />
          <OlliInput label="Fabricante" value={fabricante} onChangeText={setFabricante} placeholder="Ex.: Fujitsu, LG, Daikin" leftIcon="factory" />
          <OlliInput label="Modelo" value={modelo} onChangeText={setModelo} placeholder="Ex.: Inverter 12k" leftIcon="cog-outline" />
          <OlliInput label="Número de série" value={numeroSerie} onChangeText={setNumeroSerie} placeholder="Nº de série da placa" leftIcon="barcode" autoCapitalize="characters" />
          <OlliInput label="Patrimônio" value={patrimonio} onChangeText={setPatrimonio} placeholder="Código/patrimônio do cliente" leftIcon="clipboard-list-outline" />
          <OlliInput label="Capacidade (BTU/h)" value={capacidadeBtu} onChangeText={onBtuChange} placeholder="Ex.: 9000" leftIcon="snowflake" keyboardType="numeric" />
          <OlliInput label="Tensão" value={tensao} onChangeText={setTensao} placeholder="Ex.: 220V, 380V trifásico" leftIcon="flash-outline" />
          <OlliInput label="Refrigerante" value={refrigerante} onChangeText={setRefrigerante} placeholder="Ex.: R410A, R32" leftIcon="water-outline" autoCapitalize="characters" />
          <OlliInput label="Localização" value={localizacao} onChangeText={setLocalizacao} placeholder="Ex.: Sala 302 - 3º andar" leftIcon="map-marker-outline" />

          {/* Criticidade */}
          <View>
            <Text style={styles.formLabel}>Criticidade</Text>
            <View style={styles.chipsWrap}>
              {CRITICIDADES.map((c) => {
                const ativo = criticidade === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.selChip, ativo && { backgroundColor: c.cor + '22', borderColor: c.cor }]}
                    activeOpacity={0.85}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setCriticidade(ativo ? undefined : c.id); }}
                  >
                    <Text style={[styles.selChipText, ativo && { color: c.cor }]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Situação */}
          <View>
            <Text style={styles.formLabel}>Situação</Text>
            <View style={styles.chipsWrap}>
              {SITUACOES_ORDEM.map((s) => {
                const ativo = situacao === s;
                const cor = STATUS_EQUIP_CORES[s] ?? cores.primary;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.selChip, ativo && { backgroundColor: cor + '22', borderColor: cor }]}
                    activeOpacity={0.85}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setSituacao(s); }}
                  >
                    <Text style={[styles.selChipText, ativo && { color: cor }]}>{STATUS_EQUIP_LABELS[s]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Cliente (opcional) */}
          <View>
            <Text style={styles.formLabel}>Cliente (opcional)</Text>
            {clienteId ? (
              <View style={styles.clienteSel}>
                <MaterialCommunityIcons name="account-check" size={18} color={cores.success} />
                <Text style={styles.clienteSelNome} numberOfLines={1}>{clienteNome || 'Cliente vinculado'}</Text>
                <TouchableOpacity
                  onPress={() => { setClienteId(undefined); setClienteNome(''); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Remover cliente"
                >
                  <MaterialCommunityIcons name="close-circle" size={20} color={cores.danger} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.clienteBtn} activeOpacity={0.85} onPress={() => setShowCliente(true)}>
                <MaterialCommunityIcons name="account-search-outline" size={18} color={cores.accentLight} />
                <Text style={styles.clienteBtnText}>Vincular a um cliente</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Fotos */}
          <View>
            <Text style={styles.formLabel}>Fotos</Text>
            {fotos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {fotos.map((uri) => (
                    <View key={uri} style={styles.fotoThumbWrap}>
                      <Image source={{ uri }} style={styles.foto} />
                      <TouchableOpacity
                        style={styles.fotoRemover}
                        onPress={() => removerFotoLocal(uri)}
                        accessibilityRole="button"
                        accessibilityLabel="Remover foto"
                      >
                        <MaterialCommunityIcons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text style={styles.vazioTexto}>Placa de dados, etiqueta e local de instalação ajudam no histórico.</Text>
            )}
            <View style={styles.fotoBtnRow}>
              <TouchableOpacity style={styles.fotoBtn} activeOpacity={0.85} disabled={addingFoto} onPress={() => anexarFotos('camera')}>
                <MaterialCommunityIcons name="camera-plus-outline" size={18} color={cores.accentLight} />
                <Text style={styles.fotoBtnText}>Câmera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.fotoBtn} activeOpacity={0.85} disabled={addingFoto} onPress={() => anexarFotos('galeria')}>
                <MaterialCommunityIcons name="image-multiple-outline" size={18} color={cores.accentLight} />
                <Text style={styles.fotoBtnText}>Galeria</Text>
              </TouchableOpacity>
            </View>
          </View>

          <OlliButton
            label={inicial ? 'Salvar alterações' : 'Cadastrar equipamento'}
            variant="gradient"
            size="lg"
            fullWidth
            loading={salvando}
            onPress={salvar}
            icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />}
            style={{ marginTop: Spacing.sm }}
          />
        </ScrollView>
      </View>

      {/* Seletor de cliente */}
      {showCliente && (
        <SeletorCliente
          onFechar={() => setShowCliente(false)}
          onSelecionar={(c) => {
            setClienteId(c.id);
            setClienteNome(c.nome);
            setShowCliente(false);
          }}
        />
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Seletor de cliente (reusa searchClientes do app — só leitura).
// ─────────────────────────────────────────────────────────────
function SeletorCliente({
  onFechar, onSelecionar,
}: {
  onFechar: () => void;
  onSelecionar: (c: Cliente) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [buscou, setBuscou] = useState(false);

  useEffect(() => {
    let ativo = true;
    const q = query.trim();
    if (q.length < 2) {
      setResultados([]);
      setBuscou(false);
      return;
    }
    (async () => {
      try {
        const found = await searchClientes(q);
        if (ativo) { setResultados(found); setBuscou(true); }
      } catch {
        if (ativo) { setResultados([]); setBuscou(true); }
      }
    })();
    return () => { ativo = false; };
  }, [query]);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFechar}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Vincular cliente</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
            </TouchableOpacity>
          </View>
          <View style={{ padding: Spacing.base }}>
            <View style={styles.searchRowSheet}>
              <MaterialCommunityIcons name="magnify" size={20} color={cores.onSurfaceVariant} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar cliente pelo nome..."
                value={query}
                onChangeText={setQuery}
                placeholderTextColor={cores.onSurfaceMuted}
                autoFocus
              />
            </View>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.base }}>
            {resultados.map((c) => (
              <TouchableOpacity key={c.id} style={styles.clienteRow} activeOpacity={0.85} onPress={() => onSelecionar(c)}>
                <View style={styles.clienteAvatar}>
                  <Text style={styles.clienteAvatarText}>{c.nome.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.clienteRowNome} numberOfLines={1}>{c.nome}</Text>
                  <Text style={styles.clienteRowSub} numberOfLines={1}>{c.telefone || 'Sem telefone'}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={cores.onSurfaceMuted} />
              </TouchableOpacity>
            ))}
            {buscou && resultados.length === 0 ? (
              <Text style={styles.vazioTexto}>Nenhum cliente encontrado. Cadastre-o na tela Clientes primeiro.</Text>
            ) : null}
            {!buscou && query.trim().length < 2 ? (
              <Text style={styles.vazioTexto}>Digite ao menos 2 letras para buscar.</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Linha ícone + label + valor no bloco de ficha técnica. */
function LinhaInfo({ icon, label, valor }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; valor: string;
}) {
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

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  detalheContainer: { flex: 1, backgroundColor: c.background },

  // Pílula "Novo" e afins: filhos do GradientHeader, banner sempre colorido nos
  // dois modos — branco fixo continua correto (ver `header` em theme/cores.ts).
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
  searchRowSheet: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.base, paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface },

  // Atalho PMOC (Fase 2) — pílula de vidro sobre o header, alinhada à esquerda.
  pmocAtalho: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full,
  },
  pmocAtalhoText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },

  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline,
  },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipLabel: { fontSize: 12, fontWeight: '600', color: c.onSurfaceVariant },
  chipLabelActive: { color: c.onPrimary },

  // Card
  card: {
    backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outlineDark,
    marginHorizontal: Spacing.base, marginBottom: 10, padding: Spacing.base, ...sombrasDe(c).sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardIcon: {
    width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.accentContainer, borderWidth: 1, borderColor: c.strokeGlow,
  },
  cardTitulo: { fontSize: 15.5, fontWeight: '800', color: c.onSurface },
  cardSub: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '48%' },
  metaChipText: { fontSize: 11.5, color: c.onSurfaceVariant, fontWeight: '600' },

  statusBadge: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },

  // Detalhe
  bloco: {
    backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.base, ...sombrasDe(c).sm,
  },
  blocoTitulo: { fontSize: 15, fontWeight: '800', color: c.onSurface, marginBottom: 6 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  infoLabel: { fontSize: 13, color: c.onSurfaceVariant, width: 92 },
  infoValor: { flex: 1, fontSize: 14, color: c.onSurface, fontWeight: '700', textAlign: 'right' },

  critChip: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 3 },
  critChipText: { fontSize: 11.5, fontWeight: '800' },

  caveat: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: c.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.outline, padding: Spacing.md,
  },
  caveatText: { flex: 1, fontSize: 12, color: c.onSurfaceVariant, lineHeight: 17 },

  vazioTexto: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 19, marginTop: 6 },

  foto: { width: 96, height: 96, borderRadius: BorderRadius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline },
  fotoThumbWrap: { position: 'relative' },
  // Botão de remover foto: sempre escuro de propósito (contraste do "x" sobre a
  // miniatura, nos dois modos) — sem chave "fundo escuro fixo" na paleta.
  fotoRemover: {
    position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(4,10,20,0.72)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.outlineDark,
  },
  fotoBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  fotoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: c.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.strokeGlow, paddingVertical: 12,
  },
  fotoBtnText: { fontSize: 13.5, fontWeight: '800', color: c.accentLight },

  qrRevogadoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: c.dangerLight, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.danger + '55', padding: Spacing.md, marginTop: 6,
  },
  qrRevogadoText: { flex: 1, fontSize: 13, color: c.onSurface, lineHeight: 18 },

  acaoLinha: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
    backgroundColor: c.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.strokeGlow, paddingHorizontal: 14, paddingVertical: 13,
  },
  acaoLinhaText: { flex: 1, fontSize: 14.5, fontWeight: '800', color: c.accentLight },

  excluirBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.danger + '55', backgroundColor: c.dangerLight,
  },
  excluirBtnText: { fontSize: 14, fontWeight: '800', color: c.danger },

  // Etiqueta sheet
  qrIconWrap: {
    alignSelf: 'center', width: 108, height: 108, borderRadius: BorderRadius.xl,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.surfaceGlass, borderWidth: 1, borderColor: c.strokeGlow,
  },
  etiquetaHint: { fontSize: 13.5, color: c.onSurfaceVariant, lineHeight: 20, textAlign: 'center' },
  urlBox: {
    backgroundColor: c.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.outline, padding: Spacing.md,
  },
  urlText: { fontSize: 13.5, color: c.accentLight, fontWeight: '600' },
  etiquetaBtnRow: { flexDirection: 'row', gap: 10 },
  etiquetaBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: c.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.strokeGlow, paddingVertical: 13,
  },
  etiquetaBtnText: { fontSize: 13.5, fontWeight: '800', color: c.accentLight },

  // Form
  formLabel: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant, marginBottom: 8 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline,
  },
  catChipActive: { backgroundColor: c.accentContainer, borderColor: c.accent },
  catChipText: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant },
  catChipTextActive: { color: c.accentLight },
  selChip: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline,
  },
  selChipText: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant },

  clienteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.strokeGlow, borderStyle: 'dashed', paddingVertical: 13,
  },
  clienteBtnText: { fontSize: 14, fontWeight: '800', color: c.accentLight },
  clienteSel: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.success, paddingHorizontal: 14, paddingVertical: 12,
  },
  clienteSelNome: { flex: 1, fontSize: 14.5, fontWeight: '700', color: c.onSurface },

  // Sheets
  // Scrim do bottom sheet: escurece o fundo sempre, nos dois modos (convenção
  // padrão de overlay de modal — sem chave "scrim" na paleta).
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '80%', paddingBottom: Platform.OS === 'ios' ? 24 : 8,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.base,
    borderBottomWidth: 1, borderBottomColor: c.outline,
  },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: c.onSurface },

  clienteRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceGlass,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.md, marginBottom: 10,
  },
  clienteAvatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  clienteAvatarText: { fontSize: 18, fontWeight: '800', color: c.accentLight },
  clienteRowNome: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  clienteRowSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
});
