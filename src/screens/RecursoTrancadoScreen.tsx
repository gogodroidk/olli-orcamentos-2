import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientHeader } from '../components/GradientHeader';
import { CartaoRecursoPlano } from '../components/RecursoPlano';
import { goBackOrHome } from '../navigation/safeBack';
import { planoMinimoDoRecurso } from '../services/entitlements';
import { NOME_PLANO } from '../services/planosBase';
import { Spacing, useCores } from '../theme';
import type { RootStackParamList } from '../navigation/AppNavigator';

/**
 * "Disponível no Pro" — a tela que o cadeado abre (D-2267). Texto e preço só de `planosBase`;
 * o cartão já cobre os 3 estados (carregando | não confirmei o plano | bloqueado) e o botão do plano
 * só aparece onde a loja deixa vender. Se o plano voltar `liberado` (assinou e voltou), o cartão some
 * e a tela volta sozinha para onde a pessoa estava.
 */
export default function RecursoTrancadoScreen() {
  const nav = useNavigation();
  const { recurso } = useRoute<RouteProp<RootStackParamList, 'RecursoTrancado'>>().params;
  const insets = useSafeAreaInsets();
  const cores = useCores();
  return (
    <View style={[styles.raiz, { backgroundColor: cores.background }]}>
      <GradientHeader title={`Disponível no ${NOME_PLANO[planoMinimoDoRecurso(recurso)]}`} onBack={() => goBackOrHome(nav as never)} />
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xl + insets.bottom }}>
        <CartaoRecursoPlano recurso={recurso} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ raiz: { flex: 1 } });
