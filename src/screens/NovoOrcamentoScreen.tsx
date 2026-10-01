import { formatarNumeroExibicao } from '../utils/numeroDocumento';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform,
  Keyboard, Alert, ActivityIndicator,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useNavigation, useRoute, RouteProp, usePreventRemove, type NavigationAction } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { vibrar } from '../utils/haptico';
import { Spacing, BorderRadius, useCores, useEstilos, comAlfa, textoSobre, type Cores } from '../theme';
import { DISTANCIA, DURACAO, useReduzirMovimento } from '../theme/motion';
import { ContadorAnimado, curvas } from '../components/motion';
import { toast } from '../components/feedback';
import { avisar, confirmar } from './desktop/dialogo';
import { StepIndicator } from '../components/StepIndicator';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { Celebracao } from '../components/Celebracao';
import {
  getOrcamento, getNextOrcamentoNumber, saveOrcamento, getClientes, getEmpresa, edicaoBloqueada,
  getUltimoOrcamentoDoCliente,
} from '../database/database';
import { Orcamento, ItemOrcamento, Empresa } from '../types';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { emptyOrcamento, clienteParaOrc, calcTotais, round2 } from '../utils/orcamentoBase';
import { formatCurrency } from '../utils/currency';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { track, Eventos } from '../services/analytics';
import { AVISO_EXEMPLO } from '../services/ativacao';
import {
  PASSOS_VISIVEIS,
  direcaoDaTroca,
  idsDeCortesia,
  indiceVisivel,
  motivoBloqueio,
  passoAnterior,
  passoInicial,
  progressoDoPasso,
  proximoPasso,
  repetirDoUltimo,
  rotuloDoBotaoPrincipal,
  type EstadoUltimoOrcamento,
  type Passo,
} from '../utils/orcarRapido';

// Steps
import Step1Cliente from '../steps/Step1Cliente';
import Step2Itens from '../steps/Step2Itens';
import Step3Detalhes from '../steps/Step3Detalhes';
import Step4Personalizacao from '../steps/Step4Personalizacao';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'NovoOrcamento'>;


const PDF_MODEL_LABELS: Record<string, string> = {
  editorial: 'Editorial',
  minimalista: 'Minimalista',
  bold: 'Bold',
  classico: 'Classico',
  faixa_lateral: 'Faixa lateral',
  recibo_compacto: 'Recibo compacto',
  premium_capa: 'Premium com capa',
};

/** Carga inicial do editor em 3 estados — falha NUNCA vira tela em branco. */
type Carga =
  | { estado: 'carregando' }
  | { estado: 'erro'; titulo: string; mensagem: string }
  | { estado: 'pronto' };

type EscolhaSaida = 'descartar' | 'rascunho' | 'ficar';

/**
 * Pergunta o que fazer com o orçamento ao sair do passo 1 (botão da tela,
 * voltar do Android ou gesto). No celular são 3 saídas, com "Descartar" em
 * vermelho e o verbo certo; na web o diálogo do app só tem confirmar/cancelar —
 * lá o "Rascunho" continua à mão no rodapé.
 */
function perguntarSaida(isEdit: boolean): Promise<EscolhaSaida> {
  const titulo = isEdit ? 'Descartar alterações?' : 'Descartar orçamento?';
  if (Platform.OS === 'web') {
    return confirmar(titulo, 'As informações preenchidas serão perdidas.')
      .then((ok): EscolhaSaida => (ok ? 'descartar' : 'ficar'));
  }
  return new Promise(resolve => {
    Alert.alert(
      titulo,
      isEdit
        ? 'Você pode salvar o que mudou antes de sair.'
        : 'Você pode guardar como rascunho e terminar depois.',
      [
        { text: 'Continuar editando', style: 'cancel', onPress: () => resolve('ficar') },
        { text: isEdit ? 'Salvar alterações' : 'Salvar rascunho', onPress: () => resolve('rascunho') },
        { text: 'Descartar', style: 'destructive', onPress: () => resolve('descartar') },
      ],
      { cancelable: true, onDismiss: () => resolve('ficar') },
    );
  });
}

