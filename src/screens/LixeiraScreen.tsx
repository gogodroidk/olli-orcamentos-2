import React, { useCallback, useState } from 'react';
import {
  View, Text, SectionList, StyleSheet, TouchableOpacity,
  Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, comAlfa, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { EmptyState } from '../components/EmptyState';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { goBackOrHome } from '../navigation/safeBack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { formatDate } from '../utils/date';
import {
  getItensNaLixeira, restaurarItem, excluirDefinitivo, esvaziarLixeira,
  diasRestantes, DIAS_RETENCAO_LIXEIRA, TIPO_LIXEIRA_META,
  ItemLixeira, TipoLixeira,
} from '../services/lixeira';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Cor de destaque por tipo — dá vida ao ícone de cada família na lixeira. */
function criarCorTipo(c: Cores): Record<TipoLixeira, string> {
  return {
    cliente: c.accent,
    servico: c.primaryLight,
    // Lavanda decorativa sem token semântico no tema (não é `plan`/`voice`, que são
    // um roxo mais saturado) — mantida fixa nos dois modos.
    produto: '#A78BFA',
    orcamento: c.primary,
    recibo: c.success,
    modelo: c.warning,
    // Âmbar fixo: precisa continuar distinto de "modelo" (que já usa `c.warning`)
    // para diferenciar as categorias na lista — não pode virar o mesmo tom.
    depoimento: '#F7B23B',
    agendamento: '#A78BFA',
    ordem_servico: c.accentLight,
    equipamento: c.accent,
  };
}

interface Secao {
  tipo: TipoLixeira;
  title: string;
  data: ItemLixeira[];
}

/** Badge do prazo restante até o expurgo (verde → âmbar → vermelho ao vencer). */
function PrazoBadge({ excluidoEm }: { excluidoEm: string }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const dias = diasRestantes(excluidoEm);
  const cor = dias <= 0 ? cores.danger : dias <= 5 ? cores.warning : cores.onSurfaceVariant;
  const label = dias <= 0 ? 'Expira em breve' : `Expira em ${dias} dia${dias === 1 ? '' : 's'}`;
  return (
    <View style={[styles.prazoBadge, { borderColor: cor + '55', backgroundColor: cor + '18' }]}>
      <MaterialCommunityIcons name="timer-sand" size={11} color={cor} />
      <Text style={[styles.prazoText, { color: cor }]}>{label}</Text>
    </View>
  );
}

export default function LixeiraScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const corTipo = criarCorTipo(cores);
  const [itens, setItens] = useState<ItemLixeira[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [itensErro, setItensErro] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [esvaziando, setEsvaziando] = useState(false);

  const load = useCallback(async () => {
    setItensErro(false);
    try {
      const lista = await getItensNaLixeira();
      setItens(lista);
    } catch {
      // erro de verdade (leitura falhou) — NUNCA vira lista vazia silenciosa.
      setItensErro(true);
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

  // Agrupa por tipo, preservando a ordem de TIPO_LIXEIRA_META (estável e amigável).
  const secoes: Secao[] = (Object.keys(TIPO_LIXEIRA_META) as TipoLixeira[])
    .map((tipo) => {
      const data = itens.filter((i) => i.tipo === tipo);
      return { tipo, title: TIPO_LIXEIRA_META[tipo].plural, data };
    })
    .filter((s) => s.data.length > 0);

  async function handleRestaurar(item: ItemLixeira) {
    setBusyId(item.id);
    try {
      await restaurarItem(item.tipo, item.id);
      await load();
    } catch {
      Alert.alert('Erro', 'Não foi possível restaurar agora. Tente novamente.');
    } finally {
      setBusyId(null);
    }
  }

  function handleExcluirDeVez(item: ItemLixeira) {
    Alert.alert(
      'Excluir definitivamente',
      `"${item.titulo}" será apagado para sempre. Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir de vez', style: 'destructive',
          onPress: async () => {
            setBusyId(item.id);
            try {
              await excluirDefinitivo(item.tipo, item.id);
              await load();
            } catch {
              Alert.alert('Erro', 'Não foi possível excluir agora. Tente novamente.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  function handleEsvaziar() {
    if (!itens.length) return;
    Alert.alert(
      'Esvaziar lixeira',
      `Todos os ${itens.length} item${itens.length === 1 ? '' : 's'} serão apagados para sempre. Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Esvaziar', style: 'destructive',
          onPress: async () => {
            setEsvaziando(true);
            try {
              await esvaziarLixeira();
              await load();
            } catch {
              Alert.alert('Erro', 'Não foi possível esvaziar a lixeira agora. Tente novamente.');
            } finally {
              setEsvaziando(false);
            }
          },
        },
      ],
    );
  }

  const renderItem = ({ item, index }: { item: ItemLixeira; index: number }) => {
    const cor = corTipo[item.tipo];
    const ocupado = busyId === item.id;
    return (
      <AnimatedEntrance index={index} style={{ marginHorizontal: Spacing.base, marginBottom: 10 }}>
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={[styles.iconBubble, { backgroundColor: cor + '1E', borderColor: cor + '3A' }]}>
              <MaterialCommunityIcons name={TIPO_LIXEIRA_META[item.tipo].icone as any} size={20} color={cor} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.titulo}</Text>
              {item.subtitulo ? <Text style={styles.cardSub} numberOfLines={1}>{item.subtitulo}</Text> : null}
              <View style={styles.metaRow}>
                {item.excluidoEm ? (
                  <Text style={styles.cardMeta}>Excluído em {formatDate(item.excluidoEm)}</Text>
                ) : null}
                {item.excluidoEm ? <PrazoBadge excluidoEm={item.excluidoEm} /> : null}
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.restaurarBtn]}
              onPress={() => handleRestaurar(item)}
              disabled={ocupado}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Restaurar ${item.titulo}`}
            >
              {ocupado ? (
                <ActivityIndicator size="small" color={cores.accentLight} />
              ) : (
                <>
                  <MaterialCommunityIcons name="restore" size={16} color={cores.accentLight} />
                  <Text style={[styles.actionLabel, { color: cores.accentLight }]}>Restaurar</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.excluirBtn]}
              onPress={() => handleExcluirDeVez(item)}
              disabled={ocupado}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Excluir ${item.titulo} definitivamente`}
            >
              <MaterialCommunityIcons name="delete-forever-outline" size={16} color={cores.danger} />
              <Text style={[styles.actionLabel, { color: cores.danger }]}>Excluir de vez</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AnimatedEntrance>
    );
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Lixeira"
        subtitle={itens.length ? `${itens.length} item${itens.length === 1 ? '' : 's'} recuperável${itens.length === 1 ? '' : 'is'}` : 'Vazia'}
        onBack={() => goBackOrHome(nav)}
        right={
          itens.length ? (
            <TouchableOpacity
              style={styles.esvaziarBtn}
              onPress={handleEsvaziar}
              disabled={esvaziando}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Esvaziar lixeira"
            >
              {esvaziando
                ? <ActivityIndicator size="small" color="#fff" />
                : <MaterialCommunityIcons name="delete-sweep-outline" size={20} color="#fff" />}
            </TouchableOpacity>
          ) : undefined
        }
      >
        <View style={styles.infoRow}>
          <MaterialCommunityIcons name="information-outline" size={15} color={cores.accentLight} />
          <Text style={styles.infoText}>
            Itens excluídos ficam aqui por {DIAS_RETENCAO_LIXEIRA} dias e depois são apagados automaticamente.
          </Text>
        </View>
      </GradientHeader>

      {carregando ? (
        <View style={{ paddingTop: 12, paddingHorizontal: Spacing.base, gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <OlliSkeleton width="60%" height={15} />
              <OlliSkeleton width="40%" height={12} style={{ marginTop: 8 }} />
              <OlliSkeleton width="50%" height={28} style={{ marginTop: 14 }} />
            </View>
          ))}
        </View>
      ) : (
        <SectionList
          sections={secoes}
          keyExtractor={(item) => `${item.tipo}:${item.id}`}
          renderItem={renderItem}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons
                name={TIPO_LIXEIRA_META[(section as Secao).tipo].icone as any}
                size={15}
                color={cores.onSurfaceVariant}
              />
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{(section as Secao).data.length}</Text>
            </View>
          )}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 80 + insets.bottom, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[cores.primary]} tintColor={cores.primary} />}
          ListEmptyComponent={
            itensErro ? (
              <EmptyState
                icon="alert-circle-outline"
                title="Não deu para carregar"
                subtitle="Não conseguimos buscar sua lixeira agora. Verifique a conexão e tente de novo."
                actionLabel="Tentar de novo"
                onAction={load}
              />
            ) : (
              <EmptyState
                icon="delete-empty-outline"
                title="Lixeira vazia"
                subtitle="Nada foi excluído por aqui. O que você apagar aparece nesta tela e pode ser restaurado."
              />
            )
          }
        />
      )}
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },

  esvaziarBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    // rgba(255,107,107,x) era o danger estático — vira o danger do tema.
    backgroundColor: comAlfa(c.danger, 0.22),
    borderWidth: 1, borderColor: comAlfa(c.danger, 0.4),
  },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    // rgba(52,198,217,x) era o accent estático — vira o accent do tema.
    backgroundColor: comAlfa(c.accent, 0.10), borderWidth: 1, borderColor: comAlfa(c.accent, 0.24),
    borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 9, marginTop: 14,
  },
  // rgba(255,255,255,0.85) era texto branco fixo (só existia no escuro); no claro
  // ficaria ilegível sobre o tint do infoRow — vira onSurfaceVariant do tema.
  infoText: { flex: 1, fontSize: 12, color: c.onSurfaceVariant, fontWeight: '600', lineHeight: 16 },

  skeletonCard: {
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline, padding: Spacing.base,
  },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.base, paddingTop: 12, paddingBottom: 6,
  },
  sectionTitle: { flex: 1, fontSize: 12.5, fontWeight: '800', color: c.onSurfaceVariant, letterSpacing: 0.3, textTransform: 'uppercase' },
  sectionCount: { fontSize: 12, fontWeight: '800', color: c.onSurfaceMuted },

  card: {
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline, padding: Spacing.base, ...sombrasDe(c).sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  iconBubble: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  cardSub: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  cardMeta: { fontSize: 11.5, color: c.onSurfaceMuted },

  prazoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2,
  },
  prazoText: { fontSize: 10.5, fontWeight: '800' },

  actions: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: c.outline, marginTop: 12, paddingTop: 10 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: BorderRadius.md, borderWidth: 1,
  },
  restaurarBtn: { backgroundColor: comAlfa(c.accent, 0.10), borderColor: comAlfa(c.accent, 0.34) },
  excluirBtn: { backgroundColor: comAlfa(c.danger, 0.08), borderColor: comAlfa(c.danger, 0.30) },
  actionLabel: { fontSize: 12.5, fontWeight: '800' },
});
