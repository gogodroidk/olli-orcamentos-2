import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { OlliLogo } from '../components/OlliLogo';
import { OlliMascot } from '../components/OlliMascot';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Empresa, SEGMENTOS } from '../types';
import { getEmpresa } from '../database/database';

import { isSupabaseConfigured, signIn, signUp, signOut, getCurrentUser, supabase } from '../services/supabase';
import { backupNow, restoreFromCloud, getCloudBackupDate } from '../services/backup';
import { formatDateTime } from '../utils/date';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Ferramentas que JÁ existem no app (todas no stack). Só listamos o que funciona de verdade.
const FERRAMENTAS: {
  key: string;
  icon: string;
  label: string;
  desc: string;
  color: string;
  route: keyof RootStackParamList;
}[] = [
  { key: 'olliVoz', icon: 'microphone', label: 'OLLI por voz', desc: 'Monte orçamentos falando', color: Colors.accent, route: 'OlliVoz' },
  { key: 'olliChat', icon: 'chat-processing-outline', label: 'Chat com a OLLI', desc: 'Sua assistente técnica', color: Colors.primaryLight, route: 'OlliChat' },
  { key: 'servicos', icon: 'wrench-outline', label: 'Catálogo de serviços', desc: 'Serviços e preços', color: Colors.primary, route: 'Servicos' },
  { key: 'produtos', icon: 'package-variant-closed', label: 'Produtos e peças', desc: 'Materiais e estoque', color: '#0891B2', route: 'Produtos' },
  { key: 'clientes', icon: 'account-group-outline', label: 'Clientes', desc: 'Sua base de clientes', color: '#A78BFA', route: 'Clientes' },
  { key: 'erro', icon: 'card-search-outline', label: 'Códigos de erro', desc: 'Diagnóstico · OLLI Técnica', color: Colors.accent, route: 'Diagnostico' },
  { key: 'recibo', icon: 'receipt', label: 'Recibos', desc: 'Emita recibos de pagamento', color: Colors.success, route: 'EmitirRecibo' },
  { key: 'negocio', icon: 'storefront-outline', label: 'Personalizar', desc: 'Seu negócio, logo e marca', color: '#F7B23B', route: 'MeuNegocio' },
];

