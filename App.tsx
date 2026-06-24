import React, { useEffect, useRef, useState } from 'react';
import { StatusBar, View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native';
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
import { getDb, getEmpresa } from './src/database/database';
import { ONBOARDED_KEY } from './src/screens/OnboardingScreen';
import { supabase } from './src/services/supabase';
import { syncOnLogin } from './src/services/cloudSync';
import type { RootStackParamList } from './src/navigation/AppNavigator';

SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>('Tabs');
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
    // Abre o banco e, ANTES de liberar a UI, decide a rota inicial:
    // 1º uso (sem empresa e nunca onboardado) → fluxo de boas-vindas (Onboarding).
    // Quem já tem empresa ou já passou pelo onboarding entra direto nas abas.
    (async () => {
      try {
        await getDb();
        const [empresa, onboarded] = await Promise.all([
          getEmpresa(),
          AsyncStorage.getItem(ONBOARDED_KEY).catch(() => null),
        ]);
        if (empresa === null && onboarded !== '1') {
          setInitialRoute('Onboarding');
        }
      } catch (e) {
        console.error(e);
      } finally {
        // Mesmo se a checagem falhar, libera o app (cai no default 'Tabs').
        setDbReady(true);
      }
    })();
  }, []);

  // Sincronização per-row (painel web) ao logar. Listener global central: cobre
  // o login feito em qualquer tela (inclusive ContaScreen). Ao entrar uma sessão
  // (SIGNED_IN ou INITIAL_SESSION já autenticado), dispara o sync em background.
  // NÃO inclui TOKEN_REFRESHED: a renovação de token (~1h) não deve forçar um
  // sync completo. syncOnLogin é fire-and-forget e nunca lança (offline/deslogado = no-op).
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        void syncOnLogin();
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
          <View style={[styles.appFrame, Platform.OS === 'web' && styles.webFrame]}>
            {ready ? (
              <NavigationContainer>
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
