import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking, ActivityIndicator, Platform } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
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
import { getPlanoAtual, getPlanoCacheado, PlanoId } from '../services/planos';
import { temAcessoRecurso, IA_USOS_GRATIS_MES, type Recurso } from '../services/entitlements';
import {
  PRECO_PRO,
  PRECO_EMPRESA,
  DESCONTO_ANUAL_ROTULO,
  reais,
  precoNoPeriodo,
  type PeriodoCobranca,
} from '../services/precosPlanos';
import { aplicarSeo } from '../utils/seoWeb';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
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
const COMPRA_NO_APP = Platform.OS !== 'ios';

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
  beneficios: string[];
  cta: string;
}

// Lista base dos planos. Preço NUNCA é literal aqui — vem de precosPlanos (a
// fonte conferida contra a Stripe). `atual` é decidido em runtime (plano lido de
// getPlanoAtual()), por isso não entra aqui como valor fixo.
const PLANOS_BASE: Omit<Plano, 'atual'>[] = [
  {
    id: 'gratis',
    nome: 'Grátis',
    preco: null,
    tagline: 'Tudo que você precisa pra começar a fechar negócio.',
    icon: 'rocket-launch-outline',
    cta: 'Seu plano atual',
    beneficios: [
      'Orçamentos e recibos ilimitados',
      'Catálogo de serviços e produtos',
      'Clientes e agenda',
      'Diagnóstico por código de erro (offline)',
      'Link do orçamento para o cliente',
    ],
  },
  {
    id: 'pro',
    nome: 'Pro',
    preco: PRECO_PRO,
    tagline: 'Para o autônomo que quer vender mais e ganhar tempo.',
    icon: 'crown-outline',
    destaque: true,
    cta: 'Assinar Pro',
    beneficios: [
      'Tudo do plano Grátis',
      'IA sem limite mensal (voz, chat e diagnóstico)',
      'Relatórios de faturamento e conversão',
      'Metas de vendas e acompanhamento por período',
      'PDF sem a marca OLLI e modelos premium',
      'Suporte prioritário por WhatsApp',
    ],
  },
  {
    id: 'empresa',
    nome: 'Empresa',
    preco: PRECO_EMPRESA,
    tagline: 'Para equipes que atendem em campo todos os dias.',
    icon: 'office-building-outline',
    cta: 'Assinar Empresa',
    beneficios: [
      'Tudo do plano Pro',
      'Vários técnicos e permissões por papel',
      'Equipe ao vivo no mapa',
      'Painel de gestão da empresa',
      'Suporte prioritário',
    ],
  },
];

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
  { rotulo: 'Orçamentos e recibos ilimitados', gratis: true, pro: true, empresa: true },
  { rotulo: 'Catálogo, clientes e agenda', gratis: true, pro: true, empresa: true },
  { rotulo: 'Diagnóstico por código de erro (offline)', gratis: true, pro: true, empresa: true },
  { rotulo: 'Link do orçamento para o cliente', gratis: true, pro: true, empresa: true },
];

/** Rótulo humano de cada recurso gateado. Fiel às descrições em entitlements.ts —
 *  a leitura comercial do que o mapa RECURSOS_POR_PLANO já decide em código. */
const RECURSO_LABEL: Record<Recurso, string> = {
  ia_ilimitada: 'IA sem limite mensal (voz, chat e diagnóstico)',
  relatorios: 'Relatórios de faturamento e conversão',
  metas: 'Metas de vendas e acompanhamento',
  radar_clientes: 'Radar de clientes sumidos (lista completa)',
  relatorio_dia: 'Relatório do dia falado',
  modelos_pdf_premium: 'Modelos premium de PDF',
  remove_olli_brand: 'PDF sem a marca OLLI',
  equipe: 'Vários técnicos e permissões por papel',
  mapa_equipe: 'Equipe ao vivo no mapa',
  dashboard_empresa: 'Painel de gestão da empresa',
};

