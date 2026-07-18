import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Linking, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, textoSobre, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliPressable } from '../components/OlliPressable';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { formatDate } from '../utils/date';
import type { PlanoId } from '../services/planos';
import {
  getResumoAssinatura,
  getFaturas,
  getMetodoPagamento,
  abrirPortalAssinatura,
  type ResumoAssinatura,
  type Fatura,
  type MetodoPagamento,
} from '../services/assinatura';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PLANO_LABEL: Record<PlanoId, string> = { gratis: 'Grátis', pro: 'Pro', empresa: 'Empresa' };

const PLANO_ICONE: Record<PlanoId, string> = {
  gratis: 'rocket-launch-outline',
  pro: 'crown-outline',
  empresa: 'office-building-outline',
};

/** Rótulo + cor de um status bruto da Stripe, em pt-BR. */
function statusInfo(status: string | undefined, c: Cores): { label: string; cor: string } {
  switch (status) {
    case 'active': return { label: 'Ativa', cor: c.success };
    case 'trialing': return { label: 'Em teste', cor: c.accentLight };
    case 'past_due': return { label: 'Pagamento pendente', cor: c.warning };
    case 'canceled': return { label: 'Cancelada', cor: c.onSurfaceMuted };
    case 'unpaid': return { label: 'Não paga', cor: c.danger };
    case 'incomplete':
    case 'incomplete_expired': return { label: 'Incompleta', cor: c.warning };
    default: return { label: status ? status : 'Sem assinatura', cor: c.onSurfaceMuted };
  }
}

/** Rótulo pt-BR do status de uma fatura. */
function statusFaturaInfo(f: Fatura, c: Cores): { label: string; cor: string } {
  if (f.pago || f.status === 'paid') return { label: 'Paga', cor: c.success };
  if (f.status === 'open') return { label: 'Em aberto', cor: c.warning };
  if (f.status === 'void') return { label: 'Anulada', cor: c.onSurfaceMuted };
  if (f.status === 'uncollectible') return { label: 'Não recebida', cor: c.danger };
  if (f.status === 'draft') return { label: 'Rascunho', cor: c.onSurfaceMuted };
  return { label: f.status ?? '—', cor: c.onSurfaceMuted };
}

/** Formata centavos numa moeda ISO como valor pt-BR (ex.: 3900,'brl' → "R$ 39,00"). */
function formatarValor(centavos: number, moeda: string): string {
  const valor = (centavos || 0) / 100;
  try {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: (moeda || 'brl').toUpperCase() });
  } catch {
    // Moeda não reconhecida pelo Intl: cai num formato simples com o código.
    return `${(moeda || '').toUpperCase()} ${valor.toFixed(2)}`;
  }
}

/** epoch ms → data pt-BR (DD/MM/AAAA), ou '' se ausente/ inválido. */
function formatarDataMs(ms: number | null): string {
  if (typeof ms !== 'number' || !isFinite(ms)) return '';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

function sufixoIntervalo(intervalo: Fatura['intervalo']): string {
  if (intervalo === 'month') return ' / mês';
  if (intervalo === 'year') return ' / ano';
  return '';
}

/** Nome amigável da bandeira do cartão. */
function nomeBandeira(brand: string | null): string {
  if (!brand) return 'Cartão';
  const map: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    elo: 'Elo',
    hipercard: 'Hipercard',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay',
  };
  return map[brand.toLowerCase()] ?? (brand.charAt(0).toUpperCase() + brand.slice(1));
}

/**
 * Cache module-level das 3 leituras (resumo + faturas + método) com TTL curto.
 * `useFocusEffect` recarrega a CADA foco da tela — inclusive troca rápida de aba
 * ou o usuário indo e voltando do menu — e faturas/método batem no worker, que
 * compartilha o MESMO balde de rate limit (10/60s por usuário) do checkout, do
 * portal e do excluir-conta. Sem esse cache, poucas aberturas em sequência
 * esgotam o balde e o botão "Gerenciar assinatura / Cancelar" passa a falhar.
 * Pull-to-refresh (`forcar: true`) sempre ignora o cache. `gerenciar()` também
 * o invalida ao abrir o Portal, porque o usuário pode voltar de lá com o estado
 * da assinatura realmente mudado (cancelou, trocou de plano).
 */
