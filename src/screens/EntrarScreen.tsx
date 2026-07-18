import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { BotaoApple } from '../components/BotaoApple';
import { appleSignInDisponivel, signInWithApple } from '../services/appleAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Spacing, BorderRadius, useCores, useGradientes, useEstilos, sobreSecundario, type Cores } from '../theme';
import { Fonts } from '../theme/fonts';
import { OlliInput } from '../components/OlliInput';
import { SugestoesEmail } from '../components/SugestoesEmail';
import { OlliButton } from '../components/OlliButton';
import { OlliMascot } from '../components/OlliMascot';
import { AuroraBackground } from '../components/AuroraBackground';
import { LandingHero } from '../components/web/LandingHero';
import { useEhDesktop } from '../hooks/useEhDesktop';
import {
  isSupabaseConfigured, signIn, signUp, signInWithGoogle, supabase,
  normalizarTelefoneBR, temDadosLocais,
} from '../services/supabase';
import { getEmpresa, saveEmpresa } from '../database/database';
import { ONBOARDED_KEY } from './OnboardingScreen';
import { marcarVisto } from '../services/onboarding';
import { track, Eventos } from '../services/analytics';
import { Empresa } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { traduzirErroAuth } from '../utils/authErrors';

// Fecha uma sessão de autenticação pendente (retorno do OAuth) caso o app
// tenha sido reaberto no meio do fluxo. Idempotente e seguro na web e no nativo.
WebBrowser.maybeCompleteAuthSession();

type Nav = NativeStackNavigationProp<RootStackParamList, 'Entrar'>;
type Modo = 'login' | 'signup';


/**
 * Tela "Entrar" — a CAPA e a ÚNICA porta do app (v3: login obrigatório). Sem
 * sessão, é aqui que o usuário sempre cai. Suporta e-mail/senha e Google, além
 * de recuperar senha. Após a sessão criada, decide entre Onboarding (1ª vez) e
 * as Tabs, e semeia o telefone do cadastro na empresa local.
 */
