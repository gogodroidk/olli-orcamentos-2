import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Animated, Easing,
} from 'react-native';
import { podeVerPlanosPara } from '../services/cadeadoRecurso';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { vibrar } from '../utils/haptico';
import { Spacing, BorderRadius, useCores, useGradientes, useEstilos, sombrasDe, comAlfa, textoSobre, type Cores } from '../theme';
import { useReducedMotion } from '../theme/motion';
import { GradientHeader } from '../components/GradientHeader';
import { OlliMascot } from '../components/OlliMascot';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { EstadoIA } from '../components/EstadoIA';
import { OlliButton } from '../components/OlliButton';
import {
  cancelarAcaoChat,
  confirmarAcaoChat,
  enviarChat,
  reverterAcaoChat,
  ChatMensagem,
  ModoChat,
  RascunhoAcaoChat,
} from '../services/olliAssistente';
import { formatarCreditos, getMeuSaldo } from '../services/creditos';
import { SinalizarIA } from '../components/SinalizarIA';
import { generateId } from '../utils/id';
import { goBackOrHome } from '../navigation/safeBack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { ChatHistoricoPainel } from '../components/ChatHistoricoPainel';
import { MarkdownChat } from '../components/MarkdownChat';
import { CHAT_KEY } from '../services/storageKeys';
import { usePlano } from '../hooks/usePlano';
import {
  apagarConversa,
  atualizarConversa,
  lerEstadoChat,
  planoDeRevelacao,
  type ConversaGuardada,
  type MensagemGuardada,
} from '../utils/chatUi';
import { track, Eventos } from '../services/analytics';
import { IA_USOS_GRATIS_MES } from '../services/planos';
import {
  aberturaDoCaso,
  perguntaSugerida,
  retirarCasoDoDiagnostico,
  tituloDoCaso,
  type ContextoDiagnostico,
} from '../services/diagnosticoContexto';

type Nav = NativeStackNavigationProp<RootStackParamList>;


interface Bolha {
  id: string;
  role: 'user' | 'assistant';
  texto: string;
  /** true quando esta bolha é uma resposta de erro da IA (permite "Tentar de novo"). */
  falhou?: boolean;
  /** Fala montada no aparelho (abertura do caso do Diagnóstico) — não é IA. */
  local?: boolean;
  /** Enquanto a resposta já recebida ainda está sendo revelada na tela. */
  visivelAte?: number;
}

/** Depois de quantos segundos de "digitando" o botão "Cancelar" aparece. */
const SEGUNDOS_PARA_MOSTRAR_CANCELAR = 4;

const SUGESTOES = [
  'Qual o preço de uma recarga de gás?',
  'Erro E5 no split, o que é?',
  'Como precificar uma limpeza de split?',
  'O que verifico num ar que não gela?',
];

const SAUDACAO: Bolha = {
  id: 'olli-hello',
  role: 'assistant',
  texto: 'Oi! Eu sou a OLLI. Posso te ajudar com diagnóstico, preços, dúvidas técnicas e dicas pro seu dia. O que você precisa?',
};

function paraGuardar(b: Bolha): MensagemGuardada {
  const mensagem: MensagemGuardada = { id: b.id, role: b.role, texto: b.texto };
  if (b.falhou) mensagem.falhou = true;
  if (b.local) mensagem.local = true;
  return mensagem;
}

