import { formatarNumeroExibicao } from '../utils/numeroDocumento';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, Alert, RefreshControl, Animated, Modal, Pressable,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, BorderRadius, useCores, useGradientes, useEstilos, sombrasDe, comAlfa, sobreSecundario, type Cores } from '../theme';
import { OlliCard } from '../components/OlliCard';
import { GradientHeader } from '../components/GradientHeader';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { DicaContextual } from '../components/DicaContextual';
import { CountUp } from '../components/CountUp';
import { OlliButton } from '../components/OlliButton';
import {
  deleteOrcamento, saveOrcamento, getNextOrcamentoNumber, edicaoBloqueada,
  getOrcamentosPagina, getOrcamentosResumoFiltro, getOrcamentosIdsFiltro,
  getRecibos, getEmpresa,
  type FiltroOrcamentos,
} from '../database/database';
import { sincronizarStatusLinks } from '../services/clienteLink';
import { onSyncAplicado } from '../services/cloudSync';
import { DIAS_RETENCAO_LIXEIRA } from '../services/lixeira';
import { formatCurrency } from '../utils/currency';
import { formatDate } from '../utils/date';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { Empresa, Orcamento, Recibo, StatusOrcamento, STATUS_LABELS } from '../types';
import { generateId } from '../utils/id';
import { baseParaNovoDocumento, type ModoNovoDocumento } from '../utils/novoDocumento';
import { montarMensagemFollowUpOrcamento } from '../utils/mensagensOrcamento';
import { abrirWhatsApp } from '../utils/pdfGenerator';
import { FinanceiroBadge } from '../components/FinanceiroBadge';
import { getStatusFinanceiro } from '../services/pagamentos';
import { usePermissao } from '../hooks/usePermissao';

// Perf: com listas longas, animar a entrada (fade+slide) de CADA linha monta um
// Animated.Value + timing por item conforme a FlatList vai revelando novas
// células ao rolar. Só as primeiras N (janela inicial visível) ganham o efeito
// cascata — o resto aparece direto no estado final (idêntico ao fim da
// animação), sem gastar ciclos de JS thread em linhas que o usuário nem viu
// entrar. Mesmo motion de sempre (AnimatedEntrance já respeita reduced-motion).
const LIMITE_ANIMACAO_ENTRADA = 20;

// PAGINAÇÃO (item 1.18): a lista deixou de carregar getOrcamentos() completo
// (o HISTÓRICO INTEIRO) a cada foco/busca/filtro — em vez disso pede páginas
// de PAGE_SIZE ao SQLite (já filtradas em SQL) e vai concatenando conforme o
// usuário rola. O cabeçalho ("N orçamentos" + soma) usa um resumo AGREGADO
// separado (getOrcamentosResumoFiltro), que reflete o TOTAL do filtro mesmo
// antes de todas as páginas serem carregadas.
const PAGE_SIZE = 50;

/** Monta o filtro compartilhado (busca/status/cliente) a partir do estado atual da tela. */
function montarFiltro(query: string, statusFilter: StatusOrcamento | 'todos', clienteId?: string): FiltroOrcamentos {
  return {
    clienteId,
    status: statusFilter === 'todos' ? undefined : statusFilter,
    busca: query.trim() || undefined,
  };
}

/**
 * Ações visíveis no card, conforme o status (achado: "Recibo" aparecia em rascunho
 * e em recusado, e "Excluir" vermelho em todo card). O resto (Duplicar, Criar
 * revisão, Excluir) fica no menu ⋯.
 *   - Rascunho: Editar e Enviar;
 *   - Com o cliente (enviado/visualizado/em negociação/aguardando assinatura):
 *     Cobrar resposta;
 *   - Aprovado/convertido: Cobrar (se há saldo) e Recibo — só para quem vê valores;
 *   - Recusado/expirado/cancelado: Criar revisão.
 */
type AcaoLinha = 'editar' | 'enviar' | 'cobrar_resposta' | 'cobrar' | 'recibo' | 'revisar';

const COM_O_CLIENTE: StatusOrcamento[] = ['enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura'];

function acoesDaLinha(status: StatusOrcamento, opts: { podeFinanceiro: boolean; aReceber: boolean }): AcaoLinha[] {
  if (status === 'rascunho') return ['editar', 'enviar'];
  if (COM_O_CLIENTE.includes(status)) return ['cobrar_resposta'];
  if (status === 'aprovado' || status === 'convertido') {
    const acoes: AcaoLinha[] = [];
    if (opts.podeFinanceiro && opts.aReceber) acoes.push('cobrar');
    if (opts.podeFinanceiro) acoes.push('recibo');
    return acoes;
  }
  return ['revisar'];
}

