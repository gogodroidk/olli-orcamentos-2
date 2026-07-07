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

// Preço/período a exibir conforme o toggle. No anual, mostra o total com -20% ("/ano").
function precoExibido(plano: Plano, anual: boolean): { preco: string; periodo?: string } {
  if (anual && plano.precoMensal) {
    return { preco: reais(plano.precoMensal * 12 * 0.8), periodo: '/ano' };
  }
  return { preco: plano.preco, periodo: plano.periodo };
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
    cta: 'Falar com a gente',
    beneficios: [
      'Tudo do plano Pro',
      'Equipe ao vivo no mapa (em breve)',
      'Vários técnicos e permissões (em breve)',
      'Painel de gestão e metas (em breve)',
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
  const [periodoAnual, setPeriodoAnual] = useState(false);
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

  async function assinarPro() {
    if (!supabase) {
      Alert.alert('Ainda não disponível', 'Login ainda não está configurado neste app.');
      return;
    }
    const user = (await supabase.auth.getSession()).data.session?.user ?? null;
    if (!user) {
      Alert.alert(
        'Faça login primeiro',
        'Para assinar o plano Pro, entre com sua conta OLLI. Toque em "Ir para Conta" para fazer login ou criar sua conta.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ir para Conta', onPress: () => nav.navigate('Conta') },
        ],
      );
      return;
    }
    setAcaoEmAndamento('pro');
    try {
      await abrirUrlPagamento('/stripe/checkout', { plano: periodoAnual ? 'pro_anual' : 'pro' });
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

  function escolher(p: Plano) {
    if (p.atual) return;
    Haptics.selectionAsync().catch(() => {});

    if (p.id === 'pro') {
      assinarPro();
      return;
    }

    // Empresa: recursos de equipe ainda não existem — mantém contato por WhatsApp.
    if (!WHATSAPP_SUPORTE) {
      // Honesto: sem número configurado, não finge que vai abrir uma conversa.
      Alert.alert(
        'Ainda não disponível',
        'O contato para contratar esse plano ainda não foi configurado. Tente novamente em breve.',
      );
      return;
    }
    const mensagem = `Olá! Quero saber mais sobre o plano ${p.nome} do OLLI Orçamentos.`;
    abrirWhatsApp(WHATSAPP_SUPORTE, mensagem).catch(() => {
      Alert.alert('Ops', 'Não consegui abrir o WhatsApp agora. Tente novamente.');
    });
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
            <Text style={styles.introSub}>O plano Grátis já traz orçamentos, recibos, clientes e agenda ilimitados — sem fidelidade e sem surpresa. O plano Pro já pode ser assinado direto no app; o plano Empresa ainda está em fila de espera.</Text>
          </View>
        </AnimatedEntrance>

        {/* TOGGLE MENSAL / ANUAL — no anual exibe o total real com -20% */}
        <AnimatedEntrance index={1}>
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleOpt, !periodoAnual && styles.toggleOptActive]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setPeriodoAnual(false); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleText, !periodoAnual && styles.toggleTextActive]}>Mensal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOpt, periodoAnual && styles.toggleOptActive]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setPeriodoAnual(true); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleText, periodoAnual && styles.toggleTextActive]}>Anual</Text>
              <View style={styles.toggleBadge}><Text style={styles.toggleBadgeText}>-20%</Text></View>
            </TouchableOpacity>
          </View>
        </AnimatedEntrance>

        {/* CARTÕES */}
        {planos.map((p, i) => (
          <AnimatedEntrance key={p.id} index={2 + i}>
            <PlanoCard
              plano={p}
              periodoAnual={periodoAnual}
              carregandoPlano={carregandoPlano}
              carregandoAcao={acaoEmAndamento === p.id}
              carregandoPortal={acaoEmAndamento === 'portal'}
              onPress={() => escolher(p)}
              onGerenciar={gerenciarAssinatura}
            />
          </AnimatedEntrance>
        ))}

        <Text style={styles.rodape}>O plano Pro é cobrado mensalmente (o desconto anual acima ainda é só uma prévia, a cobrança de fato chega em breve). O plano Empresa ainda está em fila de espera — toque em "Falar com a gente" para entrar na fila. 💙</Text>
      </ScrollView>
    </View>
  );
}

function PlanoCard({
  plano,
  periodoAnual,
  carregandoPlano,
  carregandoAcao,
  carregandoPortal,
  onPress,
  onGerenciar,
}: {
  plano: Plano;
  periodoAnual: boolean;
  carregandoPlano: boolean;
  carregandoAcao: boolean;
  carregandoPortal: boolean;
  onPress: () => void;
  onGerenciar: () => void;
}) {
  const exibido = precoExibido(plano, periodoAnual);
  const ehPlanoPagoAtivo = plano.atual && plano.id !== 'gratis';
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
        {periodoAnual && plano.precoMensal ? (
          <View style={styles.priceSaveBadge}><Text style={styles.priceSaveBadgeText}>-20%</Text></View>
        ) : null}
      </View>

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
                <Text style={styles.ctaGradText}>{plano.cta}</Text>
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
              <Text style={styles.ctaOutlineText}>{plano.cta}</Text>
              <MaterialCommunityIcons name="arrow-right" size={17} color={Colors.primaryLight} />
            </>
          )}
        </TouchableOpacity>
      )}

      {!plano.atual && plano.id === 'empresa' && (
        <View style={styles.soonRow}>
          <MaterialCommunityIcons name="whatsapp" size={13} color={Colors.onSurfaceMuted} />
          <Text style={styles.soonText}>Lista de espera: abre o WhatsApp para você entrar na fila, sem cobrança agora</Text>
        </View>
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

  beneficios: { marginTop: Spacing.base, gap: 10 },
  beneficioRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  beneficioText: { flex: 1, fontSize: 13.5, color: Colors.onSurface, lineHeight: 19 },

  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: BorderRadius.md, paddingVertical: 14, marginTop: Spacing.lg },
  ctaGradText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  ctaOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: BorderRadius.md, paddingVertical: 13, marginTop: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primaryLight, backgroundColor: 'rgba(11,111,206,0.10)' },
  ctaOutlineText: { fontSize: 14.5, fontWeight: '800', color: Colors.primaryLight },
  ctaAtual: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: BorderRadius.md, paddingVertical: 13, marginTop: Spacing.lg, backgroundColor: Colors.successLight, borderWidth: 1, borderColor: 'rgba(43,215,135,0.3)' },
  ctaAtualText: { fontSize: 14.5, fontWeight: '800', color: Colors.success },

  soonRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 6, marginTop: 10, paddingHorizontal: 4 },
  soonText: { flex: 1, fontSize: 11.5, color: Colors.onSurfaceMuted, fontWeight: '600', textAlign: 'center', lineHeight: 16 },

  rodape: { fontSize: 12.5, color: Colors.onSurfaceMuted, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18, paddingHorizontal: 12 },
});
