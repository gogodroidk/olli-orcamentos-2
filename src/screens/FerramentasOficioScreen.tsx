import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Fonts, BorderRadius, useCores, useEstilos, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliInput } from '../components/OlliInput';
import { OlliButton } from '../components/OlliButton';
import { OlliCard } from '../components/OlliCard';
import { calculosDoOficio, type CalculoOficio, type CampoCalc } from '../services/calculosOficio';
import { useVerticais } from '../hooks/useVerticais';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * FerramentasOficioScreen — o HUB de calculadoras por ofício (motor em
 * services/calculosOficio.ts). Lê a vertical da empresa (useVerticais) e mostra
 * SÓ as calculadoras do ramo: HVAC vê BTU e carga de gás; pintura vê massa;
 * hidráulica vê caixa d'água; e assim por diante. Cada uma é um formulário que
 * calcula ao vivo e, quando faz sentido, vira item de orçamento — o mesmo padrão
 * da Calculadora de tinta, agora escalável (adicionar ferramenta = 1 objeto no
 * serviço, sem nova tela/rota). O atalho para cá some para ofícios sem calculadora.
 */

/** Valores iniciais de um cálculo: default do campo, senão 1ª opção / vazio. */
function valoresIniciais(calc: CalculoOficio): Record<string, string> {
  const v: Record<string, string> = {};
  for (const campo of calc.campos) {
    v[campo.key] = campo.default ?? (campo.tipo === 'opcao' ? campo.opcoes?.[0]?.v ?? '' : '');
  }
  return v;
}