// Ordem de exibição: recursos do Pro primeiro, depois os exclusivos da Empresa.
// `ia_ilimitada` sai do laço genérico porque a célula do Grátis não é ✗ e sim a
// cota "3/mês" — a IA no grátis é gate por COTA, não por plano.
const RECURSOS_GATEADOS: Recurso[] = [
  'relatorios',
  'metas',
  'radar_clientes',
  'relatorio_dia',
  'modelos_pdf_premium',
  'remove_olli_brand',
  'equipe',
  'mapa_equipe',
  'dashboard_empresa',
];

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
    gratis: temAcessoRecurso('gratis', r),
    pro: temAcessoRecurso('pro', r),
    empresa: temAcessoRecurso('empresa', r),
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
        `Comece grátis, com orçamentos e recibos ilimitados, catálogo, clientes e agenda. ` +
        `O Pro (${reais(PRECO_PRO.mensalCentavos)}/mês, ou ${reais(PRECO_PRO.anualPorMesCentavos)}/mês no anual) ` +
        `acrescenta IA sem limite, relatórios de faturamento e conversão, metas de vendas e suporte prioritário.`,
      caminho: '/planos',
    });
  }, []);

  const [periodo, setPeriodo] = useState<Periodo>('mensal');
  const [planoAtualId, setPlanoAtualId] = useState<PlanoId>('gratis');
  const [carregandoPlano, setCarregandoPlano] = useState(true);
  // 3 estados explícitos (nunca colapsar erro em vazio): `planoErro` só vira
  // true numa falha de rede real; o plano exibido some do cache/última leitura.
  const [planoErro, setPlanoErro] = useState(false);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<PlanoId | null>(null);

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
    } catch {
      setPlanoErro(true);
    } finally {
      setCarregandoPlano(false);
    }
  }, []);

  // Recarrega ao focar a tela — cobre a volta do checkout/portal Stripe (o
  // usuário sai para o navegador e volta pelo botão "voltar" do sistema).
  useFocusEffect(
    useCallback(() => {
      carregarPlano();
    }, [carregarPlano]),
  );

  const planos: Plano[] = PLANOS_BASE.map((p) => ({ ...p, atual: p.id === planoAtualId }));
  // Conta limpa (Frente 2): quem já paga não vê discurso de venda. Vê um card
  // discreto "Sua assinatura" que leva à AssinaturaScreen (faturas, cobrança,
  // trocar de plano/cartão e cancelar ficam lá, no portal seguro da Stripe).
  const ehPagante = planoAtualId !== 'gratis';
  const nomePlanoAtual = planoAtualId === 'empresa' ? 'Empresa' : planoAtualId === 'pro' ? 'Pro' : 'Grátis';

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
    Haptics.selectionAsync().catch(() => {});
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
    Haptics.selectionAsync().catch(() => {});
    // Pro e Empresa são ambos assináveis via Stripe Checkout.
    if (p.id === 'pro' || p.id === 'empresa') {
      assinarPlano(p);
    }
  }

  // 12× no cartão: só o Pro tem produto avulso. Força o checkout 'pro_12x'
  // (valor cheio do ano), independentemente da aba mensal/anual selecionada.
  function pagar12x(p: Plano) {
    Haptics.selectionAsync().catch(() => {});
    assinarPlano(p, 'pro_12x');
  }

  return (
    <View style={styles.container}>
      <GradientHeader title="Planos OLLI" subtitle="Escolha como crescer" onBack={() => goBackOrHome(nav)} />

      <ScrollView contentContainerStyle={[styles.scroll, ehDesktop && styles.scrollDesktop]} showsVerticalScrollIndicator={false}>
        {planoErro ? (
          <View style={styles.cobrancaAviso}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
            <Text style={styles.cobrancaAvisoTexto}>Não deu para atualizar seu plano agora. O que está na tela pode estar desatualizado.</Text>
            <TouchableOpacity onPress={carregarPlano} activeOpacity={0.8} style={styles.avisoAcaoHit}>
              <Text style={styles.cobrancaAvisoAcao}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {ehPagante ? (
          /* PAGANTE — sem propaganda: card discreto que leva à AssinaturaScreen. */
          <AnimatedEntrance index={0}>
            <View style={styles.assinanteHero}>
              <OlliMascot size={44} onDark />
              <Text style={styles.assinanteTitle}>Você já é assinante</Text>
              <Text style={styles.assinanteSub}>
                Obrigado por apoiar o OLLI! Seu plano <Text style={styles.assinanteForte}>{nomePlanoAtual}</Text> está ativo. {COMPRA_NO_APP
                  ? 'Faturas, cobrança, troca de plano/cartão e cancelamento ficam na sua página de assinatura.'
                  : 'Faturas, cobrança, atualização de cartão e cancelamento ficam na sua página de assinatura.'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.assinaturaBtn}
              activeOpacity={0.85}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Assinatura' as never); }}
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
              {COMPRA_NO_APP
                ? 'O plano Grátis já traz orçamentos, recibos, clientes e agenda ilimitados — sem fidelidade e sem surpresa. Pro e Empresa podem ser assinados direto no app: mensal ou anual com desconto.'
                : 'O plano Grátis já traz orçamentos, recibos, clientes e agenda ilimitados — sem fidelidade e sem surpresa. A assinatura dos planos Pro e Empresa ainda não está disponível no iPhone.'}
            </Text>
          </View>
        </AnimatedEntrance>

        {/* ABAS MENSAL / ANUAL — a anual mostra a economia; o preço nos cards segue
            a aba. iOS (Guideline 3.1.1): as abas ficam escondidas (são a escolha de
            uma compra que este aparelho não faz) — mas o preço anual continua
            visível como INFORMAÇÃO na linha "no anual…" dentro de cada card. */}
        {COMPRA_NO_APP && (
        <AnimatedEntrance index={1}>
          <View style={styles.toggle} accessibilityRole="tablist">
            <TouchableOpacity
              style={[styles.toggleOpt, periodo === 'mensal' && styles.toggleOptActive]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setPeriodo('mensal'); }}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: periodo === 'mensal' }}
            >
              <Text style={[styles.toggleText, periodo === 'mensal' && styles.toggleTextActive]}>Mensal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOpt, periodo === 'anual' && styles.toggleOptActive]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setPeriodo('anual'); }}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: periodo === 'anual' }}
            >
              <Text style={[styles.toggleText, periodo === 'anual' && styles.toggleTextActive]}>Anual</Text>
              <View style={styles.toggleBadge}><Text style={styles.toggleBadgeText}>-{DESCONTO_ANUAL_ROTULO}</Text></View>
            </TouchableOpacity>
          </View>
        </AnimatedEntrance>
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
                carregandoAcao={acaoEmAndamento === p.id}
                onPress={() => escolher(p)}
                onFalarSuporte={() => falarComSuporte(p)}
                onPagar12x={() => pagar12x(p)}
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
        {COMPRA_NO_APP && (
        <Text style={styles.rodape}>Mensal e anual são assinaturas que renovam automaticamente — cancele quando quiser no "Gerenciar assinatura". O 12x sem juros é um pagamento único parcelado no cartão que libera o Pro por 12 meses. 💙</Text>
        )}
        </>
        )}

        {/* COMPARATIVO — sempre visível (info, não venda): deixa óbvio o que cada
            plano dá e destaca o que o usuário JÁ tem. Sem CTA aqui. */}
        <ComparativoTabela planoAtualId={planoAtualId} ehDesktop={ehDesktop} />
      </ScrollView>
    </View>
  );
}

