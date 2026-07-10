import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  Animated, Easing, Platform, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, Typography, useCores, useGradientes, useEstilos, sombrasDe, comAlfa, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliMascot } from '../components/OlliMascot';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { RootStackParamList } from '../navigation/AppNavigator';
import { interpretarVoz, VozResultadoOk, VozItem } from '../services/olliAssistente';
import { useReconhecimentoVoz, vozProvavelmenteDisponivel } from '../services/reconhecimentoVoz';
import { useGravadorNuvem } from '../services/vozNuvem';
import {
  getNextOrcamentoNumber, saveOrcamento, getServicos,
} from '../database/database';
import { Orcamento, ItemOrcamento, FormaPagamento } from '../types';
import { generateId } from '../utils/id';
import { nowISO, todayISO } from '../utils/date';
import { formatCurrency, parseNumber } from '../utils/currency';
import { track, Eventos } from '../services/analytics';
import { goBackOrHome } from '../navigation/safeBack';
import { usePlano } from '../hooks/usePlano';
import { IA_USOS_GRATIS_MES } from '../services/planos';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const isWeb = Platform.OS === 'web';
const useNativeAnimations = !isWeb;

/** Depois de quantos segundos de "enviando" o botão "Cancelar" aparece. */
const SEGUNDOS_PARA_MOSTRAR_CANCELAR = 5;

/** Gradiente do microfone durante a gravação em nuvem (pulso vermelho, gravando). */
const GRADIENT_GRAVANDO = ['#FF6B6B', '#C0392B'] as const;

/** Reexportado para telas que já importavam este helper (ex.: HomeScreen). */
export function isVozDisponivel(): boolean {
  return vozProvavelmenteDisponivel();
}

type Fase = 'inicial' | 'ouvindo' | 'enviando' | 'revisao' | 'erro';

/** Bloco de carregamento enquanto checamos se o aparelho tem serviço de voz instalado. */
function CheckandoVozBloco() {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.checandoWrap}>
      <OlliSkeleton width={140} height={140} radius={70} />
      <View style={{ height: 18 }} />
      <OlliSkeleton width="70%" height={13} />
      <View style={{ height: 8 }} />
      <OlliSkeleton width="50%" height={13} />
    </View>
  );
}

interface ItemEditavel {
  id: string;
  descricao: string;
  quantidade: number;
  /** null = "definir" (preço a combinar depois) */
  valorUnitario: number | null;
  tipo: 'servico' | 'peca';
}

const defaultFormas: FormaPagamento = { credito: false, debito: false, dinheiro: false, pix: true };

function vozItemParaEditavel(it: VozItem): ItemEditavel {
  return {
    id: generateId(),
    descricao: it.descricao,
    quantidade: it.quantidade > 0 ? it.quantidade : 1,
    valorUnitario: it.valorUnitario,
    tipo: it.tipo,
  };
}

/** Constrói um Orçamento rascunho a partir da revisão e grava no MESMO CRUD do app. */
function montarOrcamento(
  numero: string,
  titulo: string | undefined,
  clienteNome: string | undefined,
  itensEdit: ItemEditavel[],
  observacao: string | undefined,
): Orcamento {
  const itens: ItemOrcamento[] = itensEdit.map(e => {
    const preco = e.valorUnitario ?? 0;
    return {
      id: generateId(),
      // o orçamento do app só conhece 'servico' | 'produto' — 'peca' vira 'produto'
      tipo: e.tipo === 'peca' ? 'produto' : 'servico',
      catalogoId: '',
      nome: e.descricao,
      preco,
      quantidade: e.quantidade,
      unidade: 'un',
      subtotal: preco * e.quantidade,
    };
  });

  const subtotalServicos = itens.filter(i => i.tipo === 'servico').reduce((s, i) => s + i.subtotal, 0);
  const subtotalProdutos = itens.filter(i => i.tipo === 'produto').reduce((s, i) => s + i.subtotal, 0);
  const subtotal = subtotalServicos + subtotalProdutos;

  const infoAdicional = [titulo ? `Pedido: ${titulo}` : '', observacao ?? '']
    .filter(Boolean)
    .join('\n')
    .trim();

  return {
    id: generateId(),
    numero,
    clienteId: '',
    clienteNome: (clienteNome ?? '').trim(),
    clienteTelefone: '',
    itens,
    subtotalServicos,
    subtotalProdutos,
    subtotal,
    desconto: 0,
    descontoTipo: 'valor',
    valorTotal: subtotal,
    status: 'rascunho',
    dataEmissao: todayISO(),
    informacoesAdicionais: infoAdicional || undefined,
    formasPagamento: defaultFormas,
    exibirAssinatura: true,
    solicitarAssinaturaCliente: false,
    exibirAprovacao: true,
    exibirRecusa: true,
    criadoEm: nowISO(),
    atualizadoEm: nowISO(),
  };
}

