import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, RefreshControl, Animated,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { vibrar } from '../utils/haptico';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { capitalizeFirst } from '../utils/date';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, corCategoriaEmChip, comAlfa, type Cores } from '../theme';
import { Motion, useReducedMotion } from '../theme/motion';
import { OlliPressable } from '../components/OlliPressable';
import { OlliMascot } from '../components/OlliMascot';
import { BotaoComoFunciona } from '../components/ajuda/ComoFunciona';
import { DicaDoRoteiro } from '../components/ajuda/DicaDoRoteiro';
import { registrarEventoDica } from '../services/dicasRoteiroStore';
import { Aparecer, Skeleton } from '../components/motion';
import { AcaoNo, NoLinhaDoTempo } from '../components/hoje/LinhaDoTempo';
import { ClimaDaVisita } from '../components/clima/ClimaDaVisita';
import { SeloConfirmacao } from '../components/vespera/SeloConfirmacao';
import { CartaoVespera } from '../components/vespera/CartaoVespera';
import { CartaoGarantias } from '../components/garantia/CartaoGarantias';
import { MalaVesperaCard } from '../components/hoje/MalaVesperaCard';
import { toast } from '../components/feedback';
import { getAgendamentosDoDia, getVisitasSemBaixa, mudarStatusVisitaDoDia } from '../services/agenda';
import { getCliente, getClientes, getOrcamentosAgregadoPorStatus, getOrcamentosDatasCriacao } from '../database/database';
import { onSyncAplicado, pushExtraChave } from '../services/cloudSync';
import { abrirRotaGoogleMaps } from '../services/rotas';
import { mensagemEstouACaminho } from '../services/eta';
import { orcamentosParaFollowUp, mensagemFollowUp, OrcamentoParaFollowUp } from '../services/radarFollowUp';
import { maisPrioritarioFollowUp } from '../utils/prioridadeFollowUp';
import { limitesDoDiaLocal } from '../utils/agendaDia';
import { aplicarEscopo, resolverEscopoAgenda, type EntradaEscopo } from '../utils/agendaDominio';
import {
  ROTULO_FASE, detalheHorario, montarLinhaDoTempo, resumoDoDia, type ItemLinhaDoTempo,
} from '../utils/linhaDoTempoHoje';
import type { OcorrenciaAgendamento } from '../utils/contratoRecorrente';
import { abrirWhatsApp } from '../utils/pdfGenerator';
import { formatCurrency } from '../utils/currency';
import {
  Agendamento, TIPO_AGENDAMENTO_COLORS, TIPO_AGENDAMENTO_LABELS, type Cliente,
} from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { generateId } from '../utils/id';
import { CHECKLIST_KEY, PULSO_ULTIMO_KEY } from '../services/storageKeys';
import { usePlano } from '../hooks/usePlano';
import { useCadeado } from '../hooks/useCadeado';
import { usePermissao } from '../hooks/usePermissao';
import { useTipoConta } from '../hooks/useTipoConta';
import { getCurrentUser } from '../services/supabase';
import { track, Eventos } from '../services/analytics';
import { enviarFeedback } from '../services/feedback';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const useNativeAnimations = Platform.OS !== 'web';

// LayoutAnimation é opt-in fora do New Architecture no Android; motion.ts já
// chama isto no boot, mas repetimos com guard pois este módulo pode carregar
// antes daquele em builds tree-shaken. Chamada idempotente e barata.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Transição de layout curta para add/remover/reordenar tarefas do checklist —
 * a lista "assenta" em vez de saltar. Usa os tokens de duração/easing da OLLI.
 * No web, LayoutAnimation é no-op inofensivo (não anima, mas não quebra).
 */
function animarLayoutChecklist(reduzir: boolean) {
  // Acessibilidade: sem movimento quando o usuário pediu menos animação (mesmo
  // padrão de Agenda/RelatorioDia). A lista só "salta" para o estado final.
  if (reduzir) return;
  LayoutAnimation.configureNext({
    duration: Motion.dur.base,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  });
}

/**
 * Pill discreto "Sincronizando..." — some com fade sozinho depois de exibido.
 * Dá feedback visual de que a tela está de fato conectada à nuvem quando o
 * `onSyncAplicado` recarrega os dados em segundo plano.
 */
function SincronizandoPill({ onDone, top = 8 }: { onDone: () => void; top?: number }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onDone(); });
  }, [opacity]);

  return (
    <Animated.View pointerEvents="none" style={[styles.syncPill, { top, opacity }]}>
      <MaterialCommunityIcons
        name="cloud-sync-outline"
        size={13}
        color={cores.accent} // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 2.88:1 (7.25:1)
      />
      <Text style={styles.syncPillText}>Sincronizando...</Text>
    </Animated.View>
  );
}

interface ChecklistItem { id: string; texto: string; feito: boolean; data: string }


// Dia LOCAL do aparelho. Com toISOString (UTC) o checklist "virava o dia" às 21h
// no Brasil e as tarefas da noite sumiam.
function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function diasAtras(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// Formata um ISO em 'HH:mm', protegendo contra datas inválidas/nulas vindas da nuvem.
function hhmm(iso?: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--:--';
  return format(d, 'HH:mm');
}

/**
 * Linha do checklist com transição suave de estado: ao concluir, o checkbox dá
 * um "pop" moderado (o movimento EXPLICA a mudança — não é purpurina) e o texto
 * ganha o risco. Componente próprio para animar por item sem re-disparar a
 * animação a cada render do pai. Toque com feedback tátil (OlliPressable).
 */
const CheckRow = React.memo(function CheckRow(
  { item, onToggle, onRemove }: { item: ChecklistItem; onToggle: (id: string) => void; onRemove: (id: string) => void },
) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  // `scale` guarda diretamente o fator de escala do checkbox (1 = normal).
  const scale = useRef(new Animated.Value(1)).current;
  const primeiraRender = useRef(true);

  useEffect(() => {
    // Não anima na montagem — só quando o estado REALMENTE muda depois.
    if (primeiraRender.current) {
      primeiraRender.current = false;
      return;
    }
    if (item.feito) {
      // pop de sucesso: cresce um tico e assenta de volta em 1. Curto e discreto —
      // o movimento EXPLICA que a tarefa foi concluída, sem virar bounce infantil.
      scale.setValue(1);
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: Motion.dur.fast, easing: Motion.easing.standard, useNativeDriver: useNativeAnimations }),
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: useNativeAnimations }),
      ]).start();
    } else {
      Animated.timing(scale, { toValue: 1, duration: Motion.dur.fast, easing: Motion.easing.standard, useNativeDriver: useNativeAnimations }).start();
    }
  }, [item.feito, scale]);

  return (
    <View style={styles.checkRow}>
      <OlliPressable
        style={styles.checkTap}
        onPress={() => onToggle(item.id)}
        haptic={false}
        accessibilityLabel={item.feito ? `Desmarcar ${item.texto}` : `Concluir ${item.texto}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.feito }}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <MaterialCommunityIcons
            name={item.feito ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={22}
            color={item.feito ? cores.success : cores.onSurfaceMuted}
          />
        </Animated.View>
        <Text style={[styles.checkText, item.feito && styles.checkTextDone]} numberOfLines={2}>{item.texto}</Text>
      </OlliPressable>
      <TouchableOpacity
        onPress={() => onRemove(item.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Remover tarefa ${item.texto}`}
      >
        <MaterialCommunityIcons name="close" size={18} color={cores.onSurfaceMuted} />
      </TouchableOpacity>
    </View>
  );
});

