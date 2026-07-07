import React, { useEffect, useRef, useState } from 'react';
import { StatusBar, View, Text, StyleSheet, Animated, Easing, Platform, Dimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  Spectral_600SemiBold,
  Spectral_700Bold,
} from '@expo-google-fonts/spectral';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppTheme, Colors } from './src/theme';
import { Fonts, applyFontPatch } from './src/theme/fonts';
import { OlliLogo } from './src/components/OlliLogo';
import { AppNavigator } from './src/navigation/AppNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { getDb, getEmpresa } from './src/database/database';
import { ONBOARDED_KEY } from './src/screens/OnboardingScreen';
import { supabase, sessaoAtiva } from './src/services/supabase';
import { syncOnLogin } from './src/services/cloudSync';
import { maybeAutoBackup } from './src/services/autoBackup';
import { criarLinkingConfig } from './src/navigation/linking';
import { DESKTOP_BREAKPOINT, useEhDesktop } from './src/hooks/useEhDesktop';
import type { RootStackParamList } from './src/navigation/AppNavigator';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Modo desktop RESOLVIDO UMA VEZ no boot (fora do render). O linking precisa de
 * um mapa de URL fixo — o dual-mapping mobile/desktop de 'orcamentos'/'clientes'
 * é decidido aqui, no momento de criar o NavigationContainer. Redimensionar a
 * janela cruzando 1024px troca o LAYOUT na hora (via useEhDesktop nas telas),
 * mas o MAPA de URL permanece o do boot — limitação aceita e documentada (F5).
 *
 * No nativo `Platform.OS !== 'web'` garante `false` (o mapa é o mesmo dos dois
 * lados exceto pela chave de 'orcamentos'/'clientes', que no APK é irrelevante).
 */
const ehDesktopInicial =
  Platform.OS === 'web' && Dimensions.get('window').width >= DESKTOP_BREAKPOINT;

// Config de linking criada uma única vez (referência estável) — recriar o objeto
// a cada render remontaria o NavigationContainer e perderia o estado.
const linkingConfig = criarLinkingConfig(ehDesktopInicial);

/**
 * Ref global de navegação. A sessão Supabase é a única porta do app, então
 * precisamos comandar a navegação de fora da árvore de telas em dois momentos:
 * (1) SIGNED_OUT → resetar para 'Entrar' (sair da conta nunca deixa o usuário
 * dentro das Tabs); (2) guardas defensivos ("sessão expirada") em telas internas.
 */
// navigationRef mora em src/navigation/navigationRef (modulo folha, sem ciclos).

const useNativeAnimations = Platform.OS !== 'web';

