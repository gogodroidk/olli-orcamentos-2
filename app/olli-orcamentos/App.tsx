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
import { AppTheme, Colors } from './src/theme';
import { Fonts, applyFontPatch } from './src/theme/fonts';
import { OlliLogo } from './src/components/OlliLogo';
import { AppNavigator } from './src/navigation/AppNavigator';
import { getDb } from './src/database/database';

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
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const start = Date.now();
    getDb()
      .then(() => {
        const wait = Math.max(0, 1000 - (Date.now() - start));
        setTimeout(() => setDbReady(true), wait);
      })
      .catch(console.error);
  }, []);

  // aplica o patch de fonte de forma síncrona (idempotente) antes de renderizar
  if (fontsLoaded) applyFontPatch();

  const ready = dbReady && fontsLoaded;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={AppTheme}>
          <StatusBar backgroundColor="transparent" translucent barStyle="light-content" />
          <View style={[styles.appFrame, Platform.OS === 'web' && styles.webFrame]}>
            {ready ? (
              <NavigationContainer>
                <AppNavigator />
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
