import React, { useState } from 'react';
import { View, Text, Switch, ScrollView, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, sombrasDe, comAlfa, textoSobre, type Cores } from '../theme';
import { ModeloPdfId, Orcamento, Empresa, Depoimento } from '../types';
import { formatCurrency } from '../utils/currency';
import { CORES_MARCA } from '../utils/coresMarca';
import { OlliButton } from '../components/OlliButton';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { getDepoimentos } from '../database/database';
import { adicionarFotoGaleria, removerFoto } from '../utils/fotosOrcamento';
import { usePlano } from '../hooks/usePlano';
import type { Recurso } from '../services/planos';

interface Props {
  orc: Orcamento;
  onChange: (partial: Partial<Orcamento>) => void;
  empresa?: Empresa | null;
}

function SwitchRow({ label, hint, value, onValueChange }: {
  label: string; hint?: string; value: boolean; onValueChange: (v: boolean) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.switchLabel}>{label}</Text>
        {hint && <Text style={styles.switchHint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: cores.outline, true: cores.primary + '80' }}
        thumbColor={value ? cores.primary : '#fff'}
      />
    </View>
  );
}

// Cores dos modelos de PDF (documento) — NÃO seguem o tema do app: são a
// identidade visual de cada modelo impresso, igual às chaves `pdf*` da
// paleta. Ver cabeçalho de src/theme/cores.ts.
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

// Recurso que remove o selo OLLI do PDF (Pro/Empresa). Frente C adiciona
// 'remove_olli_brand' ao type Recurso em services/planos; codificamos contra o
// NOME do contrato. O cast mantém o call site válido até a união ser ampliada,
// sem afrouxar a tipagem de temAcesso nos demais usos.
const RECURSO_REMOVE_MARCA = 'remove_olli_brand' as Recurso;

// Opções de CAPA do documento (Onda 7). Espelham o union Orcamento.capaEstilo.
const CAPA_OPCOES: Array<{ id: NonNullable<Orcamento['capaEstilo']>; nome: string; desc: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { id: 'logo', nome: 'Só a logo', desc: 'abre com sua marca', icon: 'star-circle-outline' },
  { id: 'foto', nome: 'Foto de capa', desc: 'abre com uma foto', icon: 'image-outline' },
  { id: 'nenhuma', nome: 'Sem capa', desc: 'vai direto ao conteúdo', icon: 'file-outline' },
];

/**
 * Miniatura honesta por modelo (sem imagem, sem lib) — cada uma imita a
 * estrutura real do PDF daquele modelo, não um mock genérico repetido.
 *
 * `estilos` é passado explicitamente (em vez de ler um `styles` de módulo)
 * porque as cores da miniatura (papel/linhas) agora vêm da fábrica de estilos
 * do tema — esta função não é componente e não pode chamar hooks.
 */
