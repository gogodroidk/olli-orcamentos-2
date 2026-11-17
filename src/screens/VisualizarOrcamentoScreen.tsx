import { formatarNumeroExibicao } from '../utils/numeroDocumento';
import { registrarAtividadeUsuario } from '../services/equipe';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Share, ActivityIndicator, Image, Modal, RefreshControl, Linking,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useGradientes, useEstilos, sombrasDe, comAlfa, textoSobre, corStatusOrcamento, type Cores } from '../theme';
import { OlliCard } from '../components/OlliCard';
import { OlliButton } from '../components/OlliButton';
import { GradientHeader } from '../components/GradientHeader';
import { EmptyState } from '../components/EmptyState';
import { OlliPressable } from '../components/OlliPressable';
import { Celebracao } from '../components/Celebracao';
import { AssinaturaClienteModal } from '../components/assinatura/AssinaturaClienteModal';
import { OverlayProgresso } from '../components/OverlayProgresso';
import { BarraStatusCompacta, CabecalhoStatus } from '../components/orcamento/CabecalhoStatus';
import { TimelineOrcamento } from '../components/orcamento/TimelineOrcamento';
import { FolhaAcoes, ItemFolha } from '../components/orcamento/FolhaAcoes';
import { Aparecer, PressableAnimado, Skeleton } from '../components/motion';
import {
  celebracaoDaTransicao,
  financeiroQuitado,
  montarLinhaDoTempo,
  proximoPassoDoStatus,
  type LeituraLink,
  type MotivoCelebracao,
  type RetratoCelebracao,
} from '../components/orcamento/linhaDoTempo';
import { jaCelebrou, marcarCelebrado } from '../services/celebracoes';
import { toast } from '../components/feedback';
import { getOrcamento, getEmpresa, getDepoimentos, getRecibos, saveOrcamento, getVersoesOrcamento, getNextOrcamentoNumber, edicaoBloqueada } from '../database/database';
import { Orcamento, Empresa, Depoimento, Recibo, StatusOrcamento, OrcamentoVersao, EventoTrilhaCliente, STATUS_LABELS, STATUS_COLORS } from '../types';
import { formatCurrency } from '../utils/currency';
import { linkAvaliacaoUsavel } from '../utils/identidadeVisual';
import { formatDateTime, nowISO } from '../utils/date';
import { formatarDataBR } from '../utils/formatarData';
import { generateId } from '../utils/id';
import { baseParaNovoDocumento, type ModoNovoDocumento } from '../utils/novoDocumento';
import { exigirCadastroParaEnviar } from '../services/exigirCadastro';
import { compartilharPdfOrcamento, abrirWhatsApp } from '../utils/pdfGenerator';
import {
  montarMensagemCobranca,
  montarMensagemCobrancaLink,
  montarMensagemEnvioOrcamento,
  montarMensagemFollowUpOrcamento,
  montarMensagemLinkOrcamento,
  montarMensagemPedidoAvaliacao,
} from '../utils/mensagensOrcamento';
import { CartaoTermometro } from '../components/orcamento/Termometro';
import { DicaContextual } from '../components/DicaContextual';
import { useTermometro } from '../hooks/useTermometro';
import { termometroDe } from '../services/termometro';
import { mensagemDaAcao, temTermometro, type AcaoTermometro } from '../services/termometroRegra';
import { validaAteYmd } from '../services/radarFollowUpRegra';
import { PixCobrancaModal } from '../components/PixCobrancaModal';
import {
  escutarMudancasDoLink,
  gerarLinkOrcamento,
  linkConfigurado,
  puxarVersoesNuvemParaOrcamento,
  sincronizarStatusLinks,
  statusDoLink,
  trilhaDoLink,
} from '../services/clienteLink';
import { criarOSDeOrcamento } from '../services/ordemServico';
import { estornarPagamento, getReciboDoOrcamento, getStatusFinanceiro, registrarPagamento, totalRecebidoDoOrcamento } from '../services/pagamentos';
import { lerCobrancasEnviadas, registrarCobrancaEnviada } from '../services/registroEnvios';
import { avisoPix, enviadoHoje, prepararCobranca } from '../utils/cobrancaCliente';

/** Dias inteiros desde um ISO (proxy da aprovação, como no radar de cobrança). 0 se ilegível. */
function diasDesdeIso(iso?: string): number {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86_400_000)) : 0;
}
import { FinanceiroBadge } from '../components/FinanceiroBadge';
import { RegistrarPagamentoModal, type PagamentoForm } from '../components/RegistrarPagamentoModal';
import { EstornarPagamentoModal } from '../components/EstornarPagamentoModal';
import { usePlano } from '../hooks/usePlano';
import { usePermissao } from '../hooks/usePermissao';
import { RECURSO_REMOVE_MARCA } from '../services/planos';
import { track, Eventos } from '../services/analytics';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import {
  cancelarReservaEnvioOrcamento,
  confirmarEnvioOrcamento,
  obterEstadoOfertaComercial,
  reservarEnvioOrcamento,
} from '../services/cotaEnvios';
import { useContadorEnvios } from '../hooks/useContadorEnvios';
import { ContadorEnvios } from '../components/ContadorEnvios';
import { avisoTrialAutomatico } from '../services/ativacao';
import { avisar } from './desktop/dialogo';
import { recarregarPlanoGlobal } from '../hooks/usePlano';
import type { CanalEnvioOrcamento, ReservaEnvioOrcamento } from '../services/limitesComerciais';
import { CartaoRecursoPlano, useRecursoPlano } from '../components/RecursoPlano';
import { BotaoComoFunciona } from '../components/ajuda/ComoFunciona';
import { DicaDoRoteiro } from '../components/ajuda/DicaDoRoteiro';
import { eventoDoStatusOrcamento, type EventoDica } from '../services/dicasRoteiro';
import { registrarEventoDica } from '../services/dicasRoteiroStore';

// Recurso que remove o selo OLLI do PDF (Pro/Empresa). Frente C adiciona
// 'remove_olli_brand' ao type Recurso; codificamos contra o NOME do contrato.
// O cast mantém o call site válido até a união ser ampliada.

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'VisualizarOrcamento'>;

// Ações de status na ordem lógica do funil (mestre 13). Derivadas de uma única
// fonte (o type/labels/colors em ../types) para nunca divergir. 'visualizado' fica
// de fora da lista MANUAL: é um estado que o CLIENTE dispara pelo link (sync), não
// algo que o dono marca à mão — mas continua aparecendo no badge quando ocorre.
const STATUS_MANUAIS: StatusOrcamento[] = [
  'rascunho', 'enviado', 'em_negociacao', 'aguardando_assinatura',
  'aprovado', 'recusado', 'expirado', 'cancelado', 'convertido',
];

// O card de ação do topo muda com o status (achado B31: "Fechar negócio" aparecia
// em orçamento já aprovado e pago). Antes da aprovação: fechar. Depois: cobrar o
// saldo e, pago, cuidar do pós-venda. Recusado/expirado/cancelado não têm card
// (a revisão continua no topo).
const STATUS_PRE_APROVACAO: StatusOrcamento[] = [
  'rascunho', 'enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura',
];
const STATUS_POS_APROVACAO: StatusOrcamento[] = ['aprovado', 'convertido'];

/**
 * Espera para abrir um Modal depois que outro começou a sair (folha, pad de
 * assinatura, registrar pagamento). No iOS, o segundo pedido durante a saída do
 * primeiro é ignorado. Não é duração de animação: é folga de ciclo de vida.
 */
const ESPERA_MODAL_SAIR_MS = 450;

/**
 * Mensagem aberta no WhatsApp esperando o prestador dizer se SAIU. Abrir o WhatsApp
 * não é enviar: quem volta sem mandar não pode ficar com o orçamento "Enviado" nem
 * com a cota gasta, e a cobrança não pode constar como "enviada hoje".
 */
type EnvioPendente =
  | { tipo: 'orcamento'; reserva: ReservaEnvioOrcamento; semLink: boolean }
  | { tipo: 'cobranca'; ofertarCodigo: boolean; semLink: boolean };

