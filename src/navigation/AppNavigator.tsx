import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createBottomTabNavigator, BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, type NavigatorScreenParams } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { BorderRadius, comAlfa, sombrasDe, useCores, useEstilos, useGradientes, type Cores } from '../theme';
import { useEhDesktop } from '../hooks/useEhDesktop';
import { comCentroDesktop } from '../components/web/CentroDesktop';
import { SidebarNav } from '../components/web/SidebarNav';

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
import OnboardingScreen from '../screens/OnboardingScreen';
import EntrarScreen from '../screens/EntrarScreen';
import RelatorioDiaScreen from '../screens/RelatorioDiaScreen';
import EquipeScreen from '../screens/EquipeScreen';
import EquipeAoVivoScreen from '../screens/EquipeAoVivoScreen';
import ConviteScreen from '../screens/ConviteScreen';
import OrdemServicoScreen from '../screens/OrdemServicoScreen';
import EquipamentoScreen from '../screens/EquipamentoScreen';
import PmocPlanosScreen from '../screens/PmocPlanosScreen';
import PmocPlanoScreen from '../screens/PmocPlanoScreen';
// Frentes novas — landing pública, lixeira, assinatura, ajuda/suporte, legal
// (Privacidade/Termos = mesmo componente) e o shell do técnico (Home dele).
import LandingScreen from '../screens/LandingScreen';
import LixeiraScreen from '../screens/LixeiraScreen';
import AssinaturaScreen from '../screens/AssinaturaScreen';
import AjudaScreen from '../screens/AjudaScreen';
import LegalScreen from '../screens/LegalScreen';
import TecnicoHomeScreen from '../screens/TecnicoHomeScreen';
import type { AjudaRouteParams } from '../screens/AjudaScreen';
import { usePermissao } from '../hooks/usePermissao';

// Telas desktop (v4) — só montadas quando `ehDesktop` (web ≥ 1024px). No
// nativo/APK nada disto entra na árvore. Barril em src/screens/desktop.
import {
  InicioDesktopScreen,
  AgendaDesktopScreen,
  OrcamentosDesktopScreen,
  ClientesDesktopScreen,
  RelatoriosDesktopScreen,
  FerramentasDesktopScreen,
} from '../screens/desktop';

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
  // NavigatorScreenParams: declara Tabs como um navigator ANINHADO. Além de
  // manter navigate('Tabs', { screen, params }) tipado, é o que o `linking` da
  // v4 exige para aceitar `screens` aninhados no PathConfig de Tabs.
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Onboarding: undefined;
  Entrar: undefined;
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
  // Relatório do dia falado — sempre gera o dia corrente na hora, sem params.
  RelatorioDia: undefined;
  // Onda 2 — Equipe (empresa): gestão de membros/papéis/convites.
  Equipe: undefined;
  // Onda 2 — Equipe ao vivo: lista de técnicos + última localização + rota no mapa.
  EquipeAoVivo: undefined;
  // Aceite de convite de equipe (deep link olliorcamentos://convite/<token>).
  Convite: { token?: string };
  // Onda 4 — Ordens de serviço (OS mínima + app do técnico). Role-aware:
  // gestão vê todas; técnico vê só as suas.
  OrdemServico: undefined;
  // PMOC Fase 1 — Equipamentos HVAC (inventário + etiqueta QR da porta física).
  Equipamento: undefined;
  // PMOC Fase 2 — planos de manutenção programada (lista) e o detalhe do plano,
  // que gera as ordens de serviço recorrentes. `PmocPlano` recebe o id do plano.
  Pmoc: undefined;
  PmocPlano: { id: string };
  // ─── Frentes novas ────────────────────────────────────────────────────────
  // Landing pública (web deslogado) — full-bleed, sem wrap desktop nem path.
  Landing: undefined;
  // Lixeira (soft-delete unificado) e Assinatura (billing) — telas de gestão.
  Lixeira: undefined;
  Assinatura: undefined;
  // Central de Ajuda/suporte (aceita abrir direto num artigo/categoria).
  Ajuda: AjudaRouteParams;
  // Legal: Privacidade e Termos são o MESMO componente (LegalScreen), que
  // detecta qual doc mostrar pelo route.name (começa com 'term' = Termos).
  Privacidade: undefined;
  Termos: undefined;
  // Home do técnico (papel === 'tecnico') — full-bleed, mobile-only.
  TecnicoHome: undefined;
};

