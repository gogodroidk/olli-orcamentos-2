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
import { PDF_MODELS } from '../steps/Step4Personalizacao';
import { getEmpresa, saveEmpresa, getDepoimentos } from '../database/database';
import { Empresa, Depoimento, ItemOrcamento, ModeloPdfId, Orcamento } from '../types';
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

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const [emp, deps] = await Promise.all([getEmpresa(), getDepoimentos()]);
        setEmpresa(emp);
        setDepoimentos(deps);
        if (emp?.modeloPdfPadrao) setPadrao(emp.modeloPdfPadrao);
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

  return (
    <View style={styles.container}>
      <GradientHeader
        onBack={() => goBackOrHome(nav)}
        title="Modelos de documento"
        subtitle="O visual dos seus orçamentos"
      />

      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.base + insets.bottom + 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <AnimatedEntrance>
          <View style={styles.intro}>
            <MaterialCommunityIcons name="palette-swatch-outline" size={18} color={cores.accentLight} />
            <Text style={styles.introText}>
              Escolha o modelo <Text style={styles.introForte}>padrão</Text> dos seus orçamentos. Você ainda pode
              trocar em cada orçamento na hora de criar. A <Text style={styles.introForte}>sua cor de marca e logo</Text> (em
              Meu Negócio) valem em todos eles.
            </Text>
          </View>
        </AnimatedEntrance>

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

        <View style={styles.notaRecibo}>
          <MaterialCommunityIcons name="receipt-text-outline" size={16} color={cores.onSurfaceVariant} />
          <Text style={styles.notaReciboText}>
            Os <Text style={styles.introForte}>recibos</Text> usam um layout compacto próprio, já com a sua cor de marca e
            logo. Modelos alternativos de recibo estão a caminho.
          </Text>
        </View>
      </ScrollView>

      <PdfPreviewModal
        visible={previewModelo !== null}
        onClose={() => setPreviewModelo(null)}
        orcamento={orcamentoDeExemplo(previewModelo ?? 'editorial', empresa?.corMarca)}
        empresa={empresa}
        depoimentos={depoimentos}
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
  iconChip: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nome: { fontSize: 15.5, fontWeight: '800', color: c.onSurface },
  badgePadrao: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.primary, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  badgePadraoText: { fontSize: 10.5, fontWeight: '800', color: c.onPrimary },
  desc: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2 },
  verBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-start' },
  verBtnText: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  radio: { width: 26, alignItems: 'center' },

  notaRecibo: { flexDirection: 'row', gap: 8, backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, padding: Spacing.md, marginTop: 4 },
  notaReciboText: { flex: 1, fontSize: 12, color: c.onSurfaceVariant, lineHeight: 18 },
});
