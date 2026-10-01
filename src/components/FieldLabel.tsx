/**
 * Rótulo de campo de formulário. Mesma tipografia do rótulo do <OlliInput>
 * (13, extraBold, onSurfaceVariant): antes a Agenda tinha "Nome do cliente" em
 * 800 e "Cliente"/"Data"/"Início" em 600, lado a lado no mesmo formulário.
 * Use este componente para todo rótulo que não venha de dentro do OlliInput.
 */
import type { ReactNode } from 'react';
import { Text, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { Fonts, useEstilos, type Cores } from '../theme';

export function FieldLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const styles = useEstilos(criarEstilos);
  return <Text style={[styles.label, style]}>{children}</Text>;
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    label: { fontSize: 13, fontFamily: Fonts.extraBold, color: c.onSurfaceVariant, marginBottom: 7 },
  });
