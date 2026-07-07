import React, { useState } from 'react';
import { View, Text, Switch, ScrollView, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '../theme';
import { ModeloPdfId, Orcamento, Empresa, Depoimento } from '../types';
import { formatCurrency } from '../utils/currency';
import { CORES_MARCA } from '../utils/coresMarca';
import { OlliButton } from '../components/OlliButton';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { getDepoimentos } from '../database/database';

interface Props {
  orc: Orcamento;
  onChange: (partial: Partial<Orcamento>) => void;
  empresa?: Empresa | null;
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

const PDF_MODELS: Array<{ id: ModeloPdfId; nome: string; desc: string; color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { id: 'editorial', nome: 'Editorial', desc: 'premium com marca d\'agua', color: '#0B6FCE', icon: 'file-document-edit-outline' },
  { id: 'premium_capa', nome: 'Premium com capa', desc: 'capa + pagina de detalhes', color: '#0A2547', icon: 'book-open-page-variant-outline' },
  { id: 'minimalista', nome: 'Minimalista', desc: 'limpo e direto', color: '#64748B', icon: 'file-document-outline' },
  { id: 'bold', nome: 'Bold', desc: 'cabecalho forte', color: '#19D3E6', icon: 'view-dashboard-outline' },
  { id: 'classico', nome: 'Classico', desc: 'formal e serifado', color: '#8B5E34', icon: 'script-text-outline' },
  { id: 'faixa_lateral', nome: 'Faixa lateral', desc: 'diferente e tecnico', color: '#0E7C66', icon: 'page-layout-sidebar-left' },
  { id: 'recibo_compacto', nome: 'Recibo compacto', desc: 'servico pequeno', color: '#B4451F', icon: 'receipt-text-outline' },
];

const COLOR_SWATCHES = CORES_MARCA;

/**
 * Miniatura honesta por modelo (sem imagem, sem lib) — cada uma imita a
 * estrutura real do PDF daquele modelo, não um mock genérico repetido.
 */
function renderMiniatura(id: ModeloPdfId, cor: string) {
  switch (id) {
    case 'premium_capa':
      return (
        <View style={[styles.modelPaper, styles.miniCapaWrap, { backgroundColor: cor }]}>
          <View style={styles.miniCapaDot} />
          <View style={styles.miniCapaLine} />
        </View>
      );
    case 'bold':
      return (
        <View style={styles.modelPaper}>
          <View style={[styles.miniBoldHeader, { backgroundColor: cor }]} />
          <View style={styles.modelLine} />
          <View style={[styles.modelLine, { width: '64%' }]} />
          <View style={styles.modelTotal} />
        </View>
      );
    case 'classico':
      return (
        <View style={[styles.modelPaper, styles.miniClassicoBorder]}>
          <View style={[styles.modelLineStrong, styles.miniCentered]} />
          <View style={[styles.modelLine, styles.miniCentered, { width: '70%' }]} />
          <View style={[styles.modelLine, styles.miniCentered, { width: '50%' }]} />
          <View style={[styles.modelTotal, { alignSelf: 'center' }]} />
        </View>
      );
    case 'faixa_lateral':
      return (
        <View style={[styles.modelPaper, styles.miniFaixaWrap]}>
          <View style={[styles.miniFaixaBar, { backgroundColor: cor }]} />
          <View style={styles.miniFaixaContent}>
            <View style={styles.modelLineStrong} />
            <View style={styles.modelLine} />
            <View style={styles.modelTotal} />
          </View>
        </View>
      );
    case 'minimalista':
      return (
        <View style={styles.modelPaper}>
          <View style={styles.modelLineStrong} />
          <View style={styles.modelLine} />
          <View style={[styles.modelLine, { width: '64%' }]} />
          <View style={[styles.modelLine, { width: '40%' }]} />
        </View>
      );
    case 'recibo_compacto':
      return (
        <View style={[styles.modelPaper, styles.miniRecibo]}>
          <View style={[styles.modelAccent, { backgroundColor: cor }]} />
          <View style={styles.modelLineStrong} />
          <View style={styles.modelTotal} />
        </View>
      );
    case 'editorial':
    default:
      return (
        <View style={styles.modelPaper}>
          <View style={styles.miniEditorialSpine} />
          <View style={[styles.modelAccent, { backgroundColor: cor }]} />
          <View style={styles.modelLineStrong} />
          <View style={styles.modelLine} />
          <View style={[styles.modelLine, { width: '64%' }]} />
          <View style={styles.modelTotal} />
          <View style={styles.miniEditorialWatermark} />
        </View>
      );
  }
}

function validadeEmDias(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function Step4Personalizacao({ orc, onChange, empresa }: Props) {
  const modeloAtual = orc.modeloPdf ?? 'editorial';
  // Default da cor: a marca do orçamento, senão a cor padrão salva em "Meu
  // Negócio", senão a cor do tema — o usuário ainda pode trocar livremente
  // pelos swatches abaixo (isso só decide o valor inicial sugerido).
  const corAtual = orc.corMarca ?? empresa?.corMarca ?? Colors.primary;

  const [previewVisible, setPreviewVisible] = useState(false);
  const [depoimentos, setDepoimentos] = useState<Depoimento[]>([]);

  async function abrirPreview() {
    try {
      setDepoimentos(await getDepoimentos());
    } catch {
      setDepoimentos([]);
    }
    setPreviewVisible(true);
  }

  function escolherModelo(model: (typeof PDF_MODELS)[number]) {
    onChange({
      modeloPdf: model.id,
      modeloNome: model.nome,
      corMarca: orc.corMarca ?? empresa?.corMarca ?? model.color,
    });
  }

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
      <View style={styles.summaryRow}><Text style={styles.summaryKey}>Modelo</Text><Text style={styles.summaryVal}>{orc.modeloNome ?? 'Editorial'}</Text></View>
      {orc.subtotalServicos > 0 && <View style={styles.summaryRow}><Text style={styles.summaryKey}>Serviços</Text><Text style={styles.summaryVal}>{formatCurrency(orc.subtotalServicos)}</Text></View>}
      {orc.subtotalProdutos > 0 && <View style={styles.summaryRow}><Text style={styles.summaryKey}>Produtos</Text><Text style={styles.summaryVal}>{formatCurrency(orc.subtotalProdutos)}</Text></View>}
      {orc.subtotal - orc.valorTotal > 0 && <View style={styles.summaryRow}><Text style={styles.summaryKey}>Desconto</Text><Text style={[styles.summaryVal, { color: Colors.danger }]}>-{formatCurrency(orc.subtotal - orc.valorTotal)}</Text></View>}
      <View style={[styles.summaryRow, styles.summaryTotal]}>
        <Text style={styles.summaryTotalKey}>Total</Text>
        <Text style={styles.summaryTotalVal}>{formatCurrency(orc.valorTotal)}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Summary />

      <Text style={styles.sectionTitle}>Modelo do PDF</Text>
      <Text style={styles.sectionHint}>Escolha a personalidade do documento. A logo da sua empresa continua sendo a protagonista.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modelsRow}>
        {PDF_MODELS.map(model => {
          const active = modeloAtual === model.id;
          return (
            <TouchableOpacity
              key={model.id}
              style={[styles.modelCard, active && styles.modelCardActive]}
              onPress={() => escolherModelo(model)}
              activeOpacity={0.85}
            >
              {renderMiniatura(model.id, model.color)}
              <View style={styles.modelLabelRow}>
                <MaterialCommunityIcons name={model.icon} size={14} color={active ? Colors.accentLight : Colors.onSurfaceVariant} />
                <Text style={[styles.modelName, active && styles.modelNameActive]} numberOfLines={1}>{model.nome}</Text>
              </View>
              <Text style={styles.modelDesc} numberOfLines={1}>{model.desc}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <OlliButton
        label="Pré-visualizar"
        variant="outline"
        size="sm"
        onPress={abrirPreview}
        icon={<MaterialCommunityIcons name="eye-outline" size={16} color={Colors.accentLight} />}
        style={styles.previewBtn}
      />

      <Text style={styles.sectionTitle}>Cor da marca</Text>
      <Text style={styles.sectionHint}>Esta cor entra no PDF, no total e nos detalhes de aprovação.</Text>
      <View style={styles.colorRow}>
        {COLOR_SWATCHES.map(swatch => {
          const active = corAtual.toLowerCase() === swatch.value.toLowerCase();
          return (
            <TouchableOpacity
              key={swatch.value}
              style={[styles.colorPick, active && styles.colorPickActive]}
              onPress={() => onChange({ corMarca: swatch.value })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Cor ${swatch.label}`}
            >
              <View style={[styles.colorDot, { backgroundColor: swatch.value }]} />
              <Text style={[styles.colorLabel, active && styles.colorLabelActive]}>{swatch.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Validade rápida</Text>
      <View style={styles.validadeRow}>
        {[7, 15, 30].map(days => {
          const value = validadeEmDias(days);
          const active = orc.validadeOrcamento === value;
          return (
            <TouchableOpacity key={days} style={[styles.validadeChip, active && styles.validadeChipActive]} onPress={() => onChange({ validadeOrcamento: value })} activeOpacity={0.85}>
              <Text style={[styles.validadeText, active && styles.validadeTextActive]}>{days} dias</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {orc.validadeOrcamento ? <Text style={styles.validadeHint}>Vence em {orc.validadeOrcamento}</Text> : null}

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
        label="Chamada para aprovar orçamento"
        hint="Aparece no link do cliente e orienta a aprovação pelo WhatsApp/PDF"
        value={orc.exibirAprovacao}
        onValueChange={v => onChange({ exibirAprovacao: v })}
      />
      <SwitchRow
        label="Opção de recusa"
        hint="Aparece no link do cliente quando você quiser registrar uma recusa"
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

      <PdfPreviewModal
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
        orcamento={orc}
        empresa={empresa ?? null}
        depoimentos={depoimentos}
      />
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
  summaryTotalVal: { ...Typography.value, color: Colors.accentLight },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.onSurface, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  sectionHint: { fontSize: 12, color: Colors.onSurfaceVariant, marginBottom: Spacing.sm },
  modelsRow: { gap: 10, paddingRight: Spacing.base },
  modelCard: { width: 128, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: 10, ...Shadow.sm },
  modelCardActive: { borderColor: Colors.accentLight, backgroundColor: 'rgba(52,198,217,0.09)' },
  modelPaper: { height: 118, borderRadius: BorderRadius.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#DCE7F5', padding: 10, overflow: 'hidden' },
  modelAccent: { width: 34, height: 5, borderRadius: 3, marginBottom: 13 },
  modelLineStrong: { width: '82%', height: 7, borderRadius: 4, backgroundColor: '#16202E', opacity: 0.9, marginBottom: 9 },
  modelLine: { width: '100%', height: 4, borderRadius: 3, backgroundColor: '#CBD5E1', marginBottom: 6 },
  modelTotal: { width: '72%', height: 15, borderRadius: 5, backgroundColor: '#EAF2FC', marginTop: 8, alignSelf: 'flex-end' },
  modelLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9 },
  modelName: { flex: 1, fontSize: 12.5, fontWeight: '800', color: Colors.onSurface },
  modelNameActive: { color: Colors.accentLight },
  modelDesc: { fontSize: 10.5, color: Colors.onSurfaceVariant, marginTop: 2 },

  previewBtn: { alignSelf: 'flex-start', marginTop: 4, marginBottom: Spacing.sm },

  // Miniaturas honestas por modelo (Step4 — sem imagem, sem lib)
  miniCapaWrap: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  miniCapaDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.85)' },
  miniCapaLine: { width: '55%', height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  miniBoldHeader: { width: '100%', height: 28, borderRadius: 4, marginBottom: 13 },
  miniClassicoBorder: { borderWidth: 2, borderColor: '#16202E', alignItems: 'center' },
  miniCentered: { alignSelf: 'center' },
  miniFaixaWrap: { flexDirection: 'row', padding: 0 },
  miniFaixaBar: { width: 12, height: '100%' },
  miniFaixaContent: { flex: 1, padding: 10, justifyContent: 'center' },
  miniRecibo: { justifyContent: 'center' },
  miniEditorialSpine: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, backgroundColor: Colors.primary, opacity: 0.5 },
  miniEditorialWatermark: { position: 'absolute', bottom: -10, right: -10, width: 40, height: 40, borderRadius: 20, borderWidth: 6, borderColor: 'rgba(11,111,206,0.08)' },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  colorPick: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.outline, backgroundColor: Colors.surface, paddingHorizontal: 10, paddingVertical: 8 },
  colorPickActive: { borderColor: Colors.accentLight, backgroundColor: Colors.surfacePressed },
  colorDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)' },
  colorLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.onSurfaceVariant },
  colorLabelActive: { color: Colors.accentLight },

  validadeRow: { flexDirection: 'row', gap: 8 },
  validadeChip: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: Colors.outline, backgroundColor: Colors.surface, borderRadius: BorderRadius.full, paddingVertical: 10 },
  validadeChipActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accentLight },
  validadeText: { fontSize: 13, fontWeight: '800', color: Colors.onSurfaceVariant },
  validadeTextActive: { color: '#0A1626' },
  validadeHint: { fontSize: 12.5, fontWeight: '700', color: Colors.accentLight, marginTop: 8 },

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
