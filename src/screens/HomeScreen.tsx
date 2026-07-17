import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Modal, Pressable, Linking, Alert, Animated } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, sombrasDe, textoSobre, achatarVeu, sobreSecundario, ajustarParaContraste, corCategoria, type Cores } from '../theme';
import {
  getEmpresa, getClientes,
  getOrcamentosTotalAtivos, getOrcamentosAgregadoPorStatus, getOrcamentosParadosAgregado, getUltimosOrcamentos,
} from '../database/database';
import { getProximoAgendamento } from '../services/agenda';
import { onSyncAplicado } from '../services/cloudSync';
import { getEtaAgendamento, temDestinoEta, mensagemEstouACaminho, type ResultadoEta } from '../services/eta';
import { clientesParaReconquistar, mensagemReconquista, adiarClienteRadar, ClienteParaReconquistar } from '../services/radarClientes';
import { orcamentosParaCobrar, mensagemCobranca, OrcamentoParaCobrar } from '../services/radarCobranca';
import { abrirWhatsApp } from '../utils/pdfGenerator';
import { formatCurrency } from '../utils/currency';
import { formatDate } from '../utils/date';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Empresa, Orcamento, Agendamento, Cliente, TIPO_AGENDAMENTO_LABELS, STATUS_PROPOSTA_ENVIADA } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { EtaChip } from '../components/EtaChip';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { DicaContextual } from '../components/DicaContextual';
import { OlliPressable } from '../components/OlliPressable';
import { OlliMascot } from '../components/OlliMascot';
import { EmptyState } from '../components/EmptyState';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { CountUp } from '../components/CountUp';
import { usePlano } from '../hooks/usePlano';
import { usePermissao } from '../hooks/usePermissao';
import { track, Eventos } from '../services/analytics';

/** Quantos clientes do radar o plano Grátis mostra completos (o resto vira teaser bloqueado). */
const RADAR_GRATIS_QTD = 1;

type Nav = NativeStackNavigationProp<RootStackParamList>;

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

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia,';
  if (h < 18) return 'Boa tarde,';
  return 'Boa noite,';
}

const mesmoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Rótulo amigável do horário da próxima parada: "Hoje · 14:30", "Amanhã · 09:00" ou "18/06 · 14:30". */
function quandoLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const hoje = new Date();
  const amanha = new Date(); amanha.setDate(hoje.getDate() + 1);
  if (mesmoDia(d, hoje)) return `Hoje · ${hh}`;
  if (mesmoDia(d, amanha)) return `Amanhã · ${hh}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} · ${hh}`;
}

/** Abre o endereço no Google Maps (sem precisar de API key — só um link de busca). */
function abrirMapa(endereco?: string) {
  if (!endereco) return;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
  Linking.openURL(url).catch(() => {});
}


/**
 * Véu do hero: cor de marca translúcida POR CIMA de `background`. Não é um gradiente
 * do tema, então não tem companheira `sobre*` — o que o olho vê é a composição, e ela
 * muda com o modo: azul pálido no claro, azul-marinho no escuro.
 */
