/**
 * INÍCIO = PAINEL DA RUA (item 2.6 da Onda 2).
 *
 * Feito para o prestador que está NA RUA, com o celular numa mão. Ordem fixa,
 * do mais urgente para o resto:
 *   1. cumprimento + clima do dia (MET Norway, com o crédito exigido);
 *   2. AGORA / PRÓXIMA PARADA: hora, cliente, endereço, "Traçar rota" e
 *      "Estou a caminho" (WhatsApp ao cliente, sem precisar de GPS);
 *   3. ROTA DE HOJE: as visitas do dia em sequência, com "Rota no Maps";
 *      (pedidos de orçamento pela etiqueta QR entram aqui, só quando há algum novo);
 *   4. DINHEIRO: a receber e esperando resposta (o palco de sempre) + números do mês;
 *   5. ATALHOS DE 1 TOQUE: Orçar, Recibo, Agendar, Clientes;
 *   6. o resto (clientes para lembrar, diagnóstico do ofício, orçamentos recentes).
 *
 * Avisos que só aparecem quando têm o que dizer (encaixes de 02/10/2026): o do
 * crédito de troca, o convite "Trazer meus dados do app antigo" no primeiro acesso
 * e o "Disponível no Pro" no lugar da hora de sair (Grátis sem registro).
 *
 * Sem duplicidade: "Abrir agenda" e "Diagnóstico" apareciam 3 vezes cada, e o
 * menu de atalhos repetia as ações rápidas. Cada ação tem UM lugar.
 *
 * Movimento (Reanimated 4, UI thread): entrada escalonada com `Aparecer`,
 * números com `ContadorAnimado`, toque com `PressableAnimado`. Só transform e
 * opacity; "Reduzir movimento" respeitado em todos; nenhum loop fora do
 * esqueleto de carregamento (o mascote do topo não flutua aqui).
 *
 * Honestidade (P0): cada bloco tem os seus 3 estados — carregando, erro e
 * dado. "Não consegui ler" nunca vira "não tem".
 */
import { formatarNumeroExibicao } from '../utils/numeroDocumento';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Modal, Pressable } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { vibrar } from '../utils/haptico';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, sombrasDe, textoSobre, achatarVeu, sobreSecundario, ajustarParaContraste, corCategoria, comAlfa, type Cores } from '../theme';
import { DURACAO, useReduzirMovimento } from '../theme/motion';
import {
  getEmpresa, getClientes,
  getOrcamentosTotalAtivos, getOrcamentosAgregadoPorStatus, getOrcamentosAgregadoPorStatusNoPeriodo,
  getUltimosOrcamentos,
} from '../database/database';
import { getAgendamentosDoDia, getProximoAgendamento } from '../services/agenda';
import { abrirRotaDoDia, abrirRotaGoogleMaps } from '../services/rotas';
import { emAndamento, montarRotaDoDia, rotuloQuandoVisita, type ParadaDoDia } from '../utils/agendaDia';
import { enderecosDaRota } from '../utils/rotaDoDia';
import type { OcorrenciaAgendamento } from '../utils/contratoRecorrente';
import { onSyncAplicado } from '../services/cloudSync';
import { getEtaAgendamento, temDestinoEta, mensagemEstouACaminho, type ResultadoEta } from '../services/eta';
import { useClimaDoDia } from '../services/clima';
import { useReservaClima, type LeituraCadastro } from '../services/climaReserva';
import { clientesParaReconquistar, lembrarNoWhatsApp, adiarClienteRadar, ClienteParaReconquistar } from '../services/radarClientes';
import { orcamentosParaCobrar, cobrarNoWhatsApp as cobrarItemNoWhatsApp, OrcamentoParaCobrar } from '../services/radarCobranca';
import { orcamentosParaFollowUp, mensagemFollowUp, type OrcamentoParaFollowUp } from '../services/radarFollowUp';
import { LIMIAR_PROPOSTA_PARADA_DIAS } from '../services/radarDinheiro';
import { abrirWhatsApp } from '../utils/pdfGenerator';
import { formatCurrency } from '../utils/currency';
import { formatDate } from '../utils/date';
import { ordenarParaCobrar } from '../utils/cobrancaCliente';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Empresa, Orcamento, Agendamento, Cliente, TIPO_AGENDAMENTO_LABELS, STATUS_PROPOSTA_ENVIADA } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { EtaChip } from '../components/EtaChip';
import { AvisoSaidaCard } from '../components/AvisoSaidaCard';
import { lerAvisoSaida, type AvisoSaida } from '../services/avisoSaida';
import { reagendarAvisoSaidaDoDia } from '../services/ritualDiario';
import { DicaContextual } from '../components/DicaContextual';
import { BotaoComoFunciona } from '../components/ajuda/ComoFunciona';
import { DicaDoRoteiro } from '../components/ajuda/DicaDoRoteiro';
import { registrarEventoDica } from '../services/dicasRoteiroStore';
import { OlliMascot } from '../components/OlliMascot';
import { EmptyState } from '../components/EmptyState';
import { PainelDinheiroParado } from '../components/PainelDinheiroParado';
import { LembreteAssinaturaFaixa } from '../components/LembreteAssinaturaFaixa';
import { AtivacaoInicio } from '../components/AtivacaoInicio';
import { CreditoTrocaAtalho } from '../components/CreditoTrocaAtalho';
import { ConviteImportar, useConviteImportarDispensado } from '../components/ConviteImportar';
import { PedidosQrAvisoInicio } from '../components/equipamento/PedidosQrAvisoInicio';
import { RecursoPlanoChip, useRecursoPlano } from '../components/RecursoPlano';
import { deveConvidarImportar } from '../utils/conviteImportar';
import { Aparecer, ContadorAnimado, PressableAnimado, Skeleton, curvas } from '../components/motion';
import { toast } from '../components/feedback';
import { ClimaDoDia } from '../components/rua/ClimaDoDia';
import { RotaDeHoje, type EstadoRota } from '../components/rua/RotaDeHoje';
import { MiniMapaDia } from '../components/rua/MiniMapaDia';
import { AtalhosRua, type Atalho } from '../components/rua/AtalhosRua';
import { usePlano } from '../hooks/usePlano';
import { usePermissao } from '../hooks/usePermissao';
import { useSyncInicial } from '../hooks/useSyncInicial';
import { useVerticais } from '../hooks/useVerticais';
import { useLembreteAssinatura } from '../hooks/useLembreteAssinatura';
import { track, Eventos } from '../services/analytics';

/** Quantos clientes do radar o plano Grátis mostra completos (o resto vira teaser bloqueado). */
const RADAR_GRATIS_QTD = 1;

/** Quanto tempo o aviso "Sincronizando..." fica parado na tela (não é duração de animação). */
const PILL_SYNC_VISIVEL_MS = 900;

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Pill discreto "Sincronizando..." — aparece e some sozinho (só opacidade, na UI
 * thread). Dá feedback de que a tela está ligada à nuvem quando o
 * `onSyncAplicado` recarrega os dados em segundo plano.
 */
function SincronizandoPill({ onDone, top = 8 }: { onDone: () => void; top?: number }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const opacidade = useSharedValue(reduzir ? 1 : 0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: roda uma vez por aparição; onDone só fecha a pill.
  useEffect(() => {
    if (reduzir) {
      opacidade.set(1);
      const t = setTimeout(onDone, PILL_SYNC_VISIVEL_MS + DURACAO.slow);
      return () => clearTimeout(t);
    }
    opacidade.set(withSequence(
      withTiming(1, { duration: DURACAO.fast, easing: curvas.standard }),
      withDelay(PILL_SYNC_VISIVEL_MS, withTiming(0, { duration: DURACAO.slow, easing: curvas.standard }, (fim) => {
        if (fim) scheduleOnRN(onDone);
      })),
    ));
    return () => cancelAnimation(opacidade);
  }, []);

  const estilo = useAnimatedStyle(() => ({ opacity: opacidade.get() }));

  return (
    <Animated.View pointerEvents="none" style={[styles.syncPill, { top }, estilo]}>
      <MaterialCommunityIcons
        name="cloud-sync-outline"
        size={13}
        color={cores.accent} // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 2.88:1 (7.25:1)
      />
      <Text style={styles.syncPillText}>Sincronizando...</Text>
    </Animated.View>
  );
}

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia,';
  if (h < 18) return 'Boa tarde,';
  return 'Boa noite,';
}

