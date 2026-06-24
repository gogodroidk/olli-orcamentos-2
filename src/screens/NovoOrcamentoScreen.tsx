import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing } from '../theme';
import { StepIndicator } from '../components/StepIndicator';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { getOrcamento, getNextOrcamentoNumber, saveOrcamento, getClientes } from '../database/database';
import { Orcamento, ItemOrcamento, FormaPagamento, Cliente } from '../types';
import { generateId } from '../utils/id';
import { nowISO, todayISO } from '../utils/date';
import { formatCurrency } from '../utils/currency';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';

// Steps
import Step1Cliente from '../steps/Step1Cliente';
import Step2Itens from '../steps/Step2Itens';
import Step3Detalhes from '../steps/Step3Detalhes';
import Step4Personalizacao from '../steps/Step4Personalizacao';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'NovoOrcamento'>;

const STEPS = ['Cliente', 'Itens', 'Detalhes', 'Personalizar'];
const useNativeAnimations = Platform.OS !== 'web';

const defaultFormas: FormaPagamento = { credito: false, debito: false, dinheiro: false, pix: true };
const PDF_MODEL_LABELS: Record<string, string> = {
  editorial: 'Editorial',
  minimalista: 'Minimalista',
  bold: 'Bold',
  classico: 'Classico',
  faixa_lateral: 'Faixa lateral',
  recibo_compacto: 'Recibo compacto',
};

function emptyOrcamento(numero: string): Orcamento {
  return {
    id: generateId(),
    numero,
    clienteId: '',
    clienteNome: '',
    clienteTelefone: '',
    itens: [],
    subtotalServicos: 0,
    subtotalProdutos: 0,
    subtotal: 0,
    desconto: 0,
    descontoTipo: 'valor',
    valorTotal: 0,
    status: 'rascunho',
    dataEmissao: todayISO(),
    formasPagamento: defaultFormas,
    exibirAssinatura: true,
    solicitarAssinaturaCliente: false,
    exibirAprovacao: true,
    exibirRecusa: true,
    criadoEm: nowISO(),
    atualizadoEm: nowISO(),
  };
}

