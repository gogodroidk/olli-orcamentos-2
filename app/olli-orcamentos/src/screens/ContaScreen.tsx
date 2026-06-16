import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { OlliLogo } from '../components/OlliLogo';

function GoogleG() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 5.1 29.6 3 24 3 16 3 9.1 7.6 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.3 35.9 26.8 37 24 37c-5.3 0-9.7-2.6-11.3-7l-6.5 5C9 40.4 15.9 45 24 45z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.3C39.9 35.7 45 30.5 45 24c0-1.2-.1-2.3-.4-3.5z" />
    </Svg>
  );
}
import { isSupabaseConfigured, signIn, signUp, signOut, getCurrentUser } from '../services/supabase';
import { backupNow, restoreFromCloud, getCloudBackupDate } from '../services/backup';
import { formatDateTime } from '../utils/date';

export default function ContaScreen() {
  const nav = useNavigation();
  const configured = isSupabaseConfigured();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('signup');

  const load = useCallback(async () => {
    if (!configured) return;
    const u = await getCurrentUser();
    setUser(u ? { email: u.email } : null);
    if (u) setLastBackup(await getCloudBackupDate());
  }, [configured]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleAuth() {
    if (mode === 'signup' && !nome.trim()) {
      Alert.alert('Faltou o nome', 'Informe seu nome completo.');
      return;
    }
    if (!email.trim() || senha.length < 6) {
      Alert.alert('Atenção', 'Informe um e-mail válido e senha de pelo menos 6 caracteres.');
      return;
    }
    if (mode === 'signup' && senha !== confirmar) {
      Alert.alert('Senhas diferentes', 'A senha e a confirmação não são iguais.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp(email, senha, nome.trim());
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Conta criada!', 'Tudo certo. Bem-vindo ao OLLI!');
        await load();
      } else {
        await signIn(email, senha);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setSenha('');
        await load();
      }
    } catch (e: any) {
      Alert.alert('Ops', e?.message ?? 'Não foi possível autenticar.');
    }
    setBusy(false);
  }

  function handleGoogle() {
    Alert.alert(
      'Login com Google',
      'O login com Google entra na próxima atualização. Por enquanto, crie sua conta com e-mail e senha — é rapidinho.',
    );
  }

  async function handleBackup() {
    setBusy(true);
    try {
      const when = await backupNow();
      setLastBackup(when);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Backup feito!', 'Seus dados estão seguros na nuvem.');
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Falha ao fazer backup.');
    }
    setBusy(false);
  }

  function handleRestore() {
    Alert.alert(
      'Restaurar da nuvem',
      'Isso vai SUBSTITUIR os dados atuais do celular pelos do último backup. Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar', style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const when = await restoreFromCloud();
              Alert.alert('Restaurado!', `Dados do backup de ${formatDateTime(when)} aplicados.`);
            } catch (e: any) {
              Alert.alert('Erro', e?.message ?? 'Falha ao restaurar.');
            }
            setBusy(false);
          },
        },
      ]
    );
  }

  async function handleLogout() {
    await signOut();
    setUser(null);
    setLastBackup(null);
  }

  return (
    <View style={styles.container}>
      <GradientHeader title="Conta e Backup" subtitle="Proteja seus dados na nuvem" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {/* NÃO CONFIGURADO */}
        {!configured && (
          <View style={styles.card}>
            <View style={styles.iconHeader}>
              <MaterialCommunityIcons name="cloud-cog-outline" size={28} color={Colors.warning} />
              <Text style={styles.cardTitle}>Backup ainda não ativado</Text>
            </View>
            <Text style={styles.text}>
              Para ativar o backup na nuvem, é preciso criar um projeto gratuito no Supabase e colar 2 chaves no app.
              É rápido — peça ao assistente para te guiar.
            </Text>
            <View style={styles.stepRow}><Text style={styles.stepNum}>1</Text><Text style={styles.stepText}>Crie conta grátis em supabase.com</Text></View>
            <View style={styles.stepRow}><Text style={styles.stepNum}>2</Text><Text style={styles.stepText}>Cole a URL e a chave no arquivo de configuração</Text></View>
            <View style={styles.stepRow}><Text style={styles.stepNum}>3</Text><Text style={styles.stepText}>Pronto: login e backup automático</Text></View>
          </View>
        )}

        {/* CONFIGURADO, SEM LOGIN */}
        {configured && !user && (
          <>
            <View style={styles.brandHero}>
              <OlliLogo size={64} />
              <Text style={styles.brandHeroTitle}>{mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}</Text>
              <Text style={styles.brandHeroSub}>Seus orçamentos seguros e em qualquer aparelho.</Text>
            </View>

            <View style={styles.card}>
              <TouchableOpacity style={styles.googleBtn} onPress={handleGoogle} activeOpacity={0.85}>
                <GoogleG />
                <Text style={styles.googleLabel}>Continuar com Google</Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>ou com e-mail</Text>
                <View style={styles.dividerLine} />
              </View>

              {mode === 'signup' && (
                <OlliInput label="Nome completo" value={nome} onChangeText={setNome} placeholder="João da Silva" leftIcon="account" autoCapitalize="words" />
              )}
              <OlliInput label="E-mail" value={email} onChangeText={setEmail} placeholder="voce@email.com" keyboardType="email-address" autoCapitalize="none" leftIcon="email" />
              <OlliInput label="Senha" value={senha} onChangeText={setSenha} placeholder="mínimo 6 caracteres" secureTextEntry leftIcon="lock" />
              {mode === 'signup' && (
                <OlliInput label="Confirmar senha" value={confirmar} onChangeText={setConfirmar} placeholder="repita a senha" secureTextEntry leftIcon="lock-check" />
              )}

              <OlliButton
                label={mode === 'login' ? 'Entrar' : 'Criar conta'}
                variant="gradient" size="lg" fullWidth loading={busy} onPress={handleAuth}
                icon={<MaterialCommunityIcons name={mode === 'login' ? 'login' : 'account-plus'} size={20} color="#fff" />}
              />
            </View>

            <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} style={{ paddingVertical: 8 }}>
              <Text style={styles.switchMode}>
                {mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}
                <Text style={{ color: Colors.primary, fontWeight: '700' }}>{mode === 'login' ? 'Criar agora' : 'Entrar'}</Text>
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* LOGADO */}
        {configured && user && (
          <>
            <View style={styles.card}>
              <View style={styles.userRow}>
                <View style={styles.avatar}><MaterialCommunityIcons name="account" size={26} color={Colors.primary} /></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  <View style={styles.connected}>
                    <View style={styles.dot} />
                    <Text style={styles.connectedText}>Conectado à nuvem</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Backup</Text>
              <View style={styles.backupStatus}>
                <MaterialCommunityIcons name={lastBackup ? 'cloud-check' : 'cloud-alert'} size={20} color={lastBackup ? Colors.success : Colors.warning} />
                <Text style={styles.backupText}>
                  {lastBackup ? `Último backup: ${formatDateTime(lastBackup)}` : 'Nenhum backup ainda'}
                </Text>
              </View>
              <OlliButton label="Fazer backup agora" variant="gradient" size="lg" fullWidth loading={busy} onPress={handleBackup} icon={<MaterialCommunityIcons name="cloud-upload" size={20} color="#fff" />} style={{ marginBottom: 10 }} />
              <OlliButton label="Restaurar da nuvem" variant="outline" size="lg" fullWidth onPress={handleRestore} icon={<MaterialCommunityIcons name="cloud-download" size={20} color={Colors.primary} />} />
            </View>

            <OlliButton label="Sair da conta" variant="ghost" size="md" fullWidth onPress={handleLogout} haptic={false} />
          </>
        )}

        {busy && !user && <ActivityIndicator color={Colors.primary} style={{ marginTop: 16 }} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.base, ...Shadow.sm },
  iconHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.base },
  cardTitle: { fontSize: 17, fontWeight: '800', color: Colors.onSurface },
  text: { fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 21, marginBottom: Spacing.base },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primaryContainer, color: Colors.primary, fontWeight: '800', textAlign: 'center', lineHeight: 24, fontSize: 13 },
  stepText: { flex: 1, fontSize: 13, color: Colors.onSurface },
  switchMode: { textAlign: 'center', color: Colors.onSurfaceVariant, fontSize: 14 },
  brandHero: { alignItems: 'center', paddingVertical: Spacing.lg },
  brandHeroTitle: { fontSize: 22, fontWeight: '800', color: Colors.onSurface, marginTop: 12 },
  brandHeroSub: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderColor: Colors.outline, borderRadius: BorderRadius.md, paddingVertical: 13, marginBottom: 4 },
  googleLabel: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.outline },
  dividerText: { fontSize: 12, color: Colors.onSurfaceMuted },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  userEmail: { fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  connected: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  connectedText: { fontSize: 12, color: Colors.success, fontWeight: '600' },
  backupStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.base },
  backupText: { fontSize: 13, color: Colors.onSurfaceVariant, flex: 1 },
});
