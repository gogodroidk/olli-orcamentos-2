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
import { aplicarSeo } from '../utils/seoWeb';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * iOS (Guideline 3.1.1): a Apple exige In-App Purchase para assinatura consumida
 * dentro do app e proíbe abrir o checkout num navegador externo (link-out) — e
 * proíbe também qualquer caminho que SUBSTITUA a compra, como um "fale conosco"
 * que leva a fechar por fora, ou qualquer convite a TROCAR de plano por fora do
 * app. Não há StoreKit implementado ainda, então no iOS ficam escondidos: botão
 * de assinatura, toggle de período, rodapé de venda, o CTA "Falar com a gente"
 * da Empresa e qualquer menção a "trocar de plano" (inclusive no card de quem já
 * é assinante, mais abaixo). O plano atual (se já for pagante) continua visível
 * — isso é permitido; o proibido é vender, anunciar upgrade/troca, ou apontar
 * caminho para vender. `COMPRA_NO_APP` centraliza esse desvio para não espalhar
 * `if (Platform.OS === 'ios')` pela tela.
 * Gerenciar uma assinatura JÁ existente (feita fora do iOS) acontece noutra
 * tela (AssinaturaScreen, via o botão "Sua assinatura" abaixo) — não há portal
 * Stripe nem código dele nesta tela.
 */
const COMPRA_NO_APP = Platform.OS !== 'ios';

/** Período de cobrança escolhido no toggle de 3 opções. */
type Periodo = 'mensal' | 'anual' | 'parcelado';

interface Plano {
  id: PlanoId;
  nome: string;
  preco: string;
  periodo?: string;
  /** Preço mensal em reais (planos pagos). Usado para calcular o anual real (mensal*12*0.8). */
  precoMensal?: number;
  tagline: string;
  icon: string;
  destaque?: boolean;
  atual?: boolean;
  beneficios: string[];
  cta: string;
}