function BrandSplash() {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 650, easing: Easing.out(Easing.back(1.5)), useNativeDriver: useNativeAnimations }),
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: useNativeAnimations }),
    ]).start();
  }, []);

  return (
    <View style={styles.splash}>
      <Animated.View style={{ transform: [{ scale }], opacity, alignItems: 'center' }}>
        <OlliLogo size={104} />
        <Text style={styles.brand}>OLLI</Text>
        <Text style={styles.tagline}>Orçamentos que fecham negócio</Text>
      </Animated.View>
    </View>
  );
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  // Layout desktop REATIVO (v4): controla só o frame externo (aplicar ou não o
  // webFrame de 430px). No nativo é sempre false → frame mobile inalterado.
  const ehDesktop = useEhDesktop();
  // Fail-closed: se a checagem de sessão lançar, a UI abre na PORTA (Entrar),
  // nunca dentro do app. Só o caso "sem nuvem configurada" abre direto nas Tabs.
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>('Entrar');
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Spectral_600SemiBold,
    Spectral_700Bold,
  });

  useEffect(() => {
    // Abre o banco e, ANTES de liberar a UI, decide a rota inicial. A sessão
    // Supabase é a ÚNICA porta do app:
    //   • sem nuvem configurada (build dev)  → Tabs (único caso sem sessão);
    //   • sem sessão                          → Entrar (a capa/login obrigatório);
    //   • com sessão mas sem empresa/onboard  → Onboarding (pós-login);
    //   • com sessão e já configurado         → Tabs.
    // Fail-closed: qualquer erro cai no default 'Entrar' (nunca dentro do app).
    (async () => {
      try {
        await getDb();
        const [empresa, onboarded, session] = await Promise.all([
          getEmpresa(),
          AsyncStorage.getItem(ONBOARDED_KEY).catch(() => null),
          sessaoAtiva(),
        ]);
        if (!supabase) {
          // Build dev sem nuvem: não há login possível, entra direto nas abas.
          setInitialRoute('Tabs');
        } else if (!session) {
          setInitialRoute('Entrar');
        } else if (empresa === null && onboarded !== '1') {
          setInitialRoute('Onboarding');
        } else {
          setInitialRoute('Tabs');
        }
      } catch (e) {
        // Erro técnico só no console de desenvolvimento; em produção (APK) não
        // vaza stack trace ao usuário. O default 'Entrar' (fail-closed) segura.
        if (__DEV__) console.error(e);
      } finally {
        setDbReady(true);
      }
    })();
  }, []);

  // Sincronização per-row (painel web) ao logar. Listener global central: cobre
  // o login feito em qualquer tela (inclusive ContaScreen). Ao entrar uma sessão
  // (SIGNED_IN ou INITIAL_SESSION já autenticado), dispara o sync em background.
  // NÃO inclui TOKEN_REFRESHED: a renovação de token (~1h) não deve forçar um
  // sync completo. syncOnLogin é fire-and-forget e nunca lança (offline/deslogado = no-op).
  //
  // Logo em seguida, dispara o backup automático versionado (autoBackup.ts):
  // roda por conta própria (no-op se já houve 'diario' nas últimas 24h, toggle
  // desligado ou deslogado) e não depende do sync terminar — só entra DEPOIS
  // dele para não competir por rede com o sync no exato momento do login.
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        void syncOnLogin().finally(() => { void maybeAutoBackup(); });
      }
      // Guard de deep link deslogado (v4): com `linking`, a URL inicial tem
      // precedência sobre o initialRouteName — abrir /orcamentos "frio" (sem
      // sessão) montaria o app vazio. Ao boot sem sessão (INITIAL_SESSION &&
      // !session), reseta para a porta. Fecha o buraco sem tocar no fluxo OAuth:
      // o retorno ?code= dispara SIGNED_IN (não INITIAL_SESSION), então não cai
      // aqui. No nativo, onde não há deep link de URL de página, é inócuo.
      if (event === 'INITIAL_SESSION' && !session && navigationRef.isReady()) {
        navigationRef.reset({ index: 0, routes: [{ name: 'Entrar' }] });
      }
      // Sair da conta (em qualquer tela) volta SEMPRE para a porta: reset central
      // aqui evita corrida com o signOut chamado pela ContaScreen. Só reseta se o
      // container já montou (isReady) — no boot deslogado a rota inicial já é Entrar.
      if (event === 'SIGNED_OUT' && navigationRef.isReady()) {
        navigationRef.reset({ index: 0, routes: [{ name: 'Entrar' }] });
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // aplica o patch de fonte de forma síncrona (idempotente) antes de renderizar
  if (fontsLoaded) applyFontPatch();

  const ready = dbReady && fontsLoaded;

  // Esconde a splash nativa só quando tudo (fontes + banco) estiver pronto,
  // para a UI não aparecer antes da hora.
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={AppTheme}>
          <StatusBar backgroundColor="transparent" translucent barStyle="light-content" />
          {/* webFrame (430px centrado) SÓ na web mobile: no desktop o app ocupa
              a tela toda (o shell da sidebar cuida do layout). No nativo o frame
              nunca se aplica — comportamento do APK intacto. */}
          <View style={[styles.appFrame, Platform.OS === 'web' && !ehDesktop && styles.webFrame]}>
            {ready ? (
              // linking com URLs reais (v4): o mapa é fixado no boot (linkingConfig).
              <NavigationContainer
                ref={navigationRef}
                linking={linkingConfig}
                // GATE DETERMINÍSTICO (web): com `linking`, a URL inicial tem
                // precedência sobre initialRouteName — sem isto, um visitante
                // deslogado abrindo '/' ou '/orcamentos' cairia DENTRO das Tabs
                // (o guard de INITIAL_SESSION perde a corrida com isReady()).
                // initialRoute já foi resolvido fail-closed no boot; se a porta
                // é Entrar/Onboarding e o linking restaurou outra rota, reseta.
                onReady={() => {
                  if (
                    (initialRoute === 'Entrar' || initialRoute === 'Onboarding') &&
                    navigationRef.isReady() &&
                    navigationRef.getCurrentRoute()?.name !== initialRoute
                  ) {
                    navigationRef.reset({ index: 0, routes: [{ name: initialRoute }] });
                  }
                }}
              >
                <AppNavigator initialRouteName={initialRoute} />
              </NavigationContainer>
            ) : (
              <BrandSplash />
            )}
          </View>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  appFrame: { flex: 1, backgroundColor: Colors.background },
  webFrame: { width: '100%', maxWidth: 430, alignSelf: 'center', overflow: 'hidden' },
  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primaryDark },
  brand: { fontSize: 42, fontFamily: Fonts.extraBold, color: '#fff', letterSpacing: 5, marginTop: 22 },
  tagline: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accent, letterSpacing: 1, marginTop: 4 },
});
