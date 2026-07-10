import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Share, LayoutAnimation, Platform, RefreshControl, Animated } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliCard } from '../components/OlliCard';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { EmptyState } from '../components/EmptyState';
import { CountUp } from '../components/CountUp';
import { GatePro } from '../components/GatePro';
import { GuardaPapel } from '../components/GuardaPapel';
import {
  gerarRelatorioDia, relatorioParaTexto, falarRelatorio, pararFala, RelatorioDia,
} from '../services/relatorioDia';
import { getRelatoriosDias, RelatorioDiaRow } from '../database/database';
import { onSyncAplicado } from '../services/cloudSync';
import { formatDateBR, todayISO } from '../utils/date';
import { goBackOrHome } from '../navigation/safeBack';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Pill discreto "Sincronizando..." — some com fade sozinho depois de exibido.
 * Dá feedback visual de que a tela está de fato conectada à nuvem quando o
 * `onSyncAplicado` recarrega os dados em segundo plano.
 */
function SincronizandoPill({ onDone }: { onDone: () => void }) {
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
    <Animated.View pointerEvents="none" style={[styles.syncPill, { opacity }]}>
      <MaterialCommunityIcons
        name="cloud-sync-outline"
        size={13}
        color={cores.accent} // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — mesmo chip do texto abaixo, accent = 8.85:1
      />
      <Text style={styles.syncPillText}>Sincronizando...</Text>
    </Animated.View>
  );
}

/** Nome do dia da semana em PT-BR curto, a partir de 'YYYY-MM-DD'. */
function diaDaSemana(dataChave: string): string {
  const [y, m, d] = dataChave.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const nomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return nomes[dt.getDay()];
}

/** Card de um dia do histórico (expansível ao toque). */
function DiaHistoricoCard({ row, index }: { row: RelatorioDiaRow; index: number }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [aberto, setAberto] = useState(false);
  const r = row.dados as RelatorioDia;

  function toggle() {
    if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.selectionAsync().catch(() => {});
    setAberto(a => !a);
  }

  return (
    <AnimatedEntrance index={index}>
      <OlliCard onPress={toggle} style={styles.histCard}>
        <View style={styles.histHead}>
          <View style={styles.histIcon}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={cores.accentLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.histData}>{diaDaSemana(row.data)}, {formatDateBR(row.data)}</Text>
            <Text style={styles.histResumo} numberOfLines={aberto ? undefined : 1}>
              {r.semMovimentos ? 'Sem movimentos' : `${r.orcamentos.criados} orçamento${r.orcamentos.criados === 1 ? '' : 's'} · ${r.agendamentos.total} na agenda`}
            </Text>
          </View>
          <MaterialCommunityIcons name={aberto ? 'chevron-up' : 'chevron-down'} size={22} color={cores.onSurfaceMuted} />
        </View>

        {aberto && (
          <View style={styles.histBody}>
            <Text style={styles.histTexto}>{relatorioParaTexto(r)}</Text>
          </View>
        )}
      </OlliCard>
    </AnimatedEntrance>
  );
}

export default function RelatorioDiaScreen() {
  // Relatório do dia expõe faturamento/recebidos — restrito a papéis de gestão.
  return (
    <GuardaPapel acao="ver_relatorios" area="Relatório do dia">
      <RelatorioDiaConteudo />
    </GuardaPapel>
  );
}

