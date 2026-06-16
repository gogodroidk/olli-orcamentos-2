import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing } from '../theme';

interface Props {
  steps: string[];
  current: number;
}

/** Indicador de passos desenhado para fundo em gradiente (texto claro). */
export function StepIndicator({ steps, current }: Props) {
  return (
    <View style={styles.container}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            <View style={styles.group}>
              <View style={[styles.circle, done && styles.circleDone, active && styles.circleActive]}>
                {done ? (
                  <MaterialCommunityIcons name="check" size={15} color="#fff" />
                ) : (
                  <Text style={[styles.num, active && styles.numActive]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[styles.label, (active || done) && styles.labelActive]} numberOfLines={1}>{label}</Text>
            </View>
            {i < steps.length - 1 && <View style={[styles.line, done && styles.lineDone]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: Spacing.base, paddingHorizontal: 4 },
  group: { alignItems: 'center', width: 62 },
  circle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 5,
  },
  circleDone: { backgroundColor: '#2ECC71', borderColor: '#2ECC71' },
  circleActive: { backgroundColor: '#fff', borderColor: '#fff' },
  num: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.8)' },
  numActive: { color: '#1565C0' },
  label: { fontSize: 10.5, color: 'rgba(255,255,255,0.65)', textAlign: 'center', fontWeight: '600' },
  labelActive: { color: '#fff' },
  line: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 15, marginHorizontal: 2 },
  lineDone: { backgroundColor: '#2ECC71' },
});