export default function VisualizarOrcamentoScreen() {
  const nav = useNavigation<Nav>();
  // P0-09: "X de 5 envios" só em conta nova do Grátis, a partir do 3º envio (3 estados no hook).
  const contadorEstado = useContadorEnvios();
  const route = useRoute<Route>();
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  // Contraste garantido contra a superfície real do menu (ver corStatusOrcamento
  // em StatusBadge) — precisa de `cores`, por isso vive no componente e não como
  // constante de módulo.
  const STATUS_ACTIONS: Array<{ status: StatusOrcamento; label: string; corBase: string; color: string }> = useMemo(
    () => STATUS_MANUAIS.map(status => ({
      status,
      label: STATUS_LABELS[status],
      corBase: STATUS_COLORS[status],
      color: corStatusOrcamento(STATUS_COLORS[status], cores.surface),
    })),
    [cores.surface],
  );
  // Ink de contraste sobre `accentLight` (botão principal de fechar negócio).
  const textoSobreAccent = textoSobre(cores.accentLight);
  const { orcamentoId } = route.params;
  const { temAcesso } = usePlano();
  const { pode: podePapel, carregando: carregandoPapel } = usePermissao();
  const podeFinanceiro = !carregandoPapel && podePapel('ver_valores_agregados');
  // "Link do orçamento com pagamento na hora" (Pro). No Grátis o link sai sem o
  // Pix ("combine com o prestador"): o dono fica sabendo AQUI, perto do envio, e
  // não pelo cliente. Só quem decide o plano vê; carregando/liberado não desenham.
  const { estado: estadoLinkPagamento } = useRecursoPlano('link_pagamento');
  const avisaLinkPagamento = !carregandoPapel && podePapel('gerenciar_faturamento')
    && (estadoLinkPagamento === 'bloqueado' || estadoLinkPagamento === 'indeterminado' || estadoLinkPagamento === 'em_breve');
  // TERMÔMETRO (Pro): o que o cliente fez no link — abriu, voltou ao preço, tocou
  // em aprovar. Só lê quando o plano libera; os outros estados do plano mostram o
  // CartaoRecursoPlano (carregando / não confirmado / disponível no Pro).
  const { estado: estadoTermometroPlano } = useRecursoPlano('termometro_orcamento');
  const termometro = useTermometro(estadoTermometroPlano === 'liberado', orcamentoId);

  const [orc, setOrc] = useState<Orcamento | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  // O bloco de assinaturas do PDF inteiro é ligado por `exibirAssinatura` (o
  // switch "Exibir assinatura" do Step 4). Desligado, o documento não tem onde a
  // assinatura pousar — e assinatura gravada que não sai no PDF é um "assinado"
  // mentiroso. Então, nesse caso, simplesmente não oferecemos colher.
  const podeColherAssinatura = orc?.exibirAssinatura !== false;
  const assinaturaDoCliente = orc?.assinaturaClienteUri;
  const [depoimentos, setDepoimentos] = useState<Depoimento[]>([]);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [versoes, setVersoes] = useState<OrcamentoVersao[]>([]);
  const [trilha, setTrilha] = useState<EventoTrilhaCliente[]>([]);
  // 3 estados explícitos (nunca colapsar erro em vazio): a leitura do link
  // público está consultando, leu (com ou sem eventos) ou FALHOU. Com falha, a
  // linha do tempo diz "não deu para consultar" — nunca "o cliente não abriu".
  const [leituraLink, setLeituraLink] = useState<LeituraLink>('carregando');
  // Última cobrança enviada por aqui (1 toque). Leitura que falha = null (a tela só
  // deixa de mostrar "cobrança enviada hoje"; o botão continua).
  const [cobradoEm, setCobradoEm] = useState<string | null>(null);
  const [versoesAbertas, setVersoesAbertas] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [criandoOS, setCriandoOS] = useState(false);
  const [enviandoWhats, setEnviandoWhats] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [envioPendente, setEnvioPendente] = useState<EnvioPendente | null>(null);
  const [confirmandoEnvio, setConfirmandoEnvio] = useState(false);
  const [qrAberto, setQrAberto] = useState(false);
  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [estornoAberto, setEstornoAberto] = useState(false);
  const [estornando, setEstornando] = useState(false);
  // Folha aberta agora: compartilhar, ações secundárias (⋯), troca de status ou
  // os próximos passos logo depois de aprovar.
  const [folha, setFolha] = useState<'compartilhar' | 'mais' | 'status' | 'proximos' | null>(null);
  // Cabeçalho que encolhe: rolagem e o ponto em que o card do cabeçalho sai da tela.
  const rolagem = useSharedValue(0);
  const limiarCabecalho = useSharedValue(0);
  const aoRolar = useAnimatedScrollHandler((e) => {
    rolagem.set(e.contentOffset.y);
  });
  const [atualizando, setAtualizando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState(false);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  // Celebração em cena (aprovado/pago). Sai UMA vez por orçamento: ver `celebrar`.
  const [celebracao, setCelebracao] = useState<MotivoCelebracao | null>(null);
  // O que fazer quando o confete termina (ex.: oferecer a OS depois de aprovar).
  const depoisDaCelebracaoRef = useRef<(() => void) | null>(null);
  // Último retrato (status + quitado) que a tela VIU. A celebração só sai na
  // TRANSIÇÃO entre dois retratos — abrir um orçamento aprovado há meses não é festa.
  const retratoRef = useRef<RetratoCelebracao | null>(null);
  // Permissão de ver valores com que o retrato foi tirado. Ela resolve depois do
  // 1º load; sem isto, "não sabia do recibo" → "quitado" pareceria um pagamento novo.
  const retratoPodeFinanceiroRef = useRef<boolean | null>(null);
  // ASSINATURA DO CLIENTE — três estados, nunca dois:
  //   assinado      = `orc.assinaturaClienteUri` existe (só é setado DEPOIS de
  //                   `saveOrcamento` resolver, em `gravarAssinaturaCliente`);
  //   não assinado  = não existe, e nada falhou;
  //   falhou        = a última tentativa de GRAVAR não foi ao banco. É um estado
  //                   próprio de propósito: colapsá-lo em "não assinado" apagaria
  //                   da tela o fato de o cliente já ter assinado uma vez, e
  //                   colapsá-lo em "assinado" seria a falha virando sucesso.
  const [assinaturaAberta, setAssinaturaAberta] = useState(false);
  const [assinaturaFalhou, setAssinaturaFalhou] = useState(false);
  // Overlay de progresso — cobre a espera "silenciosa" de gerar/compartilhar
  // PDF ou link do cliente (mensagem varia conforme a ação em andamento).
  const [overlayInfo, setOverlayInfo] = useState<{ titulo: string; subtitulo: string } | null>(null);
  const statusAnteriorRef = useRef<StatusOrcamento | null>(null);
  // A assinatura foi pedida pela folha "Próximos passos": quando o pad sai da
  // frente (assinou ou desistiu), a folha volta com o que falta (OS, agenda).
  const proximosDepoisDaAssinaturaRef = useRef(false);
  // Abre "Próximos passos" a partir de callbacks estáveis (load), sem closure velha.
  const abrirProximosRef = useRef<() => void>(() => {});

  // Trilha do cliente (link público) — leitura VIVA, não bloqueia a tela: a
  // página já mostra os dados locais e a trilha aparece quando a nuvem responde.
  // Isolada em callback próprio para o botão "Tentar de novo" poder rechamar
  // sem precisar recarregar o orçamento inteiro.
  const loadTrilha = useCallback(() => {
    // Releitura com a trilha já lida não volta a "consultando": a linha do tempo
    // não pisca a cada foco. Só a primeira leitura e o "tentar de novo" mostram.
    setLeituraLink(atual => (atual === 'ok' ? 'ok' : 'carregando'));
    trilhaDoLink(orcamentoId)
      .then((eventos) => {
        setTrilha(eventos);
        setLeituraLink('ok');
      })
      .catch(() => setLeituraLink('erro'));
  }, [orcamentoId]);

  /**
   * Festa curta (confete) quando o orçamento FICA aprovado ou pago — uma vez por
   * orçamento e motivo, guardado no aparelho. Se já celebrou (ou a leitura falhou,
   * que conta como "já"), segue direto para o `depois`.
   */
  const celebrar = useCallback(async (motivo: MotivoCelebracao, depois?: () => void) => {
    if (await jaCelebrou(orcamentoId, motivo)) {
      depois?.();
      return;
    }
    void marcarCelebrado(orcamentoId, motivo);
    depoisDaCelebracaoRef.current = depois ?? null;
    setCelebracao(motivo);
  }, [orcamentoId]);

  /** Guarda o retrato novo e devolve a celebração que a mudança merece (ou null). */
  const registrarRetrato = useCallback((depois: RetratoCelebracao): MotivoCelebracao | null => {
    const motivo = celebracaoDaTransicao(retratoRef.current, depois);
    retratoRef.current = depois;
    return motivo;
  }, []);

  // Já há orçamento na tela: as próximas leituras (voltar de outra tela, puxar
  // para atualizar, resposta do cliente) não trocam a tela pelo spinner.
  const temDadosRef = useRef(false);

  const load = useCallback(async () => {
    const silencioso = temDadosRef.current;
    if (!silencioso) {
      setCarregando(true);
      setErroCarregamento(false);
    }
    setNaoEncontrado(false);
    try {
      const [o, e, deps, vs, recibosDoBanco] = await Promise.all([
        getOrcamento(orcamentoId), getEmpresa(), getDepoimentos(), getVersoesOrcamento(orcamentoId), podeFinanceiro ? getRecibos() : Promise.resolve<Recibo[]>([]),
      ]);
      if (!o) {
        temDadosRef.current = false;
        setOrc(null);
        setNaoEncontrado(true);
        return;
      }
      statusAnteriorRef.current = o.status;
      if (retratoPodeFinanceiroRef.current !== podeFinanceiro) {
        retratoPodeFinanceiroRef.current = podeFinanceiro;
        retratoRef.current = null;
      }
      // O cliente aprovou pelo link (o sync trouxe) ou o pagamento quitou em outra
      // tela: a transição aparece aqui, entre duas leituras.
      const motivo = registrarRetrato({
        status: o.status,
        quitado: podeFinanceiro && financeiroQuitado(getStatusFinanceiro(o, recibosDoBanco)),
      });
      // Aprovou pelo link com a tela aberta: depois da festa, os próximos passos.
      if (motivo) void celebrar(motivo, motivo === 'aprovado' ? () => abrirProximosRef.current() : undefined);
      setOrc(o);
      // Roteiro de dicas: o 1º envio, a 1ª abertura do link e a 1ª aprovação.
      const eventoDica = eventoDoStatusOrcamento(o.status);
      if (eventoDica) registrarEventoDica(eventoDica);
      setEmpresa(e);
      setDepoimentos(deps);
      setVersoes(vs);
      setRecibos(recibosDoBanco);
      temDadosRef.current = true;
      loadTrilha();
      lerCobrancasEnviadas().then(m => setCobradoEm(m[orcamentoId] ?? null)).catch(() => {});
    } catch {
      // Sem nada na tela, a falha vira a tela de erro. Com o orçamento já
      // exibido, ele FICA (é o último dado lido) e o aviso diz que não atualizou.
      if (silencioso) toast.erro('Não deu para atualizar o orçamento agora. Puxe a tela para tentar de novo.');
      else setErroCarregamento(true);
    } finally {
      setCarregando(false);
    }
  }, [orcamentoId, loadTrilha, podeFinanceiro, registrarRetrato, celebrar]);

  useFocusEffect(useCallback(() => {
    void load();
    // Com a tela em foco, cada mudança no link do cliente (abriu, aprovou, recusou,
    // avisou que pagou) traz o status de volta e relê. Sem Realtime na nuvem, não
    // chega evento e nada muda: o foco e o "puxar para atualizar" seguem valendo.
    // O worker grava "abriu" e "respondeu" em sequência: eventos em rajada viram
    // UMA releitura por vez (+ uma final, se chegou algo no meio).
    let relendo = false;
    let deNovo = false;
    const reler = () => {
      if (relendo) {
        deNovo = true;
        return;
      }
      relendo = true;
      void sincronizarStatusLinks()
        .then(() => load())
        .finally(() => {
          relendo = false;
          if (deNovo) {
            deNovo = false;
            reler();
          }
        });
    };
    const pararDeEscutar = escutarMudancasDoLink(orcamentoId, reler);
    // sincronizarStatusLinks() nunca lança — traz de volta o status que o
    // cliente deu pelo link público (visualizado/aprovado/recusado). Não é
    // aguardado: a tela abre instantaneamente com os dados locais, e só recarrega
    // se algo realmente mudou, igual ao padrão já usado em OrcamentosScreen.
    sincronizarStatusLinks().then(alterados => {
      if (alterados > 0) load();
    });
    // Versões criadas em OUTRO aparelho/pela equipe: puxa da nuvem e, se algo novo
    // chegou, atualiza só a lista de versões (sem recarregar a tela inteira).
    puxarVersoesNuvemParaOrcamento(orcamentoId).then(aplicadas => {
      if (aplicadas > 0) getVersoesOrcamento(orcamentoId).then(setVersoes).catch(() => {});
    }).catch(() => {});
    return pararDeEscutar;
  }, [orcamentoId, load]));

  /** Puxar para atualizar: traz a resposta do cliente pelo link e relê tudo. */
  async function atualizarTudo() {
    setAtualizando(true);
    try {
      await sincronizarStatusLinks();
      await load();
    } finally {
      setAtualizando(false);
    }
  }

  /**
   * Registra o envio (teste automático do Pro + funil). Falha do
   * registro NUNCA barra o envio (`sem_registro`). Exceção única: `cota_esgotada` do
   * limite do Grátis (P0-09), tratada logo abaixo (ver limitesComerciais.ts).
   */
  async function autorizarEntrega(canal: CanalEnvioOrcamento): Promise<ReservaEnvioOrcamento | null> {
    if (!orc) return null;
    const reserva = await reservarEnvioOrcamento(orc.id, canal);
    // P0-09: única recusa do contrato — conta nova do Grátis que usou o limite do mês.
    // Só o ENVIO para; o orçamento fica salvo e editável. Sem a palavra "bloqueado".
    if (!reserva.permitido) {
      const teto = reserva.limiteEnvios ?? 5;
      toast.info(
        `Você usou os ${teto} envios do Grátis deste mês. Seu orçamento está salvo. Os envios voltam no próximo mês; para enviar mais agora, veja os planos na tela Conta.`,
        { titulo: 'Limite do mês atingido' },
      );
      return null;
    }
    return reserva;
  }

  /**
   * Confirma o consumo da cota e, se o SERVIDOR liberou o teste do Pro neste envio
   * (1º envio do dono em conta elegível — migration 20260930120000), avisa com a
   * data de término. O aviso só sai quando a leitura da oferta DEPOIS da
   * confirmação diz "teste ativo": leitura que falhou não anuncia nada (a regra
   * mora em `avisoTrialAutomatico`). Não é oferta de compra — vale em qualquer
   * plataforma, inclusive nas lojas.
   */
  async function confirmarEntrega(reserva: ReservaEnvioOrcamento): Promise<void> {
    if (!reserva.requerConfirmacao) return;
    const confirmou = await confirmarEnvioOrcamento(orcamentoId, reserva.reservaToken);
    if (!confirmou) return;
    const oferta = await obterEstadoOfertaComercial().catch(() => null);
    const aviso = avisoTrialAutomatico(reserva, oferta);
    if (!aviso) return;
    track(Eventos.trialAutomaticoLiberado, { canal: 'app' });
    await recarregarPlanoGlobal().catch(() => {});
    // `avisar` (DialogoDesktopHost) e não Alert.alert: o Alert do react-native-web é
    // mudo, e o app também roda no navegador — o aviso não pode sumir lá.
    avisar(aviso.titulo, aviso.mensagem);
  }

  // Toque duplo: a porta do cadastro (`await exigirCadastroParaEnviar`) abre uma
  // janela ANTES de `sharing`/`enviandoWhats`/`cobrando` valerem (o estado só muda no
  // próximo render) — dois toques reservariam dois envios. Trava síncrona que cobre
  // o handler inteiro, compartilhada pelos caminhos de envio desta tela.
  const envioOcupadoRef = useRef(false);
  async function comTravaDeEnvio(fn: () => Promise<void>): Promise<void> {
    if (envioOcupadoRef.current) return;
    envioOcupadoRef.current = true;
    try {
      await fn();
    } finally {
      envioOcupadoRef.current = false;
    }
  }

  // Com a trava de toque duplo (ver `comTravaDeEnvio`).
  const handleShare = () => comTravaDeEnvio(handleShareAgora);
  async function handleShareAgora() {
    if (!orc || sharing) return;
    // Cadastro do negócio incompleto segura o PDF (o app não fecha mais por isso).
    if (!(await exigirCadastroParaEnviar('orcamento'))) return;
    if (!empresa) return;
    setSharing(true);
    setOverlayInfo({ titulo: 'Gerando seu orçamento...', subtitulo: 'Deixando bonito para o cliente...' });
    let reserva: ReservaEnvioOrcamento | null = null;
    try {
      reserva = await autorizarEntrega('pdf');
      if (!reserva) return;
      await compartilharPdfOrcamento(orc, empresa, depoimentos, orc.corMarca, {
        removerMarca: temAcesso(RECURSO_REMOVE_MARCA),
      });
      await confirmarEntrega(reserva);
      void registrarAtividadeUsuario('orcamento_enviado');
      if (orc.status === 'rascunho') await updateStatus('enviado');
    } catch (e: any) {
      if (reserva?.requerConfirmacao) {
        await cancelarReservaEnvioOrcamento(orc.id, reserva.reservaToken);
      }
      // Quando o compartilhamento não está disponível no dispositivo, a
      // mensagem já vem específica (e diz onde o PDF foi salvo); nos demais
      // casos cai no texto genérico.
      toast.erro(e?.message || 'Não foi possível gerar o PDF.');
    } finally {
      // SEMPRE volta o loading — inclusive na web, onde a impressão é assíncrona.
      setSharing(false);
      setOverlayInfo(null);
    }
  }

  /**
   * Envia o orçamento no WhatsApp DO CLIENTE com o LINK de aprovação (o cliente
   * confere e aprova com um toque; o status volta sozinho). Sem nuvem/login, ou se
   * o link falhar agora, cai no texto com os dados e "responda aprovado".
   *
   * Três etapas com tratamento próprio (antes um try só fazia a falha de uma
   * parecer falha de outra): registrar o envio, abrir o WhatsApp e, só quando o
   * prestador CONFIRMAR que mandou ("Conseguiu enviar?"), confirmar o registro e
   * marcar "Enviado". Abrir o WhatsApp não é enviar.
   */
  // Com a trava de toque duplo (ver `comTravaDeEnvio`).
  const handleWhatsApp = () => comTravaDeEnvio(handleWhatsAppAgora);
  async function handleWhatsAppAgora() {
    if (!orc || enviandoWhats) return;
    const telefone = (orc.clienteTelefone || '').trim();
    if (!telefone) {
      toast.info(`Cadastre o WhatsApp de ${orc.clienteNome} para enviar por aqui.`);
      return;
    }
    if (!(await exigirCadastroParaEnviar('orcamento'))) return;
    setEnviandoWhats(true);
    let reserva: ReservaEnvioOrcamento | null = null;
    try {
      reserva = await autorizarEntrega('whatsapp');
    } catch {
      setEnviandoWhats(false);
      toast.erro('Confira a conexão e tente de novo.', { titulo: 'Não foi possível preparar o envio' });
      return;
    }
    if (!reserva) {
      setEnviandoWhats(false);
      return;
    }

    let mensagem = montarMensagemEnvioOrcamento(orc, empresa);
    let semLink = false;
    if (linkConfigurado()) {
      setOverlayInfo({ titulo: 'Gerando o link do cliente...', subtitulo: 'Preparando a página de aprovação...' });
      try {
        const url = await gerarLinkOrcamento(orc, empresa);
        mensagem = montarMensagemLinkOrcamento(orc, empresa, url);
      } catch {
        // O texto sem link ainda fecha negócio ("responda aprovado"); a folha de
        // confirmação conta que foi sem link, para ninguém achar que foi com.
        semLink = true;
      } finally {
        setOverlayInfo(null);
      }
    }

    try {
      await abrirWhatsApp(telefone, mensagem);
    } catch {
      if (reserva.requerConfirmacao) await cancelarReservaEnvioOrcamento(orc.id, reserva.reservaToken);
      toast.erro('Confira se o WhatsApp está instalado e tente de novo.', { titulo: 'Não consegui abrir o WhatsApp' });
      return;
    } finally {
      setEnviandoWhats(false);
    }
    setEnvioPendente({ tipo: 'orcamento', reserva, semLink });
  }

  /** Resposta do "Conseguiu enviar?". Nunca lança. */
  async function responderEnvio(enviou: boolean) {
    const pendente = envioPendente;
    if (!pendente || !orc || confirmandoEnvio) return;
    if (pendente.tipo === 'orcamento') {
      if (!enviou) {
        setEnvioPendente(null);
        if (pendente.reserva.requerConfirmacao) {
          await cancelarReservaEnvioOrcamento(orc.id, pendente.reserva.reservaToken);
        }
        return;
      }
      setConfirmandoEnvio(true);
      try {
        await confirmarEntrega(pendente.reserva).catch(() => {});
        void registrarAtividadeUsuario('orcamento_enviado');
        // updateStatus nunca lança e, se não gravar, avisa e mantém o status antigo.
        if (orc.status === 'rascunho') await updateStatus('enviado');
      } finally {
        setConfirmandoEnvio(false);
        setEnvioPendente(null);
      }
      return;
    }
    // Cobrança
    setEnvioPendente(null);
    if (!enviou) return;
    try {
      await registrarCobrancaEnviada(orc.id);
      setCobradoEm(new Date().toISOString());
    } catch {
      toast.erro('A mensagem saiu, mas o registro de "cobrado hoje" não foi gravado agora.', { titulo: 'Não consegui registrar a cobrança' });
    }
    // Sem link de pagamento, o código Pix vai numa SEGUNDA mensagem, sozinho.
    // Espera a folha terminar de fechar: no iOS, abrir um Modal enquanto outro
    // ainda está saindo faz o segundo simplesmente não aparecer.
    if (pendente.ofertarCodigo) setTimeout(() => setQrAberto(true), ESPERA_MODAL_SAIR_MS);
  }

  // Com a trava de toque duplo (ver `comTravaDeEnvio`).
  const handleLinkCliente = () => comTravaDeEnvio(handleLinkClienteAgora);
  async function handleLinkClienteAgora() {
    if (!orc) return;
    if (!(await exigirCadastroParaEnviar('orcamento'))) return;
    if (!linkConfigurado()) {
      toast.info(
        'Para enviar um link onde o cliente aprova com 1 toque, ative o backup na nuvem (tela Conta). Por enquanto, use o WhatsApp ou o PDF.',
        { titulo: 'Link do cliente' },
      );
      return;
    }
    setLinking(true);
    setOverlayInfo({ titulo: 'Gerando o link do cliente...', subtitulo: 'Preparando a página de aprovação...' });
    let reserva: ReservaEnvioOrcamento | null = null;
    try {
      reserva = await autorizarEntrega('link');
      if (!reserva) return;
      const url = await gerarLinkOrcamento(orc, empresa);
      await Share.share({
        message: montarMensagemLinkOrcamento(orc, empresa, url),
      });
      await confirmarEntrega(reserva);
      void registrarAtividadeUsuario('orcamento_enviado');
      if (orc.status === 'rascunho') await updateStatus('enviado');
    } catch (e: any) {
      if (reserva?.requerConfirmacao) {
        await cancelarReservaEnvioOrcamento(orc.id, reserva.reservaToken);
      }
      toast.erro(e?.message ?? 'Tente novamente.', { titulo: 'Não consegui gerar o link' });
    } finally {
      setLinking(false);
      setOverlayInfo(null);
    }
  }

  /**
   * Muda o status e SÓ ENTÃO reflete na tela. Nunca lança: os três chamadores do
   * fluxo de envio (`await updateStatus('enviado')`) estão dentro de try/catch que
   * dizem "não consegui gerar o link" — um throw daqui seria contado como falha do
   * link, que funcionou; e o do menu de status (`onPress`) é promessa solta, que
   * viraria unhandled rejection.
   *
   * Se a gravação falhar, a tela FICA NO STATUS ANTIGO de propósito. Pintar
   * "aprovado" sobre um banco que ainda diz "enviado" é a falha virando valor: o
   * usuário para de cobrar, o painel nunca recebe, e ninguém fica sabendo.
   * `saveOrcamento` deixa passar a troca de status em qualquer situação (compara
   * `impressaoComercial`, que ignora campos voláteis) — então uma falha aqui é
   * técnica de verdade, e "tente de novo" é a orientação honesta.
   */
  async function updateStatus(s: StatusOrcamento, opcoes?: { avisar?: boolean }) {
    if (!orc) return;
    const updated = { ...orc, status: s, atualizadoEm: nowISO() };
    try {
      await saveOrcamento(updated);
    } catch (e: any) {
      toast.erro(
        e?.message ?? 'O orçamento continua como estava. Tente novamente em instantes.',
        { titulo: 'Não consegui mudar o status' },
      );
      return;
    }
    const acabouDeAprovar = s === 'aprovado' && statusAnteriorRef.current !== 'aprovado';
    if (acabouDeAprovar) track(Eventos.quoteApproved, { valorTotal: updated.valorTotal });
    statusAnteriorRef.current = s;
    setOrc(updated);
    const motivo = registrarRetrato({ status: s, quitado: retratoRef.current?.quitado ?? false });
    // Aprovou AGORA (não já vinha aprovado): depois da festa, os próximos passos
    // na hora — poupa os 4-5 toques de ir até Ordens > + > De um orçamento.
    const depois = acabouDeAprovar ? oferecerProximosPassos : undefined;
    if (motivo) void celebrar(motivo, depois);
    else depois?.();
    if (opcoes?.avisar && !motivo) toast.sucesso(`Status alterado para ${STATUS_LABELS[s]}.`);
  }

  /** O confete terminou: segue para o que estava esperando por ele (se houver). */
  function finalizarCelebracao() {
    setCelebracao(null);
    const depois = depoisDaCelebracaoRef.current;
    depoisDaCelebracaoRef.current = null;
    depois?.();
  }

  // Logo depois de APROVAR (à mão ou pelo link, com a tela aberta), a aprovação
  // vira a folha "Próximos passos": colher a assinatura (quando falta), criar a
  // OS, agendar e registrar pagamento — o prestador está com o cliente na frente
  // e o aparelho na mão. Substitui a antiga pergunta "Criar OS?" e o pad que
  // abria sozinho: agora é ele quem escolhe, e "Depois" não perde nada (tudo
  // continua no card do topo e no ⋯).
  function oferecerProximosPassos() {
    // Outra folha aberta (o cliente aprovou pelo link enquanto o prestador
    // mexia no ⋯): não atropela — Modal trocado por Modal no meio da saída some no iOS.
    setFolha(atual => (atual === null ? 'proximos' : atual));
  }
  abrirProximosRef.current = oferecerProximosPassos;

  /** "Cliente assinar agora" pela folha de próximos passos: ao sair do pad, a folha volta. */
  function assinarPelosProximos() {
    proximosDepoisDaAssinaturaRef.current = true;
    setAssinaturaAberta(true);
  }

  /**
   * GRAVA a assinatura do cliente e só então reflete na tela.
   *
   * Contrato com <AssinaturaClienteModal>: esta função LANÇA quando não gravou —
   * é a rejeição que mantém o pad aberto com o desenho intacto, mostrando o erro.
   * Trocar o `throw` por um Alert silencioso aqui recria exatamente o bug que a
   * casa já teve em outro caminho: a falha aparecendo como sucesso.
   *
   * `assinaturaClienteUri`/`dataAssinaturaCliente` estão em
   * CAMPOS_VOLATEIS_ORCAMENTO (database.ts): assinar é AÇÃO DO CLIENTE sobre a
   * proposta, não edição do dono — passa em qualquer status e não congela versão
   * falsa. É por isso que dá para assinar um orçamento já aprovado, que é
   * justamente quando o cliente assina.
   */
  async function gravarAssinaturaCliente(dataUri: string, assinadoEmISO: string) {
    if (!orc) throw new Error('Orçamento não carregado. Abra o orçamento de novo.');
    const atualizado: Orcamento = {
      ...orc,
      assinaturaClienteUri: dataUri,
      dataAssinaturaCliente: assinadoEmISO,
      atualizadoEm: nowISO(),
    };
    try {
      await saveOrcamento(atualizado);
    } catch (e) {
      setAssinaturaFalhou(true);
      throw e;
    }
    setOrc(atualizado);
    setAssinaturaFalhou(false);
    fecharAssinatura();
  }

  function fecharAssinatura() {
    setAssinaturaAberta(false);
    if (proximosDepoisDaAssinaturaRef.current) {
      proximosDepoisDaAssinaturaRef.current = false;
      // Espera o pad terminar de sair: no iOS, um Modal pedido enquanto outro
      // ainda está saindo simplesmente não aparece.
      setTimeout(() => setFolha('proximos'), ESPERA_MODAL_SAIR_MS);
    }
  }

  /**
   * Cria o documento novo e abre no editor. "Duplicar" = rascunho independente
   * (outro cliente, outra obra); "Criar revisão" = documento já enviado/aceito não
   * é sobrescrito: nasce outro rascunho que aponta para o original. A base é a
   * mesma da lista (`baseParaNovoDocumento`): sem nenhuma assinatura, sem as datas
   * do documento antigo, validade recalculada a partir de hoje.
   */
  async function criarDocumentoNovo(modo: ModoNovoDocumento) {
    if (!orc || duplicando) return;
    setDuplicando(true);
    setOverlayInfo({
      titulo: modo === 'revisao' ? 'Criando a revisão...' : 'Duplicando o orçamento...',
      subtitulo: 'Já abre no editor.',
    });
    try {
      const numero = await getNextOrcamentoNumber();
      const novo = baseParaNovoDocumento({
        origem: orc,
        modo,
        id: generateId(),
        numero,
        gerarId: generateId,
        empresa,
      });
      await saveOrcamento(novo);
      nav.navigate('EditarOrcamento', { orcamentoId: novo.id });
    } catch (e: any) {
      toast.erro(
        e?.message || (modo === 'revisao'
          ? 'Não foi possível criar a revisão deste orçamento.'
          : 'Não foi possível duplicar o orçamento.'),
      );
    } finally {
      setDuplicando(false);
      setOverlayInfo(null);
    }
  }

  const handleDuplicar = () => criarDocumentoNovo('duplicar');
  const handleCriarRevisao = () => criarDocumentoNovo('revisao');

  async function salvarPagamento(form: PagamentoForm) {
    if (!orc) return;
    if (!podeFinanceiro) {
      toast.erro('Somente o dono ou um papel financeiro autorizado pode registrar recebimentos.', { titulo: 'Acesso restrito' });
      return;
    }
    await registrarPagamento({ orcamento: orc, ...form });
    const atualizados = await getRecibos();
    setRecibos(atualizados);
    setPagamentoAberto(false);
    const estado = getStatusFinanceiro(orc, atualizados);
    const quitou = financeiroQuitado(estado);
    const motivo = registrarRetrato({ status: orc.status, quitado: quitou });
    // O modal de pagamento ainda está saindo: a festa espera ele sumir.
    if (motivo) setTimeout(() => { void celebrar(motivo); }, ESPERA_MODAL_SAIR_MS);
    if (quitou) {
      toast.sucesso('Se quiser, gere ou reenvie o recibo agora.', {
        titulo: 'Orçamento quitado',
        acao: { rotulo: 'Recibo', aoTocar: () => nav.navigate('EmitirRecibo', { orcamentoId: orc.id }) },
      });
    } else {
      toast.sucesso('O saldo continua aberto e o próximo recebimento pode ser registrado depois.', { titulo: 'Recebimento registrado' });
    }
  }

  async function salvarEstorno(motivo: string) {
    if (!podeFinanceiro) return;
    const recibo = recibos.find((item) => item.orcamentoId === orc?.id && item.pagamentoId && !item.estornadoEm);
    if (!recibo?.pagamentoId) throw new Error('Este recebimento ainda não tem confirmação no ledger remoto.');
    setEstornando(true);
    try {
      await estornarPagamento(recibo.pagamentoId, motivo);
      const atualizados = await getRecibos();
      setRecibos(atualizados);
      setEstornoAberto(false);
      if (orc) registrarRetrato({ status: orc.status, quitado: financeiroQuitado(getStatusFinanceiro(orc, atualizados)) });
      toast.sucesso('O evento continua no histórico e o saldo do orçamento foi recalculado.', { titulo: 'Recebimento estornado' });
    } finally {
      setEstornando(false);
    }
  }

  // Converte este orçamento aprovado numa ordem de serviço — mesma função já
  // usada pelo fluxo "De um orçamento aprovado" em OrdemServicoScreen, chamada
  // direto daqui para poupar os 4-5 toques do caminho normal — e abre a OS criada.
  async function handleCriarOS() {
    if (!orc || criandoOS) return;
    setCriandoOS(true);
    setOverlayInfo({ titulo: 'Criando a ordem de serviço...', subtitulo: 'Já abre a OS em seguida.' });
    try {
      const os = await criarOSDeOrcamento(orc.id);
      // Abre a OS que acabou de nascer (antes levava à lista e o prestador tinha
      // que procurá-la).
      nav.navigate('OrdemServico', { ordemId: os.id });
    } catch (e: any) {
      toast.erro(e?.message ?? 'Não consegui criar a OS agora.', { titulo: 'A OS não foi criada' });
    } finally {
      setCriandoOS(false);
      setOverlayInfo(null);
    }
  }

  // Abre a Agenda já criando um agendamento ligado a este orçamento/cliente.
  function agendarVisita() {
    if (!orc) return;
    nav.navigate('Tabs', {
      screen: 'Agenda',
      params: {
        novoParaClienteId: orc.clienteId || undefined,
        novoParaClienteNome: orc.clienteNome,
        novoParaOrcamentoId: orc.id,
        novoEndereco: orc.clienteEndereco || undefined,
        novoTitulo: `Orçamento nº ${formatarNumeroExibicao(orc.numero)}`,
      },
    });
  }

  // Abre os orçamentos deste cliente (CRM). Sem clienteId (orçamento avulso) só avisa.
  function verCliente() {
    if (!orc) return;
    if (!orc.clienteId) {
      toast.info('Este orçamento não está vinculado a um cliente cadastrado.');
      return;
    }
    nav.navigate('Orcamentos', { clienteId: orc.clienteId, clienteNome: orc.clienteNome });
  }

  if (naoEncontrado) {
    return (
      <View style={{ flex: 1, backgroundColor: cores.background }}>
        <GradientHeader title="Orçamento" onBack={() => goBackOrHome(nav)} compact />
        <EmptyState
          icon="file-remove-outline"
          title="Orçamento não encontrado"
          subtitle="Este orçamento não existe mais ou foi removido."
          actionLabel="Voltar"
          onAction={() => goBackOrHome(nav)}
        />
      </View>
    );
  }

  if (erroCarregamento || (!carregando && !orc)) {
    return (
      <View style={{ flex: 1, backgroundColor: cores.background }}>
        <GradientHeader title="Orçamento" onBack={() => goBackOrHome(nav)} compact />
        <EmptyState
          icon="cloud-alert-outline"
          title="Não foi possível carregar"
          subtitle="Seus dados continuam seguros. Verifique a conexão e tente novamente."
          actionLabel="Tentar novamente"
          onAction={() => { void load(); }}
        />
      </View>
    );
  }

  if (carregando) {
    // Esqueleto no formato da tela (cabeçalho, ação, linha do tempo): a página
    // "acende" no lugar em vez de pular de um spinner para o conteúdo.
    return (
      <View style={{ flex: 1, backgroundColor: cores.background }} accessibilityLabel="Carregando orçamento">
        <GradientHeader title="Orçamento" onBack={() => goBackOrHome(nav)} compact />
        <View style={{ padding: Spacing.base, gap: 12 }}>
          <Skeleton height={148} radius={BorderRadius.xl} />
          <Skeleton height={176} radius={BorderRadius.xl} />
          <Skeleton height={220} radius={BorderRadius.xl} />
        </View>
      </View>
    );
  }

  if (!orc) return null;

  const Row = ({ label, value }: { label: string; value?: string }) =>
    value ? (
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    ) : null;

  const fechamentoChecks = [
    { label: 'Logo da empresa', ok: !!empresa?.logoUri },
    { label: 'Validade definida', ok: !!orc.validadeOrcamento },
    { label: 'Garantia clara', ok: !!orc.garantia },
    { label: 'Itens e valores revisados', ok: orc.itens.length > 0 && orc.valorTotal > 0 },
    { label: 'Aprovação ativa', ok: orc.exibirAprovacao !== false || linkConfigurado() },
  ];
  const fechamentoOk = fechamentoChecks.filter(c => c.ok).length;
  // Assinatura ainda por colher neste documento (vai para "Próximos passos").
  const precisaAssinatura = podeColherAssinatura && !orc.assinaturaClienteUri;

  // Cobrança com 1 toque: só quando o comercial é recebível e ainda há saldo. O
  // saldo (valor − recebido) é o que vai na mensagem e no Pix — nunca o total cheio
  // para quem já pagou parte.
  const statusFin = podeFinanceiro ? getStatusFinanceiro(orc, recibos) : null;
  const saldoEmAberto = Math.max(0, (orc.valorTotal || 0) - totalRecebidoDoOrcamento(orc.id, recibos));
  const cobrancaPronta = (statusFin === 'aguardando_pagamento' || statusFin === 'parcial') && saldoEmAberto > 0.005
    ? prepararCobranca({
        orcamento: orc,
        empresa,
        diasParado: diasDesdeIso(orc.atualizadoEm || orc.criadoEm),
        valorEmAberto: saldoEmAberto,
      })
    : null;

  // Qual card de ação o topo mostra (ver STATUS_PRE_APROVACAO).
  const servicoPago = statusFin === 'pago' || statusFin === 'recibo_emitido';
  const linkAvaliacao = linkAvaliacaoUsavel(empresa?.linkGoogleAvaliacoes);
  const cardAcao: 'fechar' | 'cobrar' | 'pos_venda' | null = STATUS_PRE_APROVACAO.includes(orc.status)
    ? 'fechar'
    : cobrancaPronta
      ? 'cobrar'
      : STATUS_POS_APROVACAO.includes(orc.status)
        ? 'pos_venda'
        : null;

  // Linha do tempo: status local + trilha do link + recebimentos (ver linhaDoTempo.ts).
  const etapasLinha = montarLinhaDoTempo({
    status: orc.status,
    criadoEm: orc.criadoEm,
    decididoEm: orc.decididoEm,
    trilha,
    leituraLink,
    financeiro: podeFinanceiro
      ? {
          estado: statusFin,
          pagoEm: getReciboDoOrcamento(orc.id, recibos)?.dataRecebimento,
          resumoParcial: `Recebido ${formatCurrency(totalRecebidoDoOrcamento(orc.id, recibos))} de ${formatCurrency(orc.valorTotal)}`,
        }
      : null,
  });

  // Termômetro deste orçamento (regra pura em termometroRegra.ts). `null` = ainda sem leitura.
  const estadoTermometro = termometro.leitura ? termometroDe(orc, termometro.leitura) : null;
  const mostraTermometro = temTermometro(orc.status);

  /** Onde o card do cabeçalho termina na rolagem: dali para baixo, a faixa compacta aparece. */
  function aoMedirCabecalho(e: LayoutChangeEvent) {
    const { y, height } = e.nativeEvent.layout;
    limiarCabecalho.set(y + height);
  }

  /**
   * Cobra o saldo no WhatsApp do cliente com o LINK de pagamento
   * (`.../o/<token>#pagar`) em vez do código Pix cru no meio do texto (achado B22:
   * o cliente copiava a mensagem inteira e o banco recusava). Na página ele vê o
   * QR e copia só o código.
   *
   * Sem link (sem nuvem/login, ou falhou agora): a mensagem vai sem o código e,
   * depois do "Conseguiu enviar?", o QR abre para mandar o código SOZINHO numa
   * segunda mensagem. Nunca o código no meio do texto.
   */
  /**
   * A ação que o termômetro sugeriu. Reenviar usa o MESMO envio pelo WhatsApp com
   * o link (reaproveita o token, confirma "Conseguiu enviar?"); proposta vencida
   * vira revisão; o resto abre o WhatsApp do cliente com o texto já escrito pelo
   * sinal (o prestador revisa e envia — nada sai sozinho).
   */
  async function agirPeloTermometro(acao: AcaoTermometro) {
    if (!orc) return;
    if (acao.tipo === 'reenviar') {
      await handleWhatsApp();
      return;
    }
    if (acao.tipo === 'renovar') {
      await handleCriarRevisao();
      return;
    }
    const telefone = (orc.clienteTelefone || '').trim();
    if (!telefone) {
      toast.info(`Cadastre o WhatsApp de ${orc.clienteNome} para falar por aqui.`);
      return;
    }
    const mensagem =
      mensagemDaAcao(acao.tipo, orc, {
        validaAte: validaAteYmd(orc),
        contato: empresa?.telefone || empresa?.whatsapp || null,
      }) ?? montarMensagemFollowUpOrcamento(orc, empresa);
    try {
      await abrirWhatsApp(telefone, mensagem);
    } catch {
      toast.erro('Confira se o WhatsApp está instalado e tente de novo.', { titulo: 'Não consegui abrir o WhatsApp' });
    }
  }

  function ligarParaCliente() {
    const digitos = (orc?.clienteTelefone || '').replace(/\D/g, '');
    if (!digitos) return;
    Linking.openURL(`tel:${digitos}`).catch(() => {
      toast.erro('Não consegui abrir o discador agora.', { titulo: 'Ligar' });
    });
  }

  // Com a trava de toque duplo (ver `comTravaDeEnvio`).
  const handleCobrar = () => comTravaDeEnvio(handleCobrarAgora);
  async function handleCobrarAgora() {
    if (!orc || !cobrancaPronta || cobrando) return;
    const telefone = (orc.clienteTelefone || '').trim();
    if (!telefone) {
      toast.info(`Cadastre o WhatsApp de ${orc.clienteNome} para cobrar por aqui.`, { titulo: 'Sem telefone' });
      return;
    }
    const comPix = cobrancaPronta.situacaoPix === 'com_pix';
    const dias = diasDesdeIso(orc.atualizadoEm || orc.criadoEm);
    const saldo = cobrancaPronta.valor + 0.005 < orc.valorTotal ? cobrancaPronta.valor : undefined;
    // A cobrança com link leva os dados do negócio (página do cliente): mesma porta do envio.
    if (!(await exigirCadastroParaEnviar('orcamento'))) return;
    setCobrando(true);
    let mensagem = montarMensagemCobranca(orc, dias, undefined, saldo);
    let semLink = true;
    if (linkConfigurado()) {
      setOverlayInfo({ titulo: 'Preparando a cobrança...', subtitulo: 'Gerando o link de pagamento...' });
      try {
        // A página pública só mostra o Pix quando o CLIENTE aprovou pelo link
        // (status 'aprovado' lá), e o QR dela é do TOTAL. Então o link só vai
        // quando o cliente aprovou por ele e, com Pix, quando não há pagamento
        // parcial — senão o cliente veria "Aprovar" de novo ou pagaria a mais.
        // Fora disso: texto sem código + o código sozinho na mensagem seguinte.
        const link = await statusDoLink(orc.id);
        if (link?.status !== 'aprovado' || (comPix && saldo !== undefined)) throw new Error('link_nao_serve');
        const url = await gerarLinkOrcamento(orc, empresa);
        mensagem = montarMensagemCobrancaLink(orc, dias, `${url}#pagar`, { comPix, valorEmAberto: saldo });
        semLink = false;
      } catch {
        // segue sem link (ver acima)
      } finally {
        setOverlayInfo(null);
      }
    }
    try {
      await abrirWhatsApp(telefone, mensagem);
    } catch {
      toast.erro('Confira se o WhatsApp está instalado e tente de novo.', { titulo: 'Não consegui abrir o WhatsApp' });
      return;
    } finally {
      setCobrando(false);
    }
    setEnvioPendente({ tipo: 'cobranca', ofertarCodigo: semLink && comPix, semLink });
  }

  /** Pós-venda: pede a avaliação no Google com o link do cadastro (Meu Negócio). */
  async function handlePedirAvaliacao() {
    if (!orc) return;
    const link = linkAvaliacaoUsavel(empresa?.linkGoogleAvaliacoes);
    const telefone = (orc.clienteTelefone || '').trim();
    if (!link) {
      nav.navigate('MeuNegocio');
      return;
    }
    if (!telefone) {
      toast.info(`Cadastre o WhatsApp de ${orc.clienteNome} para pedir a avaliação por aqui.`, { titulo: 'Sem telefone' });
      return;
    }
    try {
      await abrirWhatsApp(telefone, montarMensagemPedidoAvaliacao(orc.clienteNome, link, empresa));
    } catch {
      toast.erro('Confira se o WhatsApp está instalado e tente de novo.', { titulo: 'Não consegui abrir o WhatsApp' });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: cores.background }}>
      <GradientHeader
        title={`Orçamento nº ${formatarNumeroExibicao(orc.numero)}`}
        subtitle={orc.clienteNome}
        onBack={() => goBackOrHome(nav)}
        compact
        right={(
          <View style={styles.topoAcoes}>
            <BotaoComoFunciona tela="detalhe_orcamento" cor={gradientes.sobreHeader} />
            <BotaoTopo
              icon="share-variant"
              label="Compartilhar orçamento"
              onPress={() => setFolha('compartilhar')}
              loading={sharing || linking || enviandoWhats}
            />
            <BotaoTopo icon="dots-horizontal" label="Mais ações" onPress={() => setFolha('mais')} />
          </View>
        )}
      />

      <View style={styles.palco}>
        <Animated.ScrollView
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40 }}
          onScroll={aoRolar}
          scrollEventThrottle={16}
          refreshControl={(
            <RefreshControl
              refreshing={atualizando}
              onRefresh={() => { void atualizarTudo(); }}
              tintColor={cores.accentLight}
              colors={[cores.accentLight]}
              progressBackgroundColor={cores.surface}
            />
          )}
        >
          {orc.revisaoDeNumero ? (
            <View style={styles.revisaoAviso}>
              <MaterialCommunityIcons name="file-document-edit-outline" size={21} color={cores.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.revisaoTitulo}>Revisão do orçamento nº {formatarNumeroExibicao(orc.revisaoDeNumero)}</Text>
                <Text style={styles.revisaoTexto}>
                  Este é o documento atualizado. O original continua preservado; envie este orçamento ao cliente.
                </Text>
              </View>
            </View>
          ) : null}
          {orc.editadoEm ? (
            <Text style={styles.editadoEm}>Conteúdo editado em {formatDateTime(orc.editadoEm)}</Text>
          ) : null}

          {/* CABEÇALHO — status animado (toque troca o status), número, total e
              a frase "em que pé está". */}
          <View onLayout={aoMedirCabecalho}>
            <Aparecer>
              <CabecalhoStatus
                status={orc.status}
                quando={`Criado em ${formatDateTime(orc.criadoEm)}`}
                total={podeFinanceiro ? orc.valorTotal : null}
                proximoPasso={proximoPassoDoStatus(orc.status, statusFin)}
                aoTocarStatus={() => setFolha('status')}
              >
                Orçamento nº {formatarNumeroExibicao(orc.numero)}
              </CabecalhoStatus>
            </Aparecer>
          </View>

          {/* Dica do momento (roteiro I5): só a do status atual deste orçamento. */}
          {eventoDoStatusOrcamento(orc.status) ? (
            <DicaDoRoteiro
              local="detalhe"
              contexto={[eventoDoStatusOrcamento(orc.status) as EventoDica]}
              style={{ marginBottom: Spacing.md }}
            />
          ) : null}

          {/* CARD DE AÇÃO POR STATUS — antes da aprovação, fechar; com saldo aberto,
              cobrar; aprovado e sem saldo, o próximo passo (agendar, avaliação). */}
          {cardAcao === 'fechar' && (
            <OlliCard style={styles.closeCard}>
              <View style={styles.closeTop}>
                <View style={styles.closeIcon}>
                  <MaterialCommunityIcons name="handshake-outline" size={24} color={cores.accentLight} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.closeEyebrow}>Fechar negócio</Text>
                  <Text style={styles.closeTitle}>
                    {orc.status === 'rascunho' ? 'Envie uma proposta pronta para aprovação' : 'A proposta está com o cliente'}
                  </Text>
                  <Text style={styles.closeSub}>
                    {fechamentoOk}/{fechamentoChecks.length} sinais de confiança configurados
                  </Text>
                </View>
              </View>

              <OlliPressable
                style={styles.closePrimary}
                onPress={handleWhatsApp}
                haptic="light"
                disabled={enviandoWhats}
                accessibilityLabel={enviandoWhats ? 'Preparando o envio no WhatsApp' : undefined}
              >
                {enviandoWhats
                  ? <ActivityIndicator size="small" color={textoSobreAccent} />
                  : <MaterialCommunityIcons name="whatsapp" size={20} color={textoSobreAccent} />}
                <Text style={styles.closePrimaryText}>
                  {orc.status === 'rascunho' ? 'Enviar no WhatsApp' : 'Reenviar no WhatsApp'}
                </Text>
              </OlliPressable>

              <View style={styles.closeActions}>
                <CloseAction
                  icon="share-variant"
                  label="Link ou PDF"
                  onPress={() => setFolha('compartilhar')}
                  loading={linking || sharing}
                />
                <CloseAction icon="calendar-plus" label="Agendar" onPress={agendarVisita} />
              </View>

              <View style={styles.closeChecklist}>
                {fechamentoChecks.map(check => (
                  <View key={check.label} style={styles.closeCheck}>
                    <MaterialCommunityIcons
                      name={check.ok ? 'check-circle' : 'alert-circle-outline'}
                      size={15}
                      color={check.ok ? cores.success : cores.warning}
                    />
                    <Text style={[styles.closeCheckText, !check.ok && styles.closeCheckTextWarn]}>{check.label}</Text>
                  </View>
                ))}
              </View>
            </OlliCard>
          )}

          {/* PAGAMENTO NO LINK — logo abaixo de "Fechar negócio", ANTES do 1º envio
              (rascunho): é quando o dono decide como mandar. Depois de enviado não
              repete em todo orçamento. Só com o link ligado (nuvem) e para o Grátis
              (ou com o plano ilegível: "não consegui confirmar", nunca "você não
              tem"). Pro: nada aqui. */}
          {cardAcao === 'fechar' && orc.status === 'rascunho' && avisaLinkPagamento && linkConfigurado() && (
            <Aparecer indice={1}>
              <View style={styles.cartaoPlanoLink}>
                <CartaoRecursoPlano recurso="link_pagamento" />
              </View>
            </Aparecer>
          )}

          {cardAcao === 'cobrar' && cobrancaPronta && (
            <OlliCard style={styles.closeCard}>
              <View style={styles.closeTop}>
                <View style={styles.closeIcon}>
                  <MaterialCommunityIcons name="cash-clock" size={24} color={cores.accentLight} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.closeEyebrow}>Receber</Text>
                  <Text style={styles.closeTitle}>Falta receber {formatCurrency(cobrancaPronta.valor)}</Text>
                  <Text style={styles.closeSub}>
                    {statusFin === 'parcial'
                      ? `Recebido ${formatCurrency(totalRecebidoDoOrcamento(orc.id, recibos))} de ${formatCurrency(orc.valorTotal)}.`
                      : 'Cobre no WhatsApp ou mostre o QR do Pix para o cliente pagar na hora.'}
                  </Text>
                </View>
              </View>

              <OlliPressable
                style={styles.closePrimary}
                onPress={handleCobrar}
                haptic="light"
                disabled={cobrando}
                accessibilityLabel={`Cobrar ${formatCurrency(cobrancaPronta.valor)} no WhatsApp`}
              >
                {cobrando
                  ? <ActivityIndicator size="small" color={textoSobreAccent} />
                  : <MaterialCommunityIcons name="whatsapp" size={20} color={textoSobreAccent} />}
                <Text style={styles.closePrimaryText}>Cobrar {formatCurrency(cobrancaPronta.valor)} no WhatsApp</Text>
              </OlliPressable>

              <View style={styles.closeActions}>
                {cobrancaPronta.situacaoPix === 'com_pix' && (
                  <CloseAction icon="qrcode" label="Mostrar QR" onPress={() => setQrAberto(true)} />
                )}
                <CloseAction icon="cash-check" label="Registrar" onPress={() => setPagamentoAberto(true)} />
                {orc.status === 'aprovado' && (
                  <CloseAction icon="clipboard-check-outline" label="Criar OS" onPress={handleCriarOS} loading={criandoOS} />
                )}
              </View>

              {cobradoEm ? (
                <Text style={[styles.financeiroNota, { marginTop: 10, marginBottom: 0 }]}>
                  {enviadoHoje(cobradoEm) ? 'Cobrança enviada hoje.' : `Última cobrança enviada em ${formatDateTime(cobradoEm)}.`}
                </Text>
              ) : null}
              {avisoPix(cobrancaPronta.situacaoPix) && (
                <TouchableOpacity onPress={() => nav.navigate('MeuNegocio')} activeOpacity={0.8} style={styles.cobrancaAviso}>
                  <MaterialCommunityIcons name="key-variant" size={20} color={cores.warning} />
                  <Text style={styles.cobrancaAvisoTexto}>{avisoPix(cobrancaPronta.situacaoPix)?.titulo}</Text>
                  <Text style={styles.cobrancaAvisoAcao}>{avisoPix(cobrancaPronta.situacaoPix)?.acao}</Text>
                </TouchableOpacity>
              )}
            </OlliCard>
          )}

          {cardAcao === 'pos_venda' && (
            <OlliCard style={styles.closeCard}>
              <View style={styles.closeTop}>
                <View style={styles.closeIcon}>
                  <MaterialCommunityIcons name={servicoPago ? 'check-decagram' : 'calendar-check'} size={24} color={cores.accentLight} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.closeEyebrow}>Próximo passo</Text>
                  <Text style={styles.closeTitle}>{servicoPago ? 'Serviço pago' : 'Orçamento aprovado'}</Text>
                  <Text style={styles.closeSub}>
                    {servicoPago
                      ? 'Peça uma avaliação enquanto o cliente está satisfeito e combine o próximo serviço.'
                      : 'Agende o serviço e crie a ordem de serviço para a equipe.'}
                  </Text>
                </View>
              </View>

              {servicoPago ? (
                <OlliPressable style={styles.closePrimary} onPress={handlePedirAvaliacao} haptic="light">
                  <MaterialCommunityIcons
                    name={linkAvaliacao ? 'star-outline' : 'link-variant-plus'}
                    size={20}
                    color={textoSobreAccent}
                  />
                  <Text style={styles.closePrimaryText}>
                    {linkAvaliacao ? 'Pedir avaliação no WhatsApp' : 'Cadastrar link de avaliação do Google'}
                  </Text>
                </OlliPressable>
              ) : (
                <OlliPressable style={styles.closePrimary} onPress={agendarVisita} haptic="light">
                  <MaterialCommunityIcons name="calendar-plus" size={20} color={textoSobreAccent} />
                  <Text style={styles.closePrimaryText}>Agendar o serviço</Text>
                </OlliPressable>
              )}

              <View style={styles.closeActions}>
                {servicoPago && <CloseAction icon="calendar-plus" label="Agendar" onPress={agendarVisita} />}
                {orc.status === 'aprovado' && (
                  <CloseAction icon="clipboard-check-outline" label="Criar OS" onPress={handleCriarOS} loading={criandoOS} />
                )}
                {podeFinanceiro && (
                  <CloseAction icon="receipt" label="Recibo" onPress={() => nav.navigate('EmitirRecibo', { orcamentoId: orc.id })} />
                )}
              </View>
            </OlliCard>
          )}

          {/* TERMÔMETRO (Jogada 9) — quente/morno/frio com o porquê, o que o cliente
              fez no link e a próxima ação já escrita. Só para proposta esperando
              resposta; o plano decide entre o cartão e o "Disponível no Pro". */}
          {mostraTermometro && (
            <Aparecer indice={1}>
              <OlliCard style={{ padding: Spacing.base, marginBottom: 12 }}>
                <Text style={styles.cardTitle}>Termômetro</Text>
                {estadoTermometroPlano === 'liberado' ? (
                  <>
                  {/* Dica só para quem TEM o termômetro: no "Disponível no Pro" ela
                      explicaria um cartão que a pessoa não está vendo. */}
                  <DicaContextual
                    id="orcamento.termometro"
                    icon="thermometer"
                    texto="Aqui você vê quando o link foi aberto e se voltaram ao preço. O botão embaixo é o próximo passo sugerido por isso."
                  />
                  <CartaoTermometro
                    leitura={termometro.estado}
                    estado={estadoTermometro}
                    agora={new Date()}
                    aoTentarDeNovo={termometro.recarregar}
                    aoAgir={(acao) => { void agirPeloTermometro(acao); }}
                    aoLigar={orc.clienteTelefone ? ligarParaCliente : undefined}
                    agindo={enviandoWhats || duplicando}
                  />
                  </>
                ) : (
                  <CartaoRecursoPlano recurso="termometro_orcamento" />
                )}
              </OlliCard>
            </Aparecer>
          )}

          {/* LINHA DO TEMPO — criado, enviado, visualizado, aprovação, pago. Junta o
              status local, a trilha do link público e os recebimentos. */}
          <Aparecer indice={1}>
            <OlliCard style={{ padding: Spacing.base, marginBottom: 12 }}>
              <Text style={styles.cardTitle}>Linha do tempo</Text>
              <TimelineOrcamento etapas={etapasLinha} leituraLink={leituraLink} aoTentarDeNovo={loadTrilha} />
            </OlliCard>
          </Aparecer>

          {/* ACEITE DO CLIENTE (assinatura no dedo) — o palco do gesto que fecha o
              serviço em campo. Fica ALTO na página de propósito: o motor já sabia
              imprimir a assinatura no PDF, o que faltava era o prestador enxergar
              onde colher. Três estados, sempre distintos. */}
          {podeColherAssinatura && (
            <OlliCard style={styles.assinCard}>
              <View style={styles.closeTop}>
                <View style={styles.assinIcon}>
                  <MaterialCommunityIcons
                    name={assinaturaDoCliente ? 'check-decagram' : 'signature-freehand'}
                    size={24}
                    color={assinaturaDoCliente ? cores.success : cores.accentLight}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.closeEyebrow}>Aceite do cliente</Text>
                  <Text style={styles.closeTitle}>
                    {assinaturaDoCliente ? 'Assinado pelo cliente' : 'Colha a assinatura no aparelho'}
                  </Text>
                  <Text style={styles.closeSub}>
                    {assinaturaDoCliente
                      ? 'A assinatura entra no PDF deste orçamento.'
                      : 'Acabou o serviço? O cliente assina com o dedo aqui e o PDF já sai assinado.'}
                  </Text>
                </View>
              </View>

              {assinaturaDoCliente ? (
                <>
                  {/* Fundo claro fixo: a tinta é preta (como no papel do PDF) e
                      sumiria contra a superfície escura do tema. */}
                  <View style={styles.assinPreview}>
                    <Image
                      source={{ uri: assinaturaDoCliente }}
                      style={styles.assinImagem}
                      resizeMode="contain"
                      accessibilityLabel={`Assinatura de ${orc.clienteNome}`}
                    />
                  </View>
                  <Text style={styles.assinMeta}>
                    {orc.clienteNome}
                    {orc.dataAssinaturaCliente ? ` · ${formatDateTime(orc.dataAssinaturaCliente)}` : ''}
                  </Text>
                  <TouchableOpacity
                    style={styles.assinRefazer}
                    onPress={() => setAssinaturaAberta(true)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                  >
                    <MaterialCommunityIcons name="refresh" size={16} color={cores.onSurfaceVariant} />
                    <Text style={styles.assinRefazerTexto}>Assinar de novo</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* Falha de GRAVAÇÃO tem card próprio: o cliente assinou e o
                      documento não guardou. Some da tela = ninguém tenta de novo. */}
                  {assinaturaFalhou && (
                    <View style={styles.cobrancaAviso}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
                      <Text style={styles.cobrancaAvisoTexto}>
                        A última assinatura não foi salva. Nada foi gravado no documento.
                      </Text>
                    </View>
                  )}
                  {/* Uma ação principal por tela: com o card de ação acima, assinar
                      vira botão secundário (contorno); sozinho, é o principal. */}
                  <OlliPressable
                    style={cardAcao ? styles.closeSecundario : styles.closePrimary}
                    onPress={() => setAssinaturaAberta(true)}
                    haptic="light"
                  >
                    <MaterialCommunityIcons name="draw" size={20} color={cardAcao ? cores.accentLight : textoSobreAccent} />
                    <Text style={cardAcao ? styles.closeSecundarioText : styles.closePrimaryText}>
                      {assinaturaFalhou ? 'Tentar de novo' : 'Cliente assinar agora'}
                    </Text>
                  </OlliPressable>
                </>
              )}

              <Text style={styles.assinNota}>
                Comprovação de aceite e execução entre as partes. Não é assinatura
                digital certificada (ICP-Brasil).
              </Text>
            </OlliCard>
          )}

          {/* CLIENTE — toque para ver os orçamentos deste cliente (CRM) */}
          <OlliCard onPress={verCliente} style={{ padding: Spacing.base, marginBottom: 12 }}>
            <View style={styles.clientHeader}>
              <Text style={styles.cardTitle}>Cliente</Text>
              {orc.clienteId ? (
                <View style={styles.clientLink}>
                  <Text style={styles.clientLinkText}>ver orçamentos</Text>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={cores.accentLight} />
                </View>
              ) : null}
            </View>
            <Text style={styles.clientName}>{orc.clienteNome}</Text>
            <Text style={styles.clientInfo}>{orc.clienteTelefone}</Text>
            {orc.clienteCpfCnpj && <Text style={styles.clientInfo}>CPF/CNPJ: {orc.clienteCpfCnpj}</Text>}
            {orc.clienteEndereco && <Text style={styles.clientInfo}>{orc.clienteEndereco}</Text>}
          </OlliCard>

          {/* ITENS */}
          {orc.itens.length > 0 && (
            <OlliCard style={{ padding: Spacing.base, marginBottom: 12 }}>
              <Text style={styles.cardTitle}>Itens ({orc.itens.length})</Text>
              {orc.itens.map(item => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.nome}</Text>
                    <Text style={styles.itemQty}>{item.quantidade} {item.unidade} × {formatCurrency(item.preco)}</Text>
                  </View>
                  <Text style={styles.itemSubtotal}>{formatCurrency(item.subtotal)}</Text>
                </View>
              ))}
            </OlliCard>
          )}

          {/* FOTOS DO SERVIÇO — faixa horizontal (registro fotográfico entra no PDF também) */}
          {!!orc.fotosServico?.length && (
            <OlliCard style={{ padding: Spacing.base, marginBottom: 12 }}>
              <Text style={styles.cardTitle}>Fotos do serviço ({orc.fotosServico.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fotosRow}>
                {orc.fotosServico.map(uri => (
                  <Image key={uri} source={{ uri }} style={styles.fotoStrip} />
                ))}
              </ScrollView>
            </OlliCard>
          )}

          {/* TOTAIS */}
          {podeFinanceiro && <OlliCard style={{ padding: Spacing.base, marginBottom: 12 }}>
            <Text style={styles.cardTitle}>Resumo financeiro</Text>
            <View style={styles.financeiroLinha}>
              <Text style={styles.rowLabel}>Recebimento</Text>
              <FinanceiroBadge status={getStatusFinanceiro(orc, recibos)} />
            </View>
            {getStatusFinanceiro(orc, recibos) === 'pago' && (
              <Text style={styles.financeiroNota}>Pagamento registrado. O recibo em PDF continua disponível no botão “Recibo”.</Text>
            )}
            {getStatusFinanceiro(orc, recibos) === 'recibo_emitido' && (
              <Text style={styles.financeiroNota}>Pagamento quitado e recibo emitido. O status comercial continua separado deste registro.</Text>
            )}
            {getStatusFinanceiro(orc, recibos) === 'parcial' && (
              <Text style={styles.financeiroNota}>Recebido {formatCurrency(totalRecebidoDoOrcamento(orc.id, recibos))} de {formatCurrency(orc.valorTotal)}. O botão acima registra apenas o próximo recebimento.</Text>
            )}
            {recibos.some((recibo) => recibo.orcamentoId === orc.id && recibo.ledgerStatus === 'pendente') && (
              <Text style={styles.financeiroNota}>O recebimento foi salvo neste aparelho e está aguardando confirmação da nuvem. Não registre o mesmo pagamento novamente.</Text>
            )}
            {recibos.some((recibo) => recibo.orcamentoId === orc.id && !!recibo.pagamentoId && !recibo.estornadoEm) && (
              <OlliButton
                label="Estornar último recebimento"
                variant="outline"
                size="sm"
                loading={estornando}
                disabled={estornando}
                onPress={() => setEstornoAberto(true)}
                icon={<MaterialCommunityIcons name="undo-variant" size={17} color={cores.primary} />}
                style={{ marginTop: Spacing.sm }}
              />
            )}
            {/* NOTA FISCAL: o OLLI prepara os dados de cada recibo para o Emissor Nacional
                (não emite). Estornado não vira nota. */}
            {recibos
              .filter((recibo) => recibo.orcamentoId === orc.id && !recibo.estornadoEm)
              .map((recibo) => (
                <OlliButton
                  key={`nota-${recibo.id}`}
                  label={`Preparar nota fiscal · recibo ${formatarNumeroExibicao(recibo.numero)}`}
                  variant="outline"
                  size="sm"
                  onPress={() => nav.navigate('PrepararNota', { reciboId: recibo.id })}
                  icon={<MaterialCommunityIcons name="file-certificate-outline" size={17} color={cores.primary} />}
                  style={{ marginTop: Spacing.sm }}
                />
              ))}
            {orc.subtotalServicos > 0 && <Row label="Serviços" value={formatCurrency(orc.subtotalServicos)} />}
            {orc.subtotalProdutos > 0 && <Row label="Produtos" value={formatCurrency(orc.subtotalProdutos)} />}
            {orc.subtotal - orc.valorTotal > 0 && <Row label="Desconto" value={`-${formatCurrency(orc.subtotal - orc.valorTotal)}`} />}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(orc.valorTotal)}</Text>
            </View>
          </OlliCard>}

          {/* DETALHES */}
          <OlliCard style={{ padding: Spacing.base, marginBottom: 12 }}>
            <Text style={styles.cardTitle}>Detalhes</Text>
            {orc.modeloNome && <Row label="Modelo PDF" value={orc.modeloNome} />}
            {orc.validadeOrcamento && <Row label="Válido até" value={formatarDataBR(orc.validadeOrcamento)} />}
            {orc.dataVisitaTecnica && <Row label="Visita técnica" value={formatarDataBR(orc.dataVisitaTecnica)} />}
            {orc.agendamentoServico && <Row label="Agendamento" value={formatarDataBR(orc.agendamentoServico)} />}
            {orc.condicoesPagamento && <Row label="Condições comerciais" value={orc.condicoesPagamento} />}
            {orc.garantia && <Row label="Garantia" value={orc.garantia} />}
            {orc.condicoesContratuais && (
              <View style={styles.textBlock}>
                <Text style={styles.rowLabel}>Condições contratuais</Text>
                <Text style={styles.textBlockContent}>{orc.condicoesContratuais}</Text>
              </View>
            )}
          </OlliCard>

          {/* HISTÓRICO DE VERSÕES — snapshots congelados antes de cada edição enviada */}
          {versoes.length > 0 && (
            <OlliCard style={{ padding: Spacing.base, marginBottom: 12 }}>
              <TouchableOpacity
                style={styles.versoesHeader}
                onPress={() => setVersoesAbertas(v => !v)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Versões anteriores ({versoes.length})</Text>
                  <Text style={styles.versoesHint}>
                    Guardamos o que o cliente viu antes de cada alteração.
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name={versoesAbertas ? 'chevron-up' : 'chevron-down'}
                  size={22}
                  color={cores.onSurfaceVariant}
                />
              </TouchableOpacity>
              {versoesAbertas && versoes.map(v => (
                <View key={v.id} style={styles.versaoItem}>
                  <View style={styles.versaoTop}>
                    <View style={styles.versaoBadge}>
                      <Text style={styles.versaoBadgeText}>v{v.numeroVersao}</Text>
                    </View>
                    <Text style={styles.versaoData}>{formatDateTime(v.criadoEm)}</Text>
                    <Text style={styles.versaoValor}>{formatCurrency(v.dados.valorTotal ?? 0)}</Text>
                  </View>
                  <Text style={styles.versaoResumo}>
                    {(v.dados.itens?.length ?? 0)} {(v.dados.itens?.length ?? 0) === 1 ? 'item' : 'itens'}
                    {v.dados.validadeOrcamento ? ` · válido até ${formatarDataBR(v.dados.validadeOrcamento)}` : ''}
                  </Text>
                </View>
              ))}
            </OlliCard>
          )}
        </Animated.ScrollView>
        {/* Cabeçalho que encolhe: some o card, fica a faixa com status e total. */}
        <BarraStatusCompacta
          status={orc.status}
          total={podeFinanceiro ? orc.valorTotal : null}
          rolagem={rolagem}
          limiar={limiarCabecalho}
        />
      </View>

      <AssinaturaClienteModal
        visivel={assinaturaAberta}
        clienteNome={orc.clienteNome}
        referencia={`Orçamento nº ${formatarNumeroExibicao(orc.numero)}`}
        aoConfirmar={gravarAssinaturaCliente}
        aoCancelar={fecharAssinatura}
      />
      <Celebracao visible={!!celebracao} tipo={celebracao ?? 'aprovado'} onDone={finalizarCelebracao} />

      {/* COMPARTILHAR — os canais de envio, com o que acontece em cada um. */}
      <FolhaAcoes
        visivel={folha === 'compartilhar'}
        titulo="Compartilhar orçamento"
        subtitulo={orc.clienteNome}
        aoFechar={() => setFolha(null)}
      >
        <ContadorEnvios estado={contadorEstado} />
        <ItemFolha
          icon="whatsapp"
          destaque
          label={orc.status === 'rascunho' ? 'Enviar no WhatsApp' : 'Reenviar no WhatsApp'}
          descricao={linkConfigurado()
            ? 'Abre o WhatsApp do cliente com o link de aprovação.'
            : 'Abre o WhatsApp do cliente com o resumo; ele aprova respondendo.'}
          onPress={handleWhatsApp}
          disabled={enviandoWhats}
        />
        <ItemFolha
          icon="link-variant"
          label="Compartilhar link de aprovação"
          descricao={linkConfigurado()
            ? 'Escolha o app: e-mail, SMS ou outra conversa.'
            : 'Precisa do backup na nuvem ligado (tela Conta).'}
          onPress={handleLinkCliente}
          disabled={linking}
        />
        <ItemFolha
          icon="file-pdf-box"
          label="Compartilhar PDF"
          descricao="Gera o PDF e abre o compartilhar do aparelho."
          onPress={handleShare}
          disabled={sharing}
        />
        {cobrancaPronta && cobrancaPronta.situacaoPix === 'com_pix' ? (
          <ItemFolha
            icon="qrcode"
            label="Mostrar QR do Pix"
            descricao={`Para o cliente pagar ${formatCurrency(cobrancaPronta.valor)} na hora.`}
            onPress={() => setQrAberto(true)}
          />
        ) : null}
      </FolhaAcoes>

      {/* MAIS AÇÕES (⋯) — tudo que não é o próximo passo do status. */}
      <FolhaAcoes visivel={folha === 'mais'} titulo="Mais ações" aoFechar={() => setFolha(null)}>
        {edicaoBloqueada(orc.status) ? (
          <ItemFolha
            icon="file-document-edit-outline"
            label="Criar revisão"
            descricao="O original fica guardado; a revisão nasce como rascunho."
            onPress={handleCriarRevisao}
            disabled={duplicando}
          />
        ) : (
          <ItemFolha
            icon="pencil"
            label="Editar"
            descricao="Itens, valores e condições."
            onPress={() => nav.navigate('EditarOrcamento', { orcamentoId: orc.id })}
          />
        )}
        <ItemFolha
          icon="content-copy"
          label="Duplicar"
          descricao="Novo rascunho com os mesmos itens."
          onPress={handleDuplicar}
          disabled={duplicando}
        />
        <ItemFolha
          icon="swap-horizontal"
          label="Alterar status"
          descricao={`Agora: ${STATUS_LABELS[orc.status]}.`}
          onPress={() => setFolha('status')}
        />
        <ItemFolha
          icon="calendar-plus"
          label="Agendar visita"
          descricao="Abre a agenda já com este cliente."
          onPress={agendarVisita}
        />
        {orc.status === 'aprovado' ? (
          <ItemFolha
            icon="clipboard-check-outline"
            label="Criar ordem de serviço"
            descricao="A partir deste orçamento aprovado."
            onPress={handleCriarOS}
            disabled={criandoOS}
          />
        ) : null}
        {podeFinanceiro && (statusFin === 'aguardando_pagamento' || statusFin === 'parcial') ? (
          <ItemFolha
            icon="cash-check"
            label="Registrar pagamento"
            descricao="Anota o que o cliente pagou (total ou parte)."
            onPress={() => setPagamentoAberto(true)}
          />
        ) : null}
        {podeFinanceiro ? (
          <ItemFolha
            icon="receipt"
            label="Recibo"
            descricao="Emitir ou reenviar o recibo deste orçamento."
            onPress={() => nav.navigate('EmitirRecibo', { orcamentoId: orc.id })}
          />
        ) : null}
        {orc.clienteId ? (
          <ItemFolha
            icon="account-outline"
            label="Ver orçamentos do cliente"
            descricao={orc.clienteNome}
            onPress={verCliente}
          />
        ) : null}
      </FolhaAcoes>

      {/* STATUS — troca manual. "Visualizado" fica de fora: quem marca é o cliente, pelo link. */}
      <FolhaAcoes
        visivel={folha === 'status'}
        titulo="Alterar status"
        subtitulo="Mude à mão quando o cliente responder fora do link."
        aoFechar={() => setFolha(null)}
      >
        {STATUS_ACTIONS.map(a => (
          <ItemFolha
            key={a.status}
            icon="circle"
            corPonto={a.corBase}
            label={a.label}
            selecionado={orc.status === a.status}
            onPress={() => {
              if (orc.status !== a.status) void updateStatus(a.status, { avisar: true });
            }}
          />
        ))}
      </FolhaAcoes>
      {/* PRÓXIMOS PASSOS — a aprovação vira esta folha (no lugar da antiga
          pergunta "Criar OS?"). Cada item diz o que acontece; "Depois" não perde
          nada: tudo continua no card do topo e no ⋯. */}
      <FolhaAcoes
        visivel={folha === 'proximos'}
        titulo="Orçamento aprovado!"
        subtitulo={`Próximos passos com ${orc.clienteNome}`}
        aoFechar={() => setFolha(null)}
      >
        {precisaAssinatura ? (
          <ItemFolha
            icon="draw"
            destaque
            label="Cliente assinar agora"
            descricao="Ele assina com o dedo e o PDF já sai assinado."
            onPress={assinarPelosProximos}
          />
        ) : null}
        {orc.status === 'aprovado' ? (
          <ItemFolha
            icon="clipboard-check-outline"
            destaque={!precisaAssinatura}
            label="Criar ordem de serviço"
            descricao="Já abre a OS deste orçamento para a equipe."
            onPress={handleCriarOS}
            disabled={criandoOS}
          />
        ) : null}
        <ItemFolha
          icon="calendar-plus"
          label="Agendar o serviço"
          descricao="Abre a agenda já com este cliente."
          onPress={agendarVisita}
        />
        {podeFinanceiro && (statusFin === 'aguardando_pagamento' || statusFin === 'parcial') ? (
          <ItemFolha
            icon="cash-check"
            label="Registrar pagamento"
            descricao="Se o cliente já pagou, total ou parte."
            onPress={() => setPagamentoAberto(true)}
          />
        ) : null}
        <ItemFolha
          icon="clock-outline"
          label="Depois"
          descricao="Tudo isso continua no card do topo e no ⋯."
          onPress={() => {}}
        />
      </FolhaAcoes>
      <OverlayProgresso
        visible={!!overlayInfo}
        titulo={overlayInfo?.titulo}
        subtitulo={overlayInfo?.subtitulo}
      />
      {podeFinanceiro && <RegistrarPagamentoModal
          visivel={pagamentoAberto}
          clienteNome={orc.clienteNome}
          valorSugerido={Math.max(0, orc.valorTotal - totalRecebidoDoOrcamento(orc.id, recibos))}
          aoFechar={() => setPagamentoAberto(false)}
          aoSalvar={salvarPagamento}
        />}
      {podeFinanceiro && <EstornarPagamentoModal
        visivel={estornoAberto}
        referencia={`Orçamento nº ${formatarNumeroExibicao(orc.numero)}`}
        aoFechar={() => setEstornoAberto(false)}
        aoSalvar={salvarEstorno}
      />}
      {cobrancaPronta && cobrancaPronta.situacaoPix === 'com_pix' && (
        <PixCobrancaModal
          visivel={qrAberto}
          aoFechar={() => setQrAberto(false)}
          brcode={cobrancaPronta.pixCopiaECola}
          valor={cobrancaPronta.valor}
          referencia={`Orçamento nº ${formatarNumeroExibicao(orc.numero)} · ${orc.clienteNome}`}
        />
      )}
      <ConfirmarEnvioSheet
        visivel={!!envioPendente}
        ocupado={confirmandoEnvio}
        titulo={envioPendente?.tipo === 'cobranca' ? 'Conseguiu enviar a cobrança?' : 'Conseguiu enviar o orçamento?'}
        mensagem={textoConfirmacaoEnvio(envioPendente, orc)}
        aoResponder={responderEnvio}
      />
    </View>
  );
}