/** Ações de navegação que são "voltar" (botão do Android, gesto, seta do header). */
function ehAcaoDeVoltar(acao: NavigationAction): boolean {
  return acao.type === 'GO_BACK' || acao.type === 'POP';
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
  // Autopilot: nome do cliente sem cadastro (ou fallback se o id não for achado).
  const prefillClienteNome = (route.params as any)?.clienteNome as string | undefined;
  const prefillItem = (route.params as any)?.prefillItem as
    | { tipo: 'servico' | 'produto'; nome: string; descricao?: string; quantidade?: number; unidade?: string; precoSugerido?: number }
    | undefined;
  const prefillItems = (route.params as any)?.prefillItems as
    | { tipo: 'servico' | 'produto'; nome: string; descricao?: string; quantidade?: number; unidade?: string; precoSugerido?: number }[]
    | undefined;
  // Orçamento de EXEMPLO da ativação (Início → "Seu primeiro orçamento em 1 minuto"):
  // os itens chegam com valor de referência e o editor avisa que é exemplo.
  const ehExemplo = !isEdit && !!(route.params as any)?.exemploVertical;

  const [passo, setPasso] = useState<Passo>('cliente');
  const [saving, setSaving] = useState(false);
  const [orc, setOrc] = useState<Orcamento | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [carga, setCarga] = useState<Carga>({ estado: 'carregando' });
  // O usuário mexeu em algo (cliente, itens, detalhes)? Decide se sair pede confirmação.
  const [alterado, setAlterado] = useState(false);
  // Teclado aberto → o rodapé encolhe (ou sai, no passo Cliente) — ver `rodapeCompacto`.
  const [tecladoAberto, setTecladoAberto] = useState(false);
  // Liga logo antes de uma saída que JÁ foi decidida (salvou, descartou) para o
  // usePreventRemove não perguntar de novo sobre o mesmo trabalho.
  const saidaLiberadaRef = useRef(false);
  // Número reservado num save que falhou: reaproveitado no próximo, para uma
  // nova tentativa não queimar outro número da sequência.
  const numeroReservadoRef = useRef<string | null>(null);
  // Celebração ao gerar com sucesso (só na criação — editar não repete a festa).
  // Navega para VisualizarOrcamento só depois do onDone, para o usuário ver o overlay.
  const [celebrando, setCelebrando] = useState(false);
  const pendingNavRef = useRef<string | null>(null);
  // IDs de itens com preço R$ 0,00 que o usuário já confirmou explicitamente
  // como cortesia/brinde (via Alert em Step2Itens). Persiste entre trocas de
  // passo porque vive no componente pai, que não desmonta.
  const [itensZeroConfirmados, setItensZeroConfirmados] = useState<Set<string>>(new Set());
  // "Repetir o último orçamento deste cliente" (só na criação, cliente do cadastro).
  const [ultimoDoCliente, setUltimoDoCliente] = useState<EstadoUltimoOrcamento | undefined>(undefined);

  // Troca de passo na UI thread (Reanimated): o conteúdo entra deslizando
  // `DISTANCIA.deslize` e ganhando opacidade; a barra enche por scaleX. Só
  // transform/opacity. "Reduzir movimento" = tudo já no estado final.
  const reduzirMovimento = useReduzirMovimento();
  const deslize = useSharedValue(0);
  const opacidadeConteudo = useSharedValue(1);
  const progresso = useSharedValue(progressoDoPasso('cliente'));

  const animarPasso = useCallback((dir: 1 | -1, novo: Passo) => {
    const alvo = progressoDoPasso(novo);
    if (reduzirMovimento) {
      deslize.set(0);
      opacidadeConteudo.set(1);
      progresso.set(alvo);
      return;
    }
    deslize.set(withSequence(
      withTiming(dir * DISTANCIA.deslize, { duration: 0 }),
      withTiming(0, { duration: DURACAO.base, easing: curvas.emphasized }),
    ));
    opacidadeConteudo.set(withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: DURACAO.fast, easing: curvas.standard }),
    ));
    progresso.set(withTiming(alvo, { duration: DURACAO.slow, easing: curvas.emphasized }));
  }, [reduzirMovimento, deslize, opacidadeConteudo, progresso]);

  const estiloConteudo = useAnimatedStyle(() => ({
    opacity: opacidadeConteudo.get(),
    transform: [{ translateX: deslize.get() }],
  }));
  const estiloBarra = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0.001, progresso.get()) }],
  }));

  function irPara(novo: Passo) {
    if (novo === passo) return;
    Keyboard.dismiss();
    animarPasso(direcaoDaTroca(passo, novo), novo);
    setPasso(novo);
  }

  /** Botão principal: vai ao próximo passo ou, na revisão, salva. */
  function acaoPrincipal() {
    if (!canAdvance()) return;
    const prox = proximoPasso(passo);
    if (prox) irPara(prox);
    else void handleSave();
  }

  // Teclado aberto troca o rodapé: no passo Cliente ele sai da frente (a busca de
  // cliente só mostrava meio resultado com o rodapé subindo junto); nos outros
  // vira a barra fina com total e botão principal, acima do teclado.
  useEffect(() => {
    const evAbrir = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const evFechar = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const abrir = Keyboard.addListener(evAbrir, () => setTecladoAberto(true));
    const fechar = Keyboard.addListener(evFechar, () => setTecladoAberto(false));
    return () => { abrir.remove(); fechar.remove(); };
  }, []);

  // Evita setState depois de sair da tela (a carga é assíncrona).
  // Religa no (re)montar: no StrictMode o React desmonta e remonta o efeito, e um
  // `false` que nunca volta a `true` deixaria a tela presa em "Preparando…".
  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  const carregar = useCallback(async () => {
    setCarga({ estado: 'carregando' });
    try {
      // Carregada primeiro porque tanto a edição (Step4 precisa dela pro
      // default de cor) quanto a criação (padrões pré-preenchidos) dependem
      // da empresa já estar em mãos antes de montar o orçamento.
      const emp = await getEmpresa();
      if (!montadoRef.current) return;
      setEmpresa(emp);

      if (isEdit) {
        const existing = orcamentoId ? await getOrcamento(orcamentoId) : null;
        if (!montadoRef.current) return;
        if (!existing) {
          // Editar um orçamento que não está neste aparelho NÃO pode virar um
          // orçamento novo em branco (era o que acontecia): diz o que houve.
          setCarga({
            estado: 'erro',
            titulo: 'Orçamento não encontrado',
            mensagem: 'Ele não está neste aparelho. Se foi criado em outro lugar, espere a sincronização e tente de novo.',
          });
          return;
        }
        // TRAVA DO PRÓPRIO EDITOR (gêmea da de `FormOrcamento.tsx` no painel).
        // As telas que trazem o usuário até aqui já escondem "Editar" nesses
        // status, mas esta é a única guarda que cobre quem NÃO passa por tela:
        // o deep link `orcamentos/:id/editar` (`linking.ts`) abre o editor
        // direto pela URL. Sem ela, o usuário preenche a tela inteira e só
        // descobre no "Salvar" que `saveOrcamento` recusa — perdendo o que
        // digitou. Recusar na porta custa zero e aponta o caminho que funciona.
        if (edicaoBloqueada(existing.status)) {
          avisar(
            'Este orçamento não pode mais ser editado',
            'O cliente já recebeu este documento. Para mudar valores ou itens, use “Criar revisão” — nasce um rascunho novo ligado ao original, que continua preservado.',
          );
          goBackOrHome(nav);
          return;
        }
        setOrc(existing);
        // Itens de um orçamento já salvo (fora deste fluxo) com preço 0 são
        // tratados como já confirmados, para não travar a edição de um
        // orçamento antigo pedindo reconfirmação de itens que já existiam.
        const idsZeroExistentes = existing.itens.filter(i => i.preco <= 0).map(i => i.id);
        if (idsZeroExistentes.length > 0) {
          setItensZeroConfirmados(new Set(idsZeroExistentes));
        }
        setCarga({ estado: 'pronto' });
        return;
      }

      // Número só no SALVAR (handleSave/handleRascunho): abrir o formulário e
      // desistir queimava um número e deixava buraco na sequência que o cliente vê.
      let base = emptyOrcamento('', emp);

      // Pré-seleciona o cliente (mesmos campos que o Step1Cliente preenche).
      let clienteLigado = false;
      if (prefillClienteId) {
        const cliente = (await getClientes()).find(c => c.id === prefillClienteId);
        if (cliente) { base = { ...base, ...clienteParaOrc(cliente) }; clienteLigado = true; }
      }
      // Sem cadastro (ou id não achado): entra só o nome; o passo 1 mostra o
      // cliente escolhido e o usuário pode trocar/ligar ao cadastro.
      const nomeAvulso = typeof prefillClienteNome === 'string' ? prefillClienteNome.trim().slice(0, 160) : '';
      if (!clienteLigado && nomeAvulso) base = { ...base, clienteNome: nomeAvulso };

      // Pré-carrega itens de diagnóstico/Autopilot para o usuário só ajustar
      // preço e quantidade. Preço não é inventado aqui: a origem pode trazer
      // somente descrição e o editor continua sendo a autoridade. `precoSugerido`
      // vem do exemplo da ativação (a tela diz que é referência) ou do preço que
      // o Autopilot leu da fonte — o usuário revisa no passo de itens.
      const itensPrefill = [
        ...(prefillItem ? [prefillItem] : []),
        ...(Array.isArray(prefillItems) ? prefillItems : []),
      ].filter((item) => item?.nome?.trim()).map((item): ItemOrcamento => {
        const quantidade = typeof item.quantidade === 'number' && item.quantidade > 0 ? item.quantidade : 1;
        const preco = typeof item.precoSugerido === 'number' && Number.isFinite(item.precoSugerido) && item.precoSugerido >= 0
          ? round2(item.precoSugerido)
          : 0;
        return {
          id: generateId(), tipo: item.tipo, catalogoId: '', nome: item.nome.trim(),
          descricao: item.descricao?.trim() || undefined, preco, quantidade,
          unidade: item.unidade?.trim() || 'un', subtotal: round2(preco * quantidade),
        };
      });
      if (itensPrefill.length) base = calcTotais({ ...base, itens: itensPrefill });

      if (!montadoRef.current) return;
      // Cliente já ligado ao cadastro (veio do CRM): o passo "Cliente" não tem o
      // que fazer — abre direto em Itens (o "Voltar" ainda leva ao cliente).
      const inicial = passoInicial({ edicao: false, clienteLigado });
      setPasso(inicial);
      progresso.set(progressoDoPasso(inicial));
      setOrc(base);
      setCarga({ estado: 'pronto' });
    } catch {
      if (!montadoRef.current) return;
      setCarga({
        estado: 'erro',
        titulo: 'Não consegui abrir o orçamento',
        mensagem: 'Os dados do aparelho não carregaram agora. Nada foi perdido — toque em “Tentar de novo”.',
      });
    }
  }, [isEdit, orcamentoId, prefillClienteId, prefillClienteNome, prefillItem, prefillItems, nav, progresso]);

  // Carga automática UMA vez só. `carregar` muda de identidade se `nav` ou os
  // params mudarem (setParams, navigate para a mesma rota) — recarregar aí
  // zeraria o orçamento que o usuário já está montando. Depois disso, só o
  // "Tentar de novo" chama `carregar` de novo.
  const cargaIniciadaRef = useRef(false);
  useEffect(() => {
    if (cargaIniciadaRef.current) return;
    cargaIniciadaRef.current = true;
    void carregar();
  }, [carregar]);

  function update(partial: Partial<Orcamento>) {
    setAlterado(true);
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

  /** Por que o botão principal está apagado (`null` = liberado). Ver `motivoBloqueio`. */
  function bloqueio(): string | null {
    if (!orc) return 'Carregando…';
    return motivoBloqueio(passo, orc, itensZeroConfirmados);
  }

  function canAdvance(): boolean {
    return bloqueio() === null;
  }

  // ─── REPETIR O ÚLTIMO ORÇAMENTO DO CLIENTE ─────────────────────────
  const clienteIdAtual = orc?.clienteId ?? '';
  const orcIdAtual = orc?.id ?? '';
  const carregarUltimo = useCallback(async () => {
    if (isEdit || !clienteIdAtual) {
      setUltimoDoCliente(undefined);
      return;
    }
    setUltimoDoCliente({ estado: 'carregando' });
    try {
      const anterior = await getUltimoOrcamentoDoCliente(clienteIdAtual, orcIdAtual);
      if (montadoRef.current) setUltimoDoCliente({ estado: 'pronto', orcamento: anterior });
    } catch {
      if (montadoRef.current) setUltimoDoCliente({ estado: 'erro' });
    }
  }, [isEdit, clienteIdAtual, orcIdAtual]);

  useEffect(() => {
    void carregarUltimo();
  }, [carregarUltimo]);

  function repetirUltimo(origem: Orcamento) {
    const parcial = repetirDoUltimo(origem, generateId);
    update(parcial);
    // Itens R$ 0,00 de um orçamento já salvo passaram pela confirmação lá.
    const cortesias = idsDeCortesia(parcial.itens ?? []);
    if (cortesias.length) setItensZeroConfirmados(prev => new Set([...prev, ...cortesias]));
    vibrar('sucesso');
    toast.sucesso(`Itens, desconto e condições do orçamento nº ${formatarNumeroExibicao(origem.numero)} copiados. Confira os preços antes de enviar.`);
  }

  /**
   * Uma falha de save não é uma só. `saveOrcamento` recusa por REGRA COMERCIAL
   * (orçamento já enviado ou aceito) com `codigo: 'ORCAMENTO_PROTEGIDO'`, e isso é
   * PERMANENTE: "tente novamente em instantes" manda o usuário repetir para
   * sempre um caminho que nunca vai abrir, e o trabalho digitado some junto.
   * Lemos o `codigo` em vez de `instanceof` — sobrevive ao erro cruzar camadas.
   */
  function avisarFalhaSalvar(e: unknown) {
    if ((e as { codigo?: string } | null)?.codigo === 'ORCAMENTO_PROTEGIDO') {
      avisar(
        'Este orçamento está protegido',
        'O cliente já recebeu ou aceitou este orçamento. Volte e use “Criar revisão” para gerar um novo rascunho ligado ao original.',
      );
      return;
    }
    avisar('Não foi possível salvar', 'Tente novamente em instantes.');
  }

  /**
   * Número do orçamento: reservado só agora, na hora de gravar (abrir e
   * desistir não gasta número). Na edição ele já existe. Se um save falhar
   * depois de reservar, a próxima tentativa reaproveita o mesmo número.
   */
  async function garantirNumero(atual: Orcamento): Promise<string> {
    if (atual.numero) return atual.numero;
    if (numeroReservadoRef.current) return numeroReservadoRef.current;
    const numero = await getNextOrcamentoNumber();
    numeroReservadoRef.current = numero;
    if (montadoRef.current) setOrc(prev => (prev && !prev.numero ? { ...prev, numero } : prev));
    return numero;
  }

  /** Sai da tela por um caminho já decidido (salvou ou descartou), sem perguntar de novo. */
  function sairLiberado(acao?: NavigationAction) {
    saidaLiberadaRef.current = true;
    if (acao) nav.dispatch(acao);
    else goBackOrHome(nav);
  }

  async function handleSave(finalOrc?: Partial<Orcamento>) {
    if (!orc) return;
    setSaving(true);
    try {
      const agora = nowISO();
      const numero = await garantirNumero(orc);
      const toSave: Orcamento = {
        ...orc,
        ...(finalOrc ?? {}),
        numero,
        atualizadoEm: agora,
        ...(isEdit ? { editadoEm: agora } : {}),
      };
      await saveOrcamento(calcTotais(toSave));
      // Celebração só na criação (editar um orçamento existente não repete a
      // festa) — o overlay dispara e a navegação real acontece no onDone dele,
      // pra dar tempo do usuário ver a animação antes de trocar de tela.
      if (!isEdit) {
        track(Eventos.quoteCreated, { origem: ehExemplo ? 'exemplo_ativacao' : 'manual', itens: toSave.itens.length });
        pendingNavRef.current = toSave.id;
        saidaLiberadaRef.current = true;
        setCelebrando(true);
      } else {
        saidaLiberadaRef.current = true;
        nav.replace('VisualizarOrcamento', { orcamentoId: toSave.id });
      }
    } catch (e) {
      avisarFalhaSalvar(e);
    } finally {
      setSaving(false);
    }
  }

  /**
   * Guarda como rascunho e sai. `acao` = a navegação que o usuário tentou
   * (voltar do Android, gesto) quando o rascunho veio do diálogo de saída.
   */
  async function handleRascunho(acao?: NavigationAction) {
    if (!orc) return;
    setSaving(true);
    try {
      const agora = nowISO();
      const numero = await garantirNumero(orc);
      await saveOrcamento(calcTotais({
        ...orc,
        numero,
        atualizadoEm: agora,
        ...(isEdit ? { editadoEm: agora } : {}),
      }));
      if (!isEdit) track(Eventos.quoteCreated, { origem: 'manual', itens: orc.itens.length, rascunho: true });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        avisar('Rascunho salvo', 'Seu orçamento foi salvo como rascunho.');
        sairLiberado(acao);
        return;
      }
      // Feedback não bloqueante: haptic de sucesso + volta direto, sem exigir
      // toque em "OK" para sair (o aviso só entra no caminho de erro abaixo).
      vibrar('sucesso');
      sairLiberado(acao);
    } catch (e) {
      avisarFalhaSalvar(e);
    } finally {
      setSaving(false);
    }
  }

  function recuarPasso() {
    const anterior = passoAnterior(passo);
    if (anterior) irPara(anterior);
  }

  /**
   * Botão "Voltar/Cancelar" e seta do header. Fora do passo Cliente recua um
   * passo ("Ajustar" volta para a revisão).
   * No passo 1 tenta sair — e, se houver trabalho, o usePreventRemove abaixo
   * pergunta "Descartar ou salvar rascunho" (mesma pergunta do voltar do Android).
   */
  function handleBack() {
    if (passo !== 'cliente') {
      recuarPasso();
      return;
    }
    goBackOrHome(nav);
  }

  function finalizarCelebracao() {
    setCelebrando(false);
    const id = pendingNavRef.current;
    pendingNavRef.current = null;
    if (id) {
      saidaLiberadaRef.current = true;
      nav.replace('VisualizarOrcamento', { orcamentoId: id });
    }
  }

  // Há trabalho a perder? Na criação, qualquer cliente/item já conta (inclusive o
  // pré-carregado); na edição, só o que o usuário mudou.
  const temTrabalho = !!orc && (alterado || (!isEdit && (orc.itens.length > 0 || !!orc.clienteNome.trim())));
  // Voltar do Android / gesto / seta: antes descartava o orçamento inteiro sem
  // perguntar. Agora, fora do passo Cliente recua um passo; no Cliente pergunta.
  usePreventRemove(carga.estado === 'pronto' && !celebrando && (passo !== 'cliente' || temTrabalho), ({ data }) => {
    if (saidaLiberadaRef.current) {
      nav.dispatch(data.action);
      return;
    }
    if (passo !== 'cliente' && ehAcaoDeVoltar(data.action)) {
      recuarPasso();
      return;
    }
    if (!temTrabalho) {
      nav.dispatch(data.action);
      return;
    }
    Keyboard.dismiss();
    void perguntarSaida(isEdit).then(escolha => {
      if (escolha === 'descartar') sairLiberado(data.action);
      else if (escolha === 'rascunho') void handleRascunho(data.action);
    });
  });

  if (carga.estado !== 'pronto' || !orc) {
    return (
      <View style={styles.container}>
        <GradientHeader
          title={isEdit ? 'Editar orçamento' : 'Novo orçamento'}
          onBack={() => goBackOrHome(nav)}
          compact
        />
        {carga.estado === 'erro' ? (
          <View style={styles.estadoBox} accessibilityRole="alert">
            <MaterialCommunityIcons name="alert-circle-outline" size={40} color={cores.danger} />
            <Text style={styles.estadoTitulo}>{carga.titulo}</Text>
            <Text style={styles.estadoTexto}>{carga.mensagem}</Text>
            <OlliButton
              label="Tentar de novo"
              variant="gradient"
              size="md"
              onPress={() => { void carregar(); }}
              icon={<MaterialCommunityIcons name="refresh" size={18} color="#fff" />}
              style={{ marginTop: Spacing.base, alignSelf: 'stretch' }}
            />
            <OlliButton
              label="Voltar"
              variant="ghost"
              size="md"
              onPress={() => goBackOrHome(nav)}
              style={{ marginTop: 6, alignSelf: 'stretch' }}
            />
          </View>
        ) : (
          <View style={styles.estadoBox} accessibilityLabel="Carregando o orçamento">
            <ActivityIndicator size="large" color={cores.primary} />
            <Text style={styles.estadoTexto}>Preparando o orçamento…</Text>
          </View>
        )}
      </View>
    );
  }

  const clienteResumo = orc.clienteNome.trim() || 'sem cliente';
  const modeloResumo = orc.modeloNome ?? (orc.modeloPdf ? PDF_MODEL_LABELS[orc.modeloPdf] ?? orc.modeloPdf : '');
  const itemResumo = `${orc.itens.length} ${orc.itens.length === 1 ? 'item' : 'itens'}`;
  const motivo = bloqueio();
  const rotuloPrincipal = rotuloDoBotaoPrincipal(passo, isEdit);
  const ehSalvar = proximoPasso(passo) === null;
  const subtituloPasso = passo === 'ajustar'
    ? 'Ajustar detalhes'
    : `Passo ${indiceVisivel(passo) + 1} de ${PASSOS_VISIVEIS.length}`;
  const iconePrincipal = ehSalvar ? 'content-save-check-outline' : passo === 'ajustar' ? 'check' : 'arrow-right';
  // Teclado aberto: no passo Cliente o rodapé sai da frente da busca (B07); nos
  // outros fica uma barra fina com o total e o botão principal, por cima do
  // teclado — dá para seguir sem fechar o teclado, e nada do rodapé fica coberto.
  const rodapeCompacto = tecladoAberto && passo !== 'cliente';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <GradientHeader
        title={isEdit ? 'Editar orçamento' : 'Novo orçamento'}
        subtitle={`${orc.numero ? `Nº ${formatarNumeroExibicao(orc.numero)}` : 'Nº a definir'} · ${subtituloPasso}`}
        onBack={handleBack}
        compact
        right={
          <TouchableOpacity
            style={styles.voiceBtn}
            activeOpacity={0.85}
            onPress={() => {
              vibrar('selecao');
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
        {orc.revisaoDeNumero ? (
          <View style={styles.revisionBanner} accessible accessibilityRole="summary">
            <MaterialCommunityIcons name="file-document-edit-outline" size={17} color="#fff" />
            <Text style={styles.revisionBannerText}>
              Revisão do nº {formatarNumeroExibicao(orc.revisaoDeNumero)}: o original está preservado. Salve e envie este novo orçamento.
            </Text>
          </View>
        ) : null}
        {ehExemplo ? (
          <View style={styles.revisionBanner} accessible accessibilityRole="summary">
            <MaterialCommunityIcons name="lightbulb-on-outline" size={17} color="#fff" />
            <Text style={styles.revisionBannerText}>Orçamento de exemplo. {AVISO_EXEMPLO}</Text>
          </View>
        ) : null}
        <StepIndicator steps={[...PASSOS_VISIVEIS]} current={indiceVisivel(passo)} />
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, estiloBarra]} />
        </View>
      </GradientHeader>

      <Animated.View style={[styles.content, estiloConteudo]}>
        {passo === 'cliente' && <Step1Cliente orc={orc} onChange={update} />}
        {passo === 'itens' && (
          <Step2Itens
            orc={orc}
            onChangeItens={updateItens}
            onChangeOrc={update}
            itensZeroConfirmados={itensZeroConfirmados}
            onConfirmarItemZero={confirmarItemZero}
            ultimoDoCliente={ultimoDoCliente}
            onRepetirUltimo={repetirUltimo}
            onTentarUltimoDeNovo={() => { void carregarUltimo(); }}
          />
        )}
        {passo === 'ajustar' && <Step3Detalhes orc={orc} onChange={update} empresa={empresa} />}
        {passo === 'revisar' && (
          <Step4Personalizacao
            orc={orc}
            onChange={update}
            empresa={empresa}
            onAjustarDetalhes={() => irPara('ajustar')}
          />
        )}
      </Animated.View>

      {rodapeCompacto ? (
        <View style={styles.footerCompacto}>
          <View style={{ flex: 1 }} accessible accessibilityLabel={`Total ${formatCurrency(orc.valorTotal)}`}>
            <Text style={styles.summaryLabel}>Valor total</Text>
            <ContadorAnimado valor={orc.valorTotal} formato="brl" style={styles.summaryTotalCompacto} />
          </View>
          <OlliButton
            label={rotuloPrincipal}
            variant="gradient"
            size="sm"
            onPress={acaoPrincipal}
            loading={ehSalvar && saving}
            disabled={saving || !!motivo}
            accessibilityLabel={motivo ? `${rotuloPrincipal}. ${motivo}` : rotuloPrincipal}
            icon={<MaterialCommunityIcons name={iconePrincipal} size={16} color="#fff" />}
          />
        </View>
      ) : !tecladoAberto ? (
      <>
      <View
        style={styles.quoteSummary}
        accessible
        accessibilityLabel={`Resumo do orçamento. Total ${formatCurrency(orc.valorTotal)}. ${itemResumo}. Cliente ${clienteResumo}${modeloResumo ? `. Modelo PDF ${modeloResumo}` : ''}.`}
      >
        <View style={styles.summaryTotalBlock}>
          <Text style={styles.summaryLabel}>Valor total</Text>
          <ContadorAnimado valor={orc.valorTotal} formato="brl" style={styles.summaryTotal} />
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
        {motivo ? (
          <View style={styles.motivoLinha}>
            <MaterialCommunityIcons name="information-outline" size={14} color={cores.onSurfaceVariant} />
            <Text style={styles.motivoTexto} numberOfLines={2}>{motivo}</Text>
          </View>
        ) : null}
      </View>

      {/* BOTTOM ACTIONS */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={passo === 'cliente' ? 'Cancelar' : passo === 'ajustar' ? 'Voltar para a revisão' : 'Voltar ao passo anterior'}
        >
          <MaterialCommunityIcons name="chevron-left" size={22} color={cores.primary} />
          <Text style={styles.backLabel}>{passo === 'cliente' ? 'Cancelar' : 'Voltar'}</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
          {!ehSalvar ? (
            <OlliButton label="Rascunho" variant="outline" size="md" onPress={() => { void handleRascunho(); }} loading={saving} disabled={saving} haptic={false} />
          ) : null}
          <OlliButton
            label={rotuloPrincipal}
            variant="gradient"
            size="md"
            onPress={acaoPrincipal}
            loading={ehSalvar && saving}
            disabled={saving || !!motivo}
            accessibilityLabel={motivo ? `${rotuloPrincipal}. ${motivo}` : rotuloPrincipal}
            icon={<MaterialCommunityIcons name={iconePrincipal} size={18} color="#fff" />}
          />
        </View>
      </View>

      </>
      ) : null}

      <Celebracao visible={celebrando} tipo="gerado" onDone={finalizarCelebracao} />
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { flex: 1 },
  estadoBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: 10 },
  estadoTitulo: { fontSize: 18, fontWeight: '800', color: c.onSurface, textAlign: 'center' },
  estadoTexto: { fontSize: 14, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  revisionBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginBottom: 10, paddingHorizontal: 11, paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  revisionBannerText: { flex: 1, color: '#fff', fontSize: 11.5, fontWeight: '700', lineHeight: 16 },
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
    width: '100%',
    height: '100%',
    borderRadius: 2,
    // scaleX cresce a partir da esquerda (a barra enche da esquerda pra direita).
    transformOrigin: 'left',
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
  summaryTotalCompacto: { fontSize: 17, fontWeight: '900', color: c.onSurface },
  motivoLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  motivoTexto: { flex: 1, fontSize: 12, color: c.onSurfaceVariant, fontWeight: '600' },
  footerCompacto: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surfaceGlass,
    borderTopWidth: 1, borderTopColor: c.outline,
    paddingHorizontal: Spacing.base, paddingVertical: 8,
  },
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
