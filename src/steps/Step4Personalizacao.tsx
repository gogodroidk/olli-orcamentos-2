import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  BorderRadius,
  Spacing,
  comAlfa,
  sombrasDe,
  useCores,
  useEstilos,
  type Cores,
} from '../theme';
import { Depoimento, Empresa, ModeloPdfId, Orcamento } from '../types';
import { formatCurrency } from '../utils/currency';
import { OlliButton } from '../components/OlliButton';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { getDepoimentos } from '../database/database';
import { usePlano } from '../hooks/usePlano';
import { RECURSO_REMOVE_MARCA } from '../services/planos';
import { RootStackParamList } from '../navigation/AppNavigator';

interface Props {
  orc: Orcamento;
  onChange: (partial: Partial<Orcamento>) => void;
  empresa?: Empresa | null;
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Catálogo compartilhado com a tela central "Modelos de documento". A escolha
 * acontece lá; esta etapa só mostra o padrão que foi copiado para o orçamento.
 * O snapshot no orçamento é intencional: mudar a marca amanhã não altera o
 * documento que um cliente recebeu hoje.
 */
export const PDF_MODELS: Array<{
  id: ModeloPdfId;
  nome: string;
  desc: string;
  color: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = [
  { id: 'editorial', nome: 'Editorial', desc: 'premium com marca d\'água', color: '#0B6FCE', icon: 'file-document-edit-outline' },
  { id: 'premium_capa', nome: 'Premium com capa', desc: 'capa e página de detalhes', color: '#0A2547', icon: 'book-open-page-variant-outline' },
  { id: 'minimalista', nome: 'Minimalista', desc: 'limpo e direto', color: '#64748B', icon: 'file-document-outline' },
  { id: 'bold', nome: 'Bold', desc: 'cabeçalho forte', color: '#19D3E6', icon: 'view-dashboard-outline' },
  { id: 'classico', nome: 'Clássico', desc: 'formal e serifado', color: '#8B5E34', icon: 'script-text-outline' },
  { id: 'faixa_lateral', nome: 'Faixa lateral', desc: 'visual técnico', color: '#0E7C66', icon: 'page-layout-sidebar-left' },
  { id: 'recibo_compacto', nome: 'Recibo compacto', desc: 'serviço pequeno', color: '#B4451F', icon: 'receipt-text-outline' },
];

function SwitchRow({ label, hint, value, onValueChange }: {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.switchLabel}>{label}</Text>
        <Text style={styles.switchHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ checked: value }}
        trackColor={{ false: cores.outline, true: comAlfa(cores.primary, 0.5) }}
        thumbColor={value ? cores.primary : '#fff'}
      />
    </View>
  );
}

