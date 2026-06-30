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
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BorderRadius, Colors, Shadow, Spacing } from '../theme';
import { Fonts } from '../theme/fonts';
import { OlliButton } from '../components/OlliButton';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Instalar'>;
type Route = RouteProp<RootStackParamList, 'Instalar'>;
type DeviceKind = 'iphone' | 'android' | 'desktop' | 'mobile';

const APK_URL = 'https://pub-e3eb9ad4478b42eaa761a70a85917088.r2.dev/OLLI-Orcamentos-android-release.apk';

function detectDevice(width: number, param?: DeviceKind): DeviceKind {
  if (param) return param;
  if (Platform.OS !== 'web') return 'mobile';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  if (/iphone|ipad|ipod/.test(ua)) return 'iphone';
  if (/android/.test(ua)) return 'android';
  return width >= 768 ? 'desktop' : 'mobile';
}

export default function InstalarScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const device = useMemo(() => detectDevice(width, route.params?.device), [route.params?.device, width]);
  const desktop = width >= 768;

  const downloadApk = () => {
    Haptics.selectionAsync().catch(() => {});
    Linking.openURL(APK_URL).catch(() => {});
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}>
      <View style={[styles.shell, desktop && styles.shellDesktop]}>
        <View style={styles.topbar}>
          <TouchableOpacity onPress={() => nav.navigate('Landing')} style={styles.backBtn} activeOpacity={0.85}>
            <MaterialCommunityIcons name="chevron-left" size={20} color={Colors.accentLight} />
            <Text style={styles.backText}>Início</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => nav.navigate('Ajuda')} style={styles.helpBtn} activeOpacity={0.85}>
            <MaterialCommunityIcons name="help-circle-outline" size={18} color={Colors.accentLight} />
            <Text style={styles.helpText}>Ajuda</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.hero, desktop && styles.heroDesktop]}>
          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>Instalação inteligente</Text>
            <Text style={[styles.title, desktop && styles.titleDesktop]}>
              {device === 'iphone'
                ? 'Instale o OLLI no iPhone pela web.'
                : device === 'android'
                  ? 'Instale o OLLI no Android ou use a web.'
                  : device === 'desktop'
                    ? 'No computador, use o dashboard web.'
                    : 'Escolha como usar o OLLI no celular.'}
            </Text>
            <Text style={styles.subtitle}>
              O mesmo cadastro sincroniza app, painel web, clientes, orçamento, agenda e dados da empresa.
            </Text>
            <View style={styles.actionRow}>
              <OlliButton
                label={device === 'android' ? 'Baixar APK Android' : 'Entrar no painel web'}
                variant="gradient"
                size="lg"
                onPress={device === 'android' ? downloadApk : () => nav.navigate('Entrar', { mode: 'login' })}
                icon={<MaterialCommunityIcons name={device === 'android' ? 'download' : 'login'} size={20} color="#fff" />}
              />
              <OlliButton
                label="Criar conta"
                variant="outline"
                size="lg"
                onPress={() => nav.navigate('Entrar', { mode: 'signup' })}
              />
            </View>
          </View>

          <View style={styles.deviceCard}>
            <MaterialCommunityIcons
              name={device === 'iphone' ? 'apple-ios' : device === 'android' ? 'android' : 'monitor-dashboard'}
              size={42}
              color={Colors.accentLight}
            />
            <Text style={styles.deviceCardTitle}>{deviceLabel(device)}</Text>
            <Text style={styles.deviceCardText}>{deviceHint(device)}</Text>
          </View>
        </View>

        <View style={[styles.stepsGrid, desktop && styles.stepsGridDesktop]}>
          {device === 'iphone' ? (
            <>
              <InstallStep n="1" icon="web" title="Abra no Safari" text="Acesse olliorcamentos.online pelo Safari do iPhone." />
              <InstallStep n="2" icon="share-variant" title="Toque em Compartilhar" text="Use o botão de compartilhar na barra inferior do Safari." />
              <InstallStep n="3" icon="plus-box-outline" title="Adicionar à Tela de Início" text="Escolha essa opção e confirme o nome OLLI." />
              <InstallStep n="4" icon="login" title="Entrar ou cadastrar" text="Abra o ícone criado e faça login para sincronizar tudo." />
            </>
          ) : device === 'android' ? (
            <>
              <InstallStep n="1" icon="download-outline" title="Baixe o APK" text="Use o botão Baixar APK Android nesta página." />
              <InstallStep n="2" icon="shield-check-outline" title="Permita instalar" text="Se o Android pedir, libere instalação pelo navegador usado." />
              <InstallStep n="3" icon="cellphone-check" title="Abra o app" text="Entre com sua conta OLLI e sincronize com o Supabase." />
              <InstallStep n="4" icon="web" title="Ou use a web" text="Pelo navegador, clique em Entrar para usar o painel da empresa." />
            </>
          ) : (
            <>
              <InstallStep n="1" icon="monitor-dashboard" title="Dashboard web" text="No computador, o OLLI abre como painel de controle." />
              <InstallStep n="2" icon="account-plus-outline" title="Cadastro obrigatório" text="Entre ou crie conta antes de acessar os dados." />
              <InstallStep n="3" icon="cloud-sync-outline" title="Sincronização" text="Os dados salvos no app aparecem no painel web do mesmo usuário." />
              <InstallStep n="4" icon="cellphone-link" title="Use também no celular" text="No celular, instale pela web ou baixe o APK Android." />
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function deviceLabel(device: DeviceKind) {
  if (device === 'iphone') return 'iPhone detectado';
  if (device === 'android') return 'Android detectado';
  if (device === 'desktop') return 'Computador detectado';
  return 'Celular detectado';
}

function deviceHint(device: DeviceKind) {
  if (device === 'iphone') return 'A instalação é pelo Safari, sem App Store por enquanto.';
  if (device === 'android') return 'APK disponível e versão web sempre acessível.';
  if (device === 'desktop') return 'Prioridade para dashboard web e controle da empresa.';
  return 'Você pode instalar ou usar o painel web pelo navegador.';
}

function InstallStep({ n, icon, title, text }: { n: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepN}>{n}</Text>
      <MaterialCommunityIcons name={icon} size={24} color={Colors.accentLight} />
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { minHeight: '100%', paddingHorizontal: Spacing.base },
  shell: { width: '100%', maxWidth: 1120, alignSelf: 'center' },
  shellDesktop: { paddingHorizontal: Spacing.lg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  backText: { color: Colors.accentLight, fontFamily: Fonts.bold, fontSize: 14 },
  helpBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.strokeGlow, borderRadius: BorderRadius.full, paddingHorizontal: 13, paddingVertical: 8 },
  helpText: { color: Colors.accentLight, fontFamily: Fonts.bold, fontSize: 13 },
  hero: { gap: 16 },
  heroDesktop: { flexDirection: 'row', alignItems: 'stretch' },
  heroCopy: { flex: 1, justifyContent: 'center' },
  kicker: { color: Colors.accentLight, fontFamily: Fonts.extraBold, fontSize: 12, textTransform: 'uppercase' },
  title: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 34, lineHeight: 40, marginTop: 10 },
  titleDesktop: { fontSize: 52, lineHeight: 58, maxWidth: 720 },
  subtitle: { color: Colors.onSurfaceVariant, fontSize: 15.5, lineHeight: 23, marginTop: 12, maxWidth: 680 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  deviceCard: { width: '100%', maxWidth: 340, backgroundColor: Colors.surfaceGlass, borderWidth: 1, borderColor: Colors.strokeGlow, borderRadius: BorderRadius.xl, padding: Spacing.lg, ...Shadow.md },
  deviceCardTitle: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 20, marginTop: 14 },
  deviceCardText: { color: Colors.onSurfaceVariant, fontSize: 14, lineHeight: 20, marginTop: 6 },
  stepsGrid: { gap: 12, marginTop: 28 },
  stepsGridDesktop: { flexDirection: 'row' },
  step: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.outline, borderRadius: BorderRadius.lg, padding: Spacing.base },
  stepN: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', backgroundColor: Colors.accentLight, color: '#07111F', textAlign: 'center', lineHeight: 24, fontFamily: Fonts.extraBold, marginBottom: 13 },
  stepTitle: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 15.5, marginTop: 10 },
  stepText: { color: Colors.onSurfaceVariant, fontSize: 13, lineHeight: 18, marginTop: 5 },
});