// Formata um valor inteiro em reais como "R$ N" (sem centavos, pt-BR).
function reais(n: number): string {
  return `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
}

/**
 * Preço/período a exibir conforme o toggle de 3 opções.
 *  - mensal    → preço base "/mês"
 *  - anual     → total do ano com -20% "/ano"
 *  - parcelado → valor cheio (12 × mensal) parcelado, exibido como total "/ano"
 *                (a linha "ou 12x de R$ N" fica no cartão via `parcelaExibida`).
 */
// O parcelamento 12x sem juros só existe para o Pro (único produto avulso na
// Stripe). A Empresa é sempre assinatura, então no toggle "12x" ela é exibida
// no seu preço mensal (e o checkout dela usa a assinatura mensal).
function suporta12x(plano: Plano): boolean {
  return plano.id === 'pro';
}

function precoExibido(plano: Plano, periodo: Periodo): { preco: string; periodo?: string } {
  if (!plano.precoMensal) return { preco: plano.preco, periodo: plano.periodo };
  if (periodo === 'anual') {
    return { preco: reais(plano.precoMensal * 12 * 0.8), periodo: '/ano' };
  }
  if (periodo === 'parcelado' && suporta12x(plano)) {
    // Avulso 12x sem juros: valor cheio do ano (sem desconto), pago em 12 parcelas.
    return { preco: reais(plano.precoMensal * 12), periodo: '/ano' };
  }
  return { preco: plano.preco, periodo: plano.periodo };
}

/** Linha "ou 12x de R$ N sem juros" no modo parcelado (só planos que suportam 12x). */
function parcelaExibida(plano: Plano, periodo: Periodo): string | null {
  if (periodo !== 'parcelado' || !plano.precoMensal || !suporta12x(plano)) return null;
  return `ou 12x de ${reais(plano.precoMensal)} sem juros`;
}

// Lista base dos planos. `atual` é decidido em runtime (plano lido de getPlanoAtual()),
// por isso não entra aqui como valor fixo.
const PLANOS_BASE: Omit<Plano, 'atual'>[] = [
  {
    id: 'gratis',
    nome: 'Grátis',
    preco: 'R$ 0',
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
    preco: 'R$ 39',
    periodo: '/mês',
    precoMensal: 39,
    tagline: 'Para o autônomo que quer vender mais e ganhar tempo.',
    icon: 'crown-outline',
    destaque: true,
    cta: 'Assinar Pro — R$ 39/mês',
    beneficios: [
      'Tudo do plano Grátis',
      'Relatórios de faturamento e conversão',
      'Metas de vendas e acompanhamento por período',
      'Suporte prioritário por WhatsApp',
    ],
  },
  {
    id: 'empresa',
    nome: 'Empresa',
    preco: 'R$ 99',
    periodo: '/mês',
    precoMensal: 99,
    tagline: 'Para equipes que atendem em campo todos os dias.',
    icon: 'office-building-outline',
    cta: 'Assinar Empresa — R$ 99/mês',
    beneficios: [
      'Tudo do plano Pro',
      'Vários técnicos e permissões por papel',
      'Equipe ao vivo no mapa',
      'Suporte prioritário',
    ],
  },
];

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
  // A descrição é DERIVADA de PLANOS_BASE (acima), nunca escrita de memória: ela é
  // indexada pelo Google e vira o cartão do link compartilhado. Já erramos aqui —
  // "o Pro libera orçamentos ilimitados" era falso (o Grátis já os tem) e "o Empresa
  // acrescenta os recursos de equipe" vendia o que a própria tela marca "(em breve)".
  // Ao mexer nos planos, reveja este texto.
  useEffect(() => {
    aplicarSeo({
      titulo: 'Planos e preços — OLLI Orçamentos',
      descricao:
        'Comece grátis, com orçamentos e recibos ilimitados, catálogo, clientes e agenda. O Pro (R$ 39/mês) acrescenta relatórios de faturamento e conversão, metas de vendas e suporte prioritário.',
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

  // Resolve (plano do cartão + período do toggle) no identificador que o worker
  // aceita em /stripe/checkout. O 12x (parcelado) só existe para o Pro — a
  // Empresa não tem produto avulso, então no toggle "12x" ela cai na assinatura
  // mensal (mesmo preço mensal exibido no cartão).
  function planoCheckout(id: PlanoId, per: Periodo): string {
    if (id === 'pro') {
      if (per === 'anual') return 'pro_anual';
      if (per === 'parcelado') return 'pro_12x';
      return 'pro';
    }
    // empresa
    return per === 'anual' ? 'empresa_anual' : 'empresa';
  }

  async function assinarPlano(p: Plano) {
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
      await abrirUrlPagamento({ plano: planoCheckout(p.id, periodo) });
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

  return (
    <View style={styles.container}>
      <GradientHeader title="Planos OLLI" subtitle="Escolha como crescer" onBack={() => goBackOrHome(nav)} />

      <ScrollView contentContainerStyle={[styles.scroll, ehDesktop && styles.scrollDesktop]} showsVerticalScrollIndicator={false}>
        {planoErro ? (
          <View style={styles.cobrancaAviso}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
            <Text style={styles.cobrancaAvisoTexto}>Não deu para atualizar seu plano agora. O que está na tela pode estar desatualizado.</Text>
            <TouchableOpacity onPress={carregarPlano} activeOpacity={0.8}>
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
                ? 'O plano Grátis já traz orçamentos, recibos, clientes e agenda ilimitados — sem fidelidade e sem surpresa. Pro e Empresa podem ser assinados direto no app: mensal, anual com desconto ou em 12x sem juros no cartão.'
                : 'O plano Grátis já traz orçamentos, recibos, clientes e agenda ilimitados — sem fidelidade e sem surpresa. A assinatura dos planos Pro e Empresa ainda não está disponível no iPhone.'}
            </Text>
          </View>
        </AnimatedEntrance>

        {/* TOGGLE MENSAL / ANUAL / 12X — anual mostra total com -20%; 12x mostra a parcela.
            iOS (Guideline 3.1.1): escondido — não faz sentido oferecer a escolha de
            período de uma compra que este aparelho não pode fazer. */}
        {COMPRA_NO_APP && (
        <AnimatedEntrance index={1}>
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleOpt, periodo === 'mensal' && styles.toggleOptActive]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setPeriodo('mensal'); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleText, periodo === 'mensal' && styles.toggleTextActive]}>Mensal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOpt, periodo === 'anual' && styles.toggleOptActive]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setPeriodo('anual'); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleText, periodo === 'anual' && styles.toggleTextActive]}>Anual</Text>
              <View style={styles.toggleBadge}><Text style={styles.toggleBadgeText}>-20%</Text></View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOpt, periodo === 'parcelado' && styles.toggleOptActive]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setPeriodo('parcelado'); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleText, periodo === 'parcelado' && styles.toggleTextActive]}>12x</Text>
              <View style={styles.toggleBadge}><Text style={styles.toggleBadgeText}>sem juros</Text></View>
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
        <Text style={styles.rodape}>Mensal e anual são assinaturas que renovam automaticamente — cancele quando quiser no "Gerenciar assinatura". O 12x sem juros é um pagamento único parcelado no cartão que libera o plano por 12 meses. 💙</Text>
        )}
        </>
        )}
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
}: {
  plano: Plano;
  periodo: Periodo;
  ehDesktop?: boolean;
  carregandoPlano: boolean;
  carregandoAcao: boolean;
  onPress: () => void;
  onFalarSuporte: () => void;
}) {
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  // Ink de contraste sobre `accentLight` (ícone/badge do plano "mais popular").
  const textoSobreAccent = textoSobre(cores.accentLight);
  const exibido = precoExibido(plano, periodo);
  const parcela = parcelaExibida(plano, periodo);
  // NB: este card só renderiza quando `!ehPagante` (ver PlanosScreen acima), ou
  // seja, `plano.atual` só é true para o card Grátis — nunca há aqui um card
  // "atual" de plano pago. Gerenciar uma assinatura paga já existente é a
  // AssinaturaScreen, não este card.

  // Rótulo do CTA coerente com o período — nunca dizer "/mês" cobrando o ano
  // inteiro (evita cobrança-surpresa/estorno). Grátis mantém o texto fixo.
  const rotuloCta = !plano.precoMensal
    ? plano.cta
    : periodo === 'anual'
      ? `Assinar ${plano.nome} — ${reais(plano.precoMensal * 12 * 0.8)}/ano`
      : periodo === 'parcelado' && suporta12x(plano)
        ? `Assinar ${plano.nome} — 12x de ${reais(plano.precoMensal)}`
        : `Assinar ${plano.nome} — ${reais(plano.precoMensal)}/mês`;
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
        <Text style={[styles.price, plano.destaque && styles.priceDestaque]}>{exibido.preco}</Text>
        {exibido.periodo ? <Text style={styles.pricePeriod}>{exibido.periodo}</Text> : null}
        {periodo === 'anual' && plano.precoMensal ? (
          <View style={styles.priceSaveBadge}><Text style={styles.priceSaveBadgeText}>-20%</Text></View>
        ) : null}
      </View>
      {parcela ? <Text style={styles.parcelaText}>{parcela}</Text> : null}

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
  toggleOpt: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingVertical: 9, borderRadius: BorderRadius.full },
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
  parcelaText: { fontSize: 13, color: c.accentLight, fontWeight: '700', marginTop: 2 },

  beneficios: { marginTop: Spacing.base, gap: 10 },
  beneficioRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  beneficioText: { flex: 1, fontSize: 13.5, color: c.onSurface, lineHeight: 19 },

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
  ctaIndisponivel: { alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.md, paddingVertical: 13, marginTop: Spacing.lg, backgroundColor: c.surfaceVariant, borderWidth: 1, borderColor: c.outline },
  ctaIndisponivelText: { fontSize: 13.5, fontWeight: '700', color: c.onSurfaceVariant, textAlign: 'center' },

  ctaSecundario: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10, paddingVertical: 9 },
  ctaSecundarioText: { fontSize: 13.5, fontWeight: '700', color: c.onSurfaceVariant },

  rodape: { fontSize: 12.5, color: c.onSurfaceMuted, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18, paddingHorizontal: 12 },
});