export type TabParamList = {
  Home: undefined;
  // Agenda pode abrir já criando um agendamento para um cliente/orçamento (CRM).
  Agenda: { novoParaClienteId?: string; novoParaClienteNome?: string; novoParaOrcamentoId?: string; novoEndereco?: string; novoTitulo?: string } | undefined;
  Orcar: undefined;     // botão central elevado → abre NovoOrcamento (stack)
  Hoje: undefined;
  Conta: undefined;
  // ─── Abas SOMENTE-desktop (v4) ──────────────────────────────────────────
  // Registradas condicionalmente sob `ehDesktop`; no mobile/APK nunca montam.
  // Vivem DENTRO do shell (com a sidebar visível), em vez de cobrirem-na como
  // telas de stack. Opcionais no tipo porque não existem no modo mobile.
  OrcamentosTab?: { clienteId?: string; clienteNome?: string } | undefined;
  ClientesTab?: undefined;
  RelatoriosTab?: undefined;
  FerramentasTab?: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Telas do stack raiz embrulhadas em `comCentroDesktop` (v4).
 *
 * O HOC é PASS-THROUGH PURO no nativo e na web < 1024px (identidade — zero View
 * extra, comportamento mobile/APK intacto). Só na web ≥ 1024px ele centraliza a
 * tela num container de 560px sobre o shell da sidebar.
 *
 * Referências criadas UMA vez no módulo (identidade estável) — obrigatório para
 * o React Navigation não remontar a tela a cada render. Entrar/Onboarding/Tabs
 * NÃO são embrulhados (capas full-bleed / o próprio shell).
 */
const NovoOrcamentoCentro = comCentroDesktop(NovoOrcamentoScreen);
const VisualizarOrcamentoCentro = comCentroDesktop(VisualizarOrcamentoScreen);
const OrcamentosCentro = comCentroDesktop(OrcamentosScreen);
const DiagnosticoCentro = comCentroDesktop(CodigosErroScreen);
const ClientesCentro = comCentroDesktop(ClientesScreen);
const ServicosCentro = comCentroDesktop(ServicosScreen);
const ProdutosCentro = comCentroDesktop(ProdutosScreen);
const EmitirReciboCentro = comCentroDesktop(EmitirReciboScreen);
const ContaCentro = comCentroDesktop(ContaScreen);
const MeuNegocioCentro = comCentroDesktop(MeuNegocioScreen);
const DiagnosticoIACentro = comCentroDesktop(DiagnosticoIAScreen);
const OlliVozCentro = comCentroDesktop(OlliVozScreen);
const OlliChatCentro = comCentroDesktop(OlliChatScreen);
const PlanosCentro = comCentroDesktop(PlanosScreen);
const RelatorioDiaCentro = comCentroDesktop(RelatorioDiaScreen);
const EquipeCentro = comCentroDesktop(EquipeScreen);
const EquipeAoVivoCentro = comCentroDesktop(EquipeAoVivoScreen);
const ConviteCentro = comCentroDesktop(ConviteScreen);
const OrdemServicoCentro = comCentroDesktop(OrdemServicoScreen);
const EquipamentoCentro = comCentroDesktop(EquipamentoScreen);
const PmocCentro = comCentroDesktop(PmocPlanosScreen);
const PmocPlanoCentro = comCentroDesktop(PmocPlanoScreen);
// Frentes novas: telas mobile-like centralizadas no desktop (pass-through no
// nativo). Landing e TecnicoHome NÃO entram aqui — são full-bleed por conta
// própria. Privacidade e Termos compartilham o LegalCentro (mesmo componente).
const LixeiraCentro = comCentroDesktop(LixeiraScreen);
const AssinaturaCentro = comCentroDesktop(AssinaturaScreen);
const AjudaCentro = comCentroDesktop(AjudaScreen);
const LegalCentro = comCentroDesktop(LegalScreen);

/** Tela stub para a aba central "Orcar", que nunca é exibida (tabPress.preventDefault). */
const EmptyTab = () => null;

/**
 * Home NEUTRA, exibida enquanto o papel do usuário ainda é desconhecido (leitura da
 * organização em voo, ou falhou e não há cache). Montar a HomeScreen do dono aqui
 * mostraria faturamento e conversão a um técnico durante todo cold start lento — e
 * a sessão inteira quando ele está sem sinal, que é a rotina de campo.
 */
function HomeCarregando() {
  const styles = useEstilos(criarEstilos);
  return <View style={styles.homeCarregando} />;
}

/** Botão central elevado (＋ Orçamento). Não é uma tela — abre o stack NovoOrcamento. */
function CenterButton(_props: BottomTabBarButtonProps) {
  const nav = useNavigation<any>();
  const styles = useEstilos(criarEstilos);
  const gradientes = useGradientes();
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
          colors={gradientes.primaryDiagonal}
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

function TabNavigator() {
  const insets = useSafeAreaInsets();
  // Regra de ouro: no nativo `ehDesktop` é sempre false → tudo abaixo é o
  // comportamento mobile/APK EXATO de hoje. As diferenças (sidebar à esquerda,
  // telas desktop, 4 abas extras) só existem na web ≥ 1024px.
  const ehDesktop = useEhDesktop();
  const cores = useCores();
  // Shell do técnico (papel === 'tecnico'): no MOBILE a Home vira a
  // TecnicoHomeScreen e o atalho central de orçamento some. Para desktop e para
  // os demais papéis (owner/admin/gestor/pessoal) nada muda — `papel` é null em
  // conta pessoal, então a condição só dispara para técnicos de uma empresa.
  //
  // `carregando` é FAIL-CLOSED: enquanto o papel não é conhecido, `papel` também é
  // null (indistinguível de conta pessoal), então não dá para escolher a Home pelo
  // papel sozinho. Montamos uma Home neutra e escondemos o atalho de orçamento.
  const { papel, carregando: papelCarregando } = usePermissao();
  const homeMobile = papelCarregando
    ? HomeCarregando
    : papel === 'tecnico'
      ? TecnicoHomeScreen
      : HomeScreen;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: cores.tabActive,
        tabBarInactiveTintColor: cores.tabInactive,
        // Desktop: a barra vira uma sidebar à esquerda (SidebarNav custom, abaixo).
        // A posição lateral é API do bottom-tabs v7.
        ...(ehDesktop ? { tabBarPosition: 'left' as const } : null),
        // Estilo da tab bar INFERIOR só se aplica no modo mobile — no desktop a
        // SidebarNav renderiza sua própria View, então isolamos os estilos por
        // modo para nada (borderTopRadius/altura) vazar para a barra lateral.
        tabBarStyle: ehDesktop
          ? { display: 'none' as const }
          : {
              // rgba(7,17,31,0.98) era o fundo do modo escuro (#07111F) quase
              // opaco, cravado — no claro isso virava uma barra preta. `comAlfa`
              // reproduz o mesmo efeito (fundo quase opaco) seguindo o tema/cor
              // de marca atual.
              backgroundColor: comAlfa(cores.background, 0.98),
              borderTopWidth: 1,
              borderTopColor: cores.strokeGlow,
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
      // Sidebar permanente no desktop: substitui a tab bar inferior por completo.
      // No mobile mantém a tab bar padrão do bottom-tabs (tabBar undefined).
      tabBar={ehDesktop ? (props) => <SidebarNav {...props} /> : undefined}
    >
      <Tab.Screen
        name="Home"
        // Desktop: dashboard (InicioDesktopScreen — tem guarda própria de papel).
        // Mobile: técnico vê a TecnicoHomeScreen (home do campo); os demais papéis
        // mantêm a HomeScreen; papel desconhecido vê uma Home neutra.
        component={ehDesktop ? InicioDesktopScreen : homeMobile}
        options={{
          tabBarLabel: 'Início',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Agenda"
        // Desktop: grade de semana (AgendaDesktopScreen); mobile: AgendaScreen atual.
        component={ehDesktop ? AgendaDesktopScreen : AgendaScreen}
        options={{
          tabBarLabel: 'Agenda',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="calendar-month-outline" color={color} size={size} />
          ),
        }}
      />
      {/* Aba central "Orcar" (botão elevado) — só existe no mobile. No desktop o
          botão '+ Novo orçamento' vive na SidebarNav, que ignora este item. O
          técnico não vê atalho de orçamento (fluxo de campo é OS, não venda).
          Enquanto o papel carrega, o atalho fica escondido: aparecer e sumir é
          pior que aparecer um instante depois, e evita o flash para o técnico. */}
      {!ehDesktop && !papelCarregando && papel !== 'tecnico' && (
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
      )}
      {/* ─── Abas SOMENTE-desktop: vivem dentro do shell com a sidebar. ─────── */}
      {ehDesktop && (
        <>
          <Tab.Screen
            name="OrcamentosTab"
            component={OrcamentosDesktopScreen}
            options={{
              tabBarLabel: 'Orçamentos',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="file-document-outline" color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="ClientesTab"
            component={ClientesDesktopScreen}
            options={{
              tabBarLabel: 'Clientes',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="account-group-outline" color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="RelatoriosTab"
            component={RelatoriosDesktopScreen}
            options={{
              tabBarLabel: 'Relatórios',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="chart-line" color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="FerramentasTab"
            component={FerramentasDesktopScreen}
            options={{
              tabBarLabel: 'Ferramentas',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="toolbox-outline" color={color} size={size} />
              ),
            }}
          />
        </>
      )}
      {/* Hoje só existe no mobile: no desktop a sidebar não a lista (o resumo
          do dia vive no dashboard) e a tela mobile esticada ficaria estranha. */}
      {!ehDesktop && (
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
      )}
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
  const cores = useCores();
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName ?? 'Tabs'}
      screenOptions={{
        headerShown: false,
        // Design de movimento (v3): transição padrão do stack — deslize lateral
        // suave. As "capas" (Entrar/Onboarding) usam fade (abaixo).
        animation: 'slide_from_right',
        animationDuration: 260,
        contentStyle: { backgroundColor: cores.background },
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} />
      {/* Onboarding é pós-login: entra com fade (não é uma "próxima página").
          NÃO recebe wrap desktop — é capa full-bleed (centraliza por conta própria). */}
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade', animationDuration: 320 }} />
      {/* Entrar é a CAPA/porta: fade e sem gesto de voltar (não há para onde).
          NÃO recebe wrap desktop — capa full-bleed. */}
      <Stack.Screen name="Entrar" component={EntrarScreen} options={{ animation: 'fade', animationDuration: 320, gestureEnabled: false }} />
      {/* Landing pública (web deslogado): capa full-bleed, sem wrap desktop e sem
          gesto de voltar. NÃO tem path no linking (a URL raiz '/' segue sendo '/'
          para preservar o canonical de SEO). */}
      <Stack.Screen name="Landing" component={LandingScreen} options={{ animation: 'fade', animationDuration: 320, gestureEnabled: false }} />
      {/* As telas abaixo usam `comCentroDesktop`: mobile/APK intacto (pass-through);
          desktop centraliza a tela mobile-like sobre o shell. Referências estáveis
          criadas no módulo (ver topo do arquivo). */}
      <Stack.Screen name="NovoOrcamento" component={NovoOrcamentoCentro} />
      <Stack.Screen name="EditarOrcamento" component={NovoOrcamentoCentro} />
      <Stack.Screen name="VisualizarOrcamento" component={VisualizarOrcamentoCentro} />
      {/* Lista de orçamentos — alcançável pela Home ("ver todos") e pela Conta. */}
      <Stack.Screen name="Orcamentos" component={OrcamentosCentro} />
      {/* Diagnóstico (OLLI Técnica) — chegável pela Home e pela Conta → Ferramentas. */}
      <Stack.Screen name="Diagnostico" component={DiagnosticoCentro} />
      <Stack.Screen name="Clientes" component={ClientesCentro} />
      <Stack.Screen name="Servicos" component={ServicosCentro} />
      <Stack.Screen name="Produtos" component={ProdutosCentro} />
      <Stack.Screen name="EmitirRecibo" component={EmitirReciboCentro} />
      <Stack.Screen name="Conta" component={ContaCentro} />
      <Stack.Screen name="MeuNegocio" component={MeuNegocioCentro} />
      <Stack.Screen name="DiagnosticoIA" component={DiagnosticoIACentro} />
      {/* Fase 3 — OLLI Voz, Chat e Planos (chegáveis pela Home e pela Conta). */}
      <Stack.Screen name="OlliVoz" component={OlliVozCentro} />
      <Stack.Screen name="OlliChat" component={OlliChatCentro} />
      <Stack.Screen name="Planos" component={PlanosCentro} />
      {/* Relatório do dia falado — chegável pela Home/Hoje ("Como foi seu dia?"). */}
      <Stack.Screen name="RelatorioDia" component={RelatorioDiaCentro} />
      {/* Onda 2 — Equipe (empresa) e aceite de convite (deep link). */}
      <Stack.Screen name="Equipe" component={EquipeCentro} />
      <Stack.Screen name="EquipeAoVivo" component={EquipeAoVivoCentro} />
      <Stack.Screen name="Convite" component={ConviteCentro} />
      {/* Onda 4 — Ordens de serviço (gestão + app do técnico). */}
      <Stack.Screen name="OrdemServico" component={OrdemServicoCentro} />
      {/* PMOC Fase 1 — Equipamentos HVAC (inventário + etiqueta QR). */}
      <Stack.Screen name="Equipamento" component={EquipamentoCentro} />
      {/* PMOC Fase 2 — planos de manutenção (/pmoc) e o detalhe (/pmoc/:id). */}
      <Stack.Screen name="Pmoc" component={PmocCentro} />
      <Stack.Screen name="PmocPlano" component={PmocPlanoCentro} />
      {/* ─── Frentes novas ──────────────────────────────────────────────────
          Lixeira e Assinatura (gestão), Ajuda/suporte e os documentos legais.
          Privacidade e Termos apontam para o MESMO LegalCentro — a tela decide
          qual doc renderizar pelo route.name. */}
      <Stack.Screen name="Lixeira" component={LixeiraCentro} />
      <Stack.Screen name="Assinatura" component={AssinaturaCentro} />
      <Stack.Screen name="Ajuda" component={AjudaCentro} />
      <Stack.Screen name="Privacidade" component={LegalCentro} />
      <Stack.Screen name="Termos" component={LegalCentro} />
      {/* Home do técnico como rota de stack: full-bleed, mobile-only (não recebe
          wrap desktop — a própria tela se vira). */}
      <Stack.Screen name="TecnicoHome" component={TecnicoHomeScreen} />
    </Stack.Navigator>
  );
}

const criarEstilos = (c: Cores) => {
  // shadowColor do glow: '#34C6D9' era o ciano de acento cravado. No escuro o
  // glow é a própria cor de acento; no claro `sombrasDe` já troca para uma
  // sombra neutra (glow colorido sobre fundo claro suja o card em vez de
  // destacar — ver comentário em cores.ts). Usamos só a cor daí; offset/
  // opacity/radius/elevation seguem os valores originais deste botão.
  const glowCyan = sombrasDe(c).glowCyan;
  return StyleSheet.create({
    // Fundo liso (sem spinner): esta Home aparece por milissegundos no caso comum e
    // um indicador piscando seria mais ruidoso que a espera.
    homeCarregando: { flex: 1, backgroundColor: c.background },
    centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
    centerTouch: { alignItems: 'center', justifyContent: 'center', marginTop: -28 },
    centerGrad: {
      width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center',
      borderWidth: 4, borderColor: c.background,
      shadowColor: glowCyan.shadowColor, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 14,
      elevation: 8,
    },
    centerLabel: { fontSize: 11, fontWeight: '800', color: c.tabActive, marginTop: 3 },
  });
};