export default function Step4Personalizacao({ orc, onChange, empresa }: Props) {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { temAcesso } = usePlano();
  const removerMarca = temAcesso(RECURSO_REMOVE_MARCA);

  const [previewVisible, setPreviewVisible] = useState(false);
  const [depoimentos, setDepoimentos] = useState<Depoimento[]>([]);
  const [carregandoPreview, setCarregandoPreview] = useState(false);

  const modelo = PDF_MODELS.find(item => item.id === (orc.modeloPdf ?? empresa?.modeloPdfPadrao ?? 'editorial'))
    ?? PDF_MODELS[0];
  const corDocumento = orc.corMarca ?? empresa?.corMarca ?? cores.primary;

  async function abrirPreview() {
    setCarregandoPreview(true);
    try {
      setDepoimentos(await getDepoimentos());
    } catch {
      // A prévia continua útil sem prova social; não apaga o que já foi carregado.
    } finally {
      setCarregandoPreview(false);
    }
    setPreviewVisible(true);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Confira antes de salvar</Text>
        {orc.revisaoDeNumero ? (
          <View style={styles.revisionPill}>
            <MaterialCommunityIcons name="file-document-edit-outline" size={14} color={cores.primary} />
            <Text style={styles.revisionPillText}>Revisão do orçamento nº {orc.revisaoDeNumero}</Text>
          </View>
        ) : null}
        <SummaryRow label="Cliente" value={orc.clienteNome || 'Não informado'} />
        <SummaryRow label="Itens" value={`${orc.itens.length} ${orc.itens.length === 1 ? 'item' : 'itens'}`} />
        {orc.subtotalServicos > 0 ? <SummaryRow label="Serviços" value={formatCurrency(orc.subtotalServicos)} /> : null}
        {orc.subtotalProdutos > 0 ? <SummaryRow label="Produtos" value={formatCurrency(orc.subtotalProdutos)} /> : null}
        {orc.subtotal - orc.valorTotal > 0 ? (
          <SummaryRow label="Desconto" value={`-${formatCurrency(orc.subtotal - orc.valorTotal)}`} danger />
        ) : null}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(orc.valorTotal)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Aparência do documento</Text>
      <Text style={styles.sectionHint}>
        Modelo, cor, logo e identidade ficam centralizados em Conta › Modelos de documento. Este orçamento guarda uma cópia do padrão usado para não mudar depois de enviado.
      </Text>
      <View style={styles.brandCard}>
        <View style={[styles.modelIcon, { backgroundColor: comAlfa(corDocumento, 0.12), borderColor: comAlfa(corDocumento, 0.32) }]}>
          <MaterialCommunityIcons name={modelo.icon} size={25} color={corDocumento} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandEyebrow}>Padrão aplicado</Text>
          <Text style={styles.brandName}>{orc.modeloNome || modelo.nome}</Text>
          <Text style={styles.brandDetail}>{empresa?.nome || 'Sua empresa'} · identidade salva</Text>
        </View>
        <View style={[styles.colorDot, { backgroundColor: corDocumento }]} accessibilityLabel="Cor da marca aplicada" />
      </View>
      <View style={styles.previewActions}>
        <OlliButton
          label="Ver prévia"
          variant="outline"
          size="sm"
          onPress={abrirPreview}
          loading={carregandoPreview}
          disabled={carregandoPreview}
          icon={<MaterialCommunityIcons name="eye-outline" size={16} color={cores.accentLight} />}
        />
        <OlliButton
          label="Alterar padrão"
          variant="outline"
          size="sm"
          onPress={() => nav.navigate('ModelosDocumento')}
          icon={<MaterialCommunityIcons name="palette-swatch-outline" size={16} color={cores.accentLight} />}
        />
      </View>

      <Text style={styles.sectionTitle}>Aceite do cliente</Text>
      <SwitchRow
        label="Permitir aprovação"
        hint="Mostra a ação de aprovar no link enviado ao cliente."
        value={orc.exibirAprovacao}
        onValueChange={value => onChange({ exibirAprovacao: value })}
      />
      <SwitchRow
        label="Permitir recusa com motivo"
        hint="O cliente pode recusar e explicar o que precisa mudar."
        value={orc.exibirRecusa}
        onValueChange={value => onChange({ exibirRecusa: value })}
      />
      <SwitchRow
        label="Solicitar assinatura do cliente"
        hint="Reserva o aceite por assinatura para este orçamento."
        value={orc.solicitarAssinaturaCliente}
        onValueChange={value => onChange({ solicitarAssinaturaCliente: value })}
      />
      <SwitchRow
        label="Exibir assinatura do prestador"
        hint="Usa a assinatura central cadastrada em Meu Negócio."
        value={orc.exibirAssinatura}
        onValueChange={value => onChange({ exibirAssinatura: value })}
      />

      <View style={styles.nextNote}>
        <MaterialCommunityIcons name="information-outline" size={19} color={cores.primary} />
        <Text style={styles.nextNoteText}>
          Depois de salvar, a próxima tela sempre abre este orçamento — inclusive quando for uma revisão. É dali que você envia o PDF, WhatsApp ou link correto ao cliente.
        </Text>
      </View>

      <PdfPreviewModal
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
        orcamento={orc}
        empresa={empresa ?? null}
        depoimentos={depoimentos}
        removerMarca={removerMarca}
      />
    </ScrollView>
  );
}

function SummaryRow({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryKey}>{label}</Text>
      <Text style={[styles.summaryValue, danger && { color: cores.danger }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, paddingHorizontal: Spacing.base },
  content: { paddingTop: Spacing.base, paddingBottom: 40 },
  summaryCard: {
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: c.outline,
    ...sombrasDe(c).sm,
  },
  summaryTitle: { fontSize: 16, fontWeight: '800', color: c.onSurface, marginBottom: 9 },
  revisionPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: BorderRadius.full, backgroundColor: comAlfa(c.primary, 0.09),
    paddingHorizontal: 9, paddingVertical: 5, marginBottom: 8,
  },
  revisionPillText: { fontSize: 11.5, fontWeight: '800', color: c.primary },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 12,
    paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: c.outline,
  },
  summaryKey: { fontSize: 13, color: c.onSurfaceVariant },
  summaryValue: { flex: 1, fontSize: 13, fontWeight: '700', color: c.onSurface, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 11 },
  totalLabel: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  totalValue: { fontSize: 22, fontWeight: '900', color: c.primary },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: c.onSurface, marginTop: 4, marginBottom: 3 },
  sectionHint: { fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 18, marginBottom: 10 },
  brandCard: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
  },
  modelIcon: {
    width: 48, height: 48, borderRadius: BorderRadius.md,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  brandEyebrow: { fontSize: 10.5, fontWeight: '800', color: c.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.4 },
  brandName: { fontSize: 15, fontWeight: '800', color: c.onSurface, marginTop: 1 },
  brandDetail: { fontSize: 11.5, color: c.onSurfaceVariant, marginTop: 2 },
  colorDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c.surface },
  previewActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9, marginBottom: Spacing.lg },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 64, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 9, marginBottom: 8,
  },
  switchLabel: { fontSize: 13.5, fontWeight: '800', color: c.onSurface },
  switchHint: { fontSize: 11.5, color: c.onSurfaceVariant, lineHeight: 16, marginTop: 2 },
  nextNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginTop: 8, padding: Spacing.md, borderRadius: BorderRadius.lg,
    backgroundColor: comAlfa(c.primary, 0.07), borderWidth: 1, borderColor: comAlfa(c.primary, 0.22),
  },
  nextNoteText: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 18 },
});
