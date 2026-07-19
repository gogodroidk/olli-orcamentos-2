import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, comAlfa, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { GerarDocumentoModal, TITULOS_DOCUMENTO, type TipoDocumento } from '../components/documentos/GerarDocumentoModal';
import { EditorClausulasContrato } from '../components/documentos/EditorClausulasContrato';
import { PDF_MODELS } from '../steps/Step4Personalizacao';
import { montarHtmlRecibo } from '../utils/reciboPdf';
import { AVISO_APP } from '../utils/documentoBase';
import { montarHtmlContratoCompleto, termosPadraoContrato } from '../utils/contratoPdf';
import {
  dadosConclusaoDeOrcamento,
  dadosGarantiaDeOrcamento,
  montarHtmlTermoConclusao,
  montarHtmlTermoGarantia,
} from '../utils/termosPdf';
import { getEmpresa, saveEmpresa, getDepoimentos } from '../database/database';
import { Empresa, Depoimento, ItemOrcamento, ModeloPdfId, ModeloReciboId, Orcamento, Recibo } from '../types';
import { goBackOrHome } from '../navigation/safeBack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { generateId } from '../utils/id';
import { todayISO, nowISO } from '../utils/date';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Orçamento fictício só para a PRÉVIA de cada modelo — dados plausíveis de HVAC,
 * para o dono ver o layout REAL (mesmo HTML do PDF enviado), não um mock chapado.
 */
function orcamentoDeExemplo(modelo: ModeloPdfId, corMarca?: string): Orcamento {
  const itens: ItemOrcamento[] = [
    { id: 'ex1', tipo: 'servico', catalogoId: '', nome: 'Instalação de split 12.000 BTUs', descricao: 'Suporte, vácuo, teste de estanqueidade e start-up.', preco: 480, quantidade: 1, unidade: 'un', subtotal: 480 },
    { id: 'ex2', tipo: 'servico', catalogoId: '', nome: 'Limpeza técnica completa', descricao: 'Higienização de evaporadora e condensadora.', preco: 180, quantidade: 2, unidade: 'un', subtotal: 360 },
    { id: 'ex3', tipo: 'produto', catalogoId: '', nome: 'Suporte de parede reforçado', preco: 90, quantidade: 1, unidade: 'un', subtotal: 90 },
  ];
  const subtotalServicos = 840;
  const subtotalProdutos = 90;
  const subtotal = 930;
  return {
    id: 'exemplo',
    numero: '0001',
    clienteId: '',
    clienteNome: 'João da Silva',
    clienteTelefone: '(11) 98888-7777',
    clienteEndereco: 'Rua das Palmeiras, 120 — São Paulo/SP',
    itens,
    subtotalServicos,
    subtotalProdutos,
    subtotal,
    desconto: 0,
    descontoTipo: 'valor',
    valorTotal: subtotal,
    status: 'rascunho',
    laudoTecnico: 'Equipamento com baixa performance de refrigeração; recomendada higienização e recarga de gás.',
    dataEmissao: todayISO(),
    garantia: '90 dias sobre o serviço executado',
    condicoesPagamento: 'À vista no PIX ou em até 3x no cartão.',
    formasPagamento: { credito: true, debito: false, dinheiro: true, pix: true },
    exibirAssinatura: true,
    solicitarAssinaturaCliente: false,
    exibirAprovacao: true,
    exibirRecusa: true,
    validadeOrcamento: '31/12/2026',
    corMarca,
    modeloPdf: modelo,
    criadoEm: nowISO(),
    atualizadoEm: nowISO(),
  };
}

// Modelos de RECIBO — identidade visual de cada um (cores NÃO seguem o tema do
// app, igual às do orçamento; são o rosto do documento impresso).
const RECIBO_MODELS: Array<{ id: ModeloReciboId; nome: string; desc: string; color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { id: 'classico', nome: 'Clássico', desc: 'limpo e centrado', color: '#0B6FCE', icon: 'receipt-text-outline' },
  { id: 'compacto', nome: 'Compacto', desc: 'folha menor, direto', color: '#64748B', icon: 'receipt-text-check-outline' },
  { id: 'faixa', nome: 'Faixa de marca', desc: 'banner colorido no topo', color: '#0E7C66', icon: 'card-text-outline' },
];

