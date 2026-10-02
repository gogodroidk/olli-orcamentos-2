import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking, ActivityIndicator, Platform } from 'react-native';
import { useNavigation, useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { vibrar } from '../utils/haptico';
import { Spacing, BorderRadius, Typography, useCores, useGradientes, useEstilos, sombrasDe, comAlfa, textoSobre, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliMascot } from '../components/OlliMascot';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useEhDesktop } from '../hooks/useEhDesktop';
import { goBackOrHome } from '../navigation/safeBack';
import { abrirWhatsApp } from '../utils/exportarDocumento';
import { WHATSAPP_SUPORTE, PAGAMENTOS_URL } from '../config';
import { supabase } from '../services/supabase';
import { getPlanoAtual, getPlanoCacheado, PlanoId, type PlanoAtual } from '../services/planos';
import {
  temAcessoRecurso,
  disponibilidadeRecurso,
  IA_USOS_GRATIS_MES,
  RECURSOS_EM_ORDEM,
  TRIAL_PRO_DIAS,
  type Recurso,
} from '../services/entitlements';
import { FRASE_GRATIS, PLANOS_BASE as TABELA_PLANOS, ROTULO_RECURSO, frasePro, type BulletPlano } from '../services/planosBase';
import { iniciarTrialPro, obterEstadoOfertaComercial } from '../services/cotaEnvios';
import type { EstadoOfertaComercial } from '../services/limitesComerciais';
import {
  PRECO_PRO,
  PRECO_EMPRESA,
  DESCONTO_ANUAL_ROTULO,
  reais,
  precoNoPeriodo,
  type PeriodoCobranca,
} from '../services/precosPlanos';
import { aplicarSeo } from '../utils/seoWeb';
import { PixPlanoModal } from '../components/PixPlanoModal';
import { CreditoTrocaAtalho } from '../components/CreditoTrocaAtalho';
import { chavePixPlano, criarPixPlano, pixPlanoDisponivel, type CobrancaPixPlano } from '../services/pixPlano';
import {
  ESTADO_PLAY_BILLING,
  carregarOfertasPlay,
  comprarNaPlay,
  restaurarComprasPlay,
  type ResultadoOfertasPlay,
} from '../services/playBilling';
import { liberacaoPlayConfirmada, ofertaPara, type OfertaPlay, type PlanoPlay } from '../services/playBillingRegras';
import { getAssinaturaNaPlay } from '../services/assinatura';
import { BUILD_PLAY_SEM_COMPRA_EXTERNA, COMPRA_NO_APP } from '../config/loja';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * QUEM COBRA O QUÊ (decisão do dono, textual): "deixe os pagamentos do CARTÃO no
 * STRIPE, e os pagamentos PIX no MERCADO PAGO."
 *  - Plano (mensal, anual e 12x) → CARTÃO → `POST /stripe/checkout` (único destino
 *    de pagamento desta tela). Conferido na Stripe live: as sessões criadas por
 *    este caminho saem com `payment_method_types: ['card']`.
 *  - Pix → MERCADO PAGO, e só para recarregar CRÉDITOS (CreditosScreen → /mp/*).
 * Não há — e não pode voltar a haver — assinatura por cartão no Mercado Pago
 * (a rota `/mp/plano/assinatura` do worker): cartão é Stripe, ponto. Se algum botão
 * desta tela passar a apontar para `/mp/`, é regressão de roteamento e o gate
 * `scripts/teste-roteamento-pagamento.ts` reprova. Mapa completo de quem cobra o quê:
 * docs/ENXAME/PAGAMENTOS_ROTEAMENTO.md.
 */

/**
 * LOJAS NATIVAS: a Apple exige In-App Purchase e a Google Play exige Play Billing
 * (ou adesão e integração completas ao programa de faturamento alternativo) para
 * assinatura consumida dentro do app. Este build não implementa StoreKit nem Play
 * Billing. Por isso, toda compra externa fica escondida tanto no iOS quanto no
 * Android: sem checkout, sem WhatsApp comercial, sem escolha de período e sem copy
 * que direcione a contratação por fora. A web mantém o checkout existente.
 *
 * iOS (Guideline 3.1.1): a Apple exige In-App Purchase para assinatura consumida
 * dentro do app e proíbe abrir o checkout num navegador externo (link-out) — e
 * proíbe também qualquer caminho que SUBSTITUA a compra, como um "fale conosco"
 * que leva a fechar por fora, ou qualquer convite a TROCAR de plano por fora do
 * app. Não há StoreKit implementado ainda, então no iOS ficam escondidos: botão
 * de assinatura, abas de período, a linha do 12×, rodapé de venda, o CTA "Falar
 * com a gente" da Empresa e qualquer menção a "trocar de plano" (inclusive no
 * card de quem já é assinante, mais abaixo). O que é INFORMAÇÃO — preço mensal e
 * anual, o comparativo de recursos, o que cada plano dá — CONTINUA visível: a
 * guideline proíbe vender, não proíbe informar. `COMPRA_NO_APP` centraliza esse
 * desvio para não espalhar `if (Platform.OS === 'ios')` pela tela.
 * Gerenciar uma assinatura JÁ existente (feita fora do iOS) acontece noutra
 * tela (AssinaturaScreen, via o botão "Sua assinatura" abaixo) — não há portal
 * Stripe nem código dele nesta tela.
 */
// `COMPRA_NO_APP` e `BUILD_PLAY_SEM_COMPRA_EXTERNA` (Android da Google Play não abre
// Stripe, Mercado Pago, WhatsApp comercial nem outro caminho externo de compra de
// bens digitais; só a web contrata) moram em config/loja.ts — flag única do app.

/**
 * VENDA PELA PRÓPRIA GOOGLE PLAY (Play Billing via RevenueCat). Não é compra
 * externa — é a loja cobrando —, então convive com `BUILD_PLAY_SEM_COMPRA_EXTERNA`:
 * o Android continua sem Stripe, Pix e WhatsApp comercial, e ganha só o botão que
 * abre a folha de pagamento da Play. Ligada apenas com a chave pública do RevenueCat
 * no build, fora do Expo Go (ver services/playBillingRegras.ts). Desligada = a tela
 * fica exatamente como antes: informa, não vende. iOS: sempre desligada.
 */
const VENDA_PELA_PLAY = ESTADO_PLAY_BILLING === 'ligado';

/** Ofertas da Play com o estado de carga explícito (nunca "não carregou" = "não há"). */
type EstadoOfertasPlay = { estado: 'carregando' } | ResultadoOfertasPlay;

/** O que o card de um plano pago precisa para vender pela Play (`null` = venda desligada). */
interface VendaPlayCard {
  estado: EstadoOfertasPlay['estado'];
  /** Oferta deste plano no período da aba, com o preço que a LOJA devolveu. */
  oferta: OfertaPlay | null;
  comprando: boolean;
  onAssinar: () => void;
  onTentarDeNovo: () => void;
  onEntrar: () => void;
}

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Período cobrado, escolhido na aba. O 12× NÃO é período — é uma forma de pagar
 *  o valor cheio do ano, tratada à parte (ver a linha honesta no card do Pro). */
type Periodo = PeriodoCobranca;

/** Fonte de preço de um plano pago (um dos objetos derivados de precosPlanos). */
type FontePreco = typeof PRECO_PRO;

interface Plano {
  id: PlanoId;
  nome: string;
  /** Fonte de preço (centavos + derivados) ou `null` no Grátis. */
  preco: FontePreco | null;
  tagline: string;
  icon: string;
  destaque?: boolean;
  atual?: boolean;
  /** Bullets da tabela única (`planosBase.ts`), com o "em breve" de cada um. */
  bullets: readonly BulletPlano[];
  cta: string;
}

/** O que é só desta TELA (ícone, CTA, fonte de preço); o resto vem da tabela única. */
const APRESENTACAO: Record<PlanoId, { preco: FontePreco | null; icon: string; cta: string }> = {
  gratis: { preco: null, icon: 'rocket-launch-outline', cta: 'Seu plano atual' },
  pro: { preco: PRECO_PRO, icon: 'crown-outline', cta: 'Assinar Pro' },
  empresa: { preco: PRECO_EMPRESA, icon: 'office-building-outline', cta: 'Assinar Empresa' },
};

// Lista base dos planos. Nome, tagline e benefícios vêm de `planosBase.ts` (a tabela
// ÚNICA que o painel, a landing e os e-mails também leem — Grátis ilimitado desde
// 01/10/2026). Preço NUNCA é literal aqui: vem de precosPlanos (a fonte conferida
// contra a Stripe). `atual` é decidido em runtime (plano lido de getPlanoAtual()).
const PLANOS_BASE: Omit<Plano, 'atual'>[] = TABELA_PLANOS.map((p) => ({
  id: p.id,
  nome: p.nome,
  tagline: p.tagline,
  destaque: p.destaque,
  bullets: p.bullets,
  ...APRESENTACAO[p.id],
}));

// ─── Comparativo Grátis × Pro × Empresa ─────────────────────────────────────
// A matriz é DERIVADA de `entitlements.ts` (temAcessoRecurso), não escrita à
// mão: o que a tabela promete é exatamente o que o plano libera em código — sem
// inventar recurso nem prometer o que o produto não faz. Cada célula é `true`
// (tem), `false` (não tem) ou um texto curto (limite, como a cota de IA).
type Celula = boolean | string;
interface LinhaComparativo {
  rotulo: string;
  gratis: Celula;
  pro: Celula;
  empresa: Celula;
}

/** Recursos base (não gateados): livres em todos os planos — a alma do Grátis. */
const LINHAS_BASE: LinhaComparativo[] = [
  { rotulo: 'Orçamentos: PDF, link e WhatsApp', gratis: 'Ilimitados', pro: 'Ilimitados', empresa: 'Ilimitados' },
  { rotulo: 'Rascunhos, recibos, clientes e histórico', gratis: true, pro: true, empresa: true },
  { rotulo: 'Catálogo, clientes e agenda', gratis: true, pro: true, empresa: true },
  { rotulo: 'Diagnóstico por código de erro (offline)', gratis: true, pro: true, empresa: true },
  { rotulo: 'Link do orçamento para o cliente', gratis: true, pro: true, empresa: true },
];

/** Rótulo humano de cada recurso gateado — da tabela única `planosBase.ts`. */
const RECURSO_LABEL: Record<Recurso, string> = Object.fromEntries(
  (Object.keys(ROTULO_RECURSO) as Recurso[]).map((r) => [r, ROTULO_RECURSO[r].titulo]),
) as Record<Recurso, string>;

// Ordem de exibição: a de entitlements (Pro primeiro, depois os exclusivos da
// Empresa). `ia_ilimitada` sai do laço genérico porque a célula do Grátis não é ✗ e
// sim a cota "3/mês" — a IA no grátis é gate por COTA, não por plano.
const RECURSOS_GATEADOS: Recurso[] = RECURSOS_EM_ORDEM.filter((r) => r !== 'ia_ilimitada');

/** Monta as linhas do comparativo a partir dos entitlements reais. */
function montarLinhasComparativo(): LinhaComparativo[] {
  const ia: LinhaComparativo = {
    rotulo: RECURSO_LABEL.ia_ilimitada,
    // Grátis tem cota mensal (número da fonte, não literal); pagos têm ilimitada.
    gratis: `${IA_USOS_GRATIS_MES}/mês`,
    pro: temAcessoRecurso('pro', 'ia_ilimitada'),
    empresa: temAcessoRecurso('empresa', 'ia_ilimitada'),
  };
  const gateadas = RECURSOS_GATEADOS.map<LinhaComparativo>((r) => ({
    rotulo: RECURSO_LABEL[r],
    gratis: disponibilidadeRecurso('gratis', r) === 'disponivel',
    pro: disponibilidadeRecurso('pro', r) === 'em_breve' ? 'Em breve' : disponibilidadeRecurso('pro', r) === 'disponivel',
    empresa: disponibilidadeRecurso('empresa', r) === 'em_breve' ? 'Em breve' : disponibilidadeRecurso('empresa', r) === 'disponivel',
  }));
  return [...LINHAS_BASE, ia, ...gateadas];
}

const LINHAS_COMPARATIVO = montarLinhasComparativo();

/**
 * A verdade sobre o 12×: é o valor CHEIO do ano parcelado no cartão, MAIS CARO
 * que o anual à vista — nunca um desconto. Derivada 100% da fonte; retorna `null`
 * se o Pro deixar de ter produto avulso. Nenhum número digitado aqui.
 */
function texto12xPro(): string | null {
  const p = PRECO_PRO;
  if (p.parcelaCentavos === null || p.parceladoCentavos === null || p.sobrecusto12xVsAnualCentavos === null) {
    return null;
  }
  return (
    `Prefere dividir? 12x de ${reais(p.parcelaCentavos)} sem juros no cartão = ${reais(p.parceladoCentavos)} no total. ` +
    `Isso é ${reais(p.sobrecusto12xVsAnualCentavos)} A MAIS que o anual à vista (${reais(p.anualCentavos)}) — ` +
    `não é desconto, é o valor cheio do ano parcelado.`
  );
}

/** Mensagem amigável por tipo de falha ao chamar o worker de pagamentos. */
function mensagemErroPagamento(status: number | null, offline: boolean): string {
  if (offline) return 'Sem conexão com a internet agora. Verifique sua conexão e tente novamente.';
  if (status === 429) return 'Muitas tentativas seguidas. Aguarde um instante e tente de novo.';
  if (status && status >= 500) return 'Nosso servidor de pagamentos está indisponível no momento. Tente novamente em alguns minutos.';
  return 'Não foi possível continuar com o pagamento agora. Tente novamente.';
}

export default function PlanosScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Planos'>>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  // Sem isto, a tela renderiza o layout mobile (coluna única) esticado no
  // desktop — o "vira celular" que o dono apontou. No desktop, o conteúdo ganha
  // largura máxima central e os planos vão lado a lado (ver `cardsRow`).
  const ehDesktop = useEhDesktop();

  // SEO da rota pública "/planos". Sem isto ela herda o canonical da home e o
  // Google a trata como duplicata, apesar de estar no sitemap.xml. No-op no nativo.
  //
  // A descrição é DERIVADA: o preço vem de precosPlanos (nunca escrito de
  // memória — já erramos aqui, "o Pro libera orçamentos ilimitados" era falso
  // porque o Grátis já os tem). Ao mexer nos planos, reveja este texto.
  useEffect(() => {
    aplicarSeo({
      titulo: 'Planos e preços — OLLI Orçamentos',
      descricao:
        `Comece grátis, com ${FRASE_GRATIS}. ` +
        `O Pro (${reais(PRECO_PRO.mensalCentavos)}/mês, ou ${reais(PRECO_PRO.anualPorMesCentavos)}/mês no anual): ` +
        `${frasePro()}, mais a inteligência de campo.`,
      caminho: '/planos',
    });
  }, []);

  const [periodo, setPeriodo] = useState<Periodo>('mensal');
  const [planoAtualId, setPlanoAtualId] = useState<PlanoId>('gratis');
  const [origemPlano, setOrigemPlano] = useState<'gratis' | 'pagamento' | 'admin' | 'trial' | undefined>('gratis');
  const [oferta, setOferta] = useState<EstadoOfertaComercial | null>(null);
  const [iniciandoTrial, setIniciandoTrial] = useState(false);
  const [carregandoPlano, setCarregandoPlano] = useState(true);
  // 3 estados explícitos (nunca colapsar erro em vazio): `planoErro` só vira
  // true numa falha de rede real; o plano exibido some do cache/última leitura.
  const [planoErro, setPlanoErro] = useState(false);
  const [fontePlano, setFontePlano] = useState<PlanoAtual['fonte']>('indisponivel');
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<PlanoId | null>(null);
  // Pix do plano (AbacatePay). `pixLigado` só vira true quando o worker confirma
  // que o Pix está ligado DE VERDADE — sem isso, nenhum botão de Pix aparece.
  const [pixLigado, setPixLigado] = useState(false);
  const [cobrancaPix, setCobrancaPix] = useState<CobrancaPixPlano | null>(null);
  const [pixEmAndamento, setPixEmAndamento] = useState<PlanoId | null>(null);
  // Google Play (só com VENDA_PELA_PLAY): ofertas com preço da loja, compra em curso
  // e restauração. Desligada, o estado nasce e fica em 'desligado'.
  const [ofertasPlay, setOfertasPlay] = useState<EstadoOfertasPlay>(
    VENDA_PELA_PLAY ? { estado: 'carregando' } : { estado: 'desligado' },
  );
  const [compraPlayEm, setCompraPlayEm] = useState<PlanoId | null>(null);
  const [restaurandoPlay, setRestaurandoPlay] = useState(false);

  useEffect(() => {
    if (!COMPRA_NO_APP || BUILD_PLAY_SEM_COMPRA_EXTERNA) return;
    let vivo = true;
    pixPlanoDisponivel().then((ok) => { if (vivo) setPixLigado(ok); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  // Semeia com o plano do cache local ANTES da leitura de rede, para NÃO piscar
  // a página de venda para quem já é pagante (a "conta limpa" da Frente 2).
  useEffect(() => {
    getPlanoCacheado().then(p => { if (p) setPlanoAtualId(p); }).catch(() => {});
  }, []);

  const carregarPlano = useCallback(async () => {
    // NÃO invalidar o cache antes da rede: getPlanoAtual já prioriza a rede e reescreve o
    // cache no sucesso; apagar antes só destruía a rede de segurança da graça de 7 dias
    // (se a rede falhasse logo após, caía em 'gratis' e reexibia a venda a um pagante).
    setCarregandoPlano(true);
    setPlanoErro(false);
    try {
      const resultado = await getPlanoAtual();
      setPlanoAtualId(resultado.plano);
      setOrigemPlano(resultado.origem);
      setFontePlano(resultado.fonte);
      const confirmadoNoServidor = resultado.fonte === 'servidor';
      setPlanoErro(resultado.fonte === 'cache_mesmo_usuario' || resultado.fonte === 'indisponivel');
      setOferta(confirmadoNoServidor ? await obterEstadoOfertaComercial() : null);
    } catch {
      setFontePlano('indisponivel');
      setPlanoErro(true);
    } finally {
      setCarregandoPlano(false);
    }
  }, []);

  // Recarrega ao focar a tela — cobre a volta do checkout/portal Stripe (o
  // usuário sai para o navegador e volta pelo botão "voltar" do sistema).
  const carregarPlay = useCallback(async () => {
    if (!VENDA_PELA_PLAY) return;
    setOfertasPlay({ estado: 'carregando' });
    setOfertasPlay(await carregarOfertasPlay());
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregarPlano();
      // Relê a Play a cada foco: cobre quem foi à Conta fazer login e voltou.
      void carregarPlay();
    }, [carregarPlano, carregarPlay]),
  );

  const planoConhecido = fontePlano === 'servidor' || fontePlano === 'cache_mesmo_usuario';
  const acoesPlanoDisponiveis = fontePlano === 'servidor' || fontePlano === 'sessao_ausente';
  const planos: Plano[] = PLANOS_BASE.map((p) => ({ ...p, atual: planoConhecido && p.id === planoAtualId }));
  // Conta limpa (Frente 2): quem já paga não vê discurso de venda. Vê um card
  // discreto "Sua assinatura" que leva à AssinaturaScreen (faturas, cobrança,
  // trocar de plano/cartão e cancelar ficam lá, no portal seguro da Stripe).
  const ehTrial = origemPlano === 'trial';
  const ehPagante = planoAtualId !== 'gratis' && !ehTrial;
  const nomePlanoAtual = planoAtualId === 'empresa' ? 'Empresa' : planoAtualId === 'pro' ? 'Pro' : 'Grátis';
  const contextoGate = route.params?.origem === 'gate'
    && Object.prototype.hasOwnProperty.call(RECURSO_LABEL, route.params.recurso)
    && (route.params.plano === 'pro' || route.params.plano === 'empresa')
      ? {
          recurso: RECURSO_LABEL[route.params.recurso],
          plano: route.params.plano === 'empresa' ? 'Empresa' : 'Pro',
        }
      : null;

  async function abrirUrlPagamento(body?: object) {
    if (!PAGAMENTOS_URL) {
      Alert.alert('Ainda não disponível', 'O pagamento online ainda não foi configurado. Tente novamente em breve.');
      return;
    }
    if (!supabase) {
      Alert.alert('Ainda não disponível', 'Login ainda não está configurado neste app.');
      return;
    }

    let status: number | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        Alert.alert('Faça login', 'Entre na sua conta para continuar com o pagamento.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ir para Conta', onPress: () => nav.navigate('Conta') },
        ]);
        return;
      }

      const r = await fetch(`${PAGAMENTOS_URL}/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body ?? {}),
      });
      status = r.status;
      if (!r.ok) {
        Alert.alert('Ops', mensagemErroPagamento(status, false));
        return;
      }
      const resposta: any = await r.json();
      if (!resposta?.ok || !resposta?.url) {
        Alert.alert('Ops', mensagemErroPagamento(status, false));
        return;
      }
      await Linking.openURL(resposta.url);
    } catch {
      Alert.alert('Ops', mensagemErroPagamento(status, true));
    }
  }

  // Resolve (plano do cartão + período da aba) no identificador que o worker
  // aceita em /stripe/checkout. O 12× (parcelado) NÃO é período: quando o
  // usuário escolhe pagar em 12x, o checkout é forçado a 'pro_12x' à parte.
  function planoCheckout(id: PlanoId, per: Periodo): string {
    if (id === 'pro') return per === 'anual' ? 'pro_anual' : 'pro';
    return per === 'anual' ? 'empresa_anual' : 'empresa';
  }

  async function assinarPlano(p: Plano, checkoutOverride?: string) {
    // Defesa em profundidade: no iOS nenhum botão chama isto (o CTA de assinatura
    // fica escondido em PlanoCard), mas a guarda fica aqui também — Guideline
    // 3.1.1 proíbe o link-out de checkout dentro do app.
    if (!COMPRA_NO_APP) return;
    if (BUILD_PLAY_SEM_COMPRA_EXTERNA) return;
    if (!acoesPlanoDisponiveis) {
      Alert.alert('Confirme seu plano', 'Não conseguimos confirmar sua assinatura agora. Toque em “Tentar de novo” antes de iniciar outra contratação.');
      return;
    }
    if (!supabase) {
      Alert.alert('Ainda não disponível', 'Login ainda não está configurado neste app.');
      return;
    }
    const user = (await supabase.auth.getSession()).data.session?.user ?? null;
    if (!user) {
      Alert.alert(
        'Faça login primeiro',
        `Para assinar o plano ${p.nome}, entre com sua conta OLLI. Toque em "Ir para Conta" para fazer login ou criar sua conta.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ir para Conta', onPress: () => nav.navigate('Conta') },
        ],
      );
      return;
    }
    setAcaoEmAndamento(p.id);
    try {
      await abrirUrlPagamento({ plano: checkoutOverride ?? planoCheckout(p.id, periodo) });
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  // CTA secundário da Empresa: "Falar com a gente" pelo WhatsApp de suporte.
  function falarComSuporte(p: Plano) {
    // Defesa em profundidade: no iOS nenhum botão chama isto (o CTA fica
    // escondido dentro de PlanoCard), mas a guarda fica aqui também — mesmo
    // raciocínio do early-return em `assinarPlano` acima: este é justamente o
    // caminho que a Guideline 3.1.1 chama de "fale conosco" para fechar por fora.
    if (!COMPRA_NO_APP) return;
    if (BUILD_PLAY_SEM_COMPRA_EXTERNA) return;
    vibrar('selecao');
    if (!WHATSAPP_SUPORTE) {
      // Honesto: sem número configurado, não finge que vai abrir uma conversa.
      Alert.alert(
        'Ainda não disponível',
        'O contato de suporte ainda não foi configurado. Tente novamente em breve.',
      );
      return;
    }
    const mensagem = `Olá! Quero saber mais sobre o plano ${p.nome} do OLLI Orçamentos.`;
    abrirWhatsApp(WHATSAPP_SUPORTE, mensagem).catch(() => {
      Alert.alert('Ops', 'Não consegui abrir o WhatsApp agora. Tente novamente.');
    });
  }

  function escolher(p: Plano) {
    if (p.atual) return;
    if (p.id === 'gratis') {
      if (acoesPlanoDisponiveis) nav.navigate('Entrar');
      return;
    }
    vibrar('selecao');
    // Pro e Empresa são ambos assináveis via Stripe Checkout.
    if (p.id === 'pro' || p.id === 'empresa') {
      assinarPlano(p);
    }
  }

  // Pix (AbacatePay): paga o período da aba (1 ou 12 meses), sem renovação
  // automática. Mesmas guardas de loja e de sessão do cartão.
  async function pagarComPix(p: Plano) {
    if (!COMPRA_NO_APP || BUILD_PLAY_SEM_COMPRA_EXTERNA || !pixLigado) return;
    if (p.id !== 'pro' && p.id !== 'empresa') return;
    if (!acoesPlanoDisponiveis) {
      Alert.alert('Confirme seu plano', 'Não conseguimos confirmar sua assinatura agora. Toque em “Tentar de novo” antes de iniciar outra contratação.');
      return;
    }
    const sessao = supabase ? (await supabase.auth.getSession()).data.session : null;
    if (!sessao) {
      Alert.alert('Faça login primeiro', `Para assinar o plano ${p.nome}, entre com sua conta OLLI.`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Ir para Conta', onPress: () => nav.navigate('Conta') },
      ]);
      return;
    }
    vibrar('selecao');
    setPixEmAndamento(p.id);
    try {
      const c = await criarPixPlano(chavePixPlano(p.id, periodo));
      if (!c) {
        Alert.alert('Não deu para gerar o Pix', 'Verifique sua conexão e tente de novo.');
        return;
      }
      setCobrancaPix(c);
    } finally {
      setPixEmAndamento(null);
    }
  }

  const aoPixPago = useCallback(() => { void carregarPlano(); }, [carregarPlano]);

  async function gerarNovoPix() {
    const atual = cobrancaPix;
    setCobrancaPix(null);
    if (!atual) return;
    const c = await criarPixPlano(atual.plano.id);
    if (!c) {
      Alert.alert('Não deu para gerar o Pix', 'Verifique sua conexão e tente de novo.');
      return;
    }
    setCobrancaPix(c);
  }

  /**
   * Depois que a Play confirma, quem liga o plano é o SERVIDOR (webhook do
   * RevenueCat → worker). Aqui só relemos o plano do servidor por alguns segundos;
   * "liberado" só é dito quando o servidor confirmar. Sem confirmação no prazo, a
   * mensagem é honesta: pago na Play, liberação a caminho.
   */
  async function aguardarLiberacaoPlay(esperado: PlanoPlay | null) {
    for (let tentativa = 0; tentativa < 8; tentativa++) {
      await esperar(2500);
      try {
        // Plano pago no servidor NÃO basta (quem já pagava por Pix/Stripe, ou sobe do
        // Pro para o Empresa pela Play, já tem plano pago): só confirma quando a linha
        // traz o produto da Play gravado pelo webhook — ver liberacaoPlayConfirmada.
        const [r, play] = await Promise.all([getPlanoAtual(), getAssinaturaNaPlay()]);
        const produtoNoServidor = play.estado === 'ok' ? play.produto : null;
        if (liberacaoPlayConfirmada(r, produtoNoServidor, esperado)) {
          await carregarPlano();
          Alert.alert('Plano liberado', `Seu plano ${r.plano === 'empresa' ? 'Empresa' : 'Pro'} está ativo. Obrigado por assinar o OLLI!`);
          return;
        }
      } catch {
        // rede instável: tenta de novo na próxima volta
      }
    }
    await carregarPlano();
    Alert.alert(
      'Pagamento confirmado pela Google Play',
      'Estamos liberando seu plano — pode levar alguns minutos. Você não precisa pagar de novo: volte a esta tela daqui a pouco.',
    );
  }

  async function assinarPelaPlay(p: Plano) {
    if (!VENDA_PELA_PLAY) return;
    if (p.id !== 'pro' && p.id !== 'empresa') return;
    if (!acoesPlanoDisponiveis) {
      Alert.alert('Confirme seu plano', 'Não conseguimos confirmar sua assinatura agora. Toque em “Tentar de novo” antes de iniciar outra contratação.');
      return;
    }
    if (ofertasPlay.estado !== 'ok') return;
    const oferta = ofertaPara(ofertasPlay.ofertas, p.id, periodo);
    if (!oferta) return;
    vibrar('selecao');
    setCompraPlayEm(p.id);
    try {
      const r = await comprarNaPlay(oferta);
      if (r.estado === 'confirmada') await aguardarLiberacaoPlay(oferta.plano);
      else if (r.estado === 'pendente') {
        Alert.alert('Pagamento em processamento', 'A Google Play ainda está confirmando o pagamento. Assim que ela confirmar, seu plano é liberado — não pague de novo.');
      } else if (r.estado === 'sem_login') {
        Alert.alert('Faça login primeiro', `Para assinar o plano ${p.nome}, entre com sua conta OLLI.`, [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ir para Conta', onPress: () => nav.navigate('Conta') },
        ]);
      } else if (r.estado === 'erro' || r.estado === 'outra_conta') {
        Alert.alert('Google Play', r.mensagem);
      }
      // 'cancelado' (o usuário fechou a folha da Play) e 'desligado': silêncio.
    } finally {
      setCompraPlayEm(null);
    }
  }

  async function restaurarPlay() {
    if (!VENDA_PELA_PLAY || restaurandoPlay) return;
    setRestaurandoPlay(true);
    try {
      const r = await restaurarComprasPlay();
      if (r.estado === 'ok') {
        if (r.temAssinaturaAtiva) await aguardarLiberacaoPlay(null);
        else Alert.alert('Nada para restaurar', 'Não encontramos assinatura ativa do OLLI na conta Google deste aparelho.');
      } else if (r.estado === 'sem_login') {
        Alert.alert('Faça login primeiro', 'Entre com a sua conta OLLI para restaurar a assinatura.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ir para Conta', onPress: () => nav.navigate('Conta') },
        ]);
      } else if (r.estado === 'erro' || r.estado === 'outra_conta') {
        Alert.alert('Google Play', r.mensagem);
      }
    } finally {
      setRestaurandoPlay(false);
    }
  }

  /** Props de venda pela Play de um card, ou `null` quando a venda está desligada. */
  function vendaPlayDoCard(p: Plano): VendaPlayCard | null {
    if (!VENDA_PELA_PLAY || (p.id !== 'pro' && p.id !== 'empresa')) return null;
    return {
      estado: ofertasPlay.estado,
      oferta: ofertasPlay.estado === 'ok' ? ofertaPara(ofertasPlay.ofertas, p.id, periodo) : null,
      comprando: compraPlayEm === p.id,
      onAssinar: () => { void assinarPelaPlay(p); },
      onTentarDeNovo: () => { void carregarPlay(); },
      onEntrar: () => nav.navigate('Conta'),
    };
  }

  // 12× no cartão: só o Pro tem produto avulso. Força o checkout 'pro_12x'
  // (valor cheio do ano), independentemente da aba mensal/anual selecionada.
  function pagar12x(p: Plano) {
    vibrar('selecao');
    assinarPlano(p, 'pro_12x');
  }

  function pedirInicioTrial() {
    Alert.alert(
      `Experimentar o Pro por ${TRIAL_PRO_DIAS} dias`,
      'Você não precisa informar cartão e não haverá cobrança automática. Ao terminar, sua conta volta ao Grátis e seus dados continuam salvos.',
      [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Começar teste', onPress: () => { void executarInicioTrial(); } },
      ],
    );
  }

  async function executarInicioTrial() {
    setIniciandoTrial(true);
    const inicio = await iniciarTrialPro();
    if (!inicio) {
      setIniciandoTrial(false);
      Alert.alert('Não foi possível iniciar', 'Confirme sua conexão e tente novamente. O teste não foi consumido.');
      return;
    }
    await carregarPlano();
    setIniciandoTrial(false);
    Alert.alert('Pro liberado', `Seu teste vai até ${new Date(inicio.terminaEm).toLocaleDateString('pt-BR')}. Não haverá cobrança automática.`);
  }

  return (
    <View style={styles.container}>
      <GradientHeader title="Planos OLLI" subtitle="Escolha como crescer" onBack={() => goBackOrHome(nav)} />

      <ScrollView contentContainerStyle={[styles.scroll, ehDesktop && styles.scrollDesktop]} showsVerticalScrollIndicator={false}>
        {planoErro ? (
          <View style={styles.cobrancaAviso}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
            <Text style={styles.cobrancaAvisoTexto}>Não deu para confirmar seu plano agora. O estado exibido pode estar desatualizado e nenhuma nova contratação será iniciada até você tentar de novo.</Text>
            <TouchableOpacity onPress={carregarPlano} activeOpacity={0.8} style={styles.avisoAcaoHit}>
              <Text style={styles.cobrancaAvisoAcao}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {contextoGate ? (
          <View style={styles.contextoGateCard} accessibilityRole="summary">
            <MaterialCommunityIcons name="lightbulb-on-outline" size={21} color={cores.accentLight} />
            <View style={{ flex: 1 }}>
              <Text style={styles.contextoGateTitle}>Você veio por “{contextoGate.recurso}”</Text>
              <Text style={styles.contextoGateText}>
                Esse recurso faz parte do {contextoGate.plano}. Compare o que já está disponível e confirme a contratação somente se fizer sentido para o seu trabalho.
              </Text>
            </View>
          </View>
        ) : null}

        {ehTrial ? (
          <View style={styles.trialCard}>
            <MaterialCommunityIcons name="creation" size={22} color={cores.accentLight} />
            <View style={{ flex: 1 }}>
              <Text style={styles.trialTitle}>Seu teste Pro está ativo</Text>
              <Text style={styles.trialText}>
                {oferta?.trialTerminaEm
                  ? `Você tem os recursos Pro até ${new Date(oferta.trialTerminaEm).toLocaleDateString('pt-BR')}.`
                  : `Você está usando o Pro por ${TRIAL_PRO_DIAS} dias.`} Sem cartão e sem cobrança automática; seus dados permanecem salvos depois.
              </Text>
            </View>
          </View>
        ) : oferta?.trialEstado === 'eligible' && planoAtualId === 'gratis' ? (
          <View style={styles.trialCard}>
            <MaterialCommunityIcons name="creation" size={22} color={cores.accentLight} />
            <View style={{ flex: 1 }}>
              <Text style={styles.trialTitle}>Quer experimentar tudo do Pro?</Text>
              <Text style={styles.trialText}>{TRIAL_PRO_DIAS} dias sem cartão, sem cobrança automática e sem apagar seus dados ao terminar.</Text>
              <TouchableOpacity style={styles.trialButton} onPress={pedirInicioTrial} disabled={iniciandoTrial} accessibilityRole="button">
                {iniciandoTrial ? <ActivityIndicator size="small" color={cores.onPrimary} /> : <Text style={styles.trialButtonText}>Começar teste grátis</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Crédito de troca ("Vim de outro app"): concessão conferida à mão, não venda —
            aparece igual em todas as plataformas. Pagante só vê se já tiver pedido. */}
        <CreditoTrocaAtalho ocultarSemPedido={ehPagante} />

        {ehPagante ? (
          /* PAGANTE — sem propaganda: card discreto que leva à AssinaturaScreen. */
          <AnimatedEntrance index={0}>
            <View style={styles.assinanteHero}>
              <OlliMascot size={44} onDark />
              <Text style={styles.assinanteTitle}>Você já é assinante</Text>
              <Text style={styles.assinanteSub}>
                Obrigado por apoiar o OLLI! Seu plano <Text style={styles.assinanteForte}>{nomePlanoAtual}</Text> está ativo. {COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA
                  ? 'Faturas, cobrança, troca de plano/cartão e cancelamento ficam na sua página de assinatura.'
                  : BUILD_PLAY_SEM_COMPRA_EXTERNA
                    ? 'O status da assinatura e os recibos ficam na sua página de assinatura.'
                    : 'Faturas, cobrança, atualização de cartão e cancelamento ficam na sua página de assinatura.'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.assinaturaBtn}
              activeOpacity={0.85}
              onPress={() => { vibrar('selecao'); nav.navigate('Assinatura' as never); }}
              accessibilityRole="button"
              accessibilityLabel="Abrir sua assinatura"
            >
              <MaterialCommunityIcons name="card-account-details-outline" size={20} color={cores.primaryLight} />
              <Text style={styles.assinaturaBtnText}>Sua assinatura</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={cores.primaryLight} />
            </TouchableOpacity>
          </AnimatedEntrance>
        ) : (
        <>
        {/* INTRO */}
        <AnimatedEntrance index={0}>
          <View style={styles.intro}>
            <OlliMascot size={44} onDark />
            <Text style={styles.introTitle}>Comece grátis. Cresça quando quiser.</Text>
            <Text style={styles.introSub}>
              {COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA
                ? `O Grátis tem ${FRASE_GRATIS}. Pro e Empresa podem ser assinados direto no app: mensal ou anual com desconto.`
                : VENDA_PELA_PLAY
                  ? `O Grátis tem ${FRASE_GRATIS}. Pro e Empresa podem ser assinados aqui pela Google Play, mensal ou anual — a cobrança e o cancelamento ficam na sua conta Google.`
                : Platform.OS === 'android'
                  ? `O Grátis tem ${FRASE_GRATIS}. Neste aplicativo Android você pode consultar os recursos dos planos, mas não contratar ou alterar um plano.`
                  : `O Grátis tem ${FRASE_GRATIS}. A assinatura dos planos Pro e Empresa ainda não está disponível no iPhone.`}
            </Text>
          </View>
        </AnimatedEntrance>

        {/* ABAS MENSAL / ANUAL — a anual mostra a economia; o preço nos cards segue
            a aba. iOS (Guideline 3.1.1): as abas ficam escondidas (são a escolha de
            uma compra que este aparelho não faz) — mas o preço anual continua
            visível como INFORMAÇÃO na linha "no anual…" dentro de cada card. */}
        {COMPRA_NO_APP && (
        BUILD_PLAY_SEM_COMPRA_EXTERNA && !VENDA_PELA_PLAY ? null : (
        <AnimatedEntrance index={1}>
          <View style={styles.toggle} accessibilityRole="tablist">
            <TouchableOpacity
              style={[styles.toggleOpt, periodo === 'mensal' && styles.toggleOptActive]}
              onPress={() => { vibrar('selecao'); setPeriodo('mensal'); }}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: periodo === 'mensal' }}
            >
              <Text style={[styles.toggleText, periodo === 'mensal' && styles.toggleTextActive]}>Mensal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOpt, periodo === 'anual' && styles.toggleOptActive]}
              onPress={() => { vibrar('selecao'); setPeriodo('anual'); }}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: periodo === 'anual' }}
            >
              <Text style={[styles.toggleText, periodo === 'anual' && styles.toggleTextActive]}>Anual</Text>
              {/* O desconto é o da fonte (Stripe). Na Play quem define o preço é o
                  Play Console, então o selo não aparece — o card mostra o da loja. */}
              {BUILD_PLAY_SEM_COMPRA_EXTERNA ? null : (
                <View style={styles.toggleBadge}><Text style={styles.toggleBadgeText}>-{DESCONTO_ANUAL_ROTULO}</Text></View>
              )}
            </TouchableOpacity>
          </View>
        </AnimatedEntrance>
        )
        )}

        {/* CARTÕES — lado a lado no desktop, empilhados no mobile */}
        <View style={ehDesktop ? styles.cardsRow : undefined}>
          {planos.map((p, i) => {
            const card = (
              <PlanoCard
                plano={p}
                periodo={periodo}
                ehDesktop={ehDesktop}
                carregandoPlano={carregandoPlano}
                acoesDisponiveis={acoesPlanoDisponiveis}
                carregandoAcao={acaoEmAndamento === p.id}
                onPress={() => escolher(p)}
                onFalarSuporte={() => falarComSuporte(p)}
                onPagar12x={() => pagar12x(p)}
                pixLigado={pixLigado}
                carregandoPix={pixEmAndamento === p.id}
                onPagarPix={() => { void pagarComPix(p); }}
                vendaPlay={vendaPlayDoCard(p)}
              />
            );
            // Desktop: cada card numa célula flex (larguras iguais). Sem a entrada
            // animada por card — o stagger vertical não faz sentido lado a lado;
            // a linha aparece com o resto do conteúdo.
            return ehDesktop ? (
              <View key={p.id} style={styles.cardCell}>{card}</View>
            ) : (
              <AnimatedEntrance key={p.id} index={2 + i}>{card}</AnimatedEntrance>
            );
          })}
        </View>

        {/* iOS (Guideline 3.1.1): rodapé escondido — descreve uma compra
            (assinatura que renova, 12x no cartão) que este aparelho não faz;
            mantido sem alteração no Android/web, onde a compra é real. */}
        {/* Google Play: como a assinatura funciona + "Restaurar compras" (exigência
            prática de loja: quem trocou de aparelho recupera sem pagar de novo). */}
        {VENDA_PELA_PLAY ? (
          <View style={styles.playRodape}>
            <Text style={styles.rodape}>
              Pela Google Play, mensal e anual são assinaturas que renovam automaticamente e são cobradas na sua conta Google. Cancele quando quiser em Play Store › Pagamentos e assinaturas.
            </Text>
            <TouchableOpacity
              style={styles.ctaSecundario}
              onPress={() => { void restaurarPlay(); }}
              disabled={restaurandoPlay}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ disabled: restaurandoPlay }}
            >
              {restaurandoPlay ? (
                <ActivityIndicator size="small" color={cores.onSurfaceVariant} />
              ) : (
                <>
                  <MaterialCommunityIcons name="restore" size={16} color={cores.onSurfaceVariant} />
                  <Text style={styles.ctaSecundarioText}>Restaurar compras da Google Play</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA && (
        <Text style={styles.rodape}>{pixLigado
          ? 'No cartão (Stripe), mensal e anual são assinaturas que renovam automaticamente — cancele quando quiser no "Gerenciar assinatura". O 12x sem juros é um pagamento único parcelado no cartão que libera o Pro por 12 meses. No Pix, você paga 1 mês ou 1 ano de uma vez, sem renovação automática: perto do vencimento, paga de novo. 💙'
          : 'Plano se paga no cartão, no ambiente seguro da Stripe. Mensal e anual são assinaturas que renovam automaticamente — cancele quando quiser no "Gerenciar assinatura". O 12x sem juros é um pagamento único parcelado no cartão que libera o Pro por 12 meses. 💙'}</Text>
        )}
        </>
        )}

        {/* COMPARATIVO — sempre visível (info, não venda): deixa óbvio o que cada
            plano dá e destaca o que o usuário JÁ tem. Sem CTA aqui. */}
        <ComparativoTabela planoAtualId={planoAtualId} ehDesktop={ehDesktop} precosDaFonte={!VENDA_PELA_PLAY} />
      </ScrollView>
      <PixPlanoModal
        cobranca={cobrancaPix}
        aoFechar={() => { setCobrancaPix(null); void carregarPlano(); }}
        aoPago={aoPixPago}
        aoGerarNovo={() => { void gerarNovoPix(); }}
      />
    </View>
  );
}

