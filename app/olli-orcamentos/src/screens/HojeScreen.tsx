import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { OlliMascot } from '../components/OlliMascot';
import { getAgendamentosDoDia } from '../services/agenda';
import { getOrcamentos } from '../database/database';
import {
  Agendamento, Orcamento, TIPO_AGENDAMENTO_COLORS, TIPO_AGENDAMENTO_LABELS,
} from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { generateId } from '../utils/id';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface ChecklistItem { id: string; texto: string; feito: boolean; data: string }

const CHECKLIST_KEY = 'olli.hoje.checklist';

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

export default function HojeScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [itens, setItens] = useState<Agendamento[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [novo, setNovo] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  async function persist(list: ChecklistItem[]) {
    setChecklist(list);
    await AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(list));
  }

  function addItem() {
    const t = novo.trim();
    if (!t) return;
    Haptics.selectionAsync().catch(() => {});
    persist([...checklist, { id: generateId(), texto: t, feito: false, data: todayKey() }]);
    setNovo('');
  }

  function toggle(id: string) {
    Haptics.selectionAsync().catch(() => {});
    persist(checklist.map(i => i.id === id ? { ...i, feito: !i.feito } : i));
  }

  function remove(id: string) {
    persist(checklist.filter(i => i.id !== id));
  }

  // ── lembretes REAIS (sem inventar): orçamentos abertos parados +5 dias ──
  const emAberto = orcamentos.filter(o => o.status === 'enviado' || o.status === 'aguardando_assinatura');
  const parados = emAberto.filter(o => diasAtras(o.criadoEm) >= 5);
  const aguardandoAssinatura = orcamentos.filter(o => o.status === 'aguardando_assinatura');

  const feitos = checklist.filter(i => i.feito).length;
  const semNada = itens.length === 0 && parados.length === 0 && aguardandoAssinatura.length === 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} colors={[Colors.accent]} />}
      >
        {/* CABEÇALHO */}
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>MEU DIA</Text>
            <Text style={styles.title}>{saudacao()}</Text>
            <Text style={styles.date}>{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</Text>
          </View>
          <OlliMascot size={40} onDark />
        </View>

        {/* LEMBRETES DA OLLI (reais) */}
        {(parados.length > 0 || aguardandoAssinatura.length > 0) && (
          <AnimatedEntrance index={0}>
            <View style={styles.lembretes}>
              <View style={styles.lembretesHead}>
                <OlliMascot size={26} float={false} onDark />
                <Text style={styles.lembretesTitle}>Lembretes da OLLI</Text>
              </View>

              {parados.length > 0 && (
                <TouchableOpacity
                  style={styles.lembreteRow}
                  onPress={() => nav.navigate('Orcamentos')}
                  activeOpacity={0.85}
                >
                  <View style={[styles.lembreteIcon, { backgroundColor: Colors.warningLight }]}>
                    <MaterialCommunityIcons name="clock-alert-outline" size={18} color={Colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lembreteText}>
                      {parados.length} orçamento{parados.length > 1 ? 's' : ''} parado{parados.length > 1 ? 's' : ''} há +5 dias
                    </Text>
                    <Text style={styles.lembreteSub}>Que tal dar um toque no cliente?</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.onSurfaceMuted} />
                </TouchableOpacity>
              )}

              {aguardandoAssinatura.length > 0 && (
                <TouchableOpacity
                  style={styles.lembreteRow}
                  onPress={() => nav.navigate('Orcamentos')}
                  activeOpacity={0.85}
                >
                  <View style={[styles.lembreteIcon, { backgroundColor: 'rgba(52,198,217,0.14)' }]}>
                    <MaterialCommunityIcons name="draw-pen" size={18} color={Colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lembreteText}>
                      {aguardandoAssinatura.length} aguardando assinatura
                    </Text>
                    <Text style={styles.lembreteSub}>Toque para acompanhar.</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.onSurfaceMuted} />
                </TouchableOpacity>
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

        {itens.length === 0 ? (
          <View style={styles.emptyDay}>
            <MaterialCommunityIcons name="calendar-check-outline" size={30} color={Colors.accent} />
            <Text style={styles.emptyDayTitle}>Nada agendado para hoje</Text>
            <Text style={styles.emptyDaySub}>Aproveite para organizar a semana ou cadastrar novos orçamentos.</Text>
            <TouchableOpacity
              style={styles.emptyDayBtn}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); (nav as any).navigate('Tabs', { screen: 'Agenda' }); }}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="calendar-plus" size={16} color="#0A1626" />
              <Text style={styles.emptyDayBtnText}>Abrir agenda</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingHorizontal: Spacing.base, gap: 10 }}>
            {itens.map((a, i) => {
              const cor = TIPO_AGENDAMENTO_COLORS[a.tipo];
              return (
                <AnimatedEntrance key={a.id} index={i}>
                  <TouchableOpacity
                    style={styles.agendaCard}
                    onPress={() => (nav as any).navigate('Tabs', { screen: 'Agenda' })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.agendaTime}>
                      <Text style={styles.agendaHour}>{hhmm(a.inicio)}</Text>
                      {a.fim ? <Text style={styles.agendaHourEnd}>{hhmm(a.fim)}</Text> : null}
                    </View>
                    <View style={[styles.agendaBar, { backgroundColor: cor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.agendaTitle} numberOfLines={1}>{a.titulo}</Text>
                      <Text style={styles.agendaClient} numberOfLines={1}>{a.clienteNome}</Text>
                      <View style={[styles.tipoChip, { backgroundColor: cor + '22', borderColor: cor + '55' }]}>
                        <Text style={[styles.tipoChipText, { color: cor }]}>{TIPO_AGENDAMENTO_LABELS[a.tipo]}</Text>
                      </View>
                    </View>
                    {a.status === 'concluido' && <MaterialCommunityIcons name="check-circle" size={20} color={Colors.success} />}
                  </TouchableOpacity>
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
            <MaterialCommunityIcons name="plus-circle-outline" size={20} color={Colors.accent} />
            <TextInput
              style={styles.addInput}
              value={novo}
              onChangeText={setNovo}
              onSubmitEditing={addItem}
              returnKeyType="done"
              placeholder="Adicionar tarefa…"
              placeholderTextColor={Colors.onSurfaceMuted}
            />
            {novo.trim() ? (
              <TouchableOpacity onPress={addItem} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="arrow-up-circle" size={24} color={Colors.accent} />
              </TouchableOpacity>
            ) : null}
          </View>

          {checklist.length === 0 ? (
            <Text style={styles.checklistEmpty}>Sem tarefas. Anote o que precisa fazer hoje.</Text>
          ) : (
            checklist.map(item => (
              <View key={item.id} style={styles.checkRow}>
                <TouchableOpacity style={styles.checkTap} onPress={() => toggle(item.id)} activeOpacity={0.8}>
                  <MaterialCommunityIcons
                    name={item.feito ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={22}
                    color={item.feito ? Colors.success : Colors.onSurfaceMuted}
                  />
                  <Text style={[styles.checkText, item.feito && styles.checkTextDone]} numberOfLines={2}>{item.texto}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="close" size={18} color={Colors.onSurfaceMuted} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ESTADO 100% VAZIO E ELEGANTE */}
        {semNada && checklist.length === 0 && (
          <AnimatedEntrance index={1}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, marginBottom: Spacing.base },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: Colors.accentLight },
  title: { fontSize: 24, fontWeight: '800', color: '#fff', marginTop: 3 },
  date: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2, textTransform: 'capitalize' },

  lembretes: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, marginHorizontal: Spacing.base, padding: Spacing.md, ...Shadow.sm },
  lembretesHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lembretesTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  lembreteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  lembreteIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  lembreteText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  lembreteSub: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 1 },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  seeAll: { fontSize: 12.5, color: Colors.accent, fontWeight: '700' },
  checkCount: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '700' },

  emptyDay: { alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, marginHorizontal: Spacing.base, paddingVertical: Spacing.lg, paddingHorizontal: Spacing.base },
  emptyDayTitle: { fontSize: 15, fontWeight: '800', color: '#fff', marginTop: 8 },
  emptyDaySub: { fontSize: 12.5, color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: 4, lineHeight: 18, paddingHorizontal: 10 },
  emptyDayBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 16, paddingVertical: 9, marginTop: 12 },
  emptyDayBtnText: { fontSize: 13, fontWeight: '800', color: '#0A1626' },

  agendaCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: Spacing.md, ...Shadow.sm },
  agendaTime: { width: 46, marginRight: 10 },
  agendaHour: { fontSize: 15, fontWeight: '800', color: '#fff' },
  agendaHourEnd: { fontSize: 11, color: Colors.onSurfaceMuted, marginTop: 1 },
  agendaBar: { width: 4, alignSelf: 'stretch', borderRadius: 4, marginRight: 12 },
  agendaTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  agendaClient: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 1 },
  tipoChip: { alignSelf: 'flex-start', borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 2, marginTop: 6 },
  tipoChipText: { fontSize: 11, fontWeight: '800' },

  checklistCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, marginHorizontal: Spacing.base, padding: Spacing.md, ...Shadow.sm },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  addInput: { flex: 1, fontSize: 14, color: Colors.onSurface, paddingVertical: 6 },
  checklistEmpty: { fontSize: 13, color: Colors.onSurfaceMuted, paddingVertical: 14, textAlign: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  checkTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkText: { flex: 1, fontSize: 14, color: Colors.onSurface },
  checkTextDone: { textDecorationLine: 'line-through', color: Colors.onSurfaceMuted },

  allClear: { alignItems: 'center', marginHorizontal: Spacing.base, marginTop: Spacing.xl, padding: Spacing.lg },
  allClearTitle: { fontSize: 17, fontWeight: '800', color: '#fff', marginTop: 10 },
  allClearSub: { fontSize: 13, color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: 4, lineHeight: 19, paddingHorizontal: 12 },
});
