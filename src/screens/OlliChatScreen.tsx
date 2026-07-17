import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Animated, Easing,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, useCores, useGradientes, useEstilos, sombrasDe, comAlfa, textoSobre, type Cores } from '../theme';
import { useReducedMotion } from '../theme/motion';
import { GradientHeader } from '../components/GradientHeader';
import { OlliMascot } from '../components/OlliMascot';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { EstadoIA } from '../components/EstadoIA';
import { enviarChat, ChatMensagem } from '../services/olliAssistente';
import { generateId } from '../utils/id';
import { goBackOrHome } from '../navigation/safeBack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { CHAT_KEY } from '../services/storageKeys';
import { usePlano } from '../hooks/usePlano';
import { track, Eventos } from '../services/analytics';
import { IA_USOS_GRATIS_MES } from '../services/planos';

type Nav = NativeStackNavigationProp<RootStackParamList>;


interface Bolha {
  id: string;
  role: 'user' | 'assistant';
  texto: string;
  /** true quando esta bolha é uma resposta de erro da IA (permite "Tentar de novo"). */
  falhou?: boolean;
}

/** Depois de quantos segundos de "digitando" o botão "Cancelar" aparece. */
const SEGUNDOS_PARA_MOSTRAR_CANCELAR = 4;

const SUGESTOES = [
  'Qual o preço de uma recarga de gás?',
  'Erro E5 no split, o que é?',
  'Como precificar uma limpeza de split?',
  'O que verifico num ar que não gela?',
];

const SAUDACAO: Bolha = {
  id: 'olli-hello',
  role: 'assistant',
  texto: 'Oi! Eu sou a OLLI. Posso te ajudar com diagnóstico, preços, dúvidas técnicas e dicas pro seu dia. O que você precisa?',
};