const PULSO_EMOJIS: { valor: number; emoji: string; label: string }[] = [
  { valor: 1, emoji: '😕', label: 'Ruim' },
  { valor: 2, emoji: '😐', label: 'Mais ou menos' },
  { valor: 3, emoji: '🙂', label: 'Bom' },
  { valor: 4, emoji: '😄', label: 'Muito bom' },
  { valor: 5, emoji: '🤩', label: 'Adoro' },
];

/**
 * Micro-feedback discreto e pulável — "Pulso da semana". HojeScreen é a tela
 * UNIVERSAL (pega o técnico também, não só o dono), por isso mora aqui e não no
 * RelatorioDia. Toque único no emoji já grava (enviarFeedback tipo="pulso"); o
 * comentário depois é OPCIONAL. NUNCA bloqueia — sempre pulável (X) e nunca modal.
 */
function PulsoSemana({ onFechar }: { onFechar: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [nota, setNota] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [enviandoTexto, setEnviandoTexto] = useState(false);
  const [textoEnviado, setTextoEnviado] = useState(false);

  const escolher = useCallback((valor: number) => {
    if (nota !== null) return; // já respondeu — um toque só
    vibrar('selecao');
    setNota(valor);
    track(Eventos.pulsoRespondido, { nota: valor });
    // `nota` aqui ainda é o valor ANTIGO (null) do closure: o toque grava `valor`.
    void enviarFeedback('pulso', '', { tela: 'HojeScreen', nota: valor }).catch(() => {});
  }, [nota]);

  const enviarComentario = useCallback(async () => {
    const msg = texto.trim();
    if (!msg || enviandoTexto || nota === null) return;
    vibrar('selecao');
    setEnviandoTexto(true);
    const r = await enviarFeedback('pulso', msg, { tela: 'HojeScreen', nota });
    setEnviandoTexto(false);
    if (r === 'ok') {
      setTextoEnviado(true);
      setTexto('');
    }
  }, [texto, enviandoTexto, nota]);

  return (
    <View style={styles.pulsoCard}>
      <TouchableOpacity
        style={styles.pulsoFechar}
        onPress={onFechar}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Dispensar pergunta"
      >
        <MaterialCommunityIcons name="close" size={16} color={cores.onSurfaceMuted} />
      </TouchableOpacity>

      {nota === null ? (
        <>
          <Text style={styles.pulsoTitulo}>Como tá o OLLI pra você?</Text>
          <View style={styles.pulsoEmojisRow}>
            {PULSO_EMOJIS.map(e => (
              <OlliPressable
                key={e.valor}
                style={styles.pulsoEmojiBtn}
                onPress={() => escolher(e.valor)}
                haptic={false}
                accessibilityLabel={e.label}
              >
                <Text style={styles.pulsoEmoji}>{e.emoji}</Text>
              </OlliPressable>
            ))}
          </View>
        </>
      ) : textoEnviado ? (
        <Text style={styles.pulsoObrigado}>Valeu por avaliar! 🙌</Text>
      ) : (
        <>
          <Text style={styles.pulsoTitulo}>Obrigado! Quer contar mais alguma coisa? (opcional)</Text>
          <View style={styles.pulsoTextoRow}>
            <TextInput
              style={styles.pulsoInput}
              value={texto}
              onChangeText={setTexto}
              onSubmitEditing={enviarComentario}
              returnKeyType="done"
              placeholder="O que podia ser melhor..."
              placeholderTextColor={cores.onSurfaceMuted}
              multiline
            />
            {texto.trim() ? (
              <OlliPressable
                onPress={enviarComentario}
                haptic={false}
                disabled={enviandoTexto}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Enviar comentário"
              >
                <MaterialCommunityIcons name="arrow-up-circle" size={24} color={cores.accentLight} />
              </OlliPressable>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

/** Atualiza o relógio da linha do tempo (fase de cada visita) enquanto a tela está em foco. */
const TICK_RELOGIO_MS = 60_000;

interface VisitaNaLinhaProps {
  item: ItemLinhaDoTempo<OcorrenciaAgendamento>;
  agora: Date;
  baixando: boolean;
  avisando: boolean;
  onAbrir: (a: OcorrenciaAgendamento) => void;
  onConcluir: (a: OcorrenciaAgendamento) => void;
  onEstouACaminho: (a: OcorrenciaAgendamento) => void;
  /** Cadastro do cliente da visita (ponto para o clima, WhatsApp para remarcar). */
  cliente: Cliente | null;
  clientes: Cliente[];
  /** Depois de remarcar por chuva: relê o dia. */
  aoRemarcado: () => void;
}

/**
 * Card de uma visita na linha do tempo. A FASE manda no que aparece:
 *  - agora     → destaque, "Concluí" e rota;
 *  - sem baixa → aviso, "Dar baixa" e "Remarcar ou cancelar" (abre na Agenda);
 *  - próxima   → "Traçar rota" e "Estou a caminho" (WhatsApp do cliente);
 *  - mais tarde/feita → compacto; o toque abre a visita na Agenda.
 */
const VisitaNaLinha = React.memo(function VisitaNaLinha({
  item, agora, baixando, avisando, onAbrir, onConcluir, onEstouACaminho, cliente, clientes, aoRemarcado,
}: VisitaNaLinhaProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { visita: a, fase } = item;
  // Matiz = significado; luminosidade cede contra o fundo real do chip.
  const corChip = TIPO_AGENDAMENTO_COLORS[a.tipo];
  const cor = corCategoriaEmChip(corChip, cores.surface);
  const detalhe = detalheHorario(item, agora);
  const temEndereco = !!a.endereco?.trim();
  const corFase = fase === 'agora' ? cores.accentLight
    : fase === 'sem_baixa' ? cores.warning
      : fase === 'feita' ? cores.success
        : fase === 'proxima' ? cores.accentLight
          : cores.onSurfaceMuted;

  return (
    <View>
      <OlliPressable
        style={[
          styles.visitaCard,
          fase === 'agora' && styles.visitaCardAgora,
          fase === 'sem_baixa' && styles.visitaCardSemBaixa,
          fase === 'feita' && styles.visitaCardFeita,
        ]}
        // Abre ESTA visita na Agenda. Repetição de série vai com o id
        // inteiro (`<base>@<dia>`), o mesmo formato da notificação: a
        // Agenda abre a base e foca o DIA da repetição. Mandar só a base
        // focaria a semana em que a série começou.
        onPress={() => onAbrir(a)}
        haptic="selection"
        accessibilityLabel={`${ROTULO_FASE[fase]}: ${hhmm(a.inicio)}, ${a.titulo}, ${a.clienteNome}. Abrir na agenda`}
      >
        <View style={styles.visitaTopo}>
          <Text style={[styles.visitaHora, fase === 'feita' && styles.textoFeito]}>{hhmm(a.inicio)}</Text>
          <View style={[styles.faseChip, { backgroundColor: comAlfa(corFase, 0.14), borderColor: comAlfa(corFase, 0.4) }]}>
            <Text style={[styles.faseChipTexto, { color: corFase }]}>{ROTULO_FASE[fase].toUpperCase()}</Text>
          </View>
          {detalhe ? <Text style={styles.visitaDetalhe} numberOfLines={1}>{detalhe}</Text> : null}
        </View>
        <Text style={[styles.visitaTitulo, fase === 'feita' && styles.textoFeito]} numberOfLines={1}>{a.titulo}</Text>
        <Text style={styles.visitaCliente} numberOfLines={1}>
          {a.clienteNome}{temEndereco && fase !== 'feita' ? ` · ${a.endereco!.trim()}` : ''}
        </Text>
        {fase !== 'feita' && (
          <View style={[styles.tipoChip, { backgroundColor: corChip + '22', borderColor: corChip + '55' }]}>
            <Text style={[styles.tipoChipText, { color: cor }]}>{TIPO_AGENDAMENTO_LABELS[a.tipo]}</Text>
          </View>
        )}
        {/* CONFIRMAÇÃO DE VÉSPERA (Onda I3): "Confirmada pelo cliente" / "Pediu
            para remarcar" / "Aguardando". Some sem pedido de confirmação. */}
        {fase !== 'feita' ? <SeloConfirmacao visita={a} style={styles.visitaClima} /> : null}
        {/* CLIMA DA VISITA — só o que importa agora (some na visita feita/passada).
            Visita externa com chuva forte: tocar abre "Remarcar e avisar". */}
        {fase !== 'feita' ? (
          <ClimaDaVisita visita={a} cliente={cliente} clientes={clientes} aoRemarcado={aoRemarcado} style={styles.visitaClima} />
        ) : null}
      </OlliPressable>

      {(fase === 'agora' || fase === 'sem_baixa') && (
        <View style={styles.acoesRow}>
          <AcaoNo
            variante="principal"
            icone="check"
            rotulo={fase === 'agora' ? 'Concluí' : 'Dar baixa'}
            accessibilityLabel={`Marcar a visita de ${a.clienteNome} como concluída`}
            carregando={baixando}
            onPress={() => onConcluir(a)}
          />
          {fase === 'agora' && temEndereco ? (
            <AcaoNo
              icone="navigation-variant"
              rotulo="Rota"
              accessibilityLabel={`Traçar rota até ${a.endereco}`}
              onPress={() => { void abrirRotaGoogleMaps(a.endereco!); }}
            />
          ) : null}
          {fase === 'sem_baixa' ? (
            <AcaoNo
              icone="calendar-edit"
              rotulo="Remarcar ou cancelar"
              accessibilityLabel={`Remarcar ou cancelar a visita de ${a.clienteNome} na agenda`}
              onPress={() => onAbrir(a)}
            />
          ) : null}
        </View>
      )}

      {fase === 'proxima' && (temEndereco || a.clienteId) ? (
        <View style={styles.acoesRow}>
          {temEndereco ? (
            <AcaoNo
              icone="navigation-variant"
              rotulo="Traçar rota"
              accessibilityLabel={`Traçar rota até ${a.endereco}`}
              onPress={() => { void abrirRotaGoogleMaps(a.endereco!); }}
            />
          ) : null}
          {a.clienteId ? (
            <AcaoNo
              variante="whatsapp"
              icone="whatsapp"
              rotulo="Estou a caminho"
              accessibilityLabel={`Avisar ${a.clienteNome} no WhatsApp que você está a caminho`}
              carregando={avisando}
              onPress={() => onEstouACaminho(a)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

export default function HojeScreen() {
  const nav = useNavigation<Nav>();
  // D-2267: concluir/reabrir visita é edição de agenda (Pro, com carência do Grátis). Ver o dia segue liberado.
  const cadeadoAgenda = useCadeado('agenda');
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { temAcesso } = usePlano();
  const relatorioLiberado = temAcesso('relatorio_dia');
  // QUEM VÊ O QUÊ — mesma regra da Agenda (`resolverEscopoAgenda`): o técnico vê
  // só as visitas DELE; gestão e conta pessoal veem a equipe inteira. Enquanto o
  // papel não é conhecido, a linha do tempo não aparece (nem vazia, nem a da
  // equipe); se a leitura falhar, a tela diz isso e deixa tentar de novo.
  const { pode, carregando: papelCarregando } = usePermissao();
  const tipoConta = useTipoConta();
  const [usuario, setUsuario] = useState<EntradaEscopo['usuario']>({ status: 'carregando' });
  const lerUsuario = useCallback(() => {
    setUsuario({ status: 'carregando' });
    getCurrentUser()
      .then(u => setUsuario({ status: 'ok', id: u?.id ?? null }))
      .catch(() => setUsuario({ status: 'ok', id: null }));
  }, []);
  useEffect(() => { lerUsuario(); }, [lerUsuario]);
  const escopo = useMemo(() => resolverEscopoAgenda({
    papelResolvido: tipoConta.resolvido,
    papelCarregando: tipoConta.carregando,
    podeVerEquipe: pode('ver_agenda_equipe'),
    usuario,
  }), [tipoConta.resolvido, tipoConta.carregando, pode, usuario]);
  const escopoPronto = escopo.status === 'equipe' || escopo.status === 'propria';
  // O total em R$ das propostas paradas é valor AGREGADO da empresa: o técnico
  // vê a contagem, não a soma (mesma matriz do resto do app).
  const podeValores = pode('ver_valores_agregados');
  // "Como foi seu dia?" abre o relatório com os totais da EMPRESA (orçamentos,
  // recibos, clientes novos), guardado por `ver_relatorios`. Técnico não tem essa
  // permissão: o card levaria a uma tela bloqueada, então nem aparece. Papel
  // ainda desconhecido também esconde (fail-closed, sem piscar o card de dono).
  const mostraRelatorioDia = !papelCarregando && pode('ver_relatorios');

  const [itens, setItens] = useState<OcorrenciaAgendamento[]>([]);
  // Cadastro dos clientes: o ponto (clima da visita) e o WhatsApp (remarcar por chuva).
  const [clientes, setClientes] = useState<Cliente[]>([]);
  // Visitas de DIAS ANTERIORES que terminaram e seguem "agendado" (ninguém deu
  // baixa). As de hoje já aparecem na própria linha do tempo como "Sem baixa".
  const [semBaixaAntigas, setSemBaixaAntigas] = useState<Agendamento[]>([]);
  const [orcamentosResumo, setOrcamentosResumo] = useState({ aguardandoAssinatura: 0, houveRecente: false });
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [novo, setNovo] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [carregando, setCarregando] = useState(true);
  // 3 estados explícitos (nunca colapsar erro em vazio): `carregandoErro` só
  // vira true quando a leitura de agenda/orçamentos falhou de verdade — sem
  // isso, uma falha de rede/leitura virava silenciosamente "Tudo em dia!".
  const [carregandoErro, setCarregandoErro] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [pulsoVisivel, setPulsoVisivel] = useState(false);
  // Relógio da linha do tempo: a fase de cada visita depende da hora. Atualiza
  // a cada minuto só com a tela em foco (não é animação; é o "agora" andando).
  const [agora, setAgora] = useState(() => new Date());
  // Muda a cada foco → o ponto "agora" pulsa de novo (N ondas e para).
  const [gatilhoPulso, setGatilhoPulso] = useState(0);
  // Id da visita com ação em andamento (baixa / aviso de saída): o botão mostra
  // "carregando" e não aceita toque duplo.
  const [baixando, setBaixando] = useState<string | null>(null);
  const [avisando, setAvisando] = useState<string | null>(null);

  // PROPOSTAS PARADAS — vem do radar (`orcamentosParaFollowUp`), não de uma
  // regra recalculada aqui. Esta tela tinha a SUA versão de "parado" (>= 5 dias
  // sobre `criadoEm`) enquanto o radar usa >= 3 dias sobre a última movimentação
  // (`atualizadoEm`): duas verdades para a mesma pergunta, e a daqui não sabia
  // nem o valor nem o telefone do cliente — por isso o lembrete só conseguia
  // navegar para a lista em vez de agir. Com o radar vêm o dinheiro, o tempo e a
  // mensagem pronta. 3 estados explícitos, os do radar.
  const [followUp, setFollowUp] = useState<OrcamentoParaFollowUp[]>([]);
  const [followUpCarregando, setFollowUpCarregando] = useState(true);
  const [followUpErro, setFollowUpErro] = useState(false);

  const loadFollowUp = useCallback(async () => {
    setFollowUpErro(false);
    try {
      setFollowUp(await orcamentosParaFollowUp());
    } catch {
      // erro de verdade (leitura falhou) — NUNCA vira lista vazia silenciosa,
      // que nesta tela viraria um "Tudo em dia!" mentiroso.
      setFollowUpErro(true);
    } finally {
      setFollowUpCarregando(false);
    }
  }, []);

  // Dia (local) da última leitura da agenda. Se o relógio passar da meia-noite
  // com a tela aberta, a linha do tempo é de ONTEM: o tique recarrega em vez de
  // pintar as visitas de ontem como "Sem baixa" sob o título de hoje.
  const diaCarregadoRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setCarregandoErro(false);
    try {
      const [ag, semBaixa, assinatura, datasCriacao, raw, cls] = await Promise.all([
        getAgendamentosDoDia(),
        getVisitasSemBaixa(),
        getOrcamentosAgregadoPorStatus(['aguardando_assinatura']),
        getOrcamentosDatasCriacao(),
        AsyncStorage.getItem(CHECKLIST_KEY),
        getClientes(),
      ]);
      setClientes(cls);
      const agoraLeitura = new Date();
      diaCarregadoRef.current = format(agoraLeitura, 'yyyy-MM-dd');
      setAgora(agoraLeitura);
      setItens(ag.filter(a => a.status !== 'cancelado').sort((a, b) => a.inicio.localeCompare(b.inicio)));
      const inicioDeHoje = limitesDoDiaLocal(agoraLeitura).inicio.getTime();
      setSemBaixaAntigas(semBaixa.filter(a => new Date(a.inicio).getTime() < inicioDeHoje));
      // A tela só precisa destes dois sinais; não carregue o blob inteiro de
      // orçamentos (itens, fotos, assinaturas e formas de pagamento) para
      // calcular um contador e um recorte de sete dias.
      setOrcamentosResumo({
        aguardandoAssinatura: assinatura.contagem,
        houveRecente: datasCriacao.some(criadoEm => diasAtras(criadoEm) < 7),
      });
      if (raw) {
        try {
          const parsed: ChecklistItem[] = JSON.parse(raw);
          // só mantém os itens de hoje (limpeza diária leve)
          setChecklist(parsed.filter(i => i.data === todayKey()));
        } catch { setChecklist([]); }
      } else {
        setChecklist([]);
      }
    } catch {
      // erro de verdade (leitura falhou) — NUNCA colapsa em "nada pra hoje".
      setCarregandoErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    loadFollowUp();
    setGatilhoPulso(n => n + 1);
    const relogio = setInterval(() => {
      const n = new Date();
      setAgora(n);
      if (diaCarregadoRef.current && diaCarregadoRef.current !== format(n, 'yyyy-MM-dd')) void load();
    }, TICK_RELOGIO_MS);
    return () => clearInterval(relogio);
  }, [load, loadFollowUp]));

  // Recarrega quando um sync com a nuvem terminar (ex.: login recém-feito
  // trazendo agendamentos/orçamentos que ainda não existiam localmente).
  useEffect(
    () => onSyncAplicado(() => { setSincronizando(true); load(); loadFollowUp(); }),
    [load, loadFollowUp],
  );

  const refresh = async () => {
    setRefreshing(true);
    // Puxar para atualizar também relê o papel e o usuário: sem isto, quem caiu
    // no aviso "não deu para confirmar seu acesso" ficaria preso nele.
    if (escopo.status === 'erro') { void tipoConta.recarregar(); lerUsuario(); }
    try {
      await Promise.all([load(), loadFollowUp()]);
    } finally {
      // finally: o pull-to-refresh nunca fica preso, mesmo se algo além das duas
      // chamadas (que já se protegem com try/catch) rejeitar.
      setRefreshing(false);
    }
  };

  const persist = useCallback(async (list: ChecklistItem[]) => {
    setChecklist(list);
    await AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(list));
    // Espelha o checklist na nuvem (best-effort, fire-and-forget). Grava o carimbo
    // local e sobe o valor; offline/deslogado fica p/ o próximo login (syncOnLogin).
    // NUNCA bloqueia nem quebra o salvamento local (o await acima é o que importa).
    void pushExtraChave('checklist.hoje').catch(() => {});
  }, []);

  // Respeita prefers-reduced-motion na animação de layout do checklist.
  const reduzirMovimento = useReducedMotion();

  const addItem = useCallback(() => {
    const t = novo.trim();
    if (!t) return;
    vibrar('selecao');
    animarLayoutChecklist(reduzirMovimento);
    persist([...checklist, { id: generateId(), texto: t, feito: false, data: todayKey() }]);
    setNovo('');
  }, [novo, checklist, persist, reduzirMovimento]);

  const toggle = useCallback((id: string) => {
    const alvo = checklist.find(i => i.id === id);
    // Concluir = "sucesso" (impacto leve); reabrir = seleção neutra.
    if (alvo && !alvo.feito) vibrar('leve');
    else vibrar('selecao');
    persist(checklist.map(i => i.id === id ? { ...i, feito: !i.feito } : i));
  }, [checklist, persist]);

  const remove = useCallback((id: string) => {
    vibrar('selecao');
    animarLayoutChecklist(reduzirMovimento);
    persist(checklist.filter(i => i.id !== id));
  }, [checklist, persist, reduzirMovimento]);

  // ── LINHA DO TEMPO ──
  // Só o que este usuário pode ver (técnico = as dele). Fora de equipe/própria, nada.
  const itensVisiveis = useMemo(() => aplicarEscopo(itens, escopo), [itens, escopo]);
  const semBaixaVisiveis = useMemo(() => aplicarEscopo(semBaixaAntigas, escopo), [semBaixaAntigas, escopo]);
  const linha = useMemo(() => montarLinhaDoTempo(itensVisiveis, agora), [itensVisiveis, agora]);
  const resumo = useMemo(() => resumoDoDia(linha), [linha]);
  // Até onde o dia já "andou": o trilho é pintado até a última visita que já
  // começou (feita, em andamento ou que passou sem baixa).
  const ultimoPercorrido = useMemo(() => {
    let idx = -1;
    linha.forEach((i, k) => { if (i.fase !== 'proxima' && i.fase !== 'depois') idx = k; });
    return idx;
  }, [linha]);

  const clientePorId = useMemo(() => new Map(clientes.map(c => [c.id, c] as const)), [clientes]);

  const abrirVisita = useCallback((a: OcorrenciaAgendamento) => {
    (nav as any).navigate('Tabs', { screen: 'Agenda', params: { abrirAgendamentoId: a.id } });
  }, [nav]);

  const mudarStatus = useCallback(async (a: OcorrenciaAgendamento, status: 'concluido' | 'agendado') => {
    if (cadeadoAgenda.trancado) { cadeadoAgenda.abrirGate(); return; }
    setBaixando(a.id);
    try {
      await mudarStatusVisitaDoDia(a, status);
      if (status === 'concluido') {
        vibrar('sucesso');
        toast.sucesso(`Visita de ${a.clienteNome} concluída.`, {
          acao: { rotulo: 'Desfazer', aoTocar: () => { void mudarStatusRef.current(a, 'agendado'); } },
        });
      } else {
        toast.info(`A visita de ${a.clienteNome} voltou para agendada.`);
      }
      await load();
    } catch (e) {
      vibrar('erro');
      const motivo = e instanceof Error && e.message ? ` ${e.message}` : '';
      toast.erro(`Não deu para atualizar a visita.${motivo} Tente de novo.`);
    } finally {
      setBaixando(null);
    }
  }, [load, cadeadoAgenda]);
  // O "Desfazer" do toast chama a versão MAIS NOVA da função (o toast vive mais
  // que o render em que nasceu).
  const mudarStatusRef = useRef(mudarStatus);
  useEffect(() => { mudarStatusRef.current = mudarStatus; }, [mudarStatus]);

  const concluirVisita = useCallback((a: OcorrenciaAgendamento) => {
    if (baixando) return;
    void mudarStatus(a, 'concluido');
  }, [baixando, mudarStatus]);

  const estouACaminho = useCallback(async (a: OcorrenciaAgendamento) => {
    if (!a.clienteId || avisando) return;
    setAvisando(a.id);
    try {
      const cliente = await getCliente(a.clienteId);
      const telefone = cliente?.telefone?.trim();
      if (!telefone) {
        toast.info(`Cadastre o WhatsApp de ${a.clienteNome} em Clientes para avisar por aqui.`);
        return;
      }
      // Sem previsão de chegada aqui: a mensagem sai sem horário (nada inventado).
      await abrirWhatsApp(telefone, mensagemEstouACaminho(a.clienteNome, null));
      registrarEventoDica('primeiro_a_caminho');
    } catch {
      toast.erro('Não deu para abrir o WhatsApp agora. Tente de novo.');
    } finally {
      setAvisando(null);
    }
  }, [avisando]);

  // ── lembretes REAIS (sem inventar) ──
  // `followUp` é a lista do radar; o dinheiro e o tempo abaixo são SOMA e MÁXIMO
  // do que ele já devolve (valorTotal e diasParado) — nenhuma estimativa nova.
  const valorFollowUp = followUp.reduce((s, i) => s + i.orcamento.valorTotal, 0);
  const maisAntigoFollowUp = followUp.reduce((m, i) => Math.max(m, i.diasParado), 0);
  const aguardandoAssinatura = orcamentosResumo.aguardandoAssinatura;
  // O de MAIOR prioridade (valor × recência, ver utils/prioridadeFollowUp) — é
  // nele que o botão de um toque age. Antes era o mais parado de todos (a lista
  // vem por diasParado desc), ou seja, o lead mais frio.
  const maisUrgente = maisPrioritarioFollowUp(followUp);

  const feitos = checklist.filter(i => i.feito).length;
  const temLembrete = followUpErro || followUp.length > 0 || aguardandoAssinatura > 0 || semBaixaVisiveis.length > 0;
  // "Nada pendente" é uma AFIRMAÇÃO: só pode aparecer quando as leituras
  // responderam de verdade. Com o radar em erro, `followUp` é [] — e sem este
  // `!followUpErro` a falha viraria a mensagem mais cara possível: dizer que não
  // há nada a cobrar quando não fazemos ideia.
  // O escopo entra porque as visitas sem baixa são filtradas por ele: sem papel
  // conhecido a lista fica vazia, e isso não pode virar "nada parado".
  const lembretesConferidos = !carregando && !carregandoErro && !followUpCarregando && !followUpErro && escopoPronto;

  // Sinal SIMPLES de "semana com movimento" (sem consulta nova): agenda de hoje,
  // checklist com item concluído hoje, ou algum orçamento criado nos últimos 7
  // dias. O Pulso da semana só aparece quando há sinal de uso real — nunca numa
  // semana parada, onde a pergunta soaria deslocada.
  const houveMovimentoNaSemana =
    itensVisiveis.length > 0 || feitos > 0 || orcamentosResumo.houveRecente;

  // Gate do Pulso da semana: checa 1x por sessão (quando o carregamento inicial
  // termina) se já passaram 14 dias desde a última exibição — grava o carimbo NO
  // MOMENTO em que decide mostrar (não só quando o usuário responde), senão quem
  // sempre dispensa sem tocar veria o card toda vez que abrisse o app. Erro na
  // leitura/escrita do AsyncStorage nunca deve travar a tela: fica em silêncio.
  useEffect(() => {
    if (carregando || carregandoErro || !houveMovimentoNaSemana) return;
    let cancelado = false;
    (async () => {
      try {
        const ultimo = await AsyncStorage.getItem(PULSO_ULTIMO_KEY);
        if (ultimo && diasAtras(ultimo) < 14) return;
        if (cancelado) return;
        setPulsoVisivel(true);
        track(Eventos.pulsoMostrado, {});
        await AsyncStorage.setItem(PULSO_ULTIMO_KEY, new Date().toISOString());
      } catch {
        // pulso é 100% opcional — nunca deve travar a tela por causa disso
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, carregandoErro, houveMovimentoNaSemana]);

  /**
   * Abre o WhatsApp do cliente com a mensagem de follow-up pronta. O telefone
   * vem denormalizado no próprio orçamento (funciona mesmo se o cadastro do
   * cliente tiver sido excluído depois do envio) e cai no cadastro ativo como
   * segunda opção — mesmo contrato da HomeScreen.
   */
  const chamarFollowUp = useCallback(async (item: OrcamentoParaFollowUp) => {
    const telefone = item.orcamento.clienteTelefone || item.cliente?.telefone;
    if (!telefone?.trim()) {
      toast.info(`Cadastre o WhatsApp de ${item.orcamento.clienteNome} em Clientes para dar retorno por aqui.`);
      return;
    }
    vibrar('selecao');
    try {
      await abrirWhatsApp(telefone, mensagemFollowUp(item));
    } catch {
      toast.erro('Não deu para abrir o WhatsApp agora. Tente de novo.');
    }
  }, []);

  const fecharPulso = useCallback(() => {
    vibrar('selecao');
    track(Eventos.pulsoDispensado, {});
    setPulsoVisivel(false);
  }, []);

  const irParaAgenda = useCallback(() => {
    (nav as any).navigate('Tabs', { screen: 'Agenda' });
  }, [nav]);

  // Índice de entrada escalonada: cada nó entra um passo depois do anterior.
  let ordem = 0;

  return (
    <View style={styles.container}>
      {sincronizando && <SincronizandoPill onDone={() => setSincronizando(false)} top={insets.top + 8} />}
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={cores.accentLight} colors={[cores.accentLight]} />}
      >
        {/* CABEÇALHO */}
        <Aparecer indice={ordem++}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>MEU DIA</Text>
              <Text style={styles.title}>{saudacao()}</Text>
              <Text style={styles.date}>{capitalizeFirst(format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR }))}</Text>
              {/* Resumo do dia — só com a agenda lida de verdade. */}
              {!carregando && !carregandoErro && escopoPronto && resumo.total > 0 ? (
                <Text style={styles.resumoDia}>
                  {resumo.total === 1 ? '1 visita hoje' : `${resumo.total} visitas hoje`}
                  {` · ${resumo.feitas} ${resumo.feitas === 1 ? 'feita' : 'feitas'}`}
                  {resumo.semBaixa > 0 ? ` · ${resumo.semBaixa} sem baixa` : ''}
                </Text>
              ) : null}
            </View>
            <View style={styles.headAcoes}>
              <BotaoComoFunciona tela="hoje" />
              <OlliMascot size={40} onDark />
            </View>
          </View>
          {/* Dica do momento (roteiro I5): "Estou a caminho" e chuva na visita. */}
          <DicaDoRoteiro local="hoje" style={{ marginHorizontal: Spacing.base }} />
        </Aparecer>

        {/* ── LINHA DO TEMPO DO DIA ── */}

        {/* 1. LEMBRETES DA OLLI (reais) — dinheiro primeiro, ação junto.
            O bloco também aparece quando o radar FALHOU: antes ele simplesmente
            sumia, e sumir é a mesma mentira de mostrar zero — o prestador lê a
            ausência como "não tenho nada parado". */}
        <Aparecer indice={ordem++}>
          <NoLinhaDoTempo marcador={{ tipo: 'secao', icone: 'bell-outline' }} primeiro percorrido={ultimoPercorrido >= 0}>
            <Text style={styles.noTitulo}>Lembretes da OLLI</Text>
            {temLembrete ? (
              <View style={styles.lembretes}>
                {followUpErro && (
                  <View style={styles.lembreteErro}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={18} color={cores.warning} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lembreteText}>Não deu para verificar as propostas paradas.</Text>
                      <Text style={styles.lembreteSub}>Não quer dizer que está tudo em dia — só que não conseguimos conferir agora.</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.lembreteRetry}
                      onPress={() => { vibrar('selecao'); loadFollowUp(); }}
                      accessibilityRole="button"
                      accessibilityLabel="Tentar verificar as propostas paradas de novo"
                    >
                      <Text style={styles.lembreteRetryTexto}>Tentar de novo</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {semBaixaVisiveis.length > 0 && (
                  <OlliPressable
                    style={styles.lembreteRow}
                    onPress={() => abrirVisita(semBaixaVisiveis[0])}
                    haptic="selection"
                    accessibilityLabel="Abrir a visita sem baixa mais recente na agenda"
                  >
                    <View style={[styles.lembreteIcon, { backgroundColor: cores.warningLight }]}>
                      <MaterialCommunityIcons name="calendar-alert" size={18} color={cores.warning} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lembreteText}>
                        {semBaixaVisiveis.length === 1
                          ? '1 visita de outro dia sem baixa'
                          : `${semBaixaVisiveis.length} visitas de outros dias sem baixa`}
                      </Text>
                      <Text style={styles.lembreteSub}>Ninguém concluiu nem cancelou. Toque para abrir a mais recente.</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
                  </OlliPressable>
                )}

                {followUp.length > 0 && (
                  <>
                    <OlliPressable
                      style={styles.lembreteRow}
                      onPress={() => nav.navigate('Orcamentos')}
                      haptic="selection"
                      accessibilityLabel="Ver propostas paradas"
                    >
                      <View style={[styles.lembreteIcon, { backgroundColor: cores.warningLight }]}>
                        <MaterialCommunityIcons name="clock-alert-outline" size={18} color={cores.warning} />
                      </View>
                      <View style={{ flex: 1 }}>
                        {/* O dinheiro na frente: "R$ 2.400 esperando resposta" diz
                            muito mais que "3 orçamentos parados". */}
                        <Text style={styles.lembreteText}>
                          {podeValores
                            ? `${formatCurrency(valorFollowUp)} esperando resposta`
                            : followUp.length === 1 ? '1 proposta esperando resposta' : `${followUp.length} propostas esperando resposta`}
                        </Text>
                        <Text style={styles.lembreteSub}>
                          {followUp.length === 1
                            ? `1 proposta parada há ${maisAntigoFollowUp} ${maisAntigoFollowUp === 1 ? 'dia' : 'dias'}`
                            : `${followUp.length} propostas · a mais antiga há ${maisAntigoFollowUp} dias`}
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
                    </OlliPressable>

                    {/* Ação em UM toque, na proposta de maior prioridade: abre o
                        WhatsApp com a mensagem de follow-up já montada (a mesma de
                        `mensagemFollowUp`, derivada do próprio orçamento). Sem isto
                        o lembrete só sabia mandar o prestador procurar na lista. */}
                    {maisUrgente && (
                      <OlliPressable
                        style={styles.lembreteAcao}
                        onPress={() => chamarFollowUp(maisUrgente)}
                        haptic={false}
                        accessibilityLabel={`Chamar ${maisUrgente.orcamento.clienteNome} no WhatsApp sobre a proposta parada`}
                      >
                        <MaterialCommunityIcons
                          name="whatsapp"
                          size={16}
                          color="#0A1626" // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)
                        />
                        <Text style={styles.lembreteAcaoTexto} numberOfLines={1}>
                          Chamar {maisUrgente.orcamento.clienteNome} no WhatsApp
                        </Text>
                      </OlliPressable>
                    )}
                  </>
                )}

                {aguardandoAssinatura > 0 && (
                  <OlliPressable
                    style={styles.lembreteRow}
                    onPress={() => nav.navigate('Orcamentos')}
                    haptic="selection"
                    accessibilityLabel="Ver orçamentos aguardando assinatura"
                  >
                    <View style={[styles.lembreteIcon, { backgroundColor: comAlfa(cores.accentLight, 0.14) }]}>
                      <MaterialCommunityIcons name="draw-pen" size={18} color={cores.accentLight} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lembreteText}>
                        {aguardandoAssinatura} aguardando assinatura
                      </Text>
                      <Text style={styles.lembreteSub}>Toque para acompanhar.</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
                  </OlliPressable>
                )}
              </View>
            ) : lembretesConferidos ? (
              <Text style={styles.noSub}>Nada parado por agora: nenhuma proposta esperando resposta nem assinatura pendente.</Text>
            ) : carregando || followUpCarregando || escopo.status === 'carregando' ? (
              <Skeleton width="80%" height={13} style={{ marginTop: 6 }} />
            ) : (
              // Leitura de orçamentos/agenda falhou: não afirmamos nada.
              <Text style={styles.noSub}>Não deu para conferir os lembretes agora. Puxe a tela para baixo para tentar de novo.</Text>
            )}
          </NoLinhaDoTempo>
        </Aparecer>

        {/* 2. VISITAS DO DIA */}
        <Aparecer indice={ordem++}>
          <NoLinhaDoTempo
            marcador={{ tipo: 'secao', icone: 'map-marker-path' }}
            percorridoAcima={ultimoPercorrido >= 0}
            percorrido={ultimoPercorrido >= 0}
          >
            <View style={styles.noTituloRow}>
              <Text style={styles.noTitulo}>Visitas de hoje</Text>
              <TouchableOpacity
                onPress={() => { vibrar('selecao'); irParaAgenda(); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Abrir a agenda"
              >
                <Text style={styles.seeAll}>Abrir agenda</Text>
              </TouchableOpacity>
            </View>
            {carregando || escopo.status === 'carregando' ? (
              <View style={{ gap: 10, marginTop: 8 }}>
                {[0, 1].map(i => (
                  // Skeleton no formato REAL do card da visita (hora + chip, título, cliente).
                  <View key={i} style={styles.visitaCard}>
                    <Skeleton width={90} height={14} radius={6} />
                    <Skeleton width="70%" height={14} style={{ marginTop: 8 }} />
                    <Skeleton width="45%" height={12} style={{ marginTop: 6 }} />
                  </View>
                ))}
              </View>
            ) : escopo.status === 'erro' ? (
              // Não sei o papel: nem "nada agendado" (o técnico acharia que não tem
              // visita) nem a agenda da equipe inteira (não sei se ele pode ver).
              <View style={styles.estadoCard}>
                <MaterialCommunityIcons name="account-lock-outline" size={20} color={cores.warning} />
                <Text style={styles.estadoTitulo}>Não deu para confirmar seu acesso</Text>
                <Text style={styles.estadoSub}>Sem saber se você é da gestão ou técnico, o Hoje poderia mostrar visitas erradas. Verifique a conexão e tente de novo.</Text>
                <View style={styles.acoesRow}>
                  <AcaoNo
                    variante="principal"
                    icone="refresh"
                    rotulo="Tentar de novo"
                    onPress={() => { void tipoConta.recarregar(); lerUsuario(); }}
                  />
                </View>
              </View>
            ) : carregandoErro ? (
              <View style={styles.estadoCard}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
                <Text style={styles.estadoTitulo}>Não deu para carregar</Text>
                <Text style={styles.estadoSub}>Não conseguimos buscar sua agenda de hoje. Verifique a conexão e tente de novo.</Text>
                <View style={styles.acoesRow}>
                  <AcaoNo variante="principal" icone="refresh" rotulo="Tentar de novo" onPress={load} />
                </View>
              </View>
            ) : linha.length === 0 ? (
              <View style={styles.estadoCard}>
                <MaterialCommunityIcons name="calendar-check-outline" size={20} color={cores.accentLight} />
                <Text style={styles.estadoTitulo}>Nada agendado para hoje</Text>
                <Text style={styles.estadoSub}>Aproveite para organizar a semana ou cadastrar novos orçamentos.</Text>
                <View style={styles.acoesRow}>
                  <AcaoNo icone="calendar-plus" rotulo="Abrir agenda" onPress={irParaAgenda} />
                </View>
              </View>
            ) : null}
          </NoLinhaDoTempo>
        </Aparecer>

        {!carregando && !carregandoErro && escopoPronto && linha.map((item, k) => (
          <Aparecer key={item.visita.id} indice={ordem++}>
            <NoLinhaDoTempo
              marcador={{ tipo: 'visita', fase: item.fase, pulso: gatilhoPulso }}
              percorridoAcima={k <= ultimoPercorrido}
              percorrido={k < ultimoPercorrido}
            >
              <VisitaNaLinha
                item={item}
                agora={agora}
                baixando={baixando === item.visita.id}
                avisando={avisando === item.visita.id}
                onAbrir={abrirVisita}
                onConcluir={concluirVisita}
                onEstouACaminho={estouACaminho}
                cliente={item.visita.clienteId ? clientePorId.get(item.visita.clienteId) ?? null : null}
                clientes={clientes}
                aoRemarcado={load}
              />
            </NoLinhaDoTempo>
          </Aparecer>
        ))}

        {/* CONFIRMAR VISITAS DE AMANHÃ (Onda I3) — some sem visita amanhã. */}
        {!carregando && escopoPronto ? (
          <CartaoVespera escopo={escopo} clientes={clientes} indice={ordem++} />
        ) : null}

        {/* GARANTIAS PARA CUIDAR (Onda I3) — só para quem vê a empresa inteira. */}
        <CartaoGarantias indice={ordem++} visivel={escopo.status === 'equipe'} />
        {/* MALA DA VÉSPERA (Onda I4) — a partir das 19h, o que levar amanhã. */}
        <MalaVesperaCard
          agora={agora}
          escopo={escopo}
          envolver={(conteudo) => (
            <Aparecer indice={ordem}>
              <NoLinhaDoTempo marcador={{ tipo: 'secao', icone: 'bag-personal-outline' }}>
                <View style={styles.noTituloRow}>
                  <Text style={styles.noTitulo}>Mala de amanhã</Text>
                </View>
                {conteudo}
              </NoLinhaDoTempo>
            </Aparecer>
          )}
        />

        {/* 3. CHECKLIST DO DIA */}
        <Aparecer indice={ordem++}>
          {/* Sem o "Fim do dia" (técnico), o checklist fecha a linha do tempo. */}
          <NoLinhaDoTempo marcador={{ tipo: 'secao', icone: 'checkbox-marked-outline' }} ultimo={!mostraRelatorioDia}>
            <View style={styles.noTituloRow}>
              <Text style={styles.noTitulo}>Checklist do dia</Text>
              {checklist.length > 0 && <Text style={styles.checkCount}>{feitos}/{checklist.length}</Text>}
            </View>

            <View style={styles.checklistCard}>
              <View style={styles.addRow}>
                <MaterialCommunityIcons name="plus-circle-outline" size={20} color={cores.accentLight} />
                <TextInput
                  style={styles.addInput}
                  value={novo}
                  onChangeText={setNovo}
                  onSubmitEditing={addItem}
                  returnKeyType="done"
                  placeholder="Adicionar tarefa…"
                  placeholderTextColor={cores.onSurfaceMuted}
                />
                {novo.trim() ? (
                  <OlliPressable onPress={addItem} haptic={false} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Adicionar tarefa">
                    <MaterialCommunityIcons name="arrow-up-circle" size={24} color={cores.accentLight} />
                  </OlliPressable>
                ) : null}
              </View>

              {checklist.length === 0 ? (
                <View style={styles.checklistEmptyWrap}>
                  <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={26} color={cores.onSurfaceMuted} />
                  <Text style={styles.checklistEmpty}>Sem tarefas por aqui. Anote o que precisa fazer hoje.</Text>
                </View>
              ) : (
                checklist.map(item => (
                  <CheckRow key={item.id} item={item} onToggle={toggle} onRemove={remove} />
                ))
              )}

              {/* Nota discreta: checklist agora sincroniza com a nuvem (extras_sync) */}
              <View style={styles.checklistNota}>
                <MaterialCommunityIcons name="cloud-check-outline" size={12} color={cores.onSurfaceMuted} />
                <Text style={styles.checklistNotaText}>Sua lista fica salva na nuvem e acompanha você em qualquer aparelho.</Text>
              </View>
            </View>
          </NoLinhaDoTempo>
        </Aparecer>

        {/* 4. FIM DO DIA — "Como foi seu dia?" (relatório falado é Pro; KPIs seguem grátis dentro da tela).
            Só para quem vê relatórios (ver `mostraRelatorioDia`). */}
        {mostraRelatorioDia && (
          <Aparecer indice={ordem++}>
            <NoLinhaDoTempo marcador={{ tipo: 'secao', icone: 'weather-night' }} ultimo>
              <OlliPressable
                style={styles.relatorioCard}
                haptic="light"
                accessibilityLabel="Como foi seu dia? Abrir relatório do dia"
                onPress={() => {
                  if (!relatorioLiberado) track(Eventos.gateVisto, { recurso: 'relatorio_dia', plano: 'pro', origem: 'hoje_card' });
                  nav.navigate('RelatorioDia');
                }}
              >
                <View style={styles.relatorioIcon}>
                  <MaterialCommunityIcons name="volume-high" size={20} color={cores.accentLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.relatorioTitle}>Como foi seu dia?</Text>
                  <Text style={styles.relatorioSub}>Ver e ouvir o relatório do dia</Text>
                </View>
                {relatorioLiberado ? (
                  <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
                ) : (
                  <View style={styles.relatorioProBadge}>
                    <MaterialCommunityIcons name="lock-outline" size={11} color={cores.plan} />
                    <Text style={styles.relatorioProBadgeText}>Pro</Text>
                  </View>
                )}
              </OlliPressable>
            </NoLinhaDoTempo>
          </Aparecer>
        )}

        {/* PULSO DA SEMANA — micro-feedback discreto, pulável, no máximo 1x/14 dias */}
        {pulsoVisivel && (
          <Aparecer indice={1}>
            <PulsoSemana onFechar={fecharPulso} />
          </Aparecer>
        )}
      </ScrollView>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  syncPill: {
    position: 'absolute', alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    // Pill sempre escura de propósito (como um toast) — sem chave que represente
    // "fundo escuro fixo" nos dois modos (ver rule 7 da migração).
    backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: c.strokeGlow,
    borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6,
    ...sombrasDe(c).sm,
  },
  syncPillText: { fontSize: 13, fontWeight: '700', color: c.accent }, // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 2.88:1 (7.25:1)

  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, marginBottom: Spacing.lg },
  headAcoes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kicker: { fontSize: 13, fontWeight: '800', letterSpacing: 0, color: c.accentLight },
  title: { fontSize: 24, fontWeight: '800', color: c.onBackground, marginTop: 3 },
  date: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },
  resumoDia: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant, marginTop: 6 },

  // Cabeçalho de cada nó da linha do tempo (alinha com o centro do marcador).
  noTituloRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, marginTop: -2 },
  noTitulo: { fontSize: 15, fontWeight: '800', color: c.onBackground, lineHeight: 44 },
  noSub: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 18 },

  lembretes: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, ...sombrasDe(c).sm },
  lembreteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  lembreteIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  lembreteText: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  lembreteSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 1, lineHeight: 16 },
  lembreteErro: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  // 44px de altura mínima: o dedo do prestador está em obra, não numa mesa.
  lembreteRetry: {
    justifyContent: 'center', minHeight: 44, paddingHorizontal: 12,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surfaceVariant,
  },
  lembreteRetryTexto: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  // Ação de um toque: mesmo verde/contraste do botão de WhatsApp do resto do app.
  lembreteAcao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: c.whatsapp, borderRadius: BorderRadius.full,
    minHeight: 44, paddingHorizontal: 14, marginTop: 4, marginBottom: 4,
  },
  lembreteAcaoTexto: { flexShrink: 1, fontSize: 13, fontWeight: '800', color: '#0A1626' }, // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)

  seeAll: { fontSize: 12.5, color: c.accentLight, fontWeight: '700' },
  checkCount: { fontSize: 13, color: c.onSurfaceVariant, fontWeight: '700' },

  estadoCard: {
    backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline,
    padding: Spacing.md, gap: 4, ...sombrasDe(c).sm,
  },
  estadoTitulo: { fontSize: 14, fontWeight: '800', color: c.onSurface, marginTop: 2 },
  estadoSub: { fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 17 },

  visitaCard: {
    backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline,
    padding: Spacing.md, ...sombrasDe(c).sm,
  },
  // AGORA: borda e véu no acento — é o card que o olho tem de achar primeiro.
  visitaCardAgora: { borderColor: comAlfa(c.accentLight, 0.6), backgroundColor: c.surfaceElevated },
  visitaCardSemBaixa: { borderColor: comAlfa(c.warning, 0.5) },
  // FEITA: recua visualmente (o dia já passou por ela), sem sumir.
  visitaCardFeita: { opacity: 0.72 },
  visitaTopo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  visitaHora: { fontSize: 16, fontWeight: '800', color: c.onSurface },
  visitaDetalhe: { flexShrink: 1, fontSize: 12, fontWeight: '700', color: c.onSurfaceVariant },
  faseChip: { borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  faseChipTexto: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  visitaTitulo: { fontSize: 15, fontWeight: '700', color: c.onSurface, marginTop: 6 },
  visitaCliente: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 1 },
  textoFeito: { color: c.onSurfaceMuted },
  tipoChip: { alignSelf: 'flex-start', borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 2, marginTop: 8 },
  tipoChipText: { fontSize: 13, fontWeight: '800' },
  visitaClima: { marginTop: 10 },
  acoesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },

  checklistCard: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.md, ...sombrasDe(c).sm },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.outline },
  addInput: { flex: 1, fontSize: 14, color: c.onSurface, paddingVertical: 6 },
  checklistEmptyWrap: { alignItems: 'center', gap: 6, paddingVertical: 16 },
  checklistEmpty: { fontSize: 13, color: c.onSurfaceMuted, textAlign: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.outline },
  checkTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkText: { flex: 1, fontSize: 14, color: c.onSurface },
  checkTextDone: { textDecorationLine: 'line-through', color: c.onSurfaceMuted },
  checklistNota: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.outline },
  checklistNotaText: { flex: 1, fontSize: 13, color: c.onSurfaceMuted },

  pulsoCard: {
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline,
    marginHorizontal: Spacing.base, marginTop: Spacing.lg, padding: Spacing.md, ...sombrasDe(c).sm,
  },
  pulsoFechar: { position: 'absolute', top: 10, right: 10, zIndex: 1, padding: 4 },
  pulsoTitulo: { fontSize: 14, fontWeight: '800', color: c.onSurface, marginRight: 22 },
  pulsoEmojisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  pulsoEmojiBtn: { alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, backgroundColor: c.surfaceVariant },
  pulsoEmoji: { fontSize: 22 },
  pulsoObrigado: { fontSize: 14, fontWeight: '700', color: c.onSurface, textAlign: 'center', paddingVertical: 4 },
  pulsoTextoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  pulsoInput: { flex: 1, fontSize: 13.5, color: c.onSurface, paddingVertical: 6, maxHeight: 80 },

  relatorioCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline,
    padding: Spacing.md, ...sombrasDe(c).sm,
  },
  relatorioIcon: {
    width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.accentContainer,
  },
  relatorioTitle: { fontSize: 14, fontWeight: '800', color: c.onSurface },
  relatorioSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 1 },
  // Roxo fixo (base #7C3AED, mesma família de `c.plan`, mas sem "container" no
  // tema): decorativo, sem chave semântica exata (ver rule 7).
  relatorioProBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(124,58,237,0.14)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.36)', borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  relatorioProBadgeText: { fontSize: 13, fontWeight: '800', color: c.plan },
});
