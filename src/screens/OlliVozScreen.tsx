import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  Animated, Easing, Platform, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow, Typography, Gradients } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliMascot } from '../components/OlliMascot';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { RootStackParamList } from '../navigation/AppNavigator';
import { interpretarVoz, VozResultadoOk, VozItem } from '../services/olliAssistente';
import { useReconhecimentoVoz, vozProvavelmenteDisponivel } from '../services/reconhecimentoVoz';
import {
  getNextOrcamentoNumber, saveOrcamento,
} from '../database/database';
import { Orcamento, ItemOrcamento, FormaPagamento } from '../types';
import { generateId } from '../utils/id';
import { nowISO, todayISO } from '../utils/date';
import { formatCurrency, parseNumber } from '../utils/currency';
import { track, Eventos } from '../services/analytics';
import { goBackOrHome } from '../navigation/safeBack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const isWeb = Platform.OS === 'web';
const useNativeAnimations = !isWeb;

/** Depois de quantos segundos de "enviando" o botão "Cancelar" aparece. */
const SEGUNDOS_PARA_MOSTRAR_CANCELAR = 5;

/** Reexportado para telas que já importavam este helper (ex.: HomeScreen). */
export function isVozDisponivel(): boolean {
  return vozProvavelmenteDisponivel();
}

type Fase = 'inicial' | 'ouvindo' | 'enviando' | 'revisao' | 'erro';

interface ItemEditavel {
  id: string;
  descricao: string;
  quantidade: number;
  /** null = "definir" (preço a combinar depois) */
  valorUnitario: number | null;
  tipo: 'servico' | 'peca';
}

const defaultFormas: FormaPagamento = { credito: false, debito: false, dinheiro: false, pix: true };

function vozItemParaEditavel(it: VozItem): ItemEditavel {
  return {
    id: generateId(),
    descricao: it.descricao,
    quantidade: it.quantidade > 0 ? it.quantidade : 1,
    valorUnitario: it.valorUnitario,
    tipo: it.tipo,
  };
}

/** Constrói um Orçamento rascunho a partir da revisão e grava no MESMO CRUD do app. */
function montarOrcamento(
  numero: string,
  titulo: string | undefined,
  clienteNome: string | undefined,
  itensEdit: ItemEditavel[],
  observacao: string | undefined,
): Orcamento {
  const itens: ItemOrcamento[] = itensEdit.map(e => {
    const preco = e.valorUnitario ?? 0;
    return {
      id: generateId(),
      // o orçamento do app só conhece 'servico' | 'produto' — 'peca' vira 'produto'
      tipo: e.tipo === 'peca' ? 'produto' : 'servico',
      catalogoId: '',
      nome: e.descricao,
      preco,
      quantidade: e.quantidade,
      unidade: 'un',
      subtotal: preco * e.quantidade,
    };
  });

  const subtotalServicos = itens.filter(i => i.tipo === 'servico').reduce((s, i) => s + i.subtotal, 0);
  const subtotalProdutos = itens.filter(i => i.tipo === 'produto').reduce((s, i) => s + i.subtotal, 0);
  const subtotal = subtotalServicos + subtotalProdutos;

  const infoAdicional = [titulo ? `Pedido: ${titulo}` : '', observacao ?? '']
    .filter(Boolean)
    .join('\n')
    .trim();

  return {
    id: generateId(),
    numero,
    clienteId: '',
    clienteNome: (clienteNome ?? '').trim(),
    clienteTelefone: '',
    itens,
    subtotalServicos,
    subtotalProdutos,
    subtotal,
    desconto: 0,
    descontoTipo: 'valor',
    valorTotal: subtotal,
    status: 'rascunho',
    dataEmissao: todayISO(),
    informacoesAdicionais: infoAdicional || undefined,
    formasPagamento: defaultFormas,
    exibirAssinatura: true,
    solicitarAssinaturaCliente: false,
    exibirAprovacao: true,
    exibirRecusa: true,
    criadoEm: nowISO(),
    atualizadoEm: nowISO(),
  };
}

