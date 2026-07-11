import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, RefreshControl, Animated,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { capitalizeFirst } from '../utils/date';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, corCategoriaEmChip, type Cores } from '../theme';
import { Motion, useReducedMotion } from '../theme/motion';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { OlliPressable } from '../components/OlliPressable';
import { OlliMascot } from '../components/OlliMascot';
import { EmptyState } from '../components/EmptyState';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { getAgendamentosDoDia } from '../services/agenda';
import { getOrcamentos } from '../database/database';
import { onSyncAplicado, pushExtraChave } from '../services/cloudSync';
import { abrirRotaGoogleMaps } from '../services/rotas';
import {
  Agendamento, Orcamento, TIPO_AGENDAMENTO_COLORS, TIPO_AGENDAMENTO_LABELS, propostaJaEnviada,
} from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { generateId } from '../utils/id';
import { CHECKLIST_KEY } from '../services/storageKeys';
import { usePlano } from '../hooks/usePlano';
import { track, Eventos } from '../services/analytics';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const useNativeAnimations = Platform.OS !== 'web';

// LayoutAnimation é opt-in fora do New Architecture no Android; motion.ts já
// chama isto no boot, mas repetimos com guard pois este módulo pode carregar
// antes daquele em builds tree-shaken. Chamada idempotente e barata.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Transição de layout curta para add/remover/reordenar tarefas do checklist —
 * a lista "assenta" em vez de saltar. Usa os tokens de duração/easing da OLLI.
 * No web, LayoutAnimation é no-op inofensivo (não anima, mas não quebra).
 */
function animarLayoutChecklist(reduzir: boolean) {
  // Acessibilidade: sem movimento quando o usuário pediu menos animação (mesmo
  // padrão de Agenda/RelatorioDia). A lista só "salta" para o estado final.
  if (reduzir) return;
  LayoutAnimation.configureNext({
    duration: Motion.dur.base,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  });
}

/**
 * Pill discreto "Sincronizando..." — some com fade sozinho depois de exibido.
 * Dá feedback visual de que a tela está de fato conectada à nuvem quando o
 * `onSyncAplicado` recarrega os dados em segundo plano.
 */
function SincronizandoPill({ onDone, top = 8 }: { onDone: () => void; top?: number }) {
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
    <Animated.View pointerEvents="none" style={[styles.syncPill, { top, opacity }]}>
      <MaterialCommunityIcons
        name="cloud-sync-outline"
        size={13}
        color={cores.accent} // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 2.88:1 (7.25:1)
      />
      <Text style={styles.syncPillText}>Sincronizando...</Text>
    </Animated.View>
  );
}

interface ChecklistItem { id: string; texto: string; feito: boolean; data: string }


