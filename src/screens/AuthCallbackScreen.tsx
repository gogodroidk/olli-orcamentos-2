import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { Colors, Gradients, Shadow, Spacing, BorderRadius } from '../theme';
import { Fonts } from '../theme/fonts';
import { OlliMascot } from '../components/OlliMascot';
import { getEmpresa } from '../database/database';
import { syncOnLogin } from '../services/cloudSync';
import { handleAuthRedirectUrl } from '../services/supabase';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LinearGradient } from 'expo-linear-gradient';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AuthCallback'>;

export default function AuthCallbackScreen() {
  const nav = useNavigation<Nav>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function finishGoogleSignIn() {
      try {
        const url = Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.location.href
          : await Linking.getInitialURL();

        if (!url) throw new Error('Nao recebi o retorno do Google.');

        const session = await handleAuthRedirectUrl(url);
        if (!session) throw new Error('Nao consegui criar a sessao do Google.');

        await syncOnLogin();
        const empresa = await getEmpresa().catch(() => null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

        if (!mounted) return;
        nav.dispatch(CommonActions.reset({
          index: 0,
          routes: [{ name: empresa ? 'Tabs' : 'Onboarding' }],
        }));
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? 'Nao foi possivel concluir o login com Google.');
      }
    }

    void finishGoogleSignIn();

    return () => {
      mounted = false;
    };
  }, [nav]);

  return (
    <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.root}>
      <View style={styles.card}>
        <OlliMascot size={82} onDark />
        <Text style={styles.title}>{error ? 'Login nao concluido' : 'Concluindo login'}</Text>
        <Text style={styles.text}>
          {error
            ? error
            : 'Recebemos o retorno do Google. Agora estamos conectando sua conta ao OLLI.'}
        </Text>

        {error ? (
          <TouchableOpacity
            style={styles.button}
            onPress={() => nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Entrar', params: { mode: 'login' } }] }))}
            activeOpacity={0.88}
          >
            <Text style={styles.buttonText}>Voltar para entrar</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color={Colors.primaryDark} />
          </TouchableOpacity>
        ) : (
          <ActivityIndicator color={Colors.accentLight} style={{ marginTop: Spacing.lg }} />
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  card: {
    width: '100%',
    maxWidth: 430,
    alignItems: 'center',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(127,233,245,0.24)',
    backgroundColor: 'rgba(7,17,31,0.34)',
    padding: Spacing.xl,
    ...Shadow.md,
  },
  title: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 24, marginTop: Spacing.base, textAlign: 'center' },
  text: { color: 'rgba(255,255,255,0.78)', fontFamily: Fonts.semiBold, fontSize: 14, lineHeight: 21, marginTop: Spacing.sm, textAlign: 'center' },
  button: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.accentLight, borderRadius: BorderRadius.md, paddingHorizontal: 18, paddingVertical: 14, marginTop: Spacing.lg },
  buttonText: { color: Colors.primaryDark, fontFamily: Fonts.extraBold, fontSize: 15 },
});
