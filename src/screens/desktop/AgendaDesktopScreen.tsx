import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  format, startOfWeek, endOfWeek, addDays, addWeeks, isSameDay, isToday, eachDayOfInterval,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, sombrasDe, comAlfa, textoSobre, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { PressableWebState } from '../../components/web/pressableWebState';
import { OlliInput } from '../../components/OlliInput';
import { OlliButton } from '../../components/OlliButton';
import { OlliSkeleton } from '../../components/OlliSkeleton';
import {
  getAgendamentosRange, saveAgendamento, deleteAgendamento,
} from '../../services/agenda';
import {
  Agendamento, TipoAgendamento, TIPOS_AGENDAMENTO,
  TIPO_AGENDAMENTO_COLORS, TIPO_AGENDAMENTO_LABELS, STATUS_AGENDAMENTO_LABELS,
} from '../../types';
import { RootStackParamList, TabParamList } from '../../navigation/AppNavigator';
import { generateId } from '../../utils/id';
import { nowISO, capitalizeFirst } from '../../utils/date';
import { onSyncAplicado } from '../../services/cloudSync';
import { avisar, confirmar } from './dialogo';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type AgendaRoute = RouteProp<TabParamList, 'Agenda'>;

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Formata um ISO em 'HH:mm', protegendo contra datas inválidas/nulas vindas da nuvem.
function hhmm(iso?: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--:--';
  return format(d, 'HH:mm');
}

function combinarDataHora(data: Date, hora: string): Date {
  const [h, m] = (hora || '09:00').split(':').map((n) => parseInt(n, 10));
  const d = new Date(data);
  d.setHours(isNaN(h) ? 9 : Math.min(23, h), isNaN(m) ? 0 : Math.min(59, m), 0, 0);
  return d;
}