const VEU_HERO = ['rgba(11,111,206,0.38)', 'rgba(52,198,217,0.08)'] as const;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  /**
   * Cores do hero, derivadas do fundo EFETIVO (véu achatado sobre `background`).
   *
   * O hero nasceu num app dark-only: título `#fff`, legendas `rgba(226,232,240,…)`,
   * acentos `accentLight`. No modo claro o composto vira #9CC3E9 → #E6F3F7 (quase
   * branco) e TODOS os oito elementos reprovavam — o título ficava branco no branco
   * (1.13:1). No escuro os mesmos oito passavam, e por isso ninguém viu.
   */
  const heroPontas = useMemo(
    () => [achatarVeu(cores.background, VEU_HERO[0]), achatarVeu(cores.background, VEU_HERO[1])] as const,
    [cores.background],
  );
  // Âncora na ponta mais difícil (a primeira): tinta escura no claro, branco no escuro.
  const heroTexto = textoSobre(heroPontas[0]);
  const heroTextoSec = sobreSecundario(heroTexto, heroPontas);
  // O acento da marca também precisa ceder: `accentLight` media 2.81:1 sobre o hero claro.
  const heroAcento = ajustarParaContraste(cores.accentLight, heroPontas[0], 4.5);
  const { temAcesso } = usePlano();
  const { papel } = usePermissao();
  const radarLiberado = temAcesso('radar_clientes');
  // Onda 4 — entrada mobile das Ordens de serviço. O técnico (público-alvo do
  // APK) vê "Minhas OS" (só as dele) e ganha destaque no 1º atalho, pois é o
  // fluxo principal dele; gestão/pessoal vê "Ordens". Rótulo role-aware igual
  // ao da SidebarNav — a mesma rota do stack raiz decide o que listar.
  const ehTecnico = papel === 'tecnico';
  const rotuloOS = ehTecnico ? 'Minhas OS' : 'Ordens';
  // dashboard-agg: KPIs comerciais chegam PRONTOS do SQLite (agregados) — não
  // mais o histórico inteiro de orçamentos pra reduzir aqui a cada foco.
  const [totalOrcamentos, setTotalOrcamentos] = useState(0);
  const [aprovadosResumo, setAprovadosResumo] = useState({ contagem: 0, valorTotal: 0 });
  const [emAbertoResumo, setEmAbertoResumo] = useState({ contagem: 0, valorTotal: 0 });
  const [paradosResumo, setParadosResumo] = useState({ contagem: 0, valorTotal: 0 });
  const [recentes, setRecentes] = useState<Orcamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [olliMenu, setOlliMenu] = useState(false);
  const [proxima, setProxima] = useState<Agendamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  // 3 estados explícitos (nunca colapsar erro em vazio): `carregandoErro` só
  // vira `true` se o Promise.all de load() de fato falhar — sem isso o
  // skeleton ficava preso pra sempre (setCarregando(false) nunca rodava).
  const [carregandoErro, setCarregandoErro] = useState(false);
  const [radarTotal, setRadarTotal] = useState<ClienteParaReconquistar[]>([]);
  const [radarCarregando, setRadarCarregando] = useState(true);
  const [radarErro, setRadarErro] = useState(false);
  const [adiandoId, setAdiandoId] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  // RADAR DE COBRANÇA — orçamentos aprovados sem recibo (dinheiro parado).
  // 3 estados explícitos (nunca colapsar erro em vazio): `cobrancaErro` só vira
  // `true` se a leitura de fato falhar; lista vazia com sucesso é "tudo recebido".
  const [cobranca, setCobranca] = useState<OrcamentoParaCobrar[]>([]);
  const [cobrancaCarregando, setCobrancaCarregando] = useState(true);
  const [cobrancaErro, setCobrancaErro] = useState(false);

  // ETA com trânsito da próxima parada — `null` = ainda buscando (chip mostra
  // shimmer). O destino vem de coordenada salva OU do endereço (o serviço
  // geocodifica sob demanda, cacheado); `temEta` é o gate síncrono de exibição.
  const [etaResultado, setEtaResultado] = useState<ResultadoEta | null>(null);
  const ultimaBuscaEtaRef = useRef(0);
  const paradaKeyRef = useRef('');
  const temEta = useMemo(() => temDestinoEta(proxima), [proxima]);
  // Identidade da parada: id + endereço. Muda quando a próxima parada troca (ou
  // seu endereço é editado) — força re-busca mesmo dentro da janela de 5 min.
  const paradaKey = useMemo(
    () => (proxima ? `${proxima.id}|${(proxima.endereco ?? '').trim().toLowerCase()}` : ''),
    [proxima],
  );

  const buscarEta = useCallback(async () => {
    ultimaBuscaEtaRef.current = Date.now();
    setEtaResultado(null); // shimmer enquanto busca (inclui o geocoding, se preciso)
    const r = await getEtaAgendamento(proxima);
    setEtaResultado(r);
  }, [proxima]);

  // Dispara ao focar a tela (com destino disponível); re-busca no máximo a cada
  // 5 min — reabrir a Home logo em seguida não bate o worker de novo. Exceção:
  // se a parada mudou, busca já (a estimativa antiga é de outro endereço).
  useFocusEffect(
    useCallback(() => {
      if (!temEta) return;
      const mudouParada = paradaKey !== paradaKeyRef.current;
      const decorridoMs = Date.now() - ultimaBuscaEtaRef.current;
      if (mudouParada || decorridoMs > 5 * 60 * 1000) {
        paradaKeyRef.current = paradaKey;
        buscarEta();
      }
    }, [temEta, paradaKey, buscarEta]),
  );

  const tentarEtaNovamente = useCallback(() => {
    if (temEta) buscarEta();
  }, [temEta, buscarEta]);

  const load = useCallback(async () => {
    setCarregandoErro(false);
    try {
      const [total, aprov, aberto, parados, recentesLista, emp, prox, cli] = await Promise.all([
        getOrcamentosTotalAtivos(),
        getOrcamentosAgregadoPorStatus(['aprovado']),
        getOrcamentosAgregadoPorStatus(STATUS_PROPOSTA_ENVIADA),
        getOrcamentosParadosAgregado(STATUS_PROPOSTA_ENVIADA, 5),
        getUltimosOrcamentos(4),
        getEmpresa(), getProximoAgendamento(), getClientes(),
      ]);
      setTotalOrcamentos(total);
      setAprovadosResumo(aprov);
      setEmAbertoResumo(aberto);
      setParadosResumo(parados);
      setRecentes(recentesLista);
      setEmpresa(emp);
      setProxima(prox);
      setClientes(cli);
    } catch {
      // erro de verdade (leitura falhou) — NUNCA vira skeleton infinito nem
      // colapsa em telas "vazias" enganosas (StarterCard, hero sem visita etc.).
      setCarregandoErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  const loadRadar = useCallback(async () => {
    setRadarErro(false);
    try {
      const lista = await clientesParaReconquistar();
      // Grátis só precisa saber "tem mais 1 no radar" pra desenhar o teaser —
      // busca até 4 (1 mostrado + até 3 contados no "+N"); Pro vê os 3 de sempre.
      setRadarTotal(lista.slice(0, 4));
    } catch {
      // erro de verdade (leitura falhou) — NUNCA vira lista vazia silenciosa.
      setRadarErro(true);
    } finally {
      setRadarCarregando(false);
    }
  }, []);

  const loadCobranca = useCallback(async () => {
    setCobrancaErro(false);
    try {
      const lista = await orcamentosParaCobrar();
      setCobranca(lista);
    } catch {
      // erro de verdade (leitura falhou) — NUNCA vira lista vazia silenciosa.
      setCobrancaErro(true);
    } finally {
      setCobrancaCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); loadRadar(); loadCobranca(); }, [load, loadRadar, loadCobranca]));

  // Recarrega quando um sync com a nuvem terminar (ex.: login recém-feito
  // trazendo orçamentos/agendamentos que ainda não existiam localmente).
  useEffect(() => onSyncAplicado(() => { setSincronizando(true); load(); loadRadar(); loadCobranca(); }), [load, loadRadar, loadCobranca]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(), loadRadar(), loadCobranca()]);
    } finally {
      // finally garante que o pull-to-refresh nunca fica preso, mesmo se algo
      // além das 3 chamadas (que já se protegem com try/catch) rejeitar.
      setRefreshing(false);
    }
  };

  async function chamarNoWhatsApp(item: ClienteParaReconquistar) {
    if (!item.cliente.telefone?.trim()) {
      Alert.alert('Sem telefone', `Cadastre o WhatsApp de ${item.cliente.nome} em Clientes para chamar por aqui.`);
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    const mensagem = mensagemReconquista(item.cliente.nome, item.mesesSemContato);
    try {
      await abrirWhatsApp(item.cliente.telefone, mensagem);
    } catch {
      // silencioso: mesmo padrão de outras chamadas de WhatsApp no app
    }
  }

  async function adiarRadar(item: ClienteParaReconquistar) {
    Haptics.selectionAsync().catch(() => {});
    setAdiandoId(item.cliente.id);
    try {
      await adiarClienteRadar(item.cliente.id, 30);
      setRadarTotal(prev => prev.filter(r => r.cliente.id !== item.cliente.id));
    } finally {
      setAdiandoId(null);
    }
  }

  async function cobrarNoWhatsApp(item: OrcamentoParaCobrar) {
    // O orçamento já guarda o telefone denormalizado — funciona mesmo se o
    // cadastro do cliente tiver sido excluído depois da aprovação.
    const telefone = item.orcamento.clienteTelefone || item.cliente?.telefone;
    if (!telefone?.trim()) {
      Alert.alert('Sem telefone', `Cadastre o WhatsApp de ${item.orcamento.clienteNome} em Clientes para cobrar por aqui.`);
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    try {
      await abrirWhatsApp(telefone, mensagemCobranca(item));
    } catch {
      // silencioso: mesmo padrão das demais chamadas de WhatsApp no app
    }
  }

  // "ESTOU A CAMINHO" — só aparece com telefone do cliente da próxima parada
  // (resolvido pelo clienteId no cadastro ativo). Reaproveita o MESMO
  // `etaResultado` já buscado pelo EtaChip do hero — sem 2ª chamada de rede.
  const telefoneProxima = useMemo(() => {
    if (!proxima?.clienteId) return undefined;
    return clientes.find(c => c.id === proxima.clienteId)?.telefone?.trim() || undefined;
  }, [proxima, clientes]);

  const estouACaminho = useCallback(async () => {
    if (!proxima || !telefoneProxima) return;
    Haptics.selectionAsync().catch(() => {});
    const mensagem = mensagemEstouACaminho(proxima.clienteNome, etaResultado);
    try {
      await abrirWhatsApp(telefoneProxima, mensagem);
    } catch {
      // silencioso: mesmo padrão das demais chamadas de WhatsApp no app
    }
  }, [proxima, telefoneProxima, etaResultado]);

  // Grátis vê 1 cliente sumido de verdade; o resto vira teaser "+N no Pro".
  const radar = radarLiberado ? radarTotal.slice(0, 3) : radarTotal.slice(0, RADAR_GRATIS_QTD);
  const radarBloqueados = radarLiberado ? 0 : Math.max(0, radarTotal.length - RADAR_GRATIS_QTD);

  const irParaPlanos = useCallback((origem: string) => {
    Haptics.selectionAsync().catch(() => {});
    track(Eventos.gateCta, { recurso: 'radar_clientes', plano: 'pro', origem });
    nav.navigate('Planos');
  }, [nav]);

  useEffect(() => {
    if (!radarCarregando && radarBloqueados > 0) {
      track(Eventos.gateVisto, { recurso: 'radar_clientes', plano: 'pro', bloqueados: radarBloqueados });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radarCarregando, radarBloqueados]);

  // ── métricas reais (já agregadas em SQL — ver load()) ──
  const faturamento = aprovadosResumo.valorTotal;
  // "Em aberto" = proposta já entregue ao cliente e ainda sem desfecho — cobre
  // enviado/visualizado/em_negociacao/aguardando_assinatura (STATUS_PROPOSTA_
  // ENVIADA), não só os dois estados antigos. Sem isso as propostas mais
  // quentes (visualizado/em_negociação) sumiam do funil e do radar de parados.
  const conversao = totalOrcamentos ? Math.round((aprovadosResumo.contagem / totalOrcamentos) * 100) : 0;
  const valorParado = paradosResumo.valorTotal;
  const valorCobranca = cobranca.reduce((s, item) => s + item.valor, 0);
  const conversaoDetalhe = totalOrcamentos ? `${aprovadosResumo.contagem}/${totalOrcamentos} aprovados` : 'sem histórico';
  const emAbertoDetalhe = paradosResumo.contagem > 0 ? `${paradosResumo.contagem} parados` : 'sem atrasos';
  const primeiroNome = empresa?.nomePrestador?.split(' ')[0] || 'prestador';

  const abrirOlli = () => {
    Haptics.selectionAsync().catch(() => {});
    setOlliMenu(true);
  };

  const irPara = (rota: 'OlliVoz' | 'OlliChat') => {
    setOlliMenu(false);
    Haptics.selectionAsync().catch(() => {});
    nav.navigate(rota);
  };

  return (
    <View style={styles.container}>
      {sincronizando && <SincronizandoPill onDone={() => setSincronizando(false)} top={insets.top + 8} />}
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 116 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={cores.accentLight} colors={[cores.accentLight]} />}
      >
        {/* TOP BAR */}
        <View style={styles.topbar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{saudacao()}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {primeiroNome}
              {empresa?.nome ? <Text style={styles.company}>  ·  {empresa.nome}</Text> : null}
            </Text>
          </View>
          <TouchableOpacity style={styles.olliBtn} onPress={abrirOlli} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Abrir menu da OLLI">
            <OlliMascot size={34} onDark />
            {paradosResumo.contagem > 0 && (
              <View style={styles.olliBadge}><Text style={styles.olliBadgeText}>{paradosResumo.contagem}</Text></View>
            )}
          </TouchableOpacity>
        </View>

        {/* HERO — AO VIVO · próxima parada (empty-state até existir agenda) */}
        <AnimatedEntrance index={0}>
          <LinearGradient
            colors={VEU_HERO}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.liveRow}>
                <View style={styles.liveDot} />
                <Text style={[styles.liveLabel, { color: heroAcento }]}>AO VIVO · PRÓXIMA PARADA</Text>
              </View>
            </View>
            {carregando ? (
              <View style={styles.heroEmpty}>
                <MaterialCommunityIcons name="dots-horizontal" size={30} color={heroAcento} />
                <Text style={[styles.heroEmptyTitle, { color: heroTexto }]}>Carregando…</Text>
              </View>
            ) : carregandoErro ? (
              <View style={styles.heroEmpty}>
                <MaterialCommunityIcons name="alert-circle-outline" size={30} color={heroAcento} />
                <Text style={[styles.heroEmptyTitle, { color: heroTexto }]}>Não deu para carregar</Text>
                <Text style={[styles.heroEmptySub, { color: heroTextoSec }]}>Não conseguimos buscar seus dados agora. Verifique a conexão e tente de novo.</Text>
                <TouchableOpacity style={styles.heroBtn} onPress={() => { Haptics.selectionAsync().catch(() => {}); load(); }} activeOpacity={0.85}>
                  <MaterialCommunityIcons name="refresh" size={18} color={textoSobre(cores.accentLight)} />
                  <Text style={styles.heroBtnText}>Tentar de novo</Text>
                </TouchableOpacity>
              </View>
            ) : proxima ? (
              <View style={styles.heroFilled}>
                <Text style={[styles.heroWhen, { color: heroAcento }]}>{quandoLabel(proxima.inicio)}</Text>
                <Text style={[styles.heroClient, { color: heroTexto }]} numberOfLines={1}>{proxima.clienteNome || proxima.titulo}</Text>
                <Text style={[styles.heroType, { color: heroTextoSec }]} numberOfLines={1}>
                  {TIPO_AGENDAMENTO_LABELS[proxima.tipo]}{proxima.titulo && proxima.clienteNome ? ` · ${proxima.titulo}` : ''}
                </Text>
                {proxima.endereco ? (
                  <View style={styles.heroAddr}>
                    <MaterialCommunityIcons name="map-marker" size={14} color={heroAcento} />
                    <Text style={[styles.heroAddrText, { color: heroTextoSec }]} numberOfLines={1}>{proxima.endereco}</Text>
                  </View>
                ) : null}
                {temEta ? (
                  <View style={styles.heroEta}>
                    <EtaChip
                      resultado={etaResultado}
                      horario={!isNaN(new Date(proxima.inicio).getTime()) ? new Date(proxima.inicio) : undefined}
                      onTentarNovamente={tentarEtaNovamente}
                    />
                  </View>
                ) : null}
                {/* "Estou a caminho" (item 1.3) — só aparece com telefone do
                    cliente E onde o ETA é possível (`temEta`, plataforma-
                    consciente — P2-1): no nativo sem localização o botão some
                    junto do EtaChip, em vez de sobrar sozinho sem contexto.
                    Sem ETA disponível (web sem GPS liberado), avisa em vez de
                    inventar um horário (o EtaChip acima já mostra o motivo). */}
                {telefoneProxima && temEta ? (
                  <TouchableOpacity style={styles.heroWhatsBtn} onPress={estouACaminho} activeOpacity={0.85}>
                    <MaterialCommunityIcons
                      name="whatsapp"
                      size={16}
                      color="#0A1626" // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)
                    />
                    <Text style={styles.heroWhatsBtnText}>Estou a caminho</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={styles.heroActions}>
                  {proxima.endereco ? (
                    <TouchableOpacity style={[styles.heroBtn, { marginTop: 0 }]} onPress={() => { Haptics.selectionAsync().catch(() => {}); abrirMapa(proxima.endereco); }} activeOpacity={0.85}>
                      <MaterialCommunityIcons name="navigation-variant" size={16} color={textoSobre(cores.accentLight)} />
                      <Text style={styles.heroBtnText}>Ver no mapa</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.heroBtnGhost} onPress={() => { Haptics.selectionAsync().catch(() => {}); (nav as any).navigate('Tabs', { screen: 'Agenda' }); }} activeOpacity={0.85}>
                    <Text style={[styles.heroBtnGhostText, { color: heroAcento }]}>Ver agenda</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.heroEmpty}>
                <MaterialCommunityIcons name="calendar-blank-outline" size={30} color={heroAcento} />
                <Text style={[styles.heroEmptyTitle, { color: heroTexto }]}>Nenhuma visita agendada</Text>
                <Text style={[styles.heroEmptySub, { color: heroTextoSec }]}>Agende seus serviços e organize o seu dia. A próxima parada aparece aqui.</Text>
                <TouchableOpacity style={styles.heroBtn} onPress={() => { Haptics.selectionAsync().catch(() => {}); (nav as any).navigate('Tabs', { screen: 'Agenda' }); }} activeOpacity={0.85}>
                  <MaterialCommunityIcons name="calendar-plus" size={18} color={textoSobre(cores.accentLight)} />
                  <Text style={styles.heroBtnText}>Abrir agenda</Text>
                </TouchableOpacity>
              </View>
            )}
          </LinearGradient>
        </AnimatedEntrance>

        {/* DICA (1º uso) — de onde sai um orçamento. O botão central "Orçar" da
            tab bar abre NovoOrcamento (ver CenterButton no AppNavigator). */}
        <View style={{ paddingHorizontal: Spacing.base }}>
          <DicaContextual
            id="home.botao-orcar"
            icon="plus-circle-outline"
            texto="O botão central da barra de baixo (Orçar) cria um novo orçamento. É por ali que começa toda proposta."
          />
        </View>

        {/* KPIs */}
        {carregando ? (
          <View style={styles.kpis}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[styles.kpi, { height: 96, justifyContent: 'center', gap: 8 }]}>
                <OlliSkeleton width="70%" height={19} />
                <OlliSkeleton width="50%" height={11} />
              </View>
            ))}
          </View>
        ) : carregandoErro ? (
          <View style={{ paddingHorizontal: Spacing.base, marginTop: Spacing.sm }}>
            <View style={styles.cobrancaAviso}>
              <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
              <Text style={styles.cobrancaAvisoTexto}>Não deu para carregar seus números agora.</Text>
              <TouchableOpacity onPress={load} activeOpacity={0.8}>
                <Text style={styles.cobrancaAvisoAcao}>Tentar de novo</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <AnimatedEntrance index={1}>
            <View style={styles.kpis}>
              <View style={styles.kpi}>
                <CountUp value={faturamento} format="currency" style={[styles.kpiValue, { color: cores.onSurface }]} />
                <Text style={styles.kpiLabel}>aprovados</Text>
                <Text style={styles.kpiHint}>valor fechado</Text>
              </View>
              <View style={styles.kpiDivider} />
              <View style={styles.kpi}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <CountUp value={conversao} format="int" style={[styles.kpiValue, { color: cores.onSurface }]} duration={600} />
                  <Text style={[styles.kpiValue, { color: cores.onSurface }]}>%</Text>
                </View>
                <Text style={styles.kpiHint}>{conversaoDetalhe}</Text>
                <Text style={styles.kpiLabel}>conversão</Text>
              </View>
              <View style={styles.kpiDivider} />
              <View style={styles.kpi}>
                <CountUp value={emAbertoResumo.contagem} format="int" style={[styles.kpiValue, { color: cores.onSurface }]} duration={500} />
                <Text style={styles.kpiLabel}>em aberto</Text>
                <Text style={[styles.kpiHint, paradosResumo.contagem > 0 && styles.kpiHintWarn]}>{emAbertoDetalhe}</Text>
              </View>
            </View>
          </AnimatedEntrance>
        )}

        {/* RADAR DE CLIENTES — clientes já atendidos que sumiram (>= 5 meses) */}
        {radarCarregando ? (
          <View style={{ paddingHorizontal: Spacing.base, marginTop: Spacing.xl, gap: 10 }}>
            <OlliSkeleton width="45%" height={16} />
            <View style={styles.radarCard}>
              <OlliSkeleton width={42} height={42} radius={21} />
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <OlliSkeleton width="55%" height={14} />
                <OlliSkeleton width="35%" height={12} />
              </View>
            </View>
          </View>
        ) : radarErro ? (
          <>
            <Text style={styles.sectionTitle}>Radar de clientes</Text>
            <View style={{ paddingHorizontal: Spacing.base }}>
              <View style={styles.cobrancaAviso}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
                <Text style={styles.cobrancaAvisoTexto}>Não deu para carregar o radar de clientes agora.</Text>
                <TouchableOpacity onPress={loadRadar} activeOpacity={0.8}>
                  <Text style={styles.cobrancaAvisoAcao}>Tentar de novo</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : radar.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Radar de clientes</Text>
            <View style={{ paddingHorizontal: Spacing.base, gap: 10 }}>
              {radar.map((item, i) => (
                <AnimatedEntrance key={item.cliente.id} index={2 + i}>
                  <View style={styles.radarCard}>
                    <View style={styles.radarTop}>
                      <View style={styles.radarAvatar}>
                        <Text style={styles.radarAvatarText}>{item.cliente.nome.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.radarName} numberOfLines={1}>{item.cliente.nome}</Text>
                        <Text style={styles.radarMeta}>há {item.mesesSemContato} {item.mesesSemContato === 1 ? 'mês' : 'meses'} sem contato</Text>
                      </View>
                    </View>
                    <View style={styles.radarActions}>
                      <OlliPressable style={styles.radarBtnPrimary} onPress={() => chamarNoWhatsApp(item)} haptic={false}>
                        <MaterialCommunityIcons
                          name="whatsapp"
                          size={16}
                          color="#0A1626" // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)
                        />
                        <Text style={styles.radarBtnPrimaryText}>Chamar no WhatsApp</Text>
                      </OlliPressable>
                      <OlliPressable style={styles.radarBtnGhost} onPress={() => adiarRadar(item)} disabled={adiandoId === item.cliente.id} haptic={false}>
                        <Text style={styles.radarBtnGhostText}>Adiar 30 dias</Text>
                      </OlliPressable>
                    </View>
                  </View>
                </AnimatedEntrance>
              ))}

              {radarBloqueados > 0 && (
                <AnimatedEntrance index={2 + radar.length}>
                  <OlliPressable style={styles.radarTeaser} onPress={() => irParaPlanos('radar_card')} haptic="selection">
                    <View style={styles.radarTeaserIcon}>
                      <MaterialCommunityIcons name="lock-outline" size={18} color={cores.plan} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.radarTeaserTitle}>
                        +{radarBloqueados} cliente{radarBloqueados > 1 ? 's' : ''} sumido{radarBloqueados > 1 ? 's' : ''} esperando
                      </Text>
                      <Text style={styles.radarTeaserSub}>Veja todos e reative com 1 toque no Pro</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={cores.plan} />
                  </OlliPressable>
                </AnimatedEntrance>
              )}
            </View>
          </>
        ) : null}

        {/* RADAR DE COBRANÇA — orçamentos aprovados sem recibo (dinheiro parado).
            3 estados explícitos: carregando (skeleton) / erro (nunca vira "vazio")
            / vazio de verdade ("tudo recebido"). */}
        {cobrancaCarregando ? (
          <View style={{ paddingHorizontal: Spacing.base, marginTop: Spacing.xl, gap: 10 }}>
            <OlliSkeleton width="50%" height={16} />
            <View style={styles.radarCard}>
              <OlliSkeleton width={42} height={42} radius={21} />
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <OlliSkeleton width="60%" height={14} />
                <OlliSkeleton width="35%" height={12} />
              </View>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Radar de cobrança</Text>
            {cobrancaErro ? (
              <View style={{ paddingHorizontal: Spacing.base }}>
                <View style={styles.cobrancaAviso}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
                  <Text style={styles.cobrancaAvisoTexto}>Não deu para carregar o radar de cobrança agora.</Text>
                  <TouchableOpacity onPress={loadCobranca} activeOpacity={0.8}>
                    <Text style={styles.cobrancaAvisoAcao}>Tentar de novo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : cobranca.length === 0 ? (
              <View style={{ paddingHorizontal: Spacing.base }}>
                <View style={styles.cobrancaVazio}>
                  <MaterialCommunityIcons name="check-circle-outline" size={20} color={cores.success} />
                  <Text style={styles.cobrancaVazioTexto}>Tudo recebido — nenhum orçamento aprovado esperando pagamento.</Text>
                </View>
              </View>
            ) : (
              <View style={{ paddingHorizontal: Spacing.base, gap: 10 }}>
                <Text style={styles.cobrancaResumo}>
                  {cobranca.length} orçamento{cobranca.length > 1 ? 's' : ''} aprovado{cobranca.length > 1 ? 's' : ''} sem pagamento · {formatCurrency(valorCobranca)} parado
                </Text>
                {cobranca.slice(0, 3).map((item, i) => (
                  <AnimatedEntrance key={item.orcamento.id} index={2 + i}>
                    <View style={styles.radarCard}>
                      <View style={styles.radarTop}>
                        <View style={styles.radarAvatar}>
                          <Text style={styles.radarAvatarText}>{item.orcamento.clienteNome.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.radarName} numberOfLines={1}>{item.orcamento.clienteNome}</Text>
                          <Text style={styles.radarMeta}>
                            {formatCurrency(item.valor)} · {item.diasParado} {item.diasParado === 1 ? 'dia' : 'dias'} parado
                          </Text>
                        </View>
                      </View>
                      <View style={styles.radarActions}>
                        <OlliPressable style={styles.radarBtnPrimary} onPress={() => cobrarNoWhatsApp(item)} haptic={false}>
                          <MaterialCommunityIcons
                            name="whatsapp"
                            size={16}
                            color="#0A1626" // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)
                          />
                          <Text style={styles.radarBtnPrimaryText}>Cobrar no WhatsApp</Text>
                        </OlliPressable>
                      </View>
                    </View>
                  </AnimatedEntrance>
                ))}
              </View>
            )}
          </>
        )}

        {/* ANZOL — Diagnóstico por código de erro (offline, único no BR) */}
        <AnimatedEntrance index={2}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Diagnostico'); }}
          >
            <LinearGradient
              colors={['rgba(11,111,206,0.30)', 'rgba(52,198,217,0.10)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.anzol}
            >
              <View style={styles.anzolIcon}>
                <MaterialCommunityIcons name="card-search-outline" size={26} color={cores.accentLight} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.anzolTitle}>Diagnóstico de erro</Text>
                <Text style={styles.anzolSub}>698 códigos de ar-condicionado · ache a falha em segundos, offline</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={cores.accentLight} />
            </LinearGradient>
          </TouchableOpacity>
        </AnimatedEntrance>

        {/* LEMBRETE DA OLLI — orçamentos parados */}
        {paradosResumo.contagem > 0 && (
          <AnimatedEntrance index={2}>
            <View style={styles.lembrete}>
              <OlliMascot size={40} float={false} onDark />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.lembreteTitle}>{paradosResumo.contagem} orçamento{paradosResumo.contagem > 1 ? 's' : ''} parado{paradosResumo.contagem > 1 ? 's' : ''} há +5 dias</Text>
                <Text style={styles.lembreteSub}>{formatCurrency(valorParado)} em jogo. Priorize o follow-up.</Text>
              </View>
              <TouchableOpacity style={styles.cobrarBtn} onPress={() => nav.navigate('Orcamentos')} activeOpacity={0.85}>
                <Text style={styles.cobrarText}>Cobrar</Text>
              </TouchableOpacity>
            </View>
          </AnimatedEntrance>
        )}

        <Text style={styles.sectionTitle}>Mais atalhos</Text>
        <AnimatedEntrance index={3}>
          <View style={styles.processCard}>
            <View style={styles.processGrid}>
              <ShortcutTile
                icon="format-list-bulleted"
                label="Todos os orçamentos"
                tone={cores.accentLight}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Orcamentos'); }}
              />
              <ShortcutTile
                icon="cube-outline"
                label="Produtos"
                tone={cores.primaryLight}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Produtos'); }}
              />
              <ShortcutTile
                icon="card-search-outline"
                label="Diagnóstico IA"
                tone={cores.accentLight}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('DiagnosticoIA', {}); }}
              />
            </View>

            <View style={styles.processActions}>
              <TouchableOpacity style={styles.processPrimary} onPress={() => { Haptics.selectionAsync().catch(() => {}); (nav as any).navigate('Tabs', { screen: 'Agenda' }); }} activeOpacity={0.85}>
                <Text style={styles.processPrimaryText}>Abrir agenda</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.processGhost} onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('MeuNegocio'); }} activeOpacity={0.85}>
                <Text style={styles.processGhostText}>Meu negócio</Text>
              </TouchableOpacity>
            </View>
          </View>
        </AnimatedEntrance>

        {!carregando && !carregandoErro && totalOrcamentos === 0 && (
          <AnimatedEntrance index={3}>
            <StarterCard
              onCreate={() => nav.navigate('NovoOrcamento', {})}
              onVoice={() => nav.navigate('OlliVoz')}
              onSetup={() => nav.navigate('MeuNegocio')}
            />
          </AnimatedEntrance>
        )}

        {/* AÇÕES RÁPIDAS */}
        <Text style={styles.sectionTitle}>Ações rápidas</Text>
        <AnimatedEntrance index={4}>
          <View style={styles.actions}>
            {ehTecnico && (
              <Action icon="clipboard-check-outline" label={rotuloOS} color={cores.accentLight} onPress={() => nav.navigate('OrdemServico')} />
            )}
            <Action icon="file-plus" label="Orçar" color={cores.accentLight} onPress={() => nav.navigate('NovoOrcamento', {})} />
            <Action icon="receipt" label="Recibo" color={cores.success} onPress={() => nav.navigate('EmitirRecibo', {})} />
            <Action icon="account-group" label="Clientes" color={corCategoria('#A78BFA', cores.surface)} onPress={() => nav.navigate('Clientes')} />
            {!ehTecnico && (
              <Action icon="clipboard-check-outline" label={rotuloOS} color={cores.accentLight} onPress={() => nav.navigate('OrdemServico')} />
            )}
            <Action icon="wrench" label="Serviços" color={cores.primaryLight} onPress={() => nav.navigate('Servicos')} />
          </View>
        </AnimatedEntrance>

        {/* RESTO DO DIA / ATIVIDADE RECENTE */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Orçamentos recentes</Text>
          <TouchableOpacity onPress={() => nav.navigate('Orcamentos')}>
            <Text style={styles.seeAll}>ver todos</Text>
          </TouchableOpacity>
        </View>

        {carregando ? (
          <View style={{ paddingHorizontal: Spacing.base, gap: 10 }}>
            {[0, 1].map(i => (
              <View key={i} style={styles.recentCard}>
                <OlliSkeleton width={42} height={42} radius={21} />
                <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                  <OlliSkeleton width="55%" height={14} />
                  <OlliSkeleton width="35%" height={12} />
                </View>
              </View>
            ))}
          </View>
        ) : carregandoErro ? (
          <View style={styles.emptyRecent}>
            <EmptyState
              icon="alert-circle-outline"
              title="Não deu para carregar"
              subtitle="Não conseguimos buscar seus orçamentos agora. Verifique a conexão e tente de novo."
              actionLabel="Tentar de novo"
              onAction={load}
            />
          </View>
        ) : recentes.length === 0 ? (
          <View style={styles.emptyRecent}>
            <EmptyState
              icon="file-document-outline"
              title="Nenhum orçamento ainda"
              subtitle="Crie o primeiro orçamento para começar a acompanhar seus atendimentos."
              actionLabel="Criar o primeiro"
              onAction={() => nav.navigate('NovoOrcamento', {})}
            />
          </View>
        ) : (
          <View style={{ paddingHorizontal: Spacing.base, gap: 10 }}>
            {recentes.map((o, i) => (
              <AnimatedEntrance key={o.id} index={4 + i}>
                <TouchableOpacity style={styles.recentCard} onPress={() => nav.navigate('VisualizarOrcamento', { orcamentoId: o.id })} activeOpacity={0.85}>
                  <View style={styles.recentAvatar}><Text style={styles.recentAvatarText}>{o.clienteNome.charAt(0).toUpperCase()}</Text></View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.recentName} numberOfLines={1}>{o.clienteNome}</Text>
                    <Text style={styles.recentMeta}>Nº {o.numero} · {formatDate(o.criadoEm)}</Text>
                    <View style={{ marginTop: 5 }}><StatusBadge status={o.status} size="sm" /></View>
                  </View>
                  <Text style={styles.recentValue}>{formatCurrency(o.valorTotal)}</Text>
                </TouchableOpacity>
              </AnimatedEntrance>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Home limpa (design 01): OLLI fica no robô do topo-direito (abre voz+chat)
          e o Orçamento é o botão central elevado da tab bar. Sem FABs sobrepostos. */}

      {/* MENU RÁPIDO DA OLLI (robô no topo) */}
      <Modal visible={olliMenu} transparent animationType="fade" onRequestClose={() => setOlliMenu(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setOlliMenu(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <View style={styles.sheetMascot}><OlliMascot size={34} onDark float={false} /></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.sheetTitle}>Oi, eu sou a OLLI</Text>
                <Text style={styles.sheetSub}>Como posso te ajudar agora?</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.sheetItem} onPress={() => irPara('OlliVoz')} activeOpacity={0.8}>
              <View style={[styles.sheetIcon, { backgroundColor: 'rgba(52,198,217,0.14)', borderColor: 'rgba(52,198,217,0.34)' }]}>
                <MaterialCommunityIcons name="microphone" size={22} color={cores.accentLight} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.sheetItemTitle}>Montar orçamento por voz</Text>
                <Text style={styles.sheetItemDesc}>Fale o serviço e eu monto pra você</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={cores.onSurfaceMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetItem} onPress={() => irPara('OlliChat')} activeOpacity={0.8}>
              <View style={[styles.sheetIcon, { backgroundColor: 'rgba(11,111,206,0.18)', borderColor: 'rgba(11,111,206,0.36)' }]}>
                <MaterialCommunityIcons name="chat-processing-outline" size={22} color={cores.primaryLight} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.sheetItemTitle}>Conversar com a OLLI</Text>
                <Text style={styles.sheetItemDesc}>Tire dúvidas técnicas, preços e diagnóstico</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={cores.onSurfaceMuted} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StarterCard({ onCreate, onVoice, onSetup }: { onCreate: () => void; onVoice: () => void; onSetup: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.starterCard}>
      <View style={styles.starterTop}>
        <View style={styles.starterIcon}>
          <MaterialCommunityIcons name="rocket-launch-outline" size={23} color={cores.accentLight} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.starterTitle}>Primeiro orçamento em minutos</Text>
          <Text style={styles.starterSub}>Fale o serviço, revise os itens e gere um PDF com cara de empresa grande.</Text>
        </View>
      </View>
      <View style={styles.starterSteps}>
        <MiniStep n="1" text="cliente" />
        <MiniStep n="2" text="itens" />
        <MiniStep n="3" text="PDF/link" />
      </View>
      <View style={styles.starterActions}>
        <TouchableOpacity style={styles.starterPrimary} onPress={onVoice} activeOpacity={0.86}>
          <MaterialCommunityIcons name="microphone" size={17} color={textoSobre(cores.accentLight)} />
          <Text style={styles.starterPrimaryText}>Criar por voz</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.starterGhost} onPress={onCreate} activeOpacity={0.86}>
          <Text style={styles.starterGhostText}>Manual</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.starterSetup} onPress={onSetup} activeOpacity={0.8}>
        <MaterialCommunityIcons name="storefront-outline" size={15} color={cores.onSurfaceVariant} />
        <Text style={styles.starterSetupText}>Configurar logo, PIX e assinatura</Text>
      </TouchableOpacity>
    </View>
  );
}

