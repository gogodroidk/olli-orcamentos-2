import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing } from '../theme';

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
  container: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: Spacing.base, paddingHorizontal: 2 },
  group: { alignItems: 'center', flex: 1, minWidth: 42 },
  circle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.32)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 5,
  },
  circleDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  circleActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accentLight },
  num: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.8)' },
  numActive: { color: Colors.primaryDark },
  label: { alignSelf: 'stretch', fontSize: 10, color: 'rgba(255,255,255,0.65)', textAlign: 'center', fontWeight: '700' },
  labelActive: { color: '#fff' },
  line: { flex: 0.55, height: 2, backgroundColor: 'rgba(255,255,255,0.24)', marginTop: 16, marginHorizontal: 1, borderRadius: 1 },
  lineDone: { backgroundColor: Colors.success },
});
