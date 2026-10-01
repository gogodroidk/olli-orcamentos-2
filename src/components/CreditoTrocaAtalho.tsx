import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Fonts, useCores, useEstilos, type Cores } from '../theme';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { obterMeuPedidoTroca } from '../services/creditoTroca';
import { resumoPedidoTroca, type EstadoPedidoTroca } from '../services/creditoTrocaRegras';

/**
 * Atalho "Vim de outro app" (crédito de troca) — componente isolado.
 *
 * Mostra o estado do pedido do prestador (sem pedido / em análise / aprovado /
 * recusado) e leva à tela `VimDeOutroApp`. Também é o AVISO in-app da aprovação:
 * quando o admin aprova, este card passa a dizer "Pro liberado até dd/mm".
 *
 * Três estados: se a leitura falhar (ou não houver sessão) o card NÃO finge que
 * não há pedido — mostra só o convite neutro, que abre a tela (lá o estado real é
 * lido de novo e a falha aparece por extenso).
 *
 * Encaixe: hoje em PlanosScreen. Para Conta/Home (bloqueadas nesta leva):
 *   import { CreditoTrocaAtalho } from '../components/CreditoTrocaAtalho';
 *   <CreditoTrocaAtalho />                  // convite + estado do pedido
 *   <CreditoTrocaAtalho ocultarSemPedido /> // Home: só aparece quando há pedido (aviso de aprovado/recusado)
 */
export function CreditoTrocaAtalho({ ocultarSemPedido = false }: { ocultarSemPedido?: boolean }) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [estado, setEstado] = useState<EstadoPedidoTroca>({ tipo: 'carregando' });

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      obterMeuPedidoTroca().then((e) => { if (vivo) setEstado(e); }).catch(() => { if (vivo) setEstado({ tipo: 'indisponivel' }); });
      return () => { vivo = false; };
    }, []),
  );

  if (estado.tipo === 'carregando' || estado.tipo === 'sem_sessao') return null;
  const pedido = estado.tipo === 'pronto' ? estado.pedido : null;
  if (ocultarSemPedido && !pedido) return null;
  const resumo = resumoPedidoTroca(pedido);
  const icone = !pedido ? 'swap-horizontal-circle-outline'
    : pedido.status === 'aprovado' ? 'check-decagram'
      : pedido.status === 'pendente' ? 'progress-clock'
        : 'alert-circle-outline';
  const cor = pedido?.status === 'aprovado' ? cores.success : pedido?.status === 'recusado' ? cores.warning : cores.accentLight;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => nav.navigate('VimDeOutroApp')}
      accessibilityRole="button"
      accessibilityLabel={`${resumo.titulo}. ${resumo.texto}`}
    >
      <MaterialCommunityIcons name={icone} size={24} color={cor} />
      <View style={styles.textos}>
        <Text style={styles.titulo}>{resumo.titulo}</Text>
        <Text style={styles.texto}>{resumo.texto}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceVariant} />
    </TouchableOpacity>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
      backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline,
      padding: Spacing.base, marginBottom: Spacing.base,
    },
    textos: { flex: 1, gap: 2 },
    titulo: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.onSurface },
    texto: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant, lineHeight: 18 },
  });
