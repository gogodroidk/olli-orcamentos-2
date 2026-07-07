import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliMascot } from '../components/OlliMascot';
import { enviarChat, ChatMensagem } from '../services/olliAssistente';
import { generateId } from '../utils/id';
import { goBackOrHome } from '../navigation/safeBack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { CHAT_KEY } from '../services/storageKeys';

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
      if (res.ok) Haptics.selectionAsync().catch(() => {});
    } finally {
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      setDigitando(false);
      setPodeCancelar(false);
      abortRef.current = null;
    }
  }, []);

  const enviar = useCallback(async (mensagem?: string) => {
    const conteudo = (mensagem ?? texto).trim();
    if (!conteudo || digitando) return;
    Haptics.selectionAsync().catch(() => {});

    const userBolha: Bolha = { id: generateId(), role: 'user', texto: conteudo };
    const proximas = [...bolhas, userBolha];
    setBolhas(proximas);
    setTexto('');
    await chamarIA(proximas);
  }, [texto, bolhas, digitando, chamarIA]);

  const cancelarEnvio = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    abortRef.current?.abort();
  }, []);

  const tentarDeNovo = useCallback((bolhaErroId: string) => {
    if (digitando) return;
    // remove a bolha de erro e reenvia a IA com o histórico até a última msg do usuário
    const idx = bolhas.findIndex(b => b.id === bolhaErroId);
    if (idx <= 0) return;
    const historicoBase = bolhas.slice(0, idx);
    if (historicoBase[historicoBase.length - 1]?.role !== 'user') return;
    Haptics.selectionAsync().catch(() => {});
    setBolhas(historicoBase);
    chamarIA(historicoBase);
  }, [bolhas, digitando, chamarIA]);

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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <GradientHeader
        title="Chat com a OLLI"
        subtitle="Sua assistente técnica"
        onBack={() => goBackOrHome(nav)}
        right={
          <TouchableOpacity onPress={limpar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Limpar conversa">
            <MaterialCommunityIcons name="broom" size={22} color="rgba(255,255,255,0.85)" />
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
          <Balao
            key={b.id}
            role={b.role}
            texto={b.texto}
            falhou={b.falhou}
            onTentarDeNovo={() => tentarDeNovo(b.id)}
            onTransformarEmOrcamento={b.id !== 'olli-hello' ? () => criarOrcamentoDaResposta(b.texto) : undefined}
          />
        ))}

        {digitando && <Digitando podeCancelar={podeCancelar} onCancelar={cancelarEnvio} />}

        {mostrarSugestoes && (
          <View style={styles.sugestoesWrap}>
            <Text style={styles.sugestoesLabel}>Sugestões para começar</Text>
            {SUGESTOES.map(s => (
              <TouchableOpacity key={s} style={styles.sugestaoChip} onPress={() => enviar(s)} activeOpacity={0.8}>
                <MaterialCommunityIcons name="lightbulb-on-outline" size={16} color={Colors.accentLight} />
                <Text style={styles.sugestaoText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* INPUT */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={texto}
            onChangeText={setTexto}
            placeholder="Escreva sua mensagem…"
            placeholderTextColor={Colors.onSurfaceMuted}
            multiline
            onSubmitEditing={() => enviar()}
            blurOnSubmit={false}
          />
        </View>
        <TouchableOpacity
          style={[styles.sendBtn, (!texto.trim() || digitando) && styles.sendBtnDisabled]}
          onPress={() => enviar()}
          disabled={!texto.trim() || digitando}
          activeOpacity={0.85}
          accessibilityLabel="Enviar mensagem"
        >
          <MaterialCommunityIcons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function Balao({ role, texto, falhou, onTentarDeNovo, onTransformarEmOrcamento }: { role: 'user' | 'assistant'; texto: string; falhou?: boolean; onTentarDeNovo?: () => void; onTransformarEmOrcamento?: () => void }) {
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
            <MaterialCommunityIcons name="refresh" size={14} color={Colors.accentLight} />
            <Text style={styles.tentarDeNovoText}>Tentar de novo</Text>
          </TouchableOpacity>
        )}
        {!falhou && onTransformarEmOrcamento && (
          <TouchableOpacity style={styles.transformarBtn} onPress={onTransformarEmOrcamento} activeOpacity={0.75}>
            <MaterialCommunityIcons name="file-plus-outline" size={14} color={Colors.accentLight} />
            <Text style={styles.transformarText}>Transformar em orçamento</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function Digitando({ podeCancelar, onCancelar }: { podeCancelar: boolean; onCancelar: () => void }) {
  return (
    <View style={styles.rowOlli}>
      <View style={styles.olliAvatar}>
        <OlliMascot size={26} onDark float={false} blink={false} />
      </View>
      <View>
        <View style={[styles.bubble, styles.bubbleOlli, styles.bubbleTyping]}>
          <ActivityIndicator size="small" color={Colors.accentLight} />
          <Text style={styles.typingText}>OLLI está digitando…</Text>
        </View>
        {podeCancelar && (
          <TouchableOpacity style={styles.tentarDeNovoBtn} onPress={onCancelar} activeOpacity={0.75}>
            <MaterialCommunityIcons name="close" size={14} color={Colors.onSurfaceVariant} />
            <Text style={styles.cancelarText}>Cancelar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  rowUser: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  rowOlli: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'flex-end', marginBottom: 12 },
  olliAvatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.3)', justifyContent: 'center', alignItems: 'center', marginRight: 8 },

  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11 },
  bubbleUser: { backgroundColor: Colors.primary, borderBottomRightRadius: 5, ...Shadow.sm },
  bubbleUserText: { fontSize: 14.5, color: '#fff', lineHeight: 20 },
  bubbleOlli: { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.outline, borderBottomLeftRadius: 5 },
  bubbleOlliText: { fontSize: 14.5, color: Colors.onSurface, lineHeight: 20 },
  bubbleErro: { borderColor: 'rgba(247,178,59,0.4)', backgroundColor: 'rgba(247,178,59,0.08)' },
  bubbleTyping: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { fontSize: 13, color: Colors.onSurfaceVariant, fontStyle: 'italic' },

  tentarDeNovoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 4, paddingVertical: 4 },
  tentarDeNovoText: { fontSize: 12.5, fontWeight: '700', color: Colors.accentLight },
  cancelarText: { fontSize: 12.5, fontWeight: '600', color: Colors.onSurfaceVariant },
  transformarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 4, paddingVertical: 4 },
  transformarText: { fontSize: 12.5, fontWeight: '700', color: Colors.accentLight },

  sugestoesWrap: { marginTop: 8 },
  sugestoesLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, color: Colors.onSurfaceVariant, textTransform: 'uppercase', marginBottom: 10, marginLeft: 4 },
  sugestaoChip: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(52,198,217,0.07)', borderWidth: 1, borderColor: 'rgba(52,198,217,0.28)', borderRadius: BorderRadius.md, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 9 },
  sugestaoText: { flex: 1, fontSize: 14, color: Colors.onSurface, fontWeight: '600' },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingHorizontal: Spacing.base, paddingTop: 10, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.outline },
  inputWrap: { flex: 1, backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.outline, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 10 : 4, justifyContent: 'center', maxHeight: 120, minHeight: 46 },
  input: { fontSize: 15, color: Colors.onSurface, maxHeight: 100 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', ...Shadow.glowBlue },
  sendBtnDisabled: { backgroundColor: Colors.surfaceElevated, opacity: 0.6, shadowOpacity: 0 },
});
