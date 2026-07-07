import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PieChart, LineChart } from 'react-native-gifted-charts';
import { Colors, Spacing, BorderRadius, Typography } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { KpiCard } from '../../components/web/KpiCard';
import { OlliSkeleton } from '../../components/OlliSkeleton';
import { OlliPressable } from '../../components/OlliPressable';
import { getOrcamentos } from '../../database/database';
import { onSyncAplicado } from '../../services/cloudSync';
import { formatCurrency } from '../../utils/currency';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { Orcamento, StatusOrcamento, STATUS_LABELS, STATUS_COLORS } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ORDEM_STATUS: StatusOrcamento[] = ['rascunho', 'enviado', 'aguardando_assinatura', 'aprovado', 'recusado', 'cancelado'];

/** Nomes curtos dos últimos 12 meses (incluindo o atual), na ordem cronológica. */
function ultimosDozeMeses(): { chave: string; label: string }[] {
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const hoje = new Date();
  const meses: { chave: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ chave: `${d.getFullYear()}-${d.getMonth()}`, label: nomes[d.getMonth()] });
  }
  return meses;
}

export default function RelatoriosDesktopScreen() {
  const nav = useNavigation<Nav>();
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [larguraLinha, setLarguraLinha] = useState(0);

  const load = useCallback(async () => {
    const all = await getOrcamentos();
    setOrcamentos(all);
    setCarregando(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => onSyncAplicado(() => { load(); }), [load]);

  const aprovados = orcamentos.filter(o => o.status === 'aprovado');
  const faturamento = aprovados.reduce((s, o) => s + o.valorTotal, 0);
  const ticketMedio = aprovados.length ? faturamento / aprovados.length : 0;
  const conversao = orcamentos.length ? Math.round((aprovados.length / orcamentos.length) * 100) : 0;

  // ── pizza: contagem por status ──
  const dadosPizza = ORDEM_STATUS
    .map((status) => ({
      status,
      qtd: orcamentos.filter(o => o.status === status).length,
    }))
    .filter((d) => d.qtd > 0)
    .map((d) => ({
      value: d.qtd,
      color: STATUS_COLORS[d.status],
      text: String(d.qtd),
      status: d.status,
      qtd: d.qtd,
    }));

  // ── linha: contagem de orçamentos criados por mês (12 meses) ──
  const meses = ultimosDozeMeses();
  const dadosLinha = meses.map(({ chave, label }) => {
    const qtd = orcamentos.reduce((s, o) => {
      const d = new Date(o.criadoEm);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      return k === chave ? s + 1 : s;
    }, 0);
    return { value: qtd, label, dataPointText: String(qtd) };
  });
  const maiorQtd = Math.max(1, ...dadosLinha.map(d => d.value));

  return (
    <LayoutDesktop titulo="Relatórios" subtitulo="Visão geral do seu negócio">
      <View style={styles.kpiGrid}>
        <KpiCard
          titulo="Faturamento aprovado"
          valor={carregando ? '—' : formatCurrency(faturamento)}
          icone="cash-multiple"
          corIcone={Colors.success}
        />
        <KpiCard
          titulo="Ticket médio"
          valor={carregando ? '—' : formatCurrency(ticketMedio)}
          icone="receipt"
          corIcone={Colors.accent}
        />
        <KpiCard
          titulo="Taxa de conversão"
          valor={carregando ? '—' : `${conversao}%`}
          icone="chart-line"
          corIcone={Colors.primaryLight}
          rodape={orcamentos.length ? `${aprovados.length}/${orcamentos.length} aprovados` : 'sem histórico'}
        />
        <KpiCard
          titulo="Total de orçamentos"
          valor={carregando ? '—' : String(orcamentos.length)}
          icone="file-document-multiple-outline"
          corIcone={Colors.warning}
        />
      </View>

      <View style={styles.linha}>
        <View style={[styles.cartao, styles.cartaoPizza]}>
          <Text style={styles.cartaoTitulo}>Orçamentos por status</Text>
          <View style={styles.pizzaConteudo}>
            {carregando ? (
              <OlliSkeleton width={180} height={180} radius={90} />
            ) : dadosPizza.length === 0 ? (
              <Text style={styles.vazioTexto}>Nenhum orçamento ainda.</Text>
            ) : (
              <>
                <PieChart
                  data={dadosPizza}
                  donut
                  radius={90}
                  innerRadius={58}
                  innerCircleColor={Colors.surface}
                  centerLabelComponent={() => (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={styles.pizzaCentroValor}>{orcamentos.length}</Text>
                      <Text style={styles.pizzaCentroLabel}>total</Text>
                    </View>
                  )}
                />
                <View style={styles.legenda}>
                  {dadosPizza.map((d) => (
                    <View key={d.status} style={styles.legendaItem}>
                      <View style={[styles.legendaBolinha, { backgroundColor: d.color }]} />
                      <Text style={styles.legendaTexto}>{STATUS_LABELS[d.status]}</Text>
                      <Text style={styles.legendaQtd}>{d.qtd}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>

        <View style={[styles.cartao, styles.cartaoLinha]}>
          <Text style={styles.cartaoTitulo}>Orçamentos criados — últimos 12 meses</Text>
          <View
            style={styles.linhaGraficoWrap}
            onLayout={(e: LayoutChangeEvent) => setLarguraLinha(e.nativeEvent.layout.width)}
          >
            {carregando ? (
              <OlliSkeleton width="100%" height={200} />
            ) : larguraLinha > 0 ? (
              <LineChart
                data={dadosLinha}
                width={Math.max(0, larguraLinha - 50)}
                height={200}
                spacing={Math.max(24, (larguraLinha - 90) / 12)}
                initialSpacing={16}
                color={Colors.accent}
                thickness={2}
                dataPointsColor={Colors.accentLight}
                dataPointsRadius={4}
                noOfSections={4}
                maxValue={maiorQtd * 1.2}
                yAxisThickness={0}
                xAxisThickness={1}
                xAxisColor={Colors.outline}
                rulesColor={Colors.outline}
                rulesType="dashed"
                yAxisTextStyle={{ color: Colors.onSurfaceMuted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: Colors.onSurfaceVariant, fontSize: 10 }}
                yAxisLabelWidth={30}
                curved
                isAnimated
              />
            ) : null}
          </View>
        </View>
      </View>

      <OlliPressable style={styles.cardRelatorioVoz} onPress={() => nav.navigate('RelatorioDia')} haptic={false}>
        <View style={styles.cardRelatorioVozIcone}>
          <MaterialCommunityIcons name="microphone-outline" size={24} color={Colors.accentLight} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardRelatorioVozTitulo}>Relatório do dia falado</Text>
          <Text style={styles.cardRelatorioVozSub}>Ouça um resumo falado de como foi o seu dia.</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.accentLight} />
      </OlliPressable>
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
  linha: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
    alignItems: 'stretch',
  },
  cartao: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    padding: Spacing.lg,
  },
  cartaoPizza: {
    width: 380,
  },
  cartaoLinha: {
    flex: 1,
  },
  cartaoTitulo: {
    ...Typography.label,
    color: Colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  pizzaConteudo: {
    marginTop: Spacing.lg,
    alignItems: 'center',
    minHeight: 180,
    justifyContent: 'center',
  },
  pizzaCentroValor: { ...Typography.h3, color: Colors.onSurface },
  pizzaCentroLabel: { ...Typography.caption, color: Colors.onSurfaceMuted },
  legenda: {
    width: '100%',
    marginTop: Spacing.lg,
    gap: Spacing.xs,
  },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  legendaBolinha: { width: 9, height: 9, borderRadius: 5 },
  legendaTexto: { ...Typography.bodySmall, color: Colors.onSurfaceVariant, flex: 1 },
  legendaQtd: { ...Typography.bodySmall, color: Colors.onSurface, fontWeight: '700' },
  vazioTexto: { ...Typography.body, color: Colors.onSurfaceVariant },

  linhaGraficoWrap: {
    marginTop: Spacing.md,
    minHeight: 200,
    justifyContent: 'center',
  },

  cardRelatorioVoz: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.strokeGlow,
    padding: Spacing.lg,
  },
  cardRelatorioVozIcone: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(127,233,245,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(127,233,245,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardRelatorioVozTitulo: { ...Typography.h4, color: Colors.onSurface },
  cardRelatorioVozSub: { ...Typography.caption, color: Colors.onSurfaceVariant, marginTop: 2 },
});