/** Texto da folha "Conseguiu enviar?" — diz o que acontece em cada resposta. */
function textoConfirmacaoEnvio(pendente: EnvioPendente | null, orc: Orcamento): string {
  if (!pendente) return '';
  if (pendente.tipo === 'orcamento') {
    const efeito = orc.status === 'rascunho'
      ? `Confirme só se a mensagem saiu para ${orc.clienteNome}: aí o orçamento passa para Enviado.`
      : `Confirme só se a mensagem saiu para ${orc.clienteNome}.`;
    return pendente.semLink
      ? `${efeito} A mensagem foi sem o link de aprovação (não consegui gerá-lo agora): o cliente aprova respondendo no WhatsApp.`
      : efeito;
  }
  const efeito = 'Confirmando, fica registrado que você cobrou hoje.';
  if (!pendente.semLink) return efeito;
  return pendente.ofertarCodigo
    ? `${efeito} A mensagem foi sem o link de pagamento. Em seguida, envie o código Pix sozinho numa segunda mensagem.`
    : `${efeito} A mensagem foi sem o link de pagamento.`;
}

/**
 * Folha "Conseguiu enviar?" — aparece quando o prestador volta do WhatsApp. Voltar
 * pelo botão do sistema conta como "Não enviei" (nada é marcado sem confirmação).
 */
