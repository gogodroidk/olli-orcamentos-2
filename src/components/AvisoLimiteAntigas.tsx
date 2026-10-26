/**
 * AvisoLimiteAntigas — banner dispensável: "A partir de {D+30} o Grátis passa a permitir até 5 envios por mês.
 * Você usou N nos últimos 30 dias." (conta anterior ao corte). Presentacional: recebe o resultado de
 * `useAvisoLimiteAntigas()`. carregando/indisponível/pronto sem aviso = nada (o formal vai por e-mail no dia D).
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../theme';
import { Aparecer } from './motion';
import type { EstadoAvisoLimiteAntigas } from '../hooks/useAvisoLimiteAntigas';

export function AvisoLimiteAntigas({ estado, onDispensar }: { estado: EstadoAvisoLimiteAntigas; onDispensar: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  if (estado.estado !== 'pronto' || !estado.aviso.mostrar) return null;
  const { texto } = estado.aviso;
  return (
    <Aparecer>
      <View style={styles.caixa} accessible accessibilityRole="summary" accessibilityLabel={texto}>
        <MaterialCommunityIcons name="information-outline" size={18} color={cores.onSurfaceVariant} />
        <Text style={styles.texto}>{texto}</Text>
        <TouchableOpacity onPress={onDispensar} accessibilityRole="button" accessibilityLabel="Entendi, dispensar aviso" hitSlop={8} style={styles.hit}>
          <Text style={styles.acao}>Entendi</Text>
        </TouchableOpacity>
      </View>
    </Aparecer>
  );
}

function criarEstilos(c: Cores) {
  return StyleSheet.create({
    caixa: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.outline,
      backgroundColor: c.surfaceVariant,
    },
    texto: { flex: 1, fontSize: 13, fontWeight: '600', color: c.onSurfaceVariant },
    hit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.sm },
    acao: { fontSize: 13, fontWeight: '700', color: c.primary },
  });
}