export default function ContaScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const configured = isSupabaseConfigured();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    const emp = await getEmpresa();
    setEmpresa(emp);
    if (configured) {
      const u = await getCurrentUser();
      setUser(u ? { email: u.email } : null);
      if (u) setLastBackup(await getCloudBackupDate());
    }
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
    const emailLimpo = email.trim();
    setBusy(true);
    try {
      if (mode === 'signup') {
        const data = await signUp(emailLimpo, senha, nome.trim());
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (data.session) {
          // Confirmação de e-mail desligada: já entrou de verdade.
          Alert.alert('Conta criada!', 'Tudo certo. Bem-vindo ao OLLI!');
          setSenha('');
          setConfirmar('');
          setShowAuth(false);
          await load();
        } else {
          // Confirmação de e-mail pendente: NÃO há sessão. Seja honesto.
          setSenha('');
          setConfirmar('');
          setPendingEmail(emailLimpo);
          setMode('login');
          Alert.alert(
            'Confirme seu e-mail',
            `Conta criada! Enviamos um link de confirmação para ${emailLimpo}. Confirme no seu e-mail e depois faça login aqui.`,
          );
        }
      } else {
        await signIn(emailLimpo, senha);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setSenha('');
        setPendingEmail(null);
        setShowAuth(false);
        await load();
      }
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      let titulo = 'Ops';
      let texto = msg || 'Não foi possível autenticar.';
      if (/already registered|already exists|User already/i.test(msg)) {
        titulo = 'E-mail já cadastrado';
        texto = 'Esse e-mail já tem conta. Tente entrar (ou use "Esqueci a senha" no seu provedor).';
      } else if (/invalid.*email|email.*invalid/i.test(msg)) {
        titulo = 'E-mail inválido';
        texto = 'Confira o e-mail digitado e tente de novo.';
      } else if (/invalid login credentials|invalid credentials/i.test(msg)) {
        titulo = 'E-mail ou senha incorretos';
        texto = 'Confira os dados. Se acabou de criar a conta, confirme o e-mail antes de entrar.';
      }
      Alert.alert(titulo, texto);
    }
    setBusy(false);
  }

  async function handleResend() {
    if (!supabase || !pendingEmail) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: pendingEmail });
      if (error) throw error;
      Alert.alert('E-mail reenviado', `Mandamos um novo link de confirmação para ${pendingEmail}.`);
    } catch (e: any) {
      Alert.alert('Ops', e?.message ?? 'Não foi possível reenviar o e-mail agora.');
    }
    setBusy(false);
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
              await load();
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

  function abrirFerramenta(f: typeof FERRAMENTAS[number]) {
    Haptics.selectionAsync().catch(() => {});
    if (f.route === 'EmitirRecibo') nav.navigate('EmitirRecibo', {});
    else (nav as any).navigate(f.route);
  }

  const primeiroNome = empresa?.nomePrestador?.split(' ')[0] || 'prestador';
  const segmentoLabel = SEGMENTOS.find(s => s.id === empresa?.segmento)?.label;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headRow}>
          <Text style={styles.screenTitle}>Conta</Text>
          <OlliMascot size={34} onDark />
        </View>

        {/* CARD DE PERFIL (dados reais de Empresa) */}
        <AnimatedEntrance index={0}>
          <TouchableOpacity style={styles.profileCard} onPress={() => nav.navigate('MeuNegocio')} activeOpacity={0.85}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{primeiroNome.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.profileName} numberOfLines={1}>{empresa?.nomePrestador || 'Seu nome'}</Text>
              {empresa?.nome ? <Text style={styles.profileCompany} numberOfLines={1}>{empresa.nome}</Text> : null}
              {segmentoLabel ? (
                <View style={styles.segChip}>
                  <Text style={styles.segChipText}>{segmentoLabel}</Text>
                </View>
              ) : null}
            </View>
            <MaterialCommunityIcons name="pencil-outline" size={20} color={Colors.accent} />
          </TouchableOpacity>
        </AnimatedEntrance>

        {/* OLLI PRO (informativo) */}
        <AnimatedEntrance index={1}>
          <View style={styles.proCard}>
            <View style={styles.proHead}>
              <View style={styles.proBadge}>
                <MaterialCommunityIcons name="crown-outline" size={16} color="#0A1626" />
                <Text style={styles.proBadgeText}>OLLI PRO</Text>
              </View>
              <View style={styles.soonPill}><Text style={styles.soonPillText}>em breve</Text></View>
            </View>
            <Text style={styles.proTitle}>Leve o seu negócio ao próximo nível</Text>
            <Text style={styles.proSub}>Equipe ao vivo, relatórios avançados e a OLLI montando orçamentos por voz. Conheça os planos para autônomo e empresa.</Text>
            <TouchableOpacity
              style={styles.proBtn}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Planos'); }}
              activeOpacity={0.85}
            >
              <Text style={styles.proBtnText}>Quero saber mais</Text>
              <MaterialCommunityIcons name="arrow-right" size={16} color={Colors.accentLight} />
            </TouchableOpacity>
          </View>
        </AnimatedEntrance>

        {/* FERRAMENTAS */}
        <Text style={styles.sectionTitle}>Ferramentas</Text>
        <View style={styles.toolsCard}>
          {FERRAMENTAS.map((f, i) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.toolRow, i < FERRAMENTAS.length - 1 && styles.toolDivider]}
              onPress={() => abrirFerramenta(f)}
              activeOpacity={0.7}
            >
              <View style={[styles.toolIcon, { backgroundColor: f.color + '1E', borderColor: f.color + '3A' }]}>
                <MaterialCommunityIcons name={f.icon as any} size={20} color={f.color} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.toolLabel}>{f.label}</Text>
                <Text style={styles.toolDesc}>{f.desc}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.onSurfaceMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* CONTA E BACKUP (preserva login + backup Supabase) */}
        <Text style={styles.sectionTitle}>Conta e backup</Text>

        {!configured && (
          <View style={styles.card}>
            <View style={styles.iconHeader}>
              <MaterialCommunityIcons name="cloud-cog-outline" size={24} color={Colors.warning} />
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
          <View style={styles.card}>
            {!showAuth ? (
              <>
                <View style={styles.loginHero}>
                  <OlliLogo size={48} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.cardTitle}>Ative o backup na nuvem</Text>
                    <Text style={styles.textSm}>Entre para manter seus orçamentos seguros e em qualquer aparelho.</Text>
                  </View>
                </View>
                <OlliButton
                  label="Entrar / Criar conta"
                  variant="gradient" size="lg" fullWidth
                  onPress={() => setShowAuth(true)}
                  icon={<MaterialCommunityIcons name="login" size={20} color="#fff" />}
                />
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>{mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}</Text>
                <View style={{ height: 12 }} />

                {pendingEmail && mode === 'login' && (
                  <View style={styles.confirmBox}>
                    <MaterialCommunityIcons name="email-check-outline" size={20} color={Colors.accent} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.confirmTitle}>Confirme seu e-mail</Text>
                      <Text style={styles.confirmText}>
                        Enviamos um link para {pendingEmail}. Confirme por lá e depois entre aqui.
                      </Text>
                      <TouchableOpacity onPress={handleResend} disabled={busy} style={{ paddingVertical: 6 }}>
                        <Text style={styles.confirmResend}>Reenviar e-mail</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

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

                <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} style={{ paddingVertical: 10 }}>
                  <Text style={styles.switchMode}>
                    {mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}
                    <Text style={{ color: Colors.primary, fontWeight: '700' }}>{mode === 'login' ? 'Criar agora' : 'Entrar'}</Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* LOGADO */}
        {configured && user && (
          <>
            <View style={styles.card}>
              <View style={styles.userRow}>
                <View style={styles.avatarSm}><MaterialCommunityIcons name="account" size={24} color={Colors.primary} /></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  <View style={styles.connected}>
                    <View style={styles.dot} />
                    <Text style={styles.connectedText}>Conectado à nuvem</Text>
                  </View>
                </View>
              </View>
              <View style={styles.backupStatus}>
                <MaterialCommunityIcons name={lastBackup ? 'cloud-check' : 'cloud-alert'} size={20} color={lastBackup ? Colors.success : Colors.warning} />
                <Text style={styles.backupText}>
                  {lastBackup ? `Último backup: ${formatDateTime(lastBackup)}` : 'Nenhum backup ainda'}
                </Text>
              </View>
              <OlliButton label="Fazer backup agora" variant="gradient" size="lg" fullWidth loading={busy} onPress={handleBackup} icon={<MaterialCommunityIcons name="cloud-upload" size={20} color="#fff" />} style={{ marginBottom: 10 }} />
              <OlliButton label="Restaurar da nuvem" variant="outline" size="lg" fullWidth onPress={handleRestore} icon={<MaterialCommunityIcons name="cloud-download" size={20} color={Colors.primary} />} />
            </View>

            <OlliButton label="Sair da conta" variant="ghost" size="md" fullWidth onPress={handleLogout} haptic={false} icon={<MaterialCommunityIcons name="logout" size={18} color={Colors.danger} />} textStyle={{ color: Colors.danger }} />
          </>
        )}

        {busy && !user && <ActivityIndicator color={Colors.primary} style={{ marginTop: 16 }} />}

        <Text style={styles.version}>OLLI · Orçamentos que fecham negócio</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, marginBottom: Spacing.base },
  screenTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },

  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: Spacing.base, marginHorizontal: Spacing.base, ...Shadow.sm },
  avatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: Colors.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 24, fontWeight: '800', color: Colors.accentLight },
  profileName: { fontSize: 18, fontWeight: '800', color: '#fff' },
  profileCompany: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  segChip: { alignSelf: 'flex-start', backgroundColor: 'rgba(52,198,217,0.14)', borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  segChipText: { fontSize: 11.5, fontWeight: '700', color: Colors.accentLight },

  proCard: { backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: 'rgba(52,198,217,0.28)', padding: Spacing.base, marginHorizontal: Spacing.base, marginTop: Spacing.base, ...Shadow.sm },
  proHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  proBadgeText: { fontSize: 12, fontWeight: '800', color: '#0A1626', letterSpacing: 0.5 },
  soonPill: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  soonPillText: { fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant },
  proTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  proSub: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 4, lineHeight: 19 },
  proBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  proBtnText: { fontSize: 14, fontWeight: '800', color: Colors.accentLight },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#fff', paddingHorizontal: Spacing.base, marginTop: Spacing.xl, marginBottom: Spacing.sm },

  toolsCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, marginHorizontal: Spacing.base, paddingHorizontal: Spacing.base, ...Shadow.sm },
  toolRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  toolDivider: { borderBottomWidth: 1, borderBottomColor: Colors.outline },
  toolIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  toolLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  toolDesc: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginTop: 1 },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, marginHorizontal: Spacing.base, marginBottom: Spacing.base, borderWidth: 1, borderColor: Colors.outline, ...Shadow.sm },
  iconHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.base },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.onSurface },
  text: { fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 21, marginBottom: Spacing.base },
  textSm: { fontSize: 12.5, color: Colors.onSurfaceVariant, lineHeight: 18, marginTop: 3 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primaryContainer, color: Colors.primary, fontWeight: '800', textAlign: 'center', lineHeight: 24, fontSize: 13 },
  stepText: { flex: 1, fontSize: 13, color: Colors.onSurface },
  switchMode: { textAlign: 'center', color: Colors.onSurfaceVariant, fontSize: 14 },

  loginHero: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.base },
  confirmBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(52,198,217,0.10)', borderWidth: 1, borderColor: 'rgba(52,198,217,0.30)', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: 14 },
  confirmTitle: { fontSize: 14, fontWeight: '800', color: Colors.onSurface },
  confirmText: { fontSize: 12.5, color: Colors.onSurfaceVariant, lineHeight: 18, marginTop: 2 },
  confirmResend: { fontSize: 13, fontWeight: '800', color: Colors.accentLight },

  userRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.base },
  avatarSm: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  userEmail: { fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  connected: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  connectedText: { fontSize: 12, color: Colors.success, fontWeight: '600' },
  backupStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.base },
  backupText: { fontSize: 13, color: Colors.onSurfaceVariant, flex: 1 },

  version: { textAlign: 'center', fontSize: 12, color: Colors.onSurfaceMuted, marginTop: Spacing.xl },
});
