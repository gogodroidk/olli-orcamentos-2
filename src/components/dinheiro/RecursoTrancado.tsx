/**
 * Linha "Disponível no Pro" para peças de inteligência que vivem DENTRO de um
 * modal (a OS abre em tela cheia por cima da navegação) ou em cartões pequenos.
 *
 * Só INFORMA — sem botão de compra: dentro do modal o "Ver o plano" abriria a
 * tela de planos por baixo dele, e nas lojas (Play/iOS) o app não oferece plano
 * por fora. Os 3 estados do plano chegam inteiros (memória "erro vira vazio"):
 * carregando → esqueleto; indeterminado → "não consegui confirmar" + tentar de
 * novo; bloqueado → "Disponível no Pro". Liberado/em breve → `null` (quem chama
 * renderiza o recurso).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../../theme';
import { useRecursoPlano } from '../RecursoPlano';
import { PressableAnimado } from '../motion/PressableAnimado';
import { Skeleton } from '../motion/Skeleton';
import { NOME_PLANO } from '../../services/planosBase';
import type { Recurso } from '../../services/entitlements';

interface Props {
  recurso: Recurso;
  /** Nome do recurso na tela ("Lucro real da visita"). */
  titulo: string;
  /** O benefício em 1 frase. */
  beneficio: string;
}

export function RecursoTrancado({ recurso, titulo, beneficio }: Props) {
  const { estado, planoMinimo, recarregar } = useRecursoPlano(recurso);
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  if (estado === 'liberado' || estado === 'em_breve') return null;
  if (estado === 'carregando') {
    return (
      <View style={styles.caixa} accessibilityLabel="Conferindo seu plano">
        <Skeleton width="55%" height={14} />
        <Skeleton width="85%" height={12} style={{ marginTop: 6 }} />
      </View>
    );
  }
  if (estado === 'indeterminado') {
    return (
      <View style={styles.caixa}>
        <Text style={styles.titulo}>{titulo}</Text>
        <Text style={styles.texto}>Não consegui confirmar seu plano agora. Isso não quer dizer que a assinatura acabou.</Text>
        <PressableAnimado onPress={() => void recarregar()} haptic="selection" hitSlop={8} accessibilityLabel="Tentar confirmar o plano de novo">
          <Text style={styles.acao}>Tentar de novo</Text>
        </PressableAnimado>
      </View>
    );
  }
  return (
    <View style={styles.caixa} accessibilityLabel={`${titulo}. Disponível no ${NOME_PLANO[planoMinimo]}. ${beneficio}`}>
      <View style={styles.linha}>
        <MaterialCommunityIcons name="crown-outline" size={15} color={cores.accentLight} />
        <Text style={styles.selo}>DISPONÍVEL NO {NOME_PLANO[planoMinimo].toUpperCase()}</Text>
      </View>
      <Text style={styles.titulo}>{titulo}</Text>
      <Text style={styles.texto}>{beneficio}</Text>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    caixa: {
      backgroundColor: c.surfaceGlass,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: c.outlineDark,
      padding: Spacing.md,
      gap: 4,
    },
    linha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    selo: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: c.accentLight },
    titulo: { fontSize: 14, fontWeight: '700', color: c.onSurface },
    texto: { fontSize: 12.5, lineHeight: 17, color: c.onSurfaceVariant },
    acao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight, marginTop: 4 },
  });
