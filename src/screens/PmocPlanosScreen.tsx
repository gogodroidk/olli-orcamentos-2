import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, ScrollView, StyleSheet, TouchableOpacity,
  Modal, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, corCategoriaEmChip, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { EmptyState } from '../components/EmptyState';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { GuardaPapel } from '../components/GuardaPapel';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
// Serviço PMOC Fase 2 (frente paralela) — orquestração de planos + o cálculo de
// período do calendário (funções puras, reusadas para a "próxima visita").
import { listarPlanos, criarPlano, periodoDe, vencimentoDe } from '../services/pmoc';
// Leituras diretas do banco local (não editadas por esta frente): a versão
// vigente dá o nº de equipamentos/periodicidades e as frequências das rotinas.
import { getPmocVersaoVigente, getClientes } from '../database/database';
import type { PmocPlano, SituacaoPmoc, Cliente } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Rótulos da situação OPERACIONAL do plano. Nenhum é declaração de conformidade
 * legal — descrevem só o estágio do plano no fluxo de trabalho do prestador.
 */
const SIT_PMOC_LABEL: Record<SituacaoPmoc, string> = {
  rascunho: 'Rascunho',
  em_revisao: 'Em revisão',
  aguardando_aprovacao_tecnica: 'Aguardando responsável técnico',
  aprovado: 'Aprovado',
  vigente: 'Vigente',
  substituido: 'Substituído',
  suspenso: 'Suspenso',
  encerrado: 'Encerrado',
};

function criarSitPmocCor(c: Cores): Record<SituacaoPmoc, string> {
  return {
    rascunho: c.onSurfaceVariant,
    em_revisao: c.warning,
    aguardando_aprovacao_tecnica: c.warning,
    aprovado: c.primaryLight,
    vigente: c.success,
    substituido: c.onSurfaceMuted,
    // Laranja fixo: precisa continuar distinto de "em_revisao"/"aguardando_..."
    // (que já usam c.warning) para diferenciar "suspenso" na lista — sem
    // equivalente semântico no tema, mantido.
    suspenso: '#F97316',
    encerrado: c.onSurfaceMuted,
  };
}

/** Ordem de exibição das situações no filtro (mesma ordem lógica do type). */
const SIT_PMOC_ORDEM: SituacaoPmoc[] = [
  'rascunho', 'em_revisao', 'aguardando_aprovacao_tecnica', 'aprovado',
  'vigente', 'suspenso', 'substituido', 'encerrado',
];

/** Resumo derivado por plano, montado a partir da versão vigente. */
interface ResumoPlano {
  equipamentos: number;
  periodicidades: number;
  /**
   * ISO curta (YYYY-MM-DD) da próxima visita devida: o FIM do bloco de calendário
   * atual, calculado das periodicidades pelo próprio serviço (mesma matemática da
   * geração). É uma data OPERACIONAL derivada da frequência configurada, nunca uma
   * afirmação de conformidade. `null` quando não há periodicidade calculável.
   */
  proximaVisita: string | null;
}

