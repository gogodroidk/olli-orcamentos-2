import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Alert, Platform, LayoutAnimation,
  RefreshControl, Animated, KeyboardAvoidingView, Switch, FlatList,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { vibrar } from '../utils/haptico';
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addDays, addWeeks, addMonths, isSameDay, isSameMonth, eachDayOfInterval, isToday,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TimePickerModal, DatePickerModal } from 'react-native-paper-dates';
import { Spacing, BorderRadius, useCores, useGradientes, useEstilos, sombrasDe, textoSobre, corCategoriaEmChip, type Cores } from '../theme';
import { useReducedMotion } from '../theme/motion';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { FieldLabel } from '../components/FieldLabel';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { DicaContextual } from '../components/DicaContextual';
import { OlliPressable } from '../components/OlliPressable';
import { EmptyState } from '../components/EmptyState';
import { GradientHeader } from '../components/GradientHeader';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { ChipsFiltro, ItemChipFiltro } from '../components/web/ChipsFiltro';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAgendamentosExpandidos, getAgendamento, saveAgendamento, deleteAgendamento, encontrarConflitoDeHorario,
  pedirPermissaoNotificacao, temPermissaoNotificacao, MINUTOS_ANTECEDENCIA_LEMBRETE,
} from '../services/agenda';
import { SeletorResponsavel, CamposRecorrencia } from '../components/agenda/CamposEquipeRecorrencia';
import { useEquipeResponsaveis } from '../hooks/useEquipeResponsaveis';
import { usePermissao } from '../hooks/usePermissao';
import { useTipoConta } from '../hooks/useTipoConta';
import {
  aplicarEscopo, agendamentoNoPassado, diaDaOcorrencia, duracaoEstimadaMin, filtrarClientes, horaFimSugerida,
  inicioPadraoNovo, ordenarDoDia, paraHHMM, resolverEscopoAgenda, rotuloDuracao, semHoraMarcada, type EntradaEscopo,
} from '../utils/agendaDominio';
import {
  filtrarPorResponsavel, idBaseDaOcorrencia, rotuloRecorrencia, type FiltroResponsavel, type OcorrenciaAgendamento,
} from '../utils/contratoRecorrente';
import { isoToBR, brToISO } from '../utils/masks';
import { getClientes } from '../database/database';
import {
  Agendamento, Cliente, TipoAgendamento, StatusAgendamento, TIPOS_AGENDAMENTO,
  TIPO_AGENDAMENTO_COLORS, TIPO_AGENDAMENTO_LABELS, STATUS_AGENDAMENTO_LABELS, type RecorrenciaAgendamento,
} from '../types';
import { RootStackParamList, TabParamList } from '../navigation/AppNavigator';
import { generateId } from '../utils/id';
import { nowISO, capitalizeFirst, parseHoraHHMM, formatHoraHHMM } from '../utils/date';
import { onSyncAplicado, syncOnLogin } from '../services/cloudSync';
import { getCurrentUser } from '../services/supabase';
import { DIAS_RETENCAO_LIXEIRA } from '../services/lixeira';
import { confirmar as confirmarNaWeb } from './desktop/dialogo';
import { NOTIF_EXPLICADO_KEY } from '../services/storageKeys';
import {
  googleAgendaDisponivel, estaConectado, conectarGoogleAgenda, desconectarGoogleAgenda,
  pushAgendamento, deleteEventoGoogle,
} from '../services/googleAgenda';
import { abrirRotaGoogleMaps } from '../services/rotas';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type AgendaRoute = RouteProp<TabParamList, 'Agenda'>;
type Modo = 'semana' | 'mes';
// FILTROS (1.6) — client-side, sobre a lista já carregada (ver `itensFiltrados`).
type FiltroTipoAgenda = TipoAgendamento | 'todos';
type FiltroStatusAgenda = StatusAgendamento | 'todos';

/**
 * Pill discreto "Sincronizando..." — some com fade sozinho depois de exibido.
 * Dá feedback visual de que a tela está de fato conectada à nuvem quando o
 * `onSyncAplicado` recarrega os dados em segundo plano.
 */
function SincronizandoPill({ onDone, texto = 'Sincronizando...', icon = 'cloud-sync-outline' }: { onDone: () => void; texto?: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap }) {
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
        name={icon}
        size={13}
        color={cores.accent} // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 2.88:1 (7.25:1)
      />
      <Text style={styles.syncPillText}>{texto}</Text>
    </Animated.View>
  );
}

/**
 * Confirmação de ação destrutiva. No celular, o Alert nativo; no navegador o
 * Alert.alert é no-op (react-native-web), então usa o diálogo do app
 * (DialogoDesktopHost, montado no App). Fechar sem escolher = não.
 */
