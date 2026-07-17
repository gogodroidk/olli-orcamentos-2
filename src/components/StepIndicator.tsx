import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, useCores, useEstilos, useGradientes, textoSobre, sobreSecundario, type Cores } from '../theme';

interface Props {
  steps: string[];
  current: number;
}

/** Indicador de passos desenhado para fundo em gradiente (texto claro). */
export function StepIndicator({ steps, current }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const gradientes = useGradientes();
  // Número e rótulo (inativos) ficam dentro/sob o header em gradiente — o círculo
  // é só um véu translúcido por cima dele (não uma superfície própria). Um
  // 'rgba(255,255,255,0.8|0.65)' cravado caía a 3.79:1/3.03:1 na ponta clara do
  // header no modo claro (#0B6FCE); sobreSecundario() rebaixa só até onde as duas
  // pontas do gradiente ainda passam 4.5:1.
  const corNum = sobreSecundario(gradientes.sobreHeader, gradientes.header);
  const corLabel = sobreSecundario(gradientes.sobreHeader, gradientes.header, 0.65);
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
                  <MaterialCommunityIcons name="check" size={15} color={textoSobre(cores.success)} />
                ) : (
                  <Text style={[styles.num, { color: corNum }, active && styles.numActive]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[styles.label, { color: corLabel }, (active || done) && styles.labelActive]} numberOfLines={1}>{label}</Text>
            </View>
            {i < steps.length - 1 && <View style={[styles.line, done && styles.lineDone]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    container: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: Spacing.base, paddingHorizontal: 2 },
    group: { alignItems: 'center', flex: 1, minWidth: 42 },
    // Desenhado sempre sobre o gradiente do header (claro ou escuro) — branco
    // translúcido fixo, não é superfície do app (mesmo padrão do GradientHeader).
    circle: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.32)',
      justifyContent: 'center', alignItems: 'center', marginBottom: 5,
    },
    circleDone: { backgroundColor: c.success, borderColor: c.success },
    circleActive: { backgroundColor: c.accentLight, borderColor: c.accentLight },
    // Sem `color` aqui: esta fábrica só recebe `Cores`, não os gradientes — a cor
    // do número (inativo) depende do par claro/escuro do header e é aplicada
    // inline no ponto de uso via sobreSecundario(gradientes.sobreHeader, ...).
    num: { fontSize: 13, fontWeight: '800' },
    // accentLight clareia no escuro (pede tinta escura) e escurece no claro
    // (pediria tinta clara) — textoSobre() acerta os dois casos, ao contrário
    // do antigo `primaryDark` fixo.
    numActive: { color: textoSobre(c.accentLight) },
    // Idem: cor do rótulo (inativo) aplicada inline — ver corLabel no componente.
    label: { alignSelf: 'stretch', fontSize: 10, textAlign: 'center', fontWeight: '700' },
    labelActive: { color: '#fff' },
    line: { flex: 0.55, height: 2, backgroundColor: 'rgba(255,255,255,0.24)', marginTop: 16, marginHorizontal: 1, borderRadius: 1 },
    lineDone: { backgroundColor: c.success },
  });
