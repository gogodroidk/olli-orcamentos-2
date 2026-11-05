import { formatarNumeroExibicao } from '../utils/numeroDocumento';
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
import { MODELOS_ORCAMENTO, TEXTO_LAYOUT_SO_VISUAL } from '../content/modelosLayout';
import { Depoimento, Empresa, ModeloPdfId, Orcamento } from '../types';
import { formatCurrency } from '../utils/currency';
import { OlliButton } from '../components/OlliButton';
import { PressableAnimado } from '../components/motion';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { getDepoimentos } from '../database/database';
import { usePlano } from '../hooks/usePlano';
import { RECURSO_REMOVE_MARCA } from '../services/planos';
import { RootStackParamList } from '../navigation/AppNavigator';
import { exigirCadastroParaEnviar } from '../services/exigirCadastro';
import { corMarcaSobre } from '../utils/coresMarca';
import { safeHexColor } from '../utils/html';

interface Props {
  orc: Orcamento;
  onChange: (partial: Partial<Orcamento>) => void;
  empresa?: Empresa | null;
  /** Abre "Ajustar detalhes" (datas, condições, fotos), que volta para cá. */
  onAjustarDetalhes?: () => void;
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Catálogo compartilhado com a tela central "Modelos de documento". A escolha
 * acontece lá; esta etapa só mostra o padrão que foi copiado para o orçamento.
 * O snapshot no orçamento é intencional: mudar a marca amanhã não altera o
 * documento que um cliente recebeu hoje.
 */
/** Mesmo catálogo de Conta → Modelos de documento. `desc` é o resumo de uma linha. */
export const PDF_MODELS: Array<{
  id: ModeloPdfId;
  nome: string;
  desc: string;
  quandoUsar: string;
  color: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = MODELOS_ORCAMENTO.map((m) => ({
  id: m.id,
  nome: m.nome,
  desc: m.resumo,
  quandoUsar: m.quandoUsar,
  color: m.color,
  icon: m.icon as keyof typeof MaterialCommunityIcons.glyphMap,
}));

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

export default function Step4Personalizacao({ orc, onChange, empresa, onAjustarDetalhes }: Props) {
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
  const corAmostra = safeHexColor(orc.corMarca ?? empresa?.corMarca ?? cores.primary, cores.primary);
  const corIcone = corMarcaSobre(corAmostra, cores.surface);

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
            <Text style={styles.revisionPillText}>Revisão do orçamento nº {formatarNumeroExibicao(orc.revisaoDeNumero)}</Text>
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

      {onAjustarDetalhes ? (
        <PressableAnimado
          onPress={onAjustarDetalhes}
          haptic="light"
          escala={0.98}
          style={styles.detalhesCard}
          accessibilityLabel="Ajustar detalhes: datas, condições, garantia, fotos, laudo e observações"
        >
          <View style={styles.detalhesIcone}>
            <MaterialCommunityIcons name="tune-variant" size={20} color={cores.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.detalhesTitulo}>Datas, condições, fotos e laudo</Text>
            {resumoDetalhes(orc).map(linha => (
              <Text key={linha} style={styles.detalhesLinha} numberOfLines={1}>{linha}</Text>
            ))}
          </View>
          <View style={styles.detalhesAcao}>
            <Text style={styles.detalhesAcaoTexto}>Ajustar</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={cores.primary} />
          </View>
        </PressableAnimado>
      ) : null}

      <Text style={styles.sectionTitle}>Aparência do documento</Text>
      <Text style={styles.sectionHint}>
        {TEXTO_LAYOUT_SO_VISUAL} Modelo, cor, logo e identidade ficam em Conta › Modelos de documento.
      </Text>
      <View style={styles.brandCard}>
        <View style={[styles.modelIcon, { backgroundColor: comAlfa(corAmostra, 0.12), borderColor: comAlfa(corAmostra, 0.32) }]}>
          <MaterialCommunityIcons name={modelo.icon} size={25} color={corIcone} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandEyebrow}>Padrão aplicado</Text>
          <Text style={styles.brandName}>{orc.modeloNome || modelo.nome}</Text>
          <Text style={styles.brandDetail}>{modelo.quandoUsar}</Text>
          <Text style={styles.brandDetail}>{empresa?.nome || 'Sua empresa'} · os dados deste orçamento não mudam com o modelo</Text>
        </View>
        <View style={[styles.colorDot, { backgroundColor: corAmostra }]} accessibilityLabel="Cor da marca aplicada" />
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
        antesDeExportar={() => exigirCadastroParaEnviar('orcamento')}
      />
    </ScrollView>
  );
}

/** O que já está nos detalhes, em até 3 linhas curtas (o vazio diz que está vazio). */
function resumoDetalhes(orc: Orcamento): string[] {
  const fotos = orc.fotosServico?.length ?? 0;
  return [
    orc.validadeOrcamento?.trim() ? `Validade: ${orc.validadeOrcamento.trim()}` : 'Sem validade definida',
    orc.garantia?.trim() ? `Garantia: ${orc.garantia.trim()}` : 'Sem garantia escrita',
    fotos > 0 ? `${fotos} ${fotos === 1 ? 'foto anexada' : 'fotos anexadas'}` : 'Nenhuma foto anexada',
  ];
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
  detalhesCard: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline,
    borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.lg,
  },
  detalhesIcone: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: comAlfa(c.primary, 0.1),
    alignItems: 'center', justifyContent: 'center',
  },
  detalhesTitulo: { fontSize: 14, fontWeight: '800', color: c.onSurface, marginBottom: 2 },
  detalhesLinha: { fontSize: 12, color: c.onSurfaceVariant, lineHeight: 17 },
  detalhesAcao: { flexDirection: 'row', alignItems: 'center' },
  detalhesAcaoTexto: { fontSize: 13, fontWeight: '800', color: c.primary },
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
  colorDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c.outlineDark },
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
