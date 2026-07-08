import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Linking } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Typography } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { KpiCard } from '../../components/web/KpiCard';
import { TabelaDados, Coluna } from '../../components/web/TabelaDados';
import { OlliSkeleton } from '../../components/OlliSkeleton';
import { OlliPressable } from '../../components/OlliPressable';
import { StatusBadge } from '../../components/StatusBadge';
import { getOrcamentos, getEmpresa, getClientes } from '../../database/database';
import { getProximoAgendamento } from '../../services/agenda';
import { clientesParaReconquistar, mensagemReconquista, ClienteParaReconquistar } from '../../services/radarClientes';
import { onSyncAplicado } from '../../services/cloudSync';
import { abrirWhatsApp } from '../../utils/pdfGenerator';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { Empresa, Orcamento, Agendamento, TIPO_AGENDAMENTO_LABELS, propostaJaEnviada } from '../../types';
import { avisar, confirmar } from './dialogo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
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

/** Nomes curtos dos últimos 6 meses (incluindo o atual), na ordem cronológica. */
function ultimosSeisMeses(): { chave: string; label: string }[] {
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const hoje = new Date();
  const meses: { chave: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ chave: `${d.getFullYear()}-${d.getMonth()}`, label: nomes[d.getMonth()] });
  }
  return meses;
}

