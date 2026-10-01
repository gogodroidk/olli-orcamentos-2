import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../../theme';
import { PressableAnimado } from '../motion';

interface Props {
  valor: string;
  aoMudar: (texto: string) => void;
}

/** Campo "Buscar ajuste" do topo da Conta. O X limpa e devolve a tela inteira. */
export function CampoBuscaAjuste({ valor, aoMudar }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.campo}>
      <MaterialCommunityIcons name="magnify" size={19} color={cores.onSurfaceMuted} />
      <TextInput
        value={valor}
        onChangeText={aoMudar}
        placeholder="Buscar ajuste"
        placeholderTextColor={cores.onSurfaceMuted}
        style={styles.input}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel="Buscar ajuste"
      />
      {valor ? (
        <PressableAnimado
          onPress={() => aoMudar('')}
          haptic="selection"
          hitSlop={10}
          accessibilityLabel="Limpar busca"
        >
          <MaterialCommunityIcons name="close-circle" size={18} color={cores.onSurfaceMuted} />
        </PressableAnimado>
      ) : null}
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    campo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.surfaceGlass,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: c.outlineDark,
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.base,
      paddingHorizontal: Spacing.md,
      minHeight: 44,
    },
    input: { flex: 1, fontSize: 15, color: c.onSurface, paddingVertical: Spacing.sm },
  });