export default function EntrarScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const configured = isSupabaseConfigured();
  const ehDesktop = useEhDesktop();
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);

  const [modo, setModo] = useState<Modo>('login');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  // Controla a fileira de sugestões de provedor de e-mail (SugestoesEmail):
  // some no blur com um pequeno atraso — sem o atraso, o toque na sugestão
  // nunca chega a disparar porque o campo já perdeu o foco e o componente
  // some antes do onPress.
  const [emailFocado, setEmailFocado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  // Sign in with Apple so existe no iOS 13+. Checagem assincrona: enquanto nao
  // responde, o botao nao aparece (nunca piscar um botao que some).
  const [temApple, setTemApple] = useState(false);
  const [temLocais, setTemLocais] = useState(false);

  // No mount: se já há dados locais (o usuário usou o app offline antes de a v3
  // exigir conta), mostra o banner de migração e assume o modo "criar conta" —
  // quem tem dados locais provavelmente ainda não tem conta.
  useEffect(() => {
    let vivo = true;
    appleSignInDisponivel().then((ok) => { if (vivo) setTemApple(ok); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    let vivo = true;
    temDadosLocais().then((tem) => {
      if (!vivo || !tem) return;
      setTemLocais(true);
      setModo('signup');
    });
    return () => { vivo = false; };
  }, []);

  /**
   * Semeia o telefone do cadastro na empresa local (best-effort, silencioso).
   * Se a empresa existe e está sem telefone/whatsapp, preenche os vazios; se não
   * existe, cria uma empresa mínima com o telefone e o e-mail. Nunca lança.
   */
  async function semearTelefoneEmpresa(telDigits: string) {
    if (!telDigits) return;
    try {
      const emp = await getEmpresa();
      // So ATUALIZA empresa existente — nunca cria. Criar aqui faria o
      // entrarNoApp ver empresa != null e pular o Onboarding para sempre no
      // cadastro por e-mail (telefone e obrigatorio, entao criaria sempre).
      // Quem cria a empresa e o Onboarding, que pre-preenche o WhatsApp a
      // partir do user_metadata do cadastro.
      if (!emp) return;
      const patch: Partial<Empresa> = {};
      if (!emp.telefone?.trim()) patch.telefone = telDigits;
      if (!emp.whatsapp?.trim()) patch.whatsapp = telDigits;
      if (Object.keys(patch).length > 0) await saveEmpresa({ ...emp, ...patch });
    } catch {
      // best-effort: nunca trava o login por causa da semeadura.
    }
  }

  /**
   * Decide o destino APÓS a sessão criada: 1ª vez (sem empresa e nunca
   * onboardado) → Onboarding; caso contrário → Tabs. O sync dos dados locais
   * (cloudSync per-row) já é disparado pelo listener global do App.tsx — não
   * duplicamos aqui.
   */
  async function entrarNoApp() {
    let destino: keyof RootStackParamList = 'Tabs';
    try {
      const [empresa, onboarded] = await Promise.all([
        getEmpresa(),
        AsyncStorage.getItem(ONBOARDED_KEY).catch(() => null),
      ]);
      if (empresa === null && onboarded !== '1') {
        // Local vazio + nunca onboardado NESTE aparelho: pode ser usuário NOVO
        // OU EXISTENTE logando em aparelho/navegador novo — o SQLite local ainda
        // está vazio porque o sync da nuvem é ASSÍNCRONO (listener do App.tsx, não
        // concluiu quando decidimos aqui). O wizard "monte seu cadastro" GRAVA uma
        // empresa e a empurra pra nuvem; mandar um usuário existente pra lá
        // SOBRESCREVE a empresa real com dados em branco (bug P0 da auditoria).
        // Por isso consultamos a nuvem com a REGRA DOS 3 ESTADOS
        // (memória olli-gate-erro-vira-vazio) — "não sei" nunca vira "não tem":
        //   'tem'     → usuário existente        → Tabs (marca onboardado).
        //   'nao_tem' → confirmado sem empresa   → Onboarding (usuário novo de fato).
        //   'nao_sei' → erro de rede/Supabase    → Tabs, NUNCA Onboarding. O sync
        //               assíncrono popula o local; se na próxima abertura ainda
        //               faltar empresa, esta checagem roda de novo e se auto-cura.
        let estado: 'tem' | 'nao_tem' | 'nao_sei' = 'nao_sei';
        if (supabase) {
          // 2 tentativas com backoff curto reduzem o 'nao_sei' por instabilidade momentânea.
          for (let tentativa = 0; tentativa < 2 && estado === 'nao_sei'; tentativa++) {
            try {
              const { data, error } = await supabase.from('empresa').select('user_id').maybeSingle();
              if (!error) estado = data ? 'tem' : 'nao_tem';
            } catch { /* rede instável: tenta de novo */ }
            if (estado === 'nao_sei' && tentativa === 0) {
              await new Promise<void>((resolve) => setTimeout(resolve, 600));
            }
          }
        }
        if (estado === 'tem') await marcarVisto();
        else if (estado === 'nao_tem') destino = 'Onboarding';
        // 'nao_sei' → destino permanece 'Tabs' (piso NÃO-destrutivo).
      }
    } catch {
      // fail-safe: em erro, cai nas Tabs (já está logado).
    }
    nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: destino }] }));
  }

  async function handleAuth() {
    if (!configured) {
      Alert.alert('Backup na nuvem não configurado', 'Peça ao assistente para configurar o Supabase para ativar o login.');
      return;
    }
    if (modo === 'signup' && !nome.trim()) {
      Alert.alert('Faltou o nome', 'Informe seu nome completo.');
      return;
    }
    const telDigits = telefone.replace(/\D/g, '');
    if (modo === 'signup' && telDigits.length < 10) {
      Alert.alert('Faltou o telefone', 'Informe um WhatsApp válido com DDD.');
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
    const telNormalizado = normalizarTelefoneBR(telefone);
    setBusy(true);
    try {
      if (modo === 'signup') {
        const data = await signUp(emailLimpo, senha, nome.trim(), telefone);
        // Cadastro concluído no Supabase (não lançou) — conta com sessão
        // imediata OU pendente de confirmação de e-mail, tanto faz: o
        // funil signup→orçamento começa aqui.
        track(Eventos.signup);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (data.session) {
          await semearTelefoneEmpresa(telNormalizado);
          await entrarNoApp();
        } else {
          // Confirmação de e-mail ligada no Supabase: NÃO há sessão. Fail-closed
          // coerente com o gate — o usuário não entra até confirmar.
          setModo('login');
          setSenha(''); setConfirmar('');
          Alert.alert('Confirme seu e-mail', `Enviamos um link de confirmação para ${emailLimpo}. Confirme e depois entre aqui.`);
        }
      } else {
        await signIn(emailLimpo, senha);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await entrarNoApp();
      }
    } catch (e: any) {
      const { titulo, texto } = traduzirErroAuth(e);
      Alert.alert(titulo, texto);
    }
    setBusy(false);
  }

  /** Login/cadastro com o Google (OAuth real). Cancelamento é silencioso. */
  async function handleGoogle() {
    Haptics.selectionAsync().catch(() => {});
    if (!configured) {
      Alert.alert('Backup na nuvem não configurado', 'Peça ao assistente para configurar o Supabase para ativar o login.');
      return;
    }
    setGoogleBusy(true);
    try {
      const res = await signInWithGoogle();
      if (res === 'ok') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await entrarNoApp();
      }
      // 'cancelado' → silêncio (o usuário desistiu).
    } catch (e: any) {
      const { titulo, texto } = traduzirErroAuth(e);
      Alert.alert(titulo, texto);
    }
    setGoogleBusy(false);
  }

  /**
   * Login/cadastro com a Apple (iOS). Cancelamento é silencioso, igual ao Google.
   * Exigência da Guideline 4.8: existe porque o app oferece login com o Google.
   */
  async function handleApple() {
    Haptics.selectionAsync().catch(() => {});
    if (!configured) {
      Alert.alert('Backup na nuvem não configurado', 'Peça ao assistente para configurar o Supabase para ativar o login.');
      return;
    }
    setAppleBusy(true);
    try {
      const res = await signInWithApple();
      if (res === 'ok') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await entrarNoApp();
      }
      // 'cancelado' → silêncio (o usuário desistiu).
    } catch (e: any) {
      const { titulo, texto } = traduzirErroAuth(e);
      Alert.alert(titulo, texto);
    }
    setAppleBusy(false);
  }

  /** Recuperar senha: envia o e-mail de redefinição do Supabase. */
  async function recuperarSenha() {
    Haptics.selectionAsync().catch(() => {});
    const e = email.trim();
    if (!e) { Alert.alert('Recuperar senha', 'Digite seu e-mail no campo acima primeiro.'); return; }
    if (!supabase) { Alert.alert('Indisponível', 'O backup na nuvem não está configurado.'); return; }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(e);
      if (error) throw error;
      Alert.alert('Verifique seu e-mail', `Se existir uma conta para ${e}, enviamos um link para redefinir a senha.`);
    } catch (e: any) {
      const { titulo, texto } = traduzirErroAuth(e);
      Alert.alert(titulo, texto);
    }
  }

  const anyBusy = busy || googleBusy || appleBusy;

  // FORMULÁRIO de login/cadastro — a MESMA lógica em qualquer largura. No mobile
  // ele mora sob o hero curto; no desktop, dentro do card à direita das duas
  // colunas. Extraído para não duplicar nenhuma chamada de auth entre os ramos.
  const formularioAuth = (
    <>
      {/* BANNER DE MIGRAÇÃO — só quem já tem dados locais e está no cadastro */}
      {temLocais && modo === 'signup' && (
        <View style={styles.migrateCard}>
          <MaterialCommunityIcons name="shield-check" size={22} color={cores.accentLight} />
          <Text style={styles.migrateText}>
            Crie sua conta para proteger seus dados — tudo que você já fez será vinculado a ela.
          </Text>
        </View>
      )}

      {modo === 'signup' && (
        <OlliInput label="Nome completo" value={nome} onChangeText={setNome} placeholder="João da Silva" leftIcon="account" autoCapitalize="words" />
      )}
      <OlliInput
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        placeholder="voce@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        leftIcon="email"
        onFocus={() => setEmailFocado(true)}
        onBlur={() => setTimeout(() => setEmailFocado(false), 150)}
      />
      <SugestoesEmail email={email} focado={emailFocado} onSelecionar={setEmail} />
      {modo === 'signup' && (
        <OlliInput
          label="WhatsApp/Telefone"
          mask="phone"
          value={telefone}
          onChangeText={setTelefone}
          placeholder="(11) 99999-9999"
          keyboardType="phone-pad"
          leftIcon="whatsapp"
        />
      )}
      <OlliInput
        label="Senha"
        value={senha}
        onChangeText={setSenha}
        placeholder="mínimo 8 caracteres"
        secureTextEntry={!verSenha}
        leftIcon="lock"
        rightIcon={verSenha ? 'eye-off' : 'eye'}
        onRightIconPress={() => setVerSenha(v => !v)}
        rightIconLabel={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
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
        variant="gradient" size="lg" fullWidth loading={busy} disabled={googleBusy || appleBusy} onPress={handleAuth}
        icon={<MaterialCommunityIcons name={modo === 'login' ? 'login' : 'account-plus'} size={20} color={gradientes.sobreBrand} />}
        style={{ marginTop: modo === 'login' ? 4 : 8 }}
      />

      {/* SEPARADOR "ou" */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>ou</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* GOOGLE */}
      <OlliButton
        label="Continuar com o Google"
        variant="outline" size="lg" fullWidth loading={googleBusy} disabled={busy || appleBusy} haptic={false} onPress={handleGoogle}
        icon={<MaterialCommunityIcons name="google" size={20} color={cores.accentLight} />}
      />

      {/* APPLE — só monta no iOS (o componente devolve null nas outras plataformas).
          A Guideline 4.8 exige o botão com peso equivalente ao do Google, e não
          escondido atrás de um "mais opções". */}
      {temApple && (
        <BotaoApple onPress={handleApple} desabilitado={busy || googleBusy || appleBusy} />
      )}

      {/* ALTERNA LOGIN/SIGNUP */}
      <TouchableOpacity disabled={anyBusy} onPress={() => { Haptics.selectionAsync().catch(() => {}); setModo(modo === 'login' ? 'signup' : 'login'); }} style={styles.switchWrap}>
        <Text style={styles.switchText}>
          {modo === 'login' ? 'Ainda não tem conta? ' : 'Já tem conta? '}
          <Text style={styles.switchLink}>{modo === 'login' ? 'Criar agora' : 'Entrar'}</Text>
        </Text>
      </TouchableOpacity>
    </>
  );

  const tituloCard = modo === 'login' ? 'Que bom te ver de novo 👋' : 'Vamos criar a sua conta';

  // DESKTOP (web ≥ 1024px): "parece um produto" — duas colunas. À esquerda a
  // proposta de valor (LandingHero, apresentacional); à direita o MESMO card de
  // login num painel rolável. Nada da lógica de auth muda — só a apresentação.
  if (ehDesktop) {
    return (
      <View style={styles.desktopRoot}>
        <View style={styles.desktopHeroCol}>
          <LandingHero />
        </View>
        <View style={styles.desktopLoginCol}>
          <ScrollView
            contentContainerStyle={styles.desktopLoginScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.desktopCard}>
              <Text style={styles.desktopCardTitle}>{tituloCard}</Text>
              {formularioAuth}
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  // MOBILE (e web estreita): hero curto acima do card de login (layout original).
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* HERO / CAPA (~45% da tela) */}
        <LinearGradient colors={gradientes.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 72 }]}>
          {/* Fundo AURORA animado (substitui os dois glows estaticos) — primeira
              tela do app, o "uau" aqui importa. Intensidade baixa: a tagline ja e
              medida em 4.5:1 sobre este gradiente e nao pode perder contraste. */}
          <AuroraBackground
            cores={[cores.accent, cores.accentLight, cores.primaryLight, cores.accent]}
            intensidade={0.13}
          />
          <OlliMascot size={88} onDark />
          <Text style={[styles.brand, { color: gradientes.sobrePrimary }]}>OLLI</Text>
          {/* A tagline vive sobre o gradiente da marca, não sobre uma superfície.
              `accentLight` escurece no modo claro (#197884) e media 2.36:1 aqui —
              medido nos pixels do APK, na primeira tela que o usuário vê.
              `sobreSecundario` rebaixa o branco só até onde as duas pontas ainda
              passam 4.5:1 (alfa 0.94 no azul padrão, 0.96 no vermelho). */}
          <Text style={[styles.tagline, { color: sobreSecundario(gradientes.sobrePrimary, gradientes.primary) }]}>
            Orçamentos que fecham negócio
          </Text>
        </LinearGradient>

        {/* CARD sobrepondo o hero */}
        <View style={styles.body}>
          <Text style={styles.cardTitle}>{tituloCard}</Text>
          {formularioAuth}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },

  // DESKTOP — duas colunas (hero de valor | card de login)
  desktopRoot: { flex: 1, flexDirection: 'row', backgroundColor: c.background },
  desktopHeroCol: { flex: 1.15, minWidth: 460 },
  desktopLoginCol: { flex: 1, minWidth: 420, backgroundColor: c.background },
  desktopLoginScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xxl,
  },
  desktopCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    padding: Spacing.xl,
  },
  desktopCardTitle: { fontSize: 22, fontFamily: Fonts.extraBold, color: c.onSurface, marginBottom: Spacing.lg },

  // Hero: banner sempre colorido (gradiente da marca), nos dois modos — texto e
  // brilhos brancos/ciano fixos continuam corretos (ver `header`/`primary` em
  // theme/cores.ts). Sem chave semântica exata para os brilhos decorativos.
  hero: { alignItems: 'center', paddingHorizontal: Spacing.base, paddingBottom: 56, overflow: 'hidden' },
  glow1: { position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(127,233,245,0.16)' },
  glow2: { position: 'absolute', bottom: -50, left: -50, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(52,198,217,0.12)' },
  brand: { fontSize: 38, fontFamily: Fonts.extraBold, letterSpacing: 1, marginTop: 16, paddingLeft: 6 },
  // Sem cor: a tagline esta sobre o gradiente, e a fabrica so recebe `Cores`.
  tagline: { fontSize: 14, fontFamily: Fonts.semiBold, marginTop: 6 },

  body: {
    marginTop: -24,
    backgroundColor: c.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: Spacing.base,
    paddingTop: Spacing.lg,
  },
  cardTitle: { fontSize: 20, fontFamily: Fonts.extraBold, color: c.onBackground, marginBottom: Spacing.base },

  migrateCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: c.accentContainer,
    // Borda cyan fixa: decorativa, sem chave semântica exata (ver rule 7).
    borderWidth: 1, borderColor: 'rgba(52,198,217,0.30)',
    borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.base,
  },
  migrateText: { flex: 1, fontSize: 13, color: c.onSurface, lineHeight: 19, fontWeight: '600' },

  forgotWrap: { alignSelf: 'flex-end', paddingVertical: 4, marginBottom: 8 },
  forgot: { fontSize: 13, fontWeight: '700', color: c.accentLight },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: c.outline },
  dividerText: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant },

  switchWrap: { paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  switchText: { fontSize: 14, color: c.onSurfaceVariant },
  switchLink: { color: c.accentLight, fontWeight: '800' },
});