function RelatorioDiaConteudo() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const [relatorio, setRelatorio] = useState<RelatorioDia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falando, setFalando] = useState(false);
  const [historico, setHistorico] = useState<RelatorioDiaRow[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await gerarRelatorioDia();
      setRelatorio(r);
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarHistorico = useCallback(async () => {
    setCarregandoHistorico(true);
    try {
      const dias = await getRelatoriosDias(30);
      // O dia de hoje já aparece no bloco principal — o histórico é só o passado.
      const hoje = relatorio?.data ?? todayISO();
      setHistorico(dias.filter(d => d.data !== hoje));
    } finally {
      setCarregandoHistorico(false);
    }
  }, [relatorio]);

  useFocusEffect(useCallback(() => {
    carregar();
    return () => {
      pararFala();
      setFalando(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);

  // Cleanup extra no unmount definitivo (useFocusEffect já cobre o blur, mas
  // isto garante que nenhuma fala sobreviva se o componente sair sem blur).
  useEffect(() => () => pararFala(), []);

  // Recarrega quando um sync com a nuvem terminar (ex.: login recém-feito
  // trazendo orçamentos/recibos/agendamentos que ainda não existiam localmente).
  useEffect(() => onSyncAplicado(() => { setSincronizando(true); carregar(); carregarHistorico(); }), [carregar, carregarHistorico]);

  const refresh = async () => { setRefreshing(true); await Promise.all([carregar(), carregarHistorico()]); setRefreshing(false); };

  async function alternarFala() {
    if (!relatorio) return;
    Haptics.selectionAsync().catch(() => {});
    if (falando) {
      pararFala();
      setFalando(false);
      return;
    }
    setFalando(true);
    try {
      await falarRelatorio(relatorio, () => setFalando(false));
    } catch {
      setFalando(false);
    }
  }

  async function compartilhar() {
    if (!relatorio) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      await Share.share({ message: relatorioParaTexto(relatorio) });
    } catch {
      // usuário cancelou o share sheet — nada a fazer
    }
  }

  const semMovimentos = relatorio?.semMovimentos ?? false;

  return (
    <View style={styles.container}>
      {sincronizando && <SincronizandoPill onDone={() => setSincronizando(false)} />}
      <GradientHeader title="Relatório do dia" subtitle="Como foi seu dia hoje" onBack={() => goBackOrHome(nav, 'Hoje')} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[cores.accentLight]} tintColor={cores.accentLight} />}
      >
        {carregando || !relatorio ? (
          <View style={{ gap: 12 }}>
            <OlliSkeleton width="100%" height={100} radius={BorderRadius.lg} />
            <OlliSkeleton width="100%" height={140} radius={BorderRadius.lg} />
          </View>
        ) : semMovimentos ? (
          <AnimatedEntrance>
            <View style={styles.vazioWrap}>
              <EmptyState
                icon="weather-night"
                title="Dia sem movimentos registrados"
                subtitle="Nenhum orçamento, recibo, agendamento ou cliente novo hoje. Amanhã é outro dia!"
              />
            </View>
          </AnimatedEntrance>
        ) : (
          <>
            {/* KPIs do dia */}
            <View style={styles.kpiRow}>
              <AnimatedEntrance index={0} style={styles.kpiFlex}>
                <OlliCard variant="metric" style={styles.kpiCard}>
                  <MaterialCommunityIcons name="file-document-outline" size={20} color={cores.accentLight} />
                  <CountUp value={relatorio.orcamentos.criados} format="int" style={styles.kpiValue} />
                  <Text style={styles.kpiLabel}>orçamentos</Text>
                  <CountUp value={relatorio.orcamentos.criadosValor} format="currency" style={styles.kpiSub} />
                </OlliCard>
              </AnimatedEntrance>

              <AnimatedEntrance index={1} style={styles.kpiFlex}>
                <OlliCard variant="metric" style={styles.kpiCard}>
                  <MaterialCommunityIcons name="check-decagram-outline" size={20} color={cores.success} />
                  <CountUp value={relatorio.orcamentos.aprovados} format="int" style={styles.kpiValue} />
                  <Text style={styles.kpiLabel}>aprovados</Text>
                  <CountUp value={relatorio.orcamentos.aprovadosValor} format="currency" style={styles.kpiSub} />
                </OlliCard>
              </AnimatedEntrance>
            </View>

            <View style={styles.kpiRow}>
              <AnimatedEntrance index={2} style={styles.kpiFlex}>
                <OlliCard variant="metric" style={styles.kpiCard}>
                  <MaterialCommunityIcons name="cash-check" size={20} color={cores.warning} />
                  <CountUp value={relatorio.recibos.emitidos} format="int" style={styles.kpiValue} />
                  <Text style={styles.kpiLabel}>recibos</Text>
                  <CountUp value={relatorio.recibos.totalRecebido} format="currency" style={styles.kpiSub} />
                </OlliCard>
              </AnimatedEntrance>

              <AnimatedEntrance index={3} style={styles.kpiFlex}>
                <OlliCard variant="metric" style={styles.kpiCard}>
                  <MaterialCommunityIcons name="calendar-check-outline" size={20} color={cores.avatarLilac} />
                  <CountUp value={relatorio.agendamentos.total} format="int" style={styles.kpiValue} />
                  <Text style={styles.kpiLabel}>na agenda</Text>
                  <Text style={styles.kpiSub}>{relatorio.agendamentos.porStatus.concluido} concluído{relatorio.agendamentos.porStatus.concluido === 1 ? '' : 's'}</Text>
                </OlliCard>
              </AnimatedEntrance>
            </View>

            {relatorio.clientesNovos > 0 && (
              <AnimatedEntrance index={4}>
                <View style={styles.clientesNovos}>
                  <MaterialCommunityIcons name="account-plus-outline" size={18} color={cores.accentLight} />
                  <Text style={styles.clientesNovosText}>
                    <CountUp value={relatorio.clientesNovos} format="int" style={styles.clientesNovosNum} /> cliente{relatorio.clientesNovos === 1 ? '' : 's'} novo{relatorio.clientesNovos === 1 ? '' : 's'} hoje
                  </Text>
                </View>
              </AnimatedEntrance>
            )}

            {/* NARRATIVA + AÇÕES — Pro; os KPIs acima já são o teaser grátis */}
            <AnimatedEntrance index={5}>
              <GatePro
                recurso="relatorio_dia"
                plano="pro"
                beneficio="Leia o resumo completo e ouça o relatório falado do seu dia."
              >
                <View style={styles.narrativaWrap}>
                  <View style={styles.narrativaHead}>
                    <MaterialCommunityIcons name="text-box-outline" size={16} color={cores.onSurfaceVariant} />
                    <Text style={styles.narrativaTitulo}>Resumo do dia</Text>
                  </View>
                  <Text style={styles.narrativaTexto}>{relatorioParaTexto(relatorio)}</Text>

                  <View style={styles.acoes}>
                    <OlliButton
                      label={falando ? 'Parar' : 'Ouvir relatório'}
                      onPress={alternarFala}
                      variant={falando ? 'danger' : 'gradient'}
                      size="lg"
                      fullWidth
                      icon={<MaterialCommunityIcons name={falando ? 'stop-circle-outline' : 'volume-high'} size={20} color="#fff" />}
                      style={styles.acaoBtn}
                    />
                    <OlliButton
                      label="Compartilhar"
                      onPress={compartilhar}
                      variant="outline"
                      size="lg"
                      fullWidth
                      icon={<MaterialCommunityIcons name="share-variant" size={18} color={cores.accentLight} />}
                      style={styles.acaoBtn}
                    />
                  </View>
                </View>
              </GatePro>
            </AnimatedEntrance>
          </>
        )}

        {/* HISTÓRICO — dias anteriores */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Dias anteriores</Text>
        </View>

        {carregandoHistorico ? (
          <View style={{ gap: 10 }}>
            <OlliSkeleton width="100%" height={64} radius={BorderRadius.lg} />
            <OlliSkeleton width="100%" height={64} radius={BorderRadius.lg} />
          </View>
        ) : historico.length === 0 ? (
          <View style={styles.semHistorico}>
            <Text style={styles.semHistoricoText}>
              Nenhum relatório anterior por aqui ainda. Toda vez que você abrir "Relatório do dia", o dia fica salvo no seu histórico.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {historico.map((row, i) => (
              <DiaHistoricoCard key={row.data} row={row} index={i} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  // Toast/pill flutuante — convenção de "chip escuro" fixa (snackbar),
  // independente do tema. Mantido.
  syncPill: {
    position: 'absolute', top: 8, alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: c.strokeGlow,
    borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6,
    ...sombrasDe(c).sm,
  },
  syncPillText: { fontSize: 11.5, fontWeight: '700', color: c.accent }, // contraste-ok: pill opaca escura fixa rgba(10,22,38,0.92) — accentLight cairia a 3.51:1, reprova texto 4.5 (accent = 8.85:1)
  scroll: { padding: Spacing.base, paddingBottom: Spacing.xxxl, gap: 12 },

  vazioWrap: { minHeight: 280, justifyContent: 'center' },

  kpiRow: { flexDirection: 'row', gap: 10 },
  kpiFlex: { flex: 1 },
  kpiCard: { alignItems: 'flex-start', gap: 4 },
  // Era '#fff' fixo sobre o card (superfície da tela) — ilegível no claro.
  kpiValue: { fontSize: 24, fontWeight: '800', color: c.onSurface, marginTop: 6 },
  kpiLabel: { fontSize: 12, color: c.onSurfaceVariant, fontWeight: '700' },
  kpiSub: { fontSize: 12.5, color: c.onSurfaceMuted, marginTop: 2, fontWeight: '700' },

  clientesNovos: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.accentContainer, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.strokeGlow,
    paddingVertical: 10, paddingHorizontal: Spacing.md,
  },
  clientesNovosText: { fontSize: 13.5, color: c.onSurface, fontWeight: '600' },
  clientesNovosNum: { fontSize: 13.5, color: c.accentLight, fontWeight: '800' },

  narrativaWrap: { padding: Spacing.md },
  narrativaHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  narrativaTitulo: { fontSize: 12.5, fontWeight: '800', color: c.onSurfaceVariant, letterSpacing: 0.3 },
  narrativaTexto: { fontSize: 15, color: c.onSurface, lineHeight: 22 },

  acoes: { gap: 10, marginTop: 16 },
  acaoBtn: { borderRadius: BorderRadius.lg },

  sectionRow: { marginTop: Spacing.lg, marginBottom: 4 },
  // Era '#fff' fixo sobre o fundo da PÁGINA (c.background) — ilegível no claro.
  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.onSurface },

  semHistorico: {
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline, padding: Spacing.md,
  },
  semHistoricoText: { fontSize: 13, color: c.onSurfaceMuted, lineHeight: 19, textAlign: 'center' },

  histCard: { padding: Spacing.md },
  histHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  histIcon: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.accentContainer,
  },
  // Era '#fff' fixo sobre o card (superfície da tela) — ilegível no claro.
  histData: { fontSize: 14, fontWeight: '800', color: c.onSurface },
  histResumo: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 1 },
  histBody: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.outline },
  histTexto: { fontSize: 13.5, color: c.onSurface, lineHeight: 20 },
});
