import React, { useMemo } from 'react';
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BorderRadius, Colors, Gradients, Shadow, Spacing } from '../theme';
import { Fonts } from '../theme/fonts';
import { OlliLogo } from '../components/OlliLogo';
import { OlliMascot } from '../components/OlliMascot';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Landing'>;
type DeviceKind = 'iphone' | 'android' | 'desktop' | 'mobile';

const APK_URL = 'https://pub-e3eb9ad4478b42eaa761a70a85917088.r2.dev/OLLI-Orcamentos-android-release.apk';

function detectDevice(width: number): DeviceKind {
  if (Platform.OS !== 'web') return 'mobile';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  if (/iphone|ipad|ipod/.test(ua)) return 'iphone';
  if (/android/.test(ua)) return 'android';
  return width >= 768 ? 'desktop' : 'mobile';
}

export default function LandingScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 768;
  const device = useMemo(() => detectDevice(width), [width]);

  const goAuth = (mode: 'login' | 'signup') => {
    Haptics.selectionAsync().catch(() => {});
    nav.navigate('Entrar', { mode });
  };

  const openApk = () => {
    Haptics.selectionAsync().catch(() => {});
    Linking.openURL(APK_URL).catch(() => nav.navigate('Instalar', { device: 'android' }));
  };

  const primaryDeviceAction = () => {
    if (device === 'android') return openApk();
    if (device === 'iphone' || device === 'mobile') return nav.navigate('Instalar', { device });
    return goAuth('login');
  };

  const deviceTitle = device === 'desktop'
    ? 'Painel web para empresa'
    : device === 'iphone'
      ? 'Instale no iPhone pela web'
      : device === 'android'
        ? 'Instale no Android'
        : 'App mobile e painel web';

  const deviceText = device === 'desktop'
    ? 'Você está no computador: entre para abrir o dashboard web da empresa.'
    : device === 'iphone'
      ? 'Você está no iPhone: instale como app pela opção Compartilhar > Adicionar à Tela de Início.'
      : device === 'android'
        ? 'Você está no Android: baixe o APK ou use a versão web pelo navegador.'
        : 'Você está no celular: pode instalar, entrar pelo app ou abrir o painel web.';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (desktop ? 28 : 16), paddingBottom: insets.bottom + 36 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.shell, desktop && styles.shellDesktop]}>
        <View style={styles.topbar}>
          <TouchableOpacity style={styles.brandRow} onPress={() => nav.navigate('Landing')} activeOpacity={0.85}>
            <OlliLogo size={desktop ? 46 : 38} />
            <View>
              <Text style={styles.brand}>OLLI</Text>
              <Text style={styles.brandSub}>Orçamentos que fecham negócio</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.navRow}>
            {desktop ? (
              <>
                <TopLink label="Ajuda" onPress={() => nav.navigate('Ajuda')} />
                <TopLink label="Instalar" onPress={() => nav.navigate('Instalar', { device })} />
              </>
            ) : null}
            <TouchableOpacity style={styles.loginTop} onPress={() => goAuth('login')} activeOpacity={0.85}>
              <Text style={styles.loginTopText}>Entrar</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.heroGrid, desktop && styles.heroGridDesktop]}>
          <View style={[styles.heroCopy, desktop && styles.heroCopyDesktop]}>
            <View style={styles.kicker}>
              <MaterialCommunityIcons name={device === 'desktop' ? 'monitor-dashboard' : 'cellphone-check'} size={15} color={Colors.accentLight} />
              <Text style={styles.kickerText}>{deviceTitle}</Text>
            </View>

            <Text style={[styles.title, desktop && styles.titleDesktop]}>
              Orçamento, agenda, cliente, recibo e empresa sincronizados em um só lugar.
            </Text>
            <Text style={[styles.subtitle, desktop && styles.subtitleDesktop]}>
              O OLLI começa pelo cadastro seguro, sincroniza com Supabase e libera o painel web no computador ou a experiência mobile no celular.
            </Text>

            <View style={[styles.actions, desktop && styles.actionsDesktop]}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => goAuth('signup')} activeOpacity={0.9}>
                <Text style={styles.primaryText}>Criar conta grátis</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#07111F" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={primaryDeviceAction} activeOpacity={0.85}>
                <Text style={styles.secondaryText}>
                  {device === 'android' ? 'Baixar APK' : device === 'desktop' ? 'Abrir dashboard' : 'Como instalar'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.deviceNotice}>
              <MaterialCommunityIcons name={device === 'desktop' ? 'laptop' : device === 'iphone' ? 'apple-ios' : 'cellphone'} size={18} color={Colors.accentLight} />
              <Text style={styles.deviceText}>{deviceText}</Text>
            </View>

            <View style={styles.mobileLinks}>
              <InlineAction icon="web" label="Usar versão web" onPress={() => goAuth('login')} />
              <InlineAction icon="help-circle-outline" label="Ver ajuda" onPress={() => nav.navigate('Ajuda')} />
              <InlineAction icon="download-outline" label="Instalação" onPress={() => nav.navigate('Instalar', { device })} />
            </View>
          </View>

          <LinearGradient
            colors={desktop ? ['rgba(11,111,206,0.42)', 'rgba(52,198,217,0.10)'] : Gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.preview, desktop && styles.previewDesktop]}
          >
            <View style={styles.previewGlow} />
            <OlliMascot size={desktop ? 92 : 76} onDark />
            <Text style={styles.previewTitle}>Fluxo obrigatório e conectado</Text>
            <View style={styles.steps}>
              <Step n="1" icon="account-plus-outline" text="Crie sua conta" />
              <Step n="2" icon="email-check-outline" text="Confirme seu e-mail" />
              <Step n="3" icon="storefront-outline" text="Cadastre sua empresa" />
              <Step n="4" icon="chart-box-outline" text="Use app e dashboard web" />
            </View>
          </LinearGradient>
        </View>

        <View style={[styles.cards, desktop && styles.cardsDesktop]}>
          <Feature icon="file-document-check-outline" title="Orçamentos completos" text="PDF, modelos, cores, fotos, assinatura, aprovação e link do cliente." />
          <Feature icon="storefront-outline" title="Marca da empresa" text="Logo, assinatura, PIX, normas, depoimentos e dados comerciais." />
          <Feature icon="cloud-sync-outline" title="Supabase sincronizado" text="Clientes, serviços, produtos, agenda, recibos e orçamentos por usuário." />
        </View>

        <View style={styles.sectionBand}>
          <Text style={styles.sectionEyebrow}>Como tudo se conecta</Text>
          <Text style={styles.sectionTitle}>Cada tela leva para o próximo passo certo.</Text>
          <View style={[styles.flowGrid, desktop && styles.flowGridDesktop]}>
            <FlowItem icon="login" title="Entrar" text="Login ou cadastro obrigatório antes do app." />
            <FlowItem icon="clipboard-list-outline" title="Onboarding" text="Empresa, prestador, endereço, PIX, visual e primeiro serviço." />
            <FlowItem icon="view-dashboard-outline" title="Dashboard" text="Resumo do dia, atalhos e indicadores para a empresa." />
            <FlowItem icon="file-pdf-box" title="Orçamento" text="Cliente, itens, detalhes e personalização do PDF." />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function TopLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.topLink} activeOpacity={0.85}>
      <Text style={styles.topLinkText}>{label}</Text>
    </TouchableOpacity>
  );
}