export default function FerramentasOficioScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { verticais } = useVerticais();

  const lista = useMemo(() => calculosDoOficio(verticais?.[0]), [verticais]);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});

  const calc = useMemo(() => lista.find((c) => c.id === abertoId) ?? null, [lista, abertoId]);
  const resultado = useMemo(() => (calc ? calc.calcular(valores) : null), [calc, valores]);

  function abrir(c: CalculoOficio) {
    setValores(valoresIniciais(c));
    setAbertoId(c.id);
  }

  function adicionarAoOrcamento() {
    const item = resultado?.itemOrcamento;
    if (!item) return;
    nav.navigate('NovoOrcamento', {
      prefillItem: { tipo: 'produto', nome: item.nome, descricao: item.descricao },
    });
  }

  return (
    <View style={styles.tela}>
      <GradientHeader
        title={calc ? calc.nome : 'Ferramentas do ofício'}
        subtitle={calc ? calc.descricao : 'Cálculos técnicos do seu ramo'}
        onBack={() => (calc ? setAbertoId(null) : goBackOrHome(nav))}
      />

      {calc ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <OlliCard style={styles.card}>
              {calc.campos.map((campo) => (
                <CampoView
                  key={campo.key}
                  campo={campo}
                  valor={valores[campo.key] ?? ''}
                  onChange={(v) => setValores((prev) => ({ ...prev, [campo.key]: v }))}
                  cores={cores}
                  styles={styles}
                />
              ))}
            </OlliCard>

            {resultado ? (
              <OlliCard style={styles.resultado} padding={Spacing.lg}>
                {resultado.linhas.map((linha, i) => (
                  <View key={i} style={styles.resLinha}>
                    <Text style={styles.resLabel}>{linha.label}</Text>
                    <Text style={[styles.resValor, linha.destaque && styles.resValorDestaque]}>{linha.valor}</Text>
                  </View>
                ))}

                {resultado.resumo ? <Text style={styles.resumo}>{resultado.resumo}</Text> : null}

                {resultado.itemOrcamento ? (
                  <OlliButton
                    label="Adicionar ao orçamento"
                    icon={<MaterialCommunityIcons name="plus" size={18} color="#fff" />}
                    variant="gradient"
                    fullWidth
                    onPress={adicionarAoOrcamento}
                    style={styles.cta}
                  />
                ) : null}
              </OlliCard>
            ) : null}

            {resultado?.aviso ? (
              <View style={styles.aviso}>
                <MaterialCommunityIcons name="information-outline" size={16} color={cores.warning} />
                <Text style={styles.avisoTxt}>{resultado.aviso}</Text>
              </View>
            ) : null}

            <Text style={styles.base}>{calc.base}</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {lista.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => abrir(c)}
              style={({ pressed }) => [styles.itemCard, pressed && styles.itemCardPress]}
              accessibilityRole="button"
              accessibilityLabel={c.nome}
            >
              <View style={styles.itemIcone}>
                <MaterialCommunityIcons name={c.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={24} color={cores.accentLight} />
              </View>
              <View style={styles.itemTexto}>
                <Text style={styles.itemNome}>{c.nome}</Text>
                <Text style={styles.itemDesc}>{c.descricao}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={cores.onSurfaceVariant} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** Um campo do formulário: número (OlliInput) ou opção (chips). */
function CampoView({
  campo, valor, onChange, cores, styles,
}: {
  campo: CampoCalc;
  valor: string;
  onChange: (v: string) => void;
  cores: Cores;
  styles: ReturnType<typeof criarEstilos>;
}) {
  if (campo.tipo === 'opcao') {
    return (
      <View style={styles.opcaoBloco}>
        <Text style={styles.opcaoLabel}>{campo.label}</Text>
        <View style={styles.chips}>
          {(campo.opcoes ?? []).map((op) => {
            const ativo = valor === op.v;
            return (
              <Pressable
                key={op.v}
                onPress={() => onChange(op.v)}
                style={[styles.chip, ativo && styles.chipAtivo]}
                accessibilityRole="button"
                accessibilityState={{ selected: ativo }}
                accessibilityLabel={op.label}
              >
                <Text style={[styles.chipTxt, ativo && styles.chipTxtAtivo]}>{op.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }
  const label = campo.sufixo ? `${campo.label} (${campo.sufixo})` : campo.label;
  return (
    <OlliInput
      label={label}
      value={valor}
      onChangeText={onChange}
      keyboardType="numeric"
      placeholder={campo.placeholder}
    />
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    scroll: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing.xxxl },
    card: { gap: Spacing.md },

    // lista de calculadoras do ofício
    itemCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      backgroundColor: c.surface,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: c.outline,
      padding: Spacing.base,
    },
    itemCardPress: { backgroundColor: c.surfacePressed },
    itemIcone: {
      width: 44, height: 44, borderRadius: BorderRadius.md,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.accentLight + '20',
    },
    itemTexto: { flex: 1, gap: 2 },
    itemNome: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.onSurface },
    itemDesc: { fontSize: 12.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant },

    // campos de opção
    opcaoBloco: { gap: Spacing.xs },
    opcaoLabel: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.onSurfaceVariant },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    chip: {
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: c.outline,
      backgroundColor: c.surface,
    },
    chipAtivo: { backgroundColor: c.accentLight + '22', borderColor: c.accentLight },
    chipTxt: { fontSize: 13, fontFamily: Fonts.medium, color: c.onSurfaceVariant },
    chipTxtAtivo: { color: c.accentLight, fontFamily: Fonts.semiBold },

    // resultado
    resultado: { gap: Spacing.sm },
    resLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
    resLabel: { fontSize: 13.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant, flex: 1 },
    resValor: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.onSurface, textAlign: 'right' },
    resValorDestaque: { fontSize: 22, fontFamily: Fonts.serifBold, color: c.accentLight },
    resumo: {
      fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant,
      marginTop: Spacing.xs, lineHeight: 19,
    },
    cta: { marginTop: Spacing.sm, alignSelf: 'stretch' },

    aviso: {
      flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
      backgroundColor: c.warning + '14',
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
    },
    avisoTxt: { flex: 1, fontSize: 12.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant, lineHeight: 18 },
    base: { fontSize: 11.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant, opacity: 0.8, lineHeight: 17 },
  });
