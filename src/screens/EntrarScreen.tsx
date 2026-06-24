import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow, Gradients } from '../theme';
import { Fonts } from '../theme/fonts';
import { OlliInput } from '../components/OlliInput';
import { OlliButton } from '../components/OlliButton';
import { OlliMascot } from '../components/OlliMascot';
import { isSupabaseConfigured, signIn, signUp, supabase } from '../services/supabase';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Entrar'>;
type Modo = 'login' | 'signup';

/**
 * Tela "Entrar" dedicada (protótipo 03). É OPCIONAL: o OLLI é offline-first,
 * então quem quiser pode "usar sem conta". A conta serve para backup na nuvem,
 * link do cliente e a OLLI por voz/chat. Reaproveita o auth do Supabase.
 */
export default function EntrarScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const configured = isSupabaseConfigured();

  const [modo, setModo] = useState<Modo>('login');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [busy, setBusy] = useState(false);

  function entrarNoApp() {
    nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Tabs' }] }));
  }

  async function handleAuth() {
    if (!configured) {
      Alert.alert('Backup na nuvem não configurado', 'Você já pode usar o OLLI offline. Ative a nuvem em Conta quando quiser.');
      return;
    }
    if (modo === 'signup' && !nome.trim()) {
      Alert.alert('Faltou o nome', 'Informe seu nome completo.');
      return;
    }
    if (!email.trim() || senha.length < 8) {
      Alert.alert('Atenção', 'Informe um e-mail válido e senha de pelo menos 8 caracteres.');
      return;
    }
    if (modo === 'signup' && senha !== confirmar) {
      Alert.alert('Senhas diferentes', 'A senha e a confirmação não são iguais.');
      return;
    }
    const emailLimpo = email.trim();
    setBusy(true);
    try {
      if (modo === 'signup') {
        const data = await signUp(emailLimpo, senha, nome.trim());
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (data.session) {
          entrarNoApp();
        } else {
          setModo('login');
          setSenha(''); setConfirmar('');
          Alert.alert('Confirme seu e-mail', `Enviamos um link de confirmação para ${emailLimpo}. Confirme e depois entre aqui.`);
        }
      } else {
        await signIn(emailLimpo, senha);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        entrarNoApp();
      }
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      let titulo = 'Ops';
      let texto = msg || 'Não foi possível autenticar.';
      if (/already registered|already exists|User already/i.test(msg)) {
        titulo = 'E-mail já cadastrado';
        texto = 'Esse e-mail já tem conta. Tente entrar.';
      } else if (/invalid login credentials|invalid credentials/i.test(msg)) {
        titulo = 'E-mail ou senha incorretos';
        texto = 'Confira os dados. Se acabou de criar a conta, confirme o e-mail antes de entrar.';
      } else if (/invalid.*email|email.*invalid/i.test(msg)) {
        titulo = 'E-mail inválido';
        texto = 'Confira o e-mail digitado.';
      }
      Alert.alert(titulo, texto);
    }
    setBusy(false);
  }

  function emBreve(rotulo: string) {
    Haptics.selectionAsync().catch(() => {});
    Alert.alert(rotulo, 'Esse acesso rápido chega em breve. Por enquanto, entre com e-mail e senha.');
  }

  /** Recuperar senha: envia o e-mail de redefinição do Supabase. */
  async function recuperarSenha() {
    Haptics.selectionAsync().catch(() => {});
    const e = email.trim();
    if (!e) { Alert.alert('Recuperar senha', 'Digite seu e-mail no campo acima primeiro.'); return; }
    if (!supabase) { Alert.alert('Indisponível', 'O backup na nuvem não está configurado.'); return; }
    try {
      await supabase.auth.resetPasswordForEmail(e);
      Alert.alert('Verifique seu e-mail', `Se existir uma conta para ${e}, enviamos um link para redefinir a senha.`);
    } catch {
      Alert.alert('Ops', 'Não consegui enviar agora. Tente de novo em instantes.');
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* HERO */}
        <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 44 }]}>
          <View style={styles.glow1} />
          <View style={styles.glow2} />
          <OlliMascot size={72} onDark />
          <Text style={styles.brand}>OLLI</Text>
          <Text style={styles.tagline}>{modo === 'login' ? 'Que bom te ver de novo 👋' : 'Vamos criar a sua conta'}</Text>
        </LinearGradient>

        <View style={styles.body}>
          {modo === 'signup' && (
            <OlliInput label="Nome completo" value={nome} onChangeText={setNome} placeholder="João da Silva" leftIcon="account" autoCapitalize="words" />
          )}
          <OlliInput label="E-mail" value={email} onChangeText={setEmail} placeholder="voce@email.com" keyboardType="email-address" autoCapitalize="none" leftIcon="email" />
          <OlliInput
            label="Senha"
            value={senha}
            onChangeText={setSenha}
            placeholder="mínimo 8 caracteres"
            secureTextEntry={!verSenha}
            leftIcon="lock"
            rightIcon={verSenha ? 'eye-off' : 'eye'}
            onRightIconPress={() => setVerSenha(v => !v)}
          />
          {modo === 'signup' && (
            <OlliInput label="Confirmar senha" value={confirmar} onChangeText={setConfirmar} placeholder="repita a senha" secureTextEntry={!verSenha} leftIcon="lock-check" />
          )}

          {modo === 'login' && (
            <TouchableOpacity onPress={recuperarSenha} style={styles.forgotWrap}>
              <Text style={styles.forgot}>Esqueci a senha</Text>
            </TouchableOpacity>
          )}

          <OlliButton
            label={modo === 'login' ? 'Entrar' : 'Criar conta'}
            variant="gradient" size="lg" fullWidth loading={busy} onPress={handleAuth}
            icon={<MaterialCommunityIcons name={modo === 'login' ? 'login' : 'account-plus'} size={20} color="#fff" />}
            style={{ marginTop: modo === 'login' ? 4 : 8 }}
          />

          {/* ACESSO RÁPIDO */}
          <View style={styles.dividerRow}>
            <View style={styles.divLine} />
            <Text style={styles.divText}>acesso rápido</Text>
            <View style={styles.divLine} />
          </View>
          <View style={styles.socialRow}>
            <SocialBtn icon="face-recognition" label="Biometria" onPress={() => emBreve('Entrar com biometria')} />
            <SocialBtn icon="google" label="Google" onPress={() => emBreve('Entrar com Google')} />
            <SocialBtn icon="apple" label="Apple" onPress={() => emBreve('Entrar com Apple')} />
          </View>

          {/* ALTERNA LOGIN/SIGNUP */}
          <TouchableOpacity onPress={() => { Haptics.selectionAsync().catch(() => {}); setModo(modo === 'login' ? 'signup' : 'login'); }} style={styles.switchWrap}>
            <Text style={styles.switchText}>
              {modo === 'login' ? 'Ainda não tem conta? ' : 'Já tem conta? '}
              <Text style={styles.switchLink}>{modo === 'login' ? 'Criar agora' : 'Entrar'}</Text>
            </Text>
          </TouchableOpacity>

          {/* OFFLINE-FIRST: usar sem conta */}
          <TouchableOpacity onPress={() => { Haptics.selectionAsync().catch(() => {}); entrarNoApp(); }} style={styles.skipWrap} accessibilityRole="button">
            <MaterialCommunityIcons name="cloud-off-outline" size={16} color={Colors.onSurfaceVariant} />
            <Text style={styles.skip}>Usar sem conta (offline)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SocialBtn({ icon, label, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.social} onPress={onPress} activeOpacity={0.85}>
      <MaterialCommunityIcons name={icon} size={24} color={Colors.accentLight} />
      <Text style={styles.socialLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  hero: { alignItems: 'center', paddingHorizontal: Spacing.base, paddingBottom: 36, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  glow1: { position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(127,233,245,0.16)' },
  glow2: { position: 'absolute', bottom: -50, left: -50, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(52,198,217,0.12)' },
  brand: { fontSize: 30, fontFamily: Fonts.extraBold, color: '#fff', letterSpacing: 0, marginTop: 14, paddingLeft: 5 },
  tagline: { fontSize: 13.5, fontFamily: Fonts.semiBold, color: Colors.accentLight, marginTop: 5 },

  body: { padding: Spacing.base, paddingTop: Spacing.lg },

  forgotWrap: { alignSelf: 'flex-end', paddingVertical: 4, marginBottom: 8 },
  forgot: { fontSize: 13, fontWeight: '700', color: Colors.accentLight },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginVertical: 22 },
  divLine: { flex: 1, height: 1, backgroundColor: Colors.outline },
  divText: { fontSize: 11.5, color: Colors.onSurfaceMuted },

  socialRow: { flexDirection: 'row', gap: 11 },
  social: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 13, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.outlineDark, backgroundColor: Colors.surface, ...Shadow.sm },
  socialLabel: { fontSize: 12, fontWeight: '700', color: '#fff' },

  switchWrap: { paddingVertical: 18, alignItems: 'center' },
  switchText: { fontSize: 14, color: Colors.onSurfaceVariant },
  switchLink: { color: Colors.accentLight, fontWeight: '800' },

  skipWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 8 },
  skip: { fontSize: 13.5, fontWeight: '600', color: Colors.onSurfaceVariant },
});