/** Empresa mínima para a prévia do recibo funcionar sem "Meu Negócio" preenchido. */
const EMPRESA_EXEMPLO: Empresa = {
  id: 'preview', nome: 'Sua empresa', especialidade: 'Refrigeração e Climatização', slogan: '',
  cnpj: '00.000.000/0001-00', cpf: '', endereco: '', cidade: 'São Paulo', estado: 'SP',
  telefone: '(11) 90000-0000', whatsapp: '', site: '', email: '', chavePix: 'sua-chave@pix.com',
  normas: '', nomePrestador: 'Responsável Técnico',
};

/**
 * CONTRATO E TERMOS — os documentos que faltavam.
 *
 * O app sabia propor (orçamento) e sabia dar quitação (recibo), mas não tinha
 * nada entre as duas pontas: o papel que registra o que foi combinado, a
 * garantia por escrito e o aceite do serviço entregue. `desc` diz o que o
 * documento resolve NA VIDA do prestador, não o que ele é no papel.
 */
const DOCUMENTOS_JURIDICOS: Array<{
  id: TipoDocumento;
  desc: string;
  color: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = [
  { id: 'contrato', desc: 'O que foi combinado, por escrito — antes de começar o serviço', color: '#0B6FCE', icon: 'file-sign' },
  { id: 'garantia', desc: 'A garantia que você dá, com prazo, cobertura e como acionar', color: '#0E7C66', icon: 'shield-check-outline' },
  { id: 'conclusao', desc: 'O cliente declara que recebeu e conferiu — fecha o serviço', color: '#7A4FD1', icon: 'clipboard-check-outline' },
];

/** Recibo fictício para a PRÉVIA de cada modelo (mesmo HTML do recibo enviado). */
function reciboDeExemplo(): Recibo {
  return {
    id: 'exemplo',
    numero: '0001',
    orcamentoNumero: '0042',
    clienteId: '',
    clienteNome: 'João da Silva',
    clienteTelefone: '(11) 98888-7777',
    itens: [],
    valorRecebido: 930,
    formaPagamento: 'PIX',
    dataRecebimento: '10/07/2026',
    exibirAssinatura: true,
    criadoEm: '2026-07-10T14:30:00.000Z',
  };
}

export default function ModelosDocumentoScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [depoimentos, setDepoimentos] = useState<Depoimento[]>([]);
  const [padrao, setPadrao] = useState<ModeloPdfId>('editorial');
  const [salvando, setSalvando] = useState<ModeloPdfId | null>(null);
  const [previewModelo, setPreviewModelo] = useState<ModeloPdfId | null>(null);
  const [padraoRecibo, setPadraoRecibo] = useState<ModeloReciboId>('classico');
  const [salvandoRecibo, setSalvandoRecibo] = useState<ModeloReciboId | null>(null);
  const [previewRecibo, setPreviewRecibo] = useState<ModeloReciboId | null>(null);
  // Contrato e termos: exemplo (prévia com dados fictícios), geração a partir de
  // um orçamento REAL, e o editor de cláusulas padrão.
  const [exemploDoc, setExemploDoc] = useState<TipoDocumento | null>(null);
  const [gerarDoc, setGerarDoc] = useState<TipoDocumento | null>(null);
  const [editorAberto, setEditorAberto] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const [emp, deps] = await Promise.all([getEmpresa(), getDepoimentos()]);
        setEmpresa(emp);
        setDepoimentos(deps);
        if (emp?.modeloPdfPadrao) setPadrao(emp.modeloPdfPadrao);
        if (emp?.modeloReciboPadrao) setPadraoRecibo(emp.modeloReciboPadrao);
      } catch {
        // leitura best-effort — a tela ainda funciona pra pré-visualizar
      }
    })();
  }, []));

  async function escolher(id: ModeloPdfId) {
    if (id === padrao) return;
    Haptics.selectionAsync().catch(() => {});
    if (!empresa) {
      Alert.alert(
        'Configure seu negócio',
        'Preencha os dados em "Meu Negócio" antes de definir o modelo padrão dos documentos.',
        [{ text: 'Agora não' }, { text: 'Abrir Meu Negócio', onPress: () => nav.navigate('MeuNegocio') }],
      );
      return;
    }
    const anterior = padrao;
    setPadrao(id); // otimista
    setSalvando(id);
    try {
      await saveEmpresa({ ...empresa, modeloPdfPadrao: id });
      setEmpresa(e => (e ? { ...e, modeloPdfPadrao: id } : e));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      setPadrao(anterior); // reverte se falhar — nunca finge que salvou
      Alert.alert('Ops', 'Não consegui salvar o modelo padrão agora. Tente de novo.');
    } finally {
      setSalvando(null);
    }
  }

  async function escolherRecibo(id: ModeloReciboId) {
    if (id === padraoRecibo) return;
    Haptics.selectionAsync().catch(() => {});
    if (!empresa) {
      Alert.alert(
        'Configure seu negócio',
        'Preencha os dados em "Meu Negócio" antes de definir o modelo padrão dos documentos.',
        [{ text: 'Agora não' }, { text: 'Abrir Meu Negócio', onPress: () => nav.navigate('MeuNegocio') }],
      );
      return;
    }
    const anterior = padraoRecibo;
    setPadraoRecibo(id); // otimista
    setSalvandoRecibo(id);
    try {
      await saveEmpresa({ ...empresa, modeloReciboPadrao: id });
      setEmpresa(e => (e ? { ...e, modeloReciboPadrao: id } : e));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      setPadraoRecibo(anterior); // reverte se falhar
      Alert.alert('Ops', 'Não consegui salvar o modelo de recibo agora. Tente de novo.');
    } finally {
      setSalvandoRecibo(null);
    }
  }

  /**
   * HTML da PRÉVIA de exemplo de cada documento jurídico. Usa o mesmo orçamento
   * fictício das prévias de modelo, então o prestador vê o documento REAL (mesmo
   * gerador do PDF que ele vai enviar), preenchido — e não um mock chapado.
   */
  async function htmlDeExemplo(tipo: TipoDocumento): Promise<string> {
    const emp = empresa ?? EMPRESA_EXEMPLO;
    const orc = orcamentoDeExemplo(padrao, emp.corMarca);
    if (tipo === 'contrato') {
      return montarHtmlContratoCompleto(orc, emp, termosPadraoContrato(orc, emp, emp.contratoPadrao));
    }
    if (tipo === 'garantia') {
      return montarHtmlTermoGarantia(dadosGarantiaDeOrcamento(orc, emp), emp);
    }
    return montarHtmlTermoConclusao(dadosConclusaoDeOrcamento(orc, emp), emp);
  }

  return (
    <View style={styles.container}>
      <GradientHeader
        onBack={() => goBackOrHome(nav)}
        title="Modelos de documento"
        subtitle="O visual e as cláusulas dos seus documentos"
      />

      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.base + insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <AnimatedEntrance>
          <View style={styles.intro}>
            <MaterialCommunityIcons name="palette-swatch-outline" size={18} color={cores.accentLight} />
            <Text style={styles.introText}>
              Escolha os modelos <Text style={styles.introForte}>padrão</Text> dos seus documentos. No orçamento você ainda
              pode trocar na hora de criar. A <Text style={styles.introForte}>sua cor de marca e logo</Text> (em
              Meu Negócio) valem em todos eles.
            </Text>
          </View>
        </AnimatedEntrance>

        <View style={styles.divisor}>
          <Text style={styles.divisorTitulo}>Orçamento</Text>
          <Text style={styles.divisorSub}>O documento que fecha o serviço — 7 modelos.</Text>
        </View>

        {PDF_MODELS.map((m, i) => {
          const ativo = m.id === padrao;
          return (
            <AnimatedEntrance key={m.id} index={Math.min(i, 8)}>
              <TouchableOpacity
                style={[styles.card, ativo && { borderColor: cores.primary, borderWidth: 2 }]}
                onPress={() => escolher(m.id)}
                activeOpacity={0.9}
                accessibilityRole="radio"
                accessibilityState={{ selected: ativo }}
              >
                <View style={[styles.iconChip, { backgroundColor: comAlfa(m.color, 0.16) }]}>
                  <MaterialCommunityIcons name={m.icon} size={24} color={m.color} />
                </View>

                <View style={{ flex: 1 }}>
                  <View style={styles.nomeRow}>
                    <Text style={styles.nome}>{m.nome}</Text>
                    {ativo && (
                      <View style={styles.badgePadrao}>
                        <MaterialCommunityIcons name="check" size={12} color={cores.onPrimary} />
                        <Text style={styles.badgePadraoText}>Padrão</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.desc}>{m.desc}</Text>

                  <TouchableOpacity
                    style={styles.verBtn}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setPreviewModelo(m.id); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons name="eye-outline" size={15} color={cores.accentLight} />
                    <Text style={styles.verBtnText}>Ver exemplo</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.radio}>
                  {salvando === m.id ? (
                    <MaterialCommunityIcons name="loading" size={22} color={cores.primary} />
                  ) : (
                    <MaterialCommunityIcons
                      name={ativo ? 'radiobox-marked' : 'radiobox-blank'}
                      size={22}
                      color={ativo ? cores.primary : cores.onSurfaceMuted}
                    />
                  )}
                </View>
              </TouchableOpacity>
            </AnimatedEntrance>
          );
        })}

        {/* ─── RECIBO ─── */}
        <View style={styles.divisor}>
          <Text style={styles.divisorTitulo}>Recibo</Text>
          <Text style={styles.divisorSub}>O comprovante de pagamento também segue a sua marca.</Text>
        </View>

        {RECIBO_MODELS.map((m, i) => {
          const ativo = m.id === padraoRecibo;
          return (
            <AnimatedEntrance key={m.id} index={Math.min(i, 8)}>
              <TouchableOpacity
                style={[styles.card, ativo && { borderColor: cores.primary, borderWidth: 2 }]}
                onPress={() => escolherRecibo(m.id)}
                activeOpacity={0.9}
                accessibilityRole="radio"
                accessibilityState={{ selected: ativo }}
              >
                <View style={[styles.iconChip, { backgroundColor: comAlfa(m.color, 0.16) }]}>
                  <MaterialCommunityIcons name={m.icon} size={24} color={m.color} />
                </View>

                <View style={{ flex: 1 }}>
                  <View style={styles.nomeRow}>
                    <Text style={styles.nome}>{m.nome}</Text>
                    {ativo && (
                      <View style={styles.badgePadrao}>
                        <MaterialCommunityIcons name="check" size={12} color={cores.onPrimary} />
                        <Text style={styles.badgePadraoText}>Padrão</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.desc}>{m.desc}</Text>

                  <TouchableOpacity
                    style={styles.verBtn}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setPreviewRecibo(m.id); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons name="eye-outline" size={15} color={cores.accentLight} />
                    <Text style={styles.verBtnText}>Ver exemplo</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.radio}>
                  {salvandoRecibo === m.id ? (
                    <MaterialCommunityIcons name="loading" size={22} color={cores.primary} />
                  ) : (
                    <MaterialCommunityIcons
                      name={ativo ? 'radiobox-marked' : 'radiobox-blank'}
                      size={22}
                      color={ativo ? cores.primary : cores.onSurfaceMuted}
                    />
                  )}
                </View>
              </TouchableOpacity>
            </AnimatedEntrance>
          );
        })}

        {/* ─── CONTRATO E TERMOS ─── */}
        <View style={styles.divisor}>
          <Text style={styles.divisorTitulo}>Contrato e termos</Text>
          <Text style={styles.divisorSub}>
            Os documentos que fecham o serviço — preenchidos com o que já está no orçamento.
          </Text>
        </View>

        <View style={styles.avisoJuridico}>
          <MaterialCommunityIcons name="scale-balance" size={16} color={cores.onSurfaceVariant} />
          <Text style={styles.avisoJuridicoTexto}>{AVISO_APP}</Text>
        </View>

        {DOCUMENTOS_JURIDICOS.map((d, i) => (
          <AnimatedEntrance key={d.id} index={Math.min(i, 8)}>
            <View style={styles.card}>
              <View style={[styles.iconChip, { backgroundColor: comAlfa(d.color, 0.16) }]}>
                <MaterialCommunityIcons name={d.icon} size={24} color={d.color} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.nome}>{TITULOS_DOCUMENTO[d.id]}</Text>
                <Text style={styles.desc}>{d.desc}</Text>

                <View style={styles.acoesDoc}>
                  <TouchableOpacity
                    style={styles.acaoDoc}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setExemploDoc(d.id); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver exemplo de ${TITULOS_DOCUMENTO[d.id]}`}
                  >
                    <MaterialCommunityIcons name="eye-outline" size={15} color={cores.accentLight} />
                    <Text style={styles.acaoDocText}>Ver exemplo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.acaoDoc}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setGerarDoc(d.id); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Gerar ${TITULOS_DOCUMENTO[d.id]} a partir de um orçamento`}
                  >
                    <MaterialCommunityIcons name="file-export-outline" size={15} color={cores.accentLight} />
                    <Text style={styles.acaoDocText}>Gerar de um orçamento</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </AnimatedEntrance>
        ))}

        <AnimatedEntrance index={3}>
          <TouchableOpacity
            style={styles.card}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setEditorAberto(true); }}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Editar as cláusulas padrão do contrato"
          >
            <View style={[styles.iconChip, { backgroundColor: comAlfa('#6B7686', 0.16) }]}>
              <MaterialCommunityIcons name="text-box-edit-outline" size={24} color={cores.onSurfaceVariant} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nome}>Cláusulas padrão do contrato</Text>
              <Text style={styles.desc}>Garantia, multa, prazo de rescisão e foro — ajuste uma vez</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={cores.onSurfaceMuted} />
          </TouchableOpacity>
        </AnimatedEntrance>
      </ScrollView>

      <PdfPreviewModal
        visible={previewModelo !== null}
        onClose={() => setPreviewModelo(null)}
        orcamento={orcamentoDeExemplo(previewModelo ?? 'editorial', empresa?.corMarca)}
        empresa={empresa}
        depoimentos={depoimentos}
      />
      <PdfPreviewModal
        visible={previewRecibo !== null}
        onClose={() => setPreviewRecibo(null)}
        empresa={empresa}
        titulo="Prévia do recibo"
        chave={previewRecibo ?? ''}
        construirHtml={() => montarHtmlRecibo(reciboDeExemplo(), empresa ?? EMPRESA_EXEMPLO, { modelo: previewRecibo ?? 'classico', corMarca: empresa?.corMarca })}
      />

      {/* Exemplo (dados fictícios) — mesmo gerador do documento enviado. */}
      <PdfPreviewModal
        visible={exemploDoc !== null}
        onClose={() => setExemploDoc(null)}
        empresa={empresa}
        titulo={exemploDoc ? `Exemplo · ${TITULOS_DOCUMENTO[exemploDoc]}` : 'Exemplo'}
        chave={exemploDoc ?? ''}
        construirHtml={() => htmlDeExemplo(exemploDoc ?? 'contrato')}
        nomeArquivo={exemploDoc ? `exemplo-${exemploDoc}` : undefined}
      />

      {/* Documento REAL, a partir de um orçamento salvo. */}
      <GerarDocumentoModal
        visivel={gerarDoc !== null}
        tipo={gerarDoc ?? 'contrato'}
        empresa={empresa}
        aoFechar={() => setGerarDoc(null)}
      />

      <EditorClausulasContrato
        visivel={editorAberto}
        empresa={empresa}
        aoFechar={() => setEditorAberto(false)}
        aoSalvar={setEmpresa}
      />
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },

  intro: { flexDirection: 'row', gap: 10, backgroundColor: c.accentContainer, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.strokeGlow, padding: Spacing.md },
  introText: { flex: 1, fontSize: 13, color: c.onSurface, lineHeight: 19 },
  introForte: { fontWeight: '800', color: c.onSurface },

  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.md, ...sombrasDe(c).sm },
  iconChip: { width: 48, height: 48, borderRadius: BorderRadius.chip, alignItems: 'center', justifyContent: 'center' },
  nomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nome: { fontSize: 15.5, fontWeight: '800', color: c.onSurface },
  badgePadrao: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.primary, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  badgePadraoText: { fontSize: 10.5, fontWeight: '800', color: c.onPrimary },
  desc: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2 },
  verBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-start' },
  verBtnText: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },

  // Duas ações por card (ver exemplo / gerar). minHeight 44 = alvo de dedo.
  acoesDoc: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginTop: 6 },
  acaoDoc: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 },
  acaoDocText: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  avisoJuridico: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, padding: Spacing.md,
  },
  avisoJuridicoTexto: { flex: 1, fontSize: 12, color: c.onSurfaceVariant, lineHeight: 17 },
  radio: { width: 26, alignItems: 'center' },

  divisor: { marginTop: 10, marginBottom: 2 },
  divisorTitulo: { fontSize: 17, fontWeight: '800', color: c.onSurface },
  divisorSub: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 1 },
});