function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function diasAtras(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// Formata um ISO em 'HH:mm', protegendo contra datas inválidas/nulas vindas da nuvem.
function hhmm(iso?: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--:--';
  return format(d, 'HH:mm');
}

/**
 * Linha do checklist com transição suave de estado: ao concluir, o checkbox dá
 * um "pop" moderado (o movimento EXPLICA a mudança — não é purpurina) e o texto
 * ganha o risco. Componente próprio para animar por item sem re-disparar a
 * animação a cada render do pai. Toque com feedback tátil (OlliPressable).
 */
const CheckRow = React.memo(function CheckRow(
  { item, onToggle, onRemove }: { item: ChecklistItem; onToggle: (id: string) => void; onRemove: (id: string) => void },
) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  // `scale` guarda diretamente o fator de escala do checkbox (1 = normal).
  const scale = useRef(new Animated.Value(1)).current;
  const primeiraRender = useRef(true);

  useEffect(() => {
    // Não anima na montagem — só quando o estado REALMENTE muda depois.
    if (primeiraRender.current) {
      primeiraRender.current = false;
      return;
    }
    if (item.feito) {
      // pop de sucesso: cresce um tico e assenta de volta em 1. Curto e discreto —
      // o movimento EXPLICA que a tarefa foi concluída, sem virar bounce infantil.
      scale.setValue(1);
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: Motion.dur.fast, easing: Motion.easing.standard, useNativeDriver: useNativeAnimations }),
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: useNativeAnimations }),
      ]).start();
    } else {
      Animated.timing(scale, { toValue: 1, duration: Motion.dur.fast, easing: Motion.easing.standard, useNativeDriver: useNativeAnimations }).start();
    }
  }, [item.feito, scale]);

  return (
    <View style={styles.checkRow}>
      <OlliPressable
        style={styles.checkTap}
        onPress={() => onToggle(item.id)}
        haptic={false}
        accessibilityLabel={item.feito ? `Desmarcar ${item.texto}` : `Concluir ${item.texto}`}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <MaterialCommunityIcons
            name={item.feito ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={22}
            color={item.feito ? cores.success : cores.onSurfaceMuted}
          />
        </Animated.View>
        <Text style={[styles.checkText, item.feito && styles.checkTextDone]} numberOfLines={2}>{item.texto}</Text>
      </OlliPressable>
      <TouchableOpacity
        onPress={() => onRemove(item.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Remover tarefa ${item.texto}`}
      >
        <MaterialCommunityIcons name="close" size={18} color={cores.onSurfaceMuted} />
      </TouchableOpacity>
    </View>
  );
});

export default function HojeScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { temAcesso } = usePlano();
  const relatorioLiberado = temAcesso('relatorio_dia');

  const [itens, setItens] = useState<Agendamento[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [novo, setNovo] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  const load = useCallback(async () => {
    const [ag, orc, raw] = await Promise.all([
      getAgendamentosDoDia(),
      getOrcamentos(),
      AsyncStorage.getItem(CHECKLIST_KEY),
    ]);
    setItens(ag.filter(a => a.status !== 'cancelado').sort((a, b) => a.inicio.localeCompare(b.inicio)));
    setOrcamentos(orc);
    if (raw) {
      try {
        const parsed: ChecklistItem[] = JSON.parse(raw);
        // só mantém os itens de hoje (limpeza diária leve)
        setChecklist(parsed.filter(i => i.data === todayKey()));
      } catch { setChecklist([]); }
    } else {
      setChecklist([]);
    }
    setCarregando(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Recarrega quando um sync com a nuvem terminar (ex.: login recém-feito
  // trazendo agendamentos/orçamentos que ainda não existiam localmente).
  useEffect(() => onSyncAplicado(() => { setSincronizando(true); load(); }), [load]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const persist = useCallback(async (list: ChecklistItem[]) => {
    setChecklist(list);
    await AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(list));
    // Espelha o checklist na nuvem (best-effort, fire-and-forget). Grava o carimbo
    // local e sobe o valor; offline/deslogado fica p/ o próximo login (syncOnLogin).
    // NUNCA bloqueia nem quebra o salvamento local (o await acima é o que importa).
    void pushExtraChave('checklist.hoje').catch(() => {});
  }, []);

  // Respeita prefers-reduced-motion na animação de layout do checklist.
  const reduzirMovimento = useReducedMotion();

  const addItem = useCallback(() => {
    const t = novo.trim();
    if (!t) return;
    Haptics.selectionAsync().catch(() => {});
    animarLayoutChecklist(reduzirMovimento);
    persist([...checklist, { id: generateId(), texto: t, feito: false, data: todayKey() }]);
    setNovo('');
  }, [novo, checklist, persist, reduzirMovimento]);

  const toggle = useCallback((id: string) => {
    const alvo = checklist.find(i => i.id === id);
    // Concluir = "sucesso" (impacto leve); reabrir = seleção neutra.
    if (alvo && !alvo.feito) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    else Haptics.selectionAsync().catch(() => {});
    persist(checklist.map(i => i.id === id ? { ...i, feito: !i.feito } : i));
  }, [checklist, persist]);

  const remove = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    animarLayoutChecklist(reduzirMovimento);
    persist(checklist.filter(i => i.id !== id));
  }, [checklist, persist, reduzirMovimento]);

  // ── lembretes REAIS (sem inventar): orçamentos abertos parados +5 dias ──
  // "Em aberto" cobre toda proposta já entregue ao cliente sem desfecho
  // (enviado/visualizado/em_negociação/aguardando_assinatura), não só os dois
  // estados antigos — senão as propostas mais quentes sumiam dos parados.
  const emAberto = orcamentos.filter(o => propostaJaEnviada(o.status));
  const parados = emAberto.filter(o => diasAtras(o.criadoEm) >= 5);
  const aguardandoAssinatura = orcamentos.filter(o => o.status === 'aguardando_assinatura');

  const feitos = checklist.filter(i => i.feito).length;
  const semNada = itens.length === 0 && parados.length === 0 && aguardandoAssinatura.length === 0;

  return (
    <View style={styles.container}>
      {sincronizando && <SincronizandoPill onDone={() => setSincronizando(false)} top={insets.top + 8} />}
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={cores.accentLight} colors={[cores.accentLight]} />}
      >
        {/* CABEÇALHO */}
        <AnimatedEntrance index={0} from="bottom">
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>MEU DIA</Text>
              <Text style={styles.title}>{saudacao()}</Text>
              <Text style={styles.date}>{capitalizeFirst(format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR }))}</Text>
            </View>
            <OlliMascot size={40} onDark />
          </View>
        </AnimatedEntrance>

        {/* LEMBRETES DA OLLI (reais) */}
        {(parados.length > 0 || aguardandoAssinatura.length > 0) && (
          <AnimatedEntrance index={1}>
            <View style={styles.lembretes}>
              <View style={styles.lembretesHead}>
                <OlliMascot size={26} float={false} onDark />
                <Text style={styles.lembretesTitle}>Lembretes da OLLI</Text>
              </View>

              {parados.length > 0 && (
                <OlliPressable
                  style={styles.lembreteRow}
                  onPress={() => nav.navigate('Orcamentos')}
                  haptic="selection"
                  accessibilityLabel="Ver orçamentos parados"
                >
                  <View style={[styles.lembreteIcon, { backgroundColor: cores.warningLight }]}>
                    <MaterialCommunityIcons name="clock-alert-outline" size={18} color={cores.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lembreteText}>
                      {parados.length} orçamento{parados.length > 1 ? 's' : ''} parado{parados.length > 1 ? 's' : ''} há +5 dias
                    </Text>
                    <Text style={styles.lembreteSub}>Que tal dar um toque no cliente?</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
                </OlliPressable>
              )}

              {aguardandoAssinatura.length > 0 && (
                <OlliPressable
                  style={styles.lembreteRow}
                  onPress={() => nav.navigate('Orcamentos')}
                  haptic="selection"
                  accessibilityLabel="Ver orçamentos aguardando assinatura"
                >
                  <View style={[styles.lembreteIcon, { backgroundColor: 'rgba(52,198,217,0.14)' }]}>
                    <MaterialCommunityIcons name="draw-pen" size={18} color={cores.accentLight} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lembreteText}>
                      {aguardandoAssinatura.length} aguardando assinatura
                    </Text>
                    <Text style={styles.lembreteSub}>Toque para acompanhar.</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
                </OlliPressable>
              )}
            </View>
          </AnimatedEntrance>
        )}

        {/* AGENDA DE HOJE */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Agenda de hoje</Text>
          <TouchableOpacity onPress={() => (nav as any).navigate('Tabs', { screen: 'Agenda' })}>
            <Text style={styles.seeAll}>ver agenda</Text>
          </TouchableOpacity>
        </View>

        {carregando ? (
          <View style={{ paddingHorizontal: Spacing.base, gap: 10 }}>
            {[0, 1, 2].map(i => (
              // Skeleton no formato REAL do agendaCard (hora + barra + título/cliente/chip),
              // entrando escalonado como os cards de verdade — sem "salto" ao carregar.
              <AnimatedEntrance key={i} index={i} from="scale">
                <View style={styles.agendaCard}>
                  <View style={styles.agendaTime}>
                    <OlliSkeleton width={38} height={15} radius={6} />
                    <OlliSkeleton width={30} height={10} radius={5} style={{ marginTop: 4 }} />
                  </View>
                  <View style={[styles.agendaBar, { backgroundColor: cores.surfaceVariant }]} />
                  <View style={{ flex: 1, gap: 7 }}>
                    <OlliSkeleton width="70%" height={14} />
                    <OlliSkeleton width="45%" height={12} />
                    <OlliSkeleton width={82} height={18} radius={BorderRadius.full} />
                  </View>
                </View>
              </AnimatedEntrance>
            ))}
          </View>
        ) : itens.length === 0 ? (
          <View style={styles.emptyDay}>
            <EmptyState
              icon="calendar-check-outline"
              title="Nada agendado para hoje"
              subtitle="Aproveite para organizar a semana ou cadastrar novos orçamentos."
              actionLabel="Abrir agenda"
              onAction={() => { Haptics.selectionAsync().catch(() => {}); (nav as any).navigate('Tabs', { screen: 'Agenda' }); }}
            />
          </View>
        ) : (
          <View style={{ paddingHorizontal: Spacing.base, gap: 10 }}>
            {itens.map((a, i) => {
              // Matiz = significado; luminosidade cede contra o fundo real do chip.
              const corChip = TIPO_AGENDAMENTO_COLORS[a.tipo];
              const cor = corCategoriaEmChip(corChip, cores.surface);
              return (
                <AnimatedEntrance key={a.id} index={i}>
                  <OlliPressable
                    style={styles.agendaCard}
                    onPress={() => (nav as any).navigate('Tabs', { screen: 'Agenda' })}
                    haptic="selection"
                    accessibilityLabel={`Abrir agenda — ${a.titulo}`}
                  >
                    <View style={styles.agendaTime}>
                      <Text style={styles.agendaHour}>{hhmm(a.inicio)}</Text>
                      {a.fim ? <Text style={styles.agendaHourEnd}>{hhmm(a.fim)}</Text> : null}
                    </View>
                    <View style={[styles.agendaBar, { backgroundColor: cor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.agendaTitle} numberOfLines={1}>{a.titulo}</Text>
                      <Text style={styles.agendaClient} numberOfLines={1}>{a.clienteNome}</Text>
                      <View style={[styles.tipoChip, { backgroundColor: corChip + '22', borderColor: corChip + '55' }]}>
                        <Text style={[styles.tipoChipText, { color: cor }]}>{TIPO_AGENDAMENTO_LABELS[a.tipo]}</Text>
                      </View>
                    </View>
                    {a.endereco?.trim() ? (
                      <TouchableOpacity
                        style={styles.rotaBtn}
                        onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync().catch(() => {}); abrirRotaGoogleMaps(a.endereco!); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Traçar rota no Google Maps"
                      >
                        <MaterialCommunityIcons name="navigation-variant" size={18} color={cores.accentLight} />
                      </TouchableOpacity>
                    ) : null}
                    {a.status === 'concluido' && <MaterialCommunityIcons name="check-circle" size={20} color={cores.success} />}
                  </OlliPressable>
                </AnimatedEntrance>
              );
            })}
          </View>
        )}

        {/* CHECKLIST DO DIA */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Checklist do dia</Text>
          {checklist.length > 0 && <Text style={styles.checkCount}>{feitos}/{checklist.length}</Text>}
        </View>

        <View style={styles.checklistCard}>
          <View style={styles.addRow}>
            <MaterialCommunityIcons name="plus-circle-outline" size={20} color={cores.accentLight} />
            <TextInput
              style={styles.addInput}
              value={novo}
              onChangeText={setNovo}
              onSubmitEditing={addItem}
              returnKeyType="done"
              placeholder="Adicionar tarefa…"
              placeholderTextColor={cores.onSurfaceMuted}
            />
            {novo.trim() ? (
              <OlliPressable onPress={addItem} haptic={false} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Adicionar tarefa">
                <MaterialCommunityIcons name="arrow-up-circle" size={24} color={cores.accentLight} />
              </OlliPressable>
            ) : null}
          </View>

          {checklist.length === 0 ? (
            <View style={styles.checklistEmptyWrap}>
              <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={26} color={cores.onSurfaceMuted} />
              <Text style={styles.checklistEmpty}>Sem tarefas por aqui. Anote o que precisa fazer hoje.</Text>
            </View>
          ) : (
            checklist.map(item => (
              <CheckRow key={item.id} item={item} onToggle={toggle} onRemove={remove} />
            ))
          )}

          {/* Nota discreta: checklist agora sincroniza com a nuvem (extras_sync) */}
          <View style={styles.checklistNota}>
            <MaterialCommunityIcons name="cloud-check-outline" size={12} color={cores.onSurfaceMuted} />
            <Text style={styles.checklistNotaText}>Sua lista fica salva na nuvem e acompanha você em qualquer aparelho.</Text>
          </View>
        </View>

        {/* RELATÓRIO DO DIA FALADO — recurso Pro; KPIs continuam grátis dentro da tela */}
        <AnimatedEntrance index={2}>
          <OlliPressable
            style={styles.relatorioCard}
            haptic={false}
            accessibilityLabel="Abrir relatório do dia"
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              if (!relatorioLiberado) track(Eventos.gateVisto, { recurso: 'relatorio_dia', plano: 'pro', origem: 'hoje_card' });
              nav.navigate('RelatorioDia');
            }}
          >
            <View style={styles.relatorioIcon}>
              <MaterialCommunityIcons name="volume-high" size={20} color={cores.accentLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.relatorioTitle}>Como foi seu dia?</Text>
              <Text style={styles.relatorioSub}>Ver e ouvir o relatório do dia</Text>
            </View>
            {relatorioLiberado ? (
              <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
            ) : (
              <View style={styles.relatorioProBadge}>
                <MaterialCommunityIcons name="lock-outline" size={11} color={cores.plan} />
                <Text style={styles.relatorioProBadgeText}>Pro</Text>
              </View>
            )}
          </OlliPressable>
        </AnimatedEntrance>

        {/* ESTADO 100% VAZIO E ELEGANTE */}
        {!carregando && semNada && checklist.length === 0 && (
          <AnimatedEntrance index={1} from="scale" delay={120}>
            <View style={styles.allClear}>
              <OlliMascot size={48} onDark />
              <Text style={styles.allClearTitle}>Tudo em dia!</Text>
              <Text style={styles.allClearSub}>Nenhuma pendência por agora. A OLLI te avisa quando algo precisar de atenção.</Text>
            </View>
          </AnimatedEntrance>
        )}
      </ScrollView>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  syncPill: {
    position: 'absolute', alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    // Pill sempre escura de propósito (como um toast) — sem chave que represente
    // "fundo escuro fixo" nos dois modos (ver rule 7 da migração).
    backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: c.strokeGlow,
    borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6,
    ...sombrasDe(c).sm,
  },
  syncPillText: { fontSize: 11.5, fontWeight: '700', color: c.accent }, // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 2.88:1 (7.25:1)

  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, marginBottom: Spacing.base },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0, color: c.accentLight },
  title: { fontSize: 24, fontWeight: '800', color: c.onBackground, marginTop: 3 },
  date: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },

  lembretes: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, marginHorizontal: Spacing.base, padding: Spacing.md, ...sombrasDe(c).sm },
  lembretesHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lembretesTitle: { fontSize: 14, fontWeight: '800', color: c.onSurface },
  lembreteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  lembreteIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  lembreteText: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  lembreteSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 1 },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.onBackground },
  seeAll: { fontSize: 12.5, color: c.accentLight, fontWeight: '700' },
  checkCount: { fontSize: 13, color: c.onSurfaceVariant, fontWeight: '700' },

  emptyDay: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, marginHorizontal: Spacing.base, minHeight: 220 },

  agendaCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.md, ...sombrasDe(c).sm },
  agendaTime: { width: 46, marginRight: 10 },
  agendaHour: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  agendaHourEnd: { fontSize: 11, color: c.onSurfaceMuted, marginTop: 1 },
  agendaBar: { width: 4, alignSelf: 'stretch', borderRadius: 4, marginRight: 12 },
  agendaTitle: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  agendaClient: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 1 },
  tipoChip: { alignSelf: 'flex-start', borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 2, marginTop: 6 },
  tipoChipText: { fontSize: 11, fontWeight: '800' },
  rotaBtn: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: c.accentContainer, marginLeft: 6 },

  checklistCard: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, marginHorizontal: Spacing.base, padding: Spacing.md, ...sombrasDe(c).sm },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.outline },
  addInput: { flex: 1, fontSize: 14, color: c.onSurface, paddingVertical: 6 },
  checklistEmptyWrap: { alignItems: 'center', gap: 6, paddingVertical: 16 },
  checklistEmpty: { fontSize: 13, color: c.onSurfaceMuted, textAlign: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.outline },
  checkTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkText: { flex: 1, fontSize: 14, color: c.onSurface },
  checkTextDone: { textDecorationLine: 'line-through', color: c.onSurfaceMuted },
  checklistNota: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.outline },
  checklistNotaText: { flex: 1, fontSize: 10.5, color: c.onSurfaceMuted },

  relatorioCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline,
    marginHorizontal: Spacing.base, marginTop: Spacing.xl, padding: Spacing.md, ...sombrasDe(c).sm,
  },
  relatorioIcon: {
    width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.accentContainer,
  },
  relatorioTitle: { fontSize: 14, fontWeight: '800', color: c.onSurface },
  relatorioSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 1 },
  // Roxo fixo (base #7C3AED, mesma família de `c.plan`, mas sem "container" no
  // tema): decorativo, sem chave semântica exata (ver rule 7).
  relatorioProBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(124,58,237,0.14)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.36)', borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  relatorioProBadgeText: { fontSize: 11, fontWeight: '800', color: c.plan },

  allClear: { alignItems: 'center', marginHorizontal: Spacing.base, marginTop: Spacing.xl, padding: Spacing.lg },
  allClearTitle: { fontSize: 17, fontWeight: '800', color: c.onBackground, marginTop: 10 },
  allClearSub: { fontSize: 13, color: c.onSurfaceVariant, textAlign: 'center', marginTop: 4, lineHeight: 19, paddingHorizontal: 12 },
});