export default function OlliChatScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  const { usosIaRestantes, consumirUsoIa } = usePlano();

  const [bolhas, setBolhas] = useState<Bolha[]>([SAUDACAO]);
  const [texto, setTexto] = useState('');
  const [digitando, setDigitando] = useState(false);
  const [podeCancelar, setPodeCancelar] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [pendenciaCredito, setPendenciaCredito] = useState<Bolha[] | null>(null);
  // undefined = consultando; null = saldo indisponível; number = saldo confirmado.
  const [saldoCreditos, setSaldoCreditos] = useState<number | null | undefined>(undefined);
  const [modoChat, setModoChat] = useState<ModoChat>('consulta');
  const [rascunhoAcao, setRascunhoAcao] = useState<RascunhoAcaoChat | null>(null);
  const [processandoAcao, setProcessandoAcao] = useState(false);
  // Caso aberto pela tela Diagnóstico: vai em cada pergunta (modo consulta)
  // até o técnico encerrar o caso ou limpar a conversa. Só em memória.
  const [casoDiag, setCasoDiag] = useState<ContextoDiagnostico | null>(null);
  const [ativaId, setAtivaId] = useState('');
  const [conversas, setConversas] = useState<ConversaGuardada[]>([]);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const reduzirMovimento = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revelacaoRef = useRef(0);
  const revelacaoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversasRef = useRef<ConversaGuardada[]>([]);
  const reduzirRef = useRef(reduzirMovimento);
  reduzirRef.current = reduzirMovimento;
  conversasRef.current = conversas;
  // Reutilizada no retry de rede: o mesmo trabalho nunca pode cobrar duas vezes.
  const creditoRefRef = useRef<string | null>(null);
  // Trocar ou apagar a conversa invalida a resposta que ainda está no ar.
  const geracaoChatRef = useRef(0);

  // aborta requisição pendente e limpa timers ao desmontar a tela
  useEffect(() => {
    return () => {
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      if (revelacaoTimerRef.current) clearTimeout(revelacaoTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // carrega histórico persistido (array antigo vira uma conversa; formato novo traz a lista)
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CHAT_KEY);
        if (!vivo) return;
        const estado = lerEstadoChat(raw);
        const id = estado.ativaId || generateId();
        setAtivaId(id);
        setConversas(estado.conversas);
        conversasRef.current = estado.conversas;
        if (estado.ativaId) {
          const ativa = estado.conversas.find((c) => c.id === estado.ativaId);
          if (ativa && ativa.mensagens.length > 0) setBolhas(ativa.mensagens);
        }
      } catch {
        // histórico inválido: começa do zero, sem quebrar
        if (vivo) setAtivaId(generateId());
      } finally {
        if (vivo) setCarregado(true);
      }
    })();
    return () => { vivo = false; };
  }, []);

  // persiste a conversa ativa e a lista neste aparelho (depois do 1º load)
  useEffect(() => {
    if (!carregado || !ativaId) return;
    const mensagens = bolhas.slice(-60).map(paraGuardar);
    const proximo = atualizarConversa(
      { ativaId, conversas: conversasRef.current },
      { id: ativaId, titulo: '', atualizadoEm: Date.now(), mensagens },
    );
    conversasRef.current = proximo.conversas;
    setConversas(proximo.conversas);
    AsyncStorage.setItem(CHAT_KEY, JSON.stringify(proximo)).catch(() => {});
  }, [bolhas, carregado, ativaId]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: !reduzirRef.current }));
  }, []);

  useEffect(() => { scrollToEnd(); }, [bolhas, digitando, scrollToEnd]);

  /** Faz a chamada de IA de fato a partir de um histórico já pronto (não mexe nas bolhas de entrada). */
  const chamarIA = useCallback(async (
    historicoBase: Bolha[],
    opcoesCredito?: { confirmarCredito: true; creditoRef: string },
    modo: ModoChat = 'consulta',
  ) => {
    const geracao = geracaoChatRef.current;
    revelacaoRef.current += 1;
    if (revelacaoTimerRef.current) clearTimeout(revelacaoTimerRef.current);
    setBolhas(prev => prev.map(b => (b.visivelAte != null ? { ...b, visivelAte: undefined } : b)));
    setDigitando(true);
    setPodeCancelar(false);

    const controller = new AbortController();
    abortRef.current = controller;
    cancelarTimerRef.current = setTimeout(() => setPodeCancelar(true), SEGUNDOS_PARA_MOSTRAR_CANCELAR * 1000);

    // monta o histórico para o endpoint (sem a saudação fixa inicial)
    const historico: ChatMensagem[] = historicoBase
      .filter(b => b.id !== 'olli-hello')
      .slice(-20) // janela: últimas ~20 msgs (evita estourar contexto/custo da IA)
      .map(b => ({ role: b.role, texto: b.texto }));

    try {
      const res = await enviarChat(historico, controller.signal, {
        ...opcoesCredito,
        modo,
        contextoDiagnostico: modo === 'consulta' ? casoDiag : null,
      });
      if (geracao !== geracaoChatRef.current) return;
      if (res.semCreditos) {
        // O servidor — não o contador local — decidiu que a cota acabou ou que
        // não há saldo. Não poluímos o histórico com uma falsa "falha de IA":
        // mostramos consentimento explícito e caminhos sem cobrança.
        setPendenciaCredito(historicoBase);
        setSaldoCreditos(undefined);
        void getMeuSaldo().then(setSaldoCreditos);
        creditoRefRef.current = opcoesCredito?.creditoRef ?? null;
        track(Eventos.gateVisto, {
          recurso: 'ia_ilimitada', plano: 'pro', motivo: 'limite_servidor', origem: 'olli_chat',
        });
        return;
      }

      const idResposta = generateId();
      const plano = res.ok ? planoDeRevelacao(res.resposta, reduzirRef.current) : { cortes: [res.resposta.length], intervaloMs: 0 };
      if (revelacaoTimerRef.current) clearTimeout(revelacaoTimerRef.current);
      const tokenRevelacao = ++revelacaoRef.current;
      setBolhas(prev => [...prev, {
        id: idResposta,
        role: 'assistant',
        texto: res.resposta,
        falhou: !res.ok,
        visivelAte: plano.cortes.length > 1 ? plano.cortes[0] : undefined,
      }]);
      if (plano.cortes.length > 1) {
        let passo = 1;
        const revelar = () => {
          if (revelacaoRef.current !== tokenRevelacao) return;
          const corte = plano.cortes[passo] ?? res.resposta.length;
          const ultimo = passo >= plano.cortes.length - 1;
          setBolhas(prev => prev.map(b => b.id === idResposta ? { ...b, visivelAte: ultimo ? undefined : corte } : b));
          passo += 1;
          if (!ultimo) revelacaoTimerRef.current = setTimeout(revelar, plano.intervaloMs);
        };
        revelacaoTimerRef.current = setTimeout(revelar, plano.intervaloMs);
      }
      if (res.rascunho) setRascunhoAcao(res.rascunho);
      if (res.ok) {
        setPendenciaCredito(null);
        setSaldoCreditos(undefined);
        creditoRefRef.current = null;
        vibrar('selecao');
        await consumirUsoIa();
      }
    } finally {
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      setDigitando(false);
      setPodeCancelar(false);
      abortRef.current = null;
    }
  }, [consumirUsoIa, casoDiag]);

  // Recebe o caso do Diagnóstico (repasse em memória, uma vez). Espera o
  // histórico carregar: senão o load do AsyncStorage sobrescreveria a abertura.
  // A abertura é LOCAL (não gasta IA) e, se faltar marca/modelo, já pergunta.
  useFocusEffect(useCallback(() => {
    if (!carregado) return;
    const caso = retirarCasoDoDiagnostico();
    if (!caso) return;
    setCasoDiag(caso);
    setModoChat('consulta');
    setRascunhoAcao(null);
    setPendenciaCredito(null);
    creditoRefRef.current = null;
    setBolhas(prev => [...prev, { id: generateId(), role: 'assistant', texto: aberturaDoCaso(caso), local: true }]);
    setTexto(perguntaSugerida(caso));
  }, [carregado]));

  const irParaPlanos = useCallback((origem: string) => {
    vibrar('selecao');
    track(Eventos.gateCta, { recurso: 'ia_ilimitada', plano: 'pro', origem });
    nav.navigate('Planos');
  }, [nav]);

  const usarUmCredito = useCallback(async () => {
    if (!pendenciaCredito || digitando) return;
    if (saldoCreditos === 0) {
      irParaPlanos('chat_sem_saldo');
      return;
    }
    vibrar('selecao');
    const creditoRef = creditoRefRef.current ?? generateId();
    creditoRefRef.current = creditoRef;
    await chamarIA(pendenciaCredito, { confirmarCredito: true, creditoRef }, modoChat);
  }, [pendenciaCredito, digitando, saldoCreditos, irParaPlanos, chamarIA, modoChat]);

  const completarRevelacao = useCallback(() => {
    revelacaoRef.current += 1;
    if (revelacaoTimerRef.current) clearTimeout(revelacaoTimerRef.current);
    setBolhas(prev => prev.map(b => (b.visivelAte != null ? { ...b, visivelAte: undefined } : b)));
  }, []);

  const enviar = useCallback(async (mensagem?: string) => {
    const conteudo = (mensagem ?? texto).trim();
    if (!conteudo || digitando || !carregado) return;
    revelacaoRef.current += 1;
    if (revelacaoTimerRef.current) clearTimeout(revelacaoTimerRef.current);
    vibrar('selecao');

    // Nova pergunta = novo trabalho. Qualquer consentimento/referência anterior
    // deixa de valer; se a cota estiver esgotada o servidor abrirá um novo gate.
    setPendenciaCredito(null);
    setSaldoCreditos(undefined);
    creditoRefRef.current = null;

    const userBolha: Bolha = { id: generateId(), role: 'user', texto: conteudo };
    const proximas = [...bolhas.map(b => (b.visivelAte != null ? { ...b, visivelAte: undefined } : b)), userBolha];
    setBolhas(proximas);
    setTexto('');
    await chamarIA(proximas, undefined, modoChat);
  }, [texto, bolhas, digitando, carregado, chamarIA, modoChat]);

  const cancelarEnvio = useCallback(() => {
    vibrar('selecao');
    abortRef.current?.abort();
  }, []);

  const tentarDeNovo = useCallback((bolhaErroId: string) => {
    if (digitando) return;
    // remove a bolha de erro e reenvia a IA com o histórico até a última msg do usuário
    const idx = bolhas.findIndex(b => b.id === bolhaErroId);
    if (idx <= 0) return;
    const historicoBase = bolhas.slice(0, idx);
    if (historicoBase[historicoBase.length - 1]?.role !== 'user') return;
    vibrar('selecao');
    setBolhas(historicoBase);
    const creditoRef = creditoRefRef.current;
    chamarIA(
      historicoBase,
      creditoRef ? { confirmarCredito: true, creditoRef } : undefined,
      modoChat,
    );
  }, [bolhas, digitando, chamarIA, modoChat]);

  const limpar = useCallback(() => {
    vibrar('selecao');
    geracaoChatRef.current += 1;
    completarRevelacao();
    abortRef.current?.abort();
    const id = generateId();
    setAtivaId(id);
    setBolhas([SAUDACAO]);
    setPendenciaCredito(null);
    setSaldoCreditos(undefined);
    creditoRefRef.current = null;
    setRascunhoAcao(null);
    setCasoDiag(null);
    setHistoricoAberto(false);
  }, [completarRevelacao]);

  const abrirConversa = useCallback((id: string) => {
    const alvo = conversasRef.current.find((c) => c.id === id);
    if (!alvo) return;
    vibrar('selecao');
    geracaoChatRef.current += 1;
    completarRevelacao();
    abortRef.current?.abort();
    creditoRefRef.current = null;
    setAtivaId(id);
    setBolhas(alvo.mensagens);
    setPendenciaCredito(null);
    setRascunhoAcao(null);
    setCasoDiag(null);
    setHistoricoAberto(false);
  }, [completarRevelacao]);

  const apagarConversaLocal = useCallback((id: string) => {
    vibrar('selecao');
    const proximo = apagarConversa({ ativaId, conversas: conversasRef.current }, id);
    conversasRef.current = proximo.conversas;
    setConversas(proximo.conversas);
    AsyncStorage.setItem(CHAT_KEY, JSON.stringify({ ...proximo, ativaId: id === ativaId ? '' : proximo.ativaId })).catch(() => {});
    if (id === ativaId) {
      geracaoChatRef.current += 1;
      completarRevelacao();
      abortRef.current?.abort();
      creditoRefRef.current = null;
      setPendenciaCredito(null);
      setAtivaId(generateId());
      setBolhas([SAUDACAO]);
      setCasoDiag(null);
      setRascunhoAcao(null);
    }
  }, [ativaId, completarRevelacao]);

  const executarAcao = useCallback(async (operacao: 'confirmar' | 'cancelar' | 'reverter') => {
    if (!rascunhoAcao || processandoAcao) return;
    setProcessandoAcao(true);
    const resultado = operacao === 'confirmar'
      ? await confirmarAcaoChat(rascunhoAcao)
      : operacao === 'cancelar'
        ? await cancelarAcaoChat(rascunhoAcao)
        : await reverterAcaoChat(rascunhoAcao);
    if (resultado.ok) {
      const textoResultado = resultado.status === 'aplicada'
        ? 'Alteração aplicada com sucesso. A sincronização atualizará as outras telas.'
        : resultado.status === 'cancelada'
          ? 'Prévia cancelada. Nada foi alterado.'
          : 'Alteração desfeita. O estado anterior foi restaurado.';
      setBolhas(prev => [...prev, { id: generateId(), role: 'assistant', texto: textoResultado }]);
      setRascunhoAcao(prev => prev ? { ...prev, status: resultado.status } : null);
      if (resultado.status === 'cancelada' || resultado.status === 'revertida') setRascunhoAcao(null);
    } else {
      setBolhas(prev => [...prev, { id: generateId(), role: 'assistant', texto: resultado.mensagem, falhou: true }]);
    }
    setProcessandoAcao(false);
  }, [rascunhoAcao, processandoAcao]);

  // Leva a última resposta da OLLI direto para um orçamento novo, já com um
  // item de serviço pré-preenchido — fecha o loop de "perguntei o preço" para
  // "montei o orçamento", igual ao padrão de DiagnosticoScreen/DiagnosticoIA.
  const criarOrcamentoDaResposta = useCallback((texto: string) => {
    vibrar('selecao');
    const nome = texto.split('\n')[0].slice(0, 80).trim() || 'Serviço sugerido pela OLLI';
    const descricao = texto.length > nome.length ? texto : undefined;
    nav.navigate('NovoOrcamento', {
      prefillItem: { tipo: 'servico', nome, descricao },
    });
  }, [nav]);

  const mostrarSugestoes = carregado && bolhas.length <= 1 && !digitando;
  const revelandoAgora = bolhas.some((b) => b.visivelAte != null);
  const envioBloqueado = !carregado || (!digitando && !texto.trim() && !revelandoAgora);
  const iconeEnviarAtivo = !envioBloqueado && (digitando || Boolean(texto.trim()) || revelandoAgora);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <GradientHeader
        title="Chat com a OLLI"
        subtitle={Number.isFinite(usosIaRestantes) ? `${usosIaRestantes} de ${IA_USOS_GRATIS_MES} usos grátis este mês` : 'Sua assistente técnica'}
        onBack={() => goBackOrHome(nav)}
        right={
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => nav.navigate('Autopilot')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Abrir Autopilot para anexar arquivo"
            >
              <MaterialCommunityIcons name="paperclip" size={22} color={gradientes.sobreHeader} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setModoChat((modo) => modo === 'consulta' ? 'rascunho_acao' : 'consulta')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={modoChat === 'consulta' ? 'Ativar modo preparar alteração' : 'Voltar ao modo consulta'}
              accessibilityState={{ selected: modoChat === 'rascunho_acao' }}
            >
              <MaterialCommunityIcons name={modoChat === 'consulta' ? 'magnify' : 'pencil-outline'} size={22} color={gradientes.sobreHeader} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setHistoricoAberto(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Histórico de conversas">
              <MaterialCommunityIcons name="history" size={22} color={gradientes.sobreHeader} />
            </TouchableOpacity>
            <TouchableOpacity onPress={limpar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Nova conversa">
              <MaterialCommunityIcons name="square-edit-outline" size={22} color={gradientes.sobreHeader} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 12 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {bolhas.map((b, i) => (
          <AnimatedEntrance key={b.id} from="bottom">
            <Balao
              role={b.role}
              texto={b.texto}
              visivelAte={b.visivelAte}
              falhou={b.falhou}
              onTentarDeNovo={() => tentarDeNovo(b.id)}
              onTransformarEmOrcamento={b.id !== 'olli-hello' && !b.local && b.visivelAte == null ? () => criarOrcamentoDaResposta(b.texto) : undefined}
              // A saudação fixa e a abertura do caso não são conteúdo gerado —
              // não tem o que revisar nelas.
              podeSinalizar={b.id !== 'olli-hello' && !b.local && b.visivelAte == null}
              pedido={pedidoAntesDe(bolhas, i)}
            />
          </AnimatedEntrance>
        ))}

        {rascunhoAcao && !digitando && (
          <RascunhoAcaoCard
            rascunho={rascunhoAcao}
            processando={processandoAcao}
            onConfirmar={() => { void executarAcao('confirmar'); }}
            onCancelar={() => { void executarAcao('cancelar'); }}
            onReverter={() => { void executarAcao('reverter'); }}
          />
        )}

        {digitando && <Digitando podeCancelar={podeCancelar} onCancelar={cancelarEnvio} />}

        {mostrarSugestoes && (
          <View style={styles.sugestoesWrap}>
            <Text style={styles.sugestoesLabel}>Sugestões para começar</Text>
            {SUGESTOES.map(s => (
              <TouchableOpacity key={s} style={styles.sugestaoChip} onPress={() => enviar(s)} activeOpacity={0.8}>
                <MaterialCommunityIcons name="lightbulb-on-outline" size={16} color={cores.accentLight} />
                <Text style={styles.sugestaoText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {pendenciaCredito && !digitando && (
          <EstadoIA
            variante="erro"
            tipoErro="cota"
            titulo={`Seus ${IA_USOS_GRATIS_MES} papos grátis deste mês acabaram`}
            mensagem="Você escolhe: gastar 1 crédito nesta resposta, ver os planos ou montar o orçamento sem IA. Nada é cobrado sem seu toque."
            onDark
            style={{ marginTop: 8 }}
          >
            <View style={styles.creditoAcoes}>
              <OlliButton
                label={
                  typeof saldoCreditos === 'number'
                    ? `Usar 1 crédito (${formatarCreditos(saldoCreditos)})`
                    : saldoCreditos === null
                      ? 'Tentar usar 1 crédito'
                      : 'Consultando seus créditos…'
                }
                variant="gradient"
                size="sm"
                onPress={usarUmCredito}
                loading={saldoCreditos === undefined}
                disabled={saldoCreditos === 0}
                style={styles.creditoBotao}
              />
              {podeVerPlanosPara(Platform.OS) ? (
              <OlliButton
                label="Ver planos"
                variant="outline"
                size="sm"
                onPress={() => irParaPlanos('chat_card')}
                style={styles.creditoBotao}
              />
              ) : null}
              <OlliButton
                label="Montar na mão"
                variant="ghost"
                size="sm"
                onPress={() => nav.navigate('NovoOrcamento', {})}
                style={styles.creditoBotao}
              />
              {saldoCreditos === 0 && (
                <Text style={styles.creditoAviso}>Seu saldo confirmado está zerado; nenhum crédito será cobrado.</Text>
              )}
              {saldoCreditos === null && (
                <Text style={styles.creditoAviso}>Não consegui mostrar o saldo. O servidor ainda confere antes de qualquer cobrança.</Text>
              )}
            </View>
          </EstadoIA>
        )}
      </ScrollView>

      {/* INPUT */}
      {casoDiag && (
        <View style={styles.casoBar} accessibilityLabel={`Caso do Diagnóstico: ${tituloDoCaso(casoDiag)}`}>
          <MaterialCommunityIcons name="card-search-outline" size={15} color={cores.accentLight} />
          <Text style={styles.casoBarTexto} numberOfLines={1}>
            {modoChat === 'consulta' ? 'Caso: ' : 'Caso pausado no modo preparar: '}
            <Text style={styles.casoBarDestaque}>{tituloDoCaso(casoDiag)}</Text>
            {casoDiag.encontradoNaBase ? '' : ' · fora da base offline'}
          </Text>
          <TouchableOpacity
            onPress={() => setCasoDiag(null)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Encerrar caso do Diagnóstico"
          >
            <MaterialCommunityIcons name="close" size={16} color={cores.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      )}
      {modoChat === 'rascunho_acao' && (
        <View style={styles.modoAviso}>
          <MaterialCommunityIcons name="shield-check-outline" size={15} color={cores.accentLight} />
          <Text style={styles.modoAvisoTexto}>Modo preparar: a OLLI só mostra a prévia. Nada muda sem sua confirmação.</Text>
        </View>
      )}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={texto}
            onChangeText={setTexto}
            placeholder="Mensagem para a OLLI"
            placeholderTextColor={cores.onSurfaceMuted}
            multiline
            onSubmitEditing={() => enviar()}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, envioBloqueado && styles.sendBtnDisabled]}
            onPress={() => {
              if (digitando) cancelarEnvio();
              else if (revelandoAgora) completarRevelacao();
              else enviar();
            }}
            disabled={envioBloqueado}
            activeOpacity={0.85}
            accessibilityLabel={digitando || revelandoAgora ? 'Parar resposta' : 'Enviar mensagem'}
          >
            <MaterialCommunityIcons
              name={digitando || revelandoAgora ? 'stop' : 'send'}
              size={18}
              color={iconeEnviarAtivo ? textoSobre(cores.primary) : cores.onSurfaceMuted}
            />
          </TouchableOpacity>
        </View>
      </View>
      <ChatHistoricoPainel
        aberto={historicoAberto}
        conversas={conversas}
        ativaId={ativaId}
        onFechar={() => setHistoricoAberto(false)}
        onNova={limpar}
        onAbrir={abrirConversa}
        onApagar={apagarConversaLocal}
      />
    </KeyboardAvoidingView>
  );
}

/**
 * O pedido que gerou a bolha `idx`: a última fala do usuário ANTES dela. Vai
 * junto da denúncia — moderar uma resposta ofensiva sem a pergunta que a
 * provocou é quase impossível, e o histórico do chat só existe neste aparelho
 * (AsyncStorage), então quem revisa não tem como buscar isso depois.
 */
function pedidoAntesDe(bolhas: Bolha[], idx: number): string {
  for (let i = idx - 1; i >= 0; i--) {
    if (bolhas[i].role === 'user') return bolhas[i].texto;
  }
  return '';
}

function Balao({ role, texto, visivelAte, falhou, onTentarDeNovo, onTransformarEmOrcamento, podeSinalizar, pedido }: { role: 'user' | 'assistant'; texto: string; visivelAte?: number; falhou?: boolean; onTentarDeNovo?: () => void; onTransformarEmOrcamento?: () => void; podeSinalizar?: boolean; pedido?: string }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const revelando = visivelAte != null && visivelAte < texto.length;
  const mostrado = revelando ? texto.slice(0, visivelAte) : texto;
  const isUser = role === 'user';
  if (isUser) {
    return (
      <View style={styles.rowUser}>
        <View style={[styles.bubble, styles.bubbleUser]}>
          <Text selectable style={styles.bubbleUserText}>{texto}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.rowOlli}>
      <View style={styles.olliAvatar}>
        <OlliMascot size={26} onDark float={false} blink={false} />
      </View>
      <View style={styles.colunaOlli}>
        <View style={[styles.bubble, styles.bubbleOlli, falhou && styles.bubbleErro, { maxWidth: '100%' }]} accessibilityState={{ busy: revelando }}>
          {falhou || revelando ? <Text selectable style={styles.bubbleOlliText}>{mostrado}</Text> : <MarkdownChat texto={mostrado} />}
          {revelando && <View style={styles.cursor} accessibilityElementsHidden />}
        </View>
        {falhou && (
          <TouchableOpacity style={styles.tentarDeNovoBtn} onPress={onTentarDeNovo} activeOpacity={0.75}>
            <MaterialCommunityIcons name="refresh" size={14} color={cores.accentLight} />
            <Text style={styles.tentarDeNovoText}>Tentar de novo</Text>
          </TouchableOpacity>
        )}
        {!falhou && (onTransformarEmOrcamento || podeSinalizar) && (
          <View style={styles.acoesRow}>
            {onTransformarEmOrcamento && (
              <TouchableOpacity style={styles.transformarBtn} onPress={onTransformarEmOrcamento} activeOpacity={0.75}>
                <MaterialCommunityIcons name="file-plus-outline" size={14} color={cores.accentLight} />
                <Text style={styles.transformarText}>Transformar em orçamento</Text>
              </TouchableOpacity>
            )}
            {podeSinalizar && (
              <SinalizarIA tela="OlliChatScreen" resposta={texto} pedido={pedido ?? ''} />
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function RascunhoAcaoCard({
  rascunho,
  processando,
  onConfirmar,
  onCancelar,
  onReverter,
}: {
  rascunho: RascunhoAcaoChat;
  processando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
  onReverter: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const pendente = rascunho.status === 'aguardando_confirmacao';
  const aplicada = rascunho.status === 'aplicada';
  return (
    <View style={styles.acaoCard} accessibilityLabel="Prévia de alteração da OLLI">
      <View style={styles.acaoCabecalho}>
        <View style={styles.acaoIcone}><MaterialCommunityIcons name={aplicada ? 'check-decagram' : 'shield-edit-outline'} size={20} color={aplicada ? cores.success : cores.accentLight} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.acaoTitulo}>{aplicada ? 'Alteração aplicada' : 'Prévia de alteração'}</Text>
          <Text style={styles.acaoSub}>{rascunho.summary}</Text>
        </View>
      </View>
      <Text style={styles.acaoAlvo}>Alvo: <Text style={styles.acaoAlvoDestaque}>{rascunho.targetLabel}</Text></Text>
      <View style={styles.acaoMudancas}>
        {rascunho.changes.map((change) => (
          <View key={change.field} style={styles.acaoMudanca}>
            <Text style={styles.acaoCampo}>{change.field}</Text>
            <Text style={styles.acaoValor} numberOfLines={2}>{String(change.before ?? 'vazio')} → {String(change.after ?? 'vazio')}</Text>
          </View>
        ))}
      </View>
      {pendente ? (
        <View style={styles.acaoBotoes}>
          <OlliButton label="Confirmar alteração" variant="gradient" size="sm" loading={processando} disabled={processando} onPress={onConfirmar} style={{ flex: 1 }} />
          <OlliButton label="Cancelar" variant="outline" size="sm" disabled={processando} onPress={onCancelar} style={{ flex: 1 }} />
        </View>
      ) : aplicada ? (
        <OlliButton label="Desfazer alteração" variant="outline" size="sm" loading={processando} disabled={processando} onPress={onReverter} icon={<MaterialCommunityIcons name="undo-variant" size={16} color={cores.primary} />} />
      ) : null}
      <Text style={styles.acaoNota}>Ação limitada por papel, registro único e confirmação. Exclusões, pagamentos, senhas e permissões não são executados pelo chat.</Text>
    </View>
  );
}

function PontoPulsante({ delay }: { delay: number }) {
  const styles = useEstilos(criarEstilos);
  const reduzir = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // reduced-motion: pontos estáticos (o estado "digitando" já é sinalizado pelo texto/layout).
    if (reduzir) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(450 - delay >= 0 ? 450 - delay : 0),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, t, reduzir]);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const opacity = t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return <Animated.View style={[styles.typingDot, { opacity, transform: [{ translateY }] }]} />;
}

function Digitando({ podeCancelar, onCancelar }: { podeCancelar: boolean; onCancelar: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <AnimatedEntrance from="bottom">
      <View style={styles.rowOlli}>
        <View style={styles.olliAvatar}>
          <OlliMascot size={26} onDark float={false} blink={false} />
        </View>
        <View>
          <View style={[styles.bubble, styles.bubbleOlli, styles.bubbleTyping]}>
            <PontoPulsante delay={0} />
            <PontoPulsante delay={150} />
            <PontoPulsante delay={300} />
          </View>
          {podeCancelar && (
            <TouchableOpacity style={styles.tentarDeNovoBtn} onPress={onCancelar} activeOpacity={0.75}>
              <MaterialCommunityIcons name="close" size={14} color={cores.onSurfaceVariant} />
              <Text style={styles.cancelarText}>Cancelar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </AnimatedEntrance>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  rowUser: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  rowOlli: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'flex-start', marginBottom: 14 },
  // rgba(127,233,245,x) era o accentLight estático — vira o accentLight do tema.
  olliAvatar: { width: 36, height: 36, borderRadius: BorderRadius.chip, backgroundColor: comAlfa(c.accentLight, 0.12), borderWidth: 1, borderColor: comAlfa(c.accentLight, 0.3), justifyContent: 'center', alignItems: 'center', marginRight: 8 },

  colunaOlli: { flex: 1, maxWidth: '88%' },
  bubble: { maxWidth: '100%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 11 },
  bubbleUser: { maxWidth: '86%', backgroundColor: c.primary, borderBottomRightRadius: 6, ...sombrasDe(c).sm },
  bubbleUserText: { fontSize: 14.5, color: '#fff', lineHeight: 20 },
  bubbleOlli: { backgroundColor: c.surfaceElevated, borderWidth: 1, borderColor: c.outline, borderBottomLeftRadius: 5 },
  bubbleOlliText: { fontSize: 14.5, color: c.onSurface, lineHeight: 20 },
  // rgba(247,178,59,x) era o warning estático — vira o warning do tema.
  bubbleErro: { borderColor: comAlfa(c.warning, 0.4), backgroundColor: comAlfa(c.warning, 0.08) },
  bubbleTyping: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cursor: { width: 2, height: 16, borderRadius: 1, marginTop: 6, backgroundColor: c.accentLight },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.accentLight },

  tentarDeNovoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 4, paddingVertical: 4 },
  tentarDeNovoText: { fontSize: 12.5, fontWeight: '700', color: c.accentLight },
  cancelarText: { fontSize: 12.5, fontWeight: '600', color: c.onSurfaceVariant },
  acoesRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  transformarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  transformarText: { fontSize: 12.5, fontWeight: '700', color: c.accentLight },
  // (o botão "Sinalizar" e seus estados vivem em components/SinalizarIA.tsx —
  //  as três superfícies generativas compartilham o mesmo caminho de denúncia)

  sugestoesWrap: { marginTop: 8 },
  sugestoesLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: c.onSurfaceVariant, textTransform: 'uppercase', marginBottom: 10, marginLeft: 4 },
  // rgba(52,198,217,x) era o accent estático — vira o accent do tema.
  sugestaoChip: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: comAlfa(c.accent, 0.07), borderWidth: 1, borderColor: comAlfa(c.accent, 0.28), borderRadius: BorderRadius.md, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 9 },
  sugestaoText: { flex: 1, fontSize: 14, color: c.onSurface, fontWeight: '600' },

  creditoAcoes: { width: '100%', marginTop: 14, gap: 8 },
  creditoBotao: { alignSelf: 'stretch', marginTop: 0 },
  creditoAviso: { color: c.onSurfaceVariant, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 2 },

  casoBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.base, paddingTop: 8, paddingBottom: 2, backgroundColor: c.surface },
  casoBarTexto: { flex: 1, color: c.onSurfaceVariant, fontSize: 13, lineHeight: 17 },
  casoBarDestaque: { color: c.onSurface, fontWeight: '800' },
  modoAviso: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.base, paddingTop: 8, paddingBottom: 2, backgroundColor: c.surface },
  modoAvisoTexto: { flex: 1, color: c.onSurfaceVariant, fontSize: 13, lineHeight: 17 },
  acaoCard: { marginBottom: 12, padding: Spacing.base, borderRadius: BorderRadius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: comAlfa(c.accentLight, 0.45), ...sombrasDe(c).sm },
  acaoCabecalho: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  acaoIcone: { width: 36, height: 36, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: comAlfa(c.accentLight, 0.12) },
  acaoTitulo: { color: c.onSurface, fontSize: 14, fontWeight: '800' },
  acaoSub: { color: c.onSurfaceVariant, fontSize: 12, marginTop: 2 },
  acaoAlvo: { color: c.onSurfaceVariant, fontSize: 12.5, marginTop: 12 },
  acaoAlvoDestaque: { color: c.onSurface, fontWeight: '800' },
  acaoMudancas: { marginTop: 8, borderTopWidth: 1, borderTopColor: c.outline },
  acaoMudanca: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: c.outline },
  acaoCampo: { width: 104, color: c.onSurfaceMuted, fontSize: 13, fontWeight: '700' },
  acaoValor: { flex: 1, color: c.onSurface, fontSize: 12, lineHeight: 17 },
  acaoBotoes: { flexDirection: 'row', gap: 8, marginTop: 12 },
  acaoNota: { color: c.onSurfaceMuted, fontSize: 13, lineHeight: 17, marginTop: 10 },

  inputBar: { paddingHorizontal: Spacing.base, paddingTop: 10, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  composer: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outline, paddingLeft: 14, paddingRight: 6, paddingVertical: 6, minHeight: 48 },
  input: { flex: 1, fontSize: 15, color: c.onSurface, maxHeight: 120, paddingTop: Platform.OS === 'ios' ? 8 : 4, paddingBottom: Platform.OS === 'ios' ? 8 : 4 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  sendBtnDisabled: { backgroundColor: c.surfaceElevated },
});
