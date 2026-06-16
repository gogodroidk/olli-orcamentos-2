import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { Orcamento, FormaPagamento } from '../types';
import { formatCurrency } from '../utils/currency';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';

interface Props {
  orc: Orcamento;
  onChange: (partial: Partial<Orcamento>) => void;
}

const PAYMENT_OPTIONS: Array<{ key: keyof FormaPagamento; label: string; icon: any }> = [
  { key: 'pix', label: 'PIX', icon: 'qrcode' },
  { key: 'credito', label: 'Crédito', icon: 'credit-card' },
  { key: 'debito', label: 'Débito', icon: 'credit-card-outline' },
  { key: 'dinheiro', label: 'Dinheiro', icon: 'cash' },
];

function SectionTitle({ icon, children }: { icon: any; children: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionIconBg}>
        <MaterialCommunityIcons name={icon} size={16} color={Colors.primary} />
      </View>
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
}

export default function Step3Detalhes({ orc, onChange }: Props) {
  function togglePagamento(key: keyof FormaPagamento) {
    onChange({ formasPagamento: { ...orc.formasPagamento, [key]: !orc.formasPagamento[key] } });
  }

  const restante = orc.sinalValor ? orc.valorTotal - orc.sinalValor : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* DATAS */}
      <View style={styles.card}>
        <SectionTitle icon="calendar-month">Datas e agendamento</SectionTitle>
        <OlliInput label="Validade do orçamento" mask="date" value={orc.validadeOrcamento ?? ''} onChangeText={v => onChange({ validadeOrcamento: v })} placeholder="DD/MM/AAAA" leftIcon="calendar-clock" />
        <OlliInput label="Visita técnica" mask="date" value={orc.dataVisitaTecnica ?? ''} onChangeText={v => onChange({ dataVisitaTecnica: v })} placeholder="DD/MM/AAAA" leftIcon="calendar-search" />
        <OlliInput label="Agendamento do serviço" mask="date" value={orc.agendamentoServico ?? ''} onChangeText={v => onChange({ agendamentoServico: v })} placeholder="DD/MM/AAAA" leftIcon="calendar-check" containerStyle={{ marginBottom: 0 }} />
      </View>

      {/* PAGAMENTO */}
      <View style={styles.card}>
        <SectionTitle icon="wallet">Pagamento</SectionTitle>
        <Text style={styles.fieldLabel}>Formas aceitas</Text>
        <View style={styles.paymentGrid}>
          {PAYMENT_OPTIONS.map(opt => {
            const on = orc.formasPagamento[opt.key];
            return (
              <TouchableOpacity key={opt.key} style={[styles.paymentChip, on && styles.paymentChipActive]} onPress={() => togglePagamento(opt.key)} activeOpacity={0.8}>
                <MaterialCommunityIcons name={opt.icon} size={18} color={on ? '#fff' : Colors.onSurfaceVariant} />
                <Text style={[styles.paymentLabel, on && { color: '#fff' }]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {orc.formasPagamento.pix && (
          <OlliInput label="Chave PIX" value={orc.chavePix ?? ''} onChangeText={v => onChange({ chavePix: v })} placeholder="CPF, CNPJ, e-mail ou chave aleatória" leftIcon="key-variant" containerStyle={{ marginTop: 12 }} />
        )}

        <OlliInput label="Condições de pagamento" value={orc.condicoesPagamento ?? ''} onChangeText={v => onChange({ condicoesPagamento: v })} placeholder="Ex: 50% de entrada, restante na entrega" multiline />

        <View style={styles.rowFields}>
          <OlliMoneyInput label="Sinal / entrada" value={orc.sinalValor ?? 0} onChangeValue={v => onChange({ sinalValor: v, sinalPercentual: orc.subtotal ? Math.round((v / orc.subtotal) * 100) : 0 })} containerStyle={{ flex: 1, marginRight: 10 }} />
          <OlliInput label="Data do sinal" mask="date" value={orc.sinalData ?? ''} onChangeText={v => onChange({ sinalData: v })} placeholder="DD/MM/AAAA" containerStyle={{ flex: 1 }} />
        </View>
        {orc.sinalValor ? (
          <View style={styles.sinalInfo}>
            <MaterialCommunityIcons name="information" size={15} color={Colors.primary} />
            <Text style={styles.sinalInfoText}>Sinal {formatCurrency(orc.sinalValor)} · Restante {formatCurrency(restante)}</Text>
          </View>
        ) : null}
      </View>

      {/* CONDIÇÕES */}
      <View style={styles.card}>
        <SectionTitle icon="file-document-outline">Condições e garantia</SectionTitle>
        <OlliInput label="Condições contratuais" value={orc.condicoesContratuais ?? ''} onChangeText={v => onChange({ condicoesContratuais: v })} placeholder="Prazo, materiais inclusos, responsabilidades..." multiline />
        <OlliInput label="Garantia" value={orc.garantia ?? ''} onChangeText={v => onChange({ garantia: v })} placeholder="Ex: 90 dias para mão de obra" multiline />
        <OlliInput label="Informações adicionais" value={orc.informacoesAdicionais ?? ''} onChangeText={v => onChange({ informacoesAdicionais: v })} placeholder="Observações gerais" multiline />
        <OlliInput label="Laudo técnico" value={orc.laudoTecnico ?? ''} onChangeText={v => onChange({ laudoTecnico: v })} placeholder="Diagnóstico técnico do equipamento" multiline containerStyle={{ marginBottom: 0 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.base, ...Shadow.sm },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.base },
  sectionIconBg: { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.onSurface },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant, marginBottom: 8 },
  paymentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paymentChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: Colors.outline, backgroundColor: Colors.surface },
  paymentChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  paymentLabel: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant },
  rowFields: { flexDirection: 'row' },
  sinalInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryContainer, borderRadius: BorderRadius.md, padding: 10, marginTop: 4 },
  sinalInfoText: { fontSize: 13, color: Colors.primary, fontWeight: '700' },
});
