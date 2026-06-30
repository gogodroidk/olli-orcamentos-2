import React from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { createBottomTabNavigator, BottomTabBarButtonProps, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { BorderRadius, Colors } from '../theme';

// Screens
import HomeScreen from '../screens/HomeScreen';
import OrcamentosScreen from '../screens/OrcamentosScreen';
import NovoOrcamentoScreen from '../screens/NovoOrcamentoScreen';
import CodigosErroScreen from '../screens/CodigosErroScreen';
import DiagnosticoIAScreen from '../screens/DiagnosticoIAScreen';
import MeuNegocioScreen from '../screens/MeuNegocioScreen';
import VisualizarOrcamentoScreen from '../screens/VisualizarOrcamentoScreen';
import ClientesScreen from '../screens/ClientesScreen';
import ServicosScreen from '../screens/ServicosScreen';
import ProdutosScreen from '../screens/ProdutosScreen';
import EmitirReciboScreen from '../screens/EmitirReciboScreen';
import ContaScreen from '../screens/ContaScreen';
import AgendaScreen from '../screens/AgendaScreen';
import HojeScreen from '../screens/HojeScreen';
import OlliVozScreen from '../screens/OlliVozScreen';
import OlliChatScreen from '../screens/OlliChatScreen';
import PlanosScreen from '../screens/PlanosScreen';
import LandingScreen from '../screens/LandingScreen';
import AjudaScreen from '../screens/AjudaScreen';
import InstalarScreen from '../screens/InstalarScreen';
import AuthCallbackScreen from '../screens/AuthCallbackScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import EntrarScreen from '../screens/EntrarScreen';

/**
 * Item pré-carregado num novo orçamento (vindo de um diagnóstico/código de erro).
 * Só descrição/nome — o usuário ajusta preço e quantidade no fluxo do orçamento.
 */
export type PrefillItem = {
  tipo: 'servico' | 'produto';
  nome: string;
  descricao?: string;
};

export type RootStackParamList = {
  Landing: undefined;
  Ajuda: undefined;
  Instalar: { device?: 'iphone' | 'android' | 'desktop' | 'mobile' } | undefined;
  AuthCallback: undefined;
  Tabs: { screen?: keyof TabParamList; params?: object } | undefined;
  Onboarding: undefined;
  Entrar: { mode?: 'login' | 'signup' } | undefined;
  // NovoOrcamento aceita um modelo, OU pré-seleção de cliente, OU 1 item pré-carregado
  // (origem: diagnóstico / código de erro). Tudo opcional — sem isto cai no fluxo normal.
  NovoOrcamento: { modeloId?: string; clienteId?: string; prefillItem?: PrefillItem };
  EditarOrcamento: { orcamentoId: string };
  VisualizarOrcamento: { orcamentoId: string };
  // Orcamentos pode abrir filtrado por cliente (CRM: "ver orçamentos deste cliente").
  Orcamentos: { clienteId?: string; clienteNome?: string } | undefined;
  Clientes: undefined;
  Servicos: undefined;
  Produtos: undefined;
  EmitirRecibo: { orcamentoId?: string };
  Conta: undefined;
  MeuNegocio: undefined;
  Diagnostico: undefined;
  DiagnosticoIA: { marca?: string; modelo?: string; codigo?: string; sintoma?: string };
  // Fase 3 — OLLI conversacional + planos
  OlliVoz: undefined;
  OlliChat: undefined;
  Planos: undefined;
};

export type TabParamList = {
  Home: undefined;
  // Agenda pode abrir já criando um agendamento para um cliente/orçamento (CRM).
  Agenda: { novoParaClienteId?: string; novoParaClienteNome?: string; novoParaOrcamentoId?: string; novoEndereco?: string; novoTitulo?: string } | undefined;
  Orcar: undefined;     // botão central elevado → abre NovoOrcamento (stack)
  Hoje: undefined;
  Conta: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/** Tela stub para a aba central "Orcar", que nunca é exibida (tabPress.preventDefault). */
const EmptyTab = () => null;

/** Botão central elevado (＋ Orçamento). Não é uma tela — abre o stack NovoOrcamento. */
function CenterButton(_props: BottomTabBarButtonProps) {
  const nav = useNavigation<any>();
  return (
    <View style={styles.centerWrap} pointerEvents="box-none">
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Novo orçamento"
        activeOpacity={0.85}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          nav.navigate('NovoOrcamento', {});
        }}
        style={styles.centerTouch}
      >
        <LinearGradient
          colors={['#0B6FCE', '#34C6D9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.centerGrad}
        >
          <MaterialCommunityIcons name="plus" size={30} color="#fff" />
        </LinearGradient>
        <Text style={styles.centerLabel}>Orçar</Text>
      </TouchableOpacity>
    </View>
  );
}

const DESKTOP_ITEMS: Record<string, { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; desc: string }> = {
  Home: { label: 'Dashboard', icon: 'view-dashboard-outline', desc: 'Visao geral da empresa' },
  Agenda: { label: 'Agenda', icon: 'calendar-month-outline', desc: 'Dias e compromissos' },
  Hoje: { label: 'Hoje', icon: 'white-balance-sunny', desc: 'Prioridades do dia' },
  Conta: { label: 'Conta', icon: 'account-circle-outline', desc: 'Perfil e nuvem' },
};

function DesktopTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.desktopSidebar}>
      <View style={styles.desktopBrand}>
        <MaterialCommunityIcons name="clipboard-check-outline" size={24} color={Colors.accentLight} />
        <View style={{ flex: 1 }}>
          <Text style={styles.desktopBrandTitle}>OLLI Web</Text>
          <Text style={styles.desktopBrandSub}>Dashboard da empresa</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.desktopPrimary}
        activeOpacity={0.88}
        onPress={() => (navigation as any).navigate('NovoOrcamento', {})}
      >
        <MaterialCommunityIcons name="plus" size={20} color="#0A1626" />
        <Text style={styles.desktopPrimaryText}>Novo orçamento</Text>
      </TouchableOpacity>

      <View style={styles.desktopNav}>
        {state.routes.filter(route => route.name !== 'Orcar').map((route) => {
          const routeIndex = state.routes.findIndex((r) => r.key === route.key);
          const focused = state.index === routeIndex;
          const item = DESKTOP_ITEMS[route.name] ?? { label: route.name, icon: 'circle-outline' as const, desc: '' };
          return (
            <TouchableOpacity
              key={route.key}
              style={[styles.desktopNavItem, focused && styles.desktopNavItemActive]}
              activeOpacity={0.82}
              onPress={() => navigation.navigate(route.name as never)}
            >
              <MaterialCommunityIcons name={item.icon} size={21} color={focused ? Colors.accentLight : Colors.onSurfaceVariant} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.desktopNavLabel, focused && styles.desktopNavLabelActive]}>{item.label}</Text>
                <Text style={styles.desktopNavDesc}>{item.desc}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function TabNavigator() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 900;
  return (
    <Tab.Navigator
      tabBar={desktop ? (props) => <DesktopTabBar {...props} /> : undefined}
      screenOptions={{
        headerShown: false,
        sceneStyle: desktop ? { marginLeft: 280, backgroundColor: Colors.background } : { backgroundColor: Colors.background },
        tabBarActiveTintColor: Colors.tabActive,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarStyle: {
          backgroundColor: 'rgba(7,17,31,0.98)',
          borderTopWidth: 1,
          borderTopColor: Colors.strokeGlow,
          borderTopLeftRadius: BorderRadius.xl,
          borderTopRightRadius: BorderRadius.xl,
          height: 68 + insets.bottom,
          paddingBottom: insets.bottom + 7,
          paddingTop: 10,
          // sem position absolute: mantém o layout estável na web (PWA)
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '800', letterSpacing: 0 },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Início',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Agenda"
        component={AgendaScreen}
        options={{
          tabBarLabel: 'Agenda',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="calendar-month-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Orcar"
        // Stub vazio: esta aba nunca é exibida (tabPress faz preventDefault e o
        // botão central abre o stack NovoOrcamento). Evita montar a HomeScreen 2x.
        component={EmptyTab}
        options={{
          tabBarLabel: '',
          tabBarIcon: () => null,
          tabBarButton: (props) => <CenterButton {...props} />,
        }}
        listeners={{
          // jamais navega para a aba "Orcar" — o botão central já cuida de abrir o stack.
          tabPress: (e) => { e.preventDefault(); },
        }}
      />
      <Tab.Screen
        name="Hoje"
        component={HojeScreen}
        options={{
          tabBarLabel: 'Hoje',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="white-balance-sunny" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Conta"
        component={ContaScreen}
        options={{
          tabBarLabel: 'Conta',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator({ initialRouteName }: { initialRouteName?: keyof RootStackParamList } = {}) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName ?? 'Tabs'}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="Landing" component={LandingScreen} />
      <Stack.Screen name="Ajuda" component={AjudaScreen} />
      <Stack.Screen name="Instalar" component={InstalarScreen} />
      <Stack.Screen name="AuthCallback" component={AuthCallbackScreen} />
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Entrar" component={EntrarScreen} />
      <Stack.Screen name="NovoOrcamento" component={NovoOrcamentoScreen} />
      <Stack.Screen name="EditarOrcamento" component={NovoOrcamentoScreen} />
      <Stack.Screen name="VisualizarOrcamento" component={VisualizarOrcamentoScreen} />
      {/* Lista de orçamentos — alcançável pela Home ("ver todos") e pela Conta. */}
      <Stack.Screen name="Orcamentos" component={OrcamentosScreen} />
      {/* Diagnóstico (OLLI Técnica) — chegável pela Home e pela Conta → Ferramentas. */}
      <Stack.Screen name="Diagnostico" component={CodigosErroScreen} />
      <Stack.Screen name="Clientes" component={ClientesScreen} />
      <Stack.Screen name="Servicos" component={ServicosScreen} />
      <Stack.Screen name="Produtos" component={ProdutosScreen} />
      <Stack.Screen name="EmitirRecibo" component={EmitirReciboScreen} />
      <Stack.Screen name="Conta" component={ContaScreen} />
      <Stack.Screen name="MeuNegocio" component={MeuNegocioScreen} />
      <Stack.Screen name="DiagnosticoIA" component={DiagnosticoIAScreen} />
      {/* Fase 3 — OLLI Voz, Chat e Planos (chegáveis pela Home e pela Conta). */}
      <Stack.Screen name="OlliVoz" component={OlliVozScreen} />
      <Stack.Screen name="OlliChat" component={OlliChatScreen} />
      <Stack.Screen name="Planos" component={PlanosScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  desktopSidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 280,
    zIndex: 10,
    backgroundColor: 'rgba(7,17,31,0.98)',
    borderRightWidth: 1,
    borderRightColor: Colors.strokeGlow,
    padding: 18,
  },
  desktopBrand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, marginBottom: 18 },
  desktopBrandTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  desktopBrandSub: { color: Colors.onSurfaceVariant, fontSize: 12, fontWeight: '700', marginTop: 2 },
  desktopPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accentLight,
    borderRadius: BorderRadius.md,
    paddingVertical: 13,
    marginBottom: 18,
  },
  desktopPrimaryText: { color: '#0A1626', fontSize: 14, fontWeight: '900' },
  desktopNav: { gap: 8 },
  desktopNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  desktopNavItemActive: { borderColor: Colors.strokeGlow, backgroundColor: 'rgba(52,198,217,0.10)' },
  desktopNavLabel: { color: Colors.onSurfaceVariant, fontSize: 14, fontWeight: '900' },
  desktopNavLabelActive: { color: '#fff' },
  desktopNavDesc: { color: Colors.onSurfaceMuted, fontSize: 11.5, fontWeight: '600', marginTop: 1 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  centerTouch: { alignItems: 'center', justifyContent: 'center', marginTop: -28 },
  centerGrad: {
    width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: Colors.background,
    shadowColor: '#34C6D9', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 14,
    elevation: 8,
  },
  centerLabel: { fontSize: 11, fontWeight: '800', color: Colors.tabActive, marginTop: 3 },
});