function renderMiniatura(id: ModeloPdfId, cor: string, estilos: ReturnType<typeof criarEstilos>) {
  switch (id) {
    case 'premium_capa':
      return (
        <View style={[estilos.modelPaper, estilos.miniCapaWrap, { backgroundColor: cor }]}>
          <View style={estilos.miniCapaDot} />
          <View style={estilos.miniCapaLine} />
        </View>
      );
    case 'bold':
      return (
        <View style={estilos.modelPaper}>
          <View style={[estilos.miniBoldHeader, { backgroundColor: cor }]} />
          <View style={estilos.modelLine} />
          <View style={[estilos.modelLine, { width: '64%' }]} />
          <View style={estilos.modelTotal} />
        </View>
      );
    case 'classico':
      return (
        <View style={[estilos.modelPaper, estilos.miniClassicoBorder]}>
          <View style={[estilos.modelLineStrong, estilos.miniCentered]} />
          <View style={[estilos.modelLine, estilos.miniCentered, { width: '70%' }]} />
          <View style={[estilos.modelLine, estilos.miniCentered, { width: '50%' }]} />
          <View style={[estilos.modelTotal, { alignSelf: 'center' }]} />
        </View>
      );
    case 'faixa_lateral':
      return (
        <View style={[estilos.modelPaper, estilos.miniFaixaWrap]}>
          <View style={[estilos.miniFaixaBar, { backgroundColor: cor }]} />
          <View style={estilos.miniFaixaContent}>
            <View style={estilos.modelLineStrong} />
            <View style={estilos.modelLine} />
            <View style={estilos.modelTotal} />
          </View>
        </View>
      );
    case 'minimalista':
      return (
        <View style={estilos.modelPaper}>
          <View style={estilos.modelLineStrong} />
          <View style={estilos.modelLine} />
          <View style={[estilos.modelLine, { width: '64%' }]} />
          <View style={[estilos.modelLine, { width: '40%' }]} />
        </View>
      );
    case 'recibo_compacto':
      return (
        <View style={[estilos.modelPaper, estilos.miniRecibo]}>
          <View style={[estilos.modelAccent, { backgroundColor: cor }]} />
          <View style={estilos.modelLineStrong} />
          <View style={estilos.modelTotal} />
        </View>
      );
    case 'editorial':
    default:
      return (
        <View style={estilos.modelPaper}>
          <View style={estilos.miniEditorialSpine} />
          <View style={[estilos.modelAccent, { backgroundColor: cor }]} />
          <View style={estilos.modelLineStrong} />
          <View style={estilos.modelLine} />
          <View style={[estilos.modelLine, { width: '64%' }]} />
          <View style={estilos.modelTotal} />
          <View style={estilos.miniEditorialWatermark} />
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
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const modeloAtual = orc.modeloPdf ?? 'editorial';
  // Default da cor: a marca do orçamento, senão a cor padrão salva em "Meu
  // Negócio", senão a cor do tema — o usuário ainda pode trocar livremente
  // pelos swatches abaixo (isso só decide o valor inicial sugerido).
  const corAtual = orc.corMarca ?? empresa?.corMarca ?? cores.primary;

  // Capa: padrão 'logo' (o documento começa com a marca). Só a logo continua
  // sendo a protagonista até o usuário escolher foto de capa ou nenhuma.
  const capaAtual = orc.capaEstilo ?? 'logo';

  // Marca OLLI no PDF: Pro/Empresa removem o selo. A PRÉVIA usa o mesmo flag
  // para ficar IDÊNTICA ao que o cliente recebe (contrato F4/preview real).
  const { temAcesso } = usePlano();
  const removerMarca = temAcesso(RECURSO_REMOVE_MARCA);

  const [previewVisible, setPreviewVisible] = useState(false);
  const [depoimentos, setDepoimentos] = useState<Depoimento[]>([]);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [adicionandoCapa, setAdicionandoCapa] = useState(false);

  async function abrirPreview() {
    setCarregandoPreview(true);
    try {
      setDepoimentos(await getDepoimentos());
    } catch {
      setDepoimentos([]);
    } finally {
      setCarregandoPreview(false);
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

  // Reusa o pipeline central de fotos (permissão + compressão + CÓPIA
  // PERSISTENTE em documentDirectory): a versão antiga guardava a URI
  // temporária do picker, e a foto sumia quando o sistema limpava o cache.
  async function pickFoto() {
    const r = await adicionarFotoGaleria(orc.fotosServico ?? []);
    if (r.erro) {
      Alert.alert('Fotos', r.erro);
      return;
    }
    // adicionarFotoGaleria retorna só as fotos NOVAS — mescla com as existentes
    // (antes fazia `fotosServico: r.uris`, o que apagava as fotos já anexadas ao
    // adicionar uma segunda leva).
    onChange({ fotosServico: [...(orc.fotosServico ?? []), ...r.uris] });
  }

  async function removeFoto(idx: number) {
    const atuais = orc.fotosServico ?? [];
    const uri = atuais[idx];
    if (!uri) return;
    const updated = await removerFoto(atuais, uri);
    // Se a foto removida era a capa, volta a capa para "só a logo" (a URI some).
    const patch: Partial<Orcamento> = { fotosServico: updated };
    if (orc.capaFotoUri === uri) {
      patch.capaFotoUri = undefined;
      if (orc.capaEstilo === 'foto') patch.capaEstilo = 'logo';
    }
    onChange(patch);
  }

  // Troca o ESTILO da capa. Ao escolher 'foto' sem nenhuma foto ainda escolhida,
  // adota a 1ª foto do serviço (se houver) para o usuário ver algo de imediato.
  function escolherCapaEstilo(estilo: NonNullable<Orcamento['capaEstilo']>) {
    if (estilo === 'foto') {
      const primeira = orc.capaFotoUri ?? (orc.fotosServico ?? [])[0];
      onChange({ capaEstilo: 'foto', capaFotoUri: primeira });
      return;
    }
    // 'logo' ou 'nenhuma' não usam foto de capa — limpa a URI para não confundir.
    onChange({ capaEstilo: estilo, capaFotoUri: undefined });
  }

  // Marca uma foto JÁ anexada como a capa (mantém capaEstilo='foto').
  function usarComoCapa(uri: string) {
    onChange({ capaEstilo: 'foto', capaFotoUri: uri });
  }

  // Adiciona uma foto NOVA da galeria e já a define como capa. Reusa o mesmo
  // pipeline persistente das fotos do serviço (permissão + compressão + cópia)
  // e também a anexa em fotosServico, para a foto sobreviver e ficar disponível.
  async function adicionarFotoCapa() {
    setAdicionandoCapa(true);
    try {
      const atuais = orc.fotosServico ?? [];
      const r = await adicionarFotoGaleria(atuais);
      if (r.erro) {
        Alert.alert('Foto de capa', r.erro);
        return;
      }
      const novaCapa = r.uris[0];
      if (!novaCapa) return;
      onChange({
        fotosServico: [...atuais, ...r.uris],
        capaEstilo: 'foto',
        capaFotoUri: novaCapa,
      });
    } finally {
      setAdicionandoCapa(false);
    }
  }

  const Summary = () => (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Resumo do orçamento</Text>
      <View style={styles.summaryRow}><Text style={styles.summaryKey}>Cliente</Text><Text style={styles.summaryVal}>{orc.clienteNome}</Text></View>
      <View style={styles.summaryRow}><Text style={styles.summaryKey}>Itens</Text><Text style={styles.summaryVal}>{orc.itens.length} item(s)</Text></View>
      <View style={styles.summaryRow}><Text style={styles.summaryKey}>Modelo</Text><Text style={styles.summaryVal}>{orc.modeloNome ?? 'Editorial'}</Text></View>
      {orc.subtotalServicos > 0 && <View style={styles.summaryRow}><Text style={styles.summaryKey}>Serviços</Text><Text style={styles.summaryVal}>{formatCurrency(orc.subtotalServicos)}</Text></View>}
      {orc.subtotalProdutos > 0 && <View style={styles.summaryRow}><Text style={styles.summaryKey}>Produtos</Text><Text style={styles.summaryVal}>{formatCurrency(orc.subtotalProdutos)}</Text></View>}
      {orc.subtotal - orc.valorTotal > 0 && <View style={styles.summaryRow}><Text style={styles.summaryKey}>Desconto</Text><Text style={[styles.summaryVal, { color: cores.danger }]}>-{formatCurrency(orc.subtotal - orc.valorTotal)}</Text></View>}
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
              {renderMiniatura(model.id, model.color, styles)}
              <View style={styles.modelLabelRow}>
                <MaterialCommunityIcons name={model.icon} size={14} color={active ? cores.accentLight : cores.onSurfaceVariant} />
                <Text style={[styles.modelName, active && styles.modelNameActive]} numberOfLines={1}>{model.nome}</Text>
              </View>
              <Text style={styles.modelDesc} numberOfLines={1}>{model.desc}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.sectionTitle}>Capa do documento</Text>
      <Text style={styles.sectionHint}>Escolha como o orçamento começa. A logo continua na página de detalhes.</Text>
      <View style={styles.capaRow}>
        {CAPA_OPCOES.map(op => {
          const active = capaAtual === op.id;
          return (
            <TouchableOpacity
              key={op.id}
              style={[styles.capaCard, active && styles.capaCardActive]}
              onPress={() => escolherCapaEstilo(op.id)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Capa: ${op.nome}`}
            >
              <MaterialCommunityIcons
                name={op.icon}
                size={22}
                color={active ? cores.accentLight : cores.onSurfaceVariant}
              />
              <Text style={[styles.capaName, active && styles.capaNameActive]} numberOfLines={1}>{op.nome}</Text>
              <Text style={styles.capaDesc} numberOfLines={1}>{op.desc}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {capaAtual === 'foto' && (
        <View style={styles.capaFotoBlock}>
          <Text style={styles.capaFotoHint}>
            {(orc.fotosServico ?? []).length > 0
              ? 'Toque em uma foto anexada para usá-la como capa, ou adicione uma nova.'
              : 'Adicione uma foto para abrir o documento com ela.'}
          </Text>
          <View style={styles.fotosGrid}>
            {(orc.fotosServico ?? []).map((uri, idx) => {
              const selecionada = orc.capaFotoUri === uri;
              return (
                <TouchableOpacity
                  key={`capa-${idx}`}
                  style={[styles.capaFotoItem, selecionada && styles.capaFotoItemActive]}
                  onPress={() => usarComoCapa(uri)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={selecionada ? 'Foto de capa selecionada' : 'Usar esta foto como capa'}
                >
                  <Image source={{ uri }} style={styles.fotoImg} />
                  {selecionada && (
                    <View style={styles.capaFotoCheck}>
                      <MaterialCommunityIcons name="check-circle" size={22} color={cores.accentLight} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.addFotoBtn}
              onPress={adicionarFotoCapa}
              disabled={adicionandoCapa}
              accessibilityRole="button"
              accessibilityLabel="Adicionar foto de capa"
            >
              <MaterialCommunityIcons name="image-plus" size={26} color={cores.primary} />
              <Text style={styles.addFotoLabel}>{adicionandoCapa ? 'Aguarde...' : 'Adicionar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <OlliButton
        label="Pré-visualizar"
        variant="outline"
        size="sm"
        onPress={abrirPreview}
        loading={carregandoPreview}
        disabled={carregandoPreview}
        icon={<MaterialCommunityIcons name="eye-outline" size={16} color={cores.accentLight} />}
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
              <MaterialCommunityIcons name="close-circle" size={20} color={cores.danger} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addFotoBtn} onPress={pickFoto}>
          <MaterialCommunityIcons name="camera-plus-outline" size={28} color={cores.primary} />
          <Text style={styles.addFotoLabel}>Adicionar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.previewNote}>
        <MaterialCommunityIcons name="information-outline" size={18} color={cores.primary} />
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
        removerMarca={removerMarca}
      />
    </ScrollView>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, padding: Spacing.base },
  summaryCard: {
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.lg, ...sombrasDe(c).md,
    borderLeftWidth: 4, borderLeftColor: c.primary,
  },
  summaryTitle: { fontSize: 15, fontWeight: '800', color: c.primary, marginBottom: Spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.outline },
  summaryKey: { fontSize: 13, color: c.onSurfaceVariant },
  summaryVal: { fontSize: 13, fontWeight: '600', color: c.onSurface },
  summaryTotal: { borderBottomWidth: 0, marginTop: 4 },
  summaryTotalKey: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  summaryTotalVal: { ...Typography.value, color: c.accentLight },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.onSurface, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  sectionHint: { fontSize: 12, color: c.onSurfaceVariant, marginBottom: Spacing.sm },
  modelsRow: { gap: 10, paddingRight: Spacing.base },
  modelCard: { width: 128, backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: 10, ...sombrasDe(c).sm },
  // rgba(52,198,217,...) era o cyan de marca (#34C6D9) fixo — agora acompanha o
  // accent escolhido no tema via comAlfa.
  modelCardActive: { borderColor: c.accentLight, backgroundColor: comAlfa(c.accent, 0.09) },
  // Miniatura do PDF: sempre "papel claro" — é o preview de um documento
  // impresso, que não deve escurecer junto com o app (mesmo raciocínio das
  // chaves `pdf*` da paleta). Cores fixas, propositalmente fora do tema.
  modelPaper: { height: 118, borderRadius: BorderRadius.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#DCE7F5', padding: 10, overflow: 'hidden' },
  modelAccent: { width: 34, height: 5, borderRadius: 3, marginBottom: 13 },
  modelLineStrong: { width: '82%', height: 7, borderRadius: 4, backgroundColor: '#16202E', opacity: 0.9, marginBottom: 9 },
  modelLine: { width: '100%', height: 4, borderRadius: 3, backgroundColor: '#CBD5E1', marginBottom: 6 },
  modelTotal: { width: '72%', height: 15, borderRadius: 5, backgroundColor: '#EAF2FC', marginTop: 8, alignSelf: 'flex-end' },
  modelLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9 },
  modelName: { flex: 1, fontSize: 12.5, fontWeight: '800', color: c.onSurface },
  modelNameActive: { color: c.accentLight },
  modelDesc: { fontSize: 10.5, color: c.onSurfaceVariant, marginTop: 2 },

  previewBtn: { alignSelf: 'flex-start', marginTop: 4, marginBottom: Spacing.sm },

  // Capa do documento (Onda 7)
  capaRow: { flexDirection: 'row', gap: 8 },
  capaCard: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline, paddingVertical: 12, paddingHorizontal: 6,
    ...sombrasDe(c).sm,
  },
  capaCardActive: { borderColor: c.accentLight, backgroundColor: comAlfa(c.accent, 0.09) },
  capaName: { fontSize: 12.5, fontWeight: '800', color: c.onSurface, textAlign: 'center' },
  capaNameActive: { color: c.accentLight },
  capaDesc: { fontSize: 10.5, color: c.onSurfaceVariant, textAlign: 'center' },
  capaFotoBlock: { marginTop: Spacing.sm },
  capaFotoHint: { fontSize: 12, color: c.onSurfaceVariant, marginBottom: Spacing.sm },
  capaFotoItem: { position: 'relative', borderRadius: BorderRadius.md, borderWidth: 2, borderColor: 'transparent' },
  capaFotoItemActive: { borderColor: c.accentLight },
  // Selo "capa selecionada" sobre uma FOTO (não sobre superfície do app) — fica
  // escuro fixo em qualquer tema, para garantir contraste contra foto qualquer.
  capaFotoCheck: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: 'rgba(10,22,38,0.7)', borderRadius: 12,
  },

  // Miniaturas honestas por modelo (Step4 — sem imagem, sem lib). Mesmas cores
  // fixas de "papel" do modelPaper — ver comentário acima.
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
  miniEditorialSpine: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, backgroundColor: c.primary, opacity: 0.5 },
  miniEditorialWatermark: { position: 'absolute', bottom: -10, right: -10, width: 40, height: 40, borderRadius: 20, borderWidth: 6, borderColor: 'rgba(11,111,206,0.08)' },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  colorPick: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, paddingHorizontal: 10, paddingVertical: 8 },
  colorPickActive: { borderColor: c.accentLight, backgroundColor: c.surfacePressed },
  colorDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)' },
  colorLabel: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant },
  colorLabelActive: { color: c.accentLight },

  validadeRow: { flexDirection: 'row', gap: 8 },
  validadeChip: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, borderRadius: BorderRadius.full, paddingVertical: 10 },
  validadeChipActive: { backgroundColor: c.accentLight, borderColor: c.accentLight },
  validadeText: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant },
  // #0A1626: tinta fixa para texto sobre accentLight — sem token "onAccentLight"
  // na paleta (só onPrimary existe); ver relatório da migração.
  validadeTextActive: { color: textoSobre(c.accentLight) },
  validadeHint: { fontSize: 12.5, fontWeight: '700', color: c.accentLight, marginTop: 8 },

  switchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.surface, borderRadius: BorderRadius.md,
    padding: Spacing.base, marginBottom: 8, ...sombrasDe(c).sm,
  },
  switchLabel: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  switchHint: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },

  fotosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fotoItem: { position: 'relative' },
  fotoImg: { width: 80, height: 80, borderRadius: BorderRadius.md },
  fotoRemove: { position: 'absolute', top: -8, right: -8 },
  addFotoBtn: {
    width: 80, height: 80, borderRadius: BorderRadius.md,
    borderWidth: 1.5, borderColor: c.primary, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  addFotoLabel: { fontSize: 10, color: c.primary, fontWeight: '600', marginTop: 2 },

  previewNote: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: c.primaryContainer, borderRadius: BorderRadius.md,
    padding: Spacing.base, marginTop: Spacing.xl, gap: 8,
  },
  previewNoteText: { flex: 1, fontSize: 13, color: c.primary, lineHeight: 18 },
});
