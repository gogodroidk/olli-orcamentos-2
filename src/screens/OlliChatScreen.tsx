import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
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

const CHAT_KEY = 'olli.chat';

interface Bolha {
  id: string;
  role: 'user' | 'assistant';
  texto: string;
}

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
  const nav = useNavigation();
  const insets = useSafeAreaInsets();

  const [bolhas, setBolhas] = useState<Bolha[]>([SAUDACAO]);
  const [texto, setTexto] = useState('');
  const [digitando, setDigitando] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

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

  const enviar = useCallback(async (mensagem?: string) => {
    const conteudo = (mensagem ?? texto).trim();
    if (!conteudo || digitando) return;
    Haptics.selectionAsync().catch(() => {});

    const userBolha: Bolha = { id: generateId(), role: 'user', texto: conteudo };
    const proximas = [...bolhas, userBolha];
    setBolhas(proximas);
    setTexto('');
    setDigitando(true);

    // monta o histórico para o endpoint (sem a saudação fixa inicial)
    const historico: ChatMensagem[] = proximas
      .filter(b => b.id !== 'olli-hello')
      .slice(-20) // janela: últimas ~20 msgs (evita estourar contexto/custo da IA)
      .map(b => ({ role: b.role, texto: b.texto }));

    const res = await enviarChat(historico);
    setDigitando(false);
    setBolhas(prev => [...prev, { id: generateId(), role: 'assistant', texto: res.resposta }]);
    if (res.ok) Haptics.selectionAsync().catch(() => {});
  }, [texto, bolhas, digitando]);

  const limpar = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setBolhas([SAUDACAO]);
    AsyncStorage.removeItem(CHAT_KEY).catch(() => {});
  }, []);

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
          <Balao key={b.id} role={b.role} texto={b.texto} />
        ))}

        {digitando && <Digitando />}

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

function Balao({ role, texto }: { role: 'user' | 'assistant'; texto: string }) {
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
      <View style={[styles.bubble, styles.bubbleOlli]}>
        <Text style={styles.bubbleOlliText}>{texto}</Text>
      </View>
    </View>
  );
}

function Digitando() {
  return (
    <View style={styles.rowOlli}>
      <View style={styles.olliAvatar}>
        <OlliMascot size={26} onDark float={false} blink={false} />
      </View>
      <View style={[styles.bubble, styles.bubbleOlli, styles.bubbleTyping]}>
        <ActivityIndicator size="small" color={Colors.accentLight} />
        <Text style={styles.typingText}>OLLI está digitando…</Text>
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
  bubbleTyping: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { fontSize: 13, color: Colors.onSurfaceVariant, fontStyle: 'italic' },

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