function horaMinuto(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Início do mês local e início do próximo, em YYYY-MM-DD para o agregado SQL. */
function intervaloMesAtual(): { inicio: string; fimExclusivo: string } {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  const ymd = (data: Date) => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
  return { inicio: ymd(inicio), fimExclusivo: ymd(fim) };
}


/**
 * Véu do hero: cor de marca translúcida POR CIMA de `background`. Não é um gradiente
 * do tema, então não tem companheira `sobre*` — o que o olho vê é a composição, e ela
 * muda com o modo: azul pálido no claro, azul-marinho no escuro.
 */
const VEU_HERO = ['rgba(11,111,206,0.38)', 'rgba(52,198,217,0.08)'] as const;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  // Lembrete de assinatura (regra única em services/lembreteAssinatura.ts); relê a cada foco.
  const lembreteAssinatura = useLembreteAssinatura();

  /**
   * Cores do hero, derivadas do fundo EFETIVO (véu achatado sobre `background`).
   * No modo claro o composto vira quase branco: título e acento precisam ceder
   * (ver `textoSobre`/`ajustarParaContraste`).
   */
  const heroPontas = useMemo(
    () => [achatarVeu(cores.background, VEU_HERO[0]), achatarVeu(cores.background, VEU_HERO[1])] as const,
    [cores.background],
  );
  const heroTexto = textoSobre(heroPontas[0]);
  const heroTextoSec = sobreSecundario(heroTexto, heroPontas);
  const heroAcento = ajustarParaContraste(cores.accentLight, heroPontas[0], 4.5);
  const { temAcesso } = usePlano();
  const { papel, pode, carregando: papelCarregando } = usePermissao();
  // O cartão "Seu primeiro orçamento" da AtivacaoInicio é do DONO (mesma régua
  // que ela usa). Para ele, o StarterCard seria um 2º convite igual na mesma tela.
  const ativacaoDoDono = !papelCarregando && pode('gerenciar_faturamento');
  // Cards de ar-condicionado (códigos de erro) só para quem é do ofício — sem
  // ofício definido, vê tudo (regra de useVerticais).
  const { mostraHvac } = useVerticais();
  // SQLite vazio antes do 1º download da nuvem NÃO é "conta sem orçamento".
  const { estado: download, tentarDeNovo: tentarDownload } = useSyncInicial();
  const scrollRef = useRef<ScrollView>(null);
  const radarLiberado = temAcesso('radar_clientes');
  // Técnico (no desktop; no celular ele tem a TecnicoHome) vê "Minhas OS".
  const ehTecnico = papel === 'tecnico';
  const rotuloOS = ehTecnico ? 'Minhas OS' : 'Ordens de serviço';
  // KPIs comerciais chegam PRONTOS do SQLite (agregados) — não o histórico inteiro.
  const [totalOrcamentos, setTotalOrcamentos] = useState(0);
  const [aprovadosResumo, setAprovadosResumo] = useState({ contagem: 0, valorTotal: 0 });
  const [recusadosMesResumo, setRecusadosMesResumo] = useState({ contagem: 0, valorTotal: 0 });
  const [emAbertoResumo, setEmAbertoResumo] = useState({ contagem: 0, valorTotal: 0 });
  const [recentes, setRecentes] = useState<Orcamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  // `true` só depois de UMA leitura bem-sucedida do cadastro: até lá, "sem
  // empresa" é "ainda não li", não "o cadastro não tem cidade".
  const [empresaLida, setEmpresaLida] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [olliMenu, setOlliMenu] = useState(false);
  const [proxima, setProxima] = useState<Agendamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  // 3 estados explícitos (nunca colapsar erro em vazio).
  const [carregandoErro, setCarregandoErro] = useState(false);
  const [radarTotal, setRadarTotal] = useState<ClienteParaReconquistar[]>([]);
  const [radarCarregando, setRadarCarregando] = useState(true);
  const [radarErro, setRadarErro] = useState(false);
  const [adiandoId, setAdiandoId] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  // Pedidos pela etiqueta QR: o aviso relê no puxar-para-atualizar (não a cada foco).
  const [versaoPedidosQr, setVersaoPedidosQr] = useState(0);
  // "Trazer meus dados do app antigo" — o "Agora não" deste usuário (null = lendo).
  const conviteImportar = useConviteImportarDispensado();

  // RADAR DE COBRANÇA — orçamentos aprovados sem recibo (dinheiro parado).
  const [cobranca, setCobranca] = useState<OrcamentoParaCobrar[]>([]);
  const [cobrancaCarregando, setCobrancaCarregando] = useState(true);
  const [cobrancaErro, setCobrancaErro] = useState(false);

  // RADAR DE FOLLOW-UP — propostas sem resposta há >= 3 dias.
  const [followUp, setFollowUp] = useState<OrcamentoParaFollowUp[]>([]);
  const [followUpCarregando, setFollowUpCarregando] = useState(true);
  const [followUpErro, setFollowUpErro] = useState(false);

  // ROTA DE HOJE — visitas do dia (com as repetições das séries), em sequência.
  const [rota, setRota] = useState<ParadaDoDia<OcorrenciaAgendamento>[]>([]);
  const [rotaEstado, setRotaEstado] = useState<EstadoRota>('carregando');
  const [abrindoMaps, setAbrindoMaps] = useState(false);
  const [avisandoCliente, setAvisandoCliente] = useState(false);

  // CLIMA — localização já concedida; sem ela, a cidade do cadastro (localizada
  // UMA vez por aparelho, só por serviço grátis: CEP/BrasilAPI ou OpenStreetMap).
  // Os 3 estados da leitura do cadastro vão inteiros.
  const leituraCadastro: LeituraCadastro = carregandoErro && !empresaLida ? 'erro' : empresaLida ? 'ok' : 'carregando';
  const reservaClima = useReservaClima(empresa?.cidade, empresa?.estado, empresa?.endereco, leituraCadastro);
  const clima = useClimaDoDia(reservaClima.estado === 'ok' ? reservaClima.coord : null);

  // ETA ESTIMADO (sem trânsito) da próxima parada — `null` = ainda buscando (chip mostra shimmer).
  const [etaResultado, setEtaResultado] = useState<ResultadoEta | null>(null);
  const ultimaBuscaEtaRef = useRef(0);
  const paradaKeyRef = useRef('');
  const temEta = useMemo(() => temDestinoEta(proxima), [proxima]);
  // Identidade da parada: id + endereço. Muda quando a próxima parada troca.
  const paradaKey = useMemo(
    () => (proxima ? `${proxima.id}|${(proxima.endereco ?? '').trim().toLowerCase()}` : ''),
    [proxima],
  );

  const buscarEta = useCallback(async () => {
    ultimaBuscaEtaRef.current = Date.now();
    setEtaResultado(null);
    const r = await getEtaAgendamento(proxima, clientes);
    setEtaResultado(r);
  }, [proxima, clientes]);

  // Re-busca no máximo a cada 5 min, ou já se a parada mudou.
  useFocusEffect(
    useCallback(() => {
      if (!temEta) return;
      const mudouParada = paradaKey !== paradaKeyRef.current;
      const decorridoMs = Date.now() - ultimaBuscaEtaRef.current;
      if (mudouParada || decorridoMs > 5 * 60 * 1000) {
        paradaKeyRef.current = paradaKey;
        buscarEta();
      }
    }, [temEta, paradaKey, buscarEta]),
  );

  const tentarEtaNovamente = useCallback(() => {
    if (temEta) buscarEta();
  }, [temEta, buscarEta]);

  // ─── "SAIA ÀS 14:23 PARA CHEGAR ÀS 15:00" ────────────────────────────────
  // Só LÊ o que `services/avisoSaida.ts` já calculou (no ritual diário): é a
  // estimativa sem trânsito feita no aparelho (Onda I2, grátis). `null` = nada
  // foi tentado; um registro de FALHA aparece com o motivo.
  const [avisoSaida, setAvisoSaida] = useState<AvisoSaida | null>(null);
  const [recalculandoSaida, setRecalculandoSaida] = useState(false);
  // Sem registro de saída, o Grátis vê ONDE a hora de sair entraria ("Disponível no
  // Pro"). Só no estado BLOQUEADO: carregando/liberado não desenham nada (o Pro não
  // vê um esqueleto piscar no herói) e o "plano não confirmado" já é dito pelo
  // EtaChip quando há destino — aqui seria um 2º aviso igual no mesmo cartão.
  const { estado: estadoHoraDeSair } = useRecursoPlano('hora_de_sair');

  const lerSaida = useCallback(async () => {
    if (!proxima) { setAvisoSaida(null); return; }
    setAvisoSaida(await lerAvisoSaida(proxima.id, proxima.inicio));
  }, [proxima]);

  useFocusEffect(
    useCallback(() => {
      void lerSaida();
    }, [lerSaida]),
  );

  /** Toque em "Atualizar": refaz a estimativa agora (ignora o intervalo automático). */
  const recalcularSaida = useCallback(async () => {
    if (recalculandoSaida) return;
    setRecalculandoSaida(true);
    try {
      await reagendarAvisoSaidaDoDia(true);
      await lerSaida();
    } finally {
      setRecalculandoSaida(false);
    }
  }, [recalculandoSaida, lerSaida]);

  const load = useCallback(async () => {
    setCarregandoErro(false);
    try {
      const periodo = intervaloMesAtual();
      const [total, aprov, recusados, aberto, recentesLista, emp, prox, cli] = await Promise.all([
        getOrcamentosTotalAtivos(),
        getOrcamentosAgregadoPorStatusNoPeriodo(['aprovado'], periodo.inicio, periodo.fimExclusivo),
        getOrcamentosAgregadoPorStatusNoPeriodo(['recusado'], periodo.inicio, periodo.fimExclusivo),
        getOrcamentosAgregadoPorStatus(STATUS_PROPOSTA_ENVIADA),
        getUltimosOrcamentos(4),
        getEmpresa(), getProximoAgendamento(), getClientes(),
      ]);
      setTotalOrcamentos(total);
      setAprovadosResumo(aprov);
      setRecusadosMesResumo(recusados);
      setEmAbertoResumo(aberto);
      setRecentes(recentesLista);
      setEmpresa(emp);
      setEmpresaLida(true);
      setProxima(prox);
      setClientes(cli);
    } catch {
      // erro de verdade (leitura falhou) — NUNCA vira skeleton infinito nem
      // telas "vazias" enganosas (StarterCard, hero sem visita etc.).
      setCarregandoErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  const loadRota = useCallback(async () => {
    try {
      const doDia = await getAgendamentosDoDia();
      const paradas = montarRotaDoDia(doDia, new Date());
      setRota(paradas);
      // Roteiro de dicas: o 1º dia com 2+ paradas apresenta a Rota de hoje.
      if (paradas.length >= 2) registrarEventoDica('dia_com_varias_visitas');
      setRotaEstado('ok');
    } catch {
      // "Não consegui ler a agenda" nunca vira "nada hoje".
      setRotaEstado('erro');
    }
  }, []);

  const loadRadar = useCallback(async () => {
    setRadarErro(false);
    try {
      const lista = await clientesParaReconquistar();
      if (lista.length > 0) registrarEventoDica('primeiro_cliente_para_lembrar');
      // Grátis só precisa saber "tem mais 1 no radar" pra desenhar o teaser.
      setRadarTotal(lista.slice(0, 4));
    } catch {
      setRadarErro(true);
    } finally {
      setRadarCarregando(false);
    }
  }, []);

  const loadCobranca = useCallback(async () => {
    setCobrancaErro(false);
    try {
      const lista = await orcamentosParaCobrar();
      setCobranca(lista);
      if (lista.length > 0) registrarEventoDica('primeira_cobranca_atrasada');
    } catch {
      setCobrancaErro(true);
    } finally {
      setCobrancaCarregando(false);
    }
  }, []);

  const loadFollowUp = useCallback(async () => {
    setFollowUpErro(false);
    try {
      const lista = await orcamentosParaFollowUp();
      setFollowUp(lista);
      if (lista.length > 0) registrarEventoDica('primeiro_orcamento_parado');
    } catch {
      setFollowUpErro(true);
    } finally {
      setFollowUpCarregando(false);
    }
  }, []);

  const carregarTudo = useCallback(
    () => Promise.all([load(), loadRota(), loadRadar(), loadCobranca(), loadFollowUp()]),
    [load, loadRota, loadRadar, loadCobranca, loadFollowUp],
  );

  useFocusEffect(useCallback(() => { void carregarTudo(); }, [carregarTudo]));

  // Recarrega quando um sync com a nuvem terminar (ex.: login recém-feito).
  useEffect(() => onSyncAplicado(() => { setSincronizando(true); void carregarTudo(); }), [carregarTudo]);

  const refresh = async () => {
    setRefreshing(true);
    setVersaoPedidosQr(v => v + 1);
    try {
      await carregarTudo();
    } finally {
      setRefreshing(false);
    }
  };

  async function chamarNoWhatsApp(item: ClienteParaReconquistar) {
    if (!item.cliente.telefone?.trim()) {
      toast.info(`Cadastre o WhatsApp de ${item.cliente.nome} em Clientes para chamar por aqui.`, { titulo: 'Sem telefone' });
      return;
    }
    vibrar('selecao');
    try {
      // Abre o WhatsApp com o lembrete do ofício; o cliente sai da lista por 30 dias.
      if (await lembrarNoWhatsApp(item)) {
        setRadarTotal(prev => prev.filter(r => r.cliente.id !== item.cliente.id));
      }
    } catch {
      toast.erro('Não deu para abrir o WhatsApp agora.');
    }
  }

  async function adiarRadar(item: ClienteParaReconquistar) {
    vibrar('selecao');
    setAdiandoId(item.cliente.id);
    try {
      await adiarClienteRadar(item.cliente.id, 30);
      setRadarTotal(prev => prev.filter(r => r.cliente.id !== item.cliente.id));
    } catch {
      toast.erro('Não deu para adiar agora. Tente de novo.');
    } finally {
      setAdiandoId(null);
    }
  }

  async function cobrarNoWhatsApp(item: OrcamentoParaCobrar) {
    // O orçamento guarda o telefone denormalizado — vale mesmo sem o cadastro.
    const telefone = item.orcamento.clienteTelefone || item.cliente?.telefone;
    if (!telefone?.trim()) {
      toast.info(`Cadastre o WhatsApp de ${item.orcamento.clienteNome} em Clientes para cobrar por aqui.`, { titulo: 'Sem telefone' });
      return;
    }
    vibrar('selecao');
    try {
      if (await cobrarItemNoWhatsApp(item)) {
        const agora = new Date().toISOString();
        setCobranca(prev => ordenarParaCobrar(prev.map(c =>
          c.orcamento.id === item.orcamento.id ? { ...c, cobradoEm: agora, cobradoHoje: true } : c)));
      }
    } catch {
      toast.erro('Não deu para abrir o WhatsApp agora.');
    }
  }

  async function followUpNoWhatsApp(item: OrcamentoParaFollowUp) {
    const telefone = item.orcamento.clienteTelefone || item.cliente?.telefone;
    if (!telefone?.trim()) {
      toast.info(`Cadastre o WhatsApp de ${item.orcamento.clienteNome} em Clientes para dar retorno por aqui.`, { titulo: 'Sem telefone' });
      return;
    }
    vibrar('selecao');
    try {
      await abrirWhatsApp(telefone, mensagemFollowUp(item));
    } catch {
      toast.erro('Não deu para abrir o WhatsApp agora.');
    }
  }

  // "ESTOU A CAMINHO" — aparece sempre que a próxima parada tem telefone do
  // cliente. NÃO depende de GPS: com ETA reaproveita o MESMO `etaResultado` do
  // EtaChip; sem ETA, a mensagem sai sem horário — nunca um horário inventado.
  const telefoneProxima = useMemo(() => {
    if (!proxima?.clienteId) return undefined;
    return clientes.find(c => c.id === proxima.clienteId)?.telefone?.trim() || undefined;
  }, [proxima, clientes]);

  const estouACaminho = useCallback(async () => {
    if (!proxima || !telefoneProxima || avisandoCliente) return;
    setAvisandoCliente(true);
    const mensagem = mensagemEstouACaminho(proxima.clienteNome, temEta ? etaResultado : null);
    try {
      await abrirWhatsApp(telefoneProxima, mensagem);
      registrarEventoDica('primeiro_a_caminho');
    } catch {
      toast.erro('Não deu para abrir o WhatsApp. Confira se ele está instalado.');
    } finally {
      setAvisandoCliente(false);
    }
  }, [proxima, telefoneProxima, etaResultado, temEta, avisandoCliente]);

  // Grátis vê 1 cliente sumido de verdade; o resto vira teaser "+N no Pro".
  const radar = radarLiberado ? radarTotal.slice(0, 3) : radarTotal.slice(0, RADAR_GRATIS_QTD);
  const radarBloqueados = radarLiberado ? 0 : Math.max(0, radarTotal.length - RADAR_GRATIS_QTD);

  const irParaPlanos = useCallback((origem: string) => {
    vibrar('selecao');
    track(Eventos.gateCta, { recurso: 'radar_clientes', plano: 'pro', origem });
    nav.navigate('Planos');
  }, [nav]);

  useEffect(() => {
    if (!radarCarregando && radarBloqueados > 0) {
      track(Eventos.gateVisto, { recurso: 'radar_clientes', plano: 'pro', bloqueados: radarBloqueados });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radarCarregando, radarBloqueados]);

  // ── métricas reais (já agregadas em SQL — ver load()) ──
  const valorAprovadoMes = aprovadosResumo.valorTotal;
  const decisoesMes = aprovadosResumo.contagem + recusadosMesResumo.contagem;
  const conversao = decisoesMes ? Math.round((aprovadosResumo.contagem / decisoesMes) * 100) : 0;
  const conversaoDetalhe = decisoesMes
    ? `${aprovadosResumo.contagem} aprovados de ${decisoesMes} decididos`
    : 'sem decisões neste mês';
  /**
   * `false` SÓ quando a leitura terminou e disse que não existe nenhum orçamento.
   * Enquanto carrega — ou quando a leitura falhou — vale `null` (não sabemos).
   */
  const temHistorico = carregando || carregandoErro ? null : totalOrcamentos > 0;
  /**
   * Local vazio e o 1º download da nuvem ainda não confirmado: o zero aqui é
   * "ainda não baixei" (ou "não consegui baixar"), não "a conta não tem".
   */
  const esperandoDownload = download !== 'pronto' && !carregando && !carregandoErro && totalOrcamentos === 0;
  /**
   * Convite "Trazer meus dados do app antigo": primeiro acesso / conta com poucos
   * dados, para quem cadastra clientes. Os números só valem lidos E com o 1º
   * download confirmado — antes disso são "não sei" (null), e "não sei" não convida.
   */
  const contagemConfiavel = !carregando && !carregandoErro && download === 'pronto';
  const mostraConviteImportar = !papelCarregando && pode('gerenciar_clientes') && deveConvidarImportar({
    clientes: contagemConfiavel ? clientes.length : null,
    orcamentos: contagemConfiavel ? totalOrcamentos : null,
    dispensado: conviteImportar.dispensado,
  });
  /**
   * "Pedem follow-up" = o MESMO radar do palco (3+ dias sem resposta).
   * `null` = o radar ainda carrega ou falhou (não sei ≠ zero).
   */
  const pedemFollowUp = followUpCarregando || followUpErro ? null : followUp.length;
  const primeiroNome = empresa?.nomePrestador?.split(' ')[0] || 'prestador';

  // ── ROTA DE HOJE: estado exibido ──
  // Agenda local vazia antes do 1º download confirmado é "ainda não chegou", não
  // "nada hoje".
  const rotaAguardandoNuvem = rotaEstado === 'ok' && rota.length === 0 && download !== 'pronto';
  const rotaEstadoExibido: EstadoRota = rotaAguardandoNuvem ? (download === 'falhou' ? 'erro' : 'carregando') : rotaEstado;
  const enderecosPendentes = useMemo(
    () => enderecosDaRota(rota.filter(p => p.estado === 'proxima' || p.estado === 'depois').map(p => p.visita.endereco)),
    [rota],
  );

  const abrirVisitaNaAgenda = useCallback((id: string) => {
    nav.navigate('Tabs', { screen: 'Agenda', params: { abrirAgendamentoId: id } } as any);
  }, [nav]);

  const agendar = useCallback(() => {
    nav.navigate('Tabs', { screen: 'Agenda', params: { novo: true } } as any);
  }, [nav]);

  const verAgenda = useCallback(() => {
    nav.navigate('Tabs', { screen: 'Agenda' } as any);
  }, [nav]);

  const rotaNoMaps = useCallback(async () => {
    if (abrindoMaps) return;
    setAbrindoMaps(true);
    try {
      if (!(await abrirRotaDoDia(enderecosPendentes))) {
        toast.erro('Não deu para abrir o Google Maps agora.');
      }
    } finally {
      setAbrindoMaps(false);
    }
  }, [abrindoMaps, enderecosPendentes]);

  const atalhos: Atalho[] = [
    ...(ehTecnico ? [{ chave: 'os', icone: 'clipboard-check-outline' as const, rotulo: rotuloOS, descricao: 'Abrir minhas ordens de serviço', cor: cores.accentLight, onPress: () => nav.navigate('OrdemServico') }] : []),
    { chave: 'orcar', icone: 'file-document-edit-outline', rotulo: 'Orçar', descricao: 'Criar um orçamento novo', cor: cores.accentLight, onPress: () => nav.navigate('NovoOrcamento', {}) },
    { chave: 'recibo', icone: 'receipt', rotulo: 'Recibo', descricao: 'Emitir um recibo', cor: cores.success, onPress: () => nav.navigate('EmitirRecibo', {}) },
    { chave: 'agendar', icone: 'calendar-plus', rotulo: 'Agendar', descricao: 'Agendar uma visita', cor: cores.primaryLight, onPress: agendar },
    { chave: 'clientes', icone: 'account-group', rotulo: 'Clientes', descricao: 'Abrir a lista de clientes', cor: corCategoria('#A78BFA', cores.surface), onPress: () => nav.navigate('Clientes') },
  ];

  const abrirOlli = () => {
    setOlliMenu(true);
  };

  /** Do menu da OLLI até o palco do dinheiro: as propostas que pedem retorno. */
  const verFollowUps = () => {
    setOlliMenu(false);
    vibrar('selecao');
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const irPara = (rota: 'OlliVoz' | 'OlliChat') => {
    setOlliMenu(false);
    vibrar('selecao');
    nav.navigate(rota);
  };

  const atendendo = proxima ? emAndamento(proxima) : false;

  return (
    <View style={styles.container}>
      {sincronizando && <SincronizandoPill onDone={() => setSincronizando(false)} top={insets.top + 8} />}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 116 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={cores.accentLight} colors={[cores.accentLight]} />}
      >
        {/* 1. CUMPRIMENTO + CLIMA */}
        <View style={styles.topbar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{saudacao()}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {primeiroNome}
              {empresa?.nome ? <Text style={styles.company}>  ·  {empresa.nome}</Text> : null}
            </Text>
          </View>
          <BotaoComoFunciona tela="inicio" style={styles.ajudaBtn} />
          <PressableAnimado
            style={styles.olliBtn}
            onPress={abrirOlli}
            haptic="selection"
            accessibilityLabel={pedemFollowUp
              ? `Abrir menu da OLLI. ${pedemFollowUp} ${pedemFollowUp === 1 ? 'proposta pede' : 'propostas pedem'} retorno do cliente`
              : 'Abrir menu da OLLI'}
          >
            <OlliMascot size={34} onDark float={false} pulse={false} />
            {pedemFollowUp ? (
              <View style={styles.olliBadge}><Text style={styles.olliBadgeText}>{pedemFollowUp}</Text></View>
            ) : null}
          </PressableAnimado>
        </View>

        <Aparecer indice={0}>
          <ClimaDoDia
            clima={clima}
            reserva={reservaClima}
            onCadastrarCidade={() => nav.navigate('MeuNegocio')}
          />
        </Aparecer>

        {/* LEMBRETE DE ASSINATURA — some sozinho quando não há nada a lembrar; fora
            da web não oferece compra (regra das lojas). */}
        <LembreteAssinaturaFaixa
          lembrete={lembreteAssinatura.lembrete}
          onAcao={lembreteAssinatura.executar}
          onDispensar={lembreteAssinatura.dispensar}
          iniciandoTrial={lembreteAssinatura.iniciandoTrial}
          style={styles.lembreteAssinatura}
        />

        {/* CRÉDITO DE TROCA — só o AVISO (em análise / decidido há pouco), só para o
            dono; sem pedido não ocupa espaço. O cartão fixo mora em Planos e Conta. */}
        {ativacaoDoDono ? <CreditoTrocaAtalho modo="aviso" style={styles.lembreteAssinatura} /> : null}

        {/* ATIVAÇÃO — "Seu primeiro orçamento" e o checklist curto (services/ativacao.ts). */}
        <AtivacaoInicio style={styles.lembreteAssinatura} />

        {/* PRIMEIRO ACESSO — trazer clientes, serviços e produtos do app antigo.
            Some sozinho quando a base cresce; o "x" dispensa neste aparelho. */}
        {mostraConviteImportar ? (
          <Aparecer>
            <ConviteImportar
              style={styles.lembreteAssinatura}
              onAbrir={() => nav.navigate('Importar')}
              onDispensar={conviteImportar.dispensar}
            />
          </Aparecer>
        ) : null}

        {/* DICA DO MOMENTO (roteiro I5): Rota de hoje, proposta parada, cobrança,
            cliente para lembrar — uma por vez, no máximo uma nova por dia. */}
        <DicaDoRoteiro local="inicio" style={styles.lembreteAssinatura} />

        {/* 2. AGORA / PRÓXIMA PARADA */}
        <Aparecer indice={1}>
          <LinearGradient
            colors={VEU_HERO}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.liveRow}>
                <View style={[styles.liveDot, atendendo && { backgroundColor: cores.warning }]} />
                <Text style={[styles.liveLabel, { color: heroAcento }]}>{atendendo ? 'AGORA · EM ATENDIMENTO' : 'PRÓXIMA PARADA'}</Text>
              </View>
              {proxima && !carregando && !carregandoErro ? (
                <PressableAnimado
                  onPress={() => abrirVisitaNaAgenda(proxima.id)}
                  haptic="selection"
                  hitSlop={10}
                  accessibilityLabel="Ver os detalhes desta visita na Agenda"
                >
                  <Text style={[styles.heroLink, { color: heroAcento }]}>Detalhes</Text>
                </PressableAnimado>
              ) : null}
            </View>
            {carregando ? (
              <View style={styles.heroCarregando} accessibilityLabel="Carregando a próxima parada">
                <Skeleton width="30%" height={12} />
                <Skeleton width="65%" height={20} />
                <Skeleton width="80%" height={12} />
              </View>
            ) : carregandoErro ? (
              <View style={styles.heroEmpty}>
                <MaterialCommunityIcons name="alert-circle-outline" size={30} color={heroAcento} />
                <Text style={[styles.heroEmptyTitle, { color: heroTexto }]}>Não deu para carregar</Text>
                <Text style={[styles.heroEmptySub, { color: heroTextoSec }]}>Não conseguimos buscar seus dados agora. Verifique a conexão e tente de novo.</Text>
                <PressableAnimado style={styles.heroBtn} onPress={() => { void carregarTudo(); }} haptic="light" accessibilityLabel="Tentar carregar de novo">
                  <MaterialCommunityIcons name="refresh" size={18} color={textoSobre(cores.accentLight)} />
                  <Text style={styles.heroBtnText}>Tentar de novo</Text>
                </PressableAnimado>
              </View>
            ) : !proxima && esperandoDownload ? (
              <View style={styles.heroEmpty}>
                <MaterialCommunityIcons name={download === 'falhou' ? 'cloud-alert-outline' : 'cloud-sync-outline'} size={30} color={heroAcento} />
                <Text style={[styles.heroEmptyTitle, { color: heroTexto }]}>
                  {download === 'falhou' ? 'Não conseguimos baixar seus dados' : 'Baixando seus dados da nuvem…'}
                </Text>
                <Text style={[styles.heroEmptySub, { color: heroTextoSec }]}>
                  {download === 'falhou'
                    ? 'Sua agenda e seus orçamentos ainda não chegaram neste aparelho. Verifique a conexão e tente de novo.'
                    : 'Sua agenda e seus orçamentos aparecem aqui assim que o download terminar.'}
                </Text>
                {download === 'falhou' ? (
                  <PressableAnimado style={styles.heroBtn} onPress={tentarDownload} haptic="light" accessibilityLabel="Tentar baixar os dados de novo">
                    <MaterialCommunityIcons name="refresh" size={18} color={textoSobre(cores.accentLight)} />
                    <Text style={styles.heroBtnText}>Tentar de novo</Text>
                  </PressableAnimado>
                ) : null}
              </View>
            ) : proxima ? (
              <View style={styles.heroFilled}>
                <Text style={[styles.heroWhen, { color: heroAcento }]}>
                  {atendendo ? `Começou às ${horaMinuto(proxima.inicio)}` : rotuloQuandoVisita(proxima)}
                </Text>
                <Text style={[styles.heroClient, { color: heroTexto }]} numberOfLines={1}>{proxima.clienteNome || proxima.titulo}</Text>
                <Text style={[styles.heroType, { color: heroTextoSec }]} numberOfLines={1}>
                  {TIPO_AGENDAMENTO_LABELS[proxima.tipo]}{proxima.titulo && proxima.clienteNome ? ` · ${proxima.titulo}` : ''}
                </Text>
                <View style={styles.heroAddr}>
                  <MaterialCommunityIcons name="map-marker" size={15} color={heroAcento} />
                  <Text style={[styles.heroAddrText, { color: heroTextoSec }]} numberOfLines={2}>
                    {proxima.endereco?.trim() || 'Sem endereço nesta visita'}
                  </Text>
                </View>
                {temEta && !atendendo ? (
                  <View style={styles.heroEta}>
                    <EtaChip
                      resultado={etaResultado}
                      horario={!isNaN(new Date(proxima.inicio).getTime()) ? new Date(proxima.inicio) : undefined}
                      onTentarNovamente={tentarEtaNovamente}
                    />
                  </View>
                ) : null}
                {/* "A que horas eu preciso sair" — não depende de localização (a
                    origem vem do cadastro). Renderiza só quando há registro. */}
                {avisoSaida && !atendendo ? (
                  <View style={styles.heroSaida}>
                    <AvisoSaidaCard
                      aviso={avisoSaida}
                      onAtualizar={recalcularSaida}
                      atualizando={recalculandoSaida}
                    />
                  </View>
                ) : !avisoSaida && !atendendo && !temEta && estadoHoraDeSair === 'bloqueado' ? (
                  // Grátis sem registro: o lugar da hora de sair diz "Disponível no Pro".
                  // Com destino, o EtaChip acima já mostra este mesmo chip (sem 2º igual).
                  <View style={styles.heroEta}>
                    <RecursoPlanoChip recurso="hora_de_sair">{null}</RecursoPlanoChip>
                  </View>
                ) : null}
                <View style={styles.heroActions}>
                  {proxima.endereco?.trim() ? (
                    <PressableAnimado
                      style={[styles.heroBtn, styles.heroBtnFlex]}
                      onPress={() => { void abrirRotaGoogleMaps(proxima.endereco ?? ''); }}
                      haptic="light"
                      accessibilityLabel={`Traçar rota até ${proxima.endereco}`}
                    >
                      <MaterialCommunityIcons name="navigation-variant" size={17} color={textoSobre(cores.accentLight)} />
                      <Text style={styles.heroBtnText}>Traçar rota</Text>
                    </PressableAnimado>
                  ) : null}
                  {atendendo ? (
                    <PressableAnimado
                      style={[styles.heroBtnGhost, styles.heroBtnFlex]}
                      onPress={() => nav.navigate('EmitirRecibo', { orcamentoId: proxima.orcamentoId })}
                      haptic="light"
                      accessibilityLabel={`Emitir recibo para ${proxima.clienteNome || 'este cliente'}`}
                    >
                      <MaterialCommunityIcons name="receipt" size={17} color={heroAcento} />
                      <Text style={[styles.heroBtnGhostText, { color: heroAcento }]}>Emitir recibo</Text>
                    </PressableAnimado>
                  ) : telefoneProxima ? (
                    // "Estou a caminho": com telefone do cliente, sempre — o WhatsApp não precisa de GPS.
                    <PressableAnimado
                      style={[styles.heroWhatsBtn, styles.heroBtnFlex]}
                      onPress={estouACaminho}
                      disabled={avisandoCliente}
                      haptic="light"
                      accessibilityLabel={`Avisar ${proxima.clienteNome || 'o cliente'} no WhatsApp que você está a caminho`}
                      accessibilityState={{ busy: avisandoCliente }}
                    >
                      <MaterialCommunityIcons
                        name="whatsapp"
                        size={17}
                        color="#0A1626" // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)
                      />
                      <Text style={styles.heroWhatsBtnText}>{avisandoCliente ? 'Abrindo…' : 'Estou a caminho'}</Text>
                    </PressableAnimado>
                  ) : null}
                </View>
                {!atendendo && !telefoneProxima ? (
                  <Text style={[styles.heroNota, { color: heroTextoSec }]}>
                    Sem WhatsApp do cliente nesta visita: cadastre o telefone para avisar que está a caminho.
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.heroEmpty}>
                <MaterialCommunityIcons name="calendar-blank-outline" size={30} color={heroAcento} />
                <Text style={[styles.heroEmptyTitle, { color: heroTexto }]}>Nenhuma visita marcada</Text>
                <Text style={[styles.heroEmptySub, { color: heroTextoSec }]}>Agende seus serviços e a próxima parada aparece aqui, com rota e aviso ao cliente.</Text>
                <PressableAnimado style={styles.heroBtn} onPress={agendar} haptic="light" accessibilityLabel="Agendar uma visita">
                  <MaterialCommunityIcons name="calendar-plus" size={18} color={textoSobre(cores.accentLight)} />
                  <Text style={styles.heroBtnText}>Agendar visita</Text>
                </PressableAnimado>
              </View>
            )}
          </LinearGradient>
        </Aparecer>

        {/* MINI-MAPA DO DIA (Onda I2) — 160 px com os pins e a linha; tocar abre o
            Mapa do dia. Grátis (MapLibre + OpenFreeMap). Some nos estados que a
            Rota de Hoje logo abaixo já explica (carregando, erro, nada hoje). */}
        {!(esperandoDownload && !proxima) && !carregandoErro && (
          <Aparecer indice={2}>
            <MiniMapaDia
              estado={rotaEstadoExibido}
              paradas={rota}
              clientes={clientes}
              onAbrirMapa={() => nav.navigate('MapaDia', { dia: 'hoje' })}
            />
          </Aparecer>
        )}

        {/* 3. ROTA DE HOJE — some só enquanto o hero já explica que os dados
            ainda estão vindo da nuvem (não dá para afirmar "nada hoje"). */}
        {!(esperandoDownload && !proxima) && !carregandoErro && (
          <Aparecer indice={2}>
            <RotaDeHoje
              estado={rotaEstadoExibido}
              paradas={rota}
              textoErro={rotaAguardandoNuvem ? 'Sua agenda ainda não chegou da nuvem.' : undefined}
              onTentarDeNovo={() => {
                if (rotaAguardandoNuvem) { tentarDownload(); return; }
                setRotaEstado('carregando');
                void loadRota();
              }}
              onAbrirVisita={abrirVisitaNaAgenda}
              onAgendar={agendar}
              onVerAgenda={verAgenda}
              onRotaNoMaps={enderecosPendentes.length >= 2 ? () => { void rotaNoMaps(); } : null}
              abrindoMaps={abrindoMaps}
            />
          </Aparecer>
        )}

        {/* PEDIDOS PELA ETIQUETA QR — cliente pedindo orçamento é dinheiro chegando:
            fica logo antes do Dinheiro. Some quando não há pedido novo ou a leitura
            falha (é aviso, não lista); quem orça responde no WhatsApp. */}
        {!papelCarregando && pode('criar_orcamento') ? (
          <Aparecer indice={3}>
            <PedidosQrAvisoInicio nomeEmpresa={empresa?.nome || undefined} versao={versaoPedidosQr} style={styles.pedidosQr} />
          </Aparecer>
        ) : null}

        {/* 4. DINHEIRO — a receber (aprovado sem pagamento) e esperando resposta.
            Os 3 estados de cada radar vão INTEIROS para o palco: é ele que
            garante que "não deu para verificar" nunca vire "nada a receber". */}
        {!esperandoDownload && (
          <>
            <Text style={styles.sectionTitle} accessibilityRole="header">Dinheiro</Text>
            <Aparecer indice={3}>
              <PainelDinheiroParado
                cobranca={cobranca}
                cobrancaCarregando={cobrancaCarregando}
                cobrancaErro={cobrancaErro}
                onRecarregarCobranca={loadCobranca}
                onCobrar={cobrarNoWhatsApp}
                onCadastrarPix={() => { vibrar('selecao'); nav.navigate('MeuNegocio'); }}
                followUp={followUp}
                followUpCarregando={followUpCarregando}
                followUpErro={followUpErro}
                onRecarregarFollowUp={loadFollowUp}
                onFollowUp={followUpNoWhatsApp}
                temHistorico={temHistorico}
                onVerTodos={() => { vibrar('selecao'); nav.navigate('Orcamentos'); }}
              />
            </Aparecer>
          </>
        )}

        {/* Números do mês */}
        {carregando || (esperandoDownload && download === 'baixando') ? (
          <View style={styles.kpis}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[styles.kpi, { height: 96, justifyContent: 'center', gap: 8 }]}>
                <Skeleton width="70%" height={19} />
                <Skeleton width="50%" height={11} />
              </View>
            ))}
          </View>
        ) : carregandoErro || esperandoDownload ? (
          <View style={{ paddingHorizontal: Spacing.base, marginTop: Spacing.sm }}>
            <View style={styles.avisoLinha}>
              <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
              <Text style={styles.avisoLinhaTexto}>
                {carregandoErro ? 'Não deu para carregar seus números agora.' : 'Seus números ainda não chegaram da nuvem.'}
              </Text>
              <PressableAnimado onPress={carregandoErro ? load : tentarDownload} haptic="selection" hitSlop={8} accessibilityLabel="Tentar carregar os números de novo">
                <Text style={styles.avisoLinhaAcao}>Tentar de novo</Text>
              </PressableAnimado>
            </View>
          </View>
        ) : (
          <Aparecer indice={4}>
            <View style={styles.kpis}>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Aprovado neste mês</Text>
                <ContadorAnimado valor={valorAprovadoMes} formato="brl" style={[styles.kpiValue, { color: cores.onSurface }]} />
                <Text style={styles.kpiHint}>{aprovadosResumo.contagem} {aprovadosResumo.contagem === 1 ? 'orçamento' : 'orçamentos'}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Aguardando cliente</Text>
                <ContadorAnimado valor={emAbertoResumo.contagem} style={[styles.kpiValue, { color: cores.onSurface }]} />
                <Text style={styles.kpiHint}>enviados sem resposta</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Pedem follow-up</Text>
                {pedemFollowUp === null ? (
                  followUpErro ? (
                    <Text style={[styles.kpiValue, { color: cores.onSurfaceVariant }]} accessibilityLabel="Não deu para verificar">—</Text>
                  ) : (
                    <Skeleton width="40%" height={19} style={{ marginTop: 4 }} />
                  )
                ) : (
                  <ContadorAnimado valor={pedemFollowUp} style={[styles.kpiValue, { color: pedemFollowUp > 0 ? cores.warning : cores.onSurface }]} />
                )}
                <Text style={[styles.kpiHint, (pedemFollowUp ?? 0) > 0 && styles.kpiHintWarn]}>
                  {followUpErro ? 'não deu para verificar' : `sem resposta há ${LIMIAR_PROPOSTA_PARADA_DIAS}+ dias`}
                </Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Conversão do mês</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <ContadorAnimado valor={conversao} style={[styles.kpiValue, { color: cores.onSurface }]} />
                  <Text style={[styles.kpiValue, { color: cores.onSurface }]}>%</Text>
                </View>
                <Text style={styles.kpiHint}>{conversaoDetalhe}</Text>
              </View>
            </View>
          </Aparecer>
        )}

        {/* 5. ATALHOS DE 1 TOQUE */}
        <Text style={styles.sectionTitle} accessibilityRole="header">Atalhos</Text>
        <Aparecer indice={5}>
          <AtalhosRua atalhos={atalhos} />
        </Aparecer>

        {/* A dica do botão central aparece UMA vez (some no "Entendi") e só
            depois de a tela carregar — nunca junto do esqueleto. */}
        {!carregando && (
          <View style={{ paddingHorizontal: Spacing.base }}>
            <DicaContextual
              id="home.botao-orcar"
              icon="plus-circle-outline"
              texto="Dica: o botão central da barra de baixo (Orçar) também cria um orçamento, de qualquer tela."
            />
          </View>
        )}

        <View style={styles.maisRow}>
          {/* Para o técnico, "Minhas OS" já é atalho de 1 toque: não repete aqui. */}
          {!ehTecnico ? (
            <PressableAnimado style={styles.maisChip} onPress={() => nav.navigate('OrdemServico')} haptic="selection" accessibilityLabel={`Abrir ${rotuloOS.toLowerCase()}`}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={15} color={cores.accentLight} />
              <Text style={styles.maisChipText}>{rotuloOS}</Text>
            </PressableAnimado>
          ) : null}
          <PressableAnimado style={styles.maisChip} onPress={() => nav.navigate('Servicos')} haptic="selection" accessibilityLabel="Abrir o catálogo de serviços">
            <MaterialCommunityIcons name="wrench-outline" size={15} color={cores.accentLight} />
            <Text style={styles.maisChipText}>Serviços</Text>
          </PressableAnimado>
          <PressableAnimado style={styles.maisChip} onPress={() => nav.navigate('MeuNegocio')} haptic="selection" accessibilityLabel="Abrir Meu negócio">
            <MaterialCommunityIcons name="storefront-outline" size={15} color={cores.accentLight} />
            <Text style={styles.maisChipText}>Meu negócio</Text>
          </PressableAnimado>
        </View>

        {/* Convite de "primeiro orçamento" — UM só na tela. O dono já vê o da
            AtivacaoInicio; o StarterCard fica para quem não é dono. E só depois
            que o 1º download confirmou o zero. */}
        {!carregando && !carregandoErro && totalOrcamentos === 0 && download === 'pronto' && !papelCarregando && !ativacaoDoDono && (
          <Aparecer indice={6}>
            <StarterCard
              onCreate={() => nav.navigate('NovoOrcamento', {})}
              onVoice={() => nav.navigate('OlliVoz')}
              onSetup={() => nav.navigate('MeuNegocio')}
            />
          </Aparecer>
        )}

        {/* CLIENTES PARA LEMBRAR (pós-venda) — regra em utils/posVenda.ts. */}
        {radarCarregando ? (
          <View style={{ paddingHorizontal: Spacing.base, marginTop: Spacing.xl, gap: 10 }}>
            <Skeleton width="45%" height={16} />
            <View style={styles.radarCard}>
              <View style={styles.radarTop}>
                <Skeleton width={42} height={42} radius={21} />
                <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                  <Skeleton width="55%" height={14} />
                  <Skeleton width="35%" height={12} />
                </View>
              </View>
            </View>
          </View>
        ) : radarErro ? (
          <>
            <Text style={styles.sectionTitle}>Clientes para lembrar</Text>
            <View style={{ paddingHorizontal: Spacing.base }}>
              <View style={styles.avisoLinha}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
                <Text style={styles.avisoLinhaTexto}>Não deu para ver quem está na hora de lembrar agora.</Text>
                <PressableAnimado onPress={loadRadar} haptic="selection" hitSlop={8} accessibilityLabel="Tentar de novo">
                  <Text style={styles.avisoLinhaAcao}>Tentar de novo</Text>
                </PressableAnimado>
              </View>
            </View>
          </>
        ) : radar.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Clientes para lembrar</Text>
            <View style={{ paddingHorizontal: Spacing.base, gap: 10 }}>
              {radar.map((item, i) => (
                <Aparecer key={item.cliente.id} indice={i}>
                  <View style={styles.radarCard}>
                    <View style={styles.radarTop}>
                      <View style={styles.radarAvatar}>
                        <Text style={styles.radarAvatarText}>{item.cliente.nome.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.radarName} numberOfLines={1}>{item.cliente.nome}</Text>
                        <Text style={styles.radarMeta}>
                          último serviço há {item.mesesSemContato} {item.mesesSemContato === 1 ? 'mês' : 'meses'}
                          {item.lembradoEm ? ` · lembrado em ${formatDate(item.lembradoEm)}` : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.radarActions}>
                      <PressableAnimado
                        style={styles.radarBtnPrimary}
                        onPress={() => chamarNoWhatsApp(item)}
                        accessibilityLabel={`Lembrar ${item.cliente.nome} no WhatsApp — último serviço há ${item.mesesSemContato} ${item.mesesSemContato === 1 ? 'mês' : 'meses'}`}
                      >
                        <MaterialCommunityIcons
                          name="whatsapp"
                          size={16}
                          color="#0A1626" // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)
                        />
                        <Text style={styles.radarBtnPrimaryText}>Lembrar no WhatsApp</Text>
                      </PressableAnimado>
                      <PressableAnimado
                        style={styles.radarBtnGhost}
                        onPress={() => adiarRadar(item)}
                        disabled={adiandoId === item.cliente.id}
                        accessibilityLabel={`Adiar ${item.cliente.nome} por 30 dias`}
                        accessibilityState={{ busy: adiandoId === item.cliente.id }}
                      >
                        <Text style={styles.radarBtnGhostText}>{adiandoId === item.cliente.id ? 'Adiando…' : 'Adiar 30 dias'}</Text>
                      </PressableAnimado>
                    </View>
                  </View>
                </Aparecer>
              ))}

              {radarBloqueados > 0 && (
                <Aparecer indice={radar.length}>
                  <PressableAnimado style={styles.radarTeaser} onPress={() => irParaPlanos('radar_card')} escala={0.98}>
                    <View style={styles.radarTeaserIcon}>
                      <MaterialCommunityIcons name="lock-outline" size={18} color={cores.plan} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.radarTeaserTitle}>
                        +{radarBloqueados} cliente{radarBloqueados > 1 ? 's' : ''} na hora de lembrar
                      </Text>
                      <Text style={styles.radarTeaserSub}>Veja todos e lembre com 1 toque no Pro</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={cores.plan} />
                  </PressableAnimado>
                </Aparecer>
              )}
            </View>
          </>
        ) : null}

        {/* DIAGNÓSTICO — só para quem é do ofício de ar-condicionado (ou ainda sem
            ofício): "698 códigos de ar-condicionado" na tela de um pintor é ruído.
            Aparece UMA vez na tela (antes eram três). */}
        {mostraHvac && (
          <Aparecer indice={7}>
            <PressableAnimado
              escala={0.98}
              onPress={() => nav.navigate('Diagnostico')}
              haptic="selection"
              accessibilityLabel="Diagnóstico de erro: 698 códigos de ar-condicionado, funciona offline"
            >
              <LinearGradient
                colors={['rgba(11,111,206,0.30)', 'rgba(52,198,217,0.10)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.anzol}
              >
                <View style={styles.anzolIcon}>
                  <MaterialCommunityIcons name="card-search-outline" size={26} color={cores.accentLight} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.anzolTitle}>Diagnóstico de erro</Text>
                  <Text style={styles.anzolSub}>698 códigos de ar-condicionado · ache a falha em segundos, offline</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color={cores.accentLight} />
              </LinearGradient>
            </PressableAnimado>
          </Aparecer>
        )}

        {/* ORÇAMENTOS RECENTES */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Orçamentos recentes</Text>
          <PressableAnimado onPress={() => nav.navigate('Orcamentos')} haptic="selection" hitSlop={8} accessibilityLabel="Ver todos os orçamentos">
            <Text style={styles.seeAll}>ver todos</Text>
          </PressableAnimado>
        </View>

        {carregando || (esperandoDownload && download === 'baixando') ? (
          <View style={{ paddingHorizontal: Spacing.base, gap: 10 }}>
            {[0, 1].map(i => (
              <View key={i} style={styles.recentCard}>
                <Skeleton width={42} height={42} radius={21} />
                <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                  <Skeleton width="55%" height={14} />
                  <Skeleton width="35%" height={12} />
                </View>
              </View>
            ))}
          </View>
        ) : carregandoErro ? (
          <View style={styles.emptyRecent}>
            <EmptyState
              icon="alert-circle-outline"
              title="Não deu para carregar"
              subtitle="Não conseguimos buscar seus orçamentos agora. Verifique a conexão e tente de novo."
              actionLabel="Tentar de novo"
              onAction={load}
            />
          </View>
        ) : esperandoDownload ? (
          <View style={styles.emptyRecent}>
            <EmptyState
              icon="cloud-alert-outline"
              title="Não conseguimos baixar seus dados"
              subtitle="Seus orçamentos ainda não chegaram neste aparelho. Verifique a conexão e tente de novo."
              actionLabel="Tentar de novo"
              onAction={tentarDownload}
            />
          </View>
        ) : recentes.length === 0 ? (
          <View style={styles.emptyRecent}>
            {/* Sem botão aqui: o convite para o primeiro orçamento já está mais acima. */}
            <EmptyState
              icon="file-document-outline"
              title="Nenhum orçamento ainda"
              subtitle="Os orçamentos que você criar aparecem aqui, com o status de cada um."
            />
          </View>
        ) : (
          <View style={{ paddingHorizontal: Spacing.base, gap: 10 }}>
            {recentes.map((o, i) => (
              <Aparecer key={o.id} indice={i}>
                <PressableAnimado
                  style={styles.recentCard}
                  escala={0.98}
                  onPress={() => nav.navigate('VisualizarOrcamento', { orcamentoId: o.id })}
                  accessibilityLabel={`Orçamento de ${o.clienteNome}, ${formatCurrency(o.valorTotal)}`}
                >
                  <View style={styles.recentAvatar}><Text style={styles.recentAvatarText}>{o.clienteNome.charAt(0).toUpperCase()}</Text></View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.recentName} numberOfLines={1}>{o.clienteNome}</Text>
                    <Text style={styles.recentMeta}>Nº {formatarNumeroExibicao(o.numero)} · {formatDate(o.criadoEm)}</Text>
                    <View style={{ marginTop: 5 }}><StatusBadge status={o.status} size="sm" /></View>
                  </View>
                  <Text style={styles.recentValue}>{formatCurrency(o.valorTotal)}</Text>
                </PressableAnimado>
              </Aparecer>
            ))}
          </View>
        )}
      </ScrollView>

      {/* MENU RÁPIDO DA OLLI (robô no topo) */}
      <Modal visible={olliMenu} transparent animationType="fade" onRequestClose={() => setOlliMenu(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setOlliMenu(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <View style={styles.sheetMascot}><OlliMascot size={34} onDark float={false} pulse={false} /></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.sheetTitle}>Oi, eu sou a OLLI</Text>
                <Text style={styles.sheetSub}>Como posso te ajudar agora?</Text>
              </View>
            </View>

            {pedemFollowUp ? (
              <PressableAnimado style={styles.sheetItem} escala={0.98} onPress={verFollowUps} accessibilityLabel={`${pedemFollowUp} ${pedemFollowUp === 1 ? 'proposta pede retorno' : 'propostas pedem retorno'}. Ver no Início`}>
                <View style={[styles.sheetIcon, { backgroundColor: comAlfa(cores.warning, 0.14), borderColor: comAlfa(cores.warning, 0.34) }]}>
                  <MaterialCommunityIcons name="message-reply-text-outline" size={22} color={cores.warning} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.sheetItemTitle}>
                    {pedemFollowUp} {pedemFollowUp === 1 ? 'proposta pede retorno' : 'propostas pedem retorno'}
                  </Text>
                  <Text style={styles.sheetItemDesc}>Sem resposta do cliente há {LIMIAR_PROPOSTA_PARADA_DIAS} dias ou mais</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={cores.onSurfaceMuted} />
              </PressableAnimado>
            ) : null}

            <PressableAnimado style={styles.sheetItem} escala={0.98} onPress={() => irPara('OlliVoz')} accessibilityLabel="Montar orçamento por voz">
              <View style={[styles.sheetIcon, { backgroundColor: 'rgba(52,198,217,0.14)', borderColor: 'rgba(52,198,217,0.34)' }]}>
                <MaterialCommunityIcons name="microphone" size={22} color={cores.accentLight} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.sheetItemTitle}>Montar orçamento por voz</Text>
                <Text style={styles.sheetItemDesc}>Fale o serviço e eu monto pra você</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={cores.onSurfaceMuted} />
            </PressableAnimado>

            <PressableAnimado style={styles.sheetItem} escala={0.98} onPress={() => irPara('OlliChat')} accessibilityLabel="Conversar com a OLLI">
              <View style={[styles.sheetIcon, { backgroundColor: 'rgba(11,111,206,0.18)', borderColor: 'rgba(11,111,206,0.36)' }]}>
                <MaterialCommunityIcons name="chat-processing-outline" size={22} color={cores.primaryLight} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.sheetItemTitle}>Conversar com a OLLI</Text>
                <Text style={styles.sheetItemDesc}>Tire dúvidas técnicas, preços e diagnóstico</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={cores.onSurfaceMuted} />
            </PressableAnimado>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StarterCard({ onCreate, onVoice, onSetup }: { onCreate: () => void; onVoice: () => void; onSetup: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.starterCard}>
      <View style={styles.starterTop}>
        <View style={styles.starterIcon}>
          <MaterialCommunityIcons name="rocket-launch-outline" size={23} color={cores.accentLight} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.starterTitle}>Primeiro orçamento em minutos</Text>
          <Text style={styles.starterSub}>Fale o serviço, revise os itens e gere um PDF com cara de empresa grande.</Text>
        </View>
      </View>
      <View style={styles.starterSteps}>
        <MiniStep n="1" text="cliente" />
        <MiniStep n="2" text="itens" />
        <MiniStep n="3" text="PDF/link" />
      </View>
      <View style={styles.starterActions}>
        <PressableAnimado style={styles.starterPrimary} onPress={onVoice} haptic="light" accessibilityLabel="Criar o primeiro orçamento por voz">
          <MaterialCommunityIcons name="microphone" size={17} color={textoSobre(cores.accentLight)} />
          <Text style={styles.starterPrimaryText}>Criar por voz</Text>
        </PressableAnimado>
        <PressableAnimado style={styles.starterGhost} onPress={onCreate} haptic="selection" accessibilityLabel="Criar o primeiro orçamento digitando">
          <Text style={styles.starterGhostText}>Manual</Text>
        </PressableAnimado>
      </View>
      <PressableAnimado style={styles.starterSetup} onPress={onSetup} haptic="selection" accessibilityLabel="Configurar logo, Pix e assinatura">
        <MaterialCommunityIcons name="storefront-outline" size={15} color={cores.onSurfaceVariant} />
        <Text style={styles.starterSetupText}>Configurar logo, PIX e assinatura</Text>
      </PressableAnimado>
    </View>
  );
}

