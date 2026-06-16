import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export type RootStackParamList = {
  Tabs: undefined;
  NovoOrcamento: { modeloId?: string };
  EditarOrcamento: { orcamentoId: string };
  VisualizarOrcamento: { orcamentoId: string };
  Clientes: undefined;
  Servicos: undefined;
  Produtos: undefined;
  EmitirRecibo: { orcamentoId?: string };
  Conta: undefined;
  MeuNegocio: undefined;
  DiagnosticoIA: { marca?: string; modelo?: string; codigo?: string; sintoma?: string };
};

export type TabParamList = {
  Home: undefined;
  Diagnostico: undefined;
  Orcamentos: undefined;
  Catalogo: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function TabNavigator() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.tabActive,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarStyle: {
          backgroundColor: Colors.surfaceVariant,
          borderTopWidth: 1,
          borderTopColor: Colors.outline,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
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
        name="Diagnostico"
        component={CodigosErroScreen}
        options={{
          tabBarLabel: 'Diagnóstico',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="card-search-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Orcamentos"
        component={OrcamentosScreen}
        options={{
          tabBarLabel: 'Orçamentos',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="file-document-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Catalogo"
        component={CatalogoScreen}
        options={{
          tabBarLabel: 'Catálogo',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-grid-outline" color={color} size={size} />
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
      <Stack.Screen name="Clientes" component={ClientesScreen} />
      <Stack.Screen name="Servicos" component={ServicosScreen} />
      <Stack.Screen name="Produtos" component={ProdutosScreen} />
      <Stack.Screen name="EmitirRecibo" component={EmitirReciboScreen} />
      <Stack.Screen name="Conta" component={ContaScreen} />
      <Stack.Screen name="MeuNegocio" component={MeuNegocioScreen} />
      <Stack.Screen name="DiagnosticoIA" component={DiagnosticoIAScreen} />
    </Stack.Navigator>
  );
}