function pedirConfirmacao(titulo: string, mensagem: string, acao: string): Promise<boolean> {
  if (Platform.OS === 'web') return confirmarNaWeb(titulo, mensagem);
  return new Promise(resolve => {
    Alert.alert(titulo, mensagem, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: acao, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

// Chave para lembrar se já explicamos ao usuário por que pedimos notificação
// (mostra o aviso amigável só na primeira vez que ele salva um agendamento).

// Limites do período visível, conforme o modo.
function rangeFor(modo: Modo, ref: Date): { inicio: Date; fim: Date } {
  if (modo === 'semana') {
    return {
      inicio: startOfWeek(ref, { weekStartsOn: 1 }),
      fim: endOfWeek(ref, { weekStartsOn: 1 }),
    };
  }
  return { inicio: startOfMonth(ref), fim: endOfMonth(ref) };
}

function rotuloPeriodo(modo: Modo, ref: Date): string {
  if (modo === 'semana') {
    const i = startOfWeek(ref, { weekStartsOn: 1 });
    const f = endOfWeek(ref, { weekStartsOn: 1 });
    return `${format(i, "d MMM", { locale: ptBR })} – ${format(f, "d MMM", { locale: ptBR })}`;
  }
  return capitalizeFirst(format(ref, "MMMM 'de' yyyy", { locale: ptBR }));
}

export default function AgendaScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<AgendaRoute>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  // O conteúdo do <GradientHeader> não se pinta com tokens de SUPERFÍCIE: o fundo
  // ali é o gradiente da marca. `sobreHeader` é a cor que atravessa as duas pontas.
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  const reduzirMovimento = useReducedMotion();

  const [modo, setModo] = useState<Modo>('semana');
  const [ref, setRef] = useState<Date>(new Date());
  const [itens, setItens] = useState<OcorrenciaAgendamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  // VISÃO POR TÉCNICO — filtro por responsável (a equipe vem em 3 estados; o
  // filtro só aparece quando ela carregou e existe).
  const equipe = useEquipeResponsaveis();
  const [filtroTecnico, setFiltroTecnico] = useState<FiltroResponsavel>('todos');
  // QUEM VÊ O QUÊ — técnico vê só a própria agenda (matriz em usePermissao).
  // Enquanto o papel não é conhecido, a lista não aparece (nem vazia, nem a da
  // equipe inteira); se a leitura falhar, a tela diz isso e deixa tentar de novo.
  const { pode } = usePermissao();
  const tipoConta = useTipoConta();
  const [usuario, setUsuario] = useState<EntradaEscopo['usuario']>({ status: 'carregando' });
  const lerUsuario = useCallback(() => {
    setUsuario({ status: 'carregando' });
    getCurrentUser()
      .then(u => setUsuario({ status: 'ok', id: u?.id ?? null }))
      .catch(() => setUsuario({ status: 'ok', id: null }));
  }, []);
  useEffect(() => { lerUsuario(); }, [lerUsuario]);
  const escopo = useMemo(() => resolverEscopoAgenda({
    papelResolvido: tipoConta.resolvido,
    papelCarregando: tipoConta.carregando,
    podeVerEquipe: pode('ver_agenda_equipe'),
    usuario,
  }), [tipoConta.resolvido, tipoConta.carregando, pode, usuario]);
  const podeVerEquipe = escopo.status === 'equipe';
  const itensVisiveis = useMemo(() => aplicarEscopo(itens, escopo), [itens, escopo]);
  // "Ir para a data" (DatePickerModal) — antes só dava para andar semana a semana.
  const [irParaData, setIrParaData] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  // Voltar do Android dentro do formulário: se a busca de cliente (camada por
  // cima do form) estiver aberta, fecha só ela. Sem isto o voltar descartava o
  // formulário inteiro, sem aviso, quando a pessoa só queria sair da busca.
  const voltarDoForm = useRef<(() => boolean) | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  // 3 estados explícitos (nunca colapsar erro em vazio): `carregandoErro` só
  // vira `true` se o load() de fato falhar — sem isso o período aparecia como
  // "Nenhuma visita agendada" mesmo quando a leitura tinha caído.
  const [carregandoErro, setCarregandoErro] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [googleSyncPill, setGoogleSyncPill] = useState(false);
  const [googleConectado, setGoogleConectado] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipoAgenda>('todos');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatusAgenda>('todos');
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleDisponivel = googleAgendaDisponivel();

  const { inicio, fim } = useMemo(() => rangeFor(modo, ref), [modo, ref]);

  const load = useCallback(async () => {
    setCarregandoErro(false);
    try {
      const [data, cls] = await Promise.all([
        // Inclui as ocorrências das séries recorrentes que caem no período.
        getAgendamentosExpandidos(inicio.toISOString(), endOfDay(fim).toISOString()),
        getClientes(),
      ]);
      setItens(data);
      setClientes(cls);
    } catch {
      // erro de verdade (leitura falhou) — NUNCA vira "Nenhuma visita agendada" silencioso.
      setCarregandoErro(true);
    } finally {
      setCarregando(false);
    }
  }, [inicio.getTime(), fim.getTime()]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Recarrega quando um sync com a nuvem terminar (ex.: login recém-feito
  // trazendo agendamentos que ainda não existiam localmente).
  useEffect(() => onSyncAplicado(() => { setSincronizando(true); load(); }), [load]);

  // Estado da conexão com o Google Agenda (só relevante quando o recurso
  // está disponível — client id configurado). Código inerte quando não está.
  useEffect(() => {
    if (!googleDisponivel) return;
    estaConectado().then(setGoogleConectado).catch(() => {});
  }, [googleDisponivel]);

  async function alternarGoogleAgenda(ligar: boolean) {
    setGoogleBusy(true);
    try {
      if (ligar) {
        const ok = await conectarGoogleAgenda();
        setGoogleConectado(ok);
        if (!ok) Alert.alert('Não conectou', 'Não foi possível conectar ao Google Agenda agora. Tente de novo.');
      } else {
        await desconectarGoogleAgenda();
        setGoogleConectado(false);
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar a conexão com o Google Agenda agora.');
    } finally {
      setGoogleBusy(false);
    }
  }

  /** Espelha o agendamento salvo no Google Agenda, silenciosamente (best-effort). */
  async function sincronizarComGoogle(a: Agendamento) {
    if (!googleDisponivel || !googleConectado) return;
    try {
      // Só mostra "Sincronizado com Google Agenda" quando o push REALMENTE
      // deu certo (pushAgendamento retorna false em offline/token expirado) —
      // senão seria um falso positivo.
      const ok = await pushAgendamento(a);
      if (ok) setGoogleSyncPill(true);
    } catch {
      // silencioso: sincronização com o Google nunca deve incomodar o usuário
    }
  }

  // Puxar para atualizar busca da NUVEM (antes só relia o SQLite local, e a visita
  // recém-atribuída ao técnico não descia). `syncOnLogin` já tem trava de
  // reentrada e nunca lança; o teto de 15 s só solta o indicador numa rede ruim
  // (o sync segue e, ao terminar, o onSyncAplicado recarrega a tela sozinho).
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.race([
        syncOnLogin().catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 15_000)),
      ]);
    } finally {
      await load();
      setRefreshing(false);
    }
  }, [load]);
  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[cores.accentLight]} tintColor={cores.accentLight} />
  );

  // FILTROS (1.6) — chips de tipo/status com contagem, client-side sobre `itens`
  // (a lista já carregada do período; nenhuma query nova). "Todos" sempre é a
  // contagem total do período, independente do OUTRO filtro estar ativo.
  const chipsTipo: ItemChipFiltro<FiltroTipoAgenda>[] = useMemo(() => [
    { chave: 'todos', rotulo: 'Todos', contagem: itensVisiveis.length },
    ...TIPOS_AGENDAMENTO.map(t => ({
      chave: t.id as FiltroTipoAgenda,
      rotulo: t.label,
      cor: t.color,
      contagem: itensVisiveis.filter(a => a.tipo === t.id).length,
    })),
  ], [itensVisiveis]);

  const chipsStatus: ItemChipFiltro<FiltroStatusAgenda>[] = useMemo(() => [
    { chave: 'todos', rotulo: 'Todos', contagem: itensVisiveis.length },
    { chave: 'agendado', rotulo: STATUS_AGENDAMENTO_LABELS.agendado, cor: cores.accent, contagem: itensVisiveis.filter(a => a.status === 'agendado').length },
    { chave: 'concluido', rotulo: STATUS_AGENDAMENTO_LABELS.concluido, cor: cores.success, contagem: itensVisiveis.filter(a => a.status === 'concluido').length },
    { chave: 'cancelado', rotulo: STATUS_AGENDAMENTO_LABELS.cancelado, cor: cores.danger, contagem: itensVisiveis.filter(a => a.status === 'cancelado').length },
  ], [itensVisiveis, cores]);

  const chipsTecnico: ItemChipFiltro<FiltroResponsavel>[] = useMemo(() => {
    // Técnico não escolhe de quem ver: a lista dele já é só a dele.
    if (!podeVerEquipe || equipe.estado.status !== 'ok' || equipe.estado.semEquipe) return [];
    return [
      { chave: 'todos', rotulo: 'Toda a equipe', contagem: itens.length },
      { chave: 'sem', rotulo: 'Sem responsável', contagem: filtrarPorResponsavel(itens, 'sem').length },
      ...equipe.estado.membros.map(m => ({
        chave: m.userId,
        rotulo: m.nome,
        contagem: filtrarPorResponsavel(itens, m.userId).length,
      })),
    ];
  }, [itens, equipe.estado, podeVerEquipe]);

  const itensFiltrados = useMemo(() => filtrarPorResponsavel(itensVisiveis, podeVerEquipe ? filtroTecnico : 'todos').filter(a =>
    (filtroTipo === 'todos' || a.tipo === filtroTipo) &&
    (filtroStatus === 'todos' || a.status === filtroStatus)
  ), [itensVisiveis, podeVerEquipe, filtroTipo, filtroStatus, filtroTecnico]);

  const diasSemana = useMemo(() => eachDayOfInterval({
    start: startOfWeek(ref, { weekStartsOn: 1 }),
    end: endOfWeek(ref, { weekStartsOn: 1 }),
  }), [ref]);

  // Grade mensal completa (sempre de segunda a domingo). Dias vizinhos ficam
  // visíveis com menor ênfase para a navegação continuar previsível.
  const diasMes = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(ref), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(ref), { weekStartsOn: 1 }),
  }), [ref]);

  const contagemPorDia = useMemo(() => {
    const mapa = new Map<string, number>();
    itensFiltrados.forEach(a => {
      const data = new Date(a.inicio);
      if (isNaN(data.getTime())) return;
      const chave = format(data, 'yyyy-MM-dd');
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
    });
    return mapa;
  }, [itensFiltrados]);

  // "Dia todo" (sem hora marcada) vem no topo do dia, depois pela hora.
  const itensDoDiaSemFiltro = useMemo(() => ordenarDoDia(itensVisiveis
    .filter(a => isSameDay(new Date(a.inicio), ref))), [itensVisiveis, ref]);

  const itensDoDia = useMemo(() => ordenarDoDia(itensFiltrados
    .filter(a => isSameDay(new Date(a.inicio), ref))), [itensFiltrados, ref]);

  function passo(delta: number) {
    vibrar('selecao');
    if (Platform.OS !== 'web' && !reduzirMovimento) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRef(prev => modo === 'semana' ? addWeeks(prev, delta) : addMonths(prev, delta));
  }

  function alternarVisao() {
    vibrar('selecao');
    if (Platform.OS !== 'web' && !reduzirMovimento) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setModo(prev => prev === 'semana' ? 'mes' : 'semana');
  }

  function selecionarDia(dia: Date, voltarParaSemana = false) {
    vibrar('selecao');
    if (Platform.OS !== 'web' && !reduzirMovimento) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRef(dia);
    if (voltarParaSemana) setModo('semana');
  }

  function abrirNovo(prefill?: Partial<EditState>) {
    vibrar('leve');
    // Hoje: próximo meio-hora (às 15h o padrão era 09:00, um horário já passado e
    // sem lembrete). Outro dia: 09:00. O fim já vem com a duração do tipo.
    const inicioPadrao = inicioPadraoNovo(ref, new Date());
    const tipo = prefill?.tipo ?? 'visita';
    // Técnico só agenda para si: o seletor de responsável não aparece para ele, e
    // uma visita sem responsável sumiria da agenda dele logo depois de salvar.
    const meu = escopo.status === 'propria' ? escopo.userId : undefined;
    const meuNome = meu && equipe.estado.status === 'ok'
      ? equipe.estado.membros.find(m => m.userId === meu)?.nome
      : undefined;
    setEditing({
      id: undefined,
      clienteId: undefined,
      clienteNome: '',
      titulo: '',
      tipo,
      data: inicioPadrao,
      horaInicio: paraHHMM(inicioPadrao),
      horaFim: horaFimSugerida(inicioPadrao, tipo),
      fimAutomatico: true,
      endereco: '',
      observacao: '',
      recorrenciaAteBR: '',
      responsavelId: meu,
      responsavelNome: meuNome,
      ...prefill,
    });
  }

  // Abertura via params (CRM): "agendar visita" a partir de cliente/orçamento.
  // Consome os params UMA vez (limpa depois) para não reabrir o form ao voltar.
  useFocusEffect(useCallback(() => {
    const p = route.params;
    // "Agendar" de 1 toque do Início: abre o formulário em branco.
    if (p?.novo && !p.novoParaClienteId && !p.novoParaOrcamentoId && !p.novoParaClienteNome) {
      abrirNovo();
      nav.setParams({ novo: undefined } as any);
      return;
    }
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
        novo: undefined,
        novoParaClienteId: undefined,
        novoParaClienteNome: undefined,
        novoParaOrcamentoId: undefined,
        novoEndereco: undefined,
        novoTitulo: undefined,
      } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params]));

  // Toque na notificação "Visita em 1h": o App navega com
  // ('Tabs', { screen: 'Agenda', params: { abrirAgendamentoId } }). Foca o dia e
  // abre o compromisso. O id fica pendente até o escopo resolver: no app frio o
  // papel ainda está em leitura, e técnico só abre o que é dele.
  const [abrirPendente, setAbrirPendente] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: só reage ao id novo da notificação (nav é estável).
  useFocusEffect(useCallback(() => {
    const id = route.params?.abrirAgendamentoId;
    if (!id) return;
    setAbrirPendente(id);
    nav.setParams({ abrirAgendamentoId: undefined } as any);
  }, [route.params?.abrirAgendamentoId]));

  // biome-ignore lint/correctness/useExhaustiveDependencies: abrirEdicao é função local recriada a cada render; o disparo é o id pendente + escopo.
  useEffect(() => {
    if (!abrirPendente || escopo.status === 'carregando') return;
    const id = abrirPendente;
    setAbrirPendente(null);
    // Sem papel confirmado a tela já mostra o erro de acesso; não abre nada.
    if (escopo.status === 'erro') return;
    void (async () => {
      try {
        const a = await getAgendamento(idBaseDaOcorrencia(id));
        if (!a || a.excluidoEm) {
          Alert.alert('Compromisso não encontrado', 'Ele pode ter sido excluído ou ainda não chegou neste aparelho. Puxe a lista para baixo para atualizar.');
          return;
        }
        const dia = diaDaOcorrencia(id) ?? new Date(a.inicio);
        if (!isNaN(dia.getTime())) { setModo('semana'); setRef(dia); }
        if (escopo.status === 'propria' && a.responsavelId !== escopo.userId) {
          Alert.alert('Compromisso de outro técnico', 'Este compromisso está com outra pessoa da equipe. Fale com a gestão se ele for seu.');
          return;
        }
        abrirEdicao(a);
      } catch {
        Alert.alert('Erro', 'Não foi possível abrir este compromisso agora.');
      }
    })();
  }, [abrirPendente, escopo]);

  // Para campos do form: 'HH:mm' válido, ou '' (vazio) quando inválido/ausente.
  function hhmmRaw(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : format(d, 'HH:mm');
  }

  // Ocorrência projetada de uma série: edita a BASE (a série inteira). Se a base
  // não puder ser lida, avisa em vez de abrir um formulário com dado de outro dia.
  async function abrirItem(a: OcorrenciaAgendamento) {
    if (!a.ocorrenciaDe) { abrirEdicao(a); return; }
    try {
      const base = await getAgendamento(idBaseDaOcorrencia(a.id));
      if (base) abrirEdicao(base);
      else Alert.alert('Não encontrado', 'Não achei o compromisso original desta repetição.');
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir este compromisso agora.');
    }
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
      // "Dia todo" (meia-noite e sem fim, a marca do painel) abre sem hora, e não
      // como "00:00" — salvar sem mexer mantém o compromisso sem hora.
      horaInicio: semHoraMarcada(a) ? '' : format(ini, 'HH:mm'),
      horaFim: hhmmRaw(a.fim),
      fimAutomatico: false,
      endereco: a.endereco ?? '',
      observacao: a.observacao ?? '',
      status: a.status,
      orcamentoId: a.orcamentoId,
      criadoEm: a.criadoEm,
      responsavelId: a.responsavelId,
      responsavelNome: a.responsavelNome,
      recorrencia: a.recorrencia,
      recorrenciaAteBR: a.recorrenciaAte ? isoToBR(a.recorrenciaAte) : '',
      contratoId: a.contratoId,
      excecoes: a.excecoes,
      ordemServicoId: a.ordemServicoId,
    });
  }

  // Pede permissão de notificação com uma explicação amigável ANTES do prompt
  // do sistema, e só na primeira vez (respeita a decisão do usuário depois).
  async function garantirPermissaoNotificacaoComAviso() {
    // Na web não existe notificação push do app nem Alert.alert nativo (é no-op
    // no react-native-web) — sem isso, a Promise abaixo nunca resolveria e o
    // salvamento do agendamento travaria para sempre. Não há nada a pedir aqui.
    if (Platform.OS === 'web') return;
    try {
      if (await temPermissaoNotificacao()) return;
      const jaExplicou = await AsyncStorage.getItem(NOTIF_EXPLICADO_KEY);
      if (jaExplicou) {
        // Já mostramos o aviso antes; não insiste toda vez que o usuário negou.
        return;
      }
      const quer = await new Promise<boolean>(resolve => {
        Alert.alert(
          'Ativar lembretes de visita?',
          `Para te avisar ${MINUTOS_ANTECEDENCIA_LEMBRETE / 60}h antes de cada compromisso, mesmo com o app fechado, a OLLI precisa da sua permissão para enviar notificações.`,
          [
            { text: 'Agora não', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Ativar', onPress: () => resolve(true) },
          ],
        );
      });
      // A flag só é gravada DEPOIS da resposta: se o app morrer no meio do
      // Alert, o aviso volta a aparecer na próxima vez em vez de sumir para sempre.
      await AsyncStorage.setItem(NOTIF_EXPLICADO_KEY, '1');
      // Só chama o prompt do sistema se o usuário realmente pediu para ativar —
      // "Agora não" precisa respeitar a escolha, sem disparar o prompt do SO.
      if (quer) await pedirPermissaoNotificacao();
    } catch {
      // Falha ao pedir permissão nunca deve impedir salvar o agendamento.
    }
  }

  async function salvar(e: EditState) {
    if (!e.horaInicio && e.horaFim) {
      Alert.alert('Falta o início', 'Escolha o horário de início, ou tire o horário de fim para o compromisso ficar como "Dia todo".');
      return;
    }
    const ini = combinarDataHora(e.data, e.horaInicio);
    const fimDt = e.horaFim ? combinarDataHora(e.data, e.horaFim) : undefined;
    // Valida só quando ambos os horários existem: o fim precisa ser depois do início.
    if (fimDt && fimDt <= ini) {
      Alert.alert('Horário inválido', 'O horário de fim deve ser depois do horário de início.');
      return;
    }
    const recorrenciaAte = e.recorrencia && e.recorrenciaAteBR.trim() ? brToISO(e.recorrenciaAteBR) : '';
    if (e.recorrencia && e.recorrenciaAteBR.trim() && !recorrenciaAte) {
      Alert.alert('Data inválida', 'Confira a data de "Repetir até" (dd/mm/aaaa) ou deixe em branco.');
      return;
    }
    // Técnico: o compromisso é sempre dele (sem seletor na tela). Sem isto, um
    // agendamento aberto antes do papel carregar sairia sem responsável e sumiria.
    const responsavelId = e.responsavelId ?? (escopo.status === 'propria' ? escopo.userId : undefined);
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
      responsavelId,
      responsavelNome: responsavelId ? e.responsavelNome : undefined,
      recorrencia: e.contratoId ? undefined : e.recorrencia,
      recorrenciaAte: !e.contratoId && e.recorrencia && recorrenciaAte ? recorrenciaAte : undefined,
      contratoId: e.contratoId,
      // Preservados da linha aberta (o formulário não os mostra). Exceção só vale em
      // série: tirar a repetição as descarta (o save grava nulo sem `recorrencia`).
      excecoes: e.excecoes,
      ordemServicoId: e.ordemServicoId,
    };
    setSalvando(true);
    try {
      await garantirPermissaoNotificacaoComAviso();
      await saveAgendamento(a);
      vibrar('sucesso');
      setEditing(null);
      // foca o período no dia do agendamento salvo
      setRef(e.data);
      await load();
      // Espelha no Google Agenda em segundo plano (silencioso; nunca bloqueia o salvamento).
      void sincronizarComGoogle(a);
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar o agendamento agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(e: EditState) {
    if (!e.id) return;
    const id = e.id;
    const nome = e.titulo.trim() || TIPO_AGENDAMENTO_LABELS[e.tipo];
    const serie = !!e.recorrencia;
    // Um toque apagava (inclusive a série inteira). Agora pergunta e diz para onde vai.
    const ok = await pedirConfirmacao(
      serie ? 'Excluir a série inteira?' : 'Excluir agendamento?',
      `${serie ? `"${nome}" e todas as repetições vão` : `"${nome}" vai`} para a Lixeira. Dá para restaurar por ${DIAS_RETENCAO_LIXEIRA} dias.`,
      'Excluir',
    );
    if (!ok) return;
    const alvo = itens.find(it => it.id === id);
    setSalvando(true);
    try {
      await deleteAgendamento(id);
      vibrar('aviso');
      setEditing(null);
      await load();
      // Remove o espelho no Google Agenda em segundo plano (silencioso).
      if (alvo && googleDisponivel && googleConectado) void deleteEventoGoogle(alvo).catch(() => {});
    } catch {
      Alert.alert('Erro', 'Não foi possível excluir o agendamento agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  // Dois estados de "vazio" distintos: dia sem NENHUM agendamento (mostra o
  // CTA "Agendar visita") vs. dia com itens mas o FILTRO escondeu todos
  // (mostra um jeito de limpar o filtro, não repete o CTA de criar).
  const semAgendamentosNoPeriodo = itensVisiveis.length === 0;
  const semAgendamentosNoDia = itensDoDiaSemFiltro.length === 0;
  const semResultadoDoFiltro = !semAgendamentosNoDia && itensDoDia.length === 0;

  // Identidade do período visível. Muda ao navegar (‹ ›) ou trocar de modo;
  // usada como parte da key dos itens para re-disparar a entrada animada,
  // sinalizando a troca de contexto sem re-renderizar a cada frame.
  const periodoKey = `${modo}:${inicio.getTime()}:${startOfDay(ref).getTime()}`;

  return (
    <View style={styles.container}>
      {/* No máximo uma pill por vez (mesmo estilo absoluto, senão se sobrepõem):
          a de sincronização da nuvem tem prioridade sobre a do Google. */}
      {sincronizando ? (
        <SincronizandoPill onDone={() => setSincronizando(false)} />
      ) : googleSyncPill ? (
        <SincronizandoPill
          texto="Sincronizado com Google Agenda"
          icon="google"
          onDone={() => setGoogleSyncPill(false)}
        />
      ) : null}
      {/* HEADER — mesmo GradientHeader compartilhado das telas irmãs (Clientes/Produtos/Orçamentos) */}
      <GradientHeader
        title="Agenda"
        subtitle={`${itensDoDia.length} compromisso${itensDoDia.length === 1 ? '' : 's'}${escopo.status === 'propria' ? (itensDoDia.length === 1 ? ' seu' : ' seus') : ''} em ${format(ref, "d 'de' MMM", { locale: ptBR })}`}
        right={
          <TouchableOpacity style={styles.todayBtn} onPress={() => { vibrar('selecao'); setRef(new Date()); setModo('semana'); }} activeOpacity={0.85}>
            <Text style={[styles.todayBtnText, { color: gradientes.sobreHeader }]}>Hoje</Text>
          </TouchableOpacity>
        }
      >
        {/* NAV ‹ período › — está DENTRO do GradientHeader, então a cor vem do
            gradiente, não da superfície. `accentLight` media 1.03:1 contra a marca
            no modo claro (o glifo sumia); `sobreHeader` dá 5.02:1 e 15.32:1 nas
            duas pontas, e acompanha uma marca clara trocando para tinta escura. */}
        <View style={styles.navRow}>
          <TouchableOpacity style={styles.navBtn} onPress={() => passo(-1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel="Período anterior">
            <MaterialCommunityIcons name="chevron-left" size={24} color={gradientes.sobreHeader} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navLabelBtn}
            onPress={() => { vibrar('selecao'); setIrParaData(true); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${rotuloPeriodo(modo, ref)}. Escolher outra data`}
          >
            <Text style={[styles.navLabel, { color: gradientes.sobreHeader }]}>{rotuloPeriodo(modo, ref)}</Text>
            <MaterialCommunityIcons name="calendar-search" size={16} color={gradientes.sobreHeader} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => passo(1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel="Próximo período">
            <MaterialCommunityIcons name="chevron-right" size={24} color={gradientes.sobreHeader} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.viewToggle}
          onPress={alternarVisao}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={modo === 'semana' ? 'Abrir calendário mensal' : 'Voltar para a semana'}
        >
          <MaterialCommunityIcons
            name={modo === 'semana' ? 'calendar-month-outline' : 'calendar-week-outline'}
            size={18}
            color={gradientes.sobreHeader}
          />
          <Text style={[styles.viewToggleText, { color: gradientes.sobreHeader }]}>
            {modo === 'semana' ? 'Abrir calendário do mês' : 'Voltar para a semana'}
          </Text>
        </TouchableOpacity>
      </GradientHeader>

      {/* SELETOR DE DATA — a semana é a navegação principal; o calendário mensal
          é uma visão opcional. Tocar em um dia do mês volta para sua semana. */}
      <View style={styles.calendarCard}>
        {modo === 'semana' ? (
          <View style={styles.weekStrip}>
            {diasSemana.map(dia => {
              const selecionado = isSameDay(dia, ref);
              const quantidade = contagemPorDia.get(format(dia, 'yyyy-MM-dd')) ?? 0;
              return (
                <TouchableOpacity
                  key={dia.toISOString()}
                  style={[styles.weekDay, selecionado && styles.weekDaySelected]}
                  onPress={() => selecionarDia(dia)}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selecionado }}
                  accessibilityLabel={`${format(dia, "EEEE, d 'de' MMMM", { locale: ptBR })}${quantidade ? `, ${quantidade} compromisso${quantidade === 1 ? '' : 's'}` : ', sem compromissos'}`}
                >
                  <Text style={[styles.weekDayName, selecionado && styles.weekDayTextSelected]}>
                    {format(dia, 'EEEEE', { locale: ptBR }).toUpperCase()}
                  </Text>
                  <Text style={[styles.weekDayNumber, isToday(dia) && styles.weekDayToday, selecionado && styles.weekDayTextSelected]}>
                    {format(dia, 'd')}
                  </Text>
                  <View style={styles.dayMarkers}>
                    {quantidade > 0 && (
                      <View style={[styles.dayMarker, selecionado && styles.dayMarkerSelected]} />
                    )}
                    {quantidade > 1 && (
                      <Text style={[styles.dayCount, selecionado && styles.weekDayTextSelected]}>{quantidade}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View>
            <View style={styles.monthWeekNames}>
              {['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].map(nome => (
                <Text key={nome} style={styles.monthWeekName}>{nome}</Text>
              ))}
            </View>
            <View style={styles.monthGrid}>
              {diasMes.map(dia => {
                const selecionado = isSameDay(dia, ref);
                const dentroDoMes = isSameMonth(dia, ref);
                const quantidade = contagemPorDia.get(format(dia, 'yyyy-MM-dd')) ?? 0;
                return (
                  <View key={dia.toISOString()} style={styles.monthDayCell}>
                    <TouchableOpacity
                      style={[styles.monthDay, selecionado && styles.monthDaySelected]}
                      onPress={() => selecionarDia(dia, true)}
                      activeOpacity={0.82}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selecionado }}
                      accessibilityLabel={`${format(dia, "EEEE, d 'de' MMMM", { locale: ptBR })}${quantidade ? `, ${quantidade} compromisso${quantidade === 1 ? '' : 's'}` : ', sem compromissos'}`}
                    >
                      <Text style={[
                        styles.monthDayText,
                        !dentroDoMes && styles.monthDayOutside,
                        isToday(dia) && styles.monthDayToday,
                        selecionado && styles.monthDayTextSelected,
                      ]}>
                        {format(dia, 'd')}
                      </Text>
                      {quantidade > 0 && <View style={[styles.monthMarker, selecionado && styles.dayMarkerSelected]} />}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* GOOGLE AGENDA — some por completo quando o recurso está desligado
          (client id não configurado); ver services/googleAgenda.ts */}
      {googleDisponivel && (
        <View style={styles.googleCard}>
          <View style={styles.googleCardRow}>
            <MaterialCommunityIcons name="google" size={20} color={cores.accentLight} />
            <View style={{ flex: 1, marginLeft: 10, marginRight: 10 }}>
              <Text style={styles.googleCardTitle}>Conectar Google Agenda</Text>
              <Text style={styles.googleCardHint}>Seus agendamentos também no calendário do celular</Text>
            </View>
            <Switch
              value={googleConectado}
              onValueChange={alternarGoogleAgenda}
              disabled={googleBusy}
              trackColor={{ false: cores.outline, true: cores.primary + '80' }}
              thumbColor={googleConectado ? cores.primary : '#fff'}
            />
          </View>
          <Text style={styles.googleCardFooter}>
            Os lembretes locais do OLLI já avisam {MINUTOS_ANTECEDENCIA_LEMBRETE / 60}h antes mesmo sem Google
          </Text>
        </View>
      )}

      {/* DICA (1º uso) — como criar um compromisso e escolher a data. */}
      {/* Sem padding vertical: ver ClientesScreen (wrapper vazio deixaria vao). */}
      <View style={{ paddingHorizontal: Spacing.base }}>
        <DicaContextual
          id="agenda.criar"
          icon="calendar-plus"
          texto="Escolha um dia na semana e toque em Agendar visita. Para procurar outra data, abra o calendário do mês."
        />
      </View>

      {/* FILTROS (1.6) — tipo/status, client-side sobre a lista já carregada.
          Só aparece quando há algo pra filtrar (período com agendamentos). */}
      {!carregando && !carregandoErro && !semAgendamentosNoPeriodo && (
        <View style={{ paddingHorizontal: Spacing.base }}>
          {chipsTecnico.length > 0 && (
            <ChipsFiltro<FiltroResponsavel> itens={chipsTecnico} selecionado={filtroTecnico} aoSelecionar={setFiltroTecnico} />
          )}
          <ChipsFiltro<FiltroTipoAgenda> itens={chipsTipo} selecionado={filtroTipo} aoSelecionar={setFiltroTipo} />
          <ChipsFiltro<FiltroStatusAgenda> itens={chipsStatus} selecionado={filtroStatus} aoSelecionar={setFiltroStatus} />
        </View>
      )}

      {/* LISTA */}
      {carregando || escopo.status === 'carregando' ? (
        <View style={{ padding: Spacing.base, gap: 10 }}>
          {[0, 1, 2].map(i => (
            // Entrada escalonada também no loading: os placeholders surgem no
            // mesmo ritmo dos itens reais, então a troca skeleton→conteúdo não
            // "pisca". marginBottom:0 porque o gap do container já espaça.
            <AnimatedEntrance key={i} index={i} from="scale">
              <View style={[styles.item, { marginBottom: 0 }]}>
                <OlliSkeleton width={4} height={40} radius={4} style={{ marginRight: 12 }} />
                <OlliSkeleton width={48} height={30} radius={8} />
                <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                  <OlliSkeleton width="60%" height={14} />
                  <OlliSkeleton width="40%" height={12} />
                </View>
              </View>
            </AnimatedEntrance>
          ))}
        </View>
      ) : escopo.status === 'erro' ? (
        // Não sei o papel: nem "agenda vazia" (o técnico acharia que não tem
        // visita) nem a agenda da equipe inteira (não sei se ele pode ver).
        // Puxar para atualizar aqui também relê o papel (senão só sincronizaria e
        // a tela continuaria presa neste aviso).
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { void tipoConta.recarregar(); lerUsuario(); void refresh(); }}
              colors={[cores.accentLight]}
              tintColor={cores.accentLight}
            />
          )}
        >
          <EmptyState
            icon="account-lock-outline"
            title="Não deu para confirmar seu acesso"
            subtitle="Sem saber se você é da gestão ou técnico, a agenda pode mostrar visitas erradas. Verifique a conexão e tente de novo."
            actionLabel="Tentar de novo"
            onAction={() => { void tipoConta.recarregar(); lerUsuario(); }}
          />
        </ScrollView>
      ) : carregandoErro ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
          <EmptyState
            icon="alert-circle-outline"
            title="Não deu para carregar"
            subtitle="Não conseguimos buscar seus agendamentos agora. Verifique a conexão e tente de novo."
            actionLabel="Tentar de novo"
            onAction={() => { void refresh(); }}
          />
        </ScrollView>
      ) : semAgendamentosNoDia ? (
        // Também com "puxar para atualizar": é aqui que o técnico espera a visita
        // recém-atribuída aparecer.
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
          <EmptyState
            icon="calendar-blank-outline"
            title="Este dia está livre"
            subtitle={`Não há compromissos em ${format(ref, "d 'de' MMMM", { locale: ptBR })}. Você pode agendar uma visita agora.`}
            actionLabel="Agendar visita"
            onAction={() => abrirNovo()}
          />
        </ScrollView>
      ) : semResultadoDoFiltro ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
          <EmptyState
            icon="filter-remove-outline"
            title="Nada com esse filtro"
            subtitle="Ajuste os filtros acima para ver os compromissos deste dia."
            actionLabel="Limpar filtros"
            onAction={() => { setFiltroTipo('todos'); setFiltroStatus('todos'); setFiltroTecnico('todos'); }}
          />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 110 }}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          <AnimatedEntrance index={0}>
            <View style={styles.dayHeader}>
              <Text style={[styles.dayHeaderTitle, isToday(ref) && { color: cores.accentLight }]}>
                {capitalizeFirst(format(ref, "EEEE, d 'de' MMMM", { locale: ptBR }))}
              </Text>
              {isToday(ref) && <View style={styles.todayDot} />}
            </View>
          </AnimatedEntrance>
          {itensDoDia.map((a, index) => (
            // key inclui o dia selecionado: ao tocar na semana, a lista remonta e
            // a transição deixa clara a mudança de contexto sem movimento excessivo.
            <AnimatedEntrance key={`${periodoKey}:${a.id}`} index={index + 1}>
              <AgendaItem item={a} onPress={() => { void abrirItem(a); }} />
            </AnimatedEntrance>
          ))}
        </ScrollView>
      )}

      {/* FAB Agendar visita — oculto quando o período está vazio ou em erro: o
          EmptyState já mostra o CTA (ou "Tentar de novo") no centro, e os dois
          juntos ficam redundantes/incoerentes. */}
      {itensDoDia.length > 0 && !carregandoErro && (
      // haptic={false}: abrirNovo() já dispara um impactAsync(Light) próprio —
      // deixar o OlliPressable vibrar de novo daria feedback dobrado.
      <OlliPressable style={[styles.fab, { bottom: insets.bottom + 20 }]} onPress={() => abrirNovo()} haptic={false} accessibilityLabel="Agendar visita">
        <MaterialCommunityIcons name="calendar-plus" size={20} color={textoSobre(cores.accentLight)} />
        <Text style={styles.fabText}>Agendar visita</Text>
      </OlliPressable>
      )}

      {/* FORM MODAL */}
      <Modal visible={!!editing} animationType="slide" onRequestClose={() => { if (voltarDoForm.current?.()) return; setEditing(null); }} transparent={false}>
        {editing && (
          <AgendamentoForm
            state={editing}
            clientes={clientes}
            // Conflito só contra o que esta pessoa vê, e sem os "Dia todo" (não
            // ocupam horário: a meia-noite deles não é uma visita às 00:00).
            itens={itensVisiveis.filter(a => !semHoraMarcada(a))}
            podeEscolherResponsavel={podeVerEquipe}
            equipe={equipe}
            salvando={salvando}
            onChange={setEditing}
            voltarRef={voltarDoForm}
            onClose={() => setEditing(null)}
            onSave={salvar}
            onDelete={editing.id ? () => { void remover(editing); } : undefined}
            onAbrirOrcamento={editing.orcamentoId ? () => { const id = editing.orcamentoId!; setEditing(null); nav.navigate('VisualizarOrcamento', { orcamentoId: id }); } : undefined}
            onVerCliente={editing.clienteId ? () => { const c = { id: editing.clienteId!, nome: editing.clienteNome }; setEditing(null); nav.navigate('Orcamentos', { clienteId: c.id, clienteNome: c.nome }); } : undefined}
          />
        )}
      </Modal>

      <DatePickerModal
        locale="pt-BR"
        mode="single"
        visible={irParaData}
        date={ref}
        startWeekOnMonday
        label="Ir para a data"
        saveLabel="Ir"
        onDismiss={() => setIrParaData(false)}
        onConfirm={({ date }) => {
          setIrParaData(false);
          if (date) selecionarDia(date, true);
        }}
      />
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
function AgendaItem({ item, onPress }: { item: OcorrenciaAgendamento; onPress: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  // O matiz identifica o tipo; a luminosidade cede contra o fundo REAL do chip
  // (o próprio matiz a 13% sobre a superfície). Cru, media 1.72–4.19:1 no claro.
  const cor = corCategoriaEmChip(TIPO_AGENDAMENTO_COLORS[item.tipo], cores.surface);
  const corChip = TIPO_AGENDAMENTO_COLORS[item.tipo];
  const iniTxt = hhmm(item.inicio);
  const fimTxt = item.fim ? hhmm(item.fim) : '';
  const cancelado = item.status === 'cancelado';
  // Sem hora marcada (o painel grava meia-noite e sem fim): "Dia todo", não "00:00".
  const diaTodo = semHoraMarcada(item);
  return (
    <OlliPressable style={styles.item} onPress={onPress} haptic="selection" accessibilityLabel={`Agendamento ${item.titulo}, ${diaTodo ? 'dia todo' : `às ${iniTxt}`}`}>
      <View style={[styles.itemBar, { backgroundColor: cor }]} />
      <View style={styles.itemTime}>
        {diaTodo ? (
          <Text style={styles.itemDiaTodo}>Dia todo</Text>
        ) : (
          <>
            <Text style={styles.itemHour}>{iniTxt}</Text>
            <Text style={styles.itemHourEnd}>{fimTxt}</Text>
          </>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemTitle, cancelado && styles.strike]} numberOfLines={1}>{item.titulo}</Text>
        <Text style={styles.itemClient} numberOfLines={1}>{item.clienteNome}</Text>
        <View style={styles.itemMetaRow}>
          <View style={[styles.tipoChip, { backgroundColor: corChip + '22', borderColor: corChip + '55' }]}>
            <Text style={[styles.tipoChipText, { color: cor }]}>{TIPO_AGENDAMENTO_LABELS[item.tipo]}</Text>
          </View>
          {item.endereco ? (
            <View style={styles.addrRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={13} color={cores.onSurfaceMuted} />
              <Text style={styles.addrText} numberOfLines={1}>{item.endereco}</Text>
            </View>
          ) : null}
        </View>
        {(item.responsavelNome || item.recorrencia || item.contratoId) ? (
          <Text style={styles.itemClient} numberOfLines={1}>
            {[
              item.responsavelNome ? `Com ${item.responsavelNome}` : null,
              item.contratoId ? 'Visita de contrato' : item.recorrencia ? `Repete ${rotuloRecorrencia(item.recorrencia)}` : null,
            ].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {item.status !== 'agendado' && (
          <Text style={[styles.statusText, item.status === 'concluido' ? { color: cores.success } : { color: cores.danger }]}>
            {STATUS_AGENDAMENTO_LABELS[item.status]}
          </Text>
        )}
      </View>
      {item.endereco ? (
        <TouchableOpacity
          style={styles.routeBtn}
          onPress={(ev) => { ev.stopPropagation(); vibrar('selecao'); abrirRotaGoogleMaps(item.endereco!); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Traçar rota"
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="navigation-variant" size={18} color={cores.accentLight} />
        </TouchableOpacity>
      ) : null}
      <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
    </OlliPressable>
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
  /** 'HH:mm', ou '' = "Dia todo" (sem hora marcada). */
  horaInicio: string;
  horaFim: string;
  /** O fim ainda é o sugerido pela duração do tipo (acompanha início e tipo). */
  fimAutomatico?: boolean;
  endereco: string;
  observacao: string;
  status?: Agendamento['status'];
  orcamentoId?: string;
  criadoEm?: string;
  responsavelId?: string;
  responsavelNome?: string;
  recorrencia?: RecorrenciaAgendamento;
  /** 'dd/mm/aaaa' digitado (ou ''). */
  recorrenciaAteBR: string;
  contratoId?: string;
  /**
   * Campos que o formulário NÃO edita, mas que a linha tem: sem carregá-los até o
   * save, salvar a série pelo formulário apagaria as exceções por ocorrência
   * (canceladas/movidas/concluídas só ela) e a OS ligada — local e na nuvem.
   */
  excecoes?: Agendamento['excecoes'];
  ordemServicoId?: string;
}

function combinarDataHora(data: Date, hora: string): Date {
  // '' = "Dia todo": meia-noite e sem fim, a mesma marca do painel (semHoraMarcada).
  if (!hora) {
    const d0 = new Date(data);
    d0.setHours(0, 0, 0, 0);
    return d0;
  }
  const [h, m] = hora.split(':').map(n => parseInt(n, 10));
  const d = new Date(data);
  d.setHours(isNaN(h) ? 9 : Math.min(23, h), isNaN(m) ? 0 : Math.min(59, m), 0, 0);
  return d;
}

function AgendamentoForm({
  state, clientes, itens, podeEscolherResponsavel, equipe, voltarRef, salvando, onChange, onClose, onSave, onDelete, onAbrirOrcamento, onVerCliente,
}: {
  state: EditState;
  clientes: Cliente[];
  /** Gestão/conta pessoal escolhe o técnico; o técnico agenda só para si. */
  podeEscolherResponsavel: boolean;
  /** Equipe já carregada pela tela (o seletor não lê de novo). */
  equipe: ReturnType<typeof useEquipeResponsaveis>;
  /** A tela pergunta aqui, no voltar do Android, se o form fechou uma camada interna. */
  voltarRef?: React.MutableRefObject<(() => boolean) | null>;
  /** Agendamentos JÁ carregados do período — usados só pra detectar SOBREPOSIÇÃO (1.5), sem query nova. */
  itens: Agendamento[];
  salvando: boolean;
  onChange: (s: EditState) => void;
  onClose: () => void;
  onSave: (s: EditState) => void;
  onDelete?: () => void;
  onAbrirOrcamento?: () => void;
  onVerCliente?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [showClientes, setShowClientes] = useState(false);
  useEffect(() => {
    if (!voltarRef) return;
    voltarRef.current = () => {
      if (!showClientes) return false;
      setShowClientes(false);
      return true;
    };
    return () => { voltarRef.current = null; };
  }, [voltarRef, showClientes]);
  const [buscaCliente, setBuscaCliente] = useState('');
  // Qual campo de hora o TimePickerModal está editando agora (1.7).
  const [timePicker, setTimePicker] = useState<'inicio' | 'fim' | null>(null);
  const [datePicker, setDatePicker] = useState(false);

  const set = (patch: Partial<EditState>) => onChange({ ...state, ...patch });

  // Busca em TODOS os clientes (antes a lista parava nos 30 primeiros, sem busca).
  const clientesFiltrados = useMemo(() => filtrarClientes(clientes, buscaCliente), [clientes, buscaCliente]);
  const nomeLivre = buscaCliente.trim();

  function escolherCliente(c: Cliente) {
    vibrar('selecao');
    set({ clienteId: c.id, clienteNome: c.nome, endereco: state.endereco || c.endereco || '' });
    setShowClientes(false);
  }

  function usarNomeLivre(nome: string) {
    vibrar('selecao');
    set({ clienteId: undefined, clienteNome: nome });
    setShowClientes(false);
  }

  /** Fim sugerido de novo quando ele ainda é o automático. */
  function fimPara(horaInicio: string, tipo: TipoAgendamento): Partial<EditState> {
    if (!state.fimAutomatico || !horaInicio) return {};
    return { horaFim: horaFimSugerida(combinarDataHora(state.data, horaInicio), tipo) };
  }

  function deslocarDia(delta: number) {
    vibrar('selecao');
    set({ data: addDays(state.data, delta) });
  }

  // SOBREPOSIÇÃO (1.5) — aviso NÃO-BLOQUEANTE: recalcula a cada troca de
  // horário/data, contra a lista `itens` já carregada (sem query nova).
  // `ignorarId: state.id` evita o item colidir consigo mesmo ao editar.
  const conflito = useMemo(() => {
    if (!state.horaInicio) return null;
    const ini = combinarDataHora(state.data, state.horaInicio);
    const fimDt = state.horaFim ? combinarDataHora(state.data, state.horaFim) : undefined;
    return encontrarConflitoDeHorario(itens, { inicio: ini, fim: fimDt }, state.id);
  }, [itens, state.data, state.horaInicio, state.horaFim, state.id]);

  // AGENDAR NO PASSADO — aviso, não bloqueio (registrar uma visita que já
  // aconteceu é legítimo). Só para o que ainda está "agendado".
  // Série repetida fica de fora: a base costuma ser a 1ª ocorrência (já passada)
  // e as próximas ainda vêm, então "esse horário já passou" seria mentira.
  const noPassado = useMemo(() => (state.status ?? 'agendado') === 'agendado'
    && !state.recorrencia
    && agendamentoNoPassado(combinarDataHora(state.data, state.horaInicio), !!state.horaInicio, new Date()),
  [state.status, state.recorrencia, state.data, state.horaInicio]);

  return (
    <KeyboardAvoidingView style={styles.formContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.formHeader, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.formTitle}>{state.id ? 'Editar agendamento' : 'Agendar visita'}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
          <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
        {/* REGISTROS VINCULADOS (CRM) — abre o orçamento / os orçamentos do cliente */}
        {(onAbrirOrcamento || onVerCliente) && (
          <View style={styles.linkRow}>
            {onAbrirOrcamento && (
              <TouchableOpacity style={styles.linkBtn} onPress={onAbrirOrcamento} activeOpacity={0.85}>
                <MaterialCommunityIcons name="file-document-outline" size={18} color={cores.accentLight} />
                <Text style={styles.linkBtnText}>Ver orçamento</Text>
              </TouchableOpacity>
            )}
            {onVerCliente && (
              <TouchableOpacity style={styles.linkBtn} onPress={onVerCliente} activeOpacity={0.85}>
                <MaterialCommunityIcons name="account-search-outline" size={18} color={cores.accentLight} />
                <Text style={styles.linkBtnText}>Orçamentos do cliente</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* TIPO */}
        <FieldLabel>Tipo</FieldLabel>
        <View style={styles.tipoGrid}>
          {TIPOS_AGENDAMENTO.map(t => {
            const active = t.id === state.tipo;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.tipoOption, active && { backgroundColor: t.color + '22', borderColor: t.color }]}
                onPress={() => { vibrar('selecao'); set({ tipo: t.id, ...fimPara(state.horaInicio, t.id) }); }}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name={t.icon as any} size={18} color={active ? corCategoriaEmChip(t.color, cores.surface) : cores.onSurfaceVariant} />
                <Text style={[styles.tipoOptionText, active && { color: corCategoriaEmChip(t.color, cores.surface) }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* CLIENTE — um campo só: busca nos cadastrados ou usa o nome digitado
            sem cadastro (antes eram dois campos e a lista parava em 30). */}
        <FieldLabel style={{ marginTop: Spacing.base }}>Cliente</FieldLabel>
        <TouchableOpacity
          style={styles.clientePicker}
          onPress={() => { setBuscaCliente(''); setShowClientes(true); }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={state.clienteNome ? `Cliente: ${state.clienteNome}. Trocar` : 'Buscar cliente'}
        >
          <MaterialCommunityIcons name="account-outline" size={20} color={cores.onSurfaceMuted} />
          <Text style={[styles.clientePickerText, !state.clienteNome && { color: cores.onSurfaceMuted }]} numberOfLines={1}>
            {state.clienteNome || 'Buscar cliente (opcional)'}
          </Text>
          {state.clienteNome ? (
            <TouchableOpacity
              onPress={() => set({ clienteId: undefined, clienteNome: '' })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Tirar o cliente"
            >
              <MaterialCommunityIcons name="close-circle" size={20} color={cores.onSurfaceMuted} />
            </TouchableOpacity>
          ) : (
            <MaterialCommunityIcons name="magnify" size={20} color={cores.onSurfaceMuted} />
          )}
        </TouchableOpacity>
        {state.clienteNome && !state.clienteId ? (
          <Text style={styles.ajuda}>Sem cadastro: o nome fica só neste compromisso.</Text>
        ) : null}
        <View style={{ height: Spacing.base }} />

        {/* TÍTULO */}
        <OlliInput
          label="Título"
          value={state.titulo}
          onChangeText={v => set({ titulo: v })}
          placeholder="Ex: Manutenção Split 12.000 BTUs"
          leftIcon="text"
        />

        {/* DATA — tocar na data abre o calendário (antes só ±1 dia por toque). */}
        <FieldLabel>Data</FieldLabel>
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.dateNav} onPress={() => deslocarDia(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Dia anterior">
            <MaterialCommunityIcons name="chevron-left" size={22} color={cores.accentLight} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateDisplay}
            onPress={() => { vibrar('selecao'); setDatePicker(true); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Data: ${format(state.data, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}. Escolher outra`}
          >
            <MaterialCommunityIcons name="calendar" size={18} color={cores.accentLight} />
            <Text style={styles.dateText}>{capitalizeFirst(format(state.data, "EEE, d 'de' MMM 'de' yyyy", { locale: ptBR }))}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateNav} onPress={() => deslocarDia(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Próximo dia">
            <MaterialCommunityIcons name="chevron-right" size={22} color={cores.accentLight} />
          </TouchableOpacity>
        </View>
        <DatePickerModal
          locale="pt-BR"
          mode="single"
          visible={datePicker}
          date={state.data}
          startWeekOnMonday
          label="Data do compromisso"
          saveLabel="Definir"
          onDismiss={() => setDatePicker(false)}
          onConfirm={({ date }) => {
            setDatePicker(false);
            if (date) set({ data: date });
          }}
        />
        <View style={styles.quickDates}>
          <QuickDate label="Hoje" onPress={() => set({ data: new Date() })} />
          <QuickDate label="Amanhã" onPress={() => set({ data: addDays(new Date(), 1) })} />
          <QuickDate label="+1 semana" onPress={() => set({ data: addDays(new Date(), 7) })} />
        </View>

        {/* HORÁRIOS (1.7) — TimePickerModal do react-native-paper-dates no lugar
            da máscara de texto manual (frágil: aceitava "25:99"). */}
        <View style={styles.rowFields}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <FieldLabel>Início</FieldLabel>
            <TouchableOpacity
              style={styles.clientePicker}
              onPress={() => { vibrar('selecao'); setTimePicker('inicio'); }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Escolher horário de início"
            >
              <MaterialCommunityIcons name="clock-outline" size={20} color={cores.onSurfaceMuted} />
              <Text style={styles.clientePickerText}>{state.horaInicio || 'Dia todo'}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <FieldLabel>Fim (opcional)</FieldLabel>
            <TouchableOpacity
              style={styles.clientePicker}
              onPress={() => { vibrar('selecao'); setTimePicker('fim'); }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Escolher horário de fim"
            >
              <MaterialCommunityIcons name="clock-check-outline" size={20} color={cores.onSurfaceMuted} />
              <Text style={[styles.clientePickerText, !state.horaFim && { color: cores.onSurfaceMuted }]}>
                {state.horaFim || 'Não definido'}
              </Text>
              {state.horaFim ? (
                <TouchableOpacity
                  onPress={() => set({ horaFim: '', fimAutomatico: false })}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Tirar o horário de fim"
                >
                  <MaterialCommunityIcons name="close-circle" size={18} color={cores.onSurfaceMuted} />
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>
        {state.fimAutomatico && state.horaFim ? (
          <Text style={styles.ajuda}>
            Fim estimado: {TIPO_AGENDAMENTO_LABELS[state.tipo].toLowerCase()} costuma levar {rotuloDuracao(duracaoEstimadaMin(state.tipo))}. Toque para mudar.
          </Text>
        ) : null}
        <View style={{ height: Spacing.base }} />

        {/* SOBREPOSIÇÃO (1.5) — aviso não-bloqueante: some sozinho quando o
            horário deixa de colidir; o botão Confirmar continua ativo. */}
        {conflito && (
          <View style={styles.avisoConflito}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={cores.warning} />
            <Text style={styles.avisoConflitoText}>
              Esse horário colide com "{conflito.titulo}" das {hhmm(conflito.inicio)}
              {conflito.fim ? `–${hhmm(conflito.fim)}` : ''}.
            </Text>
          </View>
        )}
        {noPassado && (
          <View style={styles.avisoConflito}>
            <MaterialCommunityIcons name="clock-alert-outline" size={16} color={cores.warning} />
            <Text style={styles.avisoConflitoText}>
              Esse horário já passou. Dá para salvar (para registrar uma visita feita, por exemplo), mas não vai ter lembrete.
            </Text>
          </View>
        )}

        <TimePickerModal
          visible={timePicker !== null}
          animationType="fade"
          locale="pt-BR"
          use24HourClock
          label={timePicker === 'inicio' ? 'Horário de início' : 'Horário de fim'}
          cancelLabel="Cancelar"
          confirmLabel="Definir"
          hours={parseHoraHHMM(timePicker === 'inicio' ? state.horaInicio : state.horaFim).hours}
          minutes={parseHoraHHMM(timePicker === 'inicio' ? state.horaInicio : state.horaFim).minutes}
          onDismiss={() => setTimePicker(null)}
          onConfirm={({ hours, minutes }) => {
            const hhmmSel = formatHoraHHMM(hours, minutes);
            // Mudar o início leva o fim junto enquanto ele for o sugerido; escolher o
            // fim na mão desliga a sugestão.
            if (timePicker === 'inicio') set({ horaInicio: hhmmSel, ...fimPara(hhmmSel, state.tipo) });
            else set({ horaFim: hhmmSel, fimAutomatico: false });
            setTimePicker(null);
          }}
        />

        {/* RESPONSÁVEL (técnico da equipe) e REPETIÇÃO — a visita de contrato
            repete pelo contrato, não por aqui. */}
        {/* Técnico não escolhe responsável: agenda só para si (ver abrirNovo/salvar). */}
        {podeEscolherResponsavel ? (
          <SeletorResponsavel
            responsavelId={state.responsavelId}
            responsavelNome={state.responsavelNome}
            onChange={r => set(r)}
            equipe={equipe}
          />
        ) : null}
        {state.contratoId ? (
          <Text style={[styles.ajuda, { marginTop: Spacing.base }]}>Visita gerada por um contrato recorrente — a repetição vem do contrato.</Text>
        ) : (
          <CamposRecorrencia
            recorrencia={state.recorrencia}
            recorrenciaAteBR={state.recorrenciaAteBR}
            onChange={r => set({
              ...(('recorrencia' in r) ? { recorrencia: r.recorrencia } : {}),
              ...(r.recorrenciaAteBR !== undefined ? { recorrenciaAteBR: r.recorrenciaAteBR } : {}),
            })}
          />
        )}

        {/* ENDEREÇO */}
        <View style={{ marginTop: Spacing.base }}>
          <OlliInput
            label="Endereço"
            value={state.endereco}
            onChangeText={v => set({ endereco: v })}
            placeholder="Rua, número, bairro"
            leftIcon="map-marker"
          />
        </View>

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
            <FieldLabel>Status</FieldLabel>
            <View style={styles.statusRow}>
              {(['agendado', 'concluido', 'cancelado'] as const).map(s => {
                const active = (state.status ?? 'agendado') === s;
                const cor = s === 'concluido' ? cores.success : s === 'cancelado' ? cores.danger : cores.accent;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusOption, active && { backgroundColor: cor + '22', borderColor: cor }]}
                    onPress={() => { vibrar('selecao'); set({ status: s }); }}
                    activeOpacity={0.85}
                  >
                    {/* Texto usa accentLight (não accent) quando 'agendado': o preenchimento
                        continua com `cor` (accent), mas a tinta em cima precisa do tom mais
                        escuro para não sumir sobre a superfície clara. */}
                    <Text style={[styles.statusOptionText, active && { color: s === 'agendado' ? cores.accentLight : cor }]}>{STATUS_AGENDAMENTO_LABELS[s]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {onDelete && (
          <TouchableOpacity style={[styles.deleteBtn, salvando && { opacity: 0.5 }]} onPress={onDelete} activeOpacity={0.8} disabled={salvando}>
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={cores.danger} />
            <Text style={styles.deleteText}>{state.recorrencia ? 'Excluir a série inteira' : 'Excluir agendamento'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={[styles.formFooter, { paddingBottom: insets.bottom + 16 }]}>
        <OlliButton
          label={state.id ? 'Salvar alterações' : 'Confirmar agendamento'}
          variant="gradient" size="lg" fullWidth
          onPress={() => onSave(state)}
          loading={salvando}
          disabled={salvando}
          icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />}
        />
      </View>

      {/* BUSCA DE CLIENTE — camada por cima do formulário (não outro Modal):
          FlatList com todos os clientes, filtro sem acento por nome ou telefone. */}
      {showClientes && (
        <View style={[styles.buscaOverlay, { paddingTop: insets.top + 10 }]}>
          <View style={styles.buscaHeader}>
            <Text style={styles.formTitle}>Escolher cliente</Text>
            <TouchableOpacity onPress={() => setShowClientes(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar busca de cliente">
              <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: Spacing.base }}>
            <OlliInput
              label="Buscar"
              value={buscaCliente}
              onChangeText={setBuscaCliente}
              placeholder="Nome ou telefone"
              leftIcon="magnify"
              autoFocus
              returnKeyType="search"
            />
          </View>
          <FlatList
            data={clientesFiltrados}
            keyExtractor={c => c.id}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: insets.bottom + 24 }}
            ListHeaderComponent={nomeLivre ? (
              <TouchableOpacity style={styles.usarNomeLivre} onPress={() => usarNomeLivre(nomeLivre)} activeOpacity={0.85} accessibilityRole="button">
                <MaterialCommunityIcons name="account-plus-outline" size={18} color={cores.accentLight} />
                <Text style={styles.usarNomeLivreText} numberOfLines={2}>Usar "{nomeLivre}" sem cadastro</Text>
              </TouchableOpacity>
            ) : null}
            ListEmptyComponent={
              <Text style={styles.clienteEmpty}>
                {clientes.length === 0
                  ? 'Nenhum cliente cadastrado ainda. Digite o nome acima para usar sem cadastro.'
                  : 'Nenhum cliente com esse nome ou telefone.'}
              </Text>
            }
            renderItem={({ item: c }) => (
              <TouchableOpacity style={styles.clienteRow} onPress={() => escolherCliente(c)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Escolher ${c.nome}`}>
                <Text style={styles.clienteRowName}>{c.nome}</Text>
                {c.telefone ? <Text style={styles.clienteRowMeta}>{c.telefone}</Text> : null}
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function QuickDate({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useEstilos(criarEstilos);
  return (
    <TouchableOpacity
      style={styles.quickDate}
      onPress={() => { vibrar('selecao'); onPress(); }}
      activeOpacity={0.8}
    >
      <Text style={styles.quickDateText}>{label}</Text>
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
  syncPillText: { fontSize: 11.5, fontWeight: '700', color: c.accent }, // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 2.88:1 (7.25:1)

  // Textos/hairlines brancos abaixo pertencem ao GradientHeader (não migrado): o
  // header é sempre um banner colorido/escuro nos dois modos, então branco fixo
  // continua correto — ver comentário de `header` em theme/cores.ts.
  todayBtn: { backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderRadius: BorderRadius.full, paddingHorizontal: 16, paddingVertical: 8 },
  // Sem cor: estes três vivem dentro do GradientHeader e recebem `sobreHeader` no
  // ponto de uso. A fábrica só conhece `Cores` (superfícies), não os gradientes.
  todayBtnText: { fontSize: 13, fontWeight: '800' },

  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.base },
  navBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.10)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  navLabelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  navLabel: { textAlign: 'center', fontSize: 15, fontWeight: '700' },
  viewToggle: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, minHeight: 36, paddingHorizontal: 14, borderRadius: BorderRadius.full, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  viewToggleText: { fontSize: 12.5, fontWeight: '800' },

  calendarCard: { margin: Spacing.base, marginBottom: 0, padding: 10, backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, ...sombrasDe(c).sm },
  weekStrip: { flexDirection: 'row', alignItems: 'stretch', gap: 4 },
  weekDay: { flex: 1, minHeight: 70, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderWidth: 1, borderColor: 'transparent' },
  weekDaySelected: { backgroundColor: c.accentLight, borderColor: c.accentLight },
  weekDayName: { fontSize: 10, fontWeight: '800', color: c.onSurfaceMuted },
  weekDayNumber: { fontSize: 17, lineHeight: 22, fontWeight: '800', color: c.onSurface, marginTop: 2 },
  weekDayToday: { color: c.accentLight },
  weekDayTextSelected: { color: textoSobre(c.accentLight) },
  dayMarkers: { minHeight: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 2 },
  dayMarker: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.accentLight },
  dayMarkerSelected: { backgroundColor: textoSobre(c.accentLight) },
  dayCount: { fontSize: 9, lineHeight: 11, fontWeight: '800', color: c.onSurfaceMuted },
  monthWeekNames: { flexDirection: 'row', marginBottom: 4 },
  monthWeekName: { width: '14.2857%', textAlign: 'center', fontSize: 9.5, fontWeight: '800', color: c.onSurfaceMuted },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthDayCell: { width: '14.2857%', alignItems: 'center', paddingVertical: 2 },
  monthDay: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  monthDaySelected: { backgroundColor: c.accentLight },
  monthDayText: { fontSize: 13, fontWeight: '700', color: c.onSurface },
  monthDayOutside: { color: c.onSurfaceMuted, opacity: 0.55 },
  monthDayToday: { color: c.accentLight, fontWeight: '900' },
  monthDayTextSelected: { color: textoSobre(c.accentLight) },
  monthMarker: { position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: c.accentLight },

  googleCard: { margin: Spacing.base, marginBottom: 0, backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.md, ...sombrasDe(c).sm },
  googleCardRow: { flexDirection: 'row', alignItems: 'center' },
  googleCardTitle: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  googleCardHint: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  googleCardFooter: { fontSize: 11.5, color: c.onSurfaceMuted, marginTop: 10 },

  // Cyan fixo (não segue a cor de marca escolhida): decorativo, sem chave semântica exata.
  routeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(52,198,217,0.12)', borderWidth: 1, borderColor: 'rgba(52,198,217,0.30)', justifyContent: 'center', alignItems: 'center', marginRight: 8 },

  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dayHeaderTitle: { fontSize: 14, fontWeight: '800', color: c.onSurface },
  todayDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.accentLight },

  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.md, marginBottom: 10, ...sombrasDe(c).sm },
  itemBar: { width: 4, alignSelf: 'stretch', borderRadius: 4, marginRight: 12 },
  itemTime: { width: 48, marginRight: 8 },
  itemHour: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  itemHourEnd: { fontSize: 11, color: c.onSurfaceMuted, marginTop: 1 },
  itemDiaTodo: { fontSize: 12, lineHeight: 15, fontWeight: '800', color: c.accentLight },
  itemTitle: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  itemClient: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 1 },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  tipoChip: { borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 2 },
  tipoChipText: { fontSize: 11, fontWeight: '800' },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  addrText: { fontSize: 11.5, color: c.onSurfaceMuted, flex: 1 },
  statusText: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  strike: { textDecorationLine: 'line-through', color: c.onSurfaceMuted },

  fab: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 22, paddingVertical: 14, ...sombrasDe(c).glowCyan },
  fabText: { fontSize: 15, fontWeight: '800', color: textoSobre(c.accentLight) },

  // FORM
  formContainer: { flex: 1, backgroundColor: c.background },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.outline },
  formTitle: { fontSize: 20, fontWeight: '800', color: c.onSurface },
  ajuda: { fontSize: 12, color: c.onSurfaceMuted, marginTop: 6, lineHeight: 16 },

  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.base },
  // Cyan fixo (não segue a cor de marca escolhida): decorativo, sem chave semântica exata.
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(52,198,217,0.10)', borderWidth: 1, borderColor: 'rgba(52,198,217,0.30)', borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 10 },
  linkBtnText: { fontSize: 13, fontWeight: '700', color: c.accentLight },

  tipoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipoOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: c.outline, backgroundColor: c.surfaceVariant },
  tipoOptionText: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant },

  clientePicker: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: c.outline, paddingHorizontal: 14, minHeight: 50 },
  clientePickerText: { flex: 1, fontSize: 15, color: c.onSurface },
  buscaOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.background, zIndex: 10 },
  buscaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingBottom: Spacing.base },
  usarNomeLivre: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.accentLight, marginBottom: 8 },
  usarNomeLivreText: { flex: 1, fontSize: 14, fontWeight: '700', color: c.accentLight },
  clienteRow: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.outline },
  clienteRowName: { fontSize: 14, fontWeight: '600', color: c.onSurface },
  clienteRowMeta: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 1 },
  clienteEmpty: { fontSize: 13, color: c.onSurfaceMuted, padding: 14, textAlign: 'center' },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dateNav: { width: 42, height: 50, borderRadius: BorderRadius.md, backgroundColor: c.surfaceVariant, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: c.outline },
  dateDisplay: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: BorderRadius.md, backgroundColor: c.surfaceVariant, borderWidth: 1.5, borderColor: c.outline },
  dateText: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  quickDates: { flexDirection: 'row', gap: 8, marginBottom: Spacing.base },
  // Cyan fixo (não segue a cor de marca escolhida): decorativo, sem chave semântica exata.
  quickDate: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: BorderRadius.sm, backgroundColor: 'rgba(52,198,217,0.10)', borderWidth: 1, borderColor: 'rgba(52,198,217,0.3)' },
  quickDateText: { fontSize: 12.5, fontWeight: '700', color: c.accentLight },

  rowFields: { flexDirection: 'row' },

  // SOBREPOSIÇÃO (1.5) — aviso não-bloqueante, mesmo par warning/warningLight
  // usado nos avisos de EmitirReciboScreen (padrão do app pra "atenção, mas segue").
  avisoConflito: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: c.warningLight, borderWidth: 1, borderColor: c.warning, borderRadius: BorderRadius.md, padding: 10, marginBottom: Spacing.base },
  avisoConflitoText: { flex: 1, fontSize: 12.5, color: c.onSurface, lineHeight: 17 },

  statusRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.base },
  statusOption: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: c.outline, backgroundColor: c.surfaceVariant },
  statusOptionText: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant },

  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, marginTop: 6 },
  deleteText: { fontSize: 14, fontWeight: '700', color: c.danger },

  formFooter: { padding: Spacing.base, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
});