export default function OlliChatScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  const { usosIaRestantes, consumirUsoIa } = usePlano();
  const iaEsgotada = usosIaRestantes <= 0;

  const [bolhas, setBolhas] = useState<Bolha[]>([SAUDACAO]);
  const [texto, setTexto] = useState('');
  const [digitando, setDigitando] = useState(false);
  const [podeCancelar, setPodeCancelar] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // aborta requisição pendente e limpa timers ao desmontar a tela
  useEffect(() => {
    return () => {
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // carrega histórico persistido
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CHAT_KEY);
        if (vivo && raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setBolhas(parsed.filter((b: any) => b && (b.role === 'user' || b.role === 'assistant') && typeof b.texto === 'string'));
          }
        }
      } catch {
        // histórico inválido: começa do zero, sem quebrar
      } finally {
        if (vivo) setCarregado(true);
      }
    })();
    return () => { vivo = false; };
  }, []);

  // persiste a cada mudança (depois do 1º load, para não sobrescrever com o default)
  useEffect(() => {
    if (!carregado) return;
    AsyncStorage.setItem(CHAT_KEY, JSON.stringify(bolhas.slice(-60))).catch(() => {});
  }, [bolhas, carregado]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => { scrollToEnd(); }, [bolhas, digitando, scrollToEnd]);

  /** Faz a chamada de IA de fato a partir de um histórico já pronto (não mexe nas bolhas de entrada). */
  const chamarIA = useCallback(async (historicoBase: Bolha[]) => {
    setDigitando(true);
    setPodeCancelar(false);

    const controller = new AbortController();
    abortRef.current = controller;
    cancelarTimerRef.current = setTimeout(() => setPodeCancelar(true), SEGUNDOS_PARA_MOSTRAR_CANCELAR * 1000);

    // monta o histórico para o endpoint (sem a saudação fixa inicial)
    const historico: ChatMensagem[] = historicoBase
      .filter(b => b.id !== 'olli-hello')
      .slice(-20) // janela: últimas ~20 msgs (evita estourar contexto/custo da IA)
      .map(b => ({ role: b.role, texto: b.texto }));

    try {
      const res = await enviarChat(historico, controller.signal);
      setBolhas(prev => [...prev, { id: generateId(), role: 'assistant', texto: res.resposta, falhou: !res.ok }]);
      if (res.ok) {
        Haptics.selectionAsync().catch(() => {});
        void consumirUsoIa();
      }
    } finally {
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      setDigitando(false);
      setPodeCancelar(false);
      abortRef.current = null;
    }
  }, [consumirUsoIa]);

  const irParaPlanos = useCallback((origem: string) => {
    Haptics.selectionAsync().catch(() => {});
    track(Eventos.gateCta, { recurso: 'ia_ilimitada', plano: 'pro', origem });
    nav.navigate('Planos');
  }, [nav]);

  const enviar = useCallback(async (mensagem?: string) => {
    const conteudo = (mensagem ?? texto).trim();
    if (!conteudo || digitando) return;
    if (iaEsgotada) {
      track(Eventos.gateVisto, { recurso: 'ia_ilimitada', plano: 'pro', motivo: 'limite_mensal', origem: 'olli_chat' });
      irParaPlanos('chat_enviar');
      return;
    }
    Haptics.selectionAsync().catch(() => {});

    const userBolha: Bolha = { id: generateId(), role: 'user', texto: conteudo };
    const proximas = [...bolhas, userBolha];
    setBolhas(proximas);
    setTexto('');
    await chamarIA(proximas);
  }, [texto, bolhas, digitando, chamarIA, iaEsgotada, irParaPlanos]);

  const cancelarEnvio = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    abortRef.current?.abort();
  }, []);

  const tentarDeNovo = useCallback((bolhaErroId: string) => {
    if (digitando) return;
    if (iaEsgotada) { irParaPlanos('chat_tentar_de_novo'); return; }
    // remove a bolha de erro e reenvia a IA com o histórico até a última msg do usuário
    const idx = bolhas.findIndex(b => b.id === bolhaErroId);
    if (idx <= 0) return;
    const historicoBase = bolhas.slice(0, idx);
    if (historicoBase[historicoBase.length - 1]?.role !== 'user') return;
    Haptics.selectionAsync().catch(() => {});
    setBolhas(historicoBase);
    chamarIA(historicoBase);
  }, [bolhas, digitando, chamarIA, iaEsgotada, irParaPlanos]);

  const limpar = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setBolhas([SAUDACAO]);
    AsyncStorage.removeItem(CHAT_KEY).catch(() => {});
  }, []);

  // Leva a última resposta da OLLI direto para um orçamento novo, já com um
  // item de serviço pré-preenchido — fecha o loop de "perguntei o preço" para
  // "montei o orçamento", igual ao padrão de CodigosErroScreen/DiagnosticoIA.
  const criarOrcamentoDaResposta = useCallback((texto: string) => {
    Haptics.selectionAsync().catch(() => {});
    const nome = texto.split('\n')[0].slice(0, 80).trim() || 'Serviço sugerido pela OLLI';
    const descricao = texto.length > nome.length ? texto : undefined;
    nav.navigate('NovoOrcamento', {
      prefillItem: { tipo: 'servico', nome, descricao },
    });
  }, [nav]);

  const mostrarSugestoes = bolhas.length <= 1 && !digitando;

  useEffect(() => {
    if (iaEsgotada) track(Eventos.gateVisto, { recurso: 'ia_ilimitada', plano: 'pro', motivo: 'limite_mensal', origem: 'olli_chat' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iaEsgotada]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <GradientHeader
        title="Chat com a OLLI"
        subtitle={Number.isFinite(usosIaRestantes) ? `${usosIaRestantes} de ${IA_USOS_GRATIS_MES} usos grátis este mês` : 'Sua assistente técnica'}
        onBack={() => goBackOrHome(nav)}
        right={
          <TouchableOpacity onPress={limpar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Limpar conversa">
            {/* dentro do LinearGradient de gradientes.header (via GradientHeader `right`): ícone decorativo -> sobreHeader */}
            <MaterialCommunityIcons name="broom" size={22} color={gradientes.sobreHeader} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 12 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {bolhas.map(b => (
          <AnimatedEntrance key={b.id} from="bottom">
            <Balao
              role={b.role}
              texto={b.texto}
              falhou={b.falhou}
              onTentarDeNovo={() => tentarDeNovo(b.id)}
              onTransformarEmOrcamento={b.id !== 'olli-hello' ? () => criarOrcamentoDaResposta(b.texto) : undefined}
            />
          </AnimatedEntrance>
        ))}

        {digitando && <Digitando podeCancelar={podeCancelar} onCancelar={cancelarEnvio} />}

        {mostrarSugestoes && !iaEsgotada && (
          <View style={styles.sugestoesWrap}>
            <Text style={styles.sugestoesLabel}>Sugestões para começar</Text>
            {SUGESTOES.map(s => (
              <TouchableOpacity key={s} style={styles.sugestaoChip} onPress={() => enviar(s)} activeOpacity={0.8}>
                <MaterialCommunityIcons name="lightbulb-on-outline" size={16} color={cores.accentLight} />
                <Text style={styles.sugestaoText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {iaEsgotada && !digitando && (
          <EstadoIA
            variante="erro"
            tipoErro="cota"
            titulo={`Você usou seus ${IA_USOS_GRATIS_MES} papos grátis este mês`}
            mensagem={`Volta mês que vem com ${IA_USOS_GRATIS_MES} novos, ou continue sem limite agora mesmo no plano Pro.`}
            onDark
            onAcao={() => irParaPlanos('chat_card')}
            style={{ marginTop: 8 }}
          />
        )}
      </ScrollView>

      {/* INPUT */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={texto}
            onChangeText={setTexto}
            placeholder={iaEsgotada ? 'Limite grátis atingido este mês…' : 'Escreva sua mensagem…'}
            placeholderTextColor={cores.onSurfaceMuted}
            multiline
            onSubmitEditing={() => enviar()}
            blurOnSubmit={false}
          />
        </View>
        <TouchableOpacity
          style={[styles.sendBtn, (!texto.trim() || digitando) && !iaEsgotada && styles.sendBtnDisabled, iaEsgotada && styles.sendBtnPro]}
          onPress={() => (iaEsgotada ? irParaPlanos('chat_input') : enviar())}
          disabled={(!texto.trim() || digitando) && !iaEsgotada}
          activeOpacity={0.85}
          accessibilityLabel={iaEsgotada ? 'Ver planos' : 'Enviar mensagem'}
        >
          <MaterialCommunityIcons name={iaEsgotada ? 'crown-outline' : 'send'} size={20} color={textoSobre(iaEsgotada ? cores.plan : cores.primary)} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function Balao({ role, texto, falhou, onTentarDeNovo, onTransformarEmOrcamento }: { role: 'user' | 'assistant'; texto: string; falhou?: boolean; onTentarDeNovo?: () => void; onTransformarEmOrcamento?: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const isUser = role === 'user';
  if (isUser) {
    return (
      <View style={styles.rowUser}>
        <View style={[styles.bubble, styles.bubbleUser]}>
          <Text style={styles.bubbleUserText}>{texto}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.rowOlli}>
      <View style={styles.olliAvatar}>
        <OlliMascot size={26} onDark float={false} blink={false} />
      </View>
      <View style={{ maxWidth: '78%' }}>
        <View style={[styles.bubble, styles.bubbleOlli, falhou && styles.bubbleErro, { maxWidth: '100%' }]}>
          <Text style={styles.bubbleOlliText}>{texto}</Text>
        </View>
        {falhou && (
          <TouchableOpacity style={styles.tentarDeNovoBtn} onPress={onTentarDeNovo} activeOpacity={0.75}>
            <MaterialCommunityIcons name="refresh" size={14} color={cores.accentLight} />
            <Text style={styles.tentarDeNovoText}>Tentar de novo</Text>
          </TouchableOpacity>
        )}
        {!falhou && onTransformarEmOrcamento && (
          <TouchableOpacity style={styles.transformarBtn} onPress={onTransformarEmOrcamento} activeOpacity={0.75}>
            <MaterialCommunityIcons name="file-plus-outline" size={14} color={cores.accentLight} />
            <Text style={styles.transformarText}>Transformar em orçamento</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function PontoPulsante({ delay }: { delay: number }) {
  const styles = useEstilos(criarEstilos);
  const reduzir = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // reduced-motion: pontos estáticos (o estado "digitando" já é sinalizado pelo texto/layout).
    if (reduzir) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(450 - delay >= 0 ? 450 - delay : 0),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, t, reduzir]);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const opacity = t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return <Animated.View style={[styles.typingDot, { opacity, transform: [{ translateY }] }]} />;
}

function Digitando({ podeCancelar, onCancelar }: { podeCancelar: boolean; onCancelar: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <AnimatedEntrance from="bottom">
      <View style={styles.rowOlli}>
        <View style={styles.olliAvatar}>
          <OlliMascot size={26} onDark float={false} blink={false} />
        </View>
        <View>
          <View style={[styles.bubble, styles.bubbleOlli, styles.bubbleTyping]}>
            <PontoPulsante delay={0} />
            <PontoPulsante delay={150} />
            <PontoPulsante delay={300} />
          </View>
          {podeCancelar && (
            <TouchableOpacity style={styles.tentarDeNovoBtn} onPress={onCancelar} activeOpacity={0.75}>
              <MaterialCommunityIcons name="close" size={14} color={cores.onSurfaceVariant} />
              <Text style={styles.cancelarText}>Cancelar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </AnimatedEntrance>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },

  rowUser: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  rowOlli: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'flex-end', marginBottom: 12 },
  // rgba(127,233,245,x) era o accentLight estático — vira o accentLight do tema.
  olliAvatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: comAlfa(c.accentLight, 0.12), borderWidth: 1, borderColor: comAlfa(c.accentLight, 0.3), justifyContent: 'center', alignItems: 'center', marginRight: 8 },

  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11 },
  bubbleUser: { backgroundColor: c.primary, borderBottomRightRadius: 5, ...sombrasDe(c).sm },
  bubbleUserText: { fontSize: 14.5, color: '#fff', lineHeight: 20 },
  bubbleOlli: { backgroundColor: c.surfaceElevated, borderWidth: 1, borderColor: c.outline, borderBottomLeftRadius: 5 },
  bubbleOlliText: { fontSize: 14.5, color: c.onSurface, lineHeight: 20 },
  // rgba(247,178,59,x) era o warning estático — vira o warning do tema.
  bubbleErro: { borderColor: comAlfa(c.warning, 0.4), backgroundColor: comAlfa(c.warning, 0.08) },
  bubbleTyping: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.accentLight },

  tentarDeNovoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 4, paddingVertical: 4 },
  tentarDeNovoText: { fontSize: 12.5, fontWeight: '700', color: c.accentLight },
  cancelarText: { fontSize: 12.5, fontWeight: '600', color: c.onSurfaceVariant },
  transformarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 4, paddingVertical: 4 },
  transformarText: { fontSize: 12.5, fontWeight: '700', color: c.accentLight },

  sugestoesWrap: { marginTop: 8 },
  sugestoesLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, color: c.onSurfaceVariant, textTransform: 'uppercase', marginBottom: 10, marginLeft: 4 },
  // rgba(52,198,217,x) era o accent estático — vira o accent do tema.
  sugestaoChip: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: comAlfa(c.accent, 0.07), borderWidth: 1, borderColor: comAlfa(c.accent, 0.28), borderRadius: BorderRadius.md, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 9 },
  sugestaoText: { flex: 1, fontSize: 14, color: c.onSurface, fontWeight: '600' },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingHorizontal: Spacing.base, paddingTop: 10, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  inputWrap: { flex: 1, backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outline, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 10 : 4, justifyContent: 'center', maxHeight: 120, minHeight: 46 },
  input: { fontSize: 15, color: c.onSurface, maxHeight: 100 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center', ...sombrasDe(c).glowBlue },
  sendBtnDisabled: { backgroundColor: c.surfaceElevated, opacity: 0.6, shadowOpacity: 0 },
  sendBtnPro: { backgroundColor: c.plan, shadowColor: c.plan },
});