interface LinhaOrcamentoProps {
  item: Orcamento;
  index: number;
  selecionando: boolean;
  marcado: boolean;
  onPress: (item: Orcamento) => void;
  onEditar: (item: Orcamento) => void;
  onRevisar: (item: Orcamento) => void;
  onCobrarResposta: (item: Orcamento) => void;
  onRecibo: (item: Orcamento) => void;
  onMenu: (item: Orcamento) => void;
  recibos: Recibo[];
  podeFinanceiro: boolean;
}

/**
 * Linha da lista de orçamentos — extraída do renderItem e memoizada (React.memo)
 * pra que um re-render da tela não force a
 * reconciliação de TODAS as linhas visíveis; só as que tiverem props realmente
 * diferentes (por exemplo `marcado`) re-renderizam de fato.
 */
function LinhaOrcamentoBase({
  item: o,
  index,
  selecionando,
  marcado,
  onPress,
  onEditar,
  onRevisar,
  onCobrarResposta,
  onRecibo,
  onMenu,
  recibos,
  podeFinanceiro,
}: LinhaOrcamentoProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const statusFin = podeFinanceiro ? getStatusFinanceiro(o, recibos) : null;
  const acoes = acoesDaLinha(o.status, {
    podeFinanceiro,
    aReceber: statusFin === 'aguardando_pagamento' || statusFin === 'parcial',
  });

  const conteudo = (
    <OlliCard
      onPress={() => onPress(o)}
      variant={selecionando && marcado ? 'selected' : 'default'}
      style={{ marginHorizontal: Spacing.base, marginBottom: 10 }}
    >
      <View style={styles.itemHeader}>
        {selecionando && (
          <MaterialCommunityIcons
            name={marcado ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={22}
            color={marcado ? cores.accent : cores.onSurfaceMuted}
            style={{ marginRight: 12, marginTop: 2 }}
          />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.itemNome} numberOfLines={1}>{o.clienteNome}</Text>
          <Text style={styles.itemMeta}>Nº {formatarNumeroExibicao(o.numero)} · {formatDate(o.criadoEm)}</Text>
          {o.revisaoDeNumero ? (
            <Text style={styles.revisaoMeta}>Revisão do nº {o.revisaoDeNumero}</Text>
          ) : o.editadoEm ? (
            <Text style={styles.revisaoMeta}>Editado em {formatDate(o.editadoEm)}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.itemValor}>{formatCurrency(o.valorTotal)}</Text>
          <StatusBadge status={o.status} size="sm" />
          {podeFinanceiro && <FinanceiroBadge status={statusFin} />}
        </View>
      </View>

      {/* Em modo de seleção as ações somem — o card inteiro vira alvo do toque. */}
      {!selecionando && (
        <View style={styles.itemActions}>
          {acoes.map(acao => {
            const meta = {
              editar: { icon: 'pencil-outline', label: 'Editar', cor: cores.primary, onPress: () => onEditar(o) },
              enviar: { icon: 'send-outline', label: 'Enviar', cor: cores.primary, onPress: () => onPress(o) },
              cobrar_resposta: { icon: 'whatsapp', label: 'Cobrar resposta', cor: cores.success, onPress: () => onCobrarResposta(o) },
              cobrar: { icon: 'cash-clock', label: 'Cobrar', cor: cores.success, onPress: () => onPress(o) },
              recibo: { icon: 'receipt', label: 'Recibo', cor: cores.success, onPress: () => onRecibo(o) },
              revisar: { icon: 'file-document-edit-outline', label: 'Criar revisão', cor: cores.primary, onPress: () => onRevisar(o) },
            }[acao] as { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; cor: string; onPress: () => void };
            return (
              <TouchableOpacity key={acao} style={styles.actionBtn} onPress={meta.onPress} accessibilityRole="button">
                <MaterialCommunityIcons name={meta.icon} size={16} color={meta.cor} />
                <Text style={[styles.actionLabel, { color: meta.cor }]}>{meta.label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionMenu]}
            onPress={() => onMenu(o)}
            accessibilityRole="button"
            accessibilityLabel={`Mais ações do orçamento nº ${formatarNumeroExibicao(o.numero)}`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={20} color={cores.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      )}
    </OlliCard>
  );

  // Cascata de entrada só nas primeiras linhas (ver LIMITE_ANIMACAO_ENTRADA) —
  // as demais aparecem direto no estado final, sem animação.
  return index < LIMITE_ANIMACAO_ENTRADA
    ? <AnimatedEntrance index={index}>{conteudo}</AnimatedEntrance>
    : conteudo;
}

const LinhaOrcamento = React.memo(LinhaOrcamentoBase);

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Orcamentos'>;

/**
 * Pill discreto "Sincronizando..." — some com fade sozinho depois de exibido.
 * Dá feedback visual de que a tela está de fato conectada à nuvem quando o
 * `onSyncAplicado` recarrega os dados em segundo plano (sem isso o usuário só
 * vê a lista "piscar" sem entender por quê).
 */
function SincronizandoPill({ onDone }: { onDone: () => void }) {
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
        name="cloud-sync-outline"
        size={13}
        color={cores.accent} // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 2.88:1 (7.25:1)
      />
      <Text style={styles.syncPillText}>Sincronizando...</Text>
    </Animated.View>
  );
}

// Derivado da fonte única e exaustiva (STATUS_LABELS, na ordem do type) — assim
// os 10 status ficam sempre cobertos e nenhum orçamento (ex.: "Visualizado",
// "Em negociação", "Expirado", "Convertido") fica preso só no filtro "Todos"
// quando a lista de status cresce. Mesmo padrão do STATUS_MANUAIS em
// VisualizarOrcamentoScreen. "Todos" continua como primeira opção.
const STATUS_FILTERS: Array<{ key: StatusOrcamento | 'todos'; label: string }> = [
  { key: 'todos', label: 'Todos' },
  ...(Object.keys(STATUS_LABELS) as StatusOrcamento[]).map(key => ({ key, label: STATUS_LABELS[key] })),
];

export default function OrcamentosScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const { pode: podePapel, carregando: carregandoPapel } = usePermissao();
  const podeFinanceiro = !carregandoPapel && podePapel('ver_valores_agregados');
  // Filtro por cliente (CRM): quando aberto a partir de um cliente.
  const [clienteId, setClienteId] = useState<string | undefined>(route.params?.clienteId);
  const clienteNome = route.params?.clienteNome;
  const [itens, setItens] = useState<Orcamento[]>([]);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [resumo, setResumo] = useState<{ contagem: number; valorTotal: number }>({ contagem: 0, valorTotal: 0 });
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusOrcamento | 'todos'>('todos');
  const [refreshing, setRefreshing] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  // Menu ⋯ do card (Duplicar, Editar/Criar revisão, Excluir).
  const [menuDe, setMenuDe] = useState<Orcamento | null>(null);
  // Empresa só para o contato no fim da mensagem de "Cobrar resposta" e para a
  // validade padrão do Duplicar. Leitura que falha = null (a mensagem sai sem a
  // linha de contato; a validade cai no padrão de 15 dias).
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  // Modo de seleção múltipla (exclusão em lote para a Lixeira).
  const [selecionando, setSelecionando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // itensRef: espelha `itens` p/ ler o tamanho atual (offset da próxima página)
  // sem depender de closure — evita reler `itens` como dependência e refazer
  // `carregarPagina` a cada página carregada. filtroRef: espelha
  // query/statusFilter/clienteId p/ o useFocusEffect e o onSync lerem o filtro
  // MAIS RECENTE sem precisar deles nas deps (senão cada tecla digitada
  // re-registraria o effect de foco). pedidoIdRef: descarta respostas de uma
  // busca/filtro já ultrapassado por um mais novo (corrida ao digitar rápido).
  const itensRef = useRef<Orcamento[]>([]);
  const filtroRef = useRef({ query: '', statusFilter: 'todos' as StatusOrcamento | 'todos', clienteId: undefined as string | undefined });
  filtroRef.current = { query, statusFilter, clienteId };
  const pedidoIdRef = useRef(0);
  const temMaisRef = useRef(false);
  const carregandoMaisRef = useRef(false);
  const buscaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregarPagina = useCallback(async (filtro: FiltroOrcamentos, opts: { reset: boolean }) => {
    const meuPedido = opts.reset ? ++pedidoIdRef.current : pedidoIdRef.current;
    if (opts.reset) {
      // cache-then-revalidate: só mostra skeleton se NÃO há nada em tela ainda
      // (foco/sync em segundo plano não apaga a lista pra "piscar" de novo).
      if (itensRef.current.length === 0) setCarregando(true);
    } else {
      if (carregandoMaisRef.current || !temMaisRef.current) return;
      carregandoMaisRef.current = true;
      setCarregandoMais(true);
    }
    try {
      const offset = opts.reset ? 0 : itensRef.current.length;
      const [pagina, resumoNovo] = await Promise.all([
        getOrcamentosPagina(filtro, PAGE_SIZE, offset),
        opts.reset ? getOrcamentosResumoFiltro(filtro) : Promise.resolve(null),
      ]);
      if (meuPedido !== pedidoIdRef.current) return; // filtro já mudou de novo — descarta resposta velha
      const proximos = opts.reset ? pagina : [...itensRef.current, ...pagina];
      itensRef.current = proximos;
      setItens(proximos);
      const aindaTemMais = pagina.length === PAGE_SIZE;
      temMaisRef.current = aindaTemMais;
      setTemMais(aindaTemMais);
      if (resumoNovo) setResumo(resumoNovo);
    } finally {
      if (meuPedido === pedidoIdRef.current) {
        setCarregando(false);
        carregandoMaisRef.current = false;
        setCarregandoMais(false);
      }
    }
  }, []);

  /** Recarrega do zero com o filtro ATUAL (query/statusFilter/clienteId mais recentes). */
  const recarregar = useCallback(() => {
    const f = filtroRef.current;
    return carregarPagina(montarFiltro(f.query, f.statusFilter, f.clienteId), { reset: true });
  }, [carregarPagina]);

  const recarregarRecibos = useCallback(async () => {
    if (!podeFinanceiro) {
      setRecibos([]);
      return;
    }
    try {
      setRecibos(await getRecibos());
    } catch {
      // Falha de leitura não inventa pagamento nem apaga o estado já conhecido.
    }
  }, [podeFinanceiro]);

  const carregarMais = useCallback(() => {
    const f = filtroRef.current;
    carregarPagina(montarFiltro(f.query, f.statusFilter, f.clienteId), { reset: false });
  }, [carregarPagina]);

  useFocusEffect(useCallback(() => {
    recarregar();
    recarregarRecibos();
    getEmpresa().then(setEmpresa).catch(() => {});
    // sincronizarStatusLinks() nunca lança — é seguro chamar sem try/catch.
    // Se algum orçamento mudou de status (cliente aprovou/recusou pelo link),
    // recarrega a lista para refletir o novo status.
    sincronizarStatusLinks().then(alterados => {
      if (alterados > 0) recarregar();
    });
  }, [recarregar, recarregarRecibos, clienteId]));

  // Recarrega a lista quando o sync em segundo plano (login/foreground) traz
  // dados novos da nuvem — sem isso, um aparelho recém-logado podia mostrar a
  // lista vazia até o usuário sair e voltar para a tela.
  useEffect(() => onSyncAplicado(() => {
    setSincronizando(true);
    recarregar();
    recarregarRecibos();
  }), [recarregar, recarregarRecibos]);

  function limparFiltroCliente() {
    setClienteId(undefined);
    carregarPagina(montarFiltro(filtroRef.current.query, filtroRef.current.statusFilter, undefined), { reset: true });
  }

  function handleSearch(q: string) {
    setQuery(q);
    // debounce: SQL por tecla seria exagero — espera a digitação assentar.
    if (buscaTimerRef.current) clearTimeout(buscaTimerRef.current);
    buscaTimerRef.current = setTimeout(() => {
      carregarPagina(montarFiltro(q, filtroRef.current.statusFilter, filtroRef.current.clienteId), { reset: true });
    }, 250);
  }

  useEffect(() => () => { if (buscaTimerRef.current) clearTimeout(buscaTimerRef.current); }, []);

  function handleStatusFilter(s: typeof statusFilter) {
    setStatusFilter(s);
    carregarPagina(montarFiltro(filtroRef.current.query, s, filtroRef.current.clienteId), { reset: true });
  }

  const handleDelete = useCallback(async (o: Orcamento) => {
    Alert.alert(
      'Excluir orçamento',
      `O orçamento nº ${formatarNumeroExibicao(o.numero)} de ${o.clienteNome} vai para a Lixeira. Você pode restaurá-lo por ${DIAS_RETENCAO_LIXEIRA} dias.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: async () => {
            try {
              await deleteOrcamento(o.id);
              recarregar();
            } catch (e) {
              Alert.alert('Erro', 'Não foi possível excluir o orçamento agora. Tente novamente.');
            }
          },
        },
      ]
    );
  }, [recarregar]);

  // ─── MODO DE SELEÇÃO MÚLTIPLA (exclusão em lote → Lixeira) ─────────────────
  function entrarSelecao(inicialId?: string) {
    setSelecionando(true);
    setSelecionados(inicialId ? new Set([inicialId]) : new Set());
  }

  function sairSelecao() {
    setSelecionando(false);
    setSelecionados(new Set());
  }

  const alternarSelecao = useCallback((id: string) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /** Seleciona TODOS os ids que batem o filtro atual (não só a página já carregada). */
  async function selecionarTodos() {
    const f = filtroRef.current;
    const ids = await getOrcamentosIdsFiltro(montarFiltro(f.query, f.statusFilter, f.clienteId));
    setSelecionados(new Set(ids));
  }

  function handleExcluirSelecionados() {
    const ids = Array.from(selecionados);
    if (!ids.length) return;
    Alert.alert(
      'Excluir selecionados',
      `${ids.length} orçamento${ids.length === 1 ? '' : 's'} ${ids.length === 1 ? 'vai' : 'vão'} para a Lixeira. Você pode restaurar por ${DIAS_RETENCAO_LIXEIRA} dias.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: async () => {
            try {
              for (const id of ids) {
                try { await deleteOrcamento(id); } catch { /* pula um; segue o lote */ }
              }
            } finally {
              sairSelecao();
              await recarregar();
            }
          },
        },
      ],
    );
  }

  /**
   * Duplicar (rascunho independente) e Criar revisão (documento já enviado/aceito
   * não é sobrescrito: nasce outro rascunho que aponta para o original). Os dois
   * partem da MESMA base (`baseParaNovoDocumento`): sem nenhuma assinatura, sem as
   * datas do documento antigo, validade recalculada a partir de hoje.
   */
  const criarDocumentoNovo = useCallback(async (o: Orcamento, modo: ModoNovoDocumento) => {
    try {
      const numero = await getNextOrcamentoNumber();
      const empresaAtual = await getEmpresa().catch(() => null);
      const novo = baseParaNovoDocumento({
        origem: o,
        modo,
        id: generateId(),
        numero,
        gerarId: generateId,
        empresa: empresaAtual,
      });
      await saveOrcamento(novo);
      await recarregar();
      nav.navigate('EditarOrcamento', { orcamentoId: novo.id });
    } catch {
      Alert.alert(
        'Erro',
        modo === 'revisao'
          ? 'Não foi possível criar a revisão agora. Tente novamente.'
          : 'Não foi possível duplicar o orçamento agora. Tente novamente.',
      );
    }
  }, [recarregar, nav]);

  const handleClone = useCallback((o: Orcamento) => criarDocumentoNovo(o, 'duplicar'), [criarDocumentoNovo]);
  const handleRevision = useCallback((o: Orcamento) => criarDocumentoNovo(o, 'revisao'), [criarDocumentoNovo]);

  /** "Cobrar resposta": lembrete cordial no WhatsApp de quem recebeu a proposta. */
  const handleCobrarResposta = useCallback(async (o: Orcamento) => {
    const telefone = (o.clienteTelefone || '').trim();
    if (!telefone) {
      Alert.alert('Sem telefone', `Cadastre o WhatsApp de ${o.clienteNome} para cobrar a resposta por aqui.`);
      return;
    }
    try {
      await abrirWhatsApp(telefone, montarMensagemFollowUpOrcamento(o, empresa));
    } catch {
      Alert.alert('Não consegui abrir o WhatsApp', 'Confira se o WhatsApp está instalado e tente de novo.');
    }
  }, [empresa]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([recarregar(), recarregarRecibos()]);
    setRefreshing(false);
  };

  // Callbacks estáveis (useCallback) parametrizados pelo item — passadas como
  // prop para o LinhaOrcamento memoizado. Recriar closures NOVAS a cada item
  // dentro do renderItem quebraria o React.memo (props sempre "diferentes");
  // aqui a IDENTIDADE da função fica igual entre renders, só o item varia.
  const onPressLinha = useCallback((o: Orcamento) => {
    if (selecionando) alternarSelecao(o.id);
    else nav.navigate('VisualizarOrcamento', { orcamentoId: o.id });
  }, [selecionando, alternarSelecao, nav]);

  const onEditarLinha = useCallback((o: Orcamento) => {
    if (edicaoBloqueada(o.status)) {
      void handleRevision(o);
      return;
    }
    nav.navigate('EditarOrcamento', { orcamentoId: o.id });
  }, [handleRevision, nav]);

  // Recusado/expirado/cancelado não são edicaoBloqueada: o botão "Criar revisão"
  // do card precisa criar a revisão de fato, não abrir o original no editor.
  const onRevisarLinha = useCallback((o: Orcamento) => { void handleRevision(o); }, [handleRevision]);

  const onCobrarRespostaLinha = useCallback((o: Orcamento) => { void handleCobrarResposta(o); }, [handleCobrarResposta]);

  const onMenuLinha = useCallback((o: Orcamento) => { setMenuDe(o); }, []);

  const onReciboLinha = useCallback((o: Orcamento) => {
    nav.navigate('EmitirRecibo', { orcamentoId: o.id });
  }, [nav]);

  /** Fecha o menu ⋯ e roda a ação escolhida sobre o orçamento dele. */
  function escolherNoMenu(acao: 'duplicar' | 'editar' | 'excluir') {
    const o = menuDe;
    setMenuDe(null);
    if (!o) return;
    if (acao === 'duplicar') void handleClone(o);
    else if (acao === 'editar') onEditarLinha(o);
    // A confirmação (Alert) espera o menu terminar de fechar: no iOS, um Alert
    // aberto enquanto o Modal sai some junto com ele.
    else setTimeout(() => { void handleDelete(o); }, 350);
  }

  const renderItem = useCallback(({ item: o, index }: { item: Orcamento; index: number }) => {
    const marcado = selecionados.has(o.id);

    return (
      <LinhaOrcamento
        item={o}
        index={index}
        selecionando={selecionando}
        marcado={marcado}
        onPress={onPressLinha}
        onEditar={onEditarLinha}
        onRevisar={onRevisarLinha}
        onCobrarResposta={onCobrarRespostaLinha}
        onRecibo={onReciboLinha}
        onMenu={onMenuLinha}
        recibos={recibos}
        podeFinanceiro={podeFinanceiro}
      />
    );
  }, [selecionados, selecionando, onPressLinha, onEditarLinha, onRevisarLinha, onCobrarRespostaLinha, onReciboLinha, onMenuLinha, recibos, podeFinanceiro]);

  const keyExtractor = useCallback((o: Orcamento) => o.id, []);

  return (
    <View style={styles.container}>
      {sincronizando && <SincronizandoPill onDone={() => setSincronizando(false)} />}
      <GradientHeader
        onBack={() => goBackOrHome(nav)}
        title="Orçamentos"
        subtitle={clienteId && clienteNome ? `de ${clienteNome}` : undefined}
        right={
          <TouchableOpacity style={styles.newBtn} onPress={() => nav.navigate('NovoOrcamento', clienteId ? { clienteId } : {})} activeOpacity={0.85}>
            <MaterialCommunityIcons name="plus" size={20} color="#fff" />
            <Text style={styles.newBtnLabel}>Novo</Text>
          </TouchableOpacity>
        }
      >
        <View style={styles.searchRow}>
          <MaterialCommunityIcons name="magnify" size={20} color={cores.onSurfaceVariant} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por cliente ou número..."
            value={query}
            onChangeText={handleSearch}
            placeholderTextColor={cores.onSurfaceMuted}
          />
          {query ? (
            <TouchableOpacity onPress={() => handleSearch('')} accessibilityRole="button" accessibilityLabel="Limpar busca">
              <MaterialCommunityIcons name="close-circle" size={18} color={cores.onSurfaceMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: sobreSecundario(gradientes.sobreHeader, gradientes.header) }]}>{resumo.contagem} orçamento{resumo.contagem !== 1 ? 's' : ''}</Text>
          <CountUp
            value={resumo.valorTotal}
            format="currency"
            style={styles.totalValue}
          />
        </View>
      </GradientHeader>

      {/* FILTER CHIPS */}
      <View>
        <FlatList
          horizontal
          data={STATUS_FILTERS}
          keyExtractor={i => i.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingVertical: 8, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.chip, statusFilter === item.key && styles.chipActive]}
              onPress={() => handleStatusFilter(item.key)}
            >
              <Text style={[styles.chipLabel, statusFilter === item.key && styles.chipLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* DICA (1º uso) — o que o status significa e como ele anda sozinho. O link
          do cliente é gerado ao abrir o orçamento (gerarLinkOrcamento) e o status
          local avança quando o cliente responde (sincronizarStatusLinks, no foco). */}
      <View style={{ paddingHorizontal: Spacing.base }}>
        <DicaContextual
          id="orcamentos.status-link"
          icon="link-variant"
          texto="O status mostra em que pé está cada proposta. Abra um orçamento para enviar o link ao cliente: quando ele aprova por lá, o status atualiza sozinho aqui."
        />
      </View>

      {/* BANNER DE FILTRO POR CLIENTE (CRM) */}
      {clienteId && (
        <View style={styles.clienteBanner}>
          <MaterialCommunityIcons name="account-filter-outline" size={18} color={cores.accentLight} />
          <Text style={styles.clienteBannerText} numberOfLines={1}>
            Mostrando orçamentos de {clienteNome || 'um cliente'}
          </Text>
          <TouchableOpacity onPress={limparFiltroCliente} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clienteBannerClear}>Limpar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* TOOLBAR DE SELEÇÃO — "Selecionar" (entrada) ou controles do modo lote */}
      {!carregando && resumo.contagem > 0 && (
        <View style={styles.selToolbar}>
          {selecionando ? (
            <>
              <TouchableOpacity onPress={sairSelecao} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Cancelar seleção">
                <Text style={styles.selCancel}>Cancelar</Text>
              </TouchableOpacity>
              <Text style={styles.selCount}>{selecionados.size} selecionado{selecionados.size === 1 ? '' : 's'}</Text>
              <TouchableOpacity onPress={selecionarTodos} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Selecionar todos">
                <Text style={styles.selAll}>Selecionar todos</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.selEnter} onPress={() => entrarSelecao()} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Selecionar para excluir vários">
              <MaterialCommunityIcons name="checkbox-multiple-marked-outline" size={16} color={cores.accentLight} />
              <Text style={styles.selEnterLabel}>Selecionar</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* LIST */}
      {carregando ? (
        <View style={{ paddingTop: 8, paddingHorizontal: Spacing.base, gap: 10 }}>
          {[0, 1, 2].map(i => (
            <View key={i} style={styles.skeletonCard}>
              <OlliSkeleton width="55%" height={15} />
              <OlliSkeleton width="35%" height={12} style={{ marginTop: 8 }} />
              <OlliSkeleton width="40%" height={20} style={{ marginTop: 12 }} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={itens}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: (selecionando ? 104 : 80) + insets.bottom, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[cores.primary]} />}
          onEndReached={carregarMais}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            carregandoMais ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <OlliSkeleton width={120} height={12} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="file-document-outline"
              title="Nenhum orçamento"
              subtitle={
                query ? 'Nenhum resultado para sua busca.'
                  : clienteId ? `${clienteNome || 'Este cliente'} ainda não tem orçamentos. Crie o primeiro!`
                  : 'Crie seu primeiro orçamento!'
              }
              actionLabel={!query ? 'Criar orçamento' : undefined}
              onAction={!query ? () => nav.navigate('NovoOrcamento', clienteId ? { clienteId } : {}) : undefined}
            />
          }
        />
      )}

      {/* BARRA DE AÇÃO — excluir selecionados (vai para a Lixeira) */}
      {selecionando && selecionados.size > 0 && (
        <View style={[styles.bulkBar, { paddingBottom: insets.bottom + 16 }]}>
          <OlliButton
            label={`Excluir ${selecionados.size} para a Lixeira`}
            variant="danger"
            size="lg"
            fullWidth
            onPress={handleExcluirSelecionados}
            icon={<MaterialCommunityIcons name="trash-can-outline" size={20} color="#fff" />}
          />
        </View>
      )}

      {/* MENU ⋯ DO CARD — ações menos frequentes e a destrutiva, longe do polegar. */}
      <Modal visible={!!menuDe} transparent animationType="fade" onRequestClose={() => setMenuDe(null)}>
        <Pressable style={styles.menuFundo} onPress={() => setMenuDe(null)} accessibilityLabel="Fechar menu">
          <Pressable style={[styles.menuFolha, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
            {menuDe ? (
              <>
                <Text style={styles.menuTitulo} numberOfLines={1}>
                  Orçamento nº {formatarNumeroExibicao(menuDe.numero)} · {menuDe.clienteNome}
                </Text>
                <TouchableOpacity style={styles.menuItem} onPress={() => escolherNoMenu('duplicar')} accessibilityRole="button">
                  <MaterialCommunityIcons name="content-copy" size={20} color={cores.onSurface} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemLabel}>Duplicar</Text>
                    <Text style={styles.menuItemSub}>Rascunho novo, sem assinaturas, com validade a partir de hoje</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => escolherNoMenu('editar')} accessibilityRole="button">
                  <MaterialCommunityIcons
                    name={edicaoBloqueada(menuDe.status) ? 'file-document-edit-outline' : 'pencil-outline'}
                    size={20}
                    color={cores.onSurface}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemLabel}>{edicaoBloqueada(menuDe.status) ? 'Criar revisão' : 'Editar'}</Text>
                    {edicaoBloqueada(menuDe.status) ? (
                      <Text style={styles.menuItemSub}>O original que o cliente viu fica preservado</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => escolherNoMenu('excluir')} accessibilityRole="button">
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={cores.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuItemLabel, { color: cores.danger }]}>Excluir</Text>
                    <Text style={styles.menuItemSub}>Vai para a Lixeira por {DIAS_RETENCAO_LIXEIRA} dias</Text>
                  </View>
                </TouchableOpacity>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  syncPill: {
    position: 'absolute', top: 8, alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    // Toast/pill flutuante — convenção de "chip escuro" fixa (como um snackbar),
    // independente do tema; não é uma superfície da tela. Mantido.
    backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: c.strokeGlow,
    borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6,
    ...sombrasDe(c).sm,
  },
  syncPillText: { fontSize: 11.5, fontWeight: '700', color: c.accent }, // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 2.88:1 (7.25:1)
  newBtn: {
    // Botão dentro do GradientHeader (sempre colorido, nos dois modos) —
    // glass branco translúcido, mesma convenção do próprio GradientHeader.
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  newBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.surfaceVariant,
    borderWidth: 1, borderColor: c.outline,
    marginTop: 14, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface },

  // totalRow vive dentro do GradientHeader — texto branco fixo, mesma
  // convenção do header (sempre colorido, independente do tema).
  // totalLabel: sem cor aqui — é texto SECUNDÁRIO sobre o gradiente do header,
  // aplicada inline com sobreSecundario(gradientes.sobreHeader, gradientes.header)
  // no ponto de uso. rgba(255,255,255,0.75) fixo media 3.52:1 contra a ponta clara
  // do header (gradientes.header[0] = #0B6FCE) — reprova o alvo de 4.5:1.
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  totalLabel: { fontSize: 12.5, fontWeight: '700' },
  totalValue: { fontSize: 17, color: '#fff', fontWeight: '800' },

  skeletonCard: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.base },

  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.outline,
  },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipLabel: { fontSize: 12, fontWeight: '600', color: c.onSurfaceVariant },
  // Era '#fff' fixo sobre fundo chapado c.primary — vira onPrimary (contraste
  // calculado), correto pra qualquer cor de marca escolhida pelo usuário.
  chipLabelActive: { color: c.onPrimary },

  // rgba(52,198,217,x) era o accent estático — vira o accent do tema.
  clienteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: comAlfa(c.accent, 0.10), borderWidth: 1, borderColor: comAlfa(c.accent, 0.28),
    borderRadius: BorderRadius.md, marginHorizontal: Spacing.base, marginBottom: 4,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  clienteBannerText: { flex: 1, fontSize: 13, fontWeight: '700', color: c.accentLight },
  clienteBannerClear: { fontSize: 13, fontWeight: '800', color: c.accentLight },

  // Toolbar / barra do modo de seleção múltipla
  selToolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingBottom: 6, paddingTop: 2,
  },
  selEnter: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: comAlfa(c.accent, 0.10), borderWidth: 1, borderColor: comAlfa(c.accent, 0.30),
  },
  selEnterLabel: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  selCancel: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant },
  selCount: { fontSize: 13, fontWeight: '800', color: c.onSurface },
  selAll: { fontSize: 13, fontWeight: '800', color: c.accentLight },
  bulkBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: Spacing.base, paddingTop: 10, paddingBottom: 22,
    // rgba(7,17,31,x) é um preto-azulado fixo (bandeja de ação sempre escura,
    // como o rodapé de um bottom sheet); sem equivalente semântico direto no
    // tema — mantido. borda continua no strokeGlow do tema.
    backgroundColor: 'rgba(7,17,31,0.98)', borderTopWidth: 1, borderTopColor: c.strokeGlow,
  },

  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemNome: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  itemMeta: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  revisaoMeta: { fontSize: 11, fontWeight: '700', color: c.primary, marginTop: 2 },
  itemValor: { fontSize: 15, fontWeight: '700', color: c.primary, marginBottom: 4 },

  itemActions: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.outline,
    marginTop: 10, paddingTop: 8, gap: 4,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 3, paddingVertical: 4,
  },
  actionLabel: { fontSize: 11, fontWeight: '700' },
  actionMenu: { flex: 0, paddingHorizontal: 10 },

  menuFundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  menuFolha: {
    backgroundColor: c.surface,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: c.strokeGlow,
    paddingTop: Spacing.base, paddingHorizontal: Spacing.base,
    ...sombrasDe(c).lg,
  },
  menuTitulo: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant, marginBottom: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 10 },
  menuItemLabel: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  menuItemSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },

});
