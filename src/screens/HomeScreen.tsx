import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Modal, Pressable, Linking } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '../theme';
import { getOrcamentos, getEmpresa } from '../database/database';
import { getProximoAgendamento } from '../services/agenda';
import { formatCurrency } from '../utils/currency';
import { formatDate } from '../utils/date';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Empresa, Orcamento, Agendamento, TIPO_AGENDAMENTO_LABELS } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { OlliMascot } from '../components/OlliMascot';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia,';
  if (h < 18) return 'Boa tarde,';
  return 'Boa noite,';
}

function diasAtras(iso: string): number {
  const d = new Date(iso);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

const mesmoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Rótulo amigável do horário da próxima parada: "Hoje · 14:30", "Amanhã · 09:00" ou "18/06 · 14:30". */
function quandoLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const hoje = new Date();
  const amanha = new Date(); amanha.setDate(hoje.getDate() + 1);
  if (mesmoDia(d, hoje)) return `Hoje · ${hh}`;
  if (mesmoDia(d, amanha)) return `Amanhã · ${hh}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} · ${hh}`;
}

/** Abre o endereço no Google Maps (sem precisar de API key — só um link de busca). */
function abrirMapa(endereco?: string) {
  if (!endereco) return;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
  Linking.openURL(url).catch(() => {});
}

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [olliMenu, setOlliMenu] = useState(false);
  const [proxima, setProxima] = useState<Agendamento | null>(null);

  const load = useCallback(async () => {
    const [all, emp, prox] = await Promise.all([getOrcamentos(), getEmpresa(), getProximoAgendamento()]);
    setOrcamentos(all);
    setEmpresa(emp);
    setProxima(prox);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // ── métricas reais ──
  const aprovados = orcamentos.filter(o => o.status === 'aprovado');
  const faturamento = aprovados.reduce((s, o) => s + o.valorTotal, 0);
  const emAberto = orcamentos.filter(o => o.status === 'enviado' || o.status === 'aguardando_assinatura');
  const conversao = orcamentos.length ? Math.round((aprovados.length / orcamentos.length) * 100) : 0;
  const parados = emAberto.filter(o => diasAtras(o.criadoEm) >= 5);
  const valorParado = parados.reduce((s, o) => s + o.valorTotal, 0);
  const conversaoDetalhe = orcamentos.length ? `${aprovados.length}/${orcamentos.length} aprovados` : 'sem histórico';
  const emAbertoDetalhe = parados.length > 0 ? `${parados.length} parados` : 'sem atrasos';
  const recentes = orcamentos.slice(0, 4);
  const primeiroNome = empresa?.nomePrestador?.split(' ')[0] || 'prestador';

  const abrirOlli = () => {
    Haptics.selectionAsync().catch(() => {});
    setOlliMenu(true);
  };

  const irPara = (rota: 'OlliVoz' | 'OlliChat') => {
    setOlliMenu(false);
    Haptics.selectionAsync().catch(() => {});
    nav.navigate(rota);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 116 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} colors={[Colors.accent]} />}
      >
        {/* TOP BAR */}
        <View style={styles.topbar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{saudacao()}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {primeiroNome}
              {empresa?.nome ? <Text style={styles.company}>  ·  {empresa.nome}</Text> : null}
            </Text>
          </View>
          <TouchableOpacity style={styles.olliBtn} onPress={abrirOlli} activeOpacity={0.8}>
            <OlliMascot size={34} onDark />
            {parados.length > 0 && (
              <View style={styles.olliBadge}><Text style={styles.olliBadgeText}>{parados.length}</Text></View>
            )}
          </TouchableOpacity>
        </View>

        {/* HERO — AO VIVO · próxima parada (empty-state até existir agenda) */}
        <AnimatedEntrance index={0}>
          <LinearGradient
            colors={['rgba(11,111,206,0.38)', 'rgba(52,198,217,0.08)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.liveRow}>
                <View style={styles.liveDot} />
                <Text style={styles.liveLabel}>AO VIVO · PRÓXIMA PARADA</Text>
              </View>
            </View>
            {proxima ? (
              <View style={styles.heroFilled}>
                <Text style={styles.heroWhen}>{quandoLabel(proxima.inicio)}</Text>
                <Text style={styles.heroClient} numberOfLines={1}>{proxima.clienteNome || proxima.titulo}</Text>
                <Text style={styles.heroType} numberOfLines={1}>
                  {TIPO_AGENDAMENTO_LABELS[proxima.tipo]}{proxima.titulo && proxima.clienteNome ? ` · ${proxima.titulo}` : ''}
                </Text>
                {proxima.endereco ? (
                  <View style={styles.heroAddr}>
                    <MaterialCommunityIcons name="map-marker" size={14} color={Colors.accentLight} />
                    <Text style={styles.heroAddrText} numberOfLines={1}>{proxima.endereco}</Text>
                  </View>
                ) : null}
                <View style={styles.heroActions}>
                  {proxima.endereco ? (
                    <TouchableOpacity style={[styles.heroBtn, { marginTop: 0 }]} onPress={() => { Haptics.selectionAsync().catch(() => {}); abrirMapa(proxima.endereco); }} activeOpacity={0.85}>
                      <MaterialCommunityIcons name="navigation-variant" size={16} color="#0A1626" />
                      <Text style={styles.heroBtnText}>Ver no mapa</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.heroBtnGhost} onPress={() => { Haptics.selectionAsync().catch(() => {}); (nav as any).navigate('Tabs', { screen: 'Agenda' }); }} activeOpacity={0.85}>
                    <Text style={styles.heroBtnGhostText}>Ver agenda</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.heroEmpty}>
                <MaterialCommunityIcons name="calendar-blank-outline" size={30} color={Colors.accent} />
                <Text style={styles.heroEmptyTitle}>Nenhuma visita agendada</Text>
                <Text style={styles.heroEmptySub}>Agende seus serviços e organize o seu dia. A próxima parada aparece aqui.</Text>
                <TouchableOpacity style={styles.heroBtn} onPress={() => { Haptics.selectionAsync().catch(() => {}); (nav as any).navigate('Tabs', { screen: 'Agenda' }); }} activeOpacity={0.85}>
                  <MaterialCommunityIcons name="calendar-plus" size={18} color="#0A1626" />
                  <Text style={styles.heroBtnText}>Abrir agenda</Text>
                </TouchableOpacity>
              </View>
            )}
          </LinearGradient>
        </AnimatedEntrance>

        {/* KPIs */}
        <AnimatedEntrance index={1}>
          <View style={styles.kpis}>
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>{formatCurrency(faturamento)}</Text>
              <Text style={styles.kpiLabel}>aprovados</Text>
              <Text style={styles.kpiHint}>valor fechado</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>{conversao}%</Text>
              <Text style={styles.kpiHint}>{conversaoDetalhe}</Text>
              <Text style={styles.kpiLabel}>conversão</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>{emAberto.length}</Text>
              <Text style={styles.kpiLabel}>em aberto</Text>
              <Text style={[styles.kpiHint, parados.length > 0 && styles.kpiHintWarn]}>{emAbertoDetalhe}</Text>
            </View>
          </View>
        </AnimatedEntrance>

        {/* ANZOL — Diagnóstico por código de erro (offline, único no BR) */}
        <AnimatedEntrance index={2}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Diagnostico'); }}
          >
            <LinearGradient
              colors={['rgba(11,111,206,0.30)', 'rgba(52,198,217,0.10)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.anzol}
            >
              <View style={styles.anzolIcon}>
                <MaterialCommunityIcons name="card-search-outline" size={26} color={Colors.accentLight} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.anzolTitle}>Diagnóstico de erro</Text>
                <Text style={styles.anzolSub}>602 códigos de ar-condicionado · ache a falha em segundos, offline</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.accentLight} />
            </LinearGradient>
          </TouchableOpacity>
        </AnimatedEntrance>

        {/* LEMBRETE DA OLLI — orçamentos parados */}
        {parados.length > 0 && (
          <AnimatedEntrance index={2}>
            <View style={styles.lembrete}>
              <OlliMascot size={40} float={false} onDark />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.lembreteTitle}>{parados.length} orçamento{parados.length > 1 ? 's' : ''} parado{parados.length > 1 ? 's' : ''} há +5 dias</Text>
                <Text style={styles.lembreteSub}>{formatCurrency(valorParado)} em jogo. Priorize o follow-up.</Text>
              </View>
              <TouchableOpacity style={styles.cobrarBtn} onPress={() => nav.navigate('Orcamentos')} activeOpacity={0.85}>
                <Text style={styles.cobrarText}>Cobrar</Text>
              </TouchableOpacity>
            </View>
          </AnimatedEntrance>
        )}

        <Text style={styles.sectionTitle}>Equipe e processos</Text>
        <AnimatedEntrance index={3}>
          <View style={styles.processCard}>
            <View style={styles.processHeader}>
              <View style={styles.processIcon}>
                <MaterialCommunityIcons name="account-group-outline" size={24} color={Colors.accentLight} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.processTitle}>Prévia operacional</Text>
                <Text style={styles.processSub}>Sem rastreamento real de equipe ainda. A OLLI usa agenda e orçamentos salvos para apontar prioridades.</Text>
              </View>
              <View style={styles.previewChip}>
                <Text style={styles.previewChipText}>em breve</Text>
              </View>
            </View>

            <View style={styles.processGrid}>
              <ProcessMetric icon="clipboard-list-outline" label="Fila comercial" value={`${emAberto.length} em aberto`} tone={Colors.accent} />
              <ProcessMetric
                icon="clock-alert-outline"
                label="Follow-up"
                value={parados.length > 0 ? `${parados.length} parados` : 'em dia'}
                tone={parados.length > 0 ? Colors.warning : Colors.success}
              />
              <ProcessMetric
                icon="calendar-clock"
                label="Agenda"
                value={proxima ? 'próxima parada ok' : 'sem próxima parada'}
                tone={proxima ? Colors.success : Colors.onSurfaceMuted}
              />
            </View>

            <View style={styles.processActions}>
              <TouchableOpacity style={styles.processPrimary} onPress={() => { Haptics.selectionAsync().catch(() => {}); (nav as any).navigate('Tabs', { screen: 'Agenda' }); }} activeOpacity={0.85}>
                <Text style={styles.processPrimaryText}>Abrir agenda</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.processGhost} onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('MeuNegocio'); }} activeOpacity={0.85}>
                <Text style={styles.processGhostText}>Configurar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </AnimatedEntrance>

        {orcamentos.length === 0 && (
          <AnimatedEntrance index={3}>
            <StarterCard
              onCreate={() => nav.navigate('NovoOrcamento', {})}
              onVoice={() => nav.navigate('OlliVoz')}
              onSetup={() => nav.navigate('MeuNegocio')}
            />
          </AnimatedEntrance>
        )}

        {/* AÇÕES RÁPIDAS */}
        <Text style={styles.sectionTitle}>Ações rápidas</Text>
        <AnimatedEntrance index={4}>
          <View style={styles.actions}>
            <Action icon="file-plus" label="Orçar" color={Colors.accent} onPress={() => nav.navigate('NovoOrcamento', {})} />
            <Action icon="receipt" label="Recibo" color={Colors.success} onPress={() => nav.navigate('EmitirRecibo', {})} />
            <Action icon="account-group" label="Clientes" color="#A78BFA" onPress={() => nav.navigate('Clientes')} />
            <Action icon="wrench" label="Serviços" color={Colors.primaryLight} onPress={() => nav.navigate('Servicos')} />
          </View>
        </AnimatedEntrance>

        {/* RESTO DO DIA / ATIVIDADE RECENTE */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Orçamentos recentes</Text>
          <TouchableOpacity onPress={() => nav.navigate('Orcamentos')}>
            <Text style={styles.seeAll}>ver todos</Text>
          </TouchableOpacity>
        </View>

        {recentes.length === 0 ? (
          <View style={styles.emptyRecent}>
            <Text style={styles.emptyText}>Nenhum orçamento ainda.</Text>
            <TouchableOpacity onPress={() => nav.navigate('NovoOrcamento', {})}>
              <Text style={styles.emptyLink}>Criar o primeiro</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingHorizontal: Spacing.base, gap: 10 }}>
            {recentes.map((o, i) => (
              <AnimatedEntrance key={o.id} index={4 + i}>
                <TouchableOpacity style={styles.recentCard} onPress={() => nav.navigate('VisualizarOrcamento', { orcamentoId: o.id })} activeOpacity={0.85}>
                  <View style={styles.recentAvatar}><Text style={styles.recentAvatarText}>{o.clienteNome.charAt(0).toUpperCase()}</Text></View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.recentName} numberOfLines={1}>{o.clienteNome}</Text>
                    <Text style={styles.recentMeta}>Nº {o.numero} · {formatDate(o.criadoEm)}</Text>
                    <View style={{ marginTop: 5 }}><StatusBadge status={o.status} size="sm" /></View>
                  </View>
                  <Text style={styles.recentValue}>{formatCurrency(o.valorTotal)}</Text>
                </TouchableOpacity>
              </AnimatedEntrance>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Home limpa (design 01): OLLI fica no robô do topo-direito (abre voz+chat)
          e o Orçamento é o botão central elevado da tab bar. Sem FABs sobrepostos. */}

      {/* MENU RÁPIDO DA OLLI (robô no topo) */}
      <Modal visible={olliMenu} transparent animationType="fade" onRequestClose={() => setOlliMenu(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setOlliMenu(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <View style={styles.sheetMascot}><OlliMascot size={34} onDark float={false} /></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.sheetTitle}>Oi, eu sou a OLLI</Text>
                <Text style={styles.sheetSub}>Como posso te ajudar agora?</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.sheetItem} onPress={() => irPara('OlliVoz')} activeOpacity={0.8}>
              <View style={[styles.sheetIcon, { backgroundColor: 'rgba(52,198,217,0.14)', borderColor: 'rgba(52,198,217,0.34)' }]}>
                <MaterialCommunityIcons name="microphone" size={22} color={Colors.accent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.sheetItemTitle}>Montar orçamento por voz</Text>
                <Text style={styles.sheetItemDesc}>Fale o serviço e eu monto pra você</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.onSurfaceMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetItem} onPress={() => irPara('OlliChat')} activeOpacity={0.8}>
              <View style={[styles.sheetIcon, { backgroundColor: 'rgba(11,111,206,0.18)', borderColor: 'rgba(11,111,206,0.36)' }]}>
                <MaterialCommunityIcons name="chat-processing-outline" size={22} color={Colors.primaryLight} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.sheetItemTitle}>Conversar com a OLLI</Text>
                <Text style={styles.sheetItemDesc}>Tire dúvidas técnicas, preços e diagnóstico</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.onSurfaceMuted} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StarterCard({ onCreate, onVoice, onSetup }: { onCreate: () => void; onVoice: () => void; onSetup: () => void }) {
  return (
    <View style={styles.starterCard}>
      <View style={styles.starterTop}>
        <View style={styles.starterIcon}>
          <MaterialCommunityIcons name="rocket-launch-outline" size={23} color={Colors.accentLight} />
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
        <TouchableOpacity style={styles.starterPrimary} onPress={onVoice} activeOpacity={0.86}>
          <MaterialCommunityIcons name="microphone" size={17} color="#0A1626" />
          <Text style={styles.starterPrimaryText}>Criar por voz</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.starterGhost} onPress={onCreate} activeOpacity={0.86}>
          <Text style={styles.starterGhostText}>Manual</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.starterSetup} onPress={onSetup} activeOpacity={0.8}>
        <MaterialCommunityIcons name="storefront-outline" size={15} color={Colors.onSurfaceVariant} />
        <Text style={styles.starterSetupText}>Configurar logo, PIX e assinatura</Text>
      </TouchableOpacity>
    </View>
  );
}