function MiniStep({ n, text }: { n: string; text: string }) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.miniStep}>
      <Text style={styles.miniStepN}>{n}</Text>
      <Text style={styles.miniStepText}>{text}</Text>
    </View>
  );
}

function ShortcutTile({ icon, label, tone, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; tone: string; onPress: () => void }) {
  const styles = useEstilos(criarEstilos);
  return (
    <TouchableOpacity style={styles.processMetric} onPress={onPress} activeOpacity={0.8}>
      <MaterialCommunityIcons name={icon} size={20} color={tone} />
      <Text style={styles.processMetricValue} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

function Action({ icon, label, color, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; color: string; onPress: () => void }) {
  const styles = useEstilos(criarEstilos);
  return (
    <TouchableOpacity style={styles.action} onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} activeOpacity={0.8}>
      <View style={[styles.actionIcon, { backgroundColor: color + '22', borderColor: color + '44' }]}>
        <MaterialCommunityIcons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  syncPill: {
    position: 'absolute', alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    // Pill sempre escura de propósito (como um toast), nos dois modos — sem chave
    // que represente "fundo escuro fixo" (ver rule 7 da migração). Por ser fundo
    // escuro fixo, o primeiro plano usa o ciano vivo (accent): accentLight aqui
    // vira #197884 no claro e cai a ~3.5:1 sobre a pill (texto reprova AA).
    backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: c.strokeGlow,
    borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6,
    ...sombrasDe(c).sm,
  },
  syncPillText: { fontSize: 11.5, fontWeight: '700', color: c.accent }, // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 2.88:1 (7.25:1)
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, marginBottom: 4 },
  greeting: { fontSize: 13, color: c.onSurfaceVariant, fontWeight: '500' },
  name: { fontSize: 21, fontWeight: '800', color: c.onBackground, marginTop: 1 },
  company: { fontSize: 13, fontWeight: '600', color: c.onSurfaceMuted },
  // Cyan fixo (base #7FE9F5, não a cor de marca escolhida): decorativo, sem chave semântica exata.
  olliBtn: { width: 48, height: 48, borderRadius: 15, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.3)', justifyContent: 'center', alignItems: 'center' },
  olliBadge: { position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: c.danger, borderWidth: 2, borderColor: c.background, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  // Branco fixo: convenção universal de badge de notificação sobre uma cor de
  // status saturada — sem chave "onDanger" na paleta (ver rule 7).
  olliBadgeText: { fontSize: 9.5, fontWeight: '800', color: '#fff' },

  // HERO: gradiente translúcido inline (não um dos `Gradients` do tema) por cima
  // do fundo da tela — em claro isso vira um azul bem claro, não um "sempre
  // escuro" como o GradientHeader. Os textos abaixo (branco/rgba claros) foram
  // desenhados para o cockpit escuro original e NÃO foram redesenhados para
  // manter contraste no modo claro; corrigir isso é uma decisão de design (não
  // uma troca mecânica de chave) e fica fora do escopo desta migração — ver
  // resumo da tarefa. O mesmo vale para `anzol` e `lembrete` abaixo (mesmo
  // padrão de tinta translúcida sobre o fundo da tela).
  hero: { margin: Spacing.base, borderRadius: BorderRadius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: c.strokeGlow, ...sombrasDe(c).md },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.success },
  // Sem cor: o hero deriva a sua do fundo EFETIVO (véu achatado). Ver VEU_HERO.
  liveLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0 },
  heroEmpty: { alignItems: 'center', paddingVertical: 14 },
  heroEmptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 8 },
  heroEmptySub: { fontSize: 12.5, textAlign: 'center', marginTop: 4, lineHeight: 18, paddingHorizontal: 10 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 17, paddingVertical: 11, marginTop: 14 },
  heroBtnText: { fontSize: 13, fontWeight: '800', color: textoSobre(c.accentLight) },

  // Próxima parada preenchida (próximo agendamento real)
  heroFilled: { marginTop: 12 },
  heroWhen: { fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  heroClient: { fontSize: 19, fontWeight: '800', marginTop: 4 },
  heroType: { fontSize: 13, marginTop: 2 },
  heroAddr: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  heroAddrText: { flex: 1, fontSize: 12.5 },
  heroEta: { marginTop: 8, alignItems: 'flex-start' },
  // "Estou a caminho" (item 1.3): mesmo verde/contraste do botão de WhatsApp
  // do Radar de clientes (radarBtnPrimary) — convenção única pra "ação de
  // WhatsApp" no app inteiro.
  heroWhatsBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, backgroundColor: c.whatsapp, borderRadius: BorderRadius.full, paddingVertical: 11, marginTop: 10 },
  heroWhatsBtnText: { fontSize: 13.5, fontWeight: '800', color: '#0A1626' }, // contraste-ok: sobre c.whatsapp #25D366 (9.16:1)
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  heroBtnGhost: { borderWidth: 1, borderColor: c.strokeGlow, backgroundColor: c.surfacePressed, borderRadius: BorderRadius.full, paddingHorizontal: 16, paddingVertical: 10 },
  heroBtnGhostText: { fontSize: 13, fontWeight: '800' },

  kpis: { flexDirection: 'row', backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outlineDark, marginHorizontal: Spacing.base, paddingVertical: 14 },
  kpi: { flex: 1, alignItems: 'center' },
  kpiValue: { ...Typography.value, fontSize: 19, color: c.onSurface },
  kpiLabel: { fontSize: 11, color: c.onSurfaceVariant, marginTop: 3, fontWeight: '500' },
  kpiHint: { fontSize: 10.5, color: c.onSurfaceMuted, marginTop: 2, fontWeight: '700', textAlign: 'center' },
  kpiHintWarn: { color: c.warning },
  kpiDivider: { width: 1, backgroundColor: c.outline, marginVertical: 4 },

  anzol: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.base, marginTop: 12, padding: Spacing.base, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.strokeGlow },
  anzolIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.3)', justifyContent: 'center', alignItems: 'center' },
  anzolTitle: { fontSize: 15.5, fontWeight: '800', color: '#fff' },
  anzolSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2, lineHeight: 16 },

  lembrete: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.3)', borderRadius: BorderRadius.xl, padding: Spacing.md, marginHorizontal: Spacing.base, marginTop: 12 },
  lembreteTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  lembreteSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 1 },
  cobrarBtn: { backgroundColor: c.warning, borderRadius: BorderRadius.full, paddingHorizontal: 16, paddingVertical: 8 },
  cobrarText: { fontSize: 13, fontWeight: '800', color: textoSobre(c.warning) },

  processCard: { marginHorizontal: Spacing.base, backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.base, ...sombrasDe(c).sm },
  processGrid: { flexDirection: 'row', gap: 8 },
  processMetric: { flex: 1, minHeight: 74, backgroundColor: c.surfacePressed, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.md, padding: 10, justifyContent: 'center', alignItems: 'center', gap: 6 },
  processMetricValue: { fontSize: 11.5, color: c.onSurface, fontWeight: '800', textAlign: 'center' },
  processActions: { flexDirection: 'row', gap: 9, marginTop: 14 },
  processPrimary: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentLight, borderRadius: BorderRadius.full, paddingVertical: 11 },
  processPrimaryText: { fontSize: 13, fontWeight: '800', color: textoSobre(c.accentLight) },
  processGhost: { minWidth: 112, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.strokeGlow, backgroundColor: c.surfacePressed, borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 11 },
  processGhostText: { fontSize: 13, fontWeight: '800', color: c.accentLight },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.onBackground, paddingHorizontal: Spacing.base, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: Spacing.base },
  seeAll: { fontSize: 12.5, color: c.accentLight, fontWeight: '700', marginTop: Spacing.xl, marginBottom: Spacing.sm },

  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.base },
  action: { alignItems: 'center', flex: 1 },
  actionIcon: { width: 58, height: 58, borderRadius: BorderRadius.lg, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  actionLabel: { fontSize: 11.5, color: c.onSurfaceVariant, marginTop: 6, fontWeight: '600' },

  starterCard: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.lg,
    padding: Spacing.base,
    borderRadius: BorderRadius.xl,
    backgroundColor: c.surfaceGlass,
    borderWidth: 1,
    borderColor: c.strokeGlow,
    ...sombrasDe(c).md,
  },
  starterTop: { flexDirection: 'row', alignItems: 'center' },
  starterIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.32)', justifyContent: 'center', alignItems: 'center' },
  starterTitle: { fontSize: 15.5, fontWeight: '800', color: c.onSurface },
  starterSub: { fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 17, marginTop: 2 },
  starterSteps: { flexDirection: 'row', gap: 8, marginTop: 14 },
  miniStep: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.surfacePressed, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.full, paddingVertical: 8 },
  miniStepN: { width: 18, height: 18, borderRadius: 9, overflow: 'hidden', backgroundColor: c.accentLight, textAlign: 'center', color: textoSobre(c.accentLight), fontSize: 11, fontWeight: '800', lineHeight: 18 },
  miniStepText: { fontSize: 11.5, fontWeight: '700', color: c.onSurfaceVariant },
  starterActions: { flexDirection: 'row', gap: 9, marginTop: 14 },
  starterPrimary: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, backgroundColor: c.accentLight, borderRadius: BorderRadius.full, paddingVertical: 12 },
  starterPrimaryText: { fontSize: 13.5, fontWeight: '800', color: textoSobre(c.accentLight) },
  starterGhost: { minWidth: 88, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.strokeGlow, backgroundColor: c.surfacePressed },
  starterGhostText: { fontSize: 13.5, fontWeight: '800', color: c.accentLight },
  starterSetup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  starterSetupText: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant },

  emptyRecent: { paddingHorizontal: Spacing.base, minHeight: 220 },

  radarCard: { backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.md },
  radarTop: { flexDirection: 'row', alignItems: 'center' },
  radarAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(247,178,59,0.16)', justifyContent: 'center', alignItems: 'center' },
  radarAvatarText: { fontSize: 17, fontWeight: '800', color: c.warning },
  radarName: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  radarMeta: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  radarActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  radarBtnPrimary: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: c.whatsapp, borderRadius: BorderRadius.full, paddingVertical: 10 },
  radarBtnPrimaryText: { fontSize: 12.5, fontWeight: '800', color: '#0A1626' }, // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)
  radarBtnGhost: { justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.strokeGlow, backgroundColor: c.surfacePressed, paddingHorizontal: 14, paddingVertical: 10 },
  radarBtnGhostText: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },

  // RADAR DE COBRANÇA — resumo + estados erro/vazio (nunca colapsados um no outro).
  cobrancaResumo: { fontSize: 12.5, color: c.onSurfaceVariant, fontWeight: '600' },
  cobrancaAviso: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.3)', borderRadius: BorderRadius.xl, padding: Spacing.md },
  cobrancaAvisoTexto: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant },
  cobrancaAvisoAcao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  cobrancaVazio: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceGlass, borderWidth: 1, borderColor: c.outlineDark, borderRadius: BorderRadius.xl, padding: Spacing.md },
  cobrancaVazioTexto: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant },

  radarTeaser: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(124,58,237,0.10)', borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: 'rgba(124,58,237,0.32)', padding: Spacing.md, gap: 12 },
  radarTeaserIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(124,58,237,0.16)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.34)', justifyContent: 'center', alignItems: 'center' },
  radarTeaserTitle: { fontSize: 13.5, fontWeight: '800', color: '#fff' },
  radarTeaserSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 1 },

  recentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.md },
  recentAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(11,111,206,0.2)', justifyContent: 'center', alignItems: 'center' },
  recentAvatarText: { fontSize: 17, fontWeight: '800', color: c.accentLight },
  recentName: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  recentMeta: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  recentValue: { fontSize: 15, fontWeight: '800', color: c.accentLight, marginLeft: 8 },

  // Scrim do bottom sheet: escurece o fundo sempre, nos dois modos (convenção
  // padrão de overlay de modal — sem chave "scrim" na paleta).
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(5,12,22,0.72)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outline, paddingHorizontal: Spacing.base, paddingTop: 10, paddingBottom: 32 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.outlineDark, marginBottom: Spacing.base },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.base },
  sheetMascot: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.3)', justifyContent: 'center', alignItems: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: c.onSurface },
  sheetSub: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.md, marginBottom: 10 },
  sheetIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  sheetItemTitle: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  sheetItemDesc: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2 },
});