function PlanoCard({
  plano,
  periodo,
  ehDesktop,
  carregandoPlano,
  carregandoAcao,
  onPress,
  onFalarSuporte,
  onPagar12x,
}: {
  plano: Plano;
  periodo: Periodo;
  ehDesktop?: boolean;
  carregandoPlano: boolean;
  carregandoAcao: boolean;
  onPress: () => void;
  onFalarSuporte: () => void;
  onPagar12x: () => void;
}) {
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  // Ink de contraste sobre `accentLight` (ícone/badge do plano "mais popular").
  const textoSobreAccent = textoSobre(cores.accentLight);
  // Preço exibido — sempre da fonte. No iOS a aba fica escondida, então `periodo`
  // permanece 'mensal' e o card mostra o mensal; o anual aparece na linha "no
  // anual…" logo abaixo, como informação.
  const preco = plano.preco;
  const exibido = preco ? precoNoPeriodo(preco, periodo) : { valor: 'Grátis', sufixo: '', nota: null };
  // Linha secundária de preço:
  //  - aba anual (Android/web): o total do ano + a economia;
  //  - caso contrário: o anual como informação (equivalente /mês, total, −20%).
  const notaAnual =
    !preco
      ? null
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
              <View style={styles.popular}><Text style={styles.popularText}>MAIS POPULAR</Text></View>
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
        {periodo === 'anual' && preco && COMPRA_NO_APP ? (
          <View style={styles.priceSaveBadge}><Text style={styles.priceSaveBadgeText}>-{DESCONTO_ANUAL_ROTULO}</Text></View>
        ) : null}
      </View>
      {notaAnual ? <Text style={styles.notaAnual}>{notaAnual}</Text> : null}

      {/* BENEFÍCIOS */}
      <View style={styles.beneficios}>
        {plano.beneficios.map((b, i) => (
          <View key={i} style={styles.beneficioRow}>
            <MaterialCommunityIcons
              name="check-circle"
              size={17}
              color={plano.destaque ? cores.accentLight : cores.success}
            />
            <Text style={styles.beneficioText}>{b}</Text>
          </View>
        ))}
      </View>

      {/* 12× — a VERDADE, não um desconto. iOS (Guideline 3.1.1): escondido, pois
          descreve uma forma de pagamento que este aparelho não realiza. */}
      {COMPRA_NO_APP && linha12x ? (
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
      ) : plano.destaque ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.88} disabled={carregandoAcao || carregandoPlano}>
          <LinearGradient colors={gradientes.primaryDiagonal} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.ctaGrad, sombrasDe(cores).glowCyan]}>
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
        <TouchableOpacity style={styles.ctaOutline} onPress={onPress} activeOpacity={0.85} disabled={carregandoAcao}>
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

      {/* Pro: pagar em 12× no cartão. iOS: escondido (é compra). Fica DEPOIS do
          CTA principal e é claramente secundário — a verdade sobre o custo já
          está na linha acima, então aqui é só o caminho, não a promessa. */}
      {COMPRA_NO_APP && !plano.atual && plano.id === 'pro' && linha12x ? (
        <TouchableOpacity style={styles.ctaSecundario} onPress={onPagar12x} activeOpacity={0.8} disabled={carregandoAcao}>
          <MaterialCommunityIcons name="credit-card-outline" size={16} color={cores.onSurfaceVariant} />
          <Text style={styles.ctaSecundarioText}>Pagar em 12x no cartão</Text>
        </TouchableOpacity>
      ) : null}

      {/* Empresa: CTA secundário para tirar dúvidas antes de assinar. iOS
          (Guideline 3.1.1): escondido — sem o botão de compra, este WhatsApp
          viraria o caminho de venda por fora do app, o link-out que a
          guideline proíbe. */}
      {COMPRA_NO_APP && !plano.atual && plano.id === 'empresa' && (
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
 * Comparativo Grátis × Pro × Empresa. A coluna do plano ATUAL do usuário ganha
 * um selo e um leve realce — é assim que a tela deixa óbvio "o que você já tem"
 * (e, por contraste, o que ganharia ao subir). Puro informativo: nenhum CTA.
 */
function ComparativoTabela({ planoAtualId, ehDesktop }: { planoAtualId: PlanoId; ehDesktop?: boolean }) {
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
                  <Text style={styles.compHeadPreco}>{c.precoMensal === null ? 'Grátis' : `${reais(c.precoMensal)}/mês`}</Text>
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

        {/* Resumo do anual — informação completa (vale no iOS também, sem CTA). */}
        <Text style={styles.compAnualNota}>
          No plano anual (−{DESCONTO_ANUAL_ROTULO}): Pro por {reais(PRECO_PRO.anualPorMesCentavos)}/mês ({reais(PRECO_PRO.anualCentavos)}/ano) e
          Empresa por {reais(PRECO_EMPRESA.anualPorMesCentavos)}/mês ({reais(PRECO_EMPRESA.anualCentavos)}/ano).
        </Text>
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

  // Aviso de erro (mesmo padrão visual do cobrancaAviso em HomeScreen.tsx).
  cobrancaAviso: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.3)', borderRadius: BorderRadius.xl, padding: Spacing.md, marginBottom: Spacing.base },
  cobrancaAvisoTexto: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant },
  cobrancaAvisoAcao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  // Alvo de toque de 44px no "Tentar de novo" (o texto sozinho é baixo demais).
  avisoAcaoHit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },

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