function ConfirmarEnvioSheet({ visivel, titulo, mensagem, ocupado, aoResponder }: {
  visivel: boolean;
  titulo: string;
  mensagem: string;
  ocupado: boolean;
  aoResponder: (enviou: boolean) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={() => aoResponder(false)}>
      <View style={styles.sheetFundo}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.sheetAlca} />
          <Text style={styles.sheetTitulo} accessibilityRole="header">{titulo}</Text>
          {mensagem ? <Text style={styles.sheetTexto}>{mensagem}</Text> : null}
          <OlliButton
            label="Sim, enviei"
            variant="gradient"
            fullWidth
            loading={ocupado}
            disabled={ocupado}
            onPress={() => aoResponder(true)}
            icon={<MaterialCommunityIcons name="check" size={18} color="#fff" />}
            style={{ marginTop: Spacing.base }}
          />
          <OlliButton
            label="Não enviei"
            variant="ghost"
            fullWidth
            disabled={ocupado}
            onPress={() => aoResponder(false)}
            icon={<MaterialCommunityIcons name="close" size={18} color={cores.onSurfaceVariant} />}
            style={{ marginTop: Spacing.sm }}
          />
        </View>
      </View>
    </Modal>
  );
}

/**
 * Botão redondo do topo (Compartilhar, ⋯) — vidro branco sobre o gradiente do
 * cabeçalho, mesma convenção do botão de voltar. Mostra "carregando" no lugar do
 * ícone enquanto a ação dele roda.
 */
