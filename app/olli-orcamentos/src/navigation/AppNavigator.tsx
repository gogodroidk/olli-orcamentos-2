import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createBottomTabNavigator, BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../theme';

// Screens
import HomeScreen from '../screens/HomeScreen';
import OrcamentosScreen from '../screens/OrcamentosScreen';
import NovoOrcamentoScreen from '../screens/NovoOrcamentoScreen';
import CatalogoScreen from '../screens/CatalogoScreen';
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

export type RootStackParamList = {
  Tabs: undefined;
  NovoOrcamento: { modeloId?: string };
  EditarOrcamento: { orcamentoId: string };
  VisualizarOrcamento: { orcamentoId: string };
  Orcamentos: undefined;
  Catalogo: undefined;
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
  Agenda: undefined;
  Orcar: undefined;     // botão central elevado → abre NovoOrcamento (stack)
  Hoje: undefined;
  Conta: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

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
        <Text style={styles.centerLabel}>Orçamento</Text>
      </TouchableOpacity>
    </View>
  );
}

function TabNavigator() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.tabActive,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarStyle: {
          backgroundColor: 'rgba(12,27,46,0.96)',
          borderTopWidth: 1,
          borderTopColor: Colors.outline,
          height: 62 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
          // sem position absolute: mantém o layout estável na web (PWA)
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
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
        component={HomeScreen}
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

export function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="NovoOrcamento" component={NovoOrcamentoScreen} />
      <Stack.Screen name="EditarOrcamento" component={NovoOrcamentoScreen} />
      <Stack.Screen name="VisualizarOrcamento" component={VisualizarOrcamentoScreen} />
      {/* Lista de orçamentos e o antigo "Catálogo": mantidos no stack e alcançáveis
          pela Home ("ver todos") e pela Conta → Ferramentas. */}
      <Stack.Screen name="Orcamentos" component={OrcamentosScreen} />
      <Stack.Screen name="Catalogo" component={CatalogoScreen} />
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
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  centerTouch: { alignItems: 'center', justifyContent: 'center', marginTop: -22 },
  centerGrad: {
    width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: Colors.background,
    shadowColor: '#34C6D9', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 14,
    elevation: 8,
  },
  centerLabel: { fontSize: 11, fontWeight: '700', color: Colors.tabActive, marginTop: 3 },
});
