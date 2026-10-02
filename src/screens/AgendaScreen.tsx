import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Alert, Platform,
  RefreshControl, Animated, KeyboardAvoidingView, Switch, FlatList,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
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
import { DURACAO, duracaoAcessivel, useReduzirMovimento } from '../theme/motion';
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
import { confirmar, toast } from '../components/feedback';
import { PressableAnimado } from '../components/motion';
import { GradeDia } from '../components/agenda/GradeDia';
import { SeletorVisao } from '../components/agenda/SeletorVisao';
import { FolhaAlcanceSerie, usePerguntaAlcance } from '../components/agenda/FolhaAlcanceSerie';
import { CampoVisitaExterna } from '../components/agenda/CampoVisitaExterna';
import { SugestaoEncaixe } from '../components/agenda/SugestaoEncaixe';
import { ClimaProximasVisitas } from '../components/agenda/ClimaProximasVisitas';
import { ClimaDaVisita } from '../components/clima/ClimaDaVisita';
import { SeloConfirmacao } from '../components/vespera/SeloConfirmacao';
import { useEncaixe } from '../hooks/useEncaixe';
import { sugerirVisitaExterna } from '../services/verticais';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAgendamentosExpandidos, getAgendamentosDoDia, getAgendamento, saveAgendamento, deleteAgendamento, editarRecorrente,
  encontrarConflitosPorTecnico, pedirPermissaoNotificacao, temPermissaoNotificacao, MINUTOS_ANTECEDENCIA_LEMBRETE,
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
  alcancesPermitidos, corDoTecnico, diferencaDaOcorrencia, minutosParaHHMM, remarcarNoDia,
  type EstadoOcorrencia, type VisaoAgenda,
} from '../utils/agendaVisual';
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
import { onSyncAplicado, sincronizarAgora } from '../services/cloudSync';
import { getCurrentUser } from '../services/supabase';
import { DIAS_RETENCAO_LIXEIRA } from '../services/lixeira';
import { AGENDA_VISAO_KEY, NOTIF_EXPLICADO_KEY } from '../services/storageKeys';
import {
  googleAgendaDisponivel, estaConectado, conectarGoogleAgenda, desconectarGoogleAgenda,
  pushAgendamento, deleteEventoGoogle,
} from '../services/googleAgenda';
import { abrirRotaGoogleMaps } from '../services/rotas';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type AgendaRoute = RouteProp<TabParamList, 'Agenda'>;
// FILTROS (1.6) — client-side, sobre a lista já carregada (ver `itensFiltrados`).
type FiltroTipoAgenda = TipoAgendamento | 'todos';
type FiltroStatusAgenda = StatusAgendamento | 'todos';

const VISOES: readonly VisaoAgenda[] = ['dia', 'semana', 'mes'];

/**
 * Pill discreto "Sincronizando..." — some com fade sozinho depois de exibido.
 * Dá feedback visual de que a tela está de fato conectada à nuvem quando o
 * `onSyncAplicado` recarrega os dados em segundo plano.
 */