/** Data ISO (curta ou completa) → "12/03/2026". Vazio se inválida. */
function formatarData(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '';
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${d.getFullYear()}`;
}

function StatusPmocBadge({ situacao }: { situacao: SituacaoPmoc }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const cor = criarSitPmocCor(cores)[situacao] ?? cores.onSurfaceVariant;
  return (
    <View style={[styles.statusBadge, { backgroundColor: cor + '22', borderColor: cor + '66' }]}>
      <Text style={[styles.statusBadgeText, { color: corCategoriaEmChip(cor, cores.surface) }]}>{SIT_PMOC_LABEL[situacao] ?? situacao}</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════
// Tela — lista de planos PMOC (gate: quem gerencia valores/planos).
// O técnico NÃO acessa: GuardaPapel segura fail-closed enquanto o papel
// carrega e nega quando o papel não libera 'ver_valores_agregados'.
// ═════════════════════════════════════════════════════════════
export default function PmocPlanosScreen() {
  return (
    <GuardaPapel acao="ver_valores_agregados" area="Planos PMOC">
      <PmocPlanosConteudo />
    </GuardaPapel>
  );
}

function PmocPlanosConteudo() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const [planos, setPlanos] = useState<PmocPlano[]>([]);
  const [resumos, setResumos] = useState<Record<string, ResumoPlano>>({});
  const [clientesMapa, setClientesMapa] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState<SituacaoPmoc | 'todos'>('todos');

  // Modal "novo plano".
  const [criando, setCriando] = useState(false);

  const load = useCallback(async () => {
    try {
      const [lista, clientes] = await Promise.all([listarPlanos(), getClientes()]);
      setPlanos(lista);
      setClientesMapa(Object.fromEntries(clientes.map((c) => [c.id, c.nome])));
      // Enriquecimento por plano (nº equipamentos, periodicidades, próxima visita).
      // N+1 sobre o SQLite local, aceitável para a contagem pequena de planos; cada
      // leitura é isolada para um plano problemático não derrubar a lista toda.
      const agora = new Date();
      const pares = await Promise.all(
        lista.map(async (p): Promise<[string, ResumoPlano]> => {
          try {
            const vigente = await getPmocVersaoVigente(p.id);
            const pers = vigente?.periodicidades ?? [];
            // Próxima visita = menor "fim do bloco atual" entre as periodicidades.
            const vencimentos = pers
              .map((per) => {
                const periodo = periodoDe(agora, per.frequencia);
                return periodo ? vencimentoDe(periodo, per.frequencia) : '';
              })
              .filter((v): v is string => !!v)
              .sort();
            return [p.id, {
              equipamentos: vigente?.equipamentoIds.length ?? 0,
              periodicidades: pers.length,
              proximaVisita: vencimentos[0] ?? null,
            }];
          } catch {
            return [p.id, { equipamentos: 0, periodicidades: 0, proximaVisita: null }];
          }
        }),
      );
      setResumos(Object.fromEntries(pares));
    } catch {
      setPlanos([]);
      setResumos({});
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
    if (filtro === 'todos') return planos;
    return planos.filter((p) => p.situacao === filtro);
  }, [planos, filtro]);

  function abrirPlano(id: string) {
    Haptics.selectionAsync().catch(() => {});
    nav.navigate('PmocPlano', { id });
  }

  const renderItem = ({ item, index }: { item: PmocPlano; index: number }) => {
    const r = resumos[item.id];
    const proxima = r?.proximaVisita ? formatarData(r.proximaVisita) : '';
    const nomeCliente = item.clienteId ? (clientesMapa[item.clienteId] || 'Cliente') : 'Sem cliente vinculado';
    return (
      <AnimatedEntrance index={index}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => abrirPlano(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Plano ${item.titulo}, ${SIT_PMOC_LABEL[item.situacao]}`}
        >
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.cardTitulo} numberOfLines={1}>{item.titulo || 'Plano de manutenção'}</Text>
              <Text style={styles.cardCliente} numberOfLines={1}>{nomeCliente}</Text>
            </View>
            <StatusPmocBadge situacao={item.situacao} />
          </View>

          <View style={styles.cardMetaRow}>
            {item.numero ? (
              <View style={styles.metaChip}>
                <MaterialCommunityIcons name="pound" size={12} color={cores.onSurfaceVariant} />
                <Text style={styles.metaChipText}>{item.numero}</Text>
              </View>
            ) : null}
            <View style={styles.metaChip}>
              <MaterialCommunityIcons name="air-conditioner" size={12} color={cores.onSurfaceVariant} />
              <Text style={styles.metaChipText}>{r?.equipamentos ?? 0} equip.</Text>
            </View>
            <View style={styles.metaChip}>
              <MaterialCommunityIcons name="repeat-variant" size={12} color={cores.onSurfaceVariant} />
              <Text style={styles.metaChipText}>
                {r?.periodicidades ?? 0} periodicidade{(r?.periodicidades ?? 0) === 1 ? '' : 's'}
              </Text>
            </View>
          </View>

          <View style={styles.cardProxima}>
            <MaterialCommunityIcons
              name="calendar-clock-outline"
              size={14}
              color={proxima ? cores.accentLight : cores.onSurfaceMuted}
            />
            <Text style={[styles.cardProximaText, !proxima && { color: cores.onSurfaceMuted }]} numberOfLines={1}>
              {proxima
                ? `Próxima visita: ${proxima}`
                : (r?.periodicidades ? 'Sem data calculável' : 'Defina as periodicidades')}
            </Text>
          </View>
        </TouchableOpacity>
      </AnimatedEntrance>
    );
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        onBack={() => goBackOrHome(nav)}
        title="Planos PMOC"
        subtitle="Manutenção programada · HVAC"
        right={
          <TouchableOpacity
            style={styles.newBtn}
            activeOpacity={0.85}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setCriando(true); }}
            accessibilityRole="button"
            accessibilityLabel="Novo plano de manutenção"
          >
            <MaterialCommunityIcons name="plus" size={20} color="#fff" />
            <Text style={styles.newBtnLabel}>Novo</Text>
          </TouchableOpacity>
        }
      />

      {/* Filtro por situação (só quando há planos). */}
      {planos.length > 0 && (
        <View>
          <FlatList
            horizontal
            data={['todos', ...SIT_PMOC_ORDEM] as Array<SituacaoPmoc | 'todos'>}
            keyExtractor={(k) => k}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingVertical: 8, gap: 8 }}
            renderItem={({ item: k }) => {
              const ativo = filtro === k;
              const label = k === 'todos' ? 'Todos' : SIT_PMOC_LABEL[k];
              return (
                <TouchableOpacity
                  style={[styles.chip, ativo && styles.chipActive]}
                  onPress={() => setFiltro(k)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
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
          {[0, 1, 2].map((i) => <OlliSkeleton key={i} height={104} radius={BorderRadius.lg} />)}
        </View>
      ) : filtrados.length === 0 ? (
        planos.length === 0 ? (
          <EmptyState
            icon="clipboard-text-clock-outline"
            title="Nenhum plano de manutenção ainda"
            subtitle="Um plano PMOC organiza as visitas programadas dos equipamentos de um cliente. Crie o primeiro e defina as periodicidades."
            actionLabel="Criar primeiro plano"
            onAction={() => setCriando(true)}
          />
        ) : (
          <EmptyState
            icon="filter-variant-remove"
            title="Nenhum plano nesta situação"
            subtitle="Troque o filtro para ver os outros planos."
          />
        )
      ) : (
        <FlatList
          data={filtrados}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxl, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={cores.accentLight} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <NovoPlanoModal
        visivel={criando}
        onFechar={() => setCriando(false)}
        onCriado={(plano) => {
          setCriando(false);
          nav.navigate('PmocPlano', { id: plano.id });
        }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal "novo plano" — título (obrigatório) + cliente (opcional).
// ─────────────────────────────────────────────────────────────
function NovoPlanoModal({
  visivel, onFechar, onCriado,
}: {
  visivel: boolean;
  onFechar: () => void;
  onCriado: (plano: PmocPlano) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [titulo, setTitulo] = useState('');
  const [clienteId, setClienteId] = useState<string | undefined>(undefined);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Reset + carga dos clientes ao abrir.
  useEffect(() => {
    if (!visivel) return;
    setTitulo(''); setClienteId(undefined); setBusca(''); setErro(null);
    let ativo = true;
    getClientes().then((cs) => { if (ativo) setClientes(cs); }).catch(() => {});
    return () => { ativo = false; };
  }, [visivel]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) => c.nome.toLowerCase().includes(q));
  }, [clientes, busca]);

  async function salvar() {
    const t = titulo.trim();
    if (!t) { setErro('Dê um título ao plano (ex.: "PMOC — Loja Centro").'); return; }
    setSalvando(true);
    setErro(null);
    try {
      const plano = await criarPlano({ titulo: t, clienteId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onCriado(plano);
    } catch {
      setErro('Não foi possível criar o plano. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal visible={visivel} animationType="slide" transparent onRequestClose={onFechar}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>Novo plano de manutenção</Text>
            <TouchableOpacity onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="close" size={24} color={cores.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Spacing.base }}>
            <OlliInput
              label="Título do plano"
              required
              value={titulo}
              onChangeText={setTitulo}
              placeholder='Ex.: "PMOC — Edifício Aurora"'
              leftIcon="clipboard-text-outline"
              error={erro && !titulo.trim() ? erro : undefined}
            />

            <Text style={styles.modalLabel}>Cliente (opcional)</Text>
            <OlliInput
              value={busca}
              onChangeText={setBusca}
              placeholder="Buscar cliente..."
              leftIcon="magnify"
            />

            <TouchableOpacity
              style={[styles.clienteRow, !clienteId && styles.clienteRowAtivo]}
              onPress={() => setClienteId(undefined)}
              accessibilityRole="button"
              accessibilityState={{ selected: !clienteId }}
            >
              <MaterialCommunityIcons name="account-off-outline" size={18} color={cores.onSurfaceVariant} />
              <Text style={styles.clienteRowText}>Sem cliente vinculado</Text>
              {!clienteId && <MaterialCommunityIcons name="check" size={18} color={cores.accentLight} />}
            </TouchableOpacity>

            {filtrados.slice(0, 30).map((c) => {
              const sel = clienteId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.clienteRow, sel && styles.clienteRowAtivo]}
                  onPress={() => setClienteId(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                >
                  <MaterialCommunityIcons name="account-outline" size={18} color={sel ? cores.accentLight : cores.onSurfaceVariant} />
                  <Text style={[styles.clienteRowText, sel && { color: cores.onSurface }]} numberOfLines={1}>{c.nome}</Text>
                  {sel && <MaterialCommunityIcons name="check" size={18} color={cores.accentLight} />}
                </TouchableOpacity>
              );
            })}

            {erro && titulo.trim() ? <Text style={styles.erroTexto}>{erro}</Text> : null}
          </ScrollView>

          <OlliButton
            label="Criar plano"
            variant="gradient"
            fullWidth
            loading={salvando}
            onPress={salvar}
            icon={<MaterialCommunityIcons name="plus" size={18} color="#fff" />}
            style={{ marginTop: Spacing.sm }}
          />
        </View>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  // Dentro do GradientHeader (sempre colorido, nos dois modos) — glass branco
  // fixo, mesma convenção do próprio GradientHeader.
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full,
  },
  newBtnLabel: { color: '#fff', fontWeight: '800', fontSize: 13 },

  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.full,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline,
  },
  chipActive: { backgroundColor: c.accentContainer, borderColor: c.accent },
  chipLabel: { color: c.onSurfaceVariant, fontSize: 12, fontWeight: '700' },
  chipLabelActive: { color: c.accentLight },

  card: {
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline, padding: Spacing.base, gap: 10,
    ...sombrasDe(c).sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitulo: { fontSize: 16, fontWeight: '800', color: c.onSurface },
  cardCliente: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.full,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  metaChipText: { fontSize: 11, color: c.onSurfaceVariant, fontWeight: '600' },
  cardProxima: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderTopWidth: 1, borderTopColor: c.outline, paddingTop: 8,
  },
  cardProximaText: { fontSize: 13, color: c.accentLight, fontWeight: '600', flex: 1 },

  statusBadge: { borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },

  // Modal novo plano — scrim padrão de modal, sempre escuro.
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: c.surfaceVariant,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.base, paddingTop: Spacing.sm, maxHeight: '86%',
    borderTopWidth: 1, borderColor: c.strokeGlow,
  },
  modalHandle: {
    width: 42, height: 4, borderRadius: 2, backgroundColor: c.outlineDark,
    alignSelf: 'center', marginBottom: Spacing.sm,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  modalTitulo: { fontSize: 18, fontWeight: '800', color: c.onSurface },
  modalLabel: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, marginTop: Spacing.sm, marginBottom: 6 },
  clienteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 12, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.outline, marginBottom: 6, backgroundColor: c.surface,
  },
  clienteRowAtivo: { borderColor: c.accent, backgroundColor: c.surfacePressed },
  clienteRowText: { flex: 1, fontSize: 14, color: c.onSurfaceVariant },
  erroTexto: { color: c.danger, fontSize: 13, marginTop: 8 },
});
