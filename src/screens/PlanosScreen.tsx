import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow, Typography, Gradients } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliMascot } from '../components/OlliMascot';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { abrirWhatsApp } from '../utils/exportarDocumento';
import { WHATSAPP_SUPORTE, PAGAMENTOS_URL } from '../config';
import { supabase } from '../services/supabase';
import { getPlanoAtual, invalidarCachePlano, PlanoId } from '../services/planos';

type Nav = NativeStackNavigationProp<RootStackParamList>;

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
      'Vários técnicos e permissões por papel (em breve)',
      'Equipe ao vivo no mapa (em breve)',
      'Painel de gestão e metas da equipe (em breve)',
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
  const [periodo, setPeriodo] = useState<Periodo>('mensal');
  const [planoAtualId, setPlanoAtualId] = useState<PlanoId>('gratis');
  const [carregandoPlano, setCarregandoPlano] = useState(true);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<PlanoId | 'portal' | null>(null);

  const carregarPlano = useCallback(async (invalidarCache: boolean) => {
    if (invalidarCache) invalidarCachePlano();
    setCarregandoPlano(true);
    try {
      const resultado = await getPlanoAtual();
      setPlanoAtualId(resultado.plano);
    } finally {
      setCarregandoPlano(false);
    }
  }, []);

  // Recarrega ao focar a tela — cobre a volta do checkout/portal Stripe (o
  // usuário sai para o navegador e volta pelo botão "voltar" do sistema).
  useFocusEffect(
    useCallback(() => {
      carregarPlano(true);
    }, [carregarPlano]),
  );

  const planos: Plano[] = PLANOS_BASE.map((p) => ({ ...p, atual: p.id === planoAtualId }));

  async function abrirUrlPagamento(caminho: '/stripe/checkout' | '/stripe/portal', body?: object) {
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

      const r = await fetch(`${PAGAMENTOS_URL}${caminho}`, {
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
      await abrirUrlPagamento('/stripe/checkout', { plano: planoCheckout(p.id, periodo) });
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  async function gerenciarAssinatura() {
    setAcaoEmAndamento('portal');
    try {
      await abrirUrlPagamento('/stripe/portal');
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  // CTA secundário da Empresa: "Falar com a gente" pelo WhatsApp de suporte.
  function falarComSuporte(p: Plano) {
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

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {/* INTRO */}
        <AnimatedEntrance index={0}>
          <View style={styles.intro}>
            <OlliMascot size={44} onDark />
            <Text style={styles.introTitle}>Comece grátis. Cresça quando quiser.</Text>
            <Text style={styles.introSub}>O plano Grátis já traz orçamentos, recibos, clientes e agenda ilimitados — sem fidelidade e sem surpresa. Pro e Empresa podem ser assinados direto no app: mensal, anual com desconto ou em 12x sem juros no cartão.</Text>
          </View>
        </AnimatedEntrance>

        {/* TOGGLE MENSAL / ANUAL / 12X — anual mostra total com -20%; 12x mostra a parcela */}
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

        {/* CARTÕES */}
        {planos.map((p, i) => (
          <AnimatedEntrance key={p.id} index={2 + i}>
            <PlanoCard
              plano={p}
              periodo={periodo}
              carregandoPlano={carregandoPlano}
              carregandoAcao={acaoEmAndamento === p.id}
              carregandoPortal={acaoEmAndamento === 'portal'}
              onPress={() => escolher(p)}
              onGerenciar={gerenciarAssinatura}
              onFalarSuporte={() => falarComSuporte(p)}
            />
          </AnimatedEntrance>
        ))}

        <Text style={styles.rodape}>Mensal e anual são assinaturas que renovam automaticamente — cancele quando quiser no "Gerenciar assinatura". O 12x sem juros é um pagamento único parcelado no cartão que libera o plano por 12 meses. Algumas funções de equipe do Empresa ainda estão chegando (marcadas como "em breve"). 💙</Text>
      </ScrollView>
    </View>
  );
}

function PlanoCard({
  plano,
  periodo,
  carregandoPlano,
  carregandoAcao,
  carregandoPortal,
  onPress,
  onGerenciar,
  onFalarSuporte,
}: {
  plano: Plano;
  periodo: Periodo;
  carregandoPlano: boolean;
  carregandoAcao: boolean;
  carregandoPortal: boolean;
  onPress: () => void;
  onGerenciar: () => void;
  onFalarSuporte: () => void;
}) {
  const exibido = precoExibido(plano, periodo);
  const parcela = parcelaExibida(plano, periodo);
  const ehPlanoPagoAtivo = plano.atual && plano.id !== 'gratis';

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
    <View style={styles.cardBody}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, plano.destaque ? styles.cardIconDestaque : null]}>
          <MaterialCommunityIcons name={plano.icon as any} size={22} color={plano.destaque ? '#0A1626' : Colors.accentLight} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardName}>{plano.nome}</Text>
            {plano.destaque && (
              <View style={styles.popular}><Text style={styles.popularText}>MAIS POPULAR</Text></View>
            )}
            {plano.atual && (
              <View style={styles.atualPill}>
                <Text style={styles.atualPillText}>{ehPlanoPagoAtivo ? 'Seu plano atual' : 'Atual'}</Text>
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
              color={plano.destaque ? Colors.accentLight : Colors.success}
            />
            <Text style={styles.beneficioText}>{b}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      {ehPlanoPagoAtivo ? (
        <TouchableOpacity style={styles.ctaOutline} onPress={onGerenciar} activeOpacity={0.85} disabled={carregandoPortal}>
          {carregandoPortal ? (
            <ActivityIndicator size="small" color={Colors.primaryLight} />
          ) : (
            <>
              <MaterialCommunityIcons name="cog-outline" size={17} color={Colors.primaryLight} />
              <Text style={styles.ctaOutlineText}>Gerenciar assinatura</Text>
            </>
          )}
        </TouchableOpacity>
      ) : plano.atual ? (
        <View style={styles.ctaAtual}>
          <MaterialCommunityIcons name="check" size={18} color={Colors.success} />
          <Text style={styles.ctaAtualText}>{plano.cta}</Text>
        </View>
      ) : plano.destaque ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.88} disabled={carregandoAcao || carregandoPlano}>
          <LinearGradient colors={Gradients.primaryDiagonal} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.ctaGrad, Shadow.glowCyan]}>
            {carregandoAcao ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.ctaGradText}>{rotuloCta}</Text>
                <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.ctaOutline} onPress={onPress} activeOpacity={0.85} disabled={carregandoAcao}>
          {carregandoAcao ? (
            <ActivityIndicator size="small" color={Colors.primaryLight} />
          ) : (
            <>
              <Text style={styles.ctaOutlineText}>{rotuloCta}</Text>
              <MaterialCommunityIcons name="arrow-right" size={17} color={Colors.primaryLight} />
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Empresa: CTA secundário para tirar dúvidas antes de assinar. */}
      {!plano.atual && plano.id === 'empresa' && (
        <TouchableOpacity style={styles.ctaSecundario} onPress={onFalarSuporte} activeOpacity={0.8}>
          <MaterialCommunityIcons name="whatsapp" size={16} color={Colors.onSurfaceVariant} />
          <Text style={styles.ctaSecundarioText}>Falar com a gente</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Cartão destacado ganha moldura em gradiente; os demais, borda discreta.
  if (plano.destaque) {
    return (
      <LinearGradient
        colors={['#34C6D9', '#0B6FCE']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.cardFrame, Shadow.md]}
      >
        {body}
      </LinearGradient>
    );
  }
  return <View style={[styles.cardPlain, plano.atual && styles.cardAtual]}>{body}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  intro: { alignItems: 'center', paddingVertical: Spacing.base },
  introTitle: { fontSize: 19, fontWeight: '800', color: '#fff', marginTop: 10, textAlign: 'center' },
  introSub: { fontSize: 13, color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: 6, lineHeight: 19, paddingHorizontal: 6 },

  toggle: { flexDirection: 'row', backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.outline, padding: 4, marginBottom: Spacing.lg, alignSelf: 'center' },
  toggleOpt: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingVertical: 9, borderRadius: BorderRadius.full },
  toggleOptActive: { backgroundColor: Colors.primary, ...Shadow.sm },
  toggleText: { fontSize: 13.5, fontWeight: '700', color: Colors.onSurfaceVariant },
  toggleTextActive: { color: '#fff' },
  toggleBadge: { backgroundColor: Colors.successLight, borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 2 },
  toggleBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.success },

  cardFrame: { borderRadius: BorderRadius.xl + 2, padding: 2, marginBottom: Spacing.base },
  cardPlain: { borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.outline, marginBottom: Spacing.base, backgroundColor: Colors.surface, ...Shadow.sm },
  cardAtual: { borderColor: 'rgba(43,215,135,0.35)' },
  cardBody: { backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, padding: Spacing.lg },

  cardHead: { flexDirection: 'row', alignItems: 'flex-start' },
  cardIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.3)', justifyContent: 'center', alignItems: 'center' },
  cardIconDestaque: { backgroundColor: Colors.accentLight, borderColor: Colors.accentLight },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardName: { fontSize: 20, fontWeight: '800', color: '#fff' },
  popular: { backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
  popularText: { fontSize: 9.5, fontWeight: '800', color: '#0A1626', letterSpacing: 0.6 },
  atualPill: { backgroundColor: Colors.successLight, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
  atualPillText: { fontSize: 10, fontWeight: '800', color: Colors.success },
  cardTagline: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginTop: 4, lineHeight: 18 },

  priceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: Spacing.base, marginBottom: 4 },
  price: { ...Typography.valueLarge, color: '#fff' },
  priceDestaque: { color: Colors.accentLight },
  pricePeriod: { fontSize: 13.5, color: Colors.onSurfaceVariant, fontWeight: '600', marginLeft: 6, marginBottom: 6 },
  priceSaveBadge: { backgroundColor: Colors.successLight, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8, marginBottom: 7 },
  priceSaveBadgeText: { fontSize: 10.5, fontWeight: '800', color: Colors.success },
  parcelaText: { fontSize: 13, color: Colors.accentLight, fontWeight: '700', marginTop: 2 },

  beneficios: { marginTop: Spacing.base, gap: 10 },
  beneficioRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  beneficioText: { flex: 1, fontSize: 13.5, color: Colors.onSurface, lineHeight: 19 },

  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: BorderRadius.md, paddingVertical: 14, marginTop: Spacing.lg },
  ctaGradText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  ctaOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: BorderRadius.md, paddingVertical: 13, marginTop: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primaryLight, backgroundColor: 'rgba(11,111,206,0.10)' },
  ctaOutlineText: { fontSize: 14.5, fontWeight: '800', color: Colors.primaryLight },
  ctaAtual: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: BorderRadius.md, paddingVertical: 13, marginTop: Spacing.lg, backgroundColor: Colors.successLight, borderWidth: 1, borderColor: 'rgba(43,215,135,0.3)' },
  ctaAtualText: { fontSize: 14.5, fontWeight: '800', color: Colors.success },

  ctaSecundario: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10, paddingVertical: 9 },
  ctaSecundarioText: { fontSize: 13.5, fontWeight: '700', color: Colors.onSurfaceVariant },

  rodape: { fontSize: 12.5, color: Colors.onSurfaceMuted, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18, paddingHorizontal: 12 },
});