export default function OlliVozScreen() {
  const nav = useNavigation<Nav>();

  const [fase, setFase] = useState<Fase>('inicial');
  const [transcript, setTranscript] = useState('');
  const [parcial, setParcial] = useState(''); // resultado interim do reconhecimento
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [podeCancelar, setPodeCancelar] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cancelarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // revisão
  const [titulo, setTitulo] = useState('');
  const [clienteNome, setClienteNome] = useState('');
  const [itens, setItens] = useState<ItemEditavel[]>([]);
  const [observacao, setObservacao] = useState('');

  // animação do "pulso" do microfone enquanto ouve
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (fase !== 'ouvindo') { pulse.stopAnimation(); pulse.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: useNativeAnimations }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: useNativeAnimations }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [fase, pulse]);

  const voz = useReconhecimentoVoz({
    onParcial: setParcial,
    onFinal: (t) => {
      setTranscript(prev => (prev ? prev + ' ' : '') + t);
      setParcial('');
    },
    onErro: (m) => {
      setErro(m);
      setParcial('');
      setFase('erro');
    },
    onFimEscuta: () => {
      // limite de reinícios sem resultado atingido (silêncio prolongado):
      // volta para o estado inicial sem tratar como erro fatal
      setFase(prev => (prev === 'ouvindo' ? 'inicial' : prev));
    },
  });
  const vozOk = voz.disponivel;

  // limpa chamadas de IA pendentes ao sair da tela (a limpeza do
  // reconhecimento de voz já é feita internamente pelo hook)
  useEffect(() => {
    return () => {
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const pararReconhecimento = useCallback(() => {
    voz.parar();
  }, [voz]);

  const onMicPress = useCallback(() => {
    if (!vozOk) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setErro(null);
    if (voz.ouvindo) {
      voz.parar();
      setFase(prev => (prev === 'ouvindo' ? 'inicial' : prev));
    } else {
      setParcial('');
      voz.iniciar();
      setFase('ouvindo');
    }
  }, [vozOk, voz]);

  const enviar = useCallback(async () => {
    const texto = transcript.trim();
    if (!texto) return;
    pararReconhecimento();
    Haptics.selectionAsync().catch(() => {});
    setFase('enviando');
    setErro(null);
    setPodeCancelar(false);

    const controller = new AbortController();
    abortRef.current = controller;
    cancelarTimerRef.current = setTimeout(() => setPodeCancelar(true), SEGUNDOS_PARA_MOSTRAR_CANCELAR * 1000);

    try {
      const res = await interpretarVoz(texto, controller.signal);
      if (!res.ok) {
        setErro(res.erro);
        setFase('erro');
        return;
      }
      const ok = res as VozResultadoOk;
      if (!ok.itens || ok.itens.length === 0) {
        setErro('Não consegui identificar itens no que você falou. Tente detalhar os serviços e peças — ou monte o orçamento na mão.');
        setFase('erro');
        return;
      }
      setTitulo(ok.titulo ?? '');
      setClienteNome(ok.clienteNome ?? '');
      setItens(ok.itens.map(vozItemParaEditavel));
      setObservacao(ok.observacao ?? '');
      setFase('revisao');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } finally {
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      setPodeCancelar(false);
      abortRef.current = null;
    }
  }, [transcript, pararReconhecimento]);

  const cancelarEnvio = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    abortRef.current?.abort();
  }, []);

  const refazer = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setFase('inicial');
    setTranscript('');
    setParcial('');
    setErro(null);
    setItens([]);
    setTitulo('');
    setClienteNome('');
    setObservacao('');
  }, []);

  const criarOrcamento = useCallback(async () => {
    if (itens.length === 0) return;
    setSalvando(true);
    try {
      const numero = await getNextOrcamentoNumber();
      const orc = montarOrcamento(numero, titulo, clienteNome, itens, observacao);
      await saveOrcamento(orc);
      track(Eventos.quoteCreated, { origem: 'voz', itens: itens.length });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // abre a MESMA tela de edição do app para o usuário finalizar (cliente, preços, enviar)
      nav.navigate('EditarOrcamento', { orcamentoId: orc.id });
    } catch {
      setErro('Não consegui salvar o orçamento agora. Tente novamente.');
      setFase('erro');
    } finally {
      setSalvando(false);
    }
  }, [itens, titulo, clienteNome, observacao, nav]);

  // ── edição de itens na revisão ──
  function updateItem(id: string, patch: Partial<ItemEditavel>) {
    setItens(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
  }
  function removeItem(id: string) {
    Haptics.selectionAsync().catch(() => {});
    setItens(prev => prev.filter(i => i.id !== id));
  }
  function addItem() {
    Haptics.selectionAsync().catch(() => {});
    setItens(prev => [...prev, { id: generateId(), descricao: '', quantidade: 1, valorUnitario: null, tipo: 'servico' }]);
  }

  const enviando = fase === 'enviando';
  const podeEnviar = transcript.trim().length > 0 && (fase === 'inicial' || fase === 'ouvindo' || fase === 'erro');

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GradientHeader
        title="OLLI por voz"
        subtitle="Fale e eu monto o orçamento"
        onBack={() => goBackOrHome(nav)}
        right={<OlliMascot size={32} onDark float={fase !== 'enviando'} />}
      />

      {fase === 'revisao' ? (
        <Revisao
          titulo={titulo}
          clienteNome={clienteNome}
          itens={itens}
          observacao={observacao}
          salvando={salvando}
          onTitulo={setTitulo}
          onCliente={setClienteNome}
          onObservacao={setObservacao}
          onUpdateItem={updateItem}
          onRemoveItem={removeItem}
          onAddItem={addItem}
          onCriar={criarOrcamento}
          onRefazer={refazer}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* HERO MICROFONE */}
          <AnimatedEntrance index={0}>
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>
                {fase === 'ouvindo' ? 'OUVINDO…' : fase === 'enviando' ? 'MONTANDO…' : vozOk ? 'TOQUE E FALE' : 'ESCREVA PRA OLLI'}
              </Text>

              <View style={styles.micWrap}>
                {fase === 'ouvindo' && (
                  <Animated.View
                    style={[styles.micPulse, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]}
                    pointerEvents="none"
                  />
                )}
                {vozOk ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={fase === 'enviando' ? undefined : onMicPress}
                    disabled={fase === 'enviando'}
                    accessibilityRole="button"
                    accessibilityLabel={fase === 'ouvindo' ? 'Parar de ouvir' : 'Tocar e falar'}
                    style={styles.micTouch}
                  >
                    <LinearGradient
                      colors={fase === 'ouvindo' ? Gradients.frost : Gradients.primaryDiagonal}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.micGrad, fase === 'ouvindo' ? Shadow.glowCyan : Shadow.glowBlue]}
                    >
                      {fase === 'enviando' ? (
                        <ActivityIndicator size="large" color="#fff" />
                      ) : (
                        <MaterialCommunityIcons
                          name={fase === 'ouvindo' ? 'microphone' : 'microphone-outline'}
                          size={52}
                          color="#fff"
                        />
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                ) : (
                  // Nativo sem reconhecimento de voz: em vez de um microfone GIGANTE
                  // desabilitado (que confundia), mostramos um ícone "escrever" — o
                  // caminho principal aqui é digitar no campo logo abaixo.
                  <View style={styles.micTouch} pointerEvents="none">
                    <LinearGradient
                      colors={Gradients.primaryDiagonal}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.micGrad, Shadow.glowBlue]}
                    >
                      <MaterialCommunityIcons name="text-box-edit-outline" size={50} color="#fff" />
                    </LinearGradient>
                  </View>
                )}
              </View>

              <Text style={styles.heroHint}>
                {fase === 'enviando'
                  ? 'OLLI está montando seu orçamento…'
                  : fase === 'ouvindo'
                  ? 'Pode falar por partes — toque de novo quando terminar.'
                  : vozOk
                  ? 'Toque no microfone e descreva o serviço. Ex.: "Limpeza de dois splits e recarga de gás para a Dona Helena".'
                  : 'Escreva abaixo o que você precisa — ex.: "Limpeza de dois splits e recarga de gás para a Dona Helena" — que a OLLI monta o orçamento.'}
              </Text>

              {!vozOk && (
                <View style={styles.infoPill}>
                  <MaterialCommunityIcons name="pencil-outline" size={14} color={Colors.accentLight} />
                  <Text style={styles.infoPillText}>Escreva abaixo — a OLLI monta o orçamento pra você</Text>
                </View>
              )}

              {fase === 'enviando' && podeCancelar && (
                <OlliButton
                  label="Cancelar"
                  variant="outline"
                  size="sm"
                  onPress={cancelarEnvio}
                  style={{ marginTop: 16 }}
                />
              )}
            </View>
          </AnimatedEntrance>

          {/* TRANSCRIÇÃO AO VIVO / EM EDIÇÃO */}
          {fase === 'enviando' ? (
            <AnimatedEntrance index={1}>
              <View style={styles.transcriptCard}>
                <Text style={styles.transcriptLabel}>O que eu entendi</Text>
                <OlliSkeleton.Lines count={3} />
              </View>
            </AnimatedEntrance>
          ) : (transcript.length > 0 || parcial.length > 0) && (
            <AnimatedEntrance index={1}>
              <View style={styles.transcriptCard}>
                <Text style={styles.transcriptLabel}>O que eu entendi</Text>
                <Text style={styles.transcriptText}>
                  {transcript}
                  {parcial ? <Text style={styles.transcriptInterim}>{transcript ? ' ' : ''}{parcial}</Text> : null}
                </Text>
              </View>
            </AnimatedEntrance>
          )}

          {/* ERRO AMIGÁVEL */}
          {fase === 'erro' && erro && (
            <AnimatedEntrance index={1}>
              <View style={styles.erroCard}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={Colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.erroText}>{erro}</Text>
                  {transcript.trim().length > 0 && (
                    <OlliButton
                      label="Tentar de novo"
                      variant="outline"
                      size="sm"
                      onPress={enviar}
                      haptic={false}
                      icon={<MaterialCommunityIcons name="refresh" size={15} color={Colors.accentLight} />}
                      style={{ marginTop: 10, alignSelf: 'flex-start' }}
                    />
                  )}
                </View>
              </View>
            </AnimatedEntrance>
          )}

          {/* FALLBACK DE TEXTO — sempre presente, em todas as plataformas */}
          <AnimatedEntrance index={2}>
            <View style={styles.escreverCard}>
              <Text style={styles.escreverLabel}>
                {vozOk ? 'ou escreva o que precisa' : 'escreva o que precisa'}
              </Text>
              <TextInput
                style={styles.escreverInput}
                value={transcript}
                onChangeText={t => { setTranscript(t); if (fase === 'erro') setErro(null); }}
                placeholder='Ex.: "Manutenção de 1 split 12.000 BTUs, recarga de gás e troca do capacitor para o João"'
                placeholderTextColor={Colors.onSurfaceMuted}
                multiline
                editable={fase !== 'enviando'}
                textAlignVertical="top"
              />
            </View>
          </AnimatedEntrance>

          <View style={{ height: 12 }} />

          <OlliButton
            label={fase === 'enviando' ? 'Montando seu orçamento…' : 'Montar orçamento com a OLLI'}
            variant="gradient"
            size="lg"
            fullWidth
            onPress={enviar}
            disabled={!podeEnviar || enviando}
            loading={enviando}
            icon={enviando ? undefined : <MaterialCommunityIcons name="robot-happy-outline" size={20} color="#fff" />}
          />

          {transcript.length > 0 && fase !== 'enviando' && (
            <TouchableOpacity style={styles.limparBtn} onPress={refazer} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={16} color={Colors.onSurfaceVariant} />
              <Text style={styles.limparText}>Limpar</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

/* ─── TELA DE REVISÃO ───────────────────────────────────── */
function Revisao(props: {
  titulo: string;
  clienteNome: string;
  itens: ItemEditavel[];
  observacao: string;
  salvando: boolean;
  onTitulo: (v: string) => void;
  onCliente: (v: string) => void;
  onObservacao: (v: string) => void;
  onUpdateItem: (id: string, patch: Partial<ItemEditavel>) => void;
  onRemoveItem: (id: string) => void;
  onAddItem: () => void;
  onCriar: () => void;
  onRefazer: () => void;
}) {
  const total = props.itens.reduce((s, i) => s + (i.valorUnitario ?? 0) * i.quantidade, 0);
  const algumSemPreco = props.itens.some(i => i.valorUnitario == null);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.revHeader}>
          <OlliMascot size={36} onDark float={false} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.revTitle}>Confira o que eu montei</Text>
            <Text style={styles.revSub}>Ajuste o que precisar. Depois você finaliza cliente, preços e envio.</Text>
          </View>
        </View>

        {/* TÍTULO + CLIENTE sugeridos */}
        <View style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>Título do serviço</Text>
          <TextInput
            style={styles.fieldInput}
            value={props.titulo}
            onChangeText={props.onTitulo}
            placeholder="Ex.: Manutenção preventiva"
            placeholderTextColor={Colors.onSurfaceMuted}
          />
          <View style={{ height: 12 }} />
          <Text style={styles.fieldLabel}>Cliente (sugerido)</Text>
          <TextInput
            style={styles.fieldInput}
            value={props.clienteNome}
            onChangeText={props.onCliente}
            placeholder="Você confirma o cliente no próximo passo"
            placeholderTextColor={Colors.onSurfaceMuted}
          />
        </View>

        {/* ITENS */}
        <Text style={styles.itensTitle}>Itens ({props.itens.length})</Text>
        {props.itens.map((item, idx) => (
          <AnimatedEntrance key={item.id} index={idx}>
            <View style={styles.itemCard}>
              <View style={styles.itemTopRow}>
                <View style={[styles.tipoChip, item.tipo === 'peca' ? styles.tipoChipPeca : styles.tipoChipServico]}>
                  <MaterialCommunityIcons
                    name={item.tipo === 'peca' ? 'package-variant' : 'wrench'}
                    size={12}
                    color={item.tipo === 'peca' ? '#0891B2' : Colors.accentLight}
                  />
                  <TouchableOpacity onPress={() => props.onUpdateItem(item.id, { tipo: item.tipo === 'peca' ? 'servico' : 'peca' })}>
                    <Text style={[styles.tipoChipText, { color: item.tipo === 'peca' ? '#0891B2' : Colors.accentLight }]}>
                      {item.tipo === 'peca' ? 'Peça' : 'Serviço'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => props.onRemoveItem(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={Colors.danger} />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.itemDescInput}
                value={item.descricao}
                onChangeText={t => props.onUpdateItem(item.id, { descricao: t })}
                placeholder="Descrição do item"
                placeholderTextColor={Colors.onSurfaceMuted}
                multiline
              />

              <View style={styles.itemFields}>
                <View style={styles.qtyField}>
                  <Text style={styles.miniLabel}>Qtd</Text>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => props.onUpdateItem(item.id, { quantidade: Math.max(1, item.quantidade - 1) })}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialCommunityIcons name="minus" size={15} color={Colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{item.quantidade}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => props.onUpdateItem(item.id, { quantidade: item.quantidade + 1 })}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialCommunityIcons name="plus" size={15} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.valorField}>
                  <Text style={styles.miniLabel}>Valor unitário</Text>
                  <View style={styles.valorInputWrap}>
                    <Text style={styles.valorPrefix}>R$</Text>
                    <TextInput
                      style={styles.valorInput}
                      value={item.valorUnitario != null ? String(item.valorUnitario).replace('.', ',') : ''}
                      onChangeText={t => props.onUpdateItem(item.id, { valorUnitario: t.trim() === '' ? null : parseNumber(t) })}
                      placeholder="definir"
                      placeholderTextColor={Colors.warning}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>
            </View>
          </AnimatedEntrance>
        ))}

        <TouchableOpacity style={styles.addItemBtn} onPress={props.onAddItem} activeOpacity={0.8}>
          <MaterialCommunityIcons name="plus" size={18} color={Colors.success} />
          <Text style={styles.addItemText}>Adicionar item</Text>
        </TouchableOpacity>

        {/* OBSERVAÇÃO */}
        {props.observacao.length > 0 && (
          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>Observação da OLLI</Text>
            <TextInput
              style={[styles.fieldInput, styles.obsInput]}
              value={props.observacao}
              onChangeText={props.onObservacao}
              multiline
              textAlignVertical="top"
              placeholderTextColor={Colors.onSurfaceMuted}
            />
          </View>
        )}

        {/* TOTAL PARCIAL */}
        <View style={styles.totalBar}>
          <View>
            <Text style={styles.totalLabel}>Total estimado</Text>
            {algumSemPreco && <Text style={styles.totalHint}>alguns itens ainda sem preço</Text>}
          </View>
          <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
        </View>
      </ScrollView>

      {/* AÇÕES FIXAS */}
      <View style={styles.revFooter}>
        <OlliButton label="Refazer" variant="outline" size="md" onPress={props.onRefazer} haptic={false} icon={<MaterialCommunityIcons name="restart" size={18} color={Colors.primary} />} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <OlliButton
            label="Criar orçamento"
            variant="gradient"
            size="md"
            fullWidth
            loading={props.salvando}
            disabled={props.itens.length === 0}
            onPress={props.onCriar}
            icon={<MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  hero: { alignItems: 'center', paddingVertical: Spacing.lg },
  heroKicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0, color: Colors.accentLight, marginBottom: Spacing.lg },
  micWrap: { width: 168, height: 168, justifyContent: 'center', alignItems: 'center' },
  micPulse: { position: 'absolute', width: 168, height: 168, borderRadius: 84, backgroundColor: Colors.accent },
  micTouch: { borderRadius: 70 },
  micGrad: { width: 140, height: 140, borderRadius: 70, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: 'rgba(127,233,245,0.18)' },
  heroHint: { fontSize: 13.5, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20, marginTop: Spacing.lg, paddingHorizontal: 8 },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: 'rgba(127,233,245,0.10)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.28)', borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6 },
  infoPillText: { fontSize: 11.5, fontWeight: '700', color: Colors.accentLight },

  transcriptCard: { backgroundColor: 'rgba(52,198,217,0.06)', borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: 'rgba(52,198,217,0.30)', padding: Spacing.base, marginTop: Spacing.sm },
  transcriptLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0, color: Colors.accentLight, textTransform: 'uppercase', marginBottom: 6 },
  transcriptText: { fontSize: 15.5, color: Colors.onSurface, lineHeight: 22 },
  transcriptInterim: { color: Colors.onSurfaceMuted, fontStyle: 'italic' },

  erroCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.warningLight, borderWidth: 1, borderColor: 'rgba(247,178,59,0.35)', borderRadius: BorderRadius.lg, padding: Spacing.base, marginTop: Spacing.base },
  erroText: { flex: 1, fontSize: 13.5, color: Colors.onSurface, lineHeight: 20 },

  escreverCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: Spacing.base, marginTop: Spacing.base, ...Shadow.sm },
  escreverLabel: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant, marginBottom: 8 },
  escreverInput: { fontSize: 15, color: Colors.onSurface, minHeight: 84, lineHeight: 21 },

  limparBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 4 },
  limparText: { fontSize: 13.5, color: Colors.onSurfaceVariant, fontWeight: '600' },

  // Revisão
  revHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.base },
  revTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  revSub: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginTop: 3, lineHeight: 18 },

  fieldCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: Spacing.base, marginBottom: Spacing.base, ...Shadow.sm },
  fieldLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.onSurfaceVariant, marginBottom: 8 },
  fieldInput: { backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.outline, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.onSurface },
  obsInput: { minHeight: 70, lineHeight: 20 },

  itensTitle: { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: Spacing.sm },
  itemCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: Spacing.base, marginBottom: 10, ...Shadow.sm },
  itemTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tipoChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  tipoChipServico: { backgroundColor: 'rgba(52,198,217,0.12)', borderColor: 'rgba(52,198,217,0.3)' },
  tipoChipPeca: { backgroundColor: 'rgba(8,145,178,0.14)', borderColor: 'rgba(8,145,178,0.35)' },
  tipoChipText: { fontSize: 11.5, fontWeight: '800' },
  itemDescInput: { fontSize: 15, color: Colors.onSurface, lineHeight: 21, paddingVertical: 2, marginBottom: 10 },
  itemFields: { flexDirection: 'row', gap: 12 },
  qtyField: { width: 118 },
  valorField: { flex: 1 },
  miniLabel: { fontSize: 11, fontWeight: '700', color: Colors.onSurfaceMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.outline, paddingHorizontal: 6, height: 44 },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  qtyValue: { fontSize: 15, fontWeight: '800', color: Colors.onSurface, minWidth: 22, textAlign: 'center' },
  valorInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.outline, paddingHorizontal: 12, height: 44 },
  valorPrefix: { fontSize: 14, fontWeight: '700', color: Colors.onSurfaceMuted, marginRight: 6 },
  valorInput: { flex: 1, fontSize: 15, color: Colors.onSurface, fontWeight: '600' },

  addItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1.5, borderColor: 'rgba(43,215,135,0.5)', borderRadius: BorderRadius.md, paddingVertical: 13, backgroundColor: 'rgba(43,215,135,0.06)', marginBottom: Spacing.base },
  addItemText: { fontSize: 14, fontWeight: '700', color: Colors.success },

  totalBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, padding: Spacing.lg, ...Shadow.md },
  totalLabel: { fontSize: 13, color: 'rgba(255,255,255,0.82)', fontWeight: '600' },
  totalHint: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  totalValue: { ...Typography.displaySerif, color: '#fff' },

  revFooter: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.outline, paddingHorizontal: Spacing.base, paddingTop: 12, paddingBottom: 26 },
});