function MiniStep({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.miniStep}>
      <Text style={styles.miniStepN}>{n}</Text>
      <Text style={styles.miniStepText}>{text}</Text>
    </View>
  );
}

function ProcessMetric({ icon, label, value, tone }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; tone: string }) {
  return (
    <View style={styles.processMetric}>
      <MaterialCommunityIcons name={icon} size={16} color={tone} />
      <Text style={styles.processMetricLabel}>{label}</Text>
      <Text style={styles.processMetricValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Action({ icon, label, color, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.action} onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} activeOpacity={0.8}>
      <View style={[styles.actionIcon, { backgroundColor: color + '22', borderColor: color + '44' }]}>
        <MaterialCommunityIcons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, marginBottom: 4 },
  greeting: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '500' },
  name: { fontSize: 21, fontWeight: '800', color: '#fff', marginTop: 1 },
  company: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceMuted },
  olliBtn: { width: 48, height: 48, borderRadius: 15, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.3)', justifyContent: 'center', alignItems: 'center' },
  olliBadge: { position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: Colors.danger, borderWidth: 2, borderColor: Colors.background, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  olliBadgeText: { fontSize: 9.5, fontWeight: '800', color: '#fff' },

  hero: { margin: Spacing.base, borderRadius: BorderRadius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.strokeGlow, ...Shadow.md },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  liveLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0, color: Colors.accentLight },
  heroEmpty: { alignItems: 'center', paddingVertical: 14 },
  heroEmptyTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginTop: 8 },
  heroEmptySub: { fontSize: 12.5, color: 'rgba(226,232,240,0.65)', textAlign: 'center', marginTop: 4, lineHeight: 18, paddingHorizontal: 10 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 17, paddingVertical: 11, marginTop: 14 },
  heroBtnText: { fontSize: 13, fontWeight: '800', color: '#0A1626' },

  // Próxima parada preenchida (próximo agendamento real)
  heroFilled: { marginTop: 12 },
  heroWhen: { fontSize: 12, fontWeight: '800', letterSpacing: 0, color: Colors.accentLight },
  heroClient: { fontSize: 19, fontWeight: '800', color: '#fff', marginTop: 4 },
  heroType: { fontSize: 13, color: 'rgba(226,232,240,0.7)', marginTop: 2 },
  heroAddr: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  heroAddrText: { flex: 1, fontSize: 12.5, color: 'rgba(226,232,240,0.8)' },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  heroBtnGhost: { borderWidth: 1, borderColor: Colors.strokeGlow, backgroundColor: Colors.surfacePressed, borderRadius: BorderRadius.full, paddingHorizontal: 16, paddingVertical: 10 },
  heroBtnGhostText: { fontSize: 13, fontWeight: '800', color: Colors.accentLight },

  kpis: { flexDirection: 'row', backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.outlineDark, marginHorizontal: Spacing.base, paddingVertical: 14 },
  kpi: { flex: 1, alignItems: 'center' },
  kpiValue: { ...Typography.value, fontSize: 19, color: '#fff' },
  kpiLabel: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 3, fontWeight: '500' },
  kpiHint: { fontSize: 10.5, color: Colors.onSurfaceMuted, marginTop: 2, fontWeight: '700', textAlign: 'center' },
  kpiHintWarn: { color: Colors.warning },
  kpiDivider: { width: 1, backgroundColor: Colors.outline, marginVertical: 4 },

  anzol: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.base, marginTop: 12, padding: Spacing.base, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.strokeGlow },
  anzolIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.3)', justifyContent: 'center', alignItems: 'center' },
  anzolTitle: { fontSize: 15.5, fontWeight: '800', color: '#fff' },
  anzolSub: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2, lineHeight: 16 },

  lembrete: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.3)', borderRadius: BorderRadius.xl, padding: Spacing.md, marginHorizontal: Spacing.base, marginTop: 12 },
  lembreteTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  lembreteSub: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 1 },
  cobrarBtn: { backgroundColor: Colors.warning, borderRadius: BorderRadius.full, paddingHorizontal: 16, paddingVertical: 8 },
  cobrarText: { fontSize: 13, fontWeight: '800', color: '#0A1626' },

  processCard: { marginHorizontal: Spacing.base, backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.outlineDark, padding: Spacing.base, ...Shadow.sm },
  processHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  processIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.28)', justifyContent: 'center', alignItems: 'center' },
  processTitle: { fontSize: 15.5, fontWeight: '800', color: '#fff' },
  processSub: { fontSize: 12.2, color: Colors.onSurfaceVariant, lineHeight: 17, marginTop: 3 },
  previewChip: { borderRadius: BorderRadius.full, borderWidth: 1, borderColor: 'rgba(127,233,245,0.28)', backgroundColor: Colors.surfacePressed, paddingHorizontal: 9, paddingVertical: 5, marginLeft: 8 },
  previewChipText: { fontSize: 10, fontWeight: '800', color: Colors.accentLight },
  processGrid: { flexDirection: 'row', gap: 8, marginTop: 14 },
  processMetric: { flex: 1, minHeight: 82, backgroundColor: Colors.surfacePressed, borderWidth: 1, borderColor: Colors.outline, borderRadius: BorderRadius.md, padding: 10, justifyContent: 'space-between' },
  processMetricLabel: { fontSize: 10.5, color: Colors.onSurfaceMuted, fontWeight: '700', marginTop: 5 },
  processMetricValue: { fontSize: 12.2, color: '#fff', fontWeight: '800' },
  processActions: { flexDirection: 'row', gap: 9, marginTop: 14 },
  processPrimary: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full, paddingVertical: 11 },
  processPrimaryText: { fontSize: 13, fontWeight: '800', color: '#0A1626' },
  processGhost: { minWidth: 112, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.strokeGlow, backgroundColor: Colors.surfacePressed, borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 11 },
  processGhostText: { fontSize: 13, fontWeight: '800', color: Colors.accentLight },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#fff', paddingHorizontal: Spacing.base, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: Spacing.base },
  seeAll: { fontSize: 12.5, color: Colors.accent, fontWeight: '700', marginTop: Spacing.xl, marginBottom: Spacing.sm },

  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.base },
  action: { alignItems: 'center', flex: 1 },
  actionIcon: { width: 58, height: 58, borderRadius: BorderRadius.lg, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  actionLabel: { fontSize: 11.5, color: Colors.onSurfaceVariant, marginTop: 6, fontWeight: '600' },

  starterCard: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.lg,
    padding: Spacing.base,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.strokeGlow,
    ...Shadow.md,
  },
  starterTop: { flexDirection: 'row', alignItems: 'center' },
  starterIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.32)', justifyContent: 'center', alignItems: 'center' },
  starterTitle: { fontSize: 15.5, fontWeight: '800', color: '#fff' },
  starterSub: { fontSize: 12.5, color: Colors.onSurfaceVariant, lineHeight: 17, marginTop: 2 },
  starterSteps: { flexDirection: 'row', gap: 8, marginTop: 14 },
  miniStep: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.surfacePressed, borderWidth: 1, borderColor: Colors.outline, borderRadius: BorderRadius.full, paddingVertical: 8 },
  miniStepN: { width: 18, height: 18, borderRadius: 9, overflow: 'hidden', backgroundColor: Colors.accentLight, textAlign: 'center', color: '#0A1626', fontSize: 11, fontWeight: '800', lineHeight: 18 },
  miniStepText: { fontSize: 11.5, fontWeight: '700', color: Colors.onSurfaceVariant },
  starterActions: { flexDirection: 'row', gap: 9, marginTop: 14 },
  starterPrimary: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full, paddingVertical: 12 },
  starterPrimaryText: { fontSize: 13.5, fontWeight: '800', color: '#0A1626' },
  starterGhost: { minWidth: 88, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.strokeGlow, backgroundColor: Colors.surfacePressed },
  starterGhostText: { fontSize: 13.5, fontWeight: '800', color: Colors.accentLight },
  starterSetup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  starterSetupText: { fontSize: 12.5, fontWeight: '700', color: Colors.onSurfaceVariant },

  emptyRecent: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 14, color: Colors.onSurfaceVariant },
  emptyLink: { fontSize: 14, color: Colors.accent, fontWeight: '700', marginTop: 8 },

  recentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.outlineDark, padding: Spacing.md },
  recentAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(11,111,206,0.2)', justifyContent: 'center', alignItems: 'center' },
  recentAvatarText: { fontSize: 17, fontWeight: '800', color: Colors.accentLight },
  recentName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  recentMeta: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  recentValue: { fontSize: 15, fontWeight: '800', color: Colors.accent, marginLeft: 8 },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(5,12,22,0.72)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.outline, paddingHorizontal: Spacing.base, paddingTop: 10, paddingBottom: 32 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.outlineDark, marginBottom: Spacing.base },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.base },
  sheetMascot: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.3)', justifyContent: 'center', alignItems: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  sheetSub: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: Spacing.md, marginBottom: 10 },
  sheetIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  sheetItemTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  sheetItemDesc: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginTop: 2 },
});