function maskHora(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

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

/**
 * Agenda desktop (v4) — grade de semana (7 colunas). Reusa 100% da escrita do
 * service (saveAgendamento/deleteAgendamento) — mesmo shape de Agendamento da
 * AgendaScreen mobile, para não furar o cloudSync nem duplicar lógica.
 * Lembretes locais (expo-notifications) continuam sendo acionados dentro do
 * próprio service; na web isso já é no-op silencioso (ver services/agenda.ts).
 */
export default function AgendaDesktopScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<AgendaRoute>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const [semanaRef, setSemanaRef] = useState(new Date());
  const [itens, setItens] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState<Agendamento | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Grade desktop começa na SEGUNDA (padrão de agenda profissional/comercial;
  // decisão explícita da v4 para a visão semanal desktop, ver PLANTA).
  const inicioSemana = useMemo(() => startOfWeek(semanaRef, { weekStartsOn: 1 }), [semanaRef]);
  const fimSemana = useMemo(() => endOfWeek(semanaRef, { weekStartsOn: 1 }), [semanaRef]);
  const dias = useMemo(() => eachDayOfInterval({ start: inicioSemana, end: fimSemana }), [inicioSemana, fimSemana]);

  const rotuloSemana = useMemo(() => {
    const mesmoMes = inicioSemana.getMonth() === fimSemana.getMonth();
    const ini = format(inicioSemana, mesmoMes ? 'd' : "d 'de' MMM", { locale: ptBR });
    const fim = format(fimSemana, "d 'de' MMM", { locale: ptBR });
    return `${ini} – ${fim}`;
  }, [inicioSemana, fimSemana]);

  const load = useCallback(async () => {
    const data = await getAgendamentosRange(inicioSemana.toISOString(), addDays(fimSemana, 1).toISOString());
    setItens(data);
    setCarregando(false);
  }, [inicioSemana.getTime(), fimSemana.getTime()]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => onSyncAplicado(load), [load]);

  function abrirNovo(prefill?: Partial<EditState>) {
    const base = prefill?.data ?? new Date();
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

  function abrirEdicao(a: Agendamento) {
    const iniRaw = new Date(a.inicio);
    const ini = isNaN(iniRaw.getTime()) ? new Date() : iniRaw;
    setDetalhe(null);
    setEditing({
      id: a.id,
      clienteId: a.clienteId,
      clienteNome: a.clienteNome,
      titulo: a.titulo,
      tipo: a.tipo,
      data: ini,
      horaInicio: format(ini, 'HH:mm'),
      horaFim: hhmm(a.fim) === '--:--' ? '' : hhmm(a.fim),
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
    if (fimDt && fimDt <= ini) {
      avisar('Horário inválido', 'O horário de fim deve ser depois do horário de início.');
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
    setSalvando(true);
    try {
      await saveAgendamento(a);
      setEditing(null);
      setSemanaRef(e.data);
      await load();
    } catch {
      avisar('Erro', 'Não foi possível salvar o agendamento agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function concluir(a: Agendamento) {
    setSalvando(true);
    try {
      await saveAgendamento({ ...a, status: 'concluido', atualizadoEm: nowISO() });
      setDetalhe(null);
      await load();
    } catch {
      avisar('Erro', 'Não foi possível concluir o agendamento agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function cancelar(a: Agendamento) {
    setSalvando(true);
    try {
      await saveAgendamento({ ...a, status: 'cancelado', atualizadoEm: nowISO() });
      setDetalhe(null);
      await load();
    } catch {
      avisar('Erro', 'Não foi possível cancelar o agendamento agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    if (!confirmar('Excluir agendamento', 'Essa ação não pode ser desfeita.')) return;
    setSalvando(true);
    try {
      await deleteAgendamento(id);
      setEditing(null);
      setDetalhe(null);
      await load();
    } catch {
      avisar('Erro', 'Não foi possível excluir o agendamento agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <LayoutDesktop
      titulo="Agenda"
      subtitulo={rotuloSemana}
      acoes={
        <View style={styles.acoesRow}>
          <Pressable
            onPress={() => setSemanaRef(addWeeks(semanaRef, -1))}
            style={({ hovered, focused }: PressableWebState) => [styles.navBtn, hovered && styles.navBtnHover, focused && styles.focoVisivel]}
            accessibilityLabel="Semana anterior"
          >
            <MaterialCommunityIcons name="chevron-left" size={20} color={cores.onSurface} />
          </Pressable>
          <Pressable
            onPress={() => setSemanaRef(new Date())}
            style={({ hovered, focused }: PressableWebState) => [styles.hojeBtn, hovered && styles.navBtnHover, focused && styles.focoVisivel]}
          >
            <Text style={styles.hojeBtnText}>Hoje</Text>
          </Pressable>
          <Pressable
            onPress={() => setSemanaRef(addWeeks(semanaRef, 1))}
            style={({ hovered, focused }: PressableWebState) => [styles.navBtn, hovered && styles.navBtnHover, focused && styles.focoVisivel]}
            accessibilityLabel="Próxima semana"
          >
            <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurface} />
          </Pressable>
          <Pressable
            onPress={() => abrirNovo()}
            style={({ hovered, focused }: PressableWebState) => [styles.novoBtn, hovered && styles.novoBtnHover, focused && styles.focoVisivel]}
          >
            <MaterialCommunityIcons name="calendar-plus" size={18} color={textoSobre(cores.accent)} />
            <Text style={styles.novoBtnText}>Novo agendamento</Text>
          </Pressable>
        </View>
      }
    >
      {carregando ? (
        <View style={styles.grade}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={styles.coluna}>
              <OlliSkeleton width="80%" height={14} style={{ marginBottom: Spacing.sm }} />
              <OlliSkeleton width="100%" height={60} radius={BorderRadius.sm} />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.grade}>
          {dias.map((dia) => {
            const doDia = itens
              .filter((a) => isSameDay(new Date(a.inicio), dia))
              .sort((a, b) => a.inicio.localeCompare(b.inicio));
            const hoje = isToday(dia);
            return (
              <View key={dia.toISOString()} style={[styles.coluna, hoje && styles.colunaHoje]}>
                <View style={styles.colunaHeader}>
                  <Text style={[styles.colunaDiaSemana, hoje && styles.colunaHojeTexto]}>
                    {DIAS_SEMANA[dia.getDay()]}
                  </Text>
                  <Text style={[styles.colunaDiaNumero, hoje && styles.colunaHojeTexto]}>
                    {format(dia, 'd')}
                  </Text>
                </View>
                <ScrollView style={styles.colunaScroll} showsVerticalScrollIndicator={false}>
                  {doDia.length === 0 ? (
                    <Pressable
                      onPress={() => abrirNovo({ data: dia })}
                      style={({ hovered, focused }: PressableWebState) => [styles.colunaVazia, hovered && styles.colunaVaziaHover, focused && styles.focoVisivel]}
                    >
                      <MaterialCommunityIcons name="plus" size={16} color={cores.onSurfaceMuted} />
                    </Pressable>
                  ) : (
                    doDia.map((a) => (
                      <CardAgendamento key={a.id} item={a} onPress={() => setDetalhe(a)} />
                    ))
                  )}
                </ScrollView>
              </View>
            );
          })}
        </View>
      )}

      {/* MODAL DE DETALHE */}
      <Modal visible={!!detalhe} transparent animationType="fade" onRequestClose={() => setDetalhe(null)}>
        {detalhe && (
          <View style={styles.modalFundo}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={[styles.tipoChip, { backgroundColor: TIPO_AGENDAMENTO_COLORS[detalhe.tipo] + '22', borderColor: TIPO_AGENDAMENTO_COLORS[detalhe.tipo] + '55' }]}>
                  <Text style={[styles.tipoChipText, { color: TIPO_AGENDAMENTO_COLORS[detalhe.tipo] }]}>
                    {TIPO_AGENDAMENTO_LABELS[detalhe.tipo]}
                  </Text>
                </View>
                <Pressable onPress={() => setDetalhe(null)} hitSlop={10}>
                  <MaterialCommunityIcons name="close" size={22} color={cores.onSurface} />
                </Pressable>
              </View>

              <Text style={styles.modalTitulo}>{detalhe.titulo}</Text>
              <Text style={styles.modalCliente}>{detalhe.clienteNome}</Text>

              <View style={styles.modalLinha}>
                <MaterialCommunityIcons name="clock-outline" size={16} color={cores.onSurfaceMuted} />
                <Text style={styles.modalLinhaTexto}>
                  {capitalizeFirst(format(new Date(detalhe.inicio), "EEEE, d 'de' MMM", { locale: ptBR }))} · {hhmm(detalhe.inicio)}
                  {detalhe.fim ? ` – ${hhmm(detalhe.fim)}` : ''}
                </Text>
              </View>
              {detalhe.endereco ? (
                <View style={styles.modalLinha}>
                  <MaterialCommunityIcons name="map-marker-outline" size={16} color={cores.onSurfaceMuted} />
                  <Text style={styles.modalLinhaTexto}>{detalhe.endereco}</Text>
                </View>
              ) : null}
              {detalhe.observacao ? (
                <View style={styles.modalLinha}>
                  <MaterialCommunityIcons name="note-text-outline" size={16} color={cores.onSurfaceMuted} />
                  <Text style={styles.modalLinhaTexto}>{detalhe.observacao}</Text>
                </View>
              ) : null}

              {detalhe.status !== 'agendado' && (
                <Text style={[styles.modalStatus, detalhe.status === 'concluido' ? { color: cores.success } : { color: cores.danger }]}>
                  {STATUS_AGENDAMENTO_LABELS[detalhe.status]}
                </Text>
              )}

              <View style={styles.modalAcoes}>
                {detalhe.orcamentoId && (
                  <Pressable
                    onPress={() => { const id = detalhe.orcamentoId!; setDetalhe(null); nav.navigate('VisualizarOrcamento', { orcamentoId: id }); }}
                    style={({ hovered }: PressableWebState) => [styles.modalAcaoLink, hovered && styles.modalAcaoLinkHover]}
                  >
                    <MaterialCommunityIcons name="file-document-outline" size={16} color={cores.accentLight} />
                    <Text style={styles.modalAcaoLinkTexto}>Ver orçamento</Text>
                  </Pressable>
                )}
                {detalhe.clienteId && (
                  <Pressable
                    onPress={() => { const id = detalhe.clienteId!; const nome = detalhe.clienteNome; setDetalhe(null); (nav as any).navigate('Tabs', { screen: 'OrcamentosTab', params: { clienteId: id, clienteNome: nome } }); }}
                    style={({ hovered }: PressableWebState) => [styles.modalAcaoLink, hovered && styles.modalAcaoLinkHover]}
                  >
                    <MaterialCommunityIcons name="account-search-outline" size={16} color={cores.accentLight} />
                    <Text style={styles.modalAcaoLinkTexto}>Orçamentos do cliente</Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.modalBotoes}>
                {detalhe.status === 'agendado' && (
                  <>
                    <OlliButton
                      label="Concluir"
                      variant="gradient"
                      onPress={() => concluir(detalhe)}
                      loading={salvando}
                      disabled={salvando}
                      style={{ flex: 1 }}
                      icon={<MaterialCommunityIcons name="check" size={18} color="#fff" />}
                    />
                    <OlliButton
                      label="Cancelar"
                      variant="outline"
                      onPress={() => cancelar(detalhe)}
                      loading={salvando}
                      disabled={salvando}
                      style={{ flex: 1 }}
                    />
                  </>
                )}
                <Pressable
                  onPress={() => abrirEdicao(detalhe)}
                  style={({ hovered }: PressableWebState) => [styles.modalIconBtn, hovered && styles.modalIconBtnHover]}
                  accessibilityLabel="Editar"
                >
                  <MaterialCommunityIcons name="pencil-outline" size={18} color={cores.onSurface} />
                </Pressable>
                <Pressable
                  onPress={() => remover(detalhe.id)}
                  style={({ hovered }: PressableWebState) => [styles.modalIconBtn, hovered && styles.modalIconBtnHover]}
                  accessibilityLabel="Excluir"
                  disabled={salvando}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={cores.danger} />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </Modal>

      {/* MODAL DE CRIAÇÃO/EDIÇÃO */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        {editing && (
          <View style={styles.modalFundo}>
            <View style={[styles.modalCard, styles.formCard]}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitulo}>{editing.id ? 'Editar agendamento' : 'Novo agendamento'}</Text>
                  <Pressable onPress={() => setEditing(null)} hitSlop={10}>
                    <MaterialCommunityIcons name="close" size={22} color={cores.onSurface} />
                  </Pressable>
                </View>

                <Text style={styles.fieldLabel}>Tipo</Text>
                <View style={styles.tipoGrid}>
                  {TIPOS_AGENDAMENTO.map((t) => {
                    const active = t.id === editing.tipo;
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => setEditing({ ...editing, tipo: t.id })}
                        style={({ hovered }: PressableWebState) => [
                          styles.tipoOption,
                          active && { backgroundColor: t.color + '22', borderColor: t.color },
                          !active && hovered && styles.tipoOptionHover,
                        ]}
                      >
                        <MaterialCommunityIcons name={t.icon as any} size={16} color={active ? t.color : cores.onSurfaceVariant} />
                        <Text style={[styles.tipoOptionText, active && { color: t.color }]}>{t.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <OlliInput
                  label="Nome do cliente"
                  value={editing.clienteNome}
                  onChangeText={(v) => setEditing({ ...editing, clienteNome: v, clienteId: undefined })}
                  placeholder="Ex: D. Helena Souza"
                  leftIcon="account"
                />

                <OlliInput
                  label="Título"
                  value={editing.titulo}
                  onChangeText={(v) => setEditing({ ...editing, titulo: v })}
                  placeholder="Ex: Manutenção Split 12.000 BTUs"
                  leftIcon="text"
                />

                <View style={styles.rowFields}>
                  <OlliInput
                    label="Início (hh:mm)"
                    value={editing.horaInicio}
                    onChangeText={(v) => setEditing({ ...editing, horaInicio: maskHora(v) })}
                    placeholder="09:00"
                    keyboardType="numeric"
                    leftIcon="clock-outline"
                    containerStyle={{ flex: 1, marginRight: 10 }}
                  />
                  <OlliInput
                    label="Fim (opcional)"
                    value={editing.horaFim}
                    onChangeText={(v) => setEditing({ ...editing, horaFim: maskHora(v) })}
                    placeholder="10:30"
                    keyboardType="numeric"
                    leftIcon="clock-check-outline"
                    containerStyle={{ flex: 1 }}
                  />
                </View>

                <OlliInput
                  label="Endereço"
                  value={editing.endereco}
                  onChangeText={(v) => setEditing({ ...editing, endereco: v })}
                  placeholder="Rua, número, bairro"
                  leftIcon="map-marker"
                />

                <OlliInput
                  label="Observação"
                  value={editing.observacao}
                  onChangeText={(v) => setEditing({ ...editing, observacao: v })}
                  placeholder="Detalhes da visita…"
                  leftIcon="note-text-outline"
                  multiline
                />

                <View style={styles.modalFooterBtns}>
                  <OlliButton
                    label={editing.id ? 'Salvar alterações' : 'Confirmar agendamento'}
                    variant="gradient"
                    fullWidth
                    onPress={() => salvar(editing)}
                    loading={salvando}
                    disabled={salvando}
                    icon={<MaterialCommunityIcons name="check" size={18} color="#fff" />}
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </LayoutDesktop>
  );
}

function CardAgendamento({ item, onPress }: { item: Agendamento; onPress: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const cor = TIPO_AGENDAMENTO_COLORS[item.tipo];
  const cancelado = item.status === 'cancelado';
  const concluido = item.status === 'concluido';
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, focused }: PressableWebState) => [styles.card, { borderLeftColor: cor }, hovered && styles.cardHover, focused && styles.focoVisivel]}
    >
      <Text style={styles.cardHora}>{hhmm(item.inicio)}</Text>
      <Text style={[styles.cardTitulo, cancelado && styles.strike]} numberOfLines={1}>{item.titulo}</Text>
      <Text style={styles.cardCliente} numberOfLines={1}>{item.clienteNome}</Text>
      {(cancelado || concluido) && (
        <Text style={[styles.cardStatus, concluido ? { color: cores.success } : { color: cores.danger }]}>
          {STATUS_AGENDAMENTO_LABELS[item.status]}
        </Text>
      )}
    </Pressable>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  focoVisivel: {
    outlineWidth: 2,
    outlineColor: c.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  } as any,
  acoesRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  navBtn: {
    width: 36, height: 36, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline,
  },
  navBtnHover: { backgroundColor: c.surfacePressed },
  hojeBtn: {
    paddingHorizontal: Spacing.md, height: 36, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline,
  },
  hojeBtnText: { ...Typography.body, color: c.onSurface, fontSize: 13 },
  novoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, height: 36, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, backgroundColor: c.accent, marginLeft: Spacing.sm,
  },
  novoBtnHover: { opacity: 0.9 },
  novoBtnText: { ...Typography.button, fontSize: 13, color: textoSobre(c.accent) },

  grade: { flexDirection: 'row', gap: Spacing.sm, width: '100%' },
  coluna: {
    flex: 1, minWidth: 0, backgroundColor: c.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.outline, padding: Spacing.sm, minHeight: 420,
  },
  colunaHoje: { backgroundColor: c.accentContainer, borderColor: c.accent + '55' },
  colunaHeader: { alignItems: 'center', marginBottom: Spacing.sm, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: c.outline },
  colunaDiaSemana: { ...Typography.label, color: c.onSurfaceVariant, fontSize: 11 },
  colunaDiaNumero: { ...Typography.h3, color: c.onSurface, marginTop: 2 },
  colunaHojeTexto: { color: c.accentLight },
  colunaScroll: { flex: 1 },
  colunaVazia: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.lg, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: 'transparent' },
  colunaVaziaHover: { backgroundColor: c.surfacePressed, borderColor: c.outline },

  card: {
    backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.sm, borderLeftWidth: 3,
    padding: Spacing.sm, marginBottom: Spacing.xs,
  },
  cardHover: { backgroundColor: c.surfacePressed },
  cardHora: { fontSize: 11, fontWeight: '700', color: c.onSurfaceMuted },
  cardTitulo: { ...Typography.bodySmall, color: c.onSurface, fontSize: 12.5, marginTop: 2 },
  cardCliente: { ...Typography.caption, color: c.onSurfaceVariant, fontSize: 11, marginTop: 1 },
  cardStatus: { fontSize: 10.5, fontWeight: '700', marginTop: 3 },
  strike: { textDecorationLine: 'line-through', color: c.onSurfaceMuted },

  // Scrim do modal: preto translúcido fixo (mesmo padrão em toda a base), não
  // segue o tema — um backdrop de modal fica escuro em claro e escuro.
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  modalCard: {
    width: '100%', maxWidth: 420, backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline, padding: Spacing.lg, ...sombrasDe(c).lg,
  },
  formCard: { maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  tipoChip: { borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  tipoChipText: { fontSize: 11, fontWeight: '800' },
  modalTitulo: { ...Typography.h3, color: c.onSurface },
  modalCliente: { ...Typography.body, color: c.onSurfaceVariant, marginTop: 2, marginBottom: Spacing.md },
  modalLinha: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  modalLinhaTexto: { ...Typography.bodySmall, color: c.onSurfaceVariant, flex: 1 },
  modalStatus: { fontSize: 13, fontWeight: '700', marginTop: Spacing.xs },
  modalAcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  // rgba(52,198,217,...) era o cyan de marca (#34C6D9) fixo — agora acompanha o
  // accent escolhido no tema via comAlfa.
  modalAcaoLink: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: comAlfa(c.accent, 0.10), borderWidth: 1, borderColor: comAlfa(c.accent, 0.30), borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 8 },
  modalAcaoLinkHover: { backgroundColor: comAlfa(c.accent, 0.18) },
  modalAcaoLinkTexto: { fontSize: 12.5, fontWeight: '700', color: c.accentLight },
  modalBotoes: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg },
  modalIconBtn: { width: 40, height: 40, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceVariant, borderWidth: 1, borderColor: c.outline },
  modalIconBtnHover: { backgroundColor: c.surfacePressed },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: c.onSurfaceVariant, marginBottom: Spacing.sm },
  tipoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md },
  tipoOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: BorderRadius.sm, borderWidth: 1.5, borderColor: c.outline, backgroundColor: c.surfaceVariant },
  tipoOptionHover: { backgroundColor: c.surfacePressed },
  tipoOptionText: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant },
  rowFields: { flexDirection: 'row' },
  modalFooterBtns: { marginTop: Spacing.md },
});
