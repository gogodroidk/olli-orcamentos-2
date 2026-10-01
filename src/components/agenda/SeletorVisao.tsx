import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BorderRadius } from '../../theme';
import { MOLA, useReduzirMovimento } from '../../theme/motion';
import { vibrar } from '../../utils/haptico';
import type { VisaoAgenda } from '../../utils/agendaVisual';

const OPCOES: { chave: VisaoAgenda; rotulo: string }[] = [
  { chave: 'dia', rotulo: 'Dia' },
  { chave: 'semana', rotulo: 'Semana' },
  { chave: 'mes', rotulo: 'Mês' },
];

/**
 * Controle segmentado Dia | Semana | Mês (estilo iOS) dentro do cabeçalho em
 * gradiente: a "pílula" de seleção desliza com mola (só translateX); com
 * "Reduzir movimento" ela troca de lugar na hora. `corTexto` vem do gradiente
 * (`sobreHeader`), não das superfícies do tema.
 */
export function SeletorVisao({ valor, onChange, corTexto }: {
  valor: VisaoAgenda;
  onChange: (v: VisaoAgenda) => void;
  corTexto: string;
}) {
  const reduzir = useReduzirMovimento();
  const [largura, setLargura] = useState(0);
  const indice = OPCOES.findIndex((o) => o.chave === valor);
  const x = useSharedValue(0);
  const segmento = largura > 0 ? (largura - 4) / OPCOES.length : 0;

  useEffect(() => {
    const alvo = indice * segmento;
    x.set(reduzir || segmento === 0 ? alvo : withSpring(alvo, MOLA.snappy));
  }, [indice, segmento, reduzir, x]);

  const estiloPilula = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      style={styles.trilho}
      onLayout={(e: LayoutChangeEvent) => setLargura(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {segmento > 0 ? <Animated.View style={[styles.pilula, { width: segmento }, estiloPilula]} /> : null}
      {OPCOES.map((o) => {
        const ativo = o.chave === valor;
        return (
          <Pressable
            key={o.chave}
            style={styles.botao}
            onPress={() => { if (!ativo) { vibrar('selecao'); onChange(o.chave); } }}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
            accessibilityLabel={`Ver por ${o.rotulo.toLowerCase()}`}
            hitSlop={{ top: 4, bottom: 4 }}
          >
            <Text style={[styles.texto, { color: corTexto, opacity: ativo ? 1 : 0.78 }]}>{o.rotulo}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Branco translúcido fixo: vive sobre o GradientHeader (banner sempre colorido/escuro).
const styles = StyleSheet.create({
  trilho: {
    flexDirection: 'row', alignSelf: 'stretch', marginTop: 12, padding: 2, minHeight: 40,
    borderRadius: BorderRadius.full, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  pilula: {
    position: 'absolute', top: 2, bottom: 2, left: 2,
    borderRadius: BorderRadius.full, backgroundColor: 'rgba(255,255,255,0.22)',
  },
  botao: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36 },
  texto: { fontSize: 13, fontWeight: '800' },
});
