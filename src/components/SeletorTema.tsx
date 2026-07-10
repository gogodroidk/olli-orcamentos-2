import React from 'react';
import { View, Text, StyleSheet, Switch, Platform, AccessibilityInfo } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  BorderRadius, Spacing, useCores, useEstilos, useTema, sombrasDe, comAlfa,
  textoSobre, COR_MARCA_PADRAO, type Cores,
} from '../theme';
import { OlliPressable } from './OlliPressable';

/**
 * Aparência: modo claro/escuro e cor da marca.
 *
 * As cores abaixo NÃO são escolha de gosto. Cada uma foi medida contra a paleta
 * inteira que ela gera — 2 modos × 4 superfícies × 6 tokens de primeiro plano,
 * mais as duas pontas dos três gradientes que carregam texto. O pior par de
 * qualquer uma delas é 4.50:1, que é onde `ajustarParaContraste` para. Uma cor
 * nova só entra nesta lista depois de passar pela mesma medição: o seletor não
 * pode oferecer uma marca que apague o texto do app.
 *
 * O app abre SEMPRE no claro (ver TemaProvider — de propósito não lê
 * `useColorScheme()`), e esta é a única porta para o escuro.
 */
const CORES_MARCA: ReadonlyArray<{ nome: string; hex: string }> = [
  { nome: 'Azul OLLI', hex: COR_MARCA_PADRAO },
  { nome: 'Petróleo', hex: '#0E7490' },
  { nome: 'Esmeralda', hex: '#047857' },
  { nome: 'Verde', hex: '#15803D' },
  { nome: 'Índigo', hex: '#4338CA' },
  { nome: 'Roxo', hex: '#6D28D9' },
  { nome: 'Rosa', hex: '#BE185D' },
  { nome: 'Vinho', hex: '#9F1239' },
  { nome: 'Vermelho', hex: '#DC2626' },
  { nome: 'Laranja', hex: '#C2410C' },
  { nome: 'Terracota', hex: '#B45309' },
  { nome: 'Grafite', hex: '#374151' },
];

export function SeletorTema() {
  const { modo, corMarca, alternarModo, definirCorMarca, restaurarPadrao } = useTema();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const sombras = sombrasDe(cores);
  const escuro = modo === 'escuro';
  const padrao = modo === 'claro' && corMarca.toUpperCase() === COR_MARCA_PADRAO;

  const trocarModo = () => {
    alternarModo();
    // Leitor de tela não percebe uma troca de paleta: ela não muda o foco nem a
    // árvore de acessibilidade, só as cores. O anúncio é o único aviso.
    AccessibilityInfo.announceForAccessibility(
      escuro ? 'Modo claro ativado' : 'Modo escuro ativado',
    );
  };

  return (
    <View style={styles.bloco}>
      <View style={styles.linha}>
        <View style={styles.linhaIcone}>
          <MaterialCommunityIcons
            name={escuro ? 'weather-night' : 'white-balance-sunny'}
            size={20}
            color={cores.accentLight}
          />
        </View>
        <View style={styles.linhaTexto}>
          <Text style={styles.titulo}>Modo escuro</Text>
          <Text style={styles.sub}>{escuro ? 'Ligado' : 'Desligado'}</Text>
        </View>
        <Switch
          value={escuro}
          onValueChange={trocarModo}
          trackColor={{ false: cores.outlineDark, true: comAlfa(cores.primary, 0.55) }}
          thumbColor={escuro ? cores.primary : cores.surface}
          // No Android o thumb padrão fica cinza sobre o track colorido; no iOS o
          // componente ignora estas props e usa o visual do sistema.
          ios_backgroundColor={cores.outlineDark}
          accessibilityRole="switch"
          accessibilityLabel="Modo escuro"
        />
      </View>

      <View style={styles.divisor} />

      <Text style={styles.titulo}>Cor da marca</Text>
      <Text style={styles.sub}>
        Vale para o app, os cabeçalhos e os botões. O PDF do cliente segue claro sempre.
      </Text>

      <View style={styles.grade}>
        {CORES_MARCA.map((c) => {
          const ativa = c.hex.toUpperCase() === corMarca.toUpperCase();
          return (
            <OlliPressable
              key={c.hex}
              onPress={() => definirCorMarca(c.hex)}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={`Cor da marca: ${c.nome}`}
              accessibilityState={{ selected: ativa }}
              style={[
                styles.amostra,
                { backgroundColor: c.hex },
                ativa && { borderColor: cores.onSurface, borderWidth: 3 },
                ativa && sombras.sm,
              ]}
            >
              {/* O tique é branco ou tinta conforme a própria amostra — cravar
                  branco sumiria sobre o amarelo. Mesma regra do resto do tema. */}
              {ativa ? (
                <MaterialCommunityIcons name="check-bold" size={16} color={textoSobre(c.hex)} />
              ) : null}
            </OlliPressable>
          );
        })}
      </View>

      {!padrao ? (
        <OlliPressable
          onPress={restaurarPadrao}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="Voltar ao tema padrão"
          style={styles.restaurar}
        >
          <MaterialCommunityIcons name="restore" size={16} color={cores.accentLight} />
          <Text style={styles.restaurarTexto}>Voltar ao padrão (claro, azul OLLI)</Text>
        </OlliPressable>
      ) : null}
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  bloco: {
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: c.outline,
  },
  linha: { flexDirection: 'row', alignItems: 'center' },
  linhaIcone: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  linhaTexto: { flex: 1, marginLeft: Spacing.md },
  titulo: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  sub: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2 },
  divisor: { height: 1, backgroundColor: c.outline, marginVertical: Spacing.base },
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.md,
    // `gap` existe no RN 0.71+ e no react-native-web; substitui a ginástica de
    // margens negativas que o restante do repo ainda usa.
    gap: Spacing.md,
  },
  amostra: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.outlineDark,
    // No web o cursor precisa dizer que é clicável.
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as never } : null),
  },
  restaurar: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: Spacing.base, paddingVertical: Spacing.sm,
  },
  restaurarTexto: { fontSize: 13, fontWeight: '600', color: c.accentLight, marginLeft: 6 },
});