/** Mapeia um Cliente para os campos de cliente do orçamento (igual ao Step1Cliente). */
function clienteParaOrc(c: Cliente): Partial<Orcamento> {
  return {
    clienteId: c.id,
    clienteNome: c.nome,
    clienteTelefone: c.telefone,
    clienteCpfCnpj: c.cpf ?? c.cnpj,
    clienteEndereco: c.endereco
      ? [c.endereco, c.complemento, c.cidade, c.estado].filter(Boolean).join(', ')
      : undefined,
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function calcTotais(o: Orcamento): Orcamento {
  const servicos = round2(o.itens.filter(i => i.tipo === 'servico').reduce((s, i) => s + i.subtotal, 0));
  const produtos = round2(o.itens.filter(i => i.tipo === 'produto').reduce((s, i) => s + i.subtotal, 0));
  const subtotal = round2(servicos + produtos);
  let desconto = o.desconto;
  if (o.descontoTipo === 'percentual') {
    desconto = subtotal * (o.desconto / 100);
  }
  desconto = round2(desconto);
  const valorTotal = round2(Math.max(0, subtotal - desconto));
  return { ...o, subtotalServicos: servicos, subtotalProdutos: produtos, subtotal, valorTotal };
}

export default function NovoOrcamentoScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const isEdit = (route.name as string) === 'EditarOrcamento';
  const orcamentoId = (route.params as any)?.orcamentoId;

  // Params de pré-carga (CRM): cliente pré-selecionado e/ou 1 item vindo de um
  // diagnóstico / código de erro. Lidos só na criação (não no modo edição).
  const prefillClienteId = (route.params as any)?.clienteId as string | undefined;
  const prefillItem = (route.params as any)?.prefillItem as
    | { tipo: 'servico' | 'produto'; nome: string; descricao?: string }
    | undefined;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [orc, setOrc] = useState<Orcamento | null>(null);
  const slide = useRef(new Animated.Value(0)).current;

  const animateStep = useCallback((dir: 1 | -1) => {
    slide.setValue(dir * 40);
    Animated.spring(slide, { toValue: 0, useNativeDriver: useNativeAnimations, friction: 9, tension: 60 }).start();
  }, [slide]);

  function goNext() {
    if (!canAdvance()) return;
    Haptics.selectionAsync().catch(() => {});
    setStep(s => s + 1);
    animateStep(1);
  }

  useEffect(() => {
    async function init() {
      if (isEdit && orcamentoId) {
        const existing = await getOrcamento(orcamentoId);
        if (existing) {
          setOrc(existing);
          return;
        }
      }
      const numero = await getNextOrcamentoNumber();
      let base = emptyOrcamento(numero);

      // Pré-seleciona o cliente (mesmos campos que o Step1Cliente preenche).
      if (prefillClienteId) {
        const cliente = (await getClientes()).find(c => c.id === prefillClienteId);
        if (cliente) base = { ...base, ...clienteParaOrc(cliente) };
      }

      // Pré-carrega 1 item (descrição de diagnóstico/código) para o usuário só ajustar preço.
      if (prefillItem?.nome?.trim()) {
        const item: ItemOrcamento = {
          id: generateId(),
          tipo: prefillItem.tipo,
          catalogoId: '',
          nome: prefillItem.nome.trim(),
          descricao: prefillItem.descricao?.trim() || undefined,
          preco: 0,
          quantidade: 1,
          unidade: 'un',
          subtotal: 0,
        };
        base = calcTotais({ ...base, itens: [item] });
      }

      setOrc(base);
    }
    init();
  }, []);

  function update(partial: Partial<Orcamento>) {
    setOrc(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...partial, atualizadoEm: nowISO() };
      return calcTotais(updated);
    });
  }

  function updateItens(itens: ItemOrcamento[]) {
    const newItens = itens.map(i => ({ ...i, subtotal: round2(i.preco * i.quantidade) }));
    update({ itens: newItens });
  }

  function canAdvance(): boolean {
    if (!orc) return false;
    if (step === 0) return !!orc.clienteNome.trim();
    if (step === 1) return orc.itens.length > 0;
    return true;
  }

  async function handleSave(finalOrc?: Partial<Orcamento>) {
    if (!orc) return;
    setSaving(true);
    const toSave: Orcamento = {
      ...orc,
      ...(finalOrc ?? {}),
      atualizadoEm: nowISO(),
    };
    await saveOrcamento(calcTotais(toSave));
    setSaving(false);
    nav.replace('VisualizarOrcamento', { orcamentoId: toSave.id });
  }

  async function handleRascunho() {
    if (!orc) return;
    setSaving(true);
    await saveOrcamento(calcTotais({ ...orc, atualizadoEm: nowISO() }));
    setSaving(false);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert('Orcamento salvo como rascunho.');
      goBackOrHome(nav);
      return;
    }
    Alert.alert('Salvo!', 'Orçamento salvo como rascunho.', [
      { text: 'OK', onPress: () => goBackOrHome(nav) },
    ]);
  }

  function handleBack() {
    if (step === 0) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        if (window.confirm('Deseja descartar este orcamento?')) {
          goBackOrHome(nav);
        }
        return;
      }
      Alert.alert('Cancelar orçamento', 'Deseja descartar este orçamento?', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: () => goBackOrHome(nav) },
      ]);
      return;
    }
    setStep(s => s - 1);
    animateStep(-1);
  }

  if (!orc) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  const clienteResumo = orc.clienteNome.trim() || 'sem cliente';
  const modeloResumo = orc.modeloNome ?? (orc.modeloPdf ? PDF_MODEL_LABELS[orc.modeloPdf] ?? orc.modeloPdf : '');
  const itemResumo = `${orc.itens.length} ${orc.itens.length === 1 ? 'item' : 'itens'}`;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <GradientHeader
        title={isEdit ? 'Editar orçamento' : 'Novo orçamento'}
        subtitle={`Nº ${orc.numero} · Passo ${step + 1} de 4`}
        onBack={handleBack}
        compact
        right={
          <TouchableOpacity
            style={styles.voiceBtn}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              nav.navigate('OlliVoz');
            }}
            accessibilityRole="button"
            accessibilityHint="Abre a OLLI Voz para preencher cliente e itens deste orçamento."
            accessibilityLabel="Preencher orçamento por voz"
          >
            <MaterialCommunityIcons name="microphone" size={16} color="#fff" />
            <Text style={styles.voiceText} numberOfLines={1}>Preencher por voz</Text>
          </TouchableOpacity>
        }
      >
        <StepIndicator steps={STEPS} current={step} />
      </GradientHeader>

      <Animated.View style={[styles.content, { transform: [{ translateX: slide }] }]}>
        {step === 0 && <Step1Cliente orc={orc} onChange={update} />}
        {step === 1 && <Step2Itens orc={orc} onChangeItens={updateItens} onChangeOrc={update} />}
        {step === 2 && <Step3Detalhes orc={orc} onChange={update} />}
        {step === 3 && <Step4Personalizacao orc={orc} onChange={update} />}
      </Animated.View>

      <View
        style={styles.quoteSummary}
        accessible
        accessibilityLabel={`Resumo do orçamento. Total ${formatCurrency(orc.valorTotal)}. ${itemResumo}. Cliente ${clienteResumo}${modeloResumo ? `. Modelo PDF ${modeloResumo}` : ''}.`}
      >
        <View style={styles.summaryTotalBlock}>
          <Text style={styles.summaryLabel}>Valor total</Text>
          <Text style={styles.summaryTotal} numberOfLines={1}>{formatCurrency(orc.valorTotal)}</Text>
        </View>

        <View style={styles.summaryMeta}>
          <View style={styles.summaryChip}>
            <MaterialCommunityIcons name="format-list-bulleted" size={13} color={Colors.accentLight} />
            <Text style={styles.summaryChipText} numberOfLines={1}>{itemResumo}</Text>
          </View>
          <View style={[styles.summaryChip, styles.summaryChipFlex]}>
            <MaterialCommunityIcons name="account-outline" size={13} color={Colors.accentLight} />
            <Text style={styles.summaryChipText} numberOfLines={1}>{clienteResumo}</Text>
          </View>
          {modeloResumo ? (
            <View style={styles.summaryChip}>
              <MaterialCommunityIcons name="file-document-outline" size={13} color={Colors.accentLight} />
              <Text style={styles.summaryChipText} numberOfLines={1}>{modeloResumo}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* BOTTOM ACTIONS */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={Colors.primary} />
          <Text style={styles.backLabel}>{step === 0 ? 'Cancelar' : 'Voltar'}</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
          {step < 3 ? (
            <>
              <OlliButton label="Rascunho" variant="outline" size="md" onPress={handleRascunho} loading={saving} haptic={false} />
              <OlliButton
                label="Avançar"
                variant="gradient"
                size="md"
                onPress={goNext}
                disabled={!canAdvance()}
                icon={<MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />}
              />
            </>
          ) : (
            <OlliButton
              label="Gerar orçamento"
              variant="gradient"
              size="md"
              onPress={() => handleSave()}
              loading={saving}
              disabled={!canAdvance()}
              icon={<MaterialCommunityIcons name="check-circle" size={18} color="#fff" />}
            />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1 },
  quoteSummary: {
    backgroundColor: Colors.surfaceGlass,
    borderTopWidth: 1,
    borderTopColor: Colors.outline,
    paddingHorizontal: Spacing.base,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  summaryTotalBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryLabel: { fontSize: 12, color: Colors.onSurfaceVariant, fontWeight: '700' },
  summaryTotal: { fontSize: 22, fontWeight: '900', color: Colors.onSurface },
  summaryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  summaryChip: {
    minHeight: 27,
    maxWidth: 128,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.strokeGlow,
    backgroundColor: 'rgba(52,198,217,0.08)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  summaryChipFlex: { flex: 1, maxWidth: 168 },
  summaryChipText: { flexShrink: 1, fontSize: 11.5, fontWeight: '800', color: Colors.onSurface },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surfaceGlass,
    borderTopWidth: 1, borderTopColor: Colors.outline,
    paddingHorizontal: Spacing.base,
    paddingVertical: 12,
    gap: 8,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  backLabel: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  voiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#7C3AED',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    maxWidth: 154,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  voiceText: { fontSize: 12, fontWeight: '800', color: '#fff' },
});