function PlanoCard({
  plano,
  periodo,
  ehDesktop,
  carregandoPlano,
  acoesDisponiveis,
  carregandoAcao,
  onPress,
  onFalarSuporte,
  onPagar12x,
  pixLigado,
  carregandoPix,
  onPagarPix,
  vendaPlay,
}: {
  plano: Plano;
  periodo: Periodo;
  ehDesktop?: boolean;
  carregandoPlano: boolean;
  acoesDisponiveis: boolean;
  carregandoAcao: boolean;
  onPress: () => void;
  onFalarSuporte: () => void;
  onPagar12x: () => void;
  pixLigado: boolean;
  carregandoPix: boolean;
  onPagarPix: () => void;
  /** Venda pela Google Play deste card; `null` = desligada (comportamento anterior). */
  vendaPlay: VendaPlayCard | null;
}) {
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  // Ink de contraste sobre `accentLight` (ícone/badge do plano recomendado).
  const textoSobreAccent = textoSobre(cores.accentLight);
  // Preço exibido — sempre da fonte. No iOS a aba fica escondida, então `periodo`
  // permanece 'mensal' e o card mostra o mensal; o anual aparece na linha "no
  // anual…" logo abaixo, como informação.
  const preco = plano.preco;
  // Na Google Play o preço é o que a LOJA devolveu (cadastrado no Play Console) —
  // nunca o da Stripe. Sem oferta carregada, nenhum número aparece ('—').
  const precoLoja = vendaPlay?.oferta?.precoTexto ?? null;
  const exibido = !preco
    ? { valor: 'Grátis', sufixo: '', nota: null }
    : vendaPlay
      ? { valor: precoLoja ?? '—', sufixo: precoLoja ? (periodo === 'anual' ? '/ano' : '/mês') : '', nota: null }
      : precoNoPeriodo(preco, periodo);
  // Linha secundária de preço:
  //  - aba anual (Android/web): o total do ano + a economia;
  //  - caso contrário: o anual como informação (equivalente /mês, total, −20%).
  const notaAnual =
    !preco
      ? null
      : vendaPlay
        ? (precoLoja ? 'Preço da Google Play, cobrado na sua conta Google.' : null)
      : periodo === 'anual' && COMPRA_NO_APP
        ? exibido.nota
        : `No anual: ${reais(preco.anualPorMesCentavos)}/mês (${reais(preco.anualCentavos)}/ano, −${DESCONTO_ANUAL_ROTULO})`;
  // A linha honesta do 12× só faz sentido no Pro e só onde há compra.
  const linha12x = plano.id === 'pro' ? texto12xPro() : null;
  // NB: este card só renderiza quando `!ehPagante` (ver PlanosScreen acima), ou
  // seja, `plano.atual` só é true para o card Grátis — nunca há aqui um card
  // "atual" de plano pago. Gerenciar uma assinatura paga já existente é a
  // AssinaturaScreen, não este card.

  // Rótulo do CTA coerente com o período — nunca dizer "/mês" cobrando o ano
  // inteiro (evita cobrança-surpresa/estorno). Tudo derivado da fonte.
  const rotuloCta = !preco
    ? plano.cta
    : periodo === 'anual'
      ? `${plano.cta} — ${reais(preco.anualCentavos)}/ano`
      : `${plano.cta} — ${reais(preco.mensalCentavos)}/mês`;
  const body = (
    <View style={[styles.cardBody, ehDesktop && styles.cardBodyDesktop]}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, plano.destaque ? styles.cardIconDestaque : null]}>
          <MaterialCommunityIcons name={plano.icon as any} size={22} color={plano.destaque ? textoSobreAccent : cores.accentLight} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardName}>{plano.nome}</Text>
            {plano.destaque && (
              <View style={styles.popular}><Text style={styles.popularText}>RECOMENDADO</Text></View>
            )}
            {plano.atual && (
              <View style={styles.atualPill}>
                <Text style={styles.atualPillText}>Atual</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardTagline}>{plano.tagline}</Text>
        </View>
      </View>

      {/* PREÇO */}
      <View style={styles.priceRow}>
        <Text style={[styles.price, plano.destaque && styles.priceDestaque]}>{exibido.valor}</Text>
        {exibido.sufixo ? <Text style={styles.pricePeriod}>{exibido.sufixo}</Text> : null}
        {periodo === 'anual' && preco && COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA ? (
          <View style={styles.priceSaveBadge}><Text style={styles.priceSaveBadgeText}>-{DESCONTO_ANUAL_ROTULO}</Text></View>
        ) : null}
      </View>
      {notaAnual ? <Text style={styles.notaAnual}>{notaAnual}</Text> : null}

      {/* BENEFÍCIOS */}
      <View style={styles.beneficios}>
        {plano.bullets.map((b, i) => (
          <View key={i} style={styles.beneficioRow}>
            {/* "Em breve" sem o ✓ de quem já funciona — três estados, nunca dois. */}
            <MaterialCommunityIcons
              name={b.emBreve ? 'clock-outline' : 'check-circle'}
              size={17}
              color={b.emBreve ? cores.onSurfaceVariant : plano.destaque ? cores.accentLight : cores.success}
            />
            <Text style={styles.beneficioText}>{b.emBreve ? `${b.texto} (em breve)` : b.texto}</Text>
          </View>
        ))}
      </View>

      {/* 12× — a VERDADE, não um desconto. iOS (Guideline 3.1.1): escondido, pois
          descreve uma forma de pagamento que este aparelho não realiza. */}
      {COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA && linha12x ? (
        <View style={styles.doze}>
          <MaterialCommunityIcons name="information-outline" size={15} color={cores.onSurfaceVariant} />
          <Text style={styles.dozeText}>{linha12x}</Text>
        </View>
      ) : null}

      {/* Desktop: empurra o CTA para a base — cards de alturas iguais (stretch)
          ficam com os botões alinhados, mesmo com listas de benefícios de
          tamanhos diferentes. No mobile não existe (cada card tem sua altura). */}
      {ehDesktop ? <View style={styles.ctaSpacer} /> : null}

      {/* CTA */}
      {plano.atual ? (
        <View style={styles.ctaAtual}>
          <MaterialCommunityIcons name="check" size={18} color={cores.success} />
          <Text style={styles.ctaAtualText}>{plano.cta}</Text>
        </View>
      ) : !COMPRA_NO_APP ? (
        // iOS (Guideline 3.1.1): sem botão de assinatura, sem link-out para o
        // checkout — só um texto honesto e curto, sem instrução de "vá ao site"
        // (a Apple também proíbe direcionar para compra externa). O CTA
        // secundário "Falar com a gente" (WhatsApp) do plano Empresa, mais
        // abaixo, também fica escondido no iOS: sem o botão de compra acima,
        // ele viraria o próprio caminho de venda por fora do app.
        <View style={styles.ctaIndisponivel}>
          <Text style={styles.ctaIndisponivelText}>Assinatura ainda não disponível no iPhone</Text>
        </View>
      ) : BUILD_PLAY_SEM_COMPRA_EXTERNA ? (
        vendaPlay ? (
          <CtaPlay plano={plano} periodo={periodo} venda={vendaPlay} carregandoPlano={carregandoPlano} acoesDisponiveis={acoesDisponiveis} />
        ) : (
          <View style={styles.ctaIndisponivel}>
            <Text style={styles.ctaIndisponivelText}>Contratação não disponível neste aplicativo Android</Text>
          </View>
        )
      ) : plano.destaque ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.88} disabled={carregandoAcao || carregandoPlano || !acoesDisponiveis} accessibilityState={{ disabled: carregandoAcao || carregandoPlano || !acoesDisponiveis }}>
          <LinearGradient colors={gradientes.primaryDiagonal} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.ctaGrad, sombrasDe(cores).glowCyan, !acoesDisponiveis && styles.ctaDisabled]}>
            {carregandoAcao ? (
              <ActivityIndicator size="small" color={gradientes.sobreBrand} />
            ) : (
              <>
                <Text style={[styles.ctaGradText, { color: gradientes.sobreBrand }]}>{rotuloCta}</Text>
                <MaterialCommunityIcons name="arrow-right" size={18} color={gradientes.sobreBrand} />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.ctaOutline, !acoesDisponiveis && styles.ctaDisabled]} onPress={onPress} activeOpacity={0.85} disabled={carregandoAcao || carregandoPlano || !acoesDisponiveis} accessibilityState={{ disabled: carregandoAcao || carregandoPlano || !acoesDisponiveis }}>
          {carregandoAcao ? (
            <ActivityIndicator size="small" color={cores.primaryLight} />
          ) : (
            <>
              <Text style={styles.ctaOutlineText}>{rotuloCta}</Text>
              <MaterialCommunityIcons name="arrow-right" size={17} color={cores.primaryLight} />
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Pix (AbacatePay): paga o período da aba de uma vez, sem renovação
          automática. Só aparece com o Pix ligado de verdade no worker e onde há
          compra (web) — iPhone e Android da Play seguem sem compra no app. */}
      {COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA && pixLigado && !plano.atual && (plano.id === 'pro' || plano.id === 'empresa') && preco ? (
        <TouchableOpacity style={[styles.ctaOutline, styles.ctaPix, !acoesDisponiveis && styles.ctaDisabled]} onPress={onPagarPix} activeOpacity={0.85} disabled={carregandoPix || carregandoPlano || !acoesDisponiveis} accessibilityRole="button" accessibilityState={{ disabled: carregandoPix || carregandoPlano || !acoesDisponiveis }}>
          {carregandoPix ? (
            <ActivityIndicator size="small" color={cores.primaryLight} />
          ) : (
            <>
              <MaterialCommunityIcons name="qrcode" size={17} color={cores.primaryLight} />
              <Text style={styles.ctaOutlineText}>
                {periodo === 'anual' ? `Pagar com Pix — ${reais(preco.anualCentavos)} (1 ano)` : `Pagar com Pix — ${reais(preco.mensalCentavos)} (1 mês)`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      {/* Pro: pagar em 12× no cartão. iOS: escondido (é compra). Fica DEPOIS do
          CTA principal e é claramente secundário — a verdade sobre o custo já
          está na linha acima, então aqui é só o caminho, não a promessa. */}
      {COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA && !plano.atual && plano.id === 'pro' && linha12x ? (
        <TouchableOpacity style={[styles.ctaSecundario, !acoesDisponiveis && styles.ctaDisabled]} onPress={onPagar12x} activeOpacity={0.8} disabled={carregandoAcao || !acoesDisponiveis} accessibilityState={{ disabled: carregandoAcao || !acoesDisponiveis }}>
          <MaterialCommunityIcons name="credit-card-outline" size={16} color={cores.onSurfaceVariant} />
          <Text style={styles.ctaSecundarioText}>Pagar em 12x no cartão</Text>
        </TouchableOpacity>
      ) : null}

      {/* Empresa: CTA secundário para tirar dúvidas antes de assinar. iOS
          (Guideline 3.1.1): escondido — sem o botão de compra, este WhatsApp
          viraria o caminho de venda por fora do app, o link-out que a
          guideline proíbe. */}
      {COMPRA_NO_APP && !plano.atual && plano.id === 'empresa' && !BUILD_PLAY_SEM_COMPRA_EXTERNA && (
        <TouchableOpacity style={styles.ctaSecundario} onPress={onFalarSuporte} activeOpacity={0.8}>
          <MaterialCommunityIcons name="whatsapp" size={16} color={cores.onSurfaceVariant} />
          <Text style={styles.ctaSecundarioText}>Falar com a gente</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Cartão destacado ganha moldura em gradiente; os demais, borda discreta.
  if (plano.destaque) {
    return (
      <LinearGradient
        // Ciano→azul fixo: é a identidade do PRODUTO OLLI (moldura do plano
        // "mais popular"), não a cor de marca que o usuário escolhe para os
        // PRÓPRIOS orçamentos — não deve seguir `cores`/`gradientes`. Mantido.
        colors={['#34C6D9', '#0B6FCE']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.cardFrame, sombrasDe(cores).md, ehDesktop && styles.cardFrameDesktop]}
      >
        {body}
      </LinearGradient>
    );
  }
  return <View style={[styles.cardPlain, plano.atual && styles.cardAtual, ehDesktop && styles.cardPlainDesktop]}>{body}</View>;
}

/**
 * CTA de assinatura pela Google Play. Os 3 estados da carga das ofertas viram
 * 3 CTAs diferentes — carregando não é "indisponível", e erro não é "não vende":
 *  - carregando  → botão travado, sem preço;
 *  - erro        → aviso + "Tentar de novo";
 *  - sem login   → "Entrar para assinar" (a compra fica ligada à conta OLLI);
 *  - ok          → "Assinar Pro — <preço da loja>/mês", ou aviso honesto se a
 *                  loja não devolveu este produto.
 */
function CtaPlay({
  plano,
  periodo,
  venda,
  carregandoPlano,
  acoesDisponiveis,
}: {
  plano: Plano;
  periodo: Periodo;
  venda: VendaPlayCard;
  carregandoPlano: boolean;
  acoesDisponiveis: boolean;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  if (venda.estado === 'carregando' || venda.estado === 'desligado') {
    return (
      <View style={[styles.ctaOutline, styles.ctaDisabled]} accessibilityState={{ disabled: true, busy: venda.estado === 'carregando' }}>
        <ActivityIndicator size="small" color={cores.primaryLight} />
        <Text style={styles.ctaOutlineText}>Carregando preço da Google Play…</Text>
      </View>
    );
  }
  if (venda.estado === 'erro') {
    return (
      <View style={styles.ctaIndisponivel}>
        <Text style={styles.ctaIndisponivelText}>Não deu para carregar os preços da Google Play.</Text>
        <TouchableOpacity onPress={venda.onTentarDeNovo} activeOpacity={0.8} style={styles.avisoAcaoHit} accessibilityRole="button">
          <Text style={styles.cobrancaAvisoAcao}>Tentar de novo</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (venda.estado === 'sem_login') {
    return (
      <TouchableOpacity style={styles.ctaOutline} onPress={venda.onEntrar} activeOpacity={0.85} accessibilityRole="button">
        <Text style={styles.ctaOutlineText}>Entrar para assinar o {plano.nome}</Text>
        <MaterialCommunityIcons name="arrow-right" size={17} color={cores.primaryLight} />
      </TouchableOpacity>
    );
  }
  if (!venda.oferta) {
    return (
      <View style={styles.ctaIndisponivel}>
        <Text style={styles.ctaIndisponivelText}>
          {periodo === 'anual' ? 'O plano anual' : 'Este plano'} ainda não está à venda na Google Play.
        </Text>
      </View>
    );
  }
  const travado = venda.comprando || carregandoPlano || !acoesDisponiveis;
  return (
    <TouchableOpacity
      style={[styles.ctaOutline, !acoesDisponiveis && styles.ctaDisabled]}
      onPress={venda.onAssinar}
      activeOpacity={0.85}
      disabled={travado}
      accessibilityRole="button"
      accessibilityState={{ disabled: travado, busy: venda.comprando }}
    >
      {venda.comprando ? (
        <ActivityIndicator size="small" color={cores.primaryLight} />
      ) : (
        <>
          <MaterialCommunityIcons name="google-play" size={17} color={cores.primaryLight} />
          <Text style={styles.ctaOutlineText}>
            {`${plano.cta} — ${venda.oferta.precoTexto}${periodo === 'anual' ? '/ano' : '/mês'}`}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/**
 * Comparativo Grátis × Pro × Empresa. A coluna do plano ATUAL do usuário ganha
 * um selo e um leve realce — é assim que a tela deixa óbvio "o que você já tem"
 * (e, por contraste, o que ganharia ao subir). Puro informativo: nenhum CTA.
 */
function ComparativoTabela({
  planoAtualId,
  ehDesktop,
  precosDaFonte = true,
}: {
  planoAtualId: PlanoId;
  ehDesktop?: boolean;
  /** false quando quem cobra é a Google Play: o preço válido é o do card (da loja),
   *  então a tabela não repete o da Stripe — só compara recursos. */
  precosDaFonte?: boolean;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const colunas: { id: PlanoId; nome: string; precoMensal: number | null }[] = [
    { id: 'gratis', nome: 'Grátis', precoMensal: null },
    { id: 'pro', nome: 'Pro', precoMensal: PRECO_PRO.mensalCentavos },
    { id: 'empresa', nome: 'Empresa', precoMensal: PRECO_EMPRESA.mensalCentavos },
  ];

  function renderCelula(v: Celula, atual: boolean) {
    if (typeof v === 'string') {
      return <Text style={[styles.compValor, atual && styles.compValorAtual]}>{v}</Text>;
    }
    if (v) {
      return <MaterialCommunityIcons name="check-circle" size={18} color={atual ? cores.success : cores.accentLight} />;
    }
    return <MaterialCommunityIcons name="minus" size={16} color={cores.onSurfaceMuted} />;
  }

  return (
    <AnimatedEntrance index={6}>
      <View style={styles.compWrap}>
        <Text style={styles.compTitulo}>Compare os planos</Text>
        <Text style={styles.compSub}>O que cada plano libera. Sua coluna destacada é o que você já tem hoje.</Text>

        <View style={[styles.compTabela, ehDesktop && styles.compTabelaDesktop]}>
          {/* Cabeçalho: nomes + preço mensal (da fonte) + selo "Atual". */}
          <View style={styles.compHeaderRow}>
            <View style={styles.compLabelCell} />
            {colunas.map((c) => {
              const atual = c.id === planoAtualId;
              return (
                <View key={c.id} style={[styles.compHeadCell, atual && styles.compColAtual]}>
                  <Text style={[styles.compHeadNome, atual && styles.compHeadNomeAtual]}>{c.nome}</Text>
                  {c.precoMensal === null || precosDaFonte ? (
                    <Text style={styles.compHeadPreco}>{c.precoMensal === null ? 'Grátis' : `${reais(c.precoMensal)}/mês`}</Text>
                  ) : null}
                  {atual ? (
                    <View style={styles.compAtualPill}><Text style={styles.compAtualPillText}>Atual</Text></View>
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* Linhas de recurso. */}
          {LINHAS_COMPARATIVO.map((linha, i) => (
            <View key={i} style={[styles.compRow, i % 2 === 1 && styles.compRowZebra]}>
              <View style={styles.compLabelCell}>
                <Text style={styles.compLabelText}>{linha.rotulo}</Text>
              </View>
              <View style={[styles.compCell, planoAtualId === 'gratis' && styles.compColAtual]}>{renderCelula(linha.gratis, planoAtualId === 'gratis')}</View>
              <View style={[styles.compCell, planoAtualId === 'pro' && styles.compColAtual]}>{renderCelula(linha.pro, planoAtualId === 'pro')}</View>
              <View style={[styles.compCell, planoAtualId === 'empresa' && styles.compColAtual]}>{renderCelula(linha.empresa, planoAtualId === 'empresa')}</View>
            </View>
          ))}
        </View>

        {/* Resumo do anual — informação completa (vale no iOS também, sem CTA).
            Some quando quem cobra é a Google Play (o preço lá é o do card). */}
        {precosDaFonte ? (
        <Text style={styles.compAnualNota}>
          No plano anual (−{DESCONTO_ANUAL_ROTULO}): Pro por {reais(PRECO_PRO.anualPorMesCentavos)}/mês ({reais(PRECO_PRO.anualCentavos)}/ano) e
          Empresa por {reais(PRECO_EMPRESA.anualPorMesCentavos)}/mês ({reais(PRECO_EMPRESA.anualCentavos)}/ano).
        </Text>
        ) : null}
      </View>
    </AnimatedEntrance>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },

  // Conteúdo da rolagem. No desktop ganha largura máxima central (fim do layout
  // "esticado como celular") e mais respiro; no mobile é o padding de sempre.
  scroll: { padding: Spacing.base, paddingBottom: 48 },
  scrollDesktop: { paddingHorizontal: 32, paddingTop: 32, paddingBottom: 64, maxWidth: 1160, width: '100%', alignSelf: 'center' },
  // Planos lado a lado no desktop, larguras iguais e mesma altura (stretch).
  cardsRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.base, marginTop: Spacing.xs },
  cardCell: { flex: 1 },
  cardFrameDesktop: { flex: 1, marginBottom: 0 },
  cardPlainDesktop: { flex: 1, marginBottom: 0 },
  cardBodyDesktop: { flex: 1 },
  ctaSpacer: { flex: 1, minHeight: Spacing.base },
  ctaDisabled: { opacity: 0.45 },

  // Aviso de erro (mesmo padrão visual do cobrancaAviso em HomeScreen.tsx).
  cobrancaAviso: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.3)', borderRadius: BorderRadius.xl, padding: Spacing.md, marginBottom: Spacing.base },
  cobrancaAvisoTexto: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant },
  cobrancaAvisoAcao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  // Alvo de toque de 44px no "Tentar de novo" (o texto sozinho é baixo demais).
  avisoAcaoHit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  trialCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderColor: comAlfa(c.accentLight, 0.35), backgroundColor: comAlfa(c.accentLight, 0.08), borderRadius: BorderRadius.xl, padding: Spacing.md, marginBottom: Spacing.base },
  trialTitle: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  trialText: { fontSize: 12.5, lineHeight: 18, color: c.onSurfaceVariant, marginTop: 3 },
  trialButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, marginTop: 10, borderRadius: BorderRadius.md, backgroundColor: c.primary },
  trialButtonText: { color: c.onPrimary, fontSize: 13.5, fontWeight: '800' },
  contextoGateCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderColor: comAlfa(c.accentLight, 0.35), backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.xl, padding: Spacing.md, marginBottom: Spacing.base },
  contextoGateTitle: { fontSize: 14.5, fontWeight: '800', color: c.onSurface },
  contextoGateText: { fontSize: 12.5, lineHeight: 18, color: c.onSurfaceVariant, marginTop: 3 },

  intro: { alignItems: 'center', paddingVertical: Spacing.base },
  // Era '#fff' fixo sobre o fundo da PÁGINA (c.background) — ilegível no claro.
  introTitle: { fontSize: 19, fontWeight: '800', color: c.onSurface, marginTop: 10, textAlign: 'center' },
  introSub: { fontSize: 13, color: c.onSurfaceVariant, textAlign: 'center', marginTop: 6, lineHeight: 19, paddingHorizontal: 6 },

  // Pagante (conta limpa)
  assinanteHero: { alignItems: 'center', paddingVertical: Spacing.lg },
  // Era '#fff' fixo sobre o fundo da PÁGINA (c.background) — ilegível no claro.
  assinanteTitle: { fontSize: 20, fontWeight: '800', color: c.onSurface, marginTop: 12, textAlign: 'center' },
  assinanteSub: { fontSize: 13.5, color: c.onSurfaceVariant, textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 8 },
  assinanteForte: { color: c.accentLight, fontWeight: '800' },
  assinaturaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: BorderRadius.md, paddingVertical: 15, marginTop: Spacing.base,
    // rgba(11,111,206,x) era o primaryLight estático (mesma cor do texto/borda
    // ao lado) — vira o primaryLight do tema.
    borderWidth: 1.5, borderColor: c.primaryLight, backgroundColor: comAlfa(c.primaryLight, 0.10),
  },
  assinaturaBtnText: { fontSize: 15, fontWeight: '800', color: c.primaryLight },

  toggle: { flexDirection: 'row', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.outline, padding: 4, marginBottom: Spacing.lg, alignSelf: 'center' },
  // minHeight 44 garante o alvo de toque mínimo mesmo com o texto pequeno.
  toggleOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingHorizontal: 26, paddingVertical: 9, borderRadius: BorderRadius.full },
  toggleOptActive: { backgroundColor: c.primary, ...sombrasDe(c).sm },
  toggleText: { fontSize: 13.5, fontWeight: '700', color: c.onSurfaceVariant },
  // Era '#fff' fixo sobre fundo chapado c.primary — vira onPrimary (contraste
  // calculado), correto pra qualquer cor de marca escolhida pelo usuário.
  toggleTextActive: { color: c.onPrimary },
  toggleBadge: { backgroundColor: c.successLight, borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 2 },
  toggleBadgeText: { fontSize: 10, fontWeight: '800', color: c.success },

  cardFrame: { borderRadius: BorderRadius.xl + 2, padding: 2, marginBottom: Spacing.base },
  cardPlain: { borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outline, marginBottom: Spacing.base, backgroundColor: c.surface, ...sombrasDe(c).sm },
  // rgba(43,215,135,x) era o success estático — vira o success do tema.
  cardAtual: { borderColor: comAlfa(c.success, 0.35) },
  cardBody: { backgroundColor: c.surface, borderRadius: BorderRadius.xl, padding: Spacing.lg },

  cardHead: { flexDirection: 'row', alignItems: 'flex-start' },
  // rgba(127,233,245,x) era o accentLight estático — vira o accentLight do tema.
  cardIcon: { width: 44, height: 44, borderRadius: BorderRadius.chip, backgroundColor: comAlfa(c.accentLight, 0.12), borderWidth: 1, borderColor: comAlfa(c.accentLight, 0.3), justifyContent: 'center', alignItems: 'center' },
  cardIconDestaque: { backgroundColor: c.accentLight, borderColor: c.accentLight },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  // Era '#fff' fixo sobre c.surface (cardBody) — ilegível no claro.
  cardName: { fontSize: 20, fontWeight: '800', color: c.onSurface },
  popular: { backgroundColor: c.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
  // Era '#0A1626' fixo — vira o ink de contraste calculado sobre accentLight.
  popularText: { fontSize: 9.5, fontWeight: '800', color: textoSobre(c.accentLight), letterSpacing: 0.6 },
  atualPill: { backgroundColor: c.successLight, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
  atualPillText: { fontSize: 10, fontWeight: '800', color: c.success },
  cardTagline: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 4, lineHeight: 18 },

  priceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: Spacing.base, marginBottom: 4 },
  // Era '#fff' fixo sobre c.surface (cardBody) — ilegível no claro.
  price: { ...Typography.valueLarge, color: c.onSurface },
  priceDestaque: { color: c.accentLight },
  pricePeriod: { fontSize: 13.5, color: c.onSurfaceVariant, fontWeight: '600', marginLeft: 6, marginBottom: 6 },
  priceSaveBadge: { backgroundColor: c.successLight, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8, marginBottom: 7 },
  priceSaveBadgeText: { fontSize: 10.5, fontWeight: '800', color: c.success },
  // Linha do anual (informação): equivalente /mês, total do ano e −20%.
  notaAnual: { fontSize: 12.5, color: c.onSurfaceVariant, fontWeight: '600', marginTop: 2, lineHeight: 17 },

  beneficios: { marginTop: Spacing.base, gap: 10 },
  beneficioRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  beneficioText: { flex: 1, fontSize: 13.5, color: c.onSurface, lineHeight: 19 },

  // 12× honesto — bloco discreto, tom de "informação", nunca de oferta.
  doze: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: Spacing.base, padding: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: c.surfaceVariant, borderWidth: 1, borderColor: c.outline },
  dozeText: { flex: 1, fontSize: 12, color: c.onSurfaceVariant, lineHeight: 17 },

  // ctaGrad é o preenchimento em gradiente `primaryDiagonal` (= gradientes.brand,
  // deriva da marca) — a cor do texto/ícone vem de `gradientes.sobreBrand`
  // aplicada inline no ponto de uso (StyleSheet de módulo não lê o tema).
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: BorderRadius.md, paddingVertical: 14, marginTop: Spacing.lg },
  ctaGradText: { fontSize: 15, fontWeight: '800' },
  ctaOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: BorderRadius.md, paddingVertical: 13, marginTop: Spacing.lg, borderWidth: 1.5, borderColor: c.primaryLight, backgroundColor: comAlfa(c.primaryLight, 0.10) },
  ctaPix: { marginTop: Spacing.sm },
  ctaOutlineText: { fontSize: 14.5, fontWeight: '800', color: c.primaryLight },
  ctaAtual: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: BorderRadius.md, paddingVertical: 13, marginTop: Spacing.lg, backgroundColor: c.successLight, borderWidth: 1, borderColor: comAlfa(c.success, 0.3) },
  ctaAtualText: { fontSize: 14.5, fontWeight: '800', color: c.success },
  // iOS (Guideline 3.1.1): estado neutro no lugar do CTA de compra — nem venda,
  // nem "plano atual" (não é), só o aviso honesto de indisponibilidade.
  ctaIndisponivel: { alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: BorderRadius.md, paddingVertical: 13, marginTop: Spacing.lg, backgroundColor: c.surfaceVariant, borderWidth: 1, borderColor: c.outline },
  ctaIndisponivelText: { fontSize: 13.5, fontWeight: '700', color: c.onSurfaceVariant, textAlign: 'center' },

  ctaSecundario: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, marginTop: 6, paddingVertical: 9 },
  ctaSecundarioText: { fontSize: 13.5, fontWeight: '700', color: c.onSurfaceVariant },

  rodape: { fontSize: 12.5, color: c.onSurfaceMuted, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18, paddingHorizontal: 12 },
  // Rodapé da venda pela Google Play: explicação + "Restaurar compras".
  playRodape: { alignItems: 'center', marginTop: Spacing.xs },

  // ─── Comparativo ──────────────────────────────────────────────────────────
  compWrap: { marginTop: Spacing.lg },
  compTitulo: { fontSize: 17, fontWeight: '800', color: c.onSurface, textAlign: 'center' },
  compSub: { fontSize: 12.5, color: c.onSurfaceVariant, textAlign: 'center', marginTop: 4, marginBottom: Spacing.base, paddingHorizontal: 12, lineHeight: 17 },
  compTabela: { borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, overflow: 'hidden' },
  compTabelaDesktop: { maxWidth: 860, width: '100%', alignSelf: 'center' },
  compHeaderRow: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: c.outline, backgroundColor: c.surfaceVariant },
  compHeadCell: { width: 84, alignItems: 'center', justifyContent: 'flex-start', paddingVertical: Spacing.sm, paddingHorizontal: 4, gap: 3 },
  compHeadNome: { fontSize: 13, fontWeight: '800', color: c.onSurface },
  compHeadNomeAtual: { color: c.success },
  compHeadPreco: { fontSize: 10.5, color: c.onSurfaceVariant, fontWeight: '600', textAlign: 'center' },
  compAtualPill: { backgroundColor: c.successLight, borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 1 },
  compAtualPillText: { fontSize: 8.5, fontWeight: '800', color: c.success, letterSpacing: 0.3 },
  compRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  compRowZebra: { backgroundColor: comAlfa(c.onSurface, 0.03) },
  compLabelCell: { flex: 1, paddingVertical: 8, paddingHorizontal: Spacing.sm, justifyContent: 'center' },
  compLabelText: { fontSize: 12.5, color: c.onSurface, lineHeight: 16 },
  compCell: { width: 84, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  // Realce leve da coluna do plano atual — a barra de fundo que "puxa o olho".
  compColAtual: { backgroundColor: comAlfa(c.success, 0.08) },
  compValor: { fontSize: 11.5, fontWeight: '700', color: c.onSurfaceVariant, textAlign: 'center' },
  compValorAtual: { color: c.success },
  compAnualNota: { fontSize: 12, color: c.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.md, lineHeight: 17, paddingHorizontal: 8 },
});
