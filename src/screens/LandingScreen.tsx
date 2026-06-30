import React, { useEffect, useMemo, useState } from 'react';
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
import { OlliMascot } from '../components/OlliMascot';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Landing'>;
type DeviceKind = 'desktop' | 'iphone' | 'android' | 'mobile';

const APK_URL = 'https://pub-e3eb9ad4478b42eaa761a70a85917088.r2.dev/OLLI-Orcamentos-android-release.apk';

function detectDevice(width: number): DeviceKind {
  if (Platform.OS !== 'web') return 'mobile';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  if (/iphone|ipad|ipod/.test(ua)) return 'iphone';
  if (/android/.test(ua)) return 'android';
  return width >= 768 ? 'desktop' : 'mobile';
}

const DEVICE_COPY: Record<DeviceKind, {
  label: string;
  title: string;
  text: string;
  action: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = {
  desktop: {
    label: 'Computador',
    title: 'Painel web para empresa',
    text: 'Você está no computador: o OLLI abre primeiro o dashboard web da empresa, com tudo sincronizado.',
    action: 'Abrir dashboard web',
    icon: 'monitor-dashboard',
  },
  iphone: {
    label: 'iPhone',
    title: 'Instale no iPhone pela web',
    text: 'Você está no iPhone: use o Safari e adicione o OLLI à Tela de Início como app web.',
    action: 'Ver instalação iPhone',
    icon: 'apple-ios',
  },
  android: {
    label: 'Android',
    title: 'Instale no Android',
    text: 'Você está no Android: baixe o APK ou continue usando a versão web pelo navegador.',
    action: 'Baixar APK',
    icon: 'android',
  },
  mobile: {
    label: 'Celular',
    title: 'App mobile e web',
    text: 'Você está no celular: pode instalar, entrar no app ou abrir a dashboard web quando quiser.',
    action: 'Como instalar',
    icon: 'cellphone-check',
  },
};

export default function LandingScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const detectedDevice = useMemo(() => detectDevice(width), [width]);
  const [device, setDevice] = useState<DeviceKind>(detectedDevice);
  const desktop = Platform.OS === 'web' && width >= 840;
  const copy = DEVICE_COPY[device];
  const detectedCopy = DEVICE_COPY[detectedDevice];
  const manualDevice = device !== detectedDevice;

  useEffect(() => {
    setDevice(detectedDevice);
  }, [detectedDevice]);

  function tap() {
    Haptics.selectionAsync().catch(() => {});
  }

  function goAuth(mode: 'login' | 'signup') {
    tap();
    nav.navigate('Entrar', { mode });
  }

  function openDeviceAction() {
    tap();
    if (device === 'android') {
      Linking.openURL(APK_URL).catch(() => nav.navigate('Instalar', { device: 'android' }));
      return;
    }
    if (device === 'desktop') {
      goAuth('login');
      return;
    }
    nav.navigate('Instalar', { device });
  }

  return (
    <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + (desktop ? 30 : 14), paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.shell, desktop && styles.shellDesktop]}>
          <View style={styles.topbar}>
            <View style={styles.brandLockup}>
              <OlliMascot size={42} onDark float={false} />
              <View>
                <Text style={styles.brand}>OLLI</Text>
                <Text style={styles.brandSub}>orçamentos que fecham negócio</Text>
              </View>
            </View>
            <View style={styles.topActions}>
              <HeaderLink label="Ajuda" onPress={() => nav.navigate('Ajuda')} />
              <TouchableOpacity style={styles.topLogin} onPress={() => goAuth('login')} activeOpacity={0.86}>
                <Text style={styles.topLoginText}>Entrar</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.hero, desktop && styles.heroDesktop]}>
            <View style={[styles.welcomePanel, desktop && styles.welcomePanelDesktop]}>
              <View style={styles.glowOne} />
              <View style={styles.glowTwo} />
              <OlliMascot size={desktop ? 116 : 100} onDark />
              <Text style={styles.hi}>Olá! Eu sou a OLLI</Text>
              <Text style={styles.subtitle}>
                Sua assistente de orçamentos. Primeiro você cria sua conta, depois o OLLI abre o caminho certo:
                computador, celular, iPhone ou Android.
              </Text>

              <View style={styles.featureList}>
                <FeatureRow icon="file-document-outline" text="Orçamento, agenda, cliente e recibo no mesmo fluxo." />
                <FeatureRow icon="shield-check-outline" text="Cadastro obrigatório antes de entrar no app." />
                <FeatureRow icon="cloud-sync-outline" text="Supabase preparado para sincronizar app e dashboard web." />
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={() => goAuth('signup')} activeOpacity={0.9}>
                <Text style={styles.primaryText}>Criar conta grátis</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color={Colors.primaryDark} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryBtn} onPress={() => goAuth('login')} activeOpacity={0.86}>
                <Text style={styles.secondaryText}>Já tenho conta</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.devicePanel, desktop && styles.devicePanelDesktop]}>
              <View style={styles.detectedRow}>
                <MaterialCommunityIcons name={detectedCopy.icon} size={21} color={Colors.accentLight} />
                <View style={styles.detectedTextWrap}>
                  <Text style={styles.detectedLabel}>Modo detectado automaticamente</Text>
                  <Text style={styles.detectedTitle}>{detectedCopy.label}</Text>
                </View>
              </View>
              {manualDevice ? (
                <View style={styles.manualNotice}>
                  <MaterialCommunityIcons name={copy.icon} size={16} color={Colors.accentLight} />
                  <Text style={styles.manualNoticeText}>Visualizando alternativa: {copy.title}</Text>
                </View>
              ) : null}
              <Text style={styles.deviceText}>{copy.text}</Text>

              <Text style={styles.selectorTitle}>Alternativas</Text>
              <View style={styles.deviceSelector}>
                {(Object.keys(DEVICE_COPY) as DeviceKind[]).map((item) => {
                  const active = item === device;
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[styles.deviceChip, active && styles.deviceChipActive]}
                      onPress={() => { tap(); setDevice(item); }}
                      activeOpacity={0.86}
                    >
                      <MaterialCommunityIcons
                        name={DEVICE_COPY[item].icon}
                        size={16}
                        color={active ? Colors.primaryDark : Colors.accentLight}
                      />
                      <Text style={[styles.deviceChipText, active && styles.deviceChipTextActive]}>{DEVICE_COPY[item].label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.deviceAction} onPress={openDeviceAction} activeOpacity={0.9}>
                <Text style={styles.deviceActionText}>{copy.action}</Text>
              </TouchableOpacity>

              <View style={styles.linkGrid}>
                <MiniLink icon="web" title="Usar web" text="Entrar pelo navegador" onPress={() => goAuth('login')} />
                <MiniLink icon="download-outline" title="Instalar" text="iPhone, Android ou web" onPress={() => nav.navigate('Instalar', { device })} />
                <MiniLink icon="help-circle-outline" title="Ajuda" text="Entenda as telas" onPress={() => nav.navigate('Ajuda')} />
              </View>
            </View>
          </View>

          <View style={[styles.flowBar, desktop && styles.flowBarDesktop]}>
            <FlowStep n="1" title="Conta" />
            <FlowStep n="2" title="Empresa" />
            <FlowStep n="3" title="Dashboard" />
            <FlowStep n="4" title="Orcamento" />
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function HeaderLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.headerLink} onPress={onPress} activeOpacity={0.86}>
      <Text style={styles.headerLinkText}>{label}</Text>
    </TouchableOpacity>
  );
}

