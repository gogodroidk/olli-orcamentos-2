import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, comAlfa, type Cores } from '../theme';
import { OlliPressable } from './OlliPressable';
import { Cliente } from '../types';

interface Props {
  duplicados: Cliente[];
  /**
   * A LEITURA da lista usada para checar duplicidade falhou (3º estado —
   * nunca colapsar erro em "não tem duplicata"; mesmo texto/comportamento do
   * painel web). Ignorado quando `duplicados` já tem itens.
   */
  erro?: boolean;
  /** Abre o cadastro existente no lugar do que está sendo digitado. Some o botão "Abrir" se ausente. */
  onAbrirExistente?: (c: Cliente) => void;
}

/**
 * Aviso NÃO BLOQUEANTE de cliente duplicado — mesmo comportamento do painel
 * web (webapp `FormCliente`): mostra quem já existe com telefone ou CPF/CNPJ
 * batendo e oferece abrir o cadastro existente. Cadastrar mesmo assim
 * continua liberado — dois clientes podem legitimamente dividir telefone.
 */
export function AvisoClienteDuplicado({ duplicados, erro, onAbrirExistente }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  if (duplicados.length === 0) {
    // Erro de verdade (a checagem não rodou) — nunca finge que está tudo
    // limpo: mesma frase do painel web (FormCliente).
    if (!erro) return null;
    return (
      <View style={styles.erroRow}>
        <MaterialCommunityIcons name="alert-circle-outline" size={13} color={cores.onSurfaceMuted} />
        <Text style={styles.erroText}>Não consegui verificar se este cliente já existe. O cadastro continua funcionando.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card} accessibilityRole="alert">
      <View style={styles.head}>
        <MaterialCommunityIcons name="account-search-outline" size={16} color={cores.warning} />
        <Text style={styles.headText}>
          {duplicados.length === 1 ? 'Já existe um cliente com esses dados' : 'Já existem clientes com esses dados'}
        </Text>
      </View>

      {duplicados.map(d => (
        <View key={d.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowNome} numberOfLines={1}>{d.nome}</Text>
            {d.telefone ? <Text style={styles.rowInfo}>{d.telefone}</Text> : null}
          </View>
          {onAbrirExistente && (
            <OlliPressable
              onPress={() => onAbrirExistente(d)}
              style={styles.rowBtn}
              accessibilityLabel={`Abrir cadastro de ${d.nome}`}
            >
              <Text style={styles.rowBtnText}>Abrir</Text>
            </OlliPressable>
          )}
        </View>
      ))}

      <Text style={styles.rodape}>Você pode cadastrar assim mesmo — dois clientes podem dividir o mesmo telefone.</Text>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  card: {
    backgroundColor: c.warningLight,
    borderWidth: 1,
    borderColor: comAlfa(c.warning, 0.35),
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.base,
    gap: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headText: { flex: 1, fontSize: 13, fontWeight: '800', color: c.onSurface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowNome: { fontSize: 13, fontWeight: '700', color: c.onSurface },
  rowInfo: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 1 },
  rowBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.warning },
  rowBtnText: { fontSize: 12, fontWeight: '800', color: c.warning },
  rodape: { fontSize: 11, color: c.onSurfaceVariant, lineHeight: 15 },
  erroRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.base },
  erroText: { flex: 1, fontSize: 11, color: c.onSurfaceVariant, lineHeight: 15 },
});
