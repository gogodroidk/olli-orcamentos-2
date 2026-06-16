import React, { useState } from 'react';
import { View, Text, Switch, ScrollView, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { Orcamento } from '../types';
import { formatCurrency } from '../utils/currency';

interface Props {
  orc: Orcamento;
  onChange: (partial: Partial<Orcamento>) => void;
}

const SwitchRow = ({ label, hint, value, onValueChange }: {
  label: string; hint?: string; value: boolean; onValueChange: (v: boolean) => void;
}) => (
  <View style={styles.switchRow}>
    <View style={{ flex: 1 }}>
      <Text style={styles.switchLabel}>{label}</Text>
      {hint && <Text style={styles.switchHint}>{hint}</Text>}
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: Colors.outline, true: Colors.primary + '80' }}
      thumbColor={value ? Colors.primary : '#fff'}
    />
  </View>
);

export default function Step4Personalizacao({ orc, onChange }: Props) {
  const [sigMode, setSigMode] = useState<'draw' | null>(null);

  async function pickFoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à sua galeria de fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      onChange({ fotosServico: [...(orc.fotosServico ?? []), uri] });
    }
  }

  function removeFoto(idx: number) {
    const updated = (orc.fotosServico ?? []).filter((_, i) => i !== idx);
    onChange({ fotosServico: updated });
  }

  const Summary = () => (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Resumo do orçamento</Text>
      <View style={styles.summaryRow}><Text style={styles.summaryKey}>Cliente</Text><Text style={styles.summaryVal}>{orc.clienteNome}</Text></View>
      <View style={styles.summaryRow}><Text style={styles.summaryKey}>Itens</Text><Text style={styles.summaryVal}>{orc.itens.length} item(s)</Text></View>
      {orc.subtotalServicos > 0 && <View style={styles.summaryRow}><Text style={styles.summaryKey}>Serviços</Text><Text style={styles.summaryVal}>{formatCurrency(orc.subtotalServicos)}</Text></View>}
      {orc.subtotalProdutos > 0 && <View style={styles.summaryRow}><Text style={styles.summaryKey}>Produtos</Text><Text style={styles.summaryVal}>{formatCurrency(orc.subtotalProdutos)}</Text></View>}
      {orc.desconto > 0 && <View style={styles.summaryRow}><Text style={styles.summaryKey}>Desconto</Text><Text style={[styles.summaryVal, { color: Colors.danger }]}>-{formatCurrency(orc.desconto)}</Text></View>}
      <View style={[styles.summaryRow, styles.summaryTotal]}>
        <Text style={styles.summaryTotalKey}>Total</Text>
        <Text style={styles.summaryTotalVal}>{formatCurrency(orc.valorTotal)}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Summary />

      <Text style={styles.sectionTitle}>Assinatura digital</Text>
      <SwitchRow
        label="Exibir assinatura do prestador"
        hint="Sua assinatura aparecerá no PDF"
        value={orc.exibirAssinatura}
        onValueChange={v => onChange({ exibirAssinatura: v })}
      />
      <SwitchRow
        label="Solicitar assinatura do cliente"
        hint="Cliente assina o orçamento no PDF"
        value={orc.solicitarAssinaturaCliente}
        onValueChange={v => onChange({ solicitarAssinaturaCliente: v })}
      />

      <Text style={styles.sectionTitle}>Aprovação</Text>
      <SwitchRow
        label="Botão de aprovar orçamento"
        hint="Cliente pode aprovar pelo PDF"
        value={orc.exibirAprovacao}
        onValueChange={v => onChange({ exibirAprovacao: v })}
      />
      <SwitchRow
        label="Botão de recusar orçamento"
        hint="Cliente pode recusar pelo PDF"
        value={orc.exibirRecusa}
        onValueChange={v => onChange({ exibirRecusa: v })}
      />

      <Text style={styles.sectionTitle}>Fotos do serviço</Text>
      <Text style={styles.sectionHint}>Adicione fotos do local ou equipamento para documentar.</Text>
      <View style={styles.fotosGrid}>
        {(orc.fotosServico ?? []).map((uri, idx) => (
          <View key={idx} style={styles.fotoItem}>
            <Image source={{ uri }} style={styles.fotoImg} />
            <TouchableOpacity style={styles.fotoRemove} onPress={() => removeFoto(idx)}>
              <MaterialCommunityIcons name="close-circle" size={20} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addFotoBtn} onPress={pickFoto}>
          <MaterialCommunityIcons name="camera-plus-outline" size={28} color={Colors.primary} />
          <Text style={styles.addFotoLabel}>Adicionar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.previewNote}>
        <MaterialCommunityIcons name="information-outline" size={18} color={Colors.primary} />
        <Text style={styles.previewNoteText}>
          Toque em "Gerar Orçamento" para criar o PDF profissional com todas as informações preenchidas.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.base },
  summaryCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.lg, ...Shadow.md,
    borderLeftWidth: 4, borderLeftColor: Colors.primary,
  },
  summaryTitle: { fontSize: 15, fontWeight: '800', color: Colors.primary, marginBottom: Spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  summaryKey: { fontSize: 13, color: Colors.onSurfaceVariant },
  summaryVal: { fontSize: 13, fontWeight: '600', color: Colors.onSurface },
  summaryTotal: { borderBottomWidth: 0, marginTop: 4 },
  summaryTotalKey: { fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  summaryTotalVal: { fontSize: 18, fontWeight: '800', color: Colors.primary },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.onSurface, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  sectionHint: { fontSize: 12, color: Colors.onSurfaceVariant, marginBottom: Spacing.sm },

  switchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.base, marginBottom: 8, ...Shadow.sm,
  },
  switchLabel: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  switchHint: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },

  fotosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fotoItem: { position: 'relative' },
  fotoImg: { width: 80, height: 80, borderRadius: BorderRadius.md },
  fotoRemove: { position: 'absolute', top: -8, right: -8 },
  addFotoBtn: {
    width: 80, height: 80, borderRadius: BorderRadius.md,
    borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  addFotoLabel: { fontSize: 10, color: Colors.primary, fontWeight: '600', marginTop: 2 },

  previewNote: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.primaryContainer, borderRadius: BorderRadius.md,
    padding: Spacing.base, marginTop: Spacing.xl, gap: 8,
  },
  previewNoteText: { flex: 1, fontSize: 13, color: Colors.primary, lineHeight: 18 },
});