function FeatureRow({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>
        <MaterialCommunityIcons name={icon} size={18} color={Colors.accentLight} />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

function MiniLink({
  icon,
  title,
  text,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.miniLink} onPress={onPress} activeOpacity={0.86}>
      <MaterialCommunityIcons name={icon} size={19} color={Colors.accentLight} />
      <Text style={styles.miniTitle}>{title}</Text>
      <Text style={styles.miniText}>{text}</Text>
    </TouchableOpacity>
  );
}

function FlowStep({ n, title }: { n: string; title: string }) {
  return (
    <View style={styles.flowStep}>
      <Text style={styles.flowN}>{n}</Text>
      <Text style={styles.flowTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { minHeight: '100%', paddingHorizontal: Spacing.base },
  shell: { width: '100%', maxWidth: 1180, alignSelf: 'center' },
  shellDesktop: { paddingHorizontal: Spacing.lg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.base },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  brand: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 24, letterSpacing: 0 },
  brandSub: { color: 'rgba(255,255,255,0.68)', fontFamily: Fonts.semiBold, fontSize: 11.5, marginTop: -1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLink: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: BorderRadius.full },
  headerLinkText: { color: 'rgba(255,255,255,0.78)', fontFamily: Fonts.bold, fontSize: 13 },
  topLogin: { borderRadius: BorderRadius.full, borderWidth: 1, borderColor: 'rgba(127,233,245,0.34)', paddingHorizontal: 16, paddingVertical: 9, backgroundColor: 'rgba(7,17,31,0.22)' },
  topLoginText: { color: Colors.accentLight, fontFamily: Fonts.extraBold, fontSize: 13 },
  hero: { gap: Spacing.base },
  heroDesktop: { flexDirection: 'row', alignItems: 'stretch', gap: 20, minHeight: 560 },
  welcomePanel: { alignItems: 'center', justifyContent: 'center', borderRadius: 30, overflow: 'hidden', paddingHorizontal: Spacing.lg, paddingVertical: 30, backgroundColor: 'rgba(7,17,31,0.28)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  welcomePanelDesktop: { flex: 1.08, minHeight: 540, paddingHorizontal: 54 },
  glowOne: { position: 'absolute', top: -70, right: -45, width: 210, height: 210, borderRadius: 105, backgroundColor: 'rgba(127,233,245,0.16)' },
  glowTwo: { position: 'absolute', bottom: -80, left: -60, width: 210, height: 210, borderRadius: 105, backgroundColor: 'rgba(52,198,217,0.12)' },
  hi: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 28, lineHeight: 34, textAlign: 'center', marginTop: 20, letterSpacing: 0 },
  subtitle: { color: 'rgba(255,255,255,0.82)', fontFamily: Fonts.semiBold, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, maxWidth: 610 },
  featureList: { alignSelf: 'stretch', gap: 10, marginTop: 24 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.23)', borderRadius: BorderRadius.md, padding: 12 },
  featureIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(127,233,245,0.12)' },
  featureText: { flex: 1, color: '#fff', fontFamily: Fonts.semiBold, fontSize: 13.5, lineHeight: 19 },
  primaryBtn: { alignSelf: 'stretch', marginTop: 24, borderRadius: 18, backgroundColor: Colors.accentLight, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...Shadow.glowCyan },
  primaryText: { color: Colors.primaryDark, fontFamily: Fonts.extraBold, fontSize: 16 },
  secondaryBtn: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 15, marginTop: 10, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(127,233,245,0.34)', backgroundColor: 'rgba(7,17,31,0.22)' },
  secondaryText: { color: Colors.accentLight, fontFamily: Fonts.extraBold, fontSize: 15 },
  devicePanel: { borderRadius: 30, padding: Spacing.base, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.strokeGlow, ...Shadow.md },
  devicePanelDesktop: { width: 390, padding: Spacing.lg, justifyContent: 'center' },
  detectedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detectedTextWrap: { flex: 1 },
  detectedLabel: { color: Colors.onSurfaceMuted, fontFamily: Fonts.extraBold, fontSize: 11, textTransform: 'uppercase' },
  detectedTitle: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 20, marginTop: 2 },
  manualNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: 'rgba(127,233,245,0.24)', backgroundColor: Colors.surfacePressed, padding: 10 },
  manualNoticeText: { flex: 1, color: Colors.accentLight, fontFamily: Fonts.bold, fontSize: 12.5 },
  deviceText: { color: Colors.onSurfaceVariant, fontFamily: Fonts.semiBold, fontSize: 13.5, lineHeight: 20, marginTop: 14 },
  selectorTitle: { color: Colors.onSurfaceMuted, fontFamily: Fonts.extraBold, fontSize: 11, textTransform: 'uppercase', marginTop: 18 },
  deviceSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  deviceChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.outlineDark, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: Colors.surfaceVariant },
  deviceChipActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accentLight },
  deviceChipText: { color: Colors.accentLight, fontFamily: Fonts.bold, fontSize: 12.5 },
  deviceChipTextActive: { color: Colors.primaryDark },
  deviceAction: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 14, marginTop: 18 },
  deviceActionText: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 15 },
  linkGrid: { gap: 10, marginTop: 18 },
  miniLink: { borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.outline, backgroundColor: Colors.surface, padding: 12 },
  miniTitle: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 14, marginTop: 8 },
  miniText: { color: Colors.onSurfaceVariant, fontFamily: Fonts.semiBold, fontSize: 12.5, marginTop: 2 },
  flowBar: { flexDirection: 'row', gap: 8, marginTop: Spacing.base, paddingBottom: 2 },
  flowBarDesktop: { maxWidth: 720 },
  flowStep: { flex: 1, alignItems: 'center', borderRadius: BorderRadius.md, borderWidth: 1, borderColor: 'rgba(127,233,245,0.20)', backgroundColor: 'rgba(7,17,31,0.24)', paddingVertical: 10 },
  flowN: { color: Colors.primaryDark, backgroundColor: Colors.accentLight, overflow: 'hidden', width: 22, height: 22, borderRadius: 11, lineHeight: 22, textAlign: 'center', fontFamily: Fonts.extraBold, fontSize: 12 },
  flowTitle: { color: '#fff', fontFamily: Fonts.bold, fontSize: 12.5, marginTop: 6 },
});
