import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing } from '../theme';
import { StepIndicator } from '../components/StepIndicator';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { getOrcamento, getNextOrcamentoNumber, saveOrcamento } from '../database/database';
import { Orcamento, ItemOrcamento, FormaPagamento } from '../types';
import { generateId } from '../utils/id';
import { nowISO, todayISO } from '../utils/date';
import { RootStackParamList } from '../navigation/AppNavigator';

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

function calcTotais(o: Orcamento): Orcamento {
  const servicos = o.itens.filter(i => i.tipo === 'servico').reduce((s, i) => s + i.subtotal, 0);
  const produtos = o.itens.filter(i => i.tipo === 'produto').reduce((s, i) => s + i.subtotal, 0);
  const subtotal = servicos + produtos;
  let desconto = o.desconto;
  if (o.descontoTipo === 'percentual') {
    desconto = subtotal * (o.desconto / 100);
  }
  const valorTotal = Math.max(0, subtotal - desconto);
  return { ...o, subtotalServicos: servicos, subtotalProdutos: produtos, subtotal, valorTotal };
}

export default function NovoOrcamentoScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const isEdit = (route.name as string) === 'EditarOrcamento';
  const orcamentoId = (route.params as any)?.orcamentoId;

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
      setOrc(emptyOrcamento(numero));
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
    const newItens = itens.map(i => ({ ...i, subtotal: i.preco * i.quantidade }));
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
      status: orc.status === 'rascunho' ? 'enviado' : orc.status,
      atualizadoEm: nowISO(),
    };
    await saveOrcamento(calcTotais(toSave));
    setSaving(false);
    nav.navigate('VisualizarOrcamento', { orcamentoId: toSave.id });
  }

  async function handleRascunho() {
    if (!orc) return;
    setSaving(true);
    await saveOrcamento(calcTotais({ ...orc, atualizadoEm: nowISO() }));
    setSaving(false);
    Alert.alert('Salvo!', 'Orçamento salvo como rascunho.', [
      { text: 'OK', onPress: () => nav.goBack() },
    ]);
  }

  function handleBack() {
    if (step === 0) {
      Alert.alert('Cancelar orçamento', 'Deseja descartar este orçamento?', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: () => nav.goBack() },
      ]);
      return;
    }
    setStep(s => s - 1);
    animateStep(-1);
  }

  if (!orc) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

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
      >
        <StepIndicator steps={STEPS} current={step} />
      </GradientHeader>

      <Animated.View style={[styles.content, { transform: [{ translateX: slide }] }]}>
        {step === 0 && <Step1Cliente orc={orc} onChange={update} />}
        {step === 1 && <Step2Itens orc={orc} onChangeItens={updateItens} onChangeOrc={update} />}
        {step === 2 && <Step3Detalhes orc={orc} onChange={update} />}
        {step === 3 && <Step4Personalizacao orc={orc} onChange={update} />}
      </Animated.View>

      {/* BOTTOM ACTIONS */}
      <View style={styles.footer}>
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
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.outline,
    paddingHorizontal: Spacing.base,
    paddingVertical: 12,
    paddingBottom: 26,
    gap: 8,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  backLabel: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
});