let cacheAssinatura: { resumo: ResumoAssinatura; faturas: Fatura[]; metodo: MetodoPagamento | null; ts: number } | null = null;
const CACHE_TTL_MS = 30_000;

export default function AssinaturaScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const [resumo, setResumo] = useState<ResumoAssinatura | null>(null);
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [metodo, setMetodo] = useState<MetodoPagamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [abrindoPortal, setAbrindoPortal] = useState(false);

  const carregar = useCallback(async (opts?: { forcar?: boolean }) => {
    if (!opts?.forcar && cacheAssinatura && Date.now() - cacheAssinatura.ts < CACHE_TTL_MS) {
      setResumo(cacheAssinatura.resumo);
      setFaturas(cacheAssinatura.faturas);
      setMetodo(cacheAssinatura.metodo);
      setCarregando(false);
      return;
    }
    // As três leituras são independentes — dispara em paralelo.
    const [r, f, m] = await Promise.all([
      getResumoAssinatura(),
      getFaturas(),
      getMetodoPagamento(),
    ]);
    cacheAssinatura = { resumo: r, faturas: f, metodo: m, ts: Date.now() };
    setResumo(r);
    setFaturas(f);
    setMetodo(m);
    setCarregando(false);
  }, []);

  // Recarrega ao focar — cobre a volta do Portal Stripe (usuário sai pro
  // navegador e volta pelo "voltar" do sistema). O cache acima decide se isso
  // vira uma leitura de rede de verdade ou só reaproveita o último resultado.
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function refresh() {
    setRefreshing(true);
    await carregar({ forcar: true });
    setRefreshing(false);
  }

  async function gerenciar() {
    Haptics.selectionAsync().catch(() => {});
    setAbrindoPortal(true);
    try {
      const res = await abrirPortalAssinatura();
      if (res.ok) {
        // O usuário pode voltar do Portal com a assinatura de fato mudada
        // (cancelou, trocou de cartão) — o próximo foco deve ler de novo, não
        // reaproveitar o cache.
        cacheAssinatura = null;
      } else {
        const msg =
          res.motivo === 'nao_configurado'
            ? 'O pagamento online ainda não foi configurado. Tente novamente em breve.'
            : res.motivo === 'sem_login'
              ? 'Entre na sua conta para gerenciar a assinatura.'
              : res.motivo === 'sem_assinatura'
                ? 'Você ainda não tem uma assinatura para gerenciar.'
                : 'Não consegui abrir o gerenciamento agora. Tente novamente.';
        Alert.alert('Assinatura', msg);
      }
    } finally {
      setAbrindoPortal(false);
    }
  }

  async function abrirRecibo(f: Fatura) {
    if (!f.recibo) {
      Alert.alert('Recibo', 'Esta fatura ainda não tem um recibo disponível.');
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    try {
      await Linking.openURL(f.recibo);
    } catch {
      Alert.alert('Ops', 'Não consegui abrir o recibo agora. Tente novamente.');
    }
  }

  const planoEfetivo = resumo?.planoEfetivo ?? 'gratis';
  const ativo = resumo?.ativo ?? false;
  const ehPagante = planoEfetivo !== 'gratis';
  const sInfo = statusInfo(resumo?.status, cores);
  const ultimaFatura = faturas.length > 0 ? faturas[0] : null;
  const ultimoPagamento = faturas.find(f => f.pago) ?? null;

  // "Valor e ciclo" honesto: usa a última fatura quando existe (avulso 12x pode
  // não gerar fatura); senão, cai no nome do plano (sem inventar preço).
  const precoValor =
    ultimaFatura && ultimaFatura.valorCentavos > 0
      ? formatarValor(ultimaFatura.valorCentavos, ultimaFatura.moeda)
      : planoEfetivo === 'gratis'
        ? 'R$ 0'
        : `Plano ${PLANO_LABEL[planoEfetivo]}`;
  const precoSufixo = ultimaFatura && ultimaFatura.valorCentavos > 0 ? sufixoIntervalo(ultimaFatura.intervalo) : '';

  const subtituloHeader = ehPagante ? `Plano ${PLANO_LABEL[planoEfetivo]}` : 'Seu plano e cobranças';

  return (
    <View style={styles.container}>
      <GradientHeader title="Assinatura" subtitle={subtituloHeader} onBack={() => goBackOrHome(nav)} />

      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={cores.accentLight} colors={[cores.accentLight]} />}
      >
        {carregando ? (
          <>
            <View style={styles.planCard}>
              <OlliSkeleton width="45%" height={18} />
              <OlliSkeleton width="60%" height={28} style={{ marginTop: 14 }} />
              <OlliSkeleton width="80%" height={13} style={{ marginTop: 10 }} />
            </View>
            <View style={[styles.card, { marginTop: Spacing.base }]}>
              <OlliSkeleton width="50%" height={14} />
              <OlliSkeleton width="90%" height={13} style={{ marginTop: 12 }} />
              <OlliSkeleton width="70%" height={13} style={{ marginTop: 8 }} />
            </View>
          </>
        ) : (
          <>
            {/* CARTÃO DO PLANO */}
            <AnimatedEntrance index={0}>
              <View style={styles.planCard}>
                <View style={styles.planHead}>
                  <View style={styles.planIcon}>
                    <MaterialCommunityIcons name={PLANO_ICONE[planoEfetivo] as any} size={22} color={cores.accentLight} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.planLabel}>Seu plano</Text>
                    <Text style={styles.planName}>{PLANO_LABEL[planoEfetivo]}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: sInfo.cor + '22', borderColor: sInfo.cor + '55' }]}>
                    <View style={[styles.statusDot, { backgroundColor: sInfo.cor }]} />
                    <Text style={[styles.statusText, { color: sInfo.cor }]}>{sInfo.label}</Text>
                  </View>
                </View>

                <View style={styles.priceRow}>
                  <Text style={styles.priceValue}>{precoValor}</Text>
                  {precoSufixo ? <Text style={styles.pricePeriod}>{precoSufixo}</Text> : null}
                </View>
              </View>
            </AnimatedEntrance>

            {/* PAGANTE: detalhes de cobrança + gerenciar + histórico */}
            {ehPagante ? (
              <>
                <AnimatedEntrance index={1}>
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Cobrança</Text>

                    <LinhaDetalhe
                      icon="calendar-clock"
                      label={ativo && ultimaFatura && ultimaFatura.intervalo ? 'Próxima cobrança' : 'Acesso até'}
                      valor={resumo?.proximaCobranca ? formatDate(resumo.proximaCobranca) : '—'}
                    />
                    <LinhaDetalhe
                      icon="cash-check"
                      label="Último pagamento"
                      valor={ultimoPagamento && ultimoPagamento.dataMs ? formatarDataMs(ultimoPagamento.dataMs) : '—'}
                    />
                    <LinhaDetalhe
                      icon="credit-card-outline"
                      label="Método de pagamento"
                      valor={metodo && metodo.last4 ? `${nomeBandeira(metodo.brand)} •••• ${metodo.last4}` : 'Não informado'}
                      semDivisor
                    />
                  </View>
                </AnimatedEntrance>

                <AnimatedEntrance index={2}>
                  <OlliButton
                    label="Gerenciar assinatura / Cancelar"
                    variant="gradient"
                    size="lg"
                    fullWidth
                    loading={abrindoPortal}
                    onPress={gerenciar}
                    icon={<MaterialCommunityIcons name="cog-outline" size={20} color="#fff" />}
                    style={{ marginTop: Spacing.base }}
                  />
                  <Text style={styles.gerenciarHint}>
                    Você é levado ao ambiente seguro da Stripe para trocar de plano, atualizar o cartão, baixar recibos ou cancelar quando quiser.
                  </Text>
                </AnimatedEntrance>
              </>
            ) : (
              /* GRÁTIS: explica o que ganha assinando + CTA para Planos */
              <AnimatedEntrance index={1}>
                {resumo?.planoContratado && resumo.planoContratado !== 'gratis' ? (
                  <View style={styles.avisoCard}>
                    <MaterialCommunityIcons name="information-outline" size={20} color={cores.warning} />
                    <Text style={styles.avisoText}>
                      Sua assinatura {PLANO_LABEL[resumo.planoContratado]} foi encerrada. Você voltou ao plano Grátis — seus dados continuam com você.
                    </Text>
                  </View>
                ) : null}

                <View style={styles.upsellCard}>
                  <View style={styles.upsellBadge}>
                    <MaterialCommunityIcons name="crown-outline" size={16} color={textoSobre(cores.accentLight)} />
                    <Text style={styles.upsellBadgeText}>OLLI PRO</Text>
                  </View>
                  <Text style={styles.upsellTitle}>Você está no plano Grátis</Text>
                  <Text style={styles.upsellSub}>
                    Assinando o Pro, seu escritório de bolso ganha músculo:
                  </Text>
                  <View style={styles.beneficios}>
                    {[
                      'IA sem limite (voz, chat e diagnóstico)',
                      'Relatórios de faturamento e conversão',
                      'Metas de vendas e acompanhamento',
                      'PDF sem a marca OLLI e modelos premium',
                      'Suporte prioritário no WhatsApp',
                    ].map((b) => (
                      <View key={b} style={styles.beneficioRow}>
                        <MaterialCommunityIcons name="check-circle" size={17} color={cores.success} />
                        <Text style={styles.beneficioText}>{b}</Text>
                      </View>
                    ))}
                  </View>
                  <OlliButton
                    label="Ver planos e assinar"
                    variant="gradient"
                    size="lg"
                    fullWidth
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Planos'); }}
                    icon={<MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />}
                    style={{ marginTop: Spacing.base }}
                  />
                </View>
              </AnimatedEntrance>
            )}

            {/* HISTÓRICO DE FATURAS (aparece sempre que houver faturas) */}
            {faturas.length > 0 && (
              <AnimatedEntrance index={3}>
                <Text style={styles.sectionTitle}>Histórico de faturas</Text>
                <View style={styles.faturasCard}>
                  {faturas.map((f, i) => {
                    const st = statusFaturaInfo(f, cores);
                    return (
                      <View key={f.id} style={[styles.faturaRow, i < faturas.length - 1 && styles.faturaDivider]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.faturaValor}>{formatarValor(f.valorCentavos, f.moeda)}</Text>
                          <Text style={styles.faturaData}>{formatarDataMs(f.dataMs) || 'Data indisponível'}</Text>
                        </View>
                        <View style={[styles.faturaStatus, { backgroundColor: st.cor + '22' }]}>
                          <Text style={[styles.faturaStatusText, { color: st.cor }]}>{st.label}</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.reciboBtn, !f.recibo && styles.reciboBtnOff]}
                          onPress={() => abrirRecibo(f)}
                          disabled={!f.recibo}
                          accessibilityRole="button"
                          accessibilityLabel="Ver recibo"
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialCommunityIcons name="receipt" size={18} color={f.recibo ? cores.accentLight : cores.onSurfaceMuted} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.faturasHint}>Toque no recibo para abrir o comprovante na Stripe.</Text>
              </AnimatedEntrance>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Linha "rótulo — valor" com ícone, usada nos detalhes de cobrança. */
function LinhaDetalhe({
  icon, label, valor, semDivisor,
}: { icon: string; label: string; valor: string; semDivisor?: boolean }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={[styles.detalheRow, !semDivisor && styles.detalheDivider]}>
      <MaterialCommunityIcons name={icon as any} size={18} color={cores.onSurfaceVariant} />
      <Text style={styles.detalheLabel}>{label}</Text>
      <Text style={styles.detalheValor} numberOfLines={1}>{valor}</Text>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },

  planCard: {
    backgroundColor: c.surfaceElevated, borderRadius: BorderRadius.xl, borderWidth: 1,
    borderColor: c.strokeGlow, padding: Spacing.base, ...sombrasDe(c).sm,
  },
  planHead: { flexDirection: 'row', alignItems: 'center' },
  planIcon: {
    width: 44, height: 44, borderRadius: BorderRadius.chip, backgroundColor: c.accentContainer,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: c.strokeGlow,
  },
  planLabel: { fontSize: 12, fontWeight: '700', color: c.onSurfaceVariant },
  planName: { fontSize: 20, fontWeight: '800', color: c.onSurface, marginTop: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11.5, fontWeight: '800' },

  priceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: Spacing.base },
  priceValue: { fontSize: 26, fontWeight: '800', color: c.accentLight },
  pricePeriod: { fontSize: 14, color: c.onSurfaceVariant, fontWeight: '600', marginLeft: 6, marginBottom: 4 },

  card: {
    backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1,
    borderColor: c.outlineDark, padding: Spacing.base, marginTop: Spacing.base, ...sombrasDe(c).sm,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: c.onSurface, marginBottom: 6 },

  detalheRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  detalheDivider: { borderBottomWidth: 1, borderBottomColor: c.outline },
  detalheLabel: { flex: 1, fontSize: 13.5, color: c.onSurfaceVariant },
  detalheValor: { fontSize: 14, fontWeight: '700', color: c.onSurface, maxWidth: '55%', textAlign: 'right' },

  gerenciarHint: { fontSize: 12, color: c.onSurfaceMuted, lineHeight: 17, marginTop: 10, paddingHorizontal: 4 },

  // Upsell (grátis)
  avisoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: c.warningLight, borderRadius: BorderRadius.lg, borderWidth: 1,
    // Borda no tom fixo do warning do handoff cockpit; sem chave semântica exata (ver rule 7).
    borderColor: 'rgba(247,178,59,0.35)', padding: Spacing.base, marginBottom: Spacing.base,
  },
  avisoText: { flex: 1, fontSize: 13, color: c.onSurface, lineHeight: 19 },
  upsellCard: {
    backgroundColor: c.surfaceElevated, borderRadius: BorderRadius.xl, borderWidth: 1,
    borderColor: c.strokeGlow, padding: Spacing.base, ...sombrasDe(c).sm,
  },
  upsellBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: c.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  upsellBadgeText: { fontSize: 12, fontWeight: '800', color: textoSobre(c.accentLight) },
  upsellTitle: { fontSize: 17, fontWeight: '800', color: c.onSurface, marginTop: 12 },
  upsellSub: { fontSize: 13.5, color: c.onSurfaceVariant, marginTop: 4, lineHeight: 19 },
  beneficios: { marginTop: Spacing.base, gap: 10 },
  beneficioRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  beneficioText: { flex: 1, fontSize: 13.5, color: c.onSurface, lineHeight: 19 },

  // Faturas
  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.onBackground, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  faturasCard: {
    backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1,
    borderColor: c.outlineDark, paddingHorizontal: Spacing.base, ...sombrasDe(c).sm,
  },
  faturaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  faturaDivider: { borderBottomWidth: 1, borderBottomColor: c.outline },
  faturaValor: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  faturaData: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2 },
  faturaStatus: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  faturaStatusText: { fontSize: 11.5, fontWeight: '800' },
  reciboBtn: {
    width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.accentContainer, borderWidth: 1, borderColor: c.strokeGlow,
  },
  reciboBtnOff: { backgroundColor: 'transparent', borderColor: c.outline },
  faturasHint: { fontSize: 12, color: c.onSurfaceMuted, marginTop: 10, paddingHorizontal: 4 },
});
