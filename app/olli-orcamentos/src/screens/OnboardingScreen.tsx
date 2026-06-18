import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow, Gradients } from '../theme';
import { OlliButton } from '../components/OlliButton';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { OlliMascot } from '../components/OlliMascot';
import { StepIndicator } from '../components/StepIndicator';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { saveEmpresa, saveServico } from '../database/database';
import { Empresa, ServicoItem, Segmento, SEGMENTOS } from '../types';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { track, Eventos } from '../services/analytics';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

export const ONBOARDED_KEY = 'olli.onboarded';

/** Empresa em branco (mesma base de MeuNegocioScreen) para o 1º cadastro. */
function empresaEmBranco(): Empresa {
  return {
    id: 'empresa_1',
    nome: '', especialidade: '', slogan: '', cnpj: '', cpf: '',
    endereco: '', cidade: '', estado: '', telefone: '', whatsapp: '',
    site: '', email: '', chavePix: '', normas: '', nomePrestador: '',
  };
}

const STEPS = ['Negócio', 'Serviço'];

export default function OnboardingScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // passo 1 — essencial do negócio
  const [emp, setEmp] = useState<Empresa>(empresaEmBranco());
  // passo 2 — primeiro serviço (opcional)
  const [servNome, setServNome] = useState('');
  const [servPreco, setServPreco] = useState(0);

  const setField = useCallback((field: keyof Empresa, value: string) => {
    setEmp(p => ({ ...p, [field]: value }));
  }, []);

  function chooseSegmento(id: Segmento) {
    Haptics.selectionAsync().catch(() => {});
    setEmp(p => ({ ...p, segmento: id }));
  }

  // marca como concluído (idempotente) — usado tanto no "pular" quanto no "concluir"
  async function marcarConcluido() {
    try { await AsyncStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* best-effort */ }
  }

  function irParaApp() {
    // reset: o app abre normal nas abas e o usuário não consegue "voltar" para o onboarding
    nav.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'Tabs' }] }),
    );
  }

  async function pular() {
    Haptics.selectionAsync().catch(() => {});
    track(Eventos.onboardingSkipped, { step });
    await marcarConcluido();
    irParaApp();
  }

  function avancar() {
    if (step === 0) {
      if (!emp.nome.trim()) {
        Alert.alert('Falta o nome', 'Conte o nome do seu negócio para continuar.');
        return;
      }
      Haptics.selectionAsync().catch(() => {});
      setStep(1);
    }
  }

  async function concluir() {
    setSaving(true);
    try {
      // o prestador, se em branco, recebe o próprio nome do negócio como fallback
      // (a Home saúda pelo nomePrestador). especialidade reflete o segmento escolhido.
      const segLabel = SEGMENTOS.find(s => s.id === emp.segmento)?.label;
      const empresaFinal: Empresa = {
        ...emp,
        nome: emp.nome.trim(),
        nomePrestador: emp.nomePrestador.trim() || emp.nome.trim(),
        especialidade: emp.especialidade.trim() || segLabel || '',
        whatsapp: emp.whatsapp.replace(/\D/g, ''),
      };
      await saveEmpresa(empresaFinal);
      track(Eventos.empresaSaved, { origem: 'onboarding', segmento: emp.segmento });

      // serviço inicial opcional — só salva se houver nome
      if (servNome.trim()) {
        const s: ServicoItem = {
          id: generateId(),
          nome: servNome.trim(),
          preco: servPreco,
          unidade: 'un',
          criadoEm: nowISO(),
        };
        await saveServico(s);
        track(Eventos.servicoCreated, { origem: 'onboarding' });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      track(Eventos.onboardingCompleted, { comServico: !!servNome.trim() });
      await marcarConcluido();
      irParaApp();
    } catch {
      Alert.alert('Ops', 'Não consegui salvar agora. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* HEADER COM GRADIENTE DA MARCA */}
      <LinearGradient colors={Gradients.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <OlliMascot size={40} onDark float={false} />
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.brand}>Bem-vindo ao OLLI</Text>
              <Text style={styles.brandSub}>Vamos preparar o essencial em 1 minuto</Text>
            </View>
          </View>
          <TouchableOpacity onPress={pular} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Pular configuração">
            <Text style={styles.skip}>Pular</Text>
          </TouchableOpacity>
        </View>
        <StepIndicator steps={STEPS} current={step} />
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 0 ? (
          <AnimatedEntrance index={0}>
            <Text style={styles.title}>Conte sobre o seu negócio</Text>
            <Text style={styles.hint}>Isso aparece no cabeçalho dos seus orçamentos e recibos.</Text>

            <View style={styles.card}>
              <OlliInput label="Nome do negócio" required value={emp.nome} onChangeText={v => setField('nome', v)} placeholder="Ex: Clima Frio Refrigeração" leftIcon="store" />

              <Text style={styles.segLabel}>Qual o seu segmento?</Text>
              <View style={styles.segRow}>
                {SEGMENTOS.map(s => {
                  const active = emp.segmento === s.id;
                  return (
                    <TouchableOpacity key={s.id} style={[styles.segChip, active && styles.segChipActive]} onPress={() => chooseSegmento(s.id)} activeOpacity={0.85}>
                      <MaterialCommunityIcons name={s.icon as any} size={16} color={active ? '#0A1626' : Colors.onSurfaceVariant} />
                      <Text style={[styles.segChipText, active && styles.segChipTextActive]}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <OlliInput label="Seu nome (prestador)" value={emp.nomePrestador} onChangeText={v => setField('nomePrestador', v)} placeholder="Ex: João da Silva" leftIcon="account" />
              <OlliInput label="WhatsApp / Telefone" mask="phone" value={emp.whatsapp} onChangeText={v => setField('whatsapp', v)} placeholder="(11) 99999-9999" leftIcon="whatsapp" containerStyle={{ marginBottom: 0 }} />
            </View>

            <View style={styles.assure}>
              <MaterialCommunityIcons name="lock-outline" size={15} color={Colors.accentLight} />
              <Text style={styles.assureText}>Seus dados ficam no seu aparelho. Você completa o resto depois em “Meu Negócio”.</Text>
            </View>
          </AnimatedEntrance>
        ) : (
          <AnimatedEntrance index={0}>
            <Text style={styles.title}>Cadastre seu primeiro serviço</Text>
            <Text style={styles.hint}>Com um serviço no catálogo, você monta orçamentos em segundos. (Opcional)</Text>

            <View style={styles.card}>
              <OlliInput label="Nome do serviço" value={servNome} onChangeText={setServNome} placeholder="Ex: Limpeza de ar-condicionado split" leftIcon="wrench" />
              <OlliMoneyInput label="Preço de venda" value={servPreco} onChangeValue={setServPreco} containerStyle={{ marginBottom: 0 }} />
            </View>

            <View style={styles.assure}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={15} color={Colors.accentLight} />
              <Text style={styles.assureText}>Sem pressa: dá para deixar em branco e cadastrar vários serviços depois, em “Serviços”.</Text>
            </View>
          </AnimatedEntrance>
        )}
      </ScrollView>

      {/* AÇÕES */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 18 }]}>
        {step === 0 ? (
          <OlliButton
            label="Continuar"
            variant="gradient" size="lg" fullWidth
            onPress={avancar}
            disabled={!emp.nome.trim()}
            icon={<MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />}
          />
        ) : (
          <View style={styles.footerRow}>
            <OlliButton label="Voltar" variant="outline" size="lg" onPress={() => setStep(0)} haptic={false} icon={<MaterialCommunityIcons name="chevron-left" size={18} color={Colors.primary} />} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <OlliButton
                label={servNome.trim() ? 'Concluir e começar' : 'Começar a usar'}
                variant="gradient" size="lg" fullWidth
                loading={saving}
                onPress={concluir}
                icon={<MaterialCommunityIcons name="check-circle" size={20} color="#fff" />}
              />
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.base },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  brand: { fontSize: 18, fontWeight: '800', color: '#fff' },
  brandSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.78)', marginTop: 2 },
  skip: { fontSize: 14, fontWeight: '700', color: Colors.accentLight },

  title: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3, marginTop: Spacing.sm },
  hint: { fontSize: 13.5, color: Colors.onSurfaceVariant, marginTop: 4, marginBottom: Spacing.lg, lineHeight: 19 },

  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: Spacing.base, ...Shadow.sm },

  segLabel: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant, marginBottom: 8 },
  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.base },
  segChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: Colors.outline, backgroundColor: Colors.surfaceVariant },
  segChipActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accentLight },
  segChipText: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant },
  segChipTextActive: { color: '#0A1626' },

  assure: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: Spacing.base, paddingHorizontal: 4 },
  assureText: { flex: 1, fontSize: 12.5, color: Colors.onSurfaceVariant, lineHeight: 18 },

  footer: { paddingHorizontal: Spacing.base, paddingTop: 12, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.outline },
  footerRow: { flexDirection: 'row', alignItems: 'center' },
});
