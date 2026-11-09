import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../theme';
import { OlliButton } from './OlliButton';
import { supabase } from '../services/supabase';
import { confirmarCodigoDaSessao, sessaoPrecisaDeCodigo } from '../services/sessaoMfa';

/**
 * "Manter este celular conectado" — só para conta com verificação em duas etapas.
 *
 * O Supabase apaga as sessões `aal1` da conta toda vez que alguém confirma o
 * código do autenticador (no painel admin, por exemplo). Sem o código, a sessão
 * do celular é `aal1` e o app caía no "Entrar" depois de cada login no painel.
 * Com o código confirmado aqui uma vez, a sessão vira `aal2` e sobrevive.
 * (Ver services/sessaoMfaCore.ts.)
 *
 * NÃO bloqueia nada: "Agora não" fecha até a próxima abertura do app. Cliente
 * sem MFA nunca vê. Na web não aparece.
 */
export function AvisoSessaoMfa() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const [visivel, setVisivel] = useState(false);
  const [fechado, setFechado] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const conferir = useCallback(() => {
    // setTimeout: nada de chamar o auth DENTRO do callback do auth (lock interno).
    setTimeout(() => {
      void sessaoPrecisaDeCodigo().then(setVisivel);
    }, 0);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !supabase) return undefined;
    conferir();
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') {
        setVisivel(false);
        setFechado(false);
        setCodigo('');
        setErro(null);
        return;
      }
      if (evento === 'SIGNED_IN' || evento === 'INITIAL_SESSION' || evento === 'MFA_CHALLENGE_VERIFIED' || evento === 'USER_UPDATED') {
        conferir();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [conferir]);

  if (Platform.OS === 'web' || !visivel || fechado) return null;

  async function confirmar() {
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await confirmarCodigoDaSessao(codigo);
    setEnviando(false);
    if (r === 'ok') {
      setVisivel(false);
      setCodigo('');
      return;
    }
    if (r === 'codigo_invalido') setErro('Código inválido ou vencido. Confira no app autenticador e tente de novo.');
    else if (r === 'sem_fator') setVisivel(false);
    else setErro('Não deu para confirmar agora. Verifique a internet e tente de novo.');
  }

  return (
    <View pointerEvents="box-none" style={[styles.camada, { top: insets.top + Spacing.sm }]}>
      <View style={styles.card} accessibilityRole="alert">
        <View style={styles.cabeca}>
          <View style={[styles.icone, { backgroundColor: comAlfa(cores.primary, 0.14) }]}>
            <MaterialCommunityIcons name="shield-key-outline" size={18} color={cores.primary} accessible={false} importantForAccessibility="no" />
          </View>
          <View style={styles.textos}>
            <Text style={styles.titulo} accessibilityRole="header">Manter este celular conectado</Text>
            <Text style={styles.texto}>
              Sua conta usa verificação em duas etapas. Digite o código do app autenticador uma vez para o OLLI não te desconectar quando você entrar no painel.
            </Text>
          </View>
        </View>
        <TextInput
          value={codigo}
          onChangeText={(t) => setCodigo(t.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          placeholderTextColor={cores.onSurfaceVariant}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          style={styles.campo}
          accessibilityLabel="Código de 6 dígitos do app autenticador"
          onSubmitEditing={() => { void confirmar(); }}
        />
        {erro ? <Text style={styles.erro}>{erro}</Text> : null}
        <View style={styles.botoes}>
          <OlliButton
            label="Agora não"
            size="sm"
            variant="ghost"
            onPress={() => setFechado(true)}
            accessibilityLabel="Agora não. Fechar o aviso de verificação em duas etapas"
          />
          <OlliButton
            label="Confirmar"
            size="sm"
            loading={enviando}
            disabled={codigo.length !== 6}
            onPress={() => { void confirmar(); }}
          />
        </View>
      </View>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  camada: { position: 'absolute', left: Spacing.base, right: Spacing.base, zIndex: 21, alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: comAlfa(c.primary, 0.45),
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cabeca: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icone: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, gap: 2 },
  titulo: { color: c.onSurface, fontWeight: '800', fontSize: 15 },
  texto: { color: c.onSurfaceVariant, fontSize: 13, lineHeight: 19 },
  campo: {
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: c.onSurface,
    fontSize: 20,
    letterSpacing: 6,
    textAlign: 'center',
  },
  erro: { color: c.danger, fontSize: 13 },
  botoes: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
});
