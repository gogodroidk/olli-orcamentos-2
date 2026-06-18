import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Alert,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addDays, addWeeks, addMonths, isSameDay, eachDayOfInterval, isToday,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { EmptyState } from '../components/EmptyState';
import {
  getAgendamentosRange, saveAgendamento, deleteAgendamento,
} from '../services/agenda';
import { getClientes } from '../database/database';
import {
  Agendamento, Cliente, TipoAgendamento, TIPOS_AGENDAMENTO,
  TIPO_AGENDAMENTO_COLORS, TIPO_AGENDAMENTO_LABELS, STATUS_AGENDAMENTO_LABELS,
} from '../types';
import { RootStackParamList, TabParamList } from '../navigation/AppNavigator';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type AgendaRoute = RouteProp<TabParamList, 'Agenda'>;
type Modo = 'dia' | 'semana' | 'mes';

const MODOS: { id: Modo; label: string }[] = [
  { id: 'dia', label: 'Dia' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
];

// Limites do período visível, conforme o modo.
function rangeFor(modo: Modo, ref: Date): { inicio: Date; fim: Date } {
  if (modo === 'dia') return { inicio: startOfDay(ref), fim: endOfDay(ref) };
  if (modo === 'semana') {
    return {
      inicio: startOfWeek(ref, { weekStartsOn: 0 }),
      fim: endOfWeek(ref, { weekStartsOn: 0 }),
    };
  }
  return { inicio: startOfMonth(ref), fim: endOfMonth(ref) };
}

function rotuloPeriodo(modo: Modo, ref: Date): string {
  if (modo === 'dia') return format(ref, "EEEE, d 'de' MMMM", { locale: ptBR });
  if (modo === 'semana') {
    const i = startOfWeek(ref, { weekStartsOn: 0 });
    const f = endOfWeek(ref, { weekStartsOn: 0 });
    return `${format(i, "d MMM", { locale: ptBR })} – ${format(f, "d MMM", { locale: ptBR })}`;
  }
  return format(ref, "MMMM 'de' yyyy", { locale: ptBR });
}

export default function AgendaScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<AgendaRoute>();
  const insets = useSafeAreaInsets();

  const [modo, setModo] = useState<Modo>('dia');
  const [ref, setRef] = useState<Date>(new Date());
  const [itens, setItens] = useState<Agendamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [editing, setEditing] = useState<EditState | null>(null);

  const { inicio, fim } = useMemo(() => rangeFor(modo, ref), [modo, ref]);

  const load = useCallback(async () => {
    const [data, cls] = await Promise.all([
      getAgendamentosRange(inicio.toISOString(), endOfDay(fim).toISOString()),
      getClientes(),
    ]);
    setItens(data);
    setClientes(cls);
  }, [inicio.getTime(), fim.getTime()]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Dias do período que efetivamente têm agendamentos (para o modo semana/mês).
  const dias = useMemo(() => {
    if (modo === 'dia') return [startOfDay(ref)];
    const todos = eachDayOfInterval({ start: inicio, end: fim });
    return todos.filter(d => itens.some(a => isSameDay(new Date(a.inicio), d)));
  }, [modo, ref, inicio.getTime(), fim.getTime(), itens]);

  function passo(delta: number) {
    Haptics.selectionAsync().catch(() => {});
    setRef(prev => modo === 'dia' ? addDays(prev, delta) : modo === 'semana' ? addWeeks(prev, delta) : addMonths(prev, delta));
  }

  function trocarModo(m: Modo) {
    Haptics.selectionAsync().catch(() => {});
    setModo(m);
  }

  function abrirNovo(prefill?: Partial<EditState>) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const base = modo === 'dia' ? ref : new Date();
    const inicioPadrao = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 9, 0, 0, 0);
    setEditing({
      id: undefined,
      clienteId: undefined,
      clienteNome: '',
      titulo: '',
      tipo: 'visita',
      data: inicioPadrao,
      horaInicio: '09:00',
      horaFim: '',
      endereco: '',
      observacao: '',
      ...prefill,
    });
  }

  // Abertura via params (CRM): "agendar visita" a partir de cliente/orçamento.
  // Consome os params UMA vez (limpa depois) para não reabrir o form ao voltar.
  useFocusEffect(useCallback(() => {
    const p = route.params;
    if (p && (p.novoParaClienteId || p.novoParaOrcamentoId || p.novoParaClienteNome)) {
      abrirNovo({
        clienteId: p.novoParaClienteId,
        clienteNome: p.novoParaClienteNome ?? '',
        endereco: p.novoEndereco ?? '',
        titulo: p.novoTitulo ?? '',
        tipo: p.novoParaOrcamentoId ? 'orcamento' : 'visita',
        orcamentoId: p.novoParaOrcamentoId,
      });
      nav.setParams({
        novoParaClienteId: undefined,
        novoParaClienteNome: undefined,
        novoParaOrcamentoId: undefined,
        novoEndereco: undefined,
        novoTitulo: undefined,
      } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params]));

  // Para campos do form: 'HH:mm' válido, ou '' (vazio) quando inválido/ausente.
  function hhmmRaw(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : format(d, 'HH:mm');
  }

  function abrirEdicao(a: Agendamento) {
    const iniRaw = new Date(a.inicio);
    // Se o início vier inválido/nulo da nuvem, cai para hoje (evita RangeError no format).
    const ini = isNaN(iniRaw.getTime()) ? new Date() : iniRaw;
    setEditing({
      id: a.id,
      clienteId: a.clienteId,
      clienteNome: a.clienteNome,
      titulo: a.titulo,
      tipo: a.tipo,
      data: ini,
      horaInicio: format(ini, 'HH:mm'),
      horaFim: hhmmRaw(a.fim),
      endereco: a.endereco ?? '',
      observacao: a.observacao ?? '',
      status: a.status,
      orcamentoId: a.orcamentoId,
      criadoEm: a.criadoEm,
    });
  }

  async function salvar(e: EditState) {
    const ini = combinarDataHora(e.data, e.horaInicio);
    const fimDt = e.horaFim ? combinarDataHora(e.data, e.horaFim) : undefined;
    // Valida só quando ambos os horários existem: o fim precisa ser depois do início.
    if (fimDt && fimDt <= ini) {
      Alert.alert('Horário inválido', 'O horário de fim deve ser depois do horário de início.');
      return;
    }
    const a: Agendamento = {
      id: e.id ?? generateId(),
      clienteId: e.clienteId,
      clienteNome: e.clienteNome.trim() || 'Sem cliente',
      titulo: e.titulo.trim() || TIPO_AGENDAMENTO_LABELS[e.tipo],
      tipo: e.tipo,
      inicio: ini.toISOString(),
      fim: fimDt?.toISOString(),
      endereco: e.endereco.trim() || undefined,
      status: e.status ?? 'agendado',
      orcamentoId: e.orcamentoId,
      observacao: e.observacao.trim() || undefined,
      criadoEm: e.criadoEm ?? nowISO(),
      atualizadoEm: nowISO(),
    };
    await saveAgendamento(a);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setEditing(null);
    // foca o período no dia do agendamento salvo
    setRef(e.data);
    load();
  }

  async function remover(id: string) {
    await deleteAgendamento(id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setEditing(null);
    load();
  }

  const vazio = itens.length === 0;

  return (
    <View style={styles.container}>
      {/* HEADER ESCURO */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Agenda</Text>
            <Text style={styles.headerSub}>{itens.length} compromisso{itens.length === 1 ? '' : 's'} no período</Text>
          </View>
          <TouchableOpacity style={styles.todayBtn} onPress={() => { Haptics.selectionAsync().catch(() => {}); setRef(new Date()); }} activeOpacity={0.85}>
            <Text style={styles.todayBtnText}>Hoje</Text>
          </TouchableOpacity>
        </View>

        {/* SEGMENTED Dia / Semana / Mês */}
        <View style={styles.segment}>
          {MODOS.map(m => {
            const active = m.id === modo;
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                onPress={() => trocarModo(m.id)}
                activeOpacity={0.85}
              >
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* NAV ‹ período › */}
        <View style={styles.navRow}>
          <TouchableOpacity style={styles.navBtn} onPress={() => passo(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={Colors.accentLight} />
          </TouchableOpacity>
          <Text style={styles.navLabel}>{rotuloPeriodo(modo, ref)}</Text>
          <TouchableOpacity style={styles.navBtn} onPress={() => passo(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.accentLight} />
          </TouchableOpacity>
        </View>
      </View>

      {/* LISTA */}
      {vazio ? (
        <View style={{ flex: 1 }}>
          <EmptyState
            icon="calendar-blank-outline"
            title="Nenhuma visita agendada"
            subtitle="Agende suas visitas e serviços para organizar o seu dia."
            actionLabel="Agendar visita"
            onAction={() => abrirNovo()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 110 }}
          showsVerticalScrollIndicator={false}
        >
          {dias.map((dia, di) => {
            const doDia = itens
              .filter(a => isSameDay(new Date(a.inicio), dia))
              .sort((a, b) => a.inicio.localeCompare(b.inicio));
            if (doDia.length === 0) return null;
            return (
              <View key={dia.toISOString()} style={{ marginBottom: Spacing.lg }}>
                {modo !== 'dia' && (
                  <View style={styles.dayHeader}>
                    <Text style={[styles.dayHeaderTitle, isToday(dia) && { color: Colors.accentLight }]}>
                      {format(dia, "EEE, d 'de' MMM", { locale: ptBR })}
                    </Text>
                    {isToday(dia) && <View style={styles.todayDot} />}
                  </View>
                )}
                {doDia.map((a, i) => (
                  <AnimatedEntrance key={a.id} index={di + i}>
                    <AgendaItem item={a} onPress={() => abrirEdicao(a)} />
                  </AnimatedEntrance>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* FAB Agendar visita */}
      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 20 }]} onPress={() => abrirNovo()} activeOpacity={0.9}>
        <MaterialCommunityIcons name="calendar-plus" size={20} color="#0A1626" />
        <Text style={styles.fabText}>Agendar visita</Text>
      </TouchableOpacity>

      {/* FORM MODAL */}
      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)} transparent={false}>
        {editing && (
          <AgendamentoForm
            state={editing}
            clientes={clientes}
            onChange={setEditing}
            onClose={() => setEditing(null)}
            onSave={salvar}
            onDelete={editing.id ? () => remover(editing.id!) : undefined}
            onAbrirOrcamento={editing.orcamentoId ? () => { const id = editing.orcamentoId!; setEditing(null); nav.navigate('VisualizarOrcamento', { orcamentoId: id }); } : undefined}
            onVerCliente={editing.clienteId ? () => { const c = { id: editing.clienteId!, nome: editing.clienteNome }; setEditing(null); nav.navigate('Orcamentos', { clienteId: c.id, clienteNome: c.nome }); } : undefined}
          />
        )}
      </Modal>
    </View>
  );
}

// Formata um ISO em 'HH:mm', protegendo contra datas inválidas/nulas vindas da nuvem.
function hhmm(iso?: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--:--';
  return format(d, 'HH:mm');
}

// ─── ITEM DA LISTA ──────────────────────────────────────────
function AgendaItem({ item, onPress }: { item: Agendamento; onPress: () => void }) {
  const cor = TIPO_AGENDAMENTO_COLORS[item.tipo];
  const iniTxt = hhmm(item.inicio);
  const fimTxt = item.fim ? hhmm(item.fim) : '';
  const cancelado = item.status === 'cancelado';
  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.itemBar, { backgroundColor: cor }]} />
      <View style={styles.itemTime}>
        <Text style={styles.itemHour}>{iniTxt}</Text>
        <Text style={styles.itemHourEnd}>{fimTxt}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemTitle, cancelado && styles.strike]} numberOfLines={1}>{item.titulo}</Text>
        <Text style={styles.itemClient} numberOfLines={1}>{item.clienteNome}</Text>
        <View style={styles.itemMetaRow}>
          <View style={[styles.tipoChip, { backgroundColor: cor + '22', borderColor: cor + '55' }]}>
            <Text style={[styles.tipoChipText, { color: cor }]}>{TIPO_AGENDAMENTO_LABELS[item.tipo]}</Text>
          </View>
          {item.endereco ? (
            <View style={styles.addrRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={13} color={Colors.onSurfaceMuted} />
              <Text style={styles.addrText} numberOfLines={1}>{item.endereco}</Text>
            </View>
          ) : null}
        </View>
        {item.status !== 'agendado' && (
          <Text style={[styles.statusText, item.status === 'concluido' ? { color: Colors.success } : { color: Colors.danger }]}>
            {STATUS_AGENDAMENTO_LABELS[item.status]}
          </Text>
        )}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.onSurfaceMuted} />
    </TouchableOpacity>
  );
}

// ─── FORMULÁRIO ─────────────────────────────────────────────
interface EditState {
  id?: string;
  clienteId?: string;
  clienteNome: string;
  titulo: string;
  tipo: TipoAgendamento;
  data: Date;
  horaInicio: string;
  horaFim: string;
  endereco: string;
  observacao: string;
  status?: Agendamento['status'];
  orcamentoId?: string;
  criadoEm?: string;
}

function combinarDataHora(data: Date, hora: string): Date {
  const [h, m] = (hora || '09:00').split(':').map(n => parseInt(n, 10));
  const d = new Date(data);
  d.setHours(isNaN(h) ? 9 : Math.min(23, h), isNaN(m) ? 0 : Math.min(59, m), 0, 0);
  return d;
}

function maskHora(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function AgendamentoForm({
  state, clientes, onChange, onClose, onSave, onDelete, onAbrirOrcamento, onVerCliente,
}: {
  state: EditState;
  clientes: Cliente[];
  onChange: (s: EditState) => void;
  onClose: () => void;
  onSave: (s: EditState) => void;
  onDelete?: () => void;
  onAbrirOrcamento?: () => void;
  onVerCliente?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [showClientes, setShowClientes] = useState(false);

  const set = (patch: Partial<EditState>) => onChange({ ...state, ...patch });

  function deslocarDia(delta: number) {
    Haptics.selectionAsync().catch(() => {});
    set({ data: addDays(state.data, delta) });
  }

  return (
    <View style={styles.formContainer}>
      <View style={[styles.formHeader, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.formTitle}>{state.id ? 'Editar agendamento' : 'Agendar visita'}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="close" size={26} color={Colors.onSurface} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
        {/* REGISTROS VINCULADOS (CRM) — abre o orçamento / os orçamentos do cliente */}
        {(onAbrirOrcamento || onVerCliente) && (
          <View style={styles.linkRow}>
            {onAbrirOrcamento && (
              <TouchableOpacity style={styles.linkBtn} onPress={onAbrirOrcamento} activeOpacity={0.85}>
                <MaterialCommunityIcons name="file-document-outline" size={18} color={Colors.accentLight} />
                <Text style={styles.linkBtnText}>Ver orçamento</Text>
              </TouchableOpacity>
            )}
            {onVerCliente && (
              <TouchableOpacity style={styles.linkBtn} onPress={onVerCliente} activeOpacity={0.85}>
                <MaterialCommunityIcons name="account-search-outline" size={18} color={Colors.accentLight} />
                <Text style={styles.linkBtnText}>Orçamentos do cliente</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* TIPO */}
        <Text style={styles.fieldLabel}>Tipo</Text>
        <View style={styles.tipoGrid}>
          {TIPOS_AGENDAMENTO.map(t => {
            const active = t.id === state.tipo;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.tipoOption, active && { backgroundColor: t.color + '22', borderColor: t.color }]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); set({ tipo: t.id }); }}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name={t.icon as any} size={18} color={active ? t.color : Colors.onSurfaceVariant} />
                <Text style={[styles.tipoOptionText, active && { color: t.color }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* CLIENTE */}
        <Text style={[styles.fieldLabel, { marginTop: Spacing.base }]}>Cliente</Text>
        <TouchableOpacity style={styles.clientePicker} onPress={() => setShowClientes(v => !v)} activeOpacity={0.85}>
          <MaterialCommunityIcons name="account-outline" size={20} color={Colors.onSurfaceMuted} />
          <Text style={[styles.clientePickerText, !state.clienteNome && { color: Colors.onSurfaceMuted }]} numberOfLines={1}>
            {state.clienteNome || 'Selecionar cliente (opcional)'}
          </Text>
          <MaterialCommunityIcons name={showClientes ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.onSurfaceMuted} />
        </TouchableOpacity>
        {showClientes && (
          <View style={styles.clienteList}>
            {clientes.length === 0 ? (
              <Text style={styles.clienteEmpty}>Nenhum cliente cadastrado ainda.</Text>
            ) : (
              clientes.slice(0, 30).map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.clienteRow}
                  onPress={() => { set({ clienteId: c.id, clienteNome: c.nome, endereco: state.endereco || c.endereco || '' }); setShowClientes(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.clienteRowName}>{c.nome}</Text>
                  {c.telefone ? <Text style={styles.clienteRowMeta}>{c.telefone}</Text> : null}
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Nome do cliente (livre) */}
        <View style={{ marginTop: Spacing.base }}>
          <OlliInput
            label="Nome do cliente"
            value={state.clienteNome}
            onChangeText={v => set({ clienteNome: v, clienteId: undefined })}
            placeholder="Ex: D. Helena Souza"
            leftIcon="account"
          />
        </View>

        {/* TÍTULO */}
        <OlliInput
          label="Título"
          value={state.titulo}
          onChangeText={v => set({ titulo: v })}
          placeholder="Ex: Manutenção Split 12.000 BTUs"
          leftIcon="text"
        />

        {/* DATA */}
        <Text style={styles.fieldLabel}>Data</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.dateNav} onPress={() => deslocarDia(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={Colors.accentLight} />
          </TouchableOpacity>
          <View style={styles.dateDisplay}>
            <MaterialCommunityIcons name="calendar" size={18} color={Colors.accent} />
            <Text style={styles.dateText}>{format(state.data, "EEE, d 'de' MMM 'de' yyyy", { locale: ptBR })}</Text>
          </View>
          <TouchableOpacity style={styles.dateNav} onPress={() => deslocarDia(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.accentLight} />
          </TouchableOpacity>
        </View>
        <View style={styles.quickDates}>
          <QuickDate label="Hoje" onPress={() => set({ data: new Date() })} />
          <QuickDate label="Amanhã" onPress={() => set({ data: addDays(new Date(), 1) })} />
          <QuickDate label="+1 semana" onPress={() => set({ data: addDays(new Date(), 7) })} />
        </View>

        {/* HORÁRIOS */}
        <View style={styles.rowFields}>
          <OlliInput
            label="Início (hh:mm)"
            value={state.horaInicio}
            onChangeText={v => set({ horaInicio: maskHora(v) })}
            placeholder="09:00"
            keyboardType="numeric"
            leftIcon="clock-outline"
            containerStyle={{ flex: 1, marginRight: 10 }}
          />
          <OlliInput
            label="Fim (opcional)"
            value={state.horaFim}
            onChangeText={v => set({ horaFim: maskHora(v) })}
            placeholder="10:30"
            keyboardType="numeric"
            leftIcon="clock-check-outline"
            containerStyle={{ flex: 1 }}
          />
        </View>

        {/* ENDEREÇO */}
        <OlliInput
          label="Endereço"
          value={state.endereco}
          onChangeText={v => set({ endereco: v })}
          placeholder="Rua, número, bairro"
          leftIcon="map-marker"
        />

        {/* OBSERVAÇÃO */}
        <OlliInput
          label="Observação"
          value={state.observacao}
          onChangeText={v => set({ observacao: v })}
          placeholder="Detalhes da visita…"
          leftIcon="note-text-outline"
          multiline
        />

        {/* STATUS (só na edição) */}
        {state.id && (
          <>
            <Text style={styles.fieldLabel}>Status</Text>
            <View style={styles.statusRow}>
              {(['agendado', 'concluido', 'cancelado'] as const).map(s => {
                const active = (state.status ?? 'agendado') === s;
                const cor = s === 'concluido' ? Colors.success : s === 'cancelado' ? Colors.danger : Colors.accent;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusOption, active && { backgroundColor: cor + '22', borderColor: cor }]}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); set({ status: s }); }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.statusOptionText, active && { color: cor }]}>{STATUS_AGENDAMENTO_LABELS[s]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {onDelete && (
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} activeOpacity={0.8}>
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={Colors.danger} />
            <Text style={styles.deleteText}>Excluir agendamento</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={[styles.formFooter, { paddingBottom: insets.bottom + 16 }]}>
        <OlliButton
          label={state.id ? 'Salvar alterações' : 'Confirmar agendamento'}
          variant="gradient" size="lg" fullWidth
          onPress={() => onSave(state)}
          icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />}
        />
      </View>
    </View>
  );
}

function QuickDate({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.quickDate}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      activeOpacity={0.8}
    >
      <Text style={styles.quickDateText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: { backgroundColor: Colors.surfaceVariant, paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  headerSub: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  todayBtn: { backgroundColor: 'rgba(52,198,217,0.14)', borderWidth: 1, borderColor: 'rgba(52,198,217,0.4)', borderRadius: BorderRadius.full, paddingHorizontal: 16, paddingVertical: 8 },
  todayBtnText: { fontSize: 13, fontWeight: '800', color: Colors.accentLight },

  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.md, padding: 4, marginTop: Spacing.base, borderWidth: 1, borderColor: Colors.outline },
  segmentItem: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: BorderRadius.sm },
  segmentItemActive: { backgroundColor: Colors.accent },
  segmentLabel: { fontSize: 14, fontWeight: '700', color: Colors.onSurfaceVariant },
  segmentLabelActive: { color: '#0A1626' },

  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.base },
  navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.outline },
  navLabel: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },

  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dayHeaderTitle: { fontSize: 14, fontWeight: '800', color: Colors.onSurface, textTransform: 'capitalize' },
  todayDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.accentLight },

  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: Spacing.md, marginBottom: 10, ...Shadow.sm },
  itemBar: { width: 4, alignSelf: 'stretch', borderRadius: 4, marginRight: 12 },
  itemTime: { width: 48, marginRight: 8 },
  itemHour: { fontSize: 15, fontWeight: '800', color: '#fff' },
  itemHourEnd: { fontSize: 11, color: Colors.onSurfaceMuted, marginTop: 1 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  itemClient: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 1 },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  tipoChip: { borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 2 },
  tipoChipText: { fontSize: 11, fontWeight: '800' },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  addrText: { fontSize: 11.5, color: Colors.onSurfaceMuted, flex: 1 },
  statusText: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  strike: { textDecorationLine: 'line-through', color: Colors.onSurfaceMuted },

  fab: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 22, paddingVertical: 14, ...Shadow.glowCyan },
  fabText: { fontSize: 15, fontWeight: '800', color: '#0A1626' },

  // FORM
  formContainer: { flex: 1, backgroundColor: Colors.background },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  formTitle: { fontSize: 20, fontWeight: '800', color: Colors.onSurface },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant, marginBottom: 8 },

  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.base },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(52,198,217,0.10)', borderWidth: 1, borderColor: 'rgba(52,198,217,0.30)', borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 10 },
  linkBtnText: { fontSize: 13, fontWeight: '700', color: Colors.accentLight },

  tipoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipoOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.outline, backgroundColor: Colors.surfaceVariant },
  tipoOptionText: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant },

  clientePicker: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.outline, paddingHorizontal: 14, minHeight: 50 },
  clientePickerText: { flex: 1, fontSize: 15, color: Colors.onSurface },
  clienteList: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.outline, marginTop: 6, overflow: 'hidden' },
  clienteRow: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  clienteRowName: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  clienteRowMeta: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 1 },
  clienteEmpty: { fontSize: 13, color: Colors.onSurfaceMuted, padding: 14, textAlign: 'center' },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dateNav: { width: 42, height: 50, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceVariant, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.outline },
  dateDisplay: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceVariant, borderWidth: 1.5, borderColor: Colors.outline },
  dateText: { fontSize: 14, fontWeight: '700', color: Colors.onSurface, textTransform: 'capitalize' },
  quickDates: { flexDirection: 'row', gap: 8, marginBottom: Spacing.base },
  quickDate: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: BorderRadius.sm, backgroundColor: 'rgba(52,198,217,0.10)', borderWidth: 1, borderColor: 'rgba(52,198,217,0.3)' },
  quickDateText: { fontSize: 12.5, fontWeight: '700', color: Colors.accentLight },

  rowFields: { flexDirection: 'row' },

  statusRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.base },
  statusOption: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.outline, backgroundColor: Colors.surfaceVariant },
  statusOptionText: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant },

  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, marginTop: 6 },
  deleteText: { fontSize: 14, fontWeight: '700', color: Colors.danger },

  formFooter: { padding: Spacing.base, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.outline },
});