function SincronizandoPill({ onDone, texto = 'Sincronizando...', icon = 'cloud-sync-outline' }: { onDone: () => void; texto?: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const opacity = useRef(new Animated.Value(0)).current;

  // Só opacidade, com os tokens de duração; "Reduzir movimento" troca o fade por corte seco.
  // biome-ignore lint/correctness/useExhaustiveDependencies: roda uma vez por exibição (onDone muda a cada render do pai).
  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: duracaoAcessivel(DURACAO.fast, reduzir), useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(opacity, { toValue: 0, duration: duracaoAcessivel(DURACAO.slow, reduzir), useNativeDriver: true }),
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

// Limites do período carregado. A visão Dia carrega a SEMANA dela: a faixa de dias
// acima da grade mostra as bolinhas dos outros dias sem outra leitura.
function rangeFor(visao: VisaoAgenda, ref: Date): { inicio: Date; fim: Date } {
  if (visao === 'mes') return { inicio: startOfMonth(ref), fim: endOfMonth(ref) };
  return {
    inicio: startOfWeek(ref, { weekStartsOn: 1 }),
    fim: endOfWeek(ref, { weekStartsOn: 1 }),
  };
}

function rotuloPeriodo(visao: VisaoAgenda, ref: Date): string {
  if (visao === 'dia') return capitalizeFirst(format(ref, "EEE, d 'de' MMM", { locale: ptBR }));
  if (visao === 'semana') {
    const i = startOfWeek(ref, { weekStartsOn: 1 });
    const f = endOfWeek(ref, { weekStartsOn: 1 });
    return `${format(i, "d MMM", { locale: ptBR })} – ${format(f, "d MMM", { locale: ptBR })}`;
  }
  return capitalizeFirst(format(ref, "MMMM 'de' yyyy", { locale: ptBR }));
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export default function AgendaScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<AgendaRoute>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  // O conteúdo do <GradientHeader> não se pinta com tokens de SUPERFÍCIE: o fundo
  // ali é o gradiente da marca. `sobreHeader` é a cor que atravessa as duas pontas.
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  const reduzirMovimento = useReduzirMovimento();

  const [visao, setVisao] = useState<VisaoAgenda>('dia');
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
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleDisponivel = googleAgendaDisponivel();
  // "Só esta / esta e as próximas / toda a série": uma folha para o formulário
  // (desenhada DENTRO do Modal dele) e outra para o arrastar na grade.
  const alcanceForm = usePerguntaAlcance();
  const alcanceTela = usePerguntaAlcance();

  // Última visão escolhida (preferência do aparelho; sem storage, abre em "Dia").
  useEffect(() => {
    AsyncStorage.getItem(AGENDA_VISAO_KEY)
      .then(v => { if (v && (VISOES as readonly string[]).includes(v)) setVisao(v as VisaoAgenda); })
      .catch(() => {});
  }, []);
  const trocarVisao = useCallback((v: VisaoAgenda) => {
    setVisao(v);
    AsyncStorage.setItem(AGENDA_VISAO_KEY, v).catch(() => {});
  }, []);

  const { inicio, fim } = useMemo(() => rangeFor(visao, ref), [visao, ref]);

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
        if (!ok) toast.erro('Não foi possível conectar ao Google Agenda agora. Tente de novo.');
      } else {
        await desconectarGoogleAgenda();
        setGoogleConectado(false);
      }
    } catch {
      toast.erro('Não foi possível atualizar a conexão com o Google Agenda agora.');
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

  // PUXAR PARA ATUALIZAR busca da NUVEM. Antes chamava `syncOnLogin` direto: com
  // o sync do boot ainda rodando, a trava de reentrância devolvia na hora, a tela
  // relia só o aparelho e a visita nova só aparecia reabrindo o app.
  // `sincronizarAgora` espera o sync em voo e roda um pull NOVO, e diz a verdade
  // quando a nuvem não respondeu (a lista na tela é a do aparelho).
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await sincronizarAgora();
      if (r === 'falhou') {
        vibrar('erro');
        toast.erro('Não deu para buscar da nuvem agora. A agenda mostra o que está neste aparelho.', {
          acao: { rotulo: 'Tentar de novo', aoTocar: () => { void refresh(); } },
        });
      } else if (r === 'demorou') {
        toast.info('A nuvem está demorando. A agenda atualiza sozinha quando terminar.');
      }
    } finally {
      await load();
      setRefreshing(false);
    }
  }, [load]);
  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[cores.accentLight]} tintColor={cores.accentLight} />
  );

  // CORES — com equipe, cada técnico tem a sua (a mesma no Dia, na Semana, no Mês
  // e nos chips do filtro); sem equipe, a cor é a do tipo de visita.
  const ordemEquipe = useMemo(
    () => (equipe.estado.status === 'ok' ? equipe.estado.membros.map(m => m.userId) : []),
    [equipe.estado],
  );
  const corPorTecnico = podeVerEquipe && equipe.estado.status === 'ok' && !equipe.estado.semEquipe;
  const corDe = useCallback((a: Pick<Agendamento, 'tipo' | 'responsavelId'>) => (
    corPorTecnico ? corDoTecnico(a.responsavelId, ordemEquipe) : TIPO_AGENDAMENTO_COLORS[a.tipo]
  ), [corPorTecnico, ordemEquipe]);

  // FILTROS (1.6) — chips de tipo/status com contagem, client-side sobre `itens`
  // (a lista já carregada do período; nenhuma query nova). "Todos" sempre é a
  // contagem total do período, independente do OUTRO filtro estar ativo.
  const chipsTipo: ItemChipFiltro<FiltroTipoAgenda>[] = useMemo(() => [
    { chave: 'todos', rotulo: 'Todos os tipos', contagem: itensVisiveis.length },
    ...TIPOS_AGENDAMENTO.map(t => ({
      chave: t.id as FiltroTipoAgenda,
      rotulo: t.label,
      cor: t.color,
      contagem: itensVisiveis.filter(a => a.tipo === t.id).length,
    })),
  ], [itensVisiveis]);

  const chipsStatus: ItemChipFiltro<FiltroStatusAgenda>[] = useMemo(() => [
    { chave: 'todos', rotulo: 'Todos os status', contagem: itensVisiveis.length },
    { chave: 'agendado', rotulo: STATUS_AGENDAMENTO_LABELS.agendado, cor: cores.accent, contagem: itensVisiveis.filter(a => a.status === 'agendado').length },
    { chave: 'concluido', rotulo: STATUS_AGENDAMENTO_LABELS.concluido, cor: cores.success, contagem: itensVisiveis.filter(a => a.status === 'concluido').length },
    { chave: 'cancelado', rotulo: STATUS_AGENDAMENTO_LABELS.cancelado, cor: cores.danger, contagem: itensVisiveis.filter(a => a.status === 'cancelado').length },
  ], [itensVisiveis, cores]);

  const chipsTecnico: ItemChipFiltro<FiltroResponsavel>[] = useMemo(() => {
    // Técnico não escolhe de quem ver: a lista dele já é só a dele.
    if (!podeVerEquipe || equipe.estado.status !== 'ok' || equipe.estado.semEquipe) return [];
    return [
      { chave: 'todos', rotulo: 'Toda a equipe', contagem: itens.length },
      { chave: 'sem', rotulo: 'Sem responsável', corFundo: corDoTecnico(null), contagem: filtrarPorResponsavel(itens, 'sem').length },
      ...equipe.estado.membros.map(m => ({
        chave: m.userId,
        rotulo: m.nome,
        // Matiz cru no fundo (bolinha/borda); o texto ativo cede para o contraste.
        corFundo: corDoTecnico(m.userId, ordemEquipe),
        cor: corCategoriaEmChip(corDoTecnico(m.userId, ordemEquipe), cores.surface),
        contagem: filtrarPorResponsavel(itens, m.userId).length,
      })),
    ];
  }, [itens, equipe.estado, podeVerEquipe, ordemEquipe, cores.surface]);

  const filtrosAtivos = (filtroTipo !== 'todos' ? 1 : 0) + (filtroStatus !== 'todos' ? 1 : 0) + (podeVerEquipe && filtroTecnico !== 'todos' ? 1 : 0);
  const limparFiltros = () => { vibrar('selecao'); setFiltroTipo('todos'); setFiltroStatus('todos'); setFiltroTecnico('todos'); };

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

  // Por dia: quantos compromissos e até 3 cores (técnico ou tipo) para as bolinhas.
  const resumoPorDia = useMemo(() => {
    const mapa = new Map<string, { qtd: number; cores: string[]; itens: OcorrenciaAgendamento[] }>();
    itensFiltrados.forEach(a => {
      const data = new Date(a.inicio);
      if (isNaN(data.getTime())) return;
      const chave = format(data, 'yyyy-MM-dd');
      const r = mapa.get(chave) ?? { qtd: 0, cores: [], itens: [] };
      r.qtd += 1;
      r.itens.push(a);
      const cor = corDe(a);
      if (r.cores.length < 3 && !r.cores.includes(cor)) r.cores.push(cor);
      mapa.set(chave, r);
    });
    return mapa;
  }, [itensFiltrados, corDe]);

  // "Dia todo" (sem hora marcada) vem no topo do dia, depois pela hora.
  const itensDoDiaSemFiltro = useMemo(() => ordenarDoDia(itensVisiveis
    .filter(a => isSameDay(new Date(a.inicio), ref))), [itensVisiveis, ref]);

  const itensDoDia = useMemo(() => ordenarDoDia(itensFiltrados
    .filter(a => isSameDay(new Date(a.inicio), ref))), [itensFiltrados, ref]);

  // Cadastro de cada cliente (ponto para o clima, WhatsApp para o "Remarcar por chuva").
  const clientePorId = useMemo(() => new Map(clientes.map(c => [c.id, c] as const)), [clientes]);
  const clienteDe = useCallback((a: Pick<Agendamento, 'clienteId'>) => (a.clienteId ? clientePorId.get(a.clienteId) ?? null : null), [clientePorId]);

  // FAB "Agendar visita" — some ao rolar para baixo (não cobre o último card) e
  // volta ao rolar para cima. Só transform/opacity, na UI thread.
  const fabOculto = useSharedValue(0);
  const fabAlvo = useRef(0);
  const ultimoY = useRef(0);
  const moverFab = useCallback((alvo: 0 | 1) => {
    if (fabAlvo.current === alvo) return;
    fabAlvo.current = alvo;
    fabOculto.set(withTiming(alvo, { duration: duracaoAcessivel(DURACAO.base, reduzirMovimento) }));
  }, [fabOculto, reduzirMovimento]);
  const aoRolar = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - ultimoY.current;
    ultimoY.current = y;
    if (y < 24 || dy < -6) moverFab(0);
    else if (dy > 6) moverFab(1);
  }, [moverFab]);
  // Trocar de dia/visão traz o botão de volta.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o disparo É a troca de visão/dia.
  useEffect(() => { ultimoY.current = 0; moverFab(0); }, [visao, ref, moverFab]);
  const estiloFab = useAnimatedStyle(() => ({
    opacity: 1 - fabOculto.get(),
    transform: [{ translateY: fabOculto.get() * 120 }],
  }));

  function passo(delta: number) {
    vibrar('selecao');
    setRef(prev => visao === 'dia' ? addDays(prev, delta) : visao === 'semana' ? addWeeks(prev, delta) : addMonths(prev, delta));
  }

  function selecionarDia(dia: Date, irParaDia = false) {
    vibrar('selecao');
    setRef(dia);
    if (irParaDia) trocarVisao('dia');
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
        if (!isNaN(dia.getTime())) { trocarVisao('dia'); setRef(dia); }
        if (escopo.status === 'propria' && a.responsavelId !== escopo.userId) {
          Alert.alert('Compromisso de outro técnico', 'Este compromisso está com outra pessoa da equipe. Fale com a gestão se ele for seu.');
          return;
        }
        abrirEdicao(a);
      } catch {
        toast.erro('Não foi possível abrir este compromisso agora.');
      }
    })();
  }, [abrirPendente, escopo]);

  // Para campos do form: 'HH:mm' válido, ou '' (vazio) quando inválido/ausente.
  function hhmmRaw(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : format(d, 'HH:mm');
  }

  // Visita de SÉRIE: abre a OCORRÊNCIA tocada (data, hora e o que só ela mudou),
  // com a base lida de novo do banco. Ao salvar, a tela pergunta o alcance (só
  // esta / esta e as próximas / toda a série). Antes abria a série inteira, e
  // remarcar UMA visita remarcava todas.
  async function abrirItem(a: OcorrenciaAgendamento) {
    if (!a.recorrencia) { abrirEdicao(a); return; }
    try {
      const base = await getAgendamento(idBaseDaOcorrencia(a.id));
      if (!base || base.excluidoEm) {
        toast.erro('Não achei o compromisso original desta repetição. Puxe a lista para baixo para atualizar.');
        return;
      }
      abrirEdicao({
        ...base,
        inicio: a.inicio,
        fim: a.fim,
        status: a.status,
        titulo: a.titulo,
        observacao: a.observacao,
        responsavelId: a.responsavelId,
        responsavelNome: a.responsavelNome,
      }, a.id);
    } catch {
      toast.erro('Não foi possível abrir este compromisso agora.');
    }
  }

  function abrirEdicao(a: Agendamento, ocorrenciaId?: string) {
    const iniRaw = new Date(a.inicio);
    // Se o início vier inválido/nulo da nuvem, cai para hoje (evita RangeError no format).
    const ini = isNaN(iniRaw.getTime()) ? new Date() : iniRaw;
    const ed: EditState = {
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
      externa: a.externa,
    };
    // Série: guarda a ocorrência COMO ABRIU, passada pela mesma montagem do salvar
    // — assim só o que a pessoa mudou de verdade vira mudança.
    if (a.recorrencia && !a.contratoId) {
      ed.ocorrenciaId = ocorrenciaId ?? a.id;
      const m = montarAgendamento(ed, escopo.status === 'propria' ? escopo.userId : undefined);
      if ('agendamento' in m) ed.original = estadoDaOcorrencia(m.agendamento);
    }
    setEditing(ed);
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
      const quer = await confirmar({
        titulo: 'Ativar lembretes de visita?',
        mensagem: `Para te avisar ${MINUTOS_ANTECEDENCIA_LEMBRETE / 60}h antes de cada compromisso, mesmo com o app fechado, a OLLI precisa da sua permissão para enviar notificações.`,
        rotuloConfirmar: 'Ativar',
        rotuloCancelar: 'Agora não',
      });
      // A flag só é gravada DEPOIS da resposta: se o app morrer no meio da
      // pergunta, o aviso volta a aparecer na próxima vez em vez de sumir para sempre.
      await AsyncStorage.setItem(NOTIF_EXPLICADO_KEY, '1');
      // Só chama o prompt do sistema se o usuário realmente pediu para ativar —
      // "Agora não" precisa respeitar a escolha, sem disparar o prompt do SO.
      if (quer) await pedirPermissaoNotificacao();
    } catch {
      // Falha ao pedir permissão nunca deve impedir salvar o agendamento.
    }
  }

  /** Volta a linha ao estado de antes (o "Desfazer" dos toasts). Grava pelo caminho normal: nuvem + lembretes. */
  async function desfazerPara(antes: Agendamento, aviso: string) {
    try {
      await saveAgendamento({ ...antes, excluidoEm: undefined, atualizadoEm: nowISO() });
      vibrar('sucesso');
      toast.info(aviso);
      await load();
    } catch {
      toast.erro('Não deu para desfazer agora. Abra o compromisso e ajuste à mão.');
    }
  }

  async function salvar(e: EditState) {
    const m = montarAgendamento(e, escopo.status === 'propria' ? escopo.userId : undefined);
    if ('erro' in m) {
      toast.erro(m.erro);
      return;
    }
    const a = m.agendamento;

    // OCORRÊNCIA DE SÉRIE: grava só o que mudou, no alcance escolhido.
    if (e.ocorrenciaId && e.original && e.id) {
      const d = diferencaDaOcorrencia(e.original, estadoDaOcorrencia(a));
      if (d.vazia) { setEditing(null); return; }
      const opcoes = alcancesPermitidos(d);
      const alcance = await alcanceForm.perguntar({
        titulo: 'Salvar em quais visitas?',
        mensagem: d.mudouRegra
          ? 'Mudar a repetição vale para a série inteira.'
          : opcoes.length < 3
            ? 'Cliente, tipo, endereço e "Serviço externo?" valem para a série: não dá para mudar só esta visita.'
            : `Esta visita repete ${rotuloRecorrencia(e.recorrencia)}.`,
        opcoes,
      });
      if (!alcance) return;
      setSalvando(true);
      try {
        await garantirPermissaoNotificacaoComAviso();
        const plano = await editarRecorrente(e.ocorrenciaId, alcance, d.mudanca, {
          camposSerie: d.camposSerie,
          regra: d.mudouRegra ? { recorrencia: a.recorrencia, recorrenciaAte: a.recorrenciaAte } : undefined,
        });
        vibrar('sucesso');
        setEditing(null);
        setRef(e.data);
        await load();
        toast.sucesso(alcance === 'so_esta' ? 'Visita atualizada. As outras repetições não mudaram.'
          : alcance === 'esta_e_proximas' ? 'Esta visita e as próximas foram atualizadas.'
          : 'A série inteira foi atualizada.');
        void sincronizarComGoogle(plano.base);
        if (plano.novaSerie) void sincronizarComGoogle(plano.novaSerie);
      } catch (err) {
        vibrar('erro');
        toast.erro(err instanceof Error && err.message ? err.message : 'Não foi possível salvar agora. Tente novamente.');
      } finally {
        setSalvando(false);
      }
      return;
    }

    setSalvando(true);
    try {
      await garantirPermissaoNotificacaoComAviso();
      await saveAgendamento(a);
      vibrar('sucesso');
      setEditing(null);
      // foca o período no dia do agendamento salvo
      setRef(e.data);
      await load();
      toast.sucesso(e.id ? 'Alterações salvas.' : `Agendado para ${format(e.data, "d 'de' MMM", { locale: ptBR })}${e.horaInicio ? ` às ${e.horaInicio}` : ''}.`);
      // Espelha no Google Agenda em segundo plano (silencioso; nunca bloqueia o salvamento).
      void sincronizarComGoogle(a);
    } catch {
      vibrar('erro');
      toast.erro('Não foi possível salvar o agendamento agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(e: EditState) {
    if (!e.id) return;
    const id = e.id;
    const nome = e.titulo.trim() || TIPO_AGENDAMENTO_LABELS[e.tipo];

    // Série: pergunta o alcance. "Só esta" e "esta e as próximas" cancelam as
    // ocorrências (somem da agenda); "toda a série" vai para a Lixeira.
    if (e.ocorrenciaId) {
      const alcance = await alcanceForm.perguntar({
        titulo: `Excluir "${nome}"?`,
        opcoes: ['so_esta', 'esta_e_proximas', 'toda_serie'],
        destrutivo: true,
        rotulos: {
          so_esta: { titulo: 'Só esta visita', detalhe: 'Ela sai da agenda; as outras repetições continuam.' },
          esta_e_proximas: { titulo: 'Esta e as próximas', detalhe: 'A série termina antes desta visita.' },
          toda_serie: { titulo: 'Toda a série', detalhe: `Vai para a Lixeira. Dá para restaurar por ${DIAS_RETENCAO_LIXEIRA} dias.` },
        },
      });
      if (!alcance) return;
      setSalvando(true);
      try {
        const antes = await getAgendamento(id);
        if (!antes) throw new Error('Agendamento não encontrado neste aparelho.');
        if (alcance === 'toda_serie') await deleteAgendamento(id);
        else await editarRecorrente(e.ocorrenciaId, alcance, { cancelar: true });
        vibrar('aviso');
        setEditing(null);
        await load();
        toast.sucesso(alcance === 'toda_serie' ? 'Série movida para a Lixeira.' : alcance === 'so_esta' ? 'Visita tirada da agenda.' : 'A série termina antes desta visita.', {
          acao: { rotulo: 'Desfazer', aoTocar: () => { void desfazerPara(antes, 'Exclusão desfeita.'); } },
        });
        if (alcance === 'toda_serie' && googleDisponivel && googleConectado) void deleteEventoGoogle(antes).catch(() => {});
      } catch (err) {
        vibrar('erro');
        toast.erro(err instanceof Error && err.message ? err.message : 'Não foi possível excluir agora. Tente novamente.');
      } finally {
        setSalvando(false);
      }
      return;
    }

    // Um toque apagava. Agora pergunta, diz para onde vai e deixa desfazer.
    const ok = await confirmar({
      titulo: 'Excluir agendamento?',
      mensagem: `"${nome}" vai para a Lixeira. Dá para restaurar por ${DIAS_RETENCAO_LIXEIRA} dias.`,
      destrutivo: true,
    });
    if (!ok) return;
    setSalvando(true);
    try {
      const antes = await getAgendamento(id);
      await deleteAgendamento(id);
      vibrar('aviso');
      setEditing(null);
      await load();
      toast.sucesso('Movido para a Lixeira.', antes ? {
        acao: { rotulo: 'Desfazer', aoTocar: () => { void desfazerPara(antes, 'Compromisso de volta na agenda.'); } },
      } : undefined);
      // Remove o espelho no Google Agenda em segundo plano (silencioso).
      if (antes && googleDisponivel && googleConectado) void deleteEventoGoogle(antes).catch(() => {});
    } catch {
      vibrar('erro');
      toast.erro('Não foi possível excluir o agendamento agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  // ARRASTAR PARA REMARCAR (visão Dia): mesmo dia, encaixe de 15 min. Pergunta
  // antes de gravar (série: o alcance; avulso: sim/não), avisa conflito do mesmo
  // técnico e deixa desfazer. Resolve `false` se não remarcou (o bloco volta).
  async function remarcarArrastando(item: OcorrenciaAgendamento, novoIniMin: number): Promise<boolean> {
    const novo = remarcarNoDia(item, novoIniMin);
    if (!novo) return false;
    const horaTxt = minutosParaHHMM(novoIniMin);
    let aviso = '';
    try {
      const conflitos = encontrarConflitosPorTecnico(
        itensVisiveis.filter(a => !semHoraMarcada(a)),
        { inicio: novo.inicio, fim: novo.fim, tipo: item.tipo, responsavelId: item.responsavelId, ignorarId: item.id },
      );
      if (conflitos.length) {
        const c = conflitos[0];
        aviso = ` Atenção: colide com "${c.titulo}" das ${hhmm(c.inicio)}${c.fim ? `–${hhmm(c.fim)}` : ''}${conflitos.length > 1 ? ` e mais ${conflitos.length - 1}` : ''}.`;
      }
    } catch {
      aviso = ' Não deu para checar conflitos de horário.';
    }
    const de = semHoraMarcada(item) ? 'dia todo' : hhmm(item.inicio);
    try {
      if (item.recorrencia) {
        const alcance = await alcanceTela.perguntar({
          titulo: `Remarcar para ${horaTxt}?`,
          mensagem: `"${item.titulo}" sai das ${de} e vai para as ${horaTxt}, no mesmo dia.${aviso}`,
          opcoes: ['so_esta', 'esta_e_proximas', 'toda_serie'],
        });
        if (!alcance) return false;
        const antes = await getAgendamento(idBaseDaOcorrencia(item.id));
        if (!antes) throw new Error('Agendamento não encontrado neste aparelho.');
        const plano = await editarRecorrente(item.id, alcance, novo.fim ? { inicio: novo.inicio, fim: novo.fim } : { inicio: novo.inicio });
        vibrar('sucesso');
        await load();
        // "Esta e as próximas" cria uma série nova: desfazer exigiria apagá-la, então fica sem botão.
        toast.sucesso(`Remarcado para ${horaTxt}.`, alcance === 'esta_e_proximas' ? undefined : {
          acao: { rotulo: 'Desfazer', aoTocar: () => { void desfazerPara(antes, 'Horário de volta ao de antes.'); } },
        });
        void sincronizarComGoogle(plano.base);
        if (plano.novaSerie) void sincronizarComGoogle(plano.novaSerie);
        return true;
      }
      const ok = await confirmar({
        titulo: `Remarcar para ${horaTxt}?`,
        mensagem: `"${item.titulo}" sai das ${de} e vai para as ${horaTxt}, no mesmo dia.${aviso}`,
        rotuloConfirmar: 'Remarcar',
      });
      if (!ok) return false;
      const antes = await getAgendamento(item.id);
      if (!antes || antes.excluidoEm) throw new Error('Este compromisso não está mais neste aparelho. Puxe a lista para atualizar.');
      const atualizado: Agendamento = { ...antes, inicio: novo.inicio, fim: novo.fim, atualizadoEm: nowISO() };
      await saveAgendamento(atualizado);
      vibrar('sucesso');
      await load();
      toast.sucesso(`Remarcado para ${horaTxt}.`, {
        acao: { rotulo: 'Desfazer', aoTocar: () => { void desfazerPara(antes, 'Horário de volta ao de antes.'); } },
      });
      void sincronizarComGoogle(atualizado);
      return true;
    } catch (err) {
      vibrar('erro');
      toast.erro(err instanceof Error && err.message ? err.message : 'Não foi possível remarcar agora. Tente novamente.');
      return false;
    }
  }

  // Dois estados de "vazio" distintos: dia sem NENHUM agendamento (mostra o
  // CTA "Agendar visita") vs. dia com itens mas o FILTRO escondeu todos
  // (mostra um jeito de limpar o filtro, não repete o CTA de criar).
  const semAgendamentosNoPeriodo = itensVisiveis.length === 0;
  const semAgendamentosNoDia = itensDoDiaSemFiltro.length === 0;
  const semResultadoDoFiltro = !semAgendamentosNoDia && itensDoDia.length === 0;

  // Identidade do período visível. Muda ao navegar (‹ ›) ou trocar de visão;
  // usada como parte da key dos itens para re-disparar a entrada animada,
  // sinalizando a troca de contexto sem re-renderizar a cada frame.
  const periodoKey = `${visao}:${inicio.getTime()}:${startOfDay(ref).getTime()}`;
  const paddingLista = insets.bottom + 120;
  const podeArrastar = useCallback((a: OcorrenciaAgendamento) => (
    escopo.status !== 'erro' && escopo.status !== 'carregando' && a.status !== 'cancelado' && !semHoraMarcada(a)
  ), [escopo.status]);

  const subtitulo = visao === 'dia'
    ? `${plural(itensDoDia.length, 'compromisso', 'compromissos')}${escopo.status === 'propria' ? (itensDoDia.length === 1 ? ' seu' : ' seus') : ''} em ${format(ref, "d 'de' MMM", { locale: ptBR })}`
    : `${plural(itensFiltrados.length, 'compromisso', 'compromissos')} ${visao === 'semana' ? 'nesta semana' : 'neste mês'}`;

  const mostrarFab = !carregando && !carregandoErro && escopo.status !== 'erro' && escopo.status !== 'carregando'
    && !(visao === 'dia' && semAgendamentosNoDia)
    && !(visao === 'semana' && semAgendamentosNoPeriodo);

  // ─── Pedaços da tela ──────────────────────────────────────────────────────
  const faixaSemana = (
    <View style={styles.calendarCard}>
      <View style={styles.weekStrip}>
        {diasSemana.map(dia => {
          const selecionado = isSameDay(dia, ref);
          const resumo = resumoPorDia.get(format(dia, 'yyyy-MM-dd'));
          const quantidade = resumo?.qtd ?? 0;
          return (
            <TouchableOpacity
              key={dia.toISOString()}
              style={[styles.weekDay, selecionado && styles.weekDaySelected]}
              onPress={() => selecionarDia(dia)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityState={{ selected: selecionado }}
              accessibilityLabel={`${format(dia, "EEEE, d 'de' MMMM", { locale: ptBR })}${quantidade ? `, ${plural(quantidade, 'compromisso', 'compromissos')}` : ', sem compromissos'}`}
            >
              <Text style={[styles.weekDayName, selecionado && styles.weekDayTextSelected]}>
                {format(dia, 'EEEEE', { locale: ptBR }).toUpperCase()}
              </Text>
              <Text style={[styles.weekDayNumber, isToday(dia) && styles.weekDayToday, selecionado && styles.weekDayTextSelected]}>
                {format(dia, 'd')}
              </Text>
              <View style={styles.dayMarkers}>
                {(resumo?.cores ?? []).map(cor => (
                  <View key={cor} style={[styles.dayMarker, { backgroundColor: cor }, selecionado && styles.dayMarkerRing]} />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const gradeMes = (
    <View style={[styles.calendarCard, { marginHorizontal: 0, marginTop: 0 }]}>
      <View style={styles.monthWeekNames}>
        {['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].map(nome => (
          <Text key={nome} style={styles.monthWeekName}>{nome}</Text>
        ))}
      </View>
      <View style={styles.monthGrid}>
        {diasMes.map(dia => {
          const selecionado = isSameDay(dia, ref);
          const dentroDoMes = isSameMonth(dia, ref);
          const resumo = resumoPorDia.get(format(dia, 'yyyy-MM-dd'));
          const quantidade = dentroDoMes ? resumo?.qtd ?? 0 : 0;
          return (
            <View key={dia.toISOString()} style={styles.monthDayCell}>
              <TouchableOpacity
                style={[styles.monthDay, selecionado && styles.monthDaySelected]}
                onPress={() => selecionarDia(dia)}
                onLongPress={() => selecionarDia(dia, true)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityState={{ selected: selecionado }}
                accessibilityHint="Toque e segure para abrir o dia"
                accessibilityLabel={`${format(dia, "EEEE, d 'de' MMMM", { locale: ptBR })}${quantidade ? `, ${plural(quantidade, 'compromisso', 'compromissos')}` : ', sem compromissos'}`}
              >
                <Text style={[
                  styles.monthDayText,
                  !dentroDoMes && styles.monthDayOutside,
                  isToday(dia) && styles.monthDayToday,
                  selecionado && styles.monthDayTextSelected,
                ]}>
                  {format(dia, 'd')}
                </Text>
                {dentroDoMes && resumo ? (
                  <View style={styles.monthMarkers}>
                    {resumo.cores.map(cor => <View key={cor} style={[styles.monthMarker, { backgroundColor: cor }]} />)}
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );

  const listaDoDia = (comCabecalho: boolean) => (
    <>
      {comCabecalho ? (
        <View style={styles.dayHeader}>
          <Text style={[styles.dayHeaderTitle, isToday(ref) && { color: cores.accentLight }]}>
            {capitalizeFirst(format(ref, "EEEE, d 'de' MMMM", { locale: ptBR }))}
          </Text>
          {isToday(ref) && <View style={styles.todayDot} />}
          <View style={{ flex: 1 }} />
          {itensDoDia.length > 0 ? (
            <TouchableOpacity onPress={() => selecionarDia(ref, true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
              <Text style={styles.linkPequeno}>Ver o dia</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {itensDoDia.length === 0 ? (
        <Text style={styles.livreTexto}>
          {semResultadoDoFiltro ? 'Nada com os filtros escolhidos neste dia.' : 'Dia livre.'}
        </Text>
      ) : itensDoDia.map((a, index) => (
        <AnimatedEntrance key={`${periodoKey}:${a.id}`} index={index + 1}>
          <AgendaItem item={a} cor={corDe(a)} cliente={clienteDe(a)} clientes={clientes} aoRemarcado={load} onPress={() => { void abrirItem(a); }} />
        </AnimatedEntrance>
      ))}
    </>
  );

  function conteudo() {
    if (carregando || escopo.status === 'carregando') {
      return (
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
      );
    }
    if (escopo.status === 'erro') {
      // Não sei o papel: nem "agenda vazia" (o técnico acharia que não tem
      // visita) nem a agenda da equipe inteira (não sei se ele pode ver).
      // Puxar para atualizar aqui também relê o papel (senão só sincronizaria e
      // a tela continuaria presa neste aviso).
      return (
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
      );
    }
    if (carregandoErro) {
      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
          <EmptyState
            icon="alert-circle-outline"
            title="Não deu para carregar"
            subtitle="Não conseguimos buscar seus agendamentos agora. Verifique a conexão e tente de novo."
            actionLabel="Tentar de novo"
            onAction={() => { void refresh(); }}
          />
        </ScrollView>
      );
    }

    if (visao === 'mes') {
      return (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: paddingLista }}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          onScroll={aoRolar}
          scrollEventThrottle={16}
        >
          {gradeMes}
          <View style={{ height: Spacing.base }} />
          {listaDoDia(true)}
        </ScrollView>
      );
    }

    if (visao === 'semana') {
      if (semAgendamentosNoPeriodo) {
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
            <EmptyState
              icon="calendar-blank-outline"
              title="Semana livre"
              subtitle="Nenhum compromisso nesta semana. Puxe para baixo para buscar da nuvem, ou agende uma visita."
              actionLabel="Agendar visita"
              onAction={() => abrirNovo()}
            />
          </ScrollView>
        );
      }
      return (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: paddingLista }}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          onScroll={aoRolar}
          scrollEventThrottle={16}
        >
          {diasSemana.map((dia, iDia) => {
            const doDia = ordenarDoDia(resumoPorDia.get(format(dia, 'yyyy-MM-dd'))?.itens ?? []);
            return (
              <AnimatedEntrance key={`${periodoKey}:${dia.toISOString()}`} index={Math.min(iDia, 6)}>
                <View style={styles.semanaDia}>
                  <TouchableOpacity
                    style={styles.dayHeader}
                    onPress={() => selecionarDia(dia, true)}
                    accessibilityRole="button"
                    accessibilityLabel={`${format(dia, "EEEE, d 'de' MMMM", { locale: ptBR })}. Abrir o dia`}
                  >
                    <Text style={[styles.dayHeaderTitle, isToday(dia) && { color: cores.accentLight }]}>
                      {capitalizeFirst(format(dia, "EEEE, d 'de' MMM", { locale: ptBR }))}
                    </Text>
                    {isToday(dia) && <View style={styles.todayDot} />}
                    <View style={{ flex: 1 }} />
                    <Text style={styles.semanaContagem}>{doDia.length ? plural(doDia.length, 'compromisso', 'compromissos') : 'Livre'}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={cores.onSurfaceMuted} />
                  </TouchableOpacity>
                  {doDia.map(a => (
                    <AgendaItem key={a.id} item={a} cor={corDe(a)} cliente={clienteDe(a)} clientes={clientes} aoRemarcado={load} onPress={() => { void abrirItem(a); }} />
                  ))}
                </View>
              </AnimatedEntrance>
            );
          })}
        </ScrollView>
      );
    }

    // DIA
    if (semAgendamentosNoDia) {
      // Também com "puxar para atualizar": é aqui que o técnico espera a visita
      // recém-atribuída aparecer.
      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
          <EmptyState
            icon="calendar-blank-outline"
            title="Este dia está livre"
            subtitle={`Não há compromissos em ${format(ref, "d 'de' MMMM", { locale: ptBR })}. Puxe para baixo para buscar da nuvem, ou agende uma visita agora.`}
            actionLabel="Agendar visita"
            onAction={() => abrirNovo()}
          />
        </ScrollView>
      );
    }
    if (semResultadoDoFiltro) {
      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
          <EmptyState
            icon="filter-remove-outline"
            title="Nada com esse filtro"
            subtitle="Ajuste os filtros acima para ver os compromissos deste dia."
            actionLabel="Limpar filtros"
            onAction={limparFiltros}
          />
        </ScrollView>
      );
    }
    return (
      <GradeDia
        key={format(ref, 'yyyy-MM-dd')}
        dia={ref}
        itens={itensDoDia}
        corDe={corDe}
        onAbrir={(a) => { void abrirItem(a); }}
        onRemarcar={remarcarArrastando}
        podeArrastar={podeArrastar}
        refreshControl={refreshControl}
        onScroll={aoRolar}
        paddingInferior={paddingLista}
        cabecalho={<ClimaProximasVisitas itens={itensDoDia} clientes={clientes} aoRemarcado={load} />}
      />
    );
  }

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
        subtitle={subtitulo}
        right={
          <TouchableOpacity
            style={styles.todayBtn}
            onPress={() => { vibrar('selecao'); setRef(new Date()); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Ir para hoje"
          >
            <Text style={[styles.todayBtnText, { color: gradientes.sobreHeader }]}>Hoje</Text>
          </TouchableOpacity>
        }
      >
        {/* NAV ‹ período › — está DENTRO do GradientHeader, então a cor vem do
            gradiente, não da superfície (`sobreHeader` dá contraste nas duas pontas). */}
        <View style={styles.navRow}>
          <TouchableOpacity style={styles.navBtn} onPress={() => passo(-1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel={visao === 'dia' ? 'Dia anterior' : visao === 'semana' ? 'Semana anterior' : 'Mês anterior'}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={gradientes.sobreHeader} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navLabelBtn}
            onPress={() => { vibrar('selecao'); setIrParaData(true); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${rotuloPeriodo(visao, ref)}. Escolher outra data`}
          >
            <Text style={[styles.navLabel, { color: gradientes.sobreHeader }]}>{rotuloPeriodo(visao, ref)}</Text>
            <MaterialCommunityIcons name="calendar-search" size={16} color={gradientes.sobreHeader} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => passo(1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel={visao === 'dia' ? 'Próximo dia' : visao === 'semana' ? 'Próxima semana' : 'Próximo mês'}>
            <MaterialCommunityIcons name="chevron-right" size={24} color={gradientes.sobreHeader} />
          </TouchableOpacity>
        </View>
        <SeletorVisao valor={visao} onChange={trocarVisao} corTexto={gradientes.sobreHeader} />
      </GradientHeader>

      {/* FAIXA DA SEMANA — navegação rápida entre os dias na visão Dia. */}
      {visao === 'dia' ? faixaSemana : null}

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

      {/* DICA (1º uso) — as três visões e o arrastar. */}
      {/* Sem padding vertical: ver ClientesScreen (wrapper vazio deixaria vao). */}
      <View style={{ paddingHorizontal: Spacing.base }}>
        <DicaContextual
          id="agenda.visoes"
          icon="gesture-swipe-vertical"
          texto="Troque entre Dia, Semana e Mês no topo. No Dia, segure um compromisso e arraste para mudar o horário."
        />
      </View>

      {/* FILTROS — uma linha só: "Filtros" abre os chips (tipo, status e técnico).
          Antes eram 3 fileiras fixas que empurravam a lista para baixo do botão. */}
      {!carregando && !carregandoErro && escopo.status !== 'erro' && !semAgendamentosNoPeriodo && (
        <View style={styles.filtrosLinha}>
          <PressableAnimado
            style={[styles.filtrosBtn, (filtrosAbertos || filtrosAtivos > 0) && styles.filtrosBtnAtivo]}
            onPress={() => { vibrar('selecao'); setFiltrosAbertos(v => !v); }}
            accessibilityLabel={`Filtros${filtrosAtivos ? `, ${filtrosAtivos} ativo${filtrosAtivos === 1 ? '' : 's'}` : ''}`}
            accessibilityState={{ expanded: filtrosAbertos }}
          >
            <MaterialCommunityIcons name="tune-variant" size={16} color={cores.accentLight} />
            <Text style={styles.filtrosBtnTexto}>Filtros{filtrosAtivos ? ` · ${filtrosAtivos}` : ''}</Text>
            <MaterialCommunityIcons name={filtrosAbertos ? 'chevron-up' : 'chevron-down'} size={16} color={cores.onSurfaceMuted} />
          </PressableAnimado>
          {filtrosAtivos > 0 ? (
            <TouchableOpacity onPress={limparFiltros} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
              <Text style={styles.linkPequeno}>Limpar</Text>
            </TouchableOpacity>
          ) : null}
          {corPorTecnico ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.legenda}>
              {equipe.estado.status === 'ok' && equipe.estado.membros.map(m => (
                <View key={m.userId} style={styles.legendaItem}>
                  <View style={[styles.legendaBolinha, { backgroundColor: corDoTecnico(m.userId, ordemEquipe) }]} />
                  <Text style={styles.legendaTexto} numberOfLines={1}>{m.nome.split(' ')[0]}</Text>
                </View>
              ))}
            </ScrollView>
          ) : null}
        </View>
      )}
      {filtrosAbertos && !carregando && !carregandoErro && escopo.status !== 'erro' && !semAgendamentosNoPeriodo && (
        <View style={{ paddingHorizontal: Spacing.base }}>
          {chipsTecnico.length > 0 && (
            <ChipsFiltro<FiltroResponsavel> itens={chipsTecnico} selecionado={filtroTecnico} aoSelecionar={setFiltroTecnico} />
          )}
          <ChipsFiltro<FiltroTipoAgenda> itens={chipsTipo} selecionado={filtroTipo} aoSelecionar={setFiltroTipo} />
          <ChipsFiltro<FiltroStatusAgenda> itens={chipsStatus} selecionado={filtroStatus} aoSelecionar={setFiltroStatus} />
        </View>
      )}

      {conteudo()}

      {/* FAB Agendar visita — some ao rolar para baixo e volta ao rolar para cima
          (antes ficava parado em cima do texto do último card). Oculto quando a
          tela já mostra o CTA no centro (dia/semana vazios) ou um erro. */}
      {mostrarFab && (
        <Reanimated.View style={[styles.fabWrap, { bottom: insets.bottom + 20 }, estiloFab]} pointerEvents="box-none">
          {/* haptic={false}: abrirNovo() já vibra (leve) — não dobrar o retorno. */}
          <OlliPressable style={styles.fab} onPress={() => abrirNovo()} haptic={false} accessibilityLabel="Agendar visita">
            <MaterialCommunityIcons name="calendar-plus" size={20} color={textoSobre(cores.accentLight)} />
            <Text style={styles.fabText}>Agendar visita</Text>
          </OlliPressable>
        </Reanimated.View>
      )}

      {/* "Só esta / esta e as próximas / toda a série" do ARRASTAR (fora do form). */}
      <FolhaAlcanceSerie pedido={alcanceTela.pedido} onResposta={alcanceTela.responder} />

      {/* FORM MODAL */}
      <Modal visible={!!editing} animationType="slide" onRequestClose={() => {
        if (alcanceForm.pedido) { alcanceForm.responder(null); return; }
        if (voltarDoForm.current?.()) return;
        setEditing(null);
      }} transparent={false}>
        {editing && (
          <AgendamentoForm
            state={editing}
            clientes={clientes}
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
        {/* Dentro do Modal do formulário (no iOS um Modal não abre por cima de outro). */}
        <FolhaAlcanceSerie embutida pedido={alcanceForm.pedido} onResposta={alcanceForm.responder} />
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
          if (date) selecionarDia(date, visao === 'semana');
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
function AgendaItem({ item, cor: corMarca, cliente, clientes, aoRemarcado, onPress }: {
  item: OcorrenciaAgendamento;
  cor: string;
  /** Cadastro do cliente (ponto para o clima). */
  cliente: Cliente | null;
  clientes: Cliente[];
  aoRemarcado: () => void;
  onPress: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  // O matiz identifica o tipo; a luminosidade cede contra o fundo REAL do chip
  // (o próprio matiz a 13% sobre a superfície). Cru, media 1.72–4.19:1 no claro.
  const cor = corCategoriaEmChip(TIPO_AGENDAMENTO_COLORS[item.tipo], cores.surface);
  const corChip = TIPO_AGENDAMENTO_COLORS[item.tipo];
  const iniTxt = hhmm(item.inicio);
  const fimTxt = item.fim ? hhmm(item.fim) : '';
  const cancelado = item.status === 'cancelado';
  const concluido = item.status === 'concluido';
  // Sem hora marcada (o painel grava meia-noite e sem fim): "Dia todo", não "00:00".
  const diaTodo = semHoraMarcada(item);
  return (
    <OlliPressable style={[styles.item, (cancelado || concluido) && { opacity: 0.72 }]} onPress={onPress} haptic="selection" accessibilityLabel={`Agendamento ${item.titulo}, ${diaTodo ? 'dia todo' : `às ${iniTxt}`}${concluido ? ', concluído' : cancelado ? ', cancelado' : ''}`}>
      {/* Barra: a cor do técnico (com equipe) ou do tipo (sem equipe). */}
      <View style={[styles.itemBar, { backgroundColor: corMarca }]} />
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
        {/* CLIMA — só nas visitas das próximas 12h (some sozinho no resto). */}
        <ClimaDaVisita visita={item} cliente={cliente} clientes={clientes} aoRemarcado={aoRemarcado} style={styles.itemClima} />
        {/* CONFIRMAÇÃO DE VÉSPERA (Onda I3): selo só quando há pedido para o horário atual. */}
        {item.status === 'agendado' ? <SeloConfirmacao visita={item} style={styles.itemClima} /> : null}
        {item.status !== 'agendado' && (
          <View style={styles.statusLinha}>
            <MaterialCommunityIcons name={concluido ? 'check-circle' : 'close-circle'} size={13} color={concluido ? cores.success : cores.danger} />
            <Text style={[styles.statusText, concluido ? { color: cores.success } : { color: cores.danger }]}>
              {STATUS_AGENDAMENTO_LABELS[item.status]}
            </Text>
          </View>
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
  /**
   * Visita de SÉRIE aberta a partir de uma ocorrência: o id dela (`<base>@<dia>`,
   * ou o da base na 1ª) e como ela ESTAVA ao abrir — o salvar compara com isto
   * para mandar só o que mudou, no alcance escolhido (`editarRecorrente`).
   */
  ocorrenciaId?: string;
  original?: EstadoOcorrencia;
  /**
   * Serviço externo (pega chuva). `undefined` = "Não sei" — e o formulário SEMPRE
   * manda a chave para o save (escolha explícita), nunca "interna" por omissão.
   */
  externa?: boolean;
}

/** O formulário como ele seria gravado (mesma montagem para o "antes" e o "depois"). */
function montarAgendamento(e: EditState, meuId?: string): { agendamento: Agendamento } | { erro: string } {
  if (!e.horaInicio && e.horaFim) {
    return { erro: 'Escolha o horário de início, ou tire o horário de fim para o compromisso ficar como "Dia todo".' };
  }
  const ini = combinarDataHora(e.data, e.horaInicio);
  const fimDt = e.horaFim ? combinarDataHora(e.data, e.horaFim) : undefined;
  // Valida só quando ambos os horários existem: o fim precisa ser depois do início.
  if (fimDt && fimDt <= ini) return { erro: 'O horário de fim deve ser depois do horário de início.' };
  const recorrenciaAte = e.recorrencia && e.recorrenciaAteBR.trim() ? brToISO(e.recorrenciaAteBR) : '';
  if (e.recorrencia && e.recorrenciaAteBR.trim() && !recorrenciaAte) {
    return { erro: 'Confira a data de "Repetir até" (dd/mm/aaaa) ou deixe em branco.' };
  }
  // Técnico: o compromisso é sempre dele (sem seletor na tela). Sem isto, um
  // agendamento aberto antes do papel carregar sairia sem responsável e sumiria.
  const responsavelId = e.responsavelId ?? meuId;
  return {
    agendamento: {
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
      // Chave sempre presente: o formulário conhece o campo ("Não sei" grava NULL).
      externa: e.externa,
    },
  };
}

function estadoDaOcorrencia(a: Agendamento): EstadoOcorrencia {
  return {
    inicio: a.inicio, fim: a.fim, status: a.status, titulo: a.titulo, observacao: a.observacao,
    responsavelId: a.responsavelId, responsavelNome: a.responsavelNome, tipo: a.tipo,
    clienteId: a.clienteId, clienteNome: a.clienteNome, endereco: a.endereco,
    recorrencia: a.recorrencia, recorrenciaAte: a.recorrenciaAte, externa: a.externa,
  };
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
  state, clientes, podeEscolherResponsavel, equipe, voltarRef, salvando, onChange, onClose, onSave, onDelete, onAbrirOrcamento, onVerCliente,
}: {
  state: EditState;
  clientes: Cliente[];
  /** Gestão/conta pessoal escolhe o técnico; o técnico agenda só para si. */
  podeEscolherResponsavel: boolean;
  /** Equipe já carregada pela tela (o seletor não lê de novo). */
  equipe: ReturnType<typeof useEquipeResponsaveis>;
  /** A tela pergunta aqui, no voltar do Android, se o form fechou uma camada interna. */
  voltarRef?: React.MutableRefObject<(() => boolean) | null>;
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

  // ENCAIXE INTELIGENTE — só ao AGENDAR (visita nova) um cliente cadastrado:
  // horários perto de onde o técnico já vai estar nos próximos 7 dias.
  const clienteSel = useMemo(() => (state.clienteId ? clientes.find(c => c.id === state.clienteId) ?? null : null), [clientes, state.clienteId]);
  const mostrarEncaixe = !state.id && !!clienteSel;
  const encaixe = useEncaixe({
    cliente: clienteSel,
    ativo: mostrarEncaixe,
    duracaoMin: duracaoEstimadaMin(state.tipo),
    responsavelId: state.responsavelId,
    clientes,
  });
  function usarEncaixe(inicioISO: string, fimISO: string) {
    vibrar('selecao');
    const ini = new Date(inicioISO);
    const fimEnc = new Date(fimISO);
    if (isNaN(ini.getTime())) return;
    set({
      data: ini,
      horaInicio: format(ini, 'HH:mm'),
      horaFim: isNaN(fimEnc.getTime()) ? '' : format(fimEnc, 'HH:mm'),
      fimAutomatico: true,
    });
    toast.info(`Encaixado: ${format(ini, "EEEE, d 'de' MMM 'às' HH:mm", { locale: ptBR })}. Confira e confirme.`);
  }
  // "Serviço externo?" — sugestão pelo título/observação (o prestador confirma).
  const sugestaoExterna = useMemo(
    () => sugerirVisitaExterna({ titulo: state.titulo, observacao: state.observacao }),
    [state.titulo, state.observacao],
  );

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

  // CONFLITO REAL (2.9) — aviso NÃO-BLOQUEANTE, por TÉCNICO e pela DURAÇÃO (sem
  // fim = duração do tipo). Lê o DIA escolhido do banco (com as séries): antes só
  // olhava o período aberto na tela e ficava cego para outro dia. Três estados —
  // "não deu para checar" nunca vira "horário livre".
  const diaChave = format(state.data, 'yyyy-MM-dd');
  const [doDia, setDoDia] = useState<{ status: 'carregando' } | { status: 'ok'; itens: OcorrenciaAgendamento[] } | { status: 'erro' }>({ status: 'carregando' });
  // biome-ignore lint/correctness/useExhaustiveDependencies: relê só quando o DIA muda (diaChave), não a cada minuto editado.
  useEffect(() => {
    let vivo = true;
    setDoDia({ status: 'carregando' });
    getAgendamentosDoDia(state.data)
      // "Dia todo" não ocupa horário (a meia-noite dele não é uma visita às 00:00).
      .then(l => { if (vivo) setDoDia({ status: 'ok', itens: l.filter(a => !semHoraMarcada(a)) }); })
      .catch(() => { if (vivo) setDoDia({ status: 'erro' }); });
    return () => { vivo = false; };
  }, [diaChave]);
  const conflitos = useMemo(() => {
    if (!state.horaInicio || doDia.status !== 'ok') return [];
    try {
      const ini = combinarDataHora(state.data, state.horaInicio);
      const fimDt = state.horaFim ? combinarDataHora(state.data, state.horaFim) : undefined;
      return encontrarConflitosPorTecnico(doDia.itens, {
        inicio: ini,
        fim: fimDt,
        tipo: state.tipo,
        responsavelId: state.responsavelId,
        // Editando: o próprio item (e a série dele) não conflita consigo.
        ignorarId: state.ocorrenciaId ?? state.id,
      });
    } catch {
      return [];
    }
  }, [doDia, state.data, state.horaInicio, state.horaFim, state.tipo, state.responsavelId, state.ocorrenciaId, state.id]);
  const conflito = conflitos[0] ?? null;

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
        <Text style={styles.formTitle}>{state.ocorrenciaId ? 'Editar visita' : state.id ? 'Editar agendamento' : 'Agendar visita'}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
          <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
        {state.ocorrenciaId ? (
          <View style={styles.avisoSerie}>
            <MaterialCommunityIcons name="repeat" size={16} color={cores.accentLight} />
            <Text style={styles.avisoSerieTexto}>
              Visita que repete {rotuloRecorrencia(state.original?.recorrencia ?? state.recorrencia)}. Ao salvar, você escolhe se a mudança vale só para ela, para ela e as próximas, ou para a série toda.
            </Text>
          </View>
        ) : null}
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
        {mostrarEncaixe ? (
          <View style={{ marginTop: Spacing.md }}>
            <SugestaoEncaixe resultado={encaixe} onEscolher={(s) => usarEncaixe(s.inicio, s.fim)} />
          </View>
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
          <View style={styles.avisoConflito} accessibilityRole="alert">
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={cores.warning} />
            <Text style={styles.avisoConflitoText}>
              {state.responsavelNome ? `${state.responsavelNome} já tem` : 'Já existe'} "{conflito.titulo}" das {hhmm(conflito.inicio)}
              {conflito.fim ? `–${hhmm(conflito.fim)}` : ''}
              {conflitos.length > 1 ? ` e mais ${conflitos.length - 1} compromisso${conflitos.length - 1 === 1 ? '' : 's'}` : ''} nesse horário. Dá para salvar assim mesmo.
            </Text>
          </View>
        )}
        {doDia.status === 'erro' && state.horaInicio ? (
          <Text style={[styles.ajuda, { marginTop: 0, marginBottom: Spacing.sm }]}>
            Não deu para checar se esse horário colide com outro compromisso.
          </Text>
        ) : null}
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

        {/* SERVIÇO EXTERNO? — liga o "Remarcar por chuva" (3 estados: "Não sei" ≠ interna). */}
        <View style={{ marginTop: -Spacing.base, marginBottom: Spacing.base }}>
          <CampoVisitaExterna valor={state.externa} sugestao={sugestaoExterna} onChange={(externa) => set({ externa })} />
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
            <Text style={styles.deleteText}>{state.ocorrenciaId ? 'Excluir…' : 'Excluir agendamento'}</Text>
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
  weekDay: { flex: 1, minHeight: 62, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderWidth: 1, borderColor: 'transparent' },
  weekDaySelected: { backgroundColor: c.accentLight, borderColor: c.accentLight },
  weekDayName: { fontSize: 10, fontWeight: '800', color: c.onSurfaceMuted },
  weekDayNumber: { fontSize: 17, lineHeight: 22, fontWeight: '800', color: c.onSurface, marginTop: 2 },
  weekDayToday: { color: c.accentLight },
  weekDayTextSelected: { color: textoSobre(c.accentLight) },
  dayMarkers: { minHeight: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 4 },
  dayMarker: { width: 6, height: 6, borderRadius: 3 },
  // Bolinha sobre o dia selecionado (fundo accent): um aro da cor do texto para não sumir.
  dayMarkerRing: { borderWidth: 1, borderColor: textoSobre(c.accentLight) },
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
  monthMarkers: { position: 'absolute', bottom: 3, flexDirection: 'row', gap: 2 },
  monthMarker: { width: 5, height: 5, borderRadius: 3 },

  googleCard: { margin: Spacing.base, marginBottom: 0, backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.md, ...sombrasDe(c).sm },
  googleCardRow: { flexDirection: 'row', alignItems: 'center' },
  googleCardTitle: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  googleCardHint: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  googleCardFooter: { fontSize: 11.5, color: c.onSurfaceMuted, marginTop: 10 },

  // Cyan fixo (não segue a cor de marca escolhida): decorativo, sem chave semântica exata.
  routeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(52,198,217,0.12)', borderWidth: 1, borderColor: 'rgba(52,198,217,0.30)', justifyContent: 'center', alignItems: 'center', marginRight: 8 },

  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, minHeight: 32 },
  linkPequeno: { fontSize: 13, fontWeight: '800', color: c.accentLight },
  livreTexto: { fontSize: 13, color: c.onSurfaceMuted, marginBottom: 10 },
  semanaDia: { marginBottom: Spacing.sm },
  semanaContagem: { fontSize: 12, fontWeight: '700', color: c.onSurfaceMuted },

  filtrosLinha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.base, marginTop: 10, marginBottom: 2 },
  filtrosBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface },
  filtrosBtnAtivo: { borderColor: c.accentLight },
  filtrosBtnTexto: { fontSize: 13, fontWeight: '800', color: c.onSurface },
  legenda: { alignItems: 'center', gap: 10, paddingRight: 4 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 110 },
  legendaBolinha: { width: 8, height: 8, borderRadius: 4 },
  legendaTexto: { fontSize: 12, fontWeight: '700', color: c.onSurfaceVariant },
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
  statusLinha: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  itemClima: { marginTop: 8 },
  statusText: { fontSize: 12, fontWeight: '700' },
  strike: { textDecorationLine: 'line-through', color: c.onSurfaceMuted },

  fabWrap: { position: 'absolute', alignSelf: 'center' },
  fab: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 22, paddingVertical: 14, ...sombrasDe(c).glowCyan },
  fabText: { fontSize: 15, fontWeight: '800', color: textoSobre(c.accentLight) },

  // FORM
  formContainer: { flex: 1, backgroundColor: c.background },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.outline },
  formTitle: { fontSize: 20, fontWeight: '800', color: c.onSurface },
  ajuda: { fontSize: 12, color: c.onSurfaceMuted, marginTop: 6, lineHeight: 16 },
  avisoSerie: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, borderRadius: BorderRadius.md, padding: 10, marginBottom: Spacing.base },
  avisoSerieTexto: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 17 },

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