export default function InicioDesktopScreen() {
  const nav = useNavigation<Nav>();
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [clientesCount, setClientesCount] = useState(0);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [proxima, setProxima] = useState<Agendamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [radar, setRadar] = useState<ClienteParaReconquistar[]>([]);
  const [radarCarregando, setRadarCarregando] = useState(true);
  const [larguraGrafico, setLarguraGrafico] = useState(0);

  const load = useCallback(async () => {
    const [all, emp, prox, clientes] = await Promise.all([
      getOrcamentos(), getEmpresa(), getProximoAgendamento(), getClientes(),
    ]);
    setOrcamentos(all);
    setEmpresa(emp);
    setProxima(prox);
    setClientesCount(clientes.length);
    setCarregando(false);
  }, []);

  const loadRadar = useCallback(async () => {
    try {
      const lista = await clientesParaReconquistar();
      setRadar(lista.slice(0, 3));
    } catch {
      setRadar([]);
    } finally {
      setRadarCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); loadRadar(); }, [load, loadRadar]));
  useEffect(() => onSyncAplicado(() => { load(); loadRadar(); }), [load, loadRadar]);

  async function chamarNoWhatsApp(item: ClienteParaReconquistar) {
    if (!item.cliente.telefone?.trim()) {
      avisar('Sem telefone', `Cadastre o WhatsApp de ${item.cliente.nome} em Clientes para chamar por aqui.`);
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    const mensagem = mensagemReconquista(item.cliente.nome, item.mesesSemContato);
    try {
      await abrirWhatsApp(item.cliente.telefone, mensagem);
    } catch {
      // silencioso: mesmo padrão do resto do app
    }
  }

  const irParaAgenda = () => (nav as any).navigate('Tabs', { screen: 'Agenda' });
  const irParaOrcamentos = () => (nav as any).navigate('Tabs', { screen: 'OrcamentosTab' });

  // ── métricas ──
  const aprovados = orcamentos.filter(o => o.status === 'aprovado');
  const agora = new Date();
  const aprovadosNoMes = aprovados.filter(o => {
    const d = new Date(o.criadoEm);
    return d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth();
  });
  const faturamentoNoMes = aprovadosNoMes.reduce((s, o) => s + o.valorTotal, 0);
  // "Em aberto" cobre toda proposta já entregue ao cliente sem desfecho
  // (enviado/visualizado/em_negociação/aguardando_assinatura), não só os dois
  // estados antigos — senão as propostas mais quentes sumiam do KPI/valor.
  const emAberto = orcamentos.filter(o => propostaJaEnviada(o.status));
  const valorEmAberto = emAberto.reduce((s, o) => s + o.valorTotal, 0);
  const conversao = orcamentos.length ? Math.round((aprovados.length / orcamentos.length) * 100) : 0;
  const primeiroNome = empresa?.nomePrestador?.split(' ')[0] || empresa?.nome || 'prestador';
  const ultimosOito = orcamentos.slice(0, 8);

  // ── gráfico: faturamento aprovado por mês (últimos 6 meses) ──
  const meses = ultimosSeisMeses();
  const dadosGrafico = meses.map(({ chave, label }) => {
    const total = aprovados.reduce((s, o) => {
      const d = new Date(o.criadoEm);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      return k === chave ? s + o.valorTotal : s;
    }, 0);
    return { value: total, label, frontColor: Colors.accent };
  });
  const maiorValor = Math.max(1, ...dadosGrafico.map(d => d.value));

  const colunasOrcamentos: Coluna<Orcamento>[] = [
    { chave: 'numero', titulo: 'Número', largura: 100, render: (o) => <Text style={styles.celulaTexto}>{o.numero}</Text> },
    { chave: 'cliente', titulo: 'Cliente', largura: '30%', render: (o) => <Text style={styles.celulaTexto} numberOfLines={1}>{o.clienteNome}</Text>, tituloCompleto: (o) => o.clienteNome },
    { chave: 'valor', titulo: 'Valor', largura: 130, alinhamento: 'direita', render: (o) => <Text style={styles.celulaValor}>{formatCurrency(o.valorTotal)}</Text> },
    { chave: 'status', titulo: 'Status', largura: 150, render: (o) => <StatusBadge status={o.status} size="sm" /> },
    { chave: 'data', titulo: 'Data', largura: 110, render: (o) => <Text style={styles.celulaTexto}>{formatDate(o.criadoEm)}</Text> },
  ];

  return (
    <LayoutDesktop
      titulo={`${saudacao()}, ${primeiroNome}`}
      subtitulo={empresa?.nome}
    >
      {/* KPIs */}
      <View style={styles.kpiGrid}>
        <KpiCard
          titulo="Em aberto"
          valor={carregando ? '—' : formatCurrency(valorEmAberto)}
          icone="clock-outline"
          corIcone={Colors.warning}
          rodape={`${emAberto.length} orçamento${emAberto.length === 1 ? '' : 's'}`}
        />
        <KpiCard
          titulo="Aprovados no mês"
          valor={carregando ? '—' : formatCurrency(faturamentoNoMes)}
          icone="check-decagram-outline"
          corIcone={Colors.success}
          rodape={`${aprovadosNoMes.length} orçamento${aprovadosNoMes.length === 1 ? '' : 's'}`}
        />
        <KpiCard
          titulo="Taxa de conversão"
          valor={carregando ? '—' : `${conversao}%`}
          icone="chart-line"
          corIcone={Colors.accent}
          rodape={orcamentos.length ? `${aprovados.length}/${orcamentos.length} aprovados` : 'sem histórico'}
        />
        <KpiCard
          titulo="Clientes ativos"
          valor={carregando ? '—' : String(clientesCount)}
          icone="account-group-outline"
          corIcone={Colors.primaryLight}
        />
      </View>

      {/* Faturamento + Próxima visita / Radar */}
      <View style={styles.linha2}>
        <View style={[styles.cartao, styles.cartaoGrafico]}>
          <Text style={styles.cartaoTitulo}>Faturamento aprovado — últimos 6 meses</Text>
          <View
            style={styles.graficoWrap}
            onLayout={(e: LayoutChangeEvent) => setLarguraGrafico(e.nativeEvent.layout.width)}
          >
            {carregando ? (
              <OlliSkeleton width="100%" height={200} />
            ) : larguraGrafico > 0 ? (
              <BarChart
                data={dadosGrafico}
                width={Math.max(0, larguraGrafico - 40)}
                height={200}
                barWidth={28}
                spacing={28}
                roundedTop
                barBorderRadius={6}
                noOfSections={4}
                maxValue={maiorValor * 1.15}
                yAxisThickness={0}
                xAxisThickness={1}
                xAxisColor={Colors.outline}
                rulesColor={Colors.outline}
                rulesType="dashed"
                yAxisTextStyle={{ color: Colors.onSurfaceMuted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: Colors.onSurfaceVariant, fontSize: 11 }}
                yAxisLabelWidth={44}
                formatYLabel={(v: string) => {
                  const n = Number(v);
                  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
                  return v;
                }}
                isAnimated
              />
            ) : null}
          </View>
        </View>

        <View style={styles.colunaDireita}>
          <View style={[styles.cartao, styles.cartaoVisita]}>
            <Text style={styles.cartaoTitulo}>Próxima visita</Text>
            {carregando ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                <OlliSkeleton width="60%" height={16} />
                <OlliSkeleton width="80%" height={14} />
              </View>
            ) : proxima ? (
              <View style={{ marginTop: 10, gap: 4 }}>
                <Text style={styles.visitaQuando}>{quandoLabel(proxima.inicio)}</Text>
                <Text style={styles.visitaCliente} numberOfLines={1}>{proxima.clienteNome || proxima.titulo}</Text>
                <Text style={styles.visitaTipo} numberOfLines={1}>
                  {TIPO_AGENDAMENTO_LABELS[proxima.tipo]}{proxima.titulo && proxima.clienteNome ? ` · ${proxima.titulo}` : ''}
                </Text>
                {proxima.endereco ? (
                  <View style={styles.visitaEndereco}>
                    <MaterialCommunityIcons name="map-marker" size={13} color={Colors.accentLight} />
                    <Text style={styles.visitaEnderecoTexto} numberOfLines={1}>{proxima.endereco}</Text>
                  </View>
                ) : null}
                <View style={styles.visitaAcoes}>
                  {proxima.endereco ? (
                    <OlliPressable style={styles.visitaBtn} onPress={() => abrirMapa(proxima.endereco)} haptic={false}>
                      <MaterialCommunityIcons name="navigation-variant" size={14} color="#0A1626" />
                      <Text style={styles.visitaBtnTexto}>Ver no mapa</Text>
                    </OlliPressable>
                  ) : null}
                  <OlliPressable style={styles.visitaBtnGhost} onPress={irParaAgenda} haptic={false}>
                    <Text style={styles.visitaBtnGhostTexto}>Ver agenda</Text>
                  </OlliPressable>
                </View>
              </View>
            ) : (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.visitaVazioTexto}>Nenhuma visita agendada.</Text>
                <OlliPressable style={[styles.visitaBtn, { alignSelf: 'flex-start', marginTop: 10 }]} onPress={irParaAgenda} haptic={false}>
                  <MaterialCommunityIcons name="calendar-plus" size={14} color="#0A1626" />
                  <Text style={styles.visitaBtnTexto}>Abrir agenda</Text>
                </OlliPressable>
              </View>
            )}
          </View>

          <View style={[styles.cartao, styles.cartaoRadar]}>
            <Text style={styles.cartaoTitulo}>Radar de clientes</Text>
            {radarCarregando ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                <OlliSkeleton width="100%" height={44} />
              </View>
            ) : radar.length === 0 ? (
              <Text style={styles.visitaVazioTexto}>Nenhum cliente sumido no momento.</Text>
            ) : (
              <View style={{ gap: 8, marginTop: 10 }}>
                {radar.map((item) => (
                  <View key={item.cliente.id} style={styles.radarLinha}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.radarNome} numberOfLines={1}>{item.cliente.nome}</Text>
                      <Text style={styles.radarMeta}>há {item.mesesSemContato} {item.mesesSemContato === 1 ? 'mês' : 'meses'} sem contato</Text>
                    </View>
                    <OlliPressable style={styles.radarBtn} onPress={() => chamarNoWhatsApp(item)} haptic={false}>
                      <MaterialCommunityIcons name="whatsapp" size={15} color="#0A1626" />
                    </OlliPressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Últimos orçamentos */}
      <View style={styles.secaoTabela}>
        <View style={styles.secaoTabelaHeader}>
          <Text style={styles.secaoTabelaTitulo}>Últimos orçamentos</Text>
          <OlliPressable onPress={irParaOrcamentos} haptic={false}>
            <Text style={styles.verTodos}>ver todos</Text>
          </OlliPressable>
        </View>
        <TabelaDados<Orcamento>
          colunas={colunasOrcamentos}
          dados={ultimosOito}
          carregando={carregando}
          aoClicarLinha={(o) => nav.navigate('VisualizarOrcamento', { orcamentoId: o.id })}
        />
      </View>
    </LayoutDesktop>
  );
}

