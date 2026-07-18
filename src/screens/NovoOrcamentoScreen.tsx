import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Spacing, useCores, useEstilos, comAlfa, textoSobre, type Cores } from '../theme';
import { Motion, useReducedMotion } from '../theme/motion';
import { avisar, confirmar } from './desktop/dialogo';
import { StepIndicator } from '../components/StepIndicator';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { Celebracao } from '../components/Celebracao';
import { getOrcamento, getNextOrcamentoNumber, saveOrcamento, getClientes, getEmpresa } from '../database/database';
import { Orcamento, ItemOrcamento, FormaPagamento, Cliente, Empresa } from '../types';
import { generateId } from '../utils/id';
import { nowISO, todayISO } from '../utils/date';
import { formatCurrency } from '../utils/currency';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { track, Eventos } from '../services/analytics';

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
  premium_capa: 'Premium com capa',
};

/** Data de hoje + N dias, já formatada em DD/MM/AAAA (mesmo padrão do Step4Personalizacao). */
function validadeEmDias(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Orçamento em branco, já com os padrões de negócio da empresa (quando
 * cadastrados em "Meu Negócio" > Personalização) para o técnico não precisar
 * redigitar validade/garantia/condições/observações/PIX em todo orçamento
 * novo — ele ainda pode sobrescrever qualquer campo nos passos seguintes.
 */
function emptyOrcamento(numero: string, empresa: Empresa | null): Orcamento {
  const validadeDias = empresa?.validadeDiasPadrao ?? 15;
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
    // Validade padrão vem da empresa (ou 15 dias) — evita orçamento sair sem
    // prazo algum (o técnico pode ajustar/limpar depois em Step4Personalizacao).
    validadeOrcamento: validadeEmDias(validadeDias),
    garantia: empresa?.garantiaPadrao || undefined,
    condicoesPagamento: empresa?.condicoesPagamentoPadrao || undefined,
    informacoesAdicionais: empresa?.observacoesPadrao || undefined,
    chavePix: empresa?.chavePix || undefined,
    corMarca: empresa?.corMarca || undefined,
    // Modelo de PDF padrão escolhido em Conta → Modelos de documento (o técnico
    // ainda troca por orçamento em Step4). Sem padrão, Step4 assume 'editorial'.
    modeloPdf: empresa?.modeloPdfPadrao || undefined,
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
  // Desconto em valor fixo (R$) é reclampado ao subtotal atual sempre que os
  // itens mudarem, para não ficar "preso" a um valor maior que os itens que
  // restaram (ex.: desconto de R$100 definido com R$500 em itens, depois o
  // técnico apaga itens e sobra R$50 — o desconto exibido cai para R$50).
  const descontoBruto = o.descontoTipo === 'valor'
    ? round2(Math.max(0, Math.min(subtotal, o.desconto)))
    : round2(o.desconto);
  const desconto = o.descontoTipo === 'percentual'
    ? round2(subtotal * (descontoBruto / 100))
    : descontoBruto;
  const valorTotal = round2(Math.max(0, subtotal - desconto));
  // Sinal/entrada em VALOR (R$) também é reclampado ao novo total, pela mesma razão do
  // desconto: um sinal definido com o total maior não pode ficar PRESO acima do total
  // quando os itens caem — senão o Pix/PDF cobraria MAIS que o próprio orçamento. O modo
  // PERCENTUAL (sinalValor ausente) fica intacto: um % é sempre válido sobre qualquer total.
  const sinalValor = o.sinalValor && o.sinalValor > 0 ? round2(Math.min(o.sinalValor, valorTotal)) : o.sinalValor;
  const sinalPercentual = sinalValor && sinalValor > 0 && valorTotal > 0
    ? Math.round((sinalValor / valorTotal) * 100)
    : o.sinalPercentual;
  return { ...o, subtotalServicos: servicos, subtotalProdutos: produtos, subtotal, desconto: descontoBruto, valorTotal, sinalValor, sinalPercentual };
}

export default function NovoOrcamentoScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const isEdit = (route.name as string) === 'EditarOrcamento';
  const orcamentoId = (route.params as any)?.orcamentoId;

  // Params de pré-carga (CRM): cliente pré-selecionado e/ou 1 item vindo de um
  // diagnóstico / código de erro. Lidos só na criação (não no modo edição).
  const prefillClienteId = (route.params as any)?.clienteId as string | undefined;
  const prefillItem = (route.params as any)?.prefillItem as
    | { tipo: 'servico' | 'produto'; nome: string; descricao?: string; quantidade?: number }
    | undefined;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [orc, setOrc] = useState<Orcamento | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  // Celebração ao gerar com sucesso (só na criação — editar não repete a festa).
  // Navega para VisualizarOrcamento só depois do onDone, para o usuário ver o overlay.
  const [celebrando, setCelebrando] = useState(false);
  const pendingNavRef = useRef<string | null>(null);
  // IDs de itens com preço R$ 0,00 que o usuário já confirmou explicitamente
  // como cortesia/brinde (via Alert em Step2Itens). Persiste entre trocas de
  // step porque vive no componente pai, que não desmonta.
  const [itensZeroConfirmados, setItensZeroConfirmados] = useState<Set<string>>(new Set());
  const slide = useRef(new Animated.Value(0)).current;
  // Fade acompanha o slide na troca de passo: some rapidinho e reaparece já
  // no lugar novo, reforçando a sensação de "página virou" (não só deslizou).
  const fade = useRef(new Animated.Value(1)).current;
  // Preenchimento animado da barra de progresso do wizard (0 a 1 = passo 1 a 4).
  const stepProgress = useRef(new Animated.Value(0)).current;
  const reduzirMovimento = useReducedMotion();

  const animateStep = useCallback((dir: 1 | -1, novoStep: number) => {
    const progressoFinal = novoStep / (STEPS.length - 1);
    // reduced-motion: troca de passo direto no estado final — sem slide, sem
    // fade, sem preenchimento animado da barra de progresso.
    if (reduzirMovimento) {
      slide.setValue(0);
      fade.setValue(1);
      stepProgress.setValue(progressoFinal);
      return;
    }
    slide.setValue(dir * 40);
    fade.setValue(0);
    Animated.parallel([
      Animated.spring(slide, { toValue: 0, useNativeDriver: useNativeAnimations, friction: 9, tension: 60 }),
      Animated.timing(fade, { toValue: 1, duration: Motion.dur.base, easing: Motion.easing.standard, useNativeDriver: useNativeAnimations }),
    ]).start();
    Animated.timing(stepProgress, {
      toValue: progressoFinal,
      duration: Motion.dur.base,
      easing: Motion.easing.standard,
      useNativeDriver: false,
    }).start();
  }, [slide, fade, stepProgress, reduzirMovimento]);

  function goNext() {
    if (!canAdvance()) return;
    Haptics.selectionAsync().catch(() => {});
    const novoStep = step + 1;
    setStep(novoStep);
    animateStep(1, novoStep);
  }

  useEffect(() => {
    async function init() {
      // Carregada primeiro porque tanto a edição (Step4 precisa dela pro
      // default de cor) quanto a criação (padrões pré-preenchidos) dependem
      // da empresa já estar em mãos antes de montar o orçamento.
      const emp = await getEmpresa();
      setEmpresa(emp);

      if (isEdit && orcamentoId) {
        const existing = await getOrcamento(orcamentoId);
        if (existing) {
          setOrc(existing);
          // Itens de um orçamento já salvo (fora deste fluxo) com preço 0 são
          // tratados como já confirmados, para não travar a edição de um
          // orçamento antigo pedindo reconfirmação de itens que já existiam.
          const idsZeroExistentes = existing.itens.filter(i => i.preco <= 0).map(i => i.id);
          if (idsZeroExistentes.length > 0) {
            setItensZeroConfirmados(new Set(idsZeroExistentes));
          }
          return;
        }
      }
      const numero = await getNextOrcamentoNumber();
      let base = emptyOrcamento(numero, emp);

      // Pré-seleciona o cliente (mesmos campos que o Step1Cliente preenche).
      if (prefillClienteId) {
        const cliente = (await getClientes()).find(c => c.id === prefillClienteId);
        if (cliente) base = { ...base, ...clienteParaOrc(cliente) };
      }

      // Pré-carrega 1 item (descrição de diagnóstico/código) para o usuário só ajustar preço.
      if (prefillItem?.nome?.trim()) {
        const qtdPrefill =
          typeof prefillItem.quantidade === 'number' && prefillItem.quantidade > 0
            ? prefillItem.quantidade
            : 1;
        const item: ItemOrcamento = {
          id: generateId(),
          tipo: prefillItem.tipo,
          catalogoId: '',
          nome: prefillItem.nome.trim(),
          descricao: prefillItem.descricao?.trim() || undefined,
          preco: 0,
          quantidade: qtdPrefill,
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
    // Limpa do set de confirmados os ids que não existem mais na lista.
    const idsAtuais = new Set(newItens.map(i => i.id));
    setItensZeroConfirmados(prev => {
      const filtered = new Set([...prev].filter(id => idsAtuais.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
  }

  function confirmarItemZero(id: string) {
    setItensZeroConfirmados(prev => new Set(prev).add(id));
  }

  function canAdvance(): boolean {
    if (!orc) return false;
    if (step === 0) return !!orc.clienteNome.trim();
    if (step === 1) {
      if (orc.itens.length === 0) return false;
      // Item com preço 0 só passa se já foi confirmado como cortesia/brinde.
      return orc.itens.every(i => i.preco > 0 || itensZeroConfirmados.has(i.id));
    }
    return true;
  }

  async function handleSave(finalOrc?: Partial<Orcamento>) {
    if (!orc) return;
    setSaving(true);
    try {
      const toSave: Orcamento = {
        ...orc,
        ...(finalOrc ?? {}),
        atualizadoEm: nowISO(),
      };
      await saveOrcamento(calcTotais(toSave));
      // Celebração só na criação (editar um orçamento existente não repete a
      // festa) — o overlay dispara e a navegação real acontece no onDone dele,
      // pra dar tempo do usuário ver a animação antes de trocar de tela.
      if (!isEdit) {
        track(Eventos.quoteCreated, { origem: 'manual', itens: toSave.itens.length });
        pendingNavRef.current = toSave.id;
        setCelebrando(true);
      } else {
        nav.replace('VisualizarOrcamento', { orcamentoId: toSave.id });
      }
    } catch {
      avisar('Não foi possível salvar', 'Tente novamente em instantes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRascunho() {
    if (!orc) return;
    setSaving(true);
    try {
      await saveOrcamento(calcTotais({ ...orc, atualizadoEm: nowISO() }));
      if (!isEdit) track(Eventos.quoteCreated, { origem: 'manual', itens: orc.itens.length, rascunho: true });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        avisar('Rascunho salvo', 'Seu orçamento foi salvo como rascunho.');
        goBackOrHome(nav);
        return;
      }
      // Feedback não bloqueante: haptic de sucesso + volta direto, sem exigir
      // toque em "OK" para sair (o aviso só entra no caminho de erro abaixo).
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      goBackOrHome(nav);
    } catch {
      avisar('Não foi possível salvar', 'Tente novamente em instantes.');
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (step === 0) {
      void confirmar('Descartar orçamento?', 'As informações preenchidas serão perdidas.')
        .then(ok => { if (ok) goBackOrHome(nav); });
      return;
    }
    const novoStep = step - 1;
    setStep(novoStep);
    animateStep(-1, novoStep);
  }

  function finalizarCelebracao() {
    setCelebrando(false);
    const id = pendingNavRef.current;
    pendingNavRef.current = null;
    if (id) nav.replace('VisualizarOrcamento', { orcamentoId: id });
  }

  if (!orc) {
    return <View style={{ flex: 1, backgroundColor: cores.background }} />;
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
            <MaterialCommunityIcons name="microphone" size={16} color={textoSobre(cores.voice)} />
            <Text style={styles.voiceText} numberOfLines={1}>Preencher por voz</Text>
          </TouchableOpacity>
        }
      >
        <StepIndicator steps={STEPS} current={step} />
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: stepProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </GradientHeader>

      <Animated.View style={[styles.content, { opacity: fade, transform: [{ translateX: slide }] }]}>
        {step === 0 && <Step1Cliente orc={orc} onChange={update} />}
        {step === 1 && (
          <Step2Itens
            orc={orc}
            onChangeItens={updateItens}
            onChangeOrc={update}
            itensZeroConfirmados={itensZeroConfirmados}
            onConfirmarItemZero={confirmarItemZero}
          />
        )}
        {step === 2 && <Step3Detalhes orc={orc} onChange={update} empresa={empresa} />}
        {step === 3 && <Step4Personalizacao orc={orc} onChange={update} empresa={empresa} />}
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
            <MaterialCommunityIcons name="format-list-bulleted" size={13} color={cores.accentLight} />
            <Text style={styles.summaryChipText} numberOfLines={1}>{itemResumo}</Text>
          </View>
          <View style={[styles.summaryChip, styles.summaryChipFlex]}>
            <MaterialCommunityIcons name="account-outline" size={13} color={cores.accentLight} />
            <Text style={styles.summaryChipText} numberOfLines={1}>{clienteResumo}</Text>
          </View>
          {modeloResumo ? (
            <View style={styles.summaryChip}>
              <MaterialCommunityIcons name="file-document-outline" size={13} color={cores.accentLight} />
              <Text style={styles.summaryChipText} numberOfLines={1}>{modeloResumo}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* BOTTOM ACTIONS */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={cores.primary} />
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

      <Celebracao visible={celebrando} tipo="gerado" onDone={finalizarCelebracao} />
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { flex: 1 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    // Trilho translúcido branco DENTRO do GradientHeader (que é sempre um
    // gradiente colorido, nos dois modos) — mesma convenção de glass do
    // próprio GradientHeader, por isso fica fixo em vez de seguir o tema.
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: c.accentLight,
  },
  quoteSummary: {
    backgroundColor: c.surfaceGlass,
    borderTopWidth: 1,
    borderTopColor: c.outline,
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
  summaryLabel: { fontSize: 12, color: c.onSurfaceVariant, fontWeight: '700' },
  summaryTotal: { fontSize: 22, fontWeight: '900', color: c.onSurface },
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
    borderColor: c.strokeGlow,
    // rgba(52,198,217,x) era o accent estático — vira o accent do tema.
    backgroundColor: comAlfa(c.accent, 0.08),
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  summaryChipFlex: { flex: 1, maxWidth: 168 },
  summaryChipText: { flexShrink: 1, fontSize: 11.5, fontWeight: '800', color: c.onSurface },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: c.surfaceGlass,
    borderTopWidth: 1, borderTopColor: c.outline,
    paddingHorizontal: Spacing.base,
    paddingVertical: 12,
    gap: 8,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  backLabel: { fontSize: 14, color: c.primary, fontWeight: '600' },
  voiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.voice,
    borderRadius: 13,
    // Borda translúcida branca — mesma convenção de glass do GradientHeader
    // (este botão vive dentro do header, sempre colorido); fixa nos dois modos.
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    maxWidth: 154,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  voiceText: { fontSize: 12, fontWeight: '800', color: textoSobre(c.voice) },
});
