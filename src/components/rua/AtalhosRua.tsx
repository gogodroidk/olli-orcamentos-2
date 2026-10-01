/**
 * ATALHOS DE 1 TOQUE do Painel da Rua: o que o prestador faz de pé, no cliente
 * (Orçar, Recibo, Agendar, Clientes). Toque com escala + háptico leve
 * (PressableAnimado, UI thread); "Reduzir movimento" tira a escala e mantém o
 * retorno de opacidade.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, useEstilos, type Cores } from '../../theme';
import { PressableAnimado } from '../motion/PressableAnimado';

export interface Atalho {
  chave: string;
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  rotulo: string;
  /** O que o leitor de tela anuncia (o rótulo curto nem sempre basta). */
  descricao: string;
  cor: string;
  onPress: () => void;
}

export function AtalhosRua({ atalhos }: { atalhos: Atalho[] }) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.grade}>
      {atalhos.map(a => (
        <PressableAnimado
          key={a.chave}
          style={styles.tile}
          onPress={a.onPress}
          haptic="light"
          accessibilityLabel={a.descricao}
        >
          <View style={[styles.icone, { backgroundColor: comAlfa(a.cor, 0.14), borderColor: comAlfa(a.cor, 0.3) }]}>
            <MaterialCommunityIcons name={a.icone} size={24} color={a.cor} />
          </View>
          <Text style={styles.rotulo} numberOfLines={1}>{a.rotulo}</Text>
        </PressableAnimado>
      ))}
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  grade: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.base },
  tile: {
    flex: 1, alignItems: 'center', minHeight: 92, justifyContent: 'center',
    paddingVertical: Spacing.md, borderRadius: BorderRadius.lg,
    backgroundColor: c.surfaceGlass, borderWidth: 1, borderColor: c.outlineDark,
  },
  icone: { width: 48, height: 48, borderRadius: BorderRadius.chip, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  rotulo: { fontSize: 12.5, fontWeight: '700', color: c.onSurface, marginTop: 8 },
});