export default function OlliVozScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  const { usosIaRestantes, consumirUsoIa } = usePlano();
  const iaEsgotada = usosIaRestantes <= 0;

  const [fase, setFase] = useState<Fase>('inicial');
  const [transcript, setTranscript] = useState('');
  const [parcial, setParcial] = useState(''); // resultado interim do reconhecimento
  const [erro, setErro] = useState<string | null>(null);
  const [permissaoNegadaPermanente, setPermissaoNegadaPermanente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [podeCancelar, setPodeCancelar] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cancelarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 'dispositivo' = reconhecimento de fala nativo (grátis, sem internet depois
  // de ouvir); 'nuvem' = grava o áudio com expo-audio e manda pro Worker
  // transcrever com o Gemini — funciona em QUALQUER aparelho com microfone,
  // mesmo sem o serviço de voz do Google instalado/habilitado.
  const [modoVoz, setModoVoz] = useState<'dispositivo' | 'nuvem'>('dispositivo');
  const [catalogoVoz, setCatalogoVoz] = useState<{ nome: string; preco?: number }[] | undefined>(undefined);

  // revisão
  const [titulo, setTitulo] = useState('');
  const [clienteNome, setClienteNome] = useState('');
  const [itens, setItens] = useState<ItemEditavel[]>([]);
  const [observacao, setObservacao] = useState('');

  // animação do "pulso" do microfone enquanto ouve — duas ondas concêntricas
  // defasadas simulam o indicador vivo de escuta (nunca fica parado enquanto
  // o motor de voz está de fato capturando áudio).
  const pulse = useRef(new Animated.Value(0)).current;
  const pulseOuter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (fase !== 'ouvindo') {
      pulse.stopAnimation();
      pulseOuter.stopAnimation();
      pulse.setValue(0);
      pulseOuter.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: useNativeAnimations }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: useNativeAnimations }),
      ])
    );
    const loopOuter = Animated.loop(
      Animated.sequence([
        Animated.delay(450),
        Animated.timing(pulseOuter, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: useNativeAnimations }),
        Animated.timing(pulseOuter, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: useNativeAnimations }),
      ])
    );
    loop.start();
    loopOuter.start();
    return () => { loop.stop(); loopOuter.stop(); };
  }, [fase, pulse, pulseOuter]);

  const voz = useReconhecimentoVoz({
    onParcial: setParcial,
    onFinal: (t) => {
      setTranscript(prev => (prev ? prev + ' ' : '') + t);
      setParcial('');
    },
    onErro: (m, opts) => {
      // Erros do tipo "esse aparelho não tem/aceita o motor local" sugerem a
      // nuvem em vez de insistir num microfone que nunca vai responder.
      if (opts?.sugerirNuvem) {
        setModoVoz('nuvem');
        setErro(null);
        setParcial('');
        setFase('inicial');
        return;
      }
      setErro(m);
      setPermissaoNegadaPermanente(!!opts?.permissaoNegadaPermanente);
      setParcial('');
      setFase('erro');
    },
    onFimEscuta: () => {
      // limite de reinícios sem resultado atingido (silêncio prolongado):
      // volta para o estado inicial sem tratar como erro fatal
      setFase(prev => (prev === 'ouvindo' ? 'inicial' : prev));
    },
  });
  // vozOk = motor existe E (para Android) há um serviço de reconhecimento
  // instalado — só depois da checagem assíncrona terminar. Enquanto isso,
  // tratamos como indisponível para não mostrar um microfone que não responde.
  const vozOk = voz.disponivel && !voz.checandoDisponibilidade;

  // Assim que a checagem de disponibilidade do motor local termina, decide o
  // modo inicial: se o aparelho tem reconhecimento nativo, usamos ele
  // (funciona sem gastar dados depois de ouvir); senão caímos direto na
  // nuvem — nunca sobra um "beco sem saída" sem microfone algum.
  useEffect(() => {
    if (voz.checandoDisponibilidade) return;
    if (!voz.disponivel) setModoVoz('nuvem');
  }, [voz.checandoDisponibilidade, voz.disponivel]);

  // Catálogo de serviços (nome + preço) pro Gemini casar descrições com
  // preços já cadastrados no modo nuvem/orçamento — mesmo padrão do /voz.
  useEffect(() => {
    let cancelado = false;
    getServicos()
      .then(servicos => {
        if (cancelado || servicos.length === 0) return;
        setCatalogoVoz(
          servicos.slice(0, 60).map(s => (s.preco > 0 ? { nome: s.nome, preco: s.preco } : { nome: s.nome }))
        );
      })
      .catch(() => {
        // sem catálogo não tem problema — a IA segue só com o áudio
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const nuvem = useGravadorNuvem({
    modo: 'orcamento',
    catalogo: catalogoVoz,
    onTexto: (t) => {
      setTranscript(t);
    },
    onOrcamento: (ok) => {
      if (!ok.itens || ok.itens.length === 0) {
        setErro('Não consegui identificar itens no que você falou. Tente detalhar os serviços e peças — ou monte o orçamento na mão.');
        setFase('erro');
        return;
      }
      void consumirUsoIa();
      setTitulo(ok.titulo ?? '');
      setClienteNome(ok.clienteNome ?? '');
      setItens(ok.itens.map(vozItemParaEditavel));
      setObservacao(ok.observacao ?? '');
      setFase('revisao');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    onErro: (m, opts) => {
      setErro(m);
      setPermissaoNegadaPermanente(!!opts?.permissaoNegadaPermanente);
      setFase('erro');
    },
  });

  // limpa chamadas de IA pendentes ao sair da tela (a limpeza do
  // reconhecimento de voz e do gravador em nuvem já é feita internamente
  // por cada hook — `useGravadorNuvem` já cancela timer/upload no unmount)
  useEffect(() => {
    return () => {
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const pararReconhecimento = useCallback(() => {
    voz.parar();
  }, [voz]);

  const onMicPressDispositivo = useCallback(() => {
    if (!vozOk) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setErro(null);
    setPermissaoNegadaPermanente(false);
    if (voz.ouvindo) {
      voz.parar();
      setFase(prev => (prev === 'ouvindo' ? 'inicial' : prev));
    } else {
      setParcial('');
      voz.iniciar();
      setFase('ouvindo');
    }
  }, [vozOk, voz]);

  // Modo nuvem: 1º toque inicia a gravação (pede a permissão do microfone
  // direto pelo expo-audio, sem depender do serviço de voz do Google); 2º
  // toque para, envia o áudio pro Worker e já volta com o orçamento pronto
  // (uma única requisição — não passa por `enviar()`/`interpretarVoz`).
  const onMicPressNuvem = useCallback(async () => {
    // Guarda contra segundo toque durante o upload (inclusive após o auto-stop
    // de 2min, quando a fase ainda pode estar 'ouvindo'): sem isso, um toque
    // iniciaria uma 2ª gravação concorrente com o envio em voo.
    if (nuvem.enviando) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setErro(null);
    setPermissaoNegadaPermanente(false);
    if (nuvem.gravando) {
      setFase('enviando');
      // Mostra o botão Cancelar após alguns segundos de upload (mesmo padrão do
      // fluxo on-device em enviar()): o envio na nuvem pode levar até 60s.
      setPodeCancelar(false);
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      cancelarTimerRef.current = setTimeout(() => setPodeCancelar(true), SEGUNDOS_PARA_MOSTRAR_CANCELAR * 1000);
      try {
        await nuvem.pararEEnviar();
      } finally {
        if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
        setPodeCancelar(false);
      }
    } else {
      setTranscript('');
      setFase('ouvindo');
      await nuvem.iniciarGravacao();
    }
  }, [nuvem]);

  // IA grátis esgotada (3 usos/mês): bloqueia o microfone ANTES de gastar
  // bateria/permissão — mostra o teaser caloroso em vez de deixar tocar.
  const irParaPlanos = useCallback((origem: string) => {
    Haptics.selectionAsync().catch(() => {});
    track(Eventos.gateCta, { recurso: 'ia_ilimitada', plano: 'pro', origem });
    nav.navigate('Planos');
  }, [nav]);

  const onMicPress = useCallback(() => {
    if (iaEsgotada) {
      track(Eventos.gateVisto, { recurso: 'ia_ilimitada', plano: 'pro', motivo: 'limite_mensal', origem: 'olli_voz' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    return modoVoz === 'nuvem' ? onMicPressNuvem() : onMicPressDispositivo();
  }, [iaEsgotada, modoVoz, onMicPressNuvem, onMicPressDispositivo]);

  const enviar = useCallback(async () => {
    const texto = transcript.trim();
    if (!texto) return;
    if (iaEsgotada) {
      track(Eventos.gateVisto, { recurso: 'ia_ilimitada', plano: 'pro', motivo: 'limite_mensal', origem: 'olli_voz' });
      return;
    }
    pararReconhecimento();
    Haptics.selectionAsync().catch(() => {});
    setFase('enviando');
    setErro(null);
    setPodeCancelar(false);

    const controller = new AbortController();
    abortRef.current = controller;
    cancelarTimerRef.current = setTimeout(() => setPodeCancelar(true), SEGUNDOS_PARA_MOSTRAR_CANCELAR * 1000);

    try {
      const res = await interpretarVoz(texto, controller.signal);
      if (!res.ok) {
        setErro(res.erro);
        setFase('erro');
        return;
      }
      const ok = res as VozResultadoOk;
      if (!ok.itens || ok.itens.length === 0) {
        setErro('Não consegui identificar itens no que você falou. Tente detalhar os serviços e peças — ou monte o orçamento na mão.');
        setFase('erro');
        return;
      }
      void consumirUsoIa();
      setTitulo(ok.titulo ?? '');
      setClienteNome(ok.clienteNome ?? '');
      setItens(ok.itens.map(vozItemParaEditavel));
      setObservacao(ok.observacao ?? '');
      setFase('revisao');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } finally {
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      setPodeCancelar(false);
      abortRef.current = null;
    }
  }, [transcript, pararReconhecimento, iaEsgotada, consumirUsoIa]);

  const cancelarEnvio = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    abortRef.current?.abort();
    nuvem.cancelar();
  }, [nuvem]);

  const refazer = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setFase('inicial');
    setTranscript('');
    setParcial('');
    setErro(null);
    setPermissaoNegadaPermanente(false);
    setItens([]);
    setTitulo('');
    setClienteNome('');
    setObservacao('');
  }, []);

  const criarOrcamento = useCallback(async () => {
    if (itens.length === 0) return;
    setSalvando(true);
    try {
      const numero = await getNextOrcamentoNumber();
      const orc = montarOrcamento(numero, titulo, clienteNome, itens, observacao);
      await saveOrcamento(orc);
      track(Eventos.quoteCreated, { origem: 'voz', itens: itens.length });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // abre a MESMA tela de edição do app para o usuário finalizar (cliente, preços, enviar)
      nav.navigate('EditarOrcamento', { orcamentoId: orc.id });
    } catch {
      setErro('Não consegui salvar o orçamento agora. Tente novamente.');
      setFase('erro');
    } finally {
      setSalvando(false);
    }
  }, [itens, titulo, clienteNome, observacao, nav]);

  // ── edição de itens na revisão ──
  function updateItem(id: string, patch: Partial<ItemEditavel>) {
    setItens(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
  }
  function removeItem(id: string) {
    Haptics.selectionAsync().catch(() => {});
    setItens(prev => prev.filter(i => i.id !== id));
  }
  function addItem() {
    Haptics.selectionAsync().catch(() => {});
    setItens(prev => [...prev, { id: generateId(), descricao: '', quantidade: 1, valorUnitario: null, tipo: 'servico' }]);
  }

  const enviando = fase === 'enviando';
  const podeEnviar = transcript.trim().length > 0 && (fase === 'inicial' || fase === 'ouvindo' || fase === 'erro');

  const gravandoNuvem = modoVoz === 'nuvem' && nuvem.gravando;
  const enviandoNuvem = modoVoz === 'nuvem' && nuvem.enviando;
  const minutos = String(Math.floor(nuvem.segundos / 60)).padStart(2, '0');
  const segs = String(nuvem.segundos % 60).padStart(2, '0');

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  const pulseScaleOuter = pulseOuter.interpolate({ inputRange: [0, 1], outputRange: [1, 1.34] });
  const pulseOpacityOuter = pulseOuter.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0] });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GradientHeader
        title="OLLI por voz"
        subtitle="Fale e eu monto o orçamento"
        onBack={() => goBackOrHome(nav)}
        right={<OlliMascot size={32} onDark float={fase !== 'enviando'} />}
      />

      {fase === 'revisao' ? (
        <Revisao
          titulo={titulo}
          clienteNome={clienteNome}
          itens={itens}
          observacao={observacao}
          salvando={salvando}
          onTitulo={setTitulo}
          onCliente={setClienteNome}
          onObservacao={setObservacao}
          onUpdateItem={updateItem}
          onRemoveItem={removeItem}
          onAddItem={addItem}
          onCriar={criarOrcamento}
          onRefazer={refazer}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* IA GRÁTIS ESGOTADA — mensagem calorosa, nunca erro seco */}
          {iaEsgotada && fase === 'inicial' ? (
            <AnimatedEntrance index={0}>
              <View style={styles.limiteCard}>
                <OlliMascot size={48} onDark />
                <Text style={styles.limiteTitle}>Você usou seus {IA_USOS_GRATIS_MES} orçamentos por voz este mês</Text>
                <Text style={styles.limiteSub}>
                  Sem problema — você pode continuar montando orçamentos na mão a qualquer hora.
                  Para falar sem limite com a OLLI, dá uma olhada no plano Pro.
                </Text>
                <OlliButton
                  label="Ver planos"
                  variant="gradient"
                  size="md"
                  onPress={() => irParaPlanos('voz_limite')}
                  icon={<MaterialCommunityIcons name="crown-outline" size={18} color="#fff" />}
                  style={{ marginTop: 14 }}
                />
              </View>
            </AnimatedEntrance>
          ) : (
          <>
          {/* HERO MICROFONE */}
          {voz.checandoDisponibilidade ? (
            <AnimatedEntrance index={0}>
              <CheckandoVozBloco />
            </AnimatedEntrance>
          ) : (
          <AnimatedEntrance index={0}>
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>
                {enviandoNuvem
                  ? 'A OLLI ESTÁ OUVINDO…'
                  : fase === 'ouvindo'
                  ? 'OUVINDO…'
                  : fase === 'enviando'
                  ? 'MONTANDO…'
                  : 'TOQUE E FALE'}
              </Text>

              {Number.isFinite(usosIaRestantes) && !iaEsgotada && fase === 'inicial' && (
                <View style={styles.usoPill}>
                  <MaterialCommunityIcons name="creation" size={12} color={cores.plan} />
                  <Text style={styles.usoPillText}>{usosIaRestantes} de {IA_USOS_GRATIS_MES} usos grátis este mês</Text>
                </View>
              )}

              <View style={styles.micWrap}>
                {(fase === 'ouvindo' || gravandoNuvem) && (
                  <>
                    <Animated.View
                      style={[
                        styles.micPulse,
                        { backgroundColor: gravandoNuvem ? cores.danger : cores.accent },
                        { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                      ]}
                      pointerEvents="none"
                    />
                    <Animated.View
                      style={[
                        styles.micPulseOuter,
                        { backgroundColor: gravandoNuvem ? cores.danger : cores.accent },
                        { transform: [{ scale: pulseScaleOuter }], opacity: pulseOpacityOuter },
                      ]}
                      pointerEvents="none"
                    />
                  </>
                )}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={fase === 'enviando' || enviandoNuvem ? undefined : onMicPress}
                  disabled={fase === 'enviando' || enviandoNuvem}
                  accessibilityRole="button"
                  accessibilityLabel={fase === 'ouvindo' || gravandoNuvem ? 'Parar de ouvir' : 'Tocar e falar'}
                  style={styles.micTouch}
                >
                  <LinearGradient
                    colors={gravandoNuvem ? GRADIENT_GRAVANDO : fase === 'ouvindo' ? gradientes.frost : gradientes.primaryDiagonal}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.micGrad, fase === 'ouvindo' || gravandoNuvem ? sombrasDe(cores).glowCyan : sombrasDe(cores).glowBlue]}
                  >
                    {enviandoNuvem || fase === 'enviando' ? (
                      <ActivityIndicator size="large" color="#fff" />
                    ) : (
                      <MaterialCommunityIcons
                        name={fase === 'ouvindo' || gravandoNuvem ? 'microphone' : 'microphone-outline'}
                        size={52}
                        color="#fff"
                      />
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {gravandoNuvem && (
                <View style={styles.contadorPill}>
                  <View style={styles.contadorDot} />
                  <Text style={styles.contadorText}>{minutos}:{segs}</Text>
                </View>
              )}

              <Text style={styles.heroHint}>
                {enviandoNuvem
                  ? 'A OLLI está ouvindo e montando seu orçamento…'
                  : fase === 'enviando'
                  ? 'OLLI está montando seu orçamento…'
                  : gravandoNuvem
                  ? 'Pode falar por partes — toque de novo quando terminar.'
                  : fase === 'ouvindo'
                  ? 'Pode falar por partes — toque de novo quando terminar.'
                  : 'Toque no microfone e descreva o serviço. Ex.: "Limpeza de dois splits e recarga de gás para a Dona Helena".'}
              </Text>

              {modoVoz === 'nuvem' && fase !== 'ouvindo' && !enviandoNuvem && fase !== 'enviando' && (
                <View style={styles.infoPill}>
                  <MaterialCommunityIcons name="cloud-outline" size={14} color={cores.accentLight} />
                  <Text style={styles.infoPillText}>Transcrição pela nuvem (usa internet)</Text>
                </View>
              )}

              {(fase === 'enviando' && podeCancelar) && (
                <OlliButton
                  label="Cancelar"
                  variant="outline"
                  size="sm"
                  onPress={cancelarEnvio}
                  style={{ marginTop: 16 }}
                />
              )}
            </View>
          </AnimatedEntrance>
          )}
          </>
          )}

          {/* TRANSCRIÇÃO AO VIVO / EM EDIÇÃO */}
          {fase === 'enviando' ? (
            <AnimatedEntrance index={1}>
              <View style={styles.transcriptCard}>
                <Text style={styles.transcriptLabel}>O que eu entendi</Text>
                <OlliSkeleton.Lines count={3} />
              </View>
            </AnimatedEntrance>
          ) : (transcript.length > 0 || parcial.length > 0) && (
            <AnimatedEntrance index={1}>
              <View style={styles.transcriptCard}>
                <Text style={styles.transcriptLabel}>O que eu entendi</Text>
                <Text style={styles.transcriptText}>
                  {transcript}
                  {parcial ? <Text style={styles.transcriptInterim}>{transcript ? ' ' : ''}{parcial}</Text> : null}
                </Text>
              </View>
            </AnimatedEntrance>
          )}

          {/* ERRO AMIGÁVEL */}
          {fase === 'erro' && erro && (
            <AnimatedEntrance index={1}>
              <View style={styles.erroCard}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.erroText}>{erro}</Text>
                  {permissaoNegadaPermanente ? (
                    <OlliButton
                      label="Abrir configurações"
                      variant="outline"
                      size="sm"
                      onPress={voz.abrirConfiguracoes}
                      haptic={false}
                      icon={<MaterialCommunityIcons name="cog-outline" size={15} color={cores.accentLight} />}
                      style={{ marginTop: 10, alignSelf: 'flex-start' }}
                    />
                  ) : transcript.trim().length > 0 ? (
                    <OlliButton
                      label="Tentar de novo"
                      variant="outline"
                      size="sm"
                      onPress={enviar}
                      haptic={false}
                      icon={<MaterialCommunityIcons name="refresh" size={15} color={cores.accentLight} />}
                      style={{ marginTop: 10, alignSelf: 'flex-start' }}
                    />
                  ) : (
                    <OlliButton
                      label="Tentar de novo"
                      variant="outline"
                      size="sm"
                      onPress={onMicPress}
                      haptic={false}
                      icon={<MaterialCommunityIcons name="microphone-outline" size={15} color={cores.accentLight} />}
                      style={{ marginTop: 10, alignSelf: 'flex-start' }}
                    />
                  )}
                </View>
              </View>
            </AnimatedEntrance>
          )}

          {/* FALLBACK DE TEXTO — sempre presente, em todas as plataformas */}
          <AnimatedEntrance index={2}>
            <View style={styles.escreverCard}>
              <Text style={styles.escreverLabel}>ou escreva o que precisa</Text>
              <TextInput
                style={styles.escreverInput}
                value={transcript}
                onChangeText={t => { setTranscript(t); if (fase === 'erro') setErro(null); }}
                placeholder='Ex.: "Manutenção de 1 split 12.000 BTUs, recarga de gás e troca do capacitor para o João"'
                placeholderTextColor={cores.onSurfaceMuted}
                multiline
                editable={fase !== 'enviando'}
                textAlignVertical="top"
              />
            </View>
          </AnimatedEntrance>

          <View style={{ height: 12 }} />

          <OlliButton
            label={
              iaEsgotada
                ? 'Limite grátis atingido — ver planos'
                : fase === 'enviando' ? 'Montando seu orçamento…' : 'Montar orçamento com a OLLI'
            }
            variant="gradient"
            size="lg"
            fullWidth
            onPress={iaEsgotada ? () => irParaPlanos('voz_botao_enviar') : enviar}
            disabled={iaEsgotada ? false : (!podeEnviar || enviando)}
            loading={enviando}
            icon={
              iaEsgotada
                ? <MaterialCommunityIcons name="crown-outline" size={20} color="#fff" />
                : enviando ? undefined : <MaterialCommunityIcons name="robot-happy-outline" size={20} color="#fff" />
            }
          />

          {transcript.length > 0 && fase !== 'enviando' && (
            <TouchableOpacity style={styles.limparBtn} onPress={refazer} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={16} color={cores.onSurfaceVariant} />
              <Text style={styles.limparText}>Limpar</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

/* ─── TELA DE REVISÃO ───────────────────────────────────── */
function Revisao(props: {
  titulo: string;
  clienteNome: string;
  itens: ItemEditavel[];
  observacao: string;
  salvando: boolean;
  onTitulo: (v: string) => void;
  onCliente: (v: string) => void;
  onObservacao: (v: string) => void;
  onUpdateItem: (id: string, patch: Partial<ItemEditavel>) => void;
  onRemoveItem: (id: string) => void;
  onAddItem: () => void;
  onCriar: () => void;
  onRefazer: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const total = props.itens.reduce((s, i) => s + (i.valorUnitario ?? 0) * i.quantidade, 0);
  const algumSemPreco = props.itens.some(i => i.valorUnitario == null);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.revHeader}>
          <OlliMascot size={36} onDark float={false} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.revTitle}>Confira o que eu montei</Text>
            <Text style={styles.revSub}>Ajuste o que precisar. Depois você finaliza cliente, preços e envio.</Text>
          </View>
        </View>

        {/* TÍTULO + CLIENTE sugeridos */}
        <View style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>Título do serviço</Text>
          <TextInput
            style={styles.fieldInput}
            value={props.titulo}
            onChangeText={props.onTitulo}
            placeholder="Ex.: Manutenção preventiva"
            placeholderTextColor={cores.onSurfaceMuted}
          />
          <View style={{ height: 12 }} />
          <Text style={styles.fieldLabel}>Cliente (sugerido)</Text>
          <TextInput
            style={styles.fieldInput}
            value={props.clienteNome}
            onChangeText={props.onCliente}
            placeholder="Você confirma o cliente no próximo passo"
            placeholderTextColor={cores.onSurfaceMuted}
          />
        </View>

        {/* ITENS */}
        <Text style={styles.itensTitle}>Itens ({props.itens.length})</Text>
        {props.itens.map((item, idx) => (
          <AnimatedEntrance key={item.id} index={idx}>
            <View style={styles.itemCard}>
              <View style={styles.itemTopRow}>
                <View style={[styles.tipoChip, item.tipo === 'peca' ? styles.tipoChipPeca : styles.tipoChipServico]}>
                  <MaterialCommunityIcons
                    name={item.tipo === 'peca' ? 'package-variant' : 'wrench'}
                    size={12}
                    color={item.tipo === 'peca' ? '#0891B2' : cores.accentLight}
                  />
                  <TouchableOpacity onPress={() => props.onUpdateItem(item.id, { tipo: item.tipo === 'peca' ? 'servico' : 'peca' })}>
                    <Text style={[styles.tipoChipText, { color: item.tipo === 'peca' ? '#0891B2' : cores.accentLight }]}>
                      {item.tipo === 'peca' ? 'Peça' : 'Serviço'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => props.onRemoveItem(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={cores.danger} />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.itemDescInput}
                value={item.descricao}
                onChangeText={t => props.onUpdateItem(item.id, { descricao: t })}
                placeholder="Descrição do item"
                placeholderTextColor={cores.onSurfaceMuted}
                multiline
              />

              <View style={styles.itemFields}>
                <View style={styles.qtyField}>
                  <Text style={styles.miniLabel}>Qtd</Text>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => props.onUpdateItem(item.id, { quantidade: Math.max(1, item.quantidade - 1) })}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialCommunityIcons name="minus" size={15} color={cores.primary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{item.quantidade}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => props.onUpdateItem(item.id, { quantidade: item.quantidade + 1 })}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialCommunityIcons name="plus" size={15} color={cores.primary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.valorField}>
                  <Text style={styles.miniLabel}>Valor unitário</Text>
                  <View style={styles.valorInputWrap}>
                    <Text style={styles.valorPrefix}>R$</Text>
                    <TextInput
                      style={styles.valorInput}
                      value={item.valorUnitario != null ? String(item.valorUnitario).replace('.', ',') : ''}
                      onChangeText={t => props.onUpdateItem(item.id, { valorUnitario: t.trim() === '' ? null : parseNumber(t) })}
                      placeholder="definir"
                      placeholderTextColor={cores.warning}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>
            </View>
          </AnimatedEntrance>
        ))}

        <TouchableOpacity style={styles.addItemBtn} onPress={props.onAddItem} activeOpacity={0.8}>
          <MaterialCommunityIcons name="plus" size={18} color={cores.success} />
          <Text style={styles.addItemText}>Adicionar item</Text>
        </TouchableOpacity>

        {/* OBSERVAÇÃO */}
        {props.observacao.length > 0 && (
          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>Observação da OLLI</Text>
            <TextInput
              style={[styles.fieldInput, styles.obsInput]}
              value={props.observacao}
              onChangeText={props.onObservacao}
              multiline
              textAlignVertical="top"
              placeholderTextColor={cores.onSurfaceMuted}
            />
          </View>
        )}

        {/* TOTAL PARCIAL */}
        <View style={styles.totalBar}>
          <View>
            <Text style={styles.totalLabel}>Total estimado</Text>
            {algumSemPreco && <Text style={styles.totalHint}>alguns itens ainda sem preço</Text>}
          </View>
          <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
        </View>
      </ScrollView>

      {/* AÇÕES FIXAS */}
      <View style={styles.revFooter}>
        <OlliButton label="Refazer" variant="outline" size="md" onPress={props.onRefazer} haptic={false} icon={<MaterialCommunityIcons name="restart" size={18} color={cores.primary} />} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <OlliButton
            label="Criar orçamento"
            variant="gradient"
            size="md"
            fullWidth
            loading={props.salvando}
            disabled={props.itens.length === 0}
            onPress={props.onCriar}
            icon={<MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />}
          />
        </View>
      </View>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },

  hero: { alignItems: 'center', paddingVertical: Spacing.lg },
  heroKicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0, color: c.accentLight, marginBottom: Spacing.lg },
  // rgba(124,58,237,x) era o roxo fixo do "plan" — vira c.plan (ajustado por contraste).
  usoPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8, marginBottom: Spacing.md, backgroundColor: comAlfa(c.plan, 0.12), borderWidth: 1, borderColor: comAlfa(c.plan, 0.32), borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6 },
  usoPillText: { fontSize: 11.5, fontWeight: '800', color: c.plan },
  limiteCard: { alignItems: 'center', backgroundColor: c.surface, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: comAlfa(c.plan, 0.32), padding: Spacing.xl, ...sombrasDe(c).sm },
  // Era '#fff' fixo: o card fica sobre a superfície da tela, não sobre um
  // gradiente — no claro (padrão do app) o texto branco já nascia ilegível
  // sobre o tint claro do card; vira onSurface (continua branco no escuro).
  limiteTitle: { fontSize: 17, fontWeight: '800', color: c.onSurface, textAlign: 'center', marginTop: 14 },
  limiteSub: { fontSize: 13.5, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  micWrap: { width: 168, height: 168, justifyContent: 'center', alignItems: 'center' },
  micPulse: { position: 'absolute', width: 168, height: 168, borderRadius: 84, backgroundColor: c.accent },
  micPulseOuter: { position: 'absolute', width: 168, height: 168, borderRadius: 84, backgroundColor: c.accent },
  micTouch: { borderRadius: 70 },
  // rgba(127,233,245,x) era o accentLight estático — vira o accentLight do tema.
  micGrad: { width: 140, height: 140, borderRadius: 70, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: comAlfa(c.accentLight, 0.18) },
  heroHint: { fontSize: 13.5, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 20, marginTop: Spacing.lg, paddingHorizontal: 8 },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: comAlfa(c.accentLight, 0.10), borderWidth: 1, borderColor: comAlfa(c.accentLight, 0.28), borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6 },
  infoPillText: { fontSize: 11.5, fontWeight: '700', color: c.accentLight },

  // rgba(255,107,107,x) era o danger estático — vira o danger do tema.
  contadorPill: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, backgroundColor: c.dangerLight, borderWidth: 1, borderColor: comAlfa(c.danger, 0.35), borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 7 },
  contadorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger },
  contadorText: { fontSize: 14, fontWeight: '800', color: c.danger, fontVariant: ['tabular-nums'] },

  checandoWrap: { alignItems: 'center', paddingVertical: Spacing.lg },

  // rgba(52,198,217,x) era o accent estático — vira o accent do tema.
  transcriptCard: { backgroundColor: comAlfa(c.accent, 0.06), borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: comAlfa(c.accent, 0.30), padding: Spacing.base, marginTop: Spacing.sm },
  transcriptLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0, color: c.accentLight, textTransform: 'uppercase', marginBottom: 6 },
  transcriptText: { fontSize: 15.5, color: c.onSurface, lineHeight: 22 },
  transcriptInterim: { color: c.onSurfaceMuted, fontStyle: 'italic' },

  // rgba(247,178,59,x) era o warning estático — vira o warning do tema.
  erroCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: c.warningLight, borderWidth: 1, borderColor: comAlfa(c.warning, 0.35), borderRadius: BorderRadius.lg, padding: Spacing.base, marginTop: Spacing.base },
  erroText: { flex: 1, fontSize: 13.5, color: c.onSurface, lineHeight: 20 },

  escreverCard: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.base, marginTop: Spacing.base, ...sombrasDe(c).sm },
  escreverLabel: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, marginBottom: 8 },
  escreverInput: { fontSize: 15, color: c.onSurface, minHeight: 84, lineHeight: 21 },

  limparBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 4 },
  limparText: { fontSize: 13.5, color: c.onSurfaceVariant, fontWeight: '600' },

  // Revisão
  revHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.base },
  // Era '#fff' fixo sobre o fundo da tela (c.background) — ilegível no claro.
  revTitle: { fontSize: 18, fontWeight: '800', color: c.onSurface },
  revSub: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 3, lineHeight: 18 },

  fieldCard: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.base, marginBottom: Spacing.base, ...sombrasDe(c).sm },
  fieldLabel: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant, marginBottom: 8 },
  fieldInput: { backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.onSurface },
  obsInput: { minHeight: 70, lineHeight: 20 },

  // Era '#fff' fixo sobre o fundo da tela (c.background) — ilegível no claro.
  itensTitle: { fontSize: 15, fontWeight: '800', color: c.onSurface, marginBottom: Spacing.sm },
  itemCard: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.base, marginBottom: 10, ...sombrasDe(c).sm },
  itemTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tipoChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  // rgba(52,198,217,x) era o accent estático — vira o accent do tema.
  tipoChipServico: { backgroundColor: comAlfa(c.accent, 0.12), borderColor: comAlfa(c.accent, 0.3) },
  // '#0891B2' (e seu rgba) é um ciano fixo só pra diferenciar "peça" de
  // "serviço" (que já usa accent) — não tem token semântico no tema, mantido.
  tipoChipPeca: { backgroundColor: 'rgba(8,145,178,0.14)', borderColor: 'rgba(8,145,178,0.35)' },
  tipoChipText: { fontSize: 11.5, fontWeight: '800' },
  itemDescInput: { fontSize: 15, color: c.onSurface, lineHeight: 21, paddingVertical: 2, marginBottom: 10 },
  itemFields: { flexDirection: 'row', gap: 12 },
  qtyField: { width: 118 },
  valorField: { flex: 1 },
  miniLabel: { fontSize: 11, fontWeight: '700', color: c.onSurfaceMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, paddingHorizontal: 6, height: 44 },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: c.primary, justifyContent: 'center', alignItems: 'center' },
  qtyValue: { fontSize: 15, fontWeight: '800', color: c.onSurface, minWidth: 22, textAlign: 'center' },
  valorInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, paddingHorizontal: 12, height: 44 },
  valorPrefix: { fontSize: 14, fontWeight: '700', color: c.onSurfaceMuted, marginRight: 6 },
  valorInput: { flex: 1, fontSize: 15, color: c.onSurface, fontWeight: '600' },

  // rgba(43,215,135,x) era o success estático — vira o success do tema.
  addItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1.5, borderColor: comAlfa(c.success, 0.5), borderRadius: BorderRadius.md, paddingVertical: 13, backgroundColor: comAlfa(c.success, 0.06), marginBottom: Spacing.base },
  addItemText: { fontSize: 14, fontWeight: '700', color: c.success },

  // Barra sólida na cor da marca — texto usa onPrimary (contraste calculado),
  // não branco fixo: uma marca clara escolhida pelo usuário exige tinta escura.
  totalBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.primary, borderRadius: BorderRadius.lg, padding: Spacing.lg, ...sombrasDe(c).md },
  totalLabel: { fontSize: 13, color: comAlfa(c.onPrimary, 0.82), fontWeight: '600' },
  totalHint: { fontSize: 11, color: comAlfa(c.onPrimary, 0.7), marginTop: 2 },
  totalValue: { ...Typography.displaySerif, color: c.onPrimary },

  revFooter: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline, paddingHorizontal: Spacing.base, paddingTop: 12, paddingBottom: 26 },
});