const styles = StyleSheet.create({
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  linha2: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
    alignItems: 'stretch',
  },
  colunaDireita: {
    width: 320,
    gap: Spacing.md,
  },
  cartao: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    padding: Spacing.lg,
  },
  cartaoGrafico: {
    flex: 1,
  },
  cartaoVisita: {},
  cartaoRadar: {
    flex: 1,
  },
  cartaoTitulo: {
    ...Typography.label,
    color: Colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  graficoWrap: {
    marginTop: Spacing.md,
    minHeight: 200,
    justifyContent: 'center',
  },

  visitaQuando: { ...Typography.label, color: Colors.accentLight },
  visitaCliente: { ...Typography.h4, color: Colors.onSurface, marginTop: 2 },
  visitaTipo: { ...Typography.caption, color: Colors.onSurfaceVariant, marginTop: 2 },
  visitaEndereco: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  visitaEnderecoTexto: { ...Typography.caption, color: Colors.onSurfaceVariant, flex: 1 },
  visitaAcoes: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  visitaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 9 },
  visitaBtnTexto: { fontSize: 12.5, fontWeight: '800', color: '#0A1626' },
  visitaBtnGhost: { borderWidth: 1, borderColor: Colors.strokeGlow, backgroundColor: Colors.surfacePressed, borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 9 },
  visitaBtnGhostTexto: { fontSize: 12.5, fontWeight: '800', color: Colors.accentLight },
  visitaVazioTexto: { ...Typography.body, color: Colors.onSurfaceVariant, marginTop: 10 },

  radarLinha: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.outline, paddingTop: Spacing.sm },
  radarNome: { ...Typography.bodySmall, color: Colors.onSurface, fontWeight: '700' },
  radarMeta: { ...Typography.caption, color: Colors.onSurfaceVariant, marginTop: 1 },
  radarBtn: { width: 30, height: 30, borderRadius: BorderRadius.full, backgroundColor: Colors.whatsapp, alignItems: 'center', justifyContent: 'center' },

  secaoTabela: { gap: Spacing.sm },
  secaoTabelaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  secaoTabelaTitulo: { ...Typography.h4, color: Colors.onSurface },
  verTodos: { ...Typography.bodySmall, color: Colors.accent, fontWeight: '700' },

  celulaTexto: { ...Typography.bodySmall, color: Colors.onSurface },
  celulaValor: { ...Typography.bodySmall, color: Colors.accent, fontWeight: '700' },
});
