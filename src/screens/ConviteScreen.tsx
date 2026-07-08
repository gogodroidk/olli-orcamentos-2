import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius } from '../theme';
import { OlliButton } from '../components/OlliButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { aceitarConvite, extrairToken, PAPEL_LABEL } from '../services/equipe';
import { recarregarTipoConta } from '../hooks/useTipoConta';
import { getCurrentUser } from '../services/supabase';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rota = RouteProp<RootStackParamList, 'Convite'>;

type Estado =
  | { fase: 'processando' }
  | { fase: 'sucesso'; nomeOrg: string; papel: string }
  | { fase: 'precisa_login' }
  | { fase: 'erro'; mensagem: string };

/**
 * ConviteScreen — aceite de convite de equipe (Onda 2).
 *
 * Alcançada por deep link (olliorcamentos://convite/<token>) ou pela ContaScreen
 * (colar o código). O token vem em route.params.token; ao montar, tenta aceitar
 * via aceitar_convite(token) (SECURITY DEFINER). Se não houver sessão, orienta o
 * login — o token fica preservado no param para o usuário reabrir depois de logar.
 */
export default function ConviteScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rota>();
  const insets = useSafeAreaInsets();
  const tokenParam = route.params?.token ?? '';

  const [estado, setEstado] = useState<Estado>({ fase: 'processando' });

  useEffect(() => {
    let vivo = true;
    (async () => {
      const token = extrairToken(tokenParam);
      if (!token) {
        if (vivo) setEstado({ fase: 'erro', mensagem: 'Este código de convite não parece válido. Confira o link que você recebeu.' });
        return;
      }
      const user = await getCurrentUser();
      if (!user) {
        if (vivo) setEstado({ fase: 'precisa_login' });
        return;
      }
      try {
        const org = await aceitarConvite(token);
        await recarregarTipoConta();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (vivo) setEstado({ fase: 'sucesso', nomeOrg: org.nome, papel: PAPEL_LABEL[org.papel] });
      } catch (e: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        if (vivo) setEstado({ fase: 'erro', mensagem: e?.message ?? 'Não consegui aceitar o convite agora.' });
      }
    })();
    return () => { vivo = false; };
  }, [tokenParam]);

  function irParaApp() {
    Haptics.selectionAsync().catch(() => {});
    nav.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  }

  function irParaEntrar() {
    Haptics.selectionAsync().catch(() => {});
    nav.reset({ index: 0, routes: [{ name: 'Entrar' }] });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.inner}>
        {estado.fase === 'processando' && (
          <>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="account-multiple-plus-outline" size={44} color={Colors.accentLight} />
            </View>
            <Text style={styles.titulo}>Entrando na equipe…</Text>
            <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.lg }} />
          </>
        )}

        {estado.fase === 'sucesso' && (
          <>
            <View style={[styles.iconWrap, styles.iconOk]}>
              <MaterialCommunityIcons name="check-circle-outline" size={48} color={Colors.success} />
            </View>
            <Text style={styles.titulo}>Bem-vindo à equipe!</Text>
            <Text style={styles.sub}>
              Você agora faz parte de <Text style={styles.forte}>{estado.nomeOrg}</Text> como{' '}
              <Text style={styles.forte}>{estado.papel}</Text>.
            </Text>
            <OlliButton
              label="Começar"
              variant="gradient"
              size="lg"
              fullWidth
              onPress={irParaApp}
              icon={<MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />}
              style={{ marginTop: Spacing.xl, alignSelf: 'stretch' }}
            />
          </>
        )}

        {estado.fase === 'precisa_login' && (
          <>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="login" size={44} color={Colors.accentLight} />
            </View>
            <Text style={styles.titulo}>Entre para aceitar</Text>
            <Text style={styles.sub}>
              Faça login na sua conta OLLI e toque de novo no link do convite para entrar na equipe.
            </Text>
            <OlliButton
              label="Entrar na conta"
              variant="gradient"
              size="lg"
              fullWidth
              onPress={irParaEntrar}
              style={{ marginTop: Spacing.xl, alignSelf: 'stretch' }}
            />
          </>
        )}

        {estado.fase === 'erro' && (
          <>
            <View style={[styles.iconWrap, styles.iconErro]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={44} color={Colors.danger} />
            </View>
            <Text style={styles.titulo}>Convite não aceito</Text>
            <Text style={styles.sub}>{estado.mensagem}</Text>
            <OlliButton
              label="Ir para o app"
              variant="outline"
              size="lg"
              fullWidth
              onPress={irParaApp}
              style={{ marginTop: Spacing.xl, alignSelf: 'stretch' }}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  inner: { width: '100%', maxWidth: 420, alignItems: 'center' },
  iconWrap: { width: 88, height: 88, borderRadius: 28, backgroundColor: Colors.accentContainer, alignItems: 'center', justifyContent: 'center' },
  iconOk: { backgroundColor: 'rgba(43,215,135,0.14)' },
  iconErro: { backgroundColor: 'rgba(255,107,107,0.14)' },
  titulo: { fontSize: 24, fontWeight: '800', color: '#fff', marginTop: Spacing.lg, textAlign: 'center' },
  sub: { fontSize: 15, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 22, marginTop: Spacing.sm },
  forte: { color: Colors.accentLight, fontWeight: '800' },
});
