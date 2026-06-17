import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow, Typography, Gradients } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliMascot } from '../components/OlliMascot';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type PlanoId = 'gratis' | 'pro' | 'empresa';

interface Plano {
  id: PlanoId;
  nome: string;
  preco: string;
  periodo?: string;
  tagline: string;
  icon: string;
  destaque?: boolean;
  atual?: boolean;
  beneficios: string[];
  cta: string;
}

const PLANOS: Plano[] = [
  {
    id: 'gratis',
    nome: 'Grátis',
    preco: 'R$ 0',
    tagline: 'Tudo que você precisa pra começar a fechar negócio.',
    icon: 'rocket-launch-outline',
    atual: true,
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
    tagline: 'Para o autônomo que quer vender mais e ganhar tempo.',
    icon: 'crown-outline',
    destaque: true,
    cta: 'Quero o Pro',
    beneficios: [
      'Tudo do plano Grátis',
      'OLLI por voz: monte orçamentos falando',
      'Chat com a OLLI (técnico e preços)',
      'Diagnóstico guiado por IA, sem limite',
      'Backup automático na nuvem',
      'Relatórios de faturamento e conversão',
    ],
  },
  {
    id: 'empresa',
    nome: 'Empresa',
    preco: 'R$ 99',
    periodo: '/mês',
    tagline: 'Para equipes que atendem em campo todos os dias.',
    icon: 'office-building-outline',
    cta: 'Falar com a OLLI',
    beneficios: [
      'Tudo do plano Pro',
      'Equipe ao vivo no mapa',
      'Vários técnicos e permissões',
      'Painel de gestão e metas',
      'Suporte prioritário',
    ],
  },
];

export default function PlanosScreen() {
  const nav = useNavigation<Nav>();
  const [periodoAnual, setPeriodoAnual] = useState(false);

  function escolher(p: Plano) {
    if (p.atual) return;
    Haptics.selectionAsync().catch(() => {});
    nav.navigate('OlliChat');
  }

  return (
    <View style={styles.container}>
      <GradientHeader title="Planos OLLI" subtitle="Escolha como crescer" onBack={() => nav.goBack()} />

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {/* INTRO */}
        <AnimatedEntrance index={0}>
          <View style={styles.intro}>
            <OlliMascot size={44} onDark />
            <Text style={styles.introTitle}>Comece grátis. Cresça quando quiser.</Text>
            <Text style={styles.introSub}>Sem fidelidade e sem surpresa. Você só passa para um plano pago quando fizer sentido pro seu negócio.</Text>
          </View>
        </AnimatedEntrance>

        {/* TOGGLE MENSAL / ANUAL (apenas visual) */}
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
        {PLANOS.map((p, i) => (
          <AnimatedEntrance key={p.id} index={2 + i}>
            <PlanoCard plano={p} periodoAnual={periodoAnual} onPress={() => escolher(p)} />
          </AnimatedEntrance>
        ))}

        <Text style={styles.rodape}>Os planos pagos chegam em breve. Enquanto isso, aproveite tudo de graça. 💙</Text>
      </ScrollView>
    </View>
  );
}

function PlanoCard({ plano, periodoAnual, onPress }: { plano: Plano; periodoAnual: boolean; onPress: () => void }) {
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
              <View style={styles.atualPill}><Text style={styles.atualPillText}>Atual</Text></View>
            )}
          </View>
          <Text style={styles.cardTagline}>{plano.tagline}</Text>
        </View>
      </View>

      {/* PREÇO */}
      <View style={styles.priceRow}>
        <Text style={[styles.price, plano.destaque && styles.priceDestaque]}>{plano.preco}</Text>
        {plano.periodo ? <Text style={styles.pricePeriod}>{periodoAnual ? '/ano (-20%)' : plano.periodo}</Text> : null}
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
      {plano.atual ? (
        <View style={styles.ctaAtual}>
          <MaterialCommunityIcons name="check" size={18} color={Colors.success} />
          <Text style={styles.ctaAtualText}>{plano.cta}</Text>
        </View>
      ) : plano.destaque ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.88}>
          <LinearGradient colors={Gradients.primaryDiagonal} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.ctaGrad, Shadow.glowCyan]}>
            <Text style={styles.ctaGradText}>{plano.cta}</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.ctaOutline} onPress={onPress} activeOpacity={0.85}>
          <Text style={styles.ctaOutlineText}>{plano.cta}</Text>
          <MaterialCommunityIcons name="arrow-right" size={17} color={Colors.primaryLight} />
        </TouchableOpacity>
      )}

      {!plano.atual && (
        <View style={styles.soonRow}>
          <MaterialCommunityIcons name="clock-outline" size={13} color={Colors.onSurfaceMuted} />
          <Text style={styles.soonText}>em breve · a gente te avisa</Text>
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

  beneficios: { marginTop: Spacing.base, gap: 10 },
  beneficioRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  beneficioText: { flex: 1, fontSize: 13.5, color: Colors.onSurface, lineHeight: 19 },

  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: BorderRadius.md, paddingVertical: 14, marginTop: Spacing.lg },
  ctaGradText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  ctaOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: BorderRadius.md, paddingVertical: 13, marginTop: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primaryLight, backgroundColor: 'rgba(11,111,206,0.10)' },
  ctaOutlineText: { fontSize: 14.5, fontWeight: '800', color: Colors.primaryLight },
  ctaAtual: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: BorderRadius.md, paddingVertical: 13, marginTop: Spacing.lg, backgroundColor: Colors.successLight, borderWidth: 1, borderColor: 'rgba(43,215,135,0.3)' },
  ctaAtualText: { fontSize: 14.5, fontWeight: '800', color: Colors.success },

  soonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  soonText: { fontSize: 11.5, color: Colors.onSurfaceMuted, fontWeight: '600' },

  rodape: { fontSize: 12.5, color: Colors.onSurfaceMuted, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18, paddingHorizontal: 12 },
});
