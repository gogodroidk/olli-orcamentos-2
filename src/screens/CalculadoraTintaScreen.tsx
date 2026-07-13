import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Fonts, useCores, useEstilos, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliInput } from '../components/OlliInput';
import { OlliButton } from '../components/OlliButton';
import { OlliCard } from '../components/OlliCard';
import { calcularTinta, resumoTinta } from '../services/calculadoras';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Calculadora de tinta — a 1ª FERRAMENTA ÚNICA por vertical (ofício de pintura).
 * É o espelho do Diagnóstico (exclusivo de HVAC): aparece em "Ferramentas" só para
 * quem escolheu o ofício de pintura (gate em ContaScreen via `vertical`). A conta é
 * pura (services/calculadoras.ts) e o resultado VIRA um item de orçamento — o pintor
 * calcula na obra e já emite o orçamento sem abrir planilha nem site de fabricante.
 */

/** "36,5" ou "36.5" → 36.5 (aceita vírgula BR). Vazio/inválido → 0. */
function num(s: string): number {
  const n = parseFloat((s ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export default function CalculadoraTintaScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const [area, setArea] = useState('');
  const [demaos, setDemaos] = useState('2');
  const [rendimento, setRendimento] = useState('10');

  const areaN = num(area);
  const demaosN = Math.max(1, Math.round(num(demaos) || 1));
  const r = useMemo(
    () => calcularTinta(areaN, demaosN, num(rendimento) || 10),
    [areaN, demaosN, rendimento],
  );
  const temResultado = areaN > 0;

  function adicionarAoOrcamento() {
    const areaTxt = r.areaTotalM2.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    const descricao = `${areaTxt} m² · ${demaosN} demão${demaosN > 1 ? 's' : ''} → ${resumoTinta(r)}`;
    nav.navigate('NovoOrcamento', {
      prefillItem: { tipo: 'produto', nome: 'Tinta', descricao, quantidade: r.litros },
    });
  }

  return (
    <View style={styles.tela}>
      <GradientHeader
        title="Calculadora de tinta"
        subtitle="Quanta tinta o serviço precisa"
        onBack={() => goBackOrHome(nav)}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <OlliCard style={styles.card}>
            <OlliInput
              label="Área a pintar (m²)"
              value={area}
              onChangeText={setArea}
              keyboardType="numeric"
              leftIcon="ruler-square"
              placeholder="Ex.: 36"
              helper="Some as paredes e tetos a pintar."
            />
            <OlliInput
              label="Demãos"
              value={demaos}
              onChangeText={setDemaos}
              keyboardType="numeric"
              leftIcon="layers-outline"
              helper="Padrão: 2 demãos."
            />
            <OlliInput
              label="Rendimento (m² por litro, por demão)"
              value={rendimento}
              onChangeText={setRendimento}
              keyboardType="numeric"
              leftIcon="format-paint"
              helper="Acrílica rende ~10 m²/L. Confira a lata da tinta."
            />
          </OlliCard>

          {temResultado ? (
            <OlliCard style={styles.resultado} padding={Spacing.lg}>
              <Text style={styles.resLabel}>Tinta necessária</Text>
              <Text style={styles.resLitros}>{resumoTinta(r)}</Text>
              <View style={styles.resLinha}>
                <MaterialCommunityIcons name="chart-areaspline" size={16} color={cores.onSurfaceVariant} />
                <Text style={styles.resDetalhe}>
                  Área total pintada: {r.areaTotalM2.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m² ({demaosN} demão{demaosN > 1 ? 's' : ''})
                </Text>
              </View>
              <OlliButton
                label="Adicionar ao orçamento"
                icon={<MaterialCommunityIcons name="plus" size={18} color="#fff" />}
                variant="gradient"
                fullWidth
                onPress={adicionarAoOrcamento}
                style={styles.cta}
              />
            </OlliCard>
          ) : (
            <View style={styles.vazio}>
              <MaterialCommunityIcons name="format-paint" size={40} color={cores.onSurfaceVariant} />
              <Text style={styles.vazioTxt}>Informe a área para calcular a tinta.</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    scroll: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing.xxxl },
    card: { gap: Spacing.md },
    resultado: { gap: Spacing.sm, alignItems: 'flex-start' },
    resLabel: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    resLitros: { fontSize: 30, fontFamily: Fonts.serifBold, color: c.accentLight },
    resLinha: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    resDetalhe: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant, flex: 1 },
    cta: { marginTop: Spacing.sm, alignSelf: 'stretch' },
    vazio: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl },
    vazioTxt: { fontSize: 14, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center' },
  });