function BotaoTopo({ icon, label, onPress, loading }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  const styles = useEstilos(criarEstilos);
  return (
    <PressableAnimado
      style={styles.topoBotao}
      onPress={onPress}
      disabled={loading}
      haptic="light"
      hitSlop={6}
      accessibilityLabel={label}
      accessibilityState={loading ? { busy: true } : undefined}
    >
      {loading ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name={icon} size={22} color="#fff" />}
    </PressableAnimado>
  );
}

function CloseAction({ icon, label, onPress, loading }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void; loading?: boolean }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <OlliPressable style={styles.closeActionBtn} onPress={onPress} disabled={loading}>
      {loading ? <ActivityIndicator size="small" color={cores.accentLight} /> : <MaterialCommunityIcons name={icon} size={19} color={cores.accentLight} />}
      <Text style={styles.closeActionText}>{label}</Text>
    </OlliPressable>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  // Área da rolagem: a faixa compacta do cabeçalho fica por cima, colada no topo.
  palco: { flex: 1 },
  // Dentro do GradientHeader (sempre colorido, nos dois modos) — glass branco
  // fixo, mesma convenção do próprio GradientHeader.
  topoAcoes: { flexDirection: 'row', gap: 8, marginLeft: 8 },
  topoBotao: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },

  revisaoAviso: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: comAlfa(c.primary, 0.08),
    borderWidth: 1, borderColor: comAlfa(c.primary, 0.28),
    borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: 10,
  },
  revisaoTitulo: { fontSize: 13.5, fontWeight: '800', color: c.onSurface },
  revisaoTexto: { fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 18, marginTop: 2 },
  editadoEm: {
    fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant,
    textAlign: 'right', marginBottom: 8,
  },

  closeCard: { padding: Spacing.base, marginBottom: 12, borderColor: c.strokeGlow },
  cartaoPlanoLink: { marginBottom: 12 },
  closeTop: { flexDirection: 'row', alignItems: 'center' },
  // rgba(127,233,245,x) era o accentLight estático — vira o accentLight do tema.
  closeIcon: {
    width: 48, height: 48, borderRadius: BorderRadius.chip,
    backgroundColor: comAlfa(c.accentLight, 0.12),
    borderWidth: 1, borderColor: comAlfa(c.accentLight, 0.28),
    alignItems: 'center', justifyContent: 'center',
  },
  closeEyebrow: { fontSize: 13, fontWeight: '800', color: c.accentLight, textTransform: 'uppercase', letterSpacing: 0.4 },
  closeTitle: { fontSize: 16, fontWeight: '800', color: c.onSurface, marginTop: 2 },
  closeSub: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2 },
  closePrimary: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: c.accentLight,
    borderRadius: BorderRadius.full,
    paddingVertical: 13,
  },
  // Era '#0A1626' fixo — vira o ink de contraste calculado sobre accentLight.
  closePrimaryText: { fontSize: 14.5, fontWeight: '800', color: textoSobre(c.accentLight) },
  // Ação secundária com o mesmo tamanho da principal: contorno, sem preenchimento.
  closeSecundario: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: c.strokeGlow,
    paddingVertical: 12,
  },
  closeSecundarioText: { fontSize: 14.5, fontWeight: '800', color: c.accentLight },
  closeActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  closeActionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: c.strokeGlow,
    backgroundColor: c.surfacePressed,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  closeActionText: { fontSize: 13, fontWeight: '800', color: c.accentLight },
  closeChecklist: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  closeCheck: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 6 },
  closeCheckText: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant },
  closeCheckTextWarn: { color: c.warning },

  // Aceite do cliente (assinatura) — reusa closeTop/closeEyebrow/closeTitle/
  // closeSub/closePrimary do card de fechamento: é o mesmo bloco de "ação que
  // fecha negócio", e duas gramáticas visuais para o mesmo papel seria ruído.
  assinCard: { padding: Spacing.base, marginBottom: 12, borderColor: c.strokeGlow },
  assinIcon: {
    width: 48, height: 48, borderRadius: BorderRadius.chip,
    backgroundColor: comAlfa(c.accentLight, 0.12),
    borderWidth: 1, borderColor: comAlfa(c.accentLight, 0.28),
    alignItems: 'center', justifyContent: 'center',
  },
  assinPreview: {
    marginTop: 12, borderRadius: BorderRadius.md,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: c.outline,
    paddingVertical: 10, alignItems: 'center',
  },
  assinImagem: { width: '100%', height: 72 },
  assinMeta: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant, marginTop: 8 },
  assinRefazer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, marginTop: 6,
  },
  assinRefazerTexto: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant },
  assinNota: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 17, marginTop: 10 },

  cardTitle: { fontSize: 14, fontWeight: '800', color: c.onSurfaceVariant, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  clientHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clientLink: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  clientLinkText: { fontSize: 12, fontWeight: '700', color: c.accentLight },
  clientName: { fontSize: 16, fontWeight: '700', color: c.onSurface },
  clientInfo: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 3 },

  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.outline },
  itemName: { fontSize: 14, fontWeight: '600', color: c.onSurface },
  itemQty: { fontSize: 12, color: c.onSurfaceVariant },
  itemSubtotal: { fontSize: 14, fontWeight: '700', color: c.primary },

  fotosRow: { gap: 10, paddingRight: 4 },
  fotoStrip: { width: 96, height: 96, borderRadius: BorderRadius.md, backgroundColor: c.surfaceVariant },

  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.outline },
  rowLabel: { fontSize: 13, color: c.onSurfaceVariant },
  financeiroLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  financeiroNota: { fontSize: 12, color: c.onSurfaceVariant, lineHeight: 18, marginBottom: Spacing.sm },
  rowValue: { fontSize: 13, fontWeight: '600', color: c.onSurface, maxWidth: '60%', textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  totalValue: { ...Typography.valueLarge, color: c.accentLight },

  textBlock: { paddingTop: 8 },
  textBlockContent: { fontSize: 13, color: c.onSurface, lineHeight: 20, marginTop: 4 },

  // Banner de erro (mesmo visual do usado em HomeScreen para radar/cobrança).
  cobrancaAviso: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.3)', borderRadius: BorderRadius.xl, padding: Spacing.md, marginTop: 8 },
  cobrancaAvisoTexto: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant },
  cobrancaAvisoAcao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },

  // Folha "Conseguiu enviar?"
  sheetFundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: c.strokeGlow,
    padding: Spacing.lg, paddingBottom: Spacing.xl,
    ...sombrasDe(c).lg,
  },
  sheetAlca: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.outline, marginBottom: Spacing.base },
  sheetTitulo: { fontSize: 18, fontWeight: '800', color: c.onSurface },
  sheetTexto: { fontSize: 13.5, color: c.onSurfaceVariant, lineHeight: 20, marginTop: 6 },

  // Histórico de versões
  versoesHeader: { flexDirection: 'row', alignItems: 'center' },
  versoesHint: { fontSize: 12, color: c.onSurfaceVariant, marginTop: -4, marginBottom: 2 },
  versaoItem: {
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.outline,
  },
  versaoTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  versaoBadge: {
    backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  versaoBadgeText: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant },
  versaoData: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant },
  versaoValor: { fontSize: 13.5, fontWeight: '700', color: c.onSurface },
  versaoResumo: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 4 },
});