function InlineAction({ icon, label, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.inlineAction} activeOpacity={0.86}>
      <MaterialCommunityIcons name={icon} size={16} color={Colors.accentLight} />
      <Text style={styles.inlineActionText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Step({ n, icon, text }: { n: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepN}>{n}</Text>
      <MaterialCommunityIcons name={icon} size={18} color={Colors.accentLight} />
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

function Feature({ icon, title, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <MaterialCommunityIcons name={icon} size={22} color={Colors.accentLight} />
      </View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

function FlowItem({ icon, title, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.flowItem}>
      <MaterialCommunityIcons name={icon} size={22} color={Colors.accentLight} />
      <Text style={styles.flowTitle}>{title}</Text>
      <Text style={styles.flowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { minHeight: '100%', paddingHorizontal: Spacing.base },
  shell: { width: '100%', maxWidth: 1180, alignSelf: 'center' },
  shellDesktop: { paddingHorizontal: Spacing.lg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { fontSize: 24, fontFamily: Fonts.extraBold, color: '#fff', letterSpacing: 0 },
  brandSub: { fontSize: 12.5, fontFamily: Fonts.semiBold, color: Colors.onSurfaceVariant, marginTop: 1 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topLink: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: BorderRadius.full },
  topLinkText: { fontSize: 13.5, fontFamily: Fonts.bold, color: Colors.onSurfaceVariant },
  loginTop: { borderWidth: 1, borderColor: Colors.strokeGlow, borderRadius: BorderRadius.full, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: Colors.surfacePressed },
  loginTopText: { fontSize: 13.5, fontFamily: Fonts.bold, color: Colors.accentLight },
  heroGrid: { gap: Spacing.lg },
  heroGridDesktop: { flexDirection: 'row', alignItems: 'stretch', gap: 28 },
  heroCopy: { flex: 1 },
  heroCopyDesktop: { justifyContent: 'center', minHeight: 520 },
  kicker: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(127,233,245,0.10)', borderColor: 'rgba(127,233,245,0.30)', borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 7 },
  kickerText: { color: Colors.accentLight, fontSize: 12.5, fontFamily: Fonts.bold },
  title: { fontSize: 33, lineHeight: 39, fontFamily: Fonts.extraBold, color: '#fff', letterSpacing: 0, marginTop: 18 },
  titleDesktop: { fontSize: 56, lineHeight: 62, maxWidth: 720 },
  subtitle: { fontSize: 15, lineHeight: 22, color: Colors.onSurfaceVariant, marginTop: 14 },
  subtitleDesktop: { fontSize: 18, lineHeight: 28, maxWidth: 660 },
  actions: { gap: 10, marginTop: 24 },
  actionsDesktop: { flexDirection: 'row', alignItems: 'center' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 22, paddingVertical: 15, ...Shadow.glowCyan },
  primaryText: { fontSize: 15.5, fontFamily: Fonts.extraBold, color: '#07111F' },
  secondaryBtn: { alignItems: 'center', justifyContent: 'center', borderColor: Colors.strokeGlow, borderWidth: 1, borderRadius: BorderRadius.full, backgroundColor: Colors.surfacePressed, paddingHorizontal: 22, paddingVertical: 15 },
  secondaryText: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.accentLight },
  deviceNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.outlineDark, backgroundColor: Colors.surfaceGlass, padding: 12, marginTop: 18 },
  deviceText: { flex: 1, fontSize: 13, lineHeight: 18, color: Colors.onSurfaceVariant, fontFamily: Fonts.semiBold },
  mobileLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 13 },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.outlineDark, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.surfaceGlass },
  inlineActionText: { fontSize: 12.5, color: Colors.accentLight, fontFamily: Fonts.bold },
  preview: { borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.strokeGlow, padding: Spacing.lg, overflow: 'hidden', ...Shadow.md },
  previewDesktop: { width: 390, justifyContent: 'center' },
  previewGlow: { position: 'absolute', right: -60, top: -60, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(127,233,245,0.14)' },
  previewTitle: { fontSize: 18, color: '#fff', fontFamily: Fonts.extraBold, marginTop: 18, marginBottom: 12 },
  steps: { gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.22)', borderRadius: BorderRadius.md, padding: 11 },
  stepN: { width: 22, height: 22, borderRadius: 11, overflow: 'hidden', backgroundColor: Colors.accentLight, color: '#07111F', textAlign: 'center', lineHeight: 22, fontSize: 12, fontFamily: Fonts.extraBold },
  stepText: { flex: 1, color: '#fff', fontSize: 13.5, fontFamily: Fonts.bold },
  cards: { gap: 12, marginTop: 24 },
  cardsDesktop: { flexDirection: 'row', marginTop: 28 },
  feature: { flex: 1, backgroundColor: Colors.surfaceGlass, borderWidth: 1, borderColor: Colors.outlineDark, borderRadius: BorderRadius.lg, padding: Spacing.base },
  featureIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(127,233,245,0.10)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.24)', justifyContent: 'center', alignItems: 'center' },
  featureTitle: { fontSize: 15.5, color: '#fff', fontFamily: Fonts.extraBold, marginTop: 12 },
  featureText: { fontSize: 12.8, color: Colors.onSurfaceVariant, lineHeight: 18, marginTop: 4 },
  sectionBand: { marginTop: 30, borderTopWidth: 1, borderTopColor: Colors.outline, paddingTop: 24 },
  sectionEyebrow: { fontSize: 12, fontFamily: Fonts.extraBold, color: Colors.accentLight, textTransform: 'uppercase' },
  sectionTitle: { fontSize: 24, lineHeight: 30, fontFamily: Fonts.extraBold, color: '#fff', marginTop: 7, marginBottom: 16 },
  flowGrid: { gap: 10 },
  flowGridDesktop: { flexDirection: 'row' },
  flowItem: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.outline, borderRadius: BorderRadius.lg, padding: Spacing.base },
  flowTitle: { color: '#fff', fontSize: 15, fontFamily: Fonts.extraBold, marginTop: 10 },
  flowText: { color: Colors.onSurfaceVariant, fontSize: 12.6, lineHeight: 18, marginTop: 4 },
});