function MiniStep({ n, text }: { n: string; text: string }) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.miniStep}>
      <Text style={styles.miniStepN}>{n}</Text>
      <Text style={styles.miniStepText}>{text}</Text>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  syncPill: {
    position: 'absolute', alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    // Pill sempre escura de propósito (como um toast), nos dois modos; por isso
    // o primeiro plano usa o ciano vivo (accent).
    backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: c.strokeGlow,
    borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6,
    ...sombrasDe(c).sm,
  },
  syncPillText: { fontSize: 11.5, fontWeight: '700', color: c.accent }, // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 2.88:1 (7.25:1)
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, marginBottom: 4 },
  ajudaBtn: { marginRight: 6 },
  lembreteAssinatura: { marginHorizontal: Spacing.base, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  pedidosQr: { marginTop: Spacing.lg, marginBottom: 0 },
  greeting: { fontSize: 13, color: c.onSurfaceVariant, fontWeight: '500' },
  name: { fontSize: 21, fontWeight: '800', color: c.onBackground, marginTop: 1 },
  company: { fontSize: 13, fontWeight: '600', color: c.onSurfaceMuted },
  // Cyan fixo (base #7FE9F5, não a cor de marca escolhida): decorativo.
  olliBtn: { width: 48, height: 48, borderRadius: BorderRadius.chip, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.3)', justifyContent: 'center', alignItems: 'center' },
  olliBadge: { position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: c.danger, borderWidth: 2, borderColor: c.background, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  // Branco fixo: convenção universal de badge sobre cor de status saturada.
  olliBadgeText: { fontSize: 9.5, fontWeight: '800', color: '#fff' },

  // HERO: véu translúcido por cima do fundo; as cores de texto vêm de
  // heroTexto/heroAcento (derivadas do fundo EFETIVO), não deste objeto.
  hero: { marginHorizontal: Spacing.base, marginTop: Spacing.md, borderRadius: BorderRadius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: c.strokeGlow, ...sombrasDe(c).md },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.success },
  liveLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0 },
  heroLink: { fontSize: 12.5, fontWeight: '800' },
  heroCarregando: { marginTop: 14, gap: 10 },
  heroEmpty: { alignItems: 'center', paddingVertical: 14 },
  heroEmptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 8 },
  heroEmptySub: { fontSize: 12.5, textAlign: 'center', marginTop: 4, lineHeight: 18, paddingHorizontal: 10 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: c.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 17, minHeight: 46, marginTop: 14 },
  heroBtnText: { fontSize: 14, fontWeight: '800', color: textoSobre(c.accentLight) },
  heroBtnFlex: { flex: 1, marginTop: 0 },

  // Próxima parada preenchida
  heroFilled: { marginTop: 12 },
  heroWhen: { fontSize: 13, fontWeight: '800', letterSpacing: 0 },
  heroClient: { fontSize: 21, fontWeight: '800', marginTop: 4 },
  heroType: { fontSize: 13, marginTop: 2 },
  heroAddr: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 10 },
  heroAddrText: { flex: 1, fontSize: 13, lineHeight: 18 },
  heroEta: { marginTop: 10, alignItems: 'flex-start' },
  heroSaida: { marginTop: 10, alignSelf: 'stretch' },
  // Verde do WhatsApp com tinta escura: convenção única de "ação de WhatsApp" no app.
  heroWhatsBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, backgroundColor: c.whatsapp, borderRadius: BorderRadius.full, minHeight: 46, paddingHorizontal: 14 },
  heroWhatsBtnText: { fontSize: 14, fontWeight: '800', color: '#0A1626' }, // contraste-ok: sobre c.whatsapp #25D366 (9.16:1)
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  heroBtnGhost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: c.strokeGlow, backgroundColor: c.surfacePressed, borderRadius: BorderRadius.full, paddingHorizontal: 16, minHeight: 46 },
  heroBtnGhostText: { fontSize: 14, fontWeight: '800' },
  heroNota: { fontSize: 12, marginTop: 10, lineHeight: 17 },

  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outlineDark, marginHorizontal: Spacing.base, marginTop: Spacing.md, padding: 8 },
  kpi: { flexGrow: 1, flexBasis: '45%', minHeight: 94, alignItems: 'flex-start', justifyContent: 'center', backgroundColor: c.surfacePressed, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.lg, paddingHorizontal: 12, paddingVertical: 10 },
  kpiValue: { ...Typography.value, fontSize: 19, color: c.onSurface, marginTop: 4 },
  kpiLabel: { fontSize: 11.5, color: c.onSurfaceVariant, fontWeight: '800' },
  kpiHint: { fontSize: 10.5, color: c.onSurfaceMuted, marginTop: 3, fontWeight: '600' },
  kpiHintWarn: { color: c.warning },

  anzol: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.base, marginTop: Spacing.xl, padding: Spacing.base, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.strokeGlow },
  anzolIcon: { width: 46, height: 46, borderRadius: BorderRadius.chip, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.3)', justifyContent: 'center', alignItems: 'center' },
  anzolTitle: { fontSize: 15.5, fontWeight: '800', color: c.onSurface },
  anzolSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2, lineHeight: 16 },

  maisRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: Spacing.base, marginTop: Spacing.md },
  maisChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.outlineDark, backgroundColor: c.surfaceGlass },
  maisChipText: { fontSize: 12.5, fontWeight: '700', color: c.onSurface },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.onBackground, paddingHorizontal: Spacing.base, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: Spacing.base },
  seeAll: { fontSize: 12.5, color: c.accentLight, fontWeight: '700', marginTop: Spacing.xl, marginBottom: Spacing.sm },

  starterCard: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.lg,
    padding: Spacing.base,
    borderRadius: BorderRadius.xl,
    backgroundColor: c.surfaceGlass,
    borderWidth: 1,
    borderColor: c.strokeGlow,
    ...sombrasDe(c).md,
  },
  starterTop: { flexDirection: 'row', alignItems: 'center' },
  starterIcon: { width: 46, height: 46, borderRadius: BorderRadius.chip, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.32)', justifyContent: 'center', alignItems: 'center' },
  starterTitle: { fontSize: 15.5, fontWeight: '800', color: c.onSurface },
  starterSub: { fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 17, marginTop: 2 },
  starterSteps: { flexDirection: 'row', gap: 8, marginTop: 14 },
  miniStep: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.surfacePressed, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.full, paddingVertical: 8 },
  miniStepN: { width: 18, height: 18, borderRadius: 9, overflow: 'hidden', backgroundColor: c.accentLight, textAlign: 'center', color: textoSobre(c.accentLight), fontSize: 11, fontWeight: '800', lineHeight: 18 },
  miniStepText: { fontSize: 11.5, fontWeight: '700', color: c.onSurfaceVariant },
  starterActions: { flexDirection: 'row', gap: 9, marginTop: 14 },
  starterPrimary: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, backgroundColor: c.accentLight, borderRadius: BorderRadius.full, minHeight: 44 },
  starterPrimaryText: { fontSize: 13.5, fontWeight: '800', color: textoSobre(c.accentLight) },
  starterGhost: { minWidth: 88, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.strokeGlow, backgroundColor: c.surfacePressed },
  starterGhostText: { fontSize: 13.5, fontWeight: '800', color: c.accentLight },
  starterSetup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, minHeight: 40 },
  starterSetupText: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant },

  emptyRecent: { paddingHorizontal: Spacing.base, minHeight: 220 },

  radarCard: { backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.md },
  radarTop: { flexDirection: 'row', alignItems: 'center' },
  radarAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(247,178,59,0.16)', justifyContent: 'center', alignItems: 'center' },
  radarAvatarText: { fontSize: 17, fontWeight: '800', color: c.warning },
  radarName: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  radarMeta: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  radarActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  radarBtnPrimary: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: c.whatsapp, borderRadius: BorderRadius.full, minHeight: 44 },
  radarBtnPrimaryText: { fontSize: 12.5, fontWeight: '800', color: '#0A1626' }, // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)
  radarBtnGhost: { justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.strokeGlow, backgroundColor: c.surfacePressed, paddingHorizontal: 14, minHeight: 44 },
  radarBtnGhostText: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },

  // Linha de "não deu para carregar X" + retry. Um erro NUNCA vira ausência silenciosa.
  avisoLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.3)', borderRadius: BorderRadius.xl, padding: Spacing.md },
  avisoLinhaTexto: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant },
  avisoLinhaAcao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },

  radarTeaser: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(124,58,237,0.10)', borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: 'rgba(124,58,237,0.32)', padding: Spacing.md, gap: 12 },
  radarTeaserIcon: { width: 36, height: 36, borderRadius: BorderRadius.chip, backgroundColor: 'rgba(124,58,237,0.16)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.34)', justifyContent: 'center', alignItems: 'center' },
  radarTeaserTitle: { fontSize: 13.5, fontWeight: '800', color: c.onSurface },
  radarTeaserSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 1 },

  recentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.md },
  recentAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(11,111,206,0.2)', justifyContent: 'center', alignItems: 'center' },
  recentAvatarText: { fontSize: 17, fontWeight: '800', color: c.accentLight },
  recentName: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  recentMeta: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  recentValue: { fontSize: 15, fontWeight: '800', color: c.accentLight, marginLeft: 8 },

  // Scrim do bottom sheet: escurece o fundo sempre, nos dois modos.
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(5,12,22,0.72)', justifyContent: 'flex-end' },
  // paddingBottom vem do JSX (insets.bottom + 16): o 2º item não encosta na barra do Android.
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outline, paddingHorizontal: Spacing.base, paddingTop: 10 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.outlineDark, marginBottom: Spacing.base },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.base },
  sheetMascot: { width: 48, height: 48, borderRadius: BorderRadius.chip, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.3)', justifyContent: 'center', alignItems: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: c.onSurface },
  sheetSub: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.md, marginBottom: 10 },
  sheetIcon: { width: 44, height: 44, borderRadius: BorderRadius.chip, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  sheetItemTitle: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  sheetItemDesc: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2 },
});
