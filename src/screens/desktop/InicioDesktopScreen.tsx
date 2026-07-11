import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Linking } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, textoSobre, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { KpiCard } from '../../components/web/KpiCard';
import { TabelaDados, Coluna } from '../../components/web/TabelaDados';
import { OlliSkeleton } from '../../components/OlliSkeleton';
import { OlliPressable } from '../../components/OlliPressable';
import { EtaChip } from '../../components/EtaChip';
import { StatusBadge } from '../../components/StatusBadge';
import { getOrcamentos, getEmpresa, getClientes, getRecibos } from '../../database/database';
import { getProximoAgendamento } from '../../services/agenda';
import { getEtaAgendamento, temDestinoEta, mensagemEstouACaminho, type ResultadoEta } from '../../services/eta';
import { getOrdens, getMinhasOrdens } from '../../services/ordemServico';
import { getReciboDoOrcamento } from '../../services/pagamentos';
import { clientesParaReconquistar, mensagemReconquista, ClienteParaReconquistar } from '../../services/radarClientes';
import { orcamentosParaCobrar, mensagemCobranca, OrcamentoParaCobrar } from '../../services/radarCobranca';
import { getCurrentUser } from '../../services/supabase';
import { onSyncAplicado } from '../../services/cloudSync';
import { usePermissao } from '../../hooks/usePermissao';
import { usePlano } from '../../hooks/usePlano';
import { abrirWhatsApp } from '../../utils/pdfGenerator';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { RootStackParamList } from '../../navigation/AppNavigator';
import {
  Empresa, Orcamento, Agendamento, Cliente, Recibo, OrdemServico,
  TIPO_AGENDAMENTO_LABELS, STATUS_OS_LABELS, STATUS_OS_CORES,
  propostaJaEnviada,
} from '../../types';
import { avisar } from './dialogo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Status de OS que contam como "em andamento" (trabalho vivo, ainda não fechado). */
const STATUS_OS_ANDAMENTO: OrdemServico['status'][] = ['aberta', 'agendada', 'em_execucao', 'pausada'];

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
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { ehEmpresa, papel, pode, carregando: permCarregando } = usePermissao();
  const { temAcesso } = usePlano();

  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [proxima, setProxima] = useState<Agendamento | null>(null);
  const [meuUserId, setMeuUserId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [radar, setRadar] = useState<ClienteParaReconquistar[]>([]);
  const [radarCarregando, setRadarCarregando] = useState(true);
  const [larguraGrafico, setLarguraGrafico] = useState(0);

  // RADAR DE COBRANÇA — orçamentos aprovados sem recibo (dinheiro parado).
  // 3 estados explícitos: `cobrancaErro` só vira `true` numa falha de leitura
  // de verdade; lista vazia com sucesso é "tudo recebido" (não é a mesma coisa).
  const [cobranca, setCobranca] = useState<OrcamentoParaCobrar[]>([]);
  const [cobrancaCarregando, setCobrancaCarregando] = useState(true);
  const [cobrancaErro, setCobrancaErro] = useState(false);

  const ehTecnico = ehEmpresa && papel === 'tecnico';
  const clientesCount = clientes.length;
  // "ESTOU A CAMINHO" (item 1.3): telefone do cliente da próxima parada,
  // resolvido pelo clienteId no cadastro ativo já carregado acima — sem
  // leitura nova. `undefined` = botão não aparece (gate: só com telefone).
  const telefoneProxima = proxima?.clienteId
    ? clientes.find(c => c.id === proxima.clienteId)?.telefone?.trim() || undefined
    : undefined;

  const load = useCallback(async () => {
    const [all, rec, os, emp, prox, cli, user] = await Promise.all([
      getOrcamentos(), getRecibos(), getOrdens(), getEmpresa(),
      getProximoAgendamento(), getClientes(), getCurrentUser(),
    ]);
    setOrcamentos(all);
    setRecibos(rec);
    setOrdens(os);
    setEmpresa(emp);
    setProxima(prox);
    setClientes(cli);
    setMeuUserId(user?.id ?? null);
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

  const loadCobranca = useCallback(async () => {
    setCobrancaErro(false);
    try {
      const lista = await orcamentosParaCobrar();
      setCobranca(lista);
    } catch {
      // erro de verdade (leitura falhou) — NUNCA vira lista vazia silenciosa.
      setCobrancaErro(true);
    } finally {
      setCobrancaCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); loadRadar(); loadCobranca(); }, [load, loadRadar, loadCobranca]));
  useEffect(() => onSyncAplicado(() => { load(); loadRadar(); loadCobranca(); }), [load, loadRadar, loadCobranca]);

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

  async function cobrarNoWhatsApp(item: OrcamentoParaCobrar) {
    // O orçamento já guarda o telefone denormalizado — funciona mesmo se o
    // cadastro do cliente tiver sido excluído depois da aprovação.
    const telefone = item.orcamento.clienteTelefone || item.cliente?.telefone;
    if (!telefone?.trim()) {
      avisar('Sem telefone', `Cadastre o WhatsApp de ${item.orcamento.clienteNome} em Clientes para cobrar por aqui.`);
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    try {
      await abrirWhatsApp(telefone, mensagemCobranca(item));
    } catch {
      // silencioso: mesmo padrão do resto do app
    }
  }

  // ── navegação (rotas existentes; cada KPI leva à lista que o explica) ──
  const irParaAgenda = () => (nav as any).navigate('Tabs', { screen: 'Agenda' });
  const irParaOrcamentos = () => (nav as any).navigate('Tabs', { screen: 'OrcamentosTab' });
  const irParaOrdens = () => nav.navigate('OrdemServico');
  const irParaRelatorios = () => (nav as any).navigate('Tabs', { screen: 'RelatoriosTab' });

  const primeiroNome = empresa?.nomePrestador?.split(' ')[0] || empresa?.nome || 'prestador';

  // Enquanto o PAPEL ainda carrega, não decidimos o contexto: mostrar o
  // dashboard de gestão (com receita/valores) a quem PODE ser técnico vazaria
  // números que ele não deve ver. Segura num shell de skeletons até saber.
  if (permCarregando) {
    return (
      <LayoutDesktop titulo={`${saudacao()}, ${primeiroNome}`} subtitulo={empresa?.nome}>
        <View style={styles.kpiGrid}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.cartao, { flex: 1, minWidth: 220, gap: Spacing.sm }]}>
              <OlliSkeleton width="55%" height={12} />
              <OlliSkeleton width="70%" height={24} />
              <OlliSkeleton width="40%" height={11} />
            </View>
          ))}
        </View>
        <View style={styles.linha2}>
          <View style={[styles.cartao, styles.cartaoGrafico]}>
            <OlliSkeleton width="100%" height={220} />
          </View>
        </View>
      </LayoutDesktop>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  DASHBOARD DO TÉCNICO — enxuto, sem receita/margem da empresa
  // ═══════════════════════════════════════════════════════════════
  if (ehTecnico) {
    const minhas = meuUserId ? ordens.filter(o => o.tecnicoId === meuUserId) : [];
    const minhasAbertas = minhas.filter(o => STATUS_OS_ANDAMENTO.includes(o.status));
    const hoje = new Date();
    const minhasHoje = minhas.filter(o => {
      if (!o.dataAgendada) return false;
      const d = new Date(o.dataAgendada);
      return !isNaN(d.getTime()) && mesmoDia(d, hoje) && o.status !== 'cancelada' && o.status !== 'concluida';
    });
    const emExecucao = minhas.filter(o => o.status === 'em_execucao');

    const colunasMinhasOS: Coluna<OrdemServico>[] = [
      { chave: 'numero', titulo: 'OS', largura: 100, render: (o) => <Text style={styles.celulaTexto}>{o.numero}</Text> },
      { chave: 'cliente', titulo: 'Cliente', largura: '34%', render: (o) => <Text style={styles.celulaTexto} numberOfLines={1}>{o.clienteNome || o.titulo}</Text>, tituloCompleto: (o) => o.clienteNome || o.titulo },
      { chave: 'titulo', titulo: 'Serviço', largura: '30%', render: (o) => <Text style={styles.celulaTexto} numberOfLines={1}>{o.titulo}</Text>, tituloCompleto: (o) => o.titulo },
      { chave: 'status', titulo: 'Status', largura: 150, render: (o) => (
        <View style={[styles.osBadge, { backgroundColor: STATUS_OS_CORES[o.status] + '22' }]}>
          <Text style={[styles.osBadgeTexto, { color: STATUS_OS_CORES[o.status] }]}>{STATUS_OS_LABELS[o.status]}</Text>
        </View>
      ) },
    ];

    return (
      <LayoutDesktop titulo={`${saudacao()}, ${primeiroNome}`} subtitulo={empresa?.nome}>
        <View style={styles.kpiGrid}>
          <KpiCard
            titulo="Minhas OS de hoje"
            valor={carregando ? '—' : String(minhasHoje.length)}
            icone="calendar-today"
            corIcone={cores.accentLight}
            rodape={minhasHoje.length ? 'toque para abrir' : 'nada agendado para hoje'}
            onPress={irParaOrdens}
          />
          <KpiCard
            titulo="Em execução"
            valor={carregando ? '—' : String(emExecucao.length)}
            icone="progress-wrench"
            corIcone={cores.warning}
            rodape={emExecucao.length ? 'em andamento agora' : 'nenhuma em andamento'}
            onPress={irParaOrdens}
          />
          <KpiCard
            titulo="Minhas OS abertas"
            valor={carregando ? '—' : String(minhasAbertas.length)}
            icone="clipboard-list-outline"
            corIcone={cores.primaryLight}
            rodape={`${minhas.length} no total atribuídas a mim`}
            onPress={irParaOrdens}
          />
        </View>

        <View style={styles.linha2}>
          <View style={[styles.cartao, { flex: 1 }]}>
            <Text style={styles.cartaoTitulo}>Próximo atendimento</Text>
            {carregando ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                <OlliSkeleton width="60%" height={16} />
                <OlliSkeleton width="80%" height={14} />
              </View>
            ) : proxima ? (
              <ProximaVisita proxima={proxima} irParaAgenda={irParaAgenda} telefoneCliente={telefoneProxima} />
            ) : (
              <VazioAgenda irParaAgenda={irParaAgenda} />
            )}
          </View>
        </View>

        <View style={styles.secaoTabela}>
          <View style={styles.secaoTabelaHeader}>
            <Text style={styles.secaoTabelaTitulo}>Minhas ordens de serviço</Text>
            <OlliPressable onPress={irParaOrdens} haptic={false}>
              <Text style={styles.verTodos}>ver todas</Text>
            </OlliPressable>
          </View>
          {!carregando && minhasAbertas.length === 0 ? (
            <View style={[styles.cartao, styles.vazioCartao]}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={30} color={cores.onSurfaceMuted} />
              <Text style={styles.vazioTitulo}>Nenhuma OS aberta no momento</Text>
              <Text style={styles.vazioSub}>Quando a gestão te atribuir um serviço, ele aparece aqui.</Text>
            </View>
          ) : (
            <TabelaDados<OrdemServico>
              colunas={colunasMinhasOS}
              dados={minhasAbertas.slice(0, 8)}
              carregando={carregando}
              aoClicarLinha={() => irParaOrdens()}
            />
          )}
        </View>
      </LayoutDesktop>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  DASHBOARD PESSOAL / EMPRESA (gestão) — receita, funil, OS, equipe
  // ═══════════════════════════════════════════════════════════════
  const podeValores = pode('ver_valores_agregados'); // owner/admin/gestor e pessoal

  // ── métricas comerciais ──
  const aprovados = orcamentos.filter(o => o.status === 'aprovado');
  const enviados = orcamentos.filter(o => propostaJaEnviada(o.status) || o.status === 'aprovado' || o.status === 'recusado');
  const agora = new Date();
  const noMesAtual = (iso?: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth();
  };

  // Data EFETIVA do recibo p/ métricas de receita: quando o dinheiro ENTROU
  // (dataRecebimento, DD/MM/AAAA informada pelo usuário) — não a data em que o
  // registro foi lançado (criadoEm), que diverge em pagamento retroativo. Meio-dia
  // LOCAL evita a borda de fuso que jogaria o dia 1º para o mês anterior. Fallback
  // em criadoEm quando dataRecebimento está vazia/incompleta.
  const dataEfetivaRecibo = (r: { dataRecebimento?: string; criadoEm: string }): string => {
    const dig = (r.dataRecebimento || '').replace(/\D/g, '');
    if (dig.length === 8) {
      return `${dig.slice(4, 8)}-${dig.slice(2, 4)}-${dig.slice(0, 2)}T12:00:00`;
    }
    return r.criadoEm;
  };

  // Receita do mês = recibos (dinheiro que ENTROU), não "aprovado" (promessa),
  // atribuída ao mês em que o pagamento foi RECEBIDO.
  const recibosNoMes = recibos.filter(r => noMesAtual(dataEfetivaRecibo(r)));
  const receitaNoMes = recibosNoMes.reduce((s, r) => s + (r.valorRecebido || 0), 0);

  // Em aberto: toda proposta já entregue ao cliente sem desfecho.
  const emAberto = orcamentos.filter(o => propostaJaEnviada(o.status));
  const valorEmAberto = emAberto.reduce((s, o) => s + o.valorTotal, 0);

  // Taxa de aprovação sobre o que efetivamente foi ENVIADO (não sobre rascunhos).
  const taxaAprovacao = enviados.length ? Math.round((aprovados.length / enviados.length) * 100) : 0;

  // Contas a receber: orçamento aprovado que ainda NÃO tem recibo (pagamento).
  const contasAReceber = aprovados.filter(o => !getReciboDoOrcamento(o.id, recibos));
  const valorAReceber = contasAReceber.reduce((s, o) => s + o.valorTotal, 0);

  // ── OS (empresa: gestão vê todas) ──
  const osEmAndamento = ordens.filter(o => STATUS_OS_ANDAMENTO.includes(o.status));
  const osPorTecnico = agruparOSPorTecnico(osEmAndamento);

  const ultimosOito = orcamentos.slice(0, 8);

  // ── gráfico: receita recebida por mês (últimos 6 meses) ──
  const meses = ultimosSeisMeses();
  const dadosGrafico = meses.map(({ chave, label }) => {
    const total = recibos.reduce((s, r) => {
      const d = new Date(dataEfetivaRecibo(r));
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      return k === chave ? s + (r.valorRecebido || 0) : s;
    }, 0);
    return { value: total, label, frontColor: cores.accent };
  });
  const maiorValor = Math.max(1, ...dadosGrafico.map(d => d.value));

  const colunasOrcamentos: Coluna<Orcamento>[] = [
    { chave: 'numero', titulo: 'Número', largura: 100, render: (o) => <Text style={styles.celulaTexto}>{o.numero}</Text> },
    { chave: 'cliente', titulo: 'Cliente', largura: '30%', render: (o) => <Text style={styles.celulaTexto} numberOfLines={1}>{o.clienteNome}</Text>, tituloCompleto: (o) => o.clienteNome },
    { chave: 'valor', titulo: 'Valor', largura: 130, alinhamento: 'direita', render: (o) => <Text style={styles.celulaValor}>{formatCurrency(o.valorTotal)}</Text> },
    { chave: 'status', titulo: 'Status', largura: 150, render: (o) => <StatusBadge status={o.status} size="sm" /> },
    { chave: 'data', titulo: 'Data', largura: 110, render: (o) => <Text style={styles.celulaTexto}>{formatDate(o.criadoEm)}</Text> },
  ];

  const subtitulo = ehEmpresa
    ? `${empresa?.nome ?? 'Sua empresa'} · visão da equipe`
    : empresa?.nome;

  return (
    <LayoutDesktop titulo={`${saudacao()}, ${primeiroNome}`} subtitulo={subtitulo}>
      {/* KPIs — clicáveis, cada um leva à lista que o explica */}
      <View style={styles.kpiGrid}>
        <KpiCard
          titulo="Receita do mês"
          valor={carregando ? '—' : formatCurrency(receitaNoMes)}
          icone="cash-multiple"
          corIcone={cores.success}
          rodape={recibosNoMes.length ? `${recibosNoMes.length} pagamento${recibosNoMes.length === 1 ? '' : 's'} recebido${recibosNoMes.length === 1 ? '' : 's'}` : 'nenhum ainda este mês'}
          onPress={irParaRelatorios}
        />
        <KpiCard
          titulo="Em aberto"
          valor={carregando ? '—' : formatCurrency(valorEmAberto)}
          icone="clock-outline"
          corIcone={cores.warning}
          rodape={`${emAberto.length} orçamento${emAberto.length === 1 ? '' : 's'} enviado${emAberto.length === 1 ? '' : 's'}`}
          onPress={irParaOrcamentos}
        />
        <KpiCard
          titulo="Contas a receber"
          valor={carregando ? '—' : formatCurrency(valorAReceber)}
          icone="cash-clock"
          corIcone={cores.accentLight}
          rodape={contasAReceber.length ? `${contasAReceber.length} aprovado${contasAReceber.length === 1 ? '' : 's'} sem recibo` : 'tudo recebido'}
          onPress={irParaOrcamentos}
        />
        <KpiCard
          titulo="Taxa de aprovação"
          valor={carregando ? '—' : `${taxaAprovacao}%`}
          icone="chart-line"
          corIcone={cores.primaryLight}
          rodape={enviados.length ? `${aprovados.length}/${enviados.length} enviados` : 'sem envios ainda'}
          onPress={irParaRelatorios}
        />
      </View>

      {/* Segunda faixa de KPIs — específica de EMPRESA (gestão): OS ao vivo */}
      {ehEmpresa && (
        <View style={styles.kpiGrid}>
          <KpiCard
            titulo="OS em andamento"
            valor={carregando ? '—' : String(osEmAndamento.length)}
            icone="clipboard-list-outline"
            corIcone={cores.accentLight}
            rodape={osEmAndamento.length ? 'toque para gerenciar' : 'nenhuma ativa'}
            onPress={irParaOrdens}
          />
          <KpiCard
            titulo="Em execução agora"
            valor={carregando ? '—' : String(ordens.filter(o => o.status === 'em_execucao').length)}
            icone="progress-wrench"
            corIcone={cores.warning}
            rodape="serviços na rua"
            onPress={irParaOrdens}
          />
          <KpiCard
            titulo="Concluídas no mês"
            valor={carregando ? '—' : String(ordens.filter(o => o.status === 'concluida' && noMesAtual(o.atualizadoEm)).length)}
            icone="check-decagram-outline"
            corIcone={cores.success}
            rodape="ordens finalizadas"
            onPress={irParaOrdens}
          />
          <KpiCard
            titulo="Clientes ativos"
            valor={carregando ? '—' : String(clientesCount)}
            icone="account-group-outline"
            corIcone={cores.primaryLight}
          />
        </View>
      )}

      {/* Faturamento + Próxima visita / Radar */}
      <View style={styles.linha2}>
        <View style={[styles.cartao, styles.cartaoGrafico]}>
          <Text style={styles.cartaoTitulo}>Receita recebida — últimos 6 meses</Text>
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
                xAxisColor={cores.outline}
                rulesColor={cores.outline}
                rulesType="dashed"
                yAxisTextStyle={{ color: cores.onSurfaceMuted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: cores.onSurfaceVariant, fontSize: 11 }}
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
            <Text style={styles.cartaoTitulo}>{ehEmpresa ? 'Próxima parada' : 'Próxima visita'}</Text>
            {carregando ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                <OlliSkeleton width="60%" height={16} />
                <OlliSkeleton width="80%" height={14} />
              </View>
            ) : proxima ? (
              <ProximaVisita proxima={proxima} irParaAgenda={irParaAgenda} telefoneCliente={telefoneProxima} />
            ) : (
              <VazioAgenda irParaAgenda={irParaAgenda} />
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
                      <MaterialCommunityIcons
                        name="whatsapp"
                        size={15}
                        color="#0A1626" // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)
                      />
                    </OlliPressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* RADAR DE COBRANÇA — orçamentos aprovados sem recibo (dinheiro
              parado). 3 estados explícitos: carregando / erro (nunca vira
              "vazio") / vazio de verdade ("tudo recebido"). */}
          <View style={[styles.cartao, styles.cartaoRadar]}>
            <Text style={styles.cartaoTitulo}>Radar de cobrança</Text>
            {cobrancaCarregando ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                <OlliSkeleton width="100%" height={44} />
              </View>
            ) : cobrancaErro ? (
              <View style={{ marginTop: 10, gap: 6 }}>
                <Text style={styles.visitaVazioTexto}>Não deu para carregar o radar de cobrança agora.</Text>
                <OlliPressable onPress={loadCobranca} haptic={false}>
                  <Text style={styles.verTodos}>Tentar de novo</Text>
                </OlliPressable>
              </View>
            ) : cobranca.length === 0 ? (
              <Text style={styles.visitaVazioTexto}>Tudo recebido — nenhum orçamento aprovado esperando pagamento.</Text>
            ) : (
              <View style={{ gap: 8, marginTop: 10 }}>
                <Text style={styles.radarMeta}>
                  {cobranca.length} sem pagamento · {formatCurrency(cobranca.reduce((s, item) => s + item.valor, 0))} parado
                </Text>
                {cobranca.slice(0, 3).map((item) => (
                  <View key={item.orcamento.id} style={styles.radarLinha}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.radarNome} numberOfLines={1}>{item.orcamento.clienteNome}</Text>
                      <Text style={styles.radarMeta}>{formatCurrency(item.valor)} · {item.diasParado} {item.diasParado === 1 ? 'dia' : 'dias'} parado</Text>
                    </View>
                    <OlliPressable style={styles.radarBtn} onPress={() => cobrarNoWhatsApp(item)} haptic={false}>
                      <MaterialCommunityIcons
                        name="whatsapp"
                        size={15}
                        color="#0A1626" // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)
                      />
                    </OlliPressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>

      {/* EMPRESA (com permissão de valores): OS por técnico */}
      {ehEmpresa && podeValores && (
        <View style={styles.secaoTabela}>
          <View style={styles.secaoTabelaHeader}>
            <Text style={styles.secaoTabelaTitulo}>OS em andamento por técnico</Text>
            <OlliPressable onPress={irParaOrdens} haptic={false}>
              <Text style={styles.verTodos}>ver ordens</Text>
            </OlliPressable>
          </View>
          {!carregando && osPorTecnico.length === 0 ? (
            <View style={[styles.cartao, styles.vazioCartao]}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={30} color={cores.onSurfaceMuted} />
              <Text style={styles.vazioTitulo}>Nenhuma OS em andamento</Text>
              <Text style={styles.vazioSub}>Gere uma OS a partir de um orçamento aprovado para começar.</Text>
            </View>
          ) : (
            <View style={[styles.cartao, { gap: Spacing.sm }]}>
              {(carregando ? [] : osPorTecnico).map((linha) => (
                <OlliPressable key={linha.chave} style={styles.tecnicoLinha} onPress={irParaOrdens} haptic={false}>
                  <View style={styles.tecnicoAvatar}>
                    <MaterialCommunityIcons
                      name={linha.chave === '__sem__' ? 'account-question-outline' : 'account-hard-hat'}
                      size={16}
                      color={cores.accentLight}
                    />
                  </View>
                  <Text style={styles.tecnicoNome} numberOfLines={1}>{linha.nome}</Text>
                  <View style={styles.tecnicoContagem}>
                    <Text style={styles.tecnicoContagemTexto}>{linha.total}</Text>
                    <Text style={styles.tecnicoContagemLabel}>OS</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={cores.onSurfaceMuted} />
                </OlliPressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Relatórios avançados — recurso pago (gate por plano) */}
      {podeValores && !temAcesso('relatorios') && (
        <OlliPressable style={styles.gateCartao} onPress={() => nav.navigate('Planos')} haptic={false}>
          <View style={styles.gateIcone}>
            <MaterialCommunityIcons name="chart-box-outline" size={20} color={cores.accentLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.gateTitulo}>Relatórios avançados</Text>
            <Text style={styles.gateSub}>Desbloqueie margem por serviço, ranking de clientes e evolução por período.</Text>
          </View>
          <View style={styles.gateBadge}>
            <MaterialCommunityIcons name="lock-outline" size={12} color={textoSobre(cores.accentLight)} />
            <Text style={styles.gateBadgeTexto}>PRO</Text>
          </View>
        </OlliPressable>
      )}

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

// ─── subcomponentes de apresentação (mesmo estilo/tema) ───────────

interface LinhaTecnico { chave: string; nome: string; total: number }

/** Agrupa OS em andamento por técnico atribuído, ordenando por volume desc. */
function agruparOSPorTecnico(ordens: OrdemServico[]): LinhaTecnico[] {
  const mapa = new Map<string, LinhaTecnico>();
  for (const os of ordens) {
    const chave = os.tecnicoId || '__sem__';
    const nome = os.tecnicoNome || (os.tecnicoId ? 'Técnico' : 'Sem técnico atribuído');
    const atual = mapa.get(chave);
    if (atual) atual.total += 1;
    else mapa.set(chave, { chave, nome, total: 1 });
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

function ProximaVisita({ proxima, irParaAgenda, telefoneCliente }: { proxima: Agendamento; irParaAgenda: () => void; telefoneCliente?: string }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  // ETA com trânsito — mesmo serviço/chip do app mobile (o dono quer o tempo de
  // chegada onde quer que a próxima parada apareça). No desktop web a origem vem
  // do navigator.geolocation; sem permissão, o chip mostra "ative a localização"
  // em vez de sumir (regra dos 3 estados: erro nunca vira vazio).
  const [etaRes, setEtaRes] = useState<ResultadoEta | null>(null);
  const buscarEta = useCallback(() => {
    if (!temDestinoEta(proxima)) { setEtaRes(null); return; }
    setEtaRes(null);
    getEtaAgendamento(proxima).then(setEtaRes).catch(() => setEtaRes({ estado: 'indisponivel' }));
  }, [proxima]);
  useEffect(() => { buscarEta(); }, [buscarEta]);
  const horarioVisita = !isNaN(new Date(proxima.inicio).getTime()) ? new Date(proxima.inicio) : undefined;

  // "Estou a caminho" (item 1.3) — reaproveita o MESMO `etaRes` já buscado
  // acima para o chip (sem 2ª chamada de rede). Sem ETA disponível, a
  // mensagem sai sem inventar um horário (ver mensagemEstouACaminho).
  const estouACaminho = useCallback(async () => {
    if (!telefoneCliente) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      await abrirWhatsApp(telefoneCliente, mensagemEstouACaminho(proxima.clienteNome, etaRes));
    } catch {
      // silencioso: mesmo padrão do resto do app
    }
  }, [telefoneCliente, proxima.clienteNome, etaRes]);

  return (
    <View style={{ marginTop: 10, gap: 4 }}>
      <Text style={styles.visitaQuando}>{quandoLabel(proxima.inicio)}</Text>
      <Text style={styles.visitaCliente} numberOfLines={1}>{proxima.clienteNome || proxima.titulo}</Text>
      <Text style={styles.visitaTipo} numberOfLines={1}>
        {TIPO_AGENDAMENTO_LABELS[proxima.tipo]}{proxima.titulo && proxima.clienteNome ? ` · ${proxima.titulo}` : ''}
      </Text>
      {proxima.endereco ? (
        <View style={styles.visitaEndereco}>
          <MaterialCommunityIcons name="map-marker" size={13} color={cores.accentLight} />
          <Text style={styles.visitaEnderecoTexto} numberOfLines={1}>{proxima.endereco}</Text>
        </View>
      ) : null}
      {temDestinoEta(proxima) ? (
        <View style={{ marginTop: 2 }}>
          <EtaChip resultado={etaRes} horario={horarioVisita} onTentarNovamente={buscarEta} />
        </View>
      ) : null}
      <View style={styles.visitaAcoes}>
        {proxima.endereco ? (
          <OlliPressable style={styles.visitaBtn} onPress={() => abrirMapa(proxima.endereco)} haptic={false}>
            <MaterialCommunityIcons name="navigation-variant" size={14} color={textoSobre(cores.accentLight)} />
            <Text style={styles.visitaBtnTexto}>Ver no mapa</Text>
          </OlliPressable>
        ) : null}
        <OlliPressable style={styles.visitaBtnGhost} onPress={irParaAgenda} haptic={false}>
          <Text style={styles.visitaBtnGhostTexto}>Ver agenda</Text>
        </OlliPressable>
        {telefoneCliente ? (
          <OlliPressable style={styles.visitaBtnWhats} onPress={estouACaminho} haptic={false}>
            <MaterialCommunityIcons
              name="whatsapp"
              size={14}
              color="#0A1626" // contraste-ok: sobre c.whatsapp #25D366 (9.16:1)
            />
            <Text style={styles.visitaBtnWhatsTexto}>Estou a caminho</Text>
          </OlliPressable>
        ) : null}
      </View>
    </View>
  );
}

function VazioAgenda({ irParaAgenda }: { irParaAgenda: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.visitaVazioTexto}>Nenhuma visita agendada.</Text>
      <OlliPressable style={[styles.visitaBtn, { alignSelf: 'flex-start', marginTop: 10 }]} onPress={irParaAgenda} haptic={false}>
        <MaterialCommunityIcons name="calendar-plus" size={14} color={textoSobre(cores.accentLight)} />
        <Text style={styles.visitaBtnTexto}>Abrir agenda</Text>
      </OlliPressable>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
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
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
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
    color: c.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  graficoWrap: {
    marginTop: Spacing.md,
    minHeight: 200,
    justifyContent: 'center',
  },

  visitaQuando: { ...Typography.label, color: c.accentLight },
  visitaCliente: { ...Typography.h4, color: c.onSurface, marginTop: 2 },
  visitaTipo: { ...Typography.caption, color: c.onSurfaceVariant, marginTop: 2 },
  visitaEndereco: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  visitaEnderecoTexto: { ...Typography.caption, color: c.onSurfaceVariant, flex: 1 },
  visitaAcoes: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  visitaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 9 },
  visitaBtnTexto: { fontSize: 12.5, fontWeight: '800', color: textoSobre(c.accentLight) },
  visitaBtnGhost: { borderWidth: 1, borderColor: c.strokeGlow, backgroundColor: c.surfacePressed, borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 9 },
  visitaBtnGhostTexto: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  // "Estou a caminho" (item 1.3): mesmo verde/contraste do botão de WhatsApp
  // do Radar de clientes (radarBtn) — convenção única de "ação de WhatsApp".
  visitaBtnWhats: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.whatsapp, borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 9 },
  visitaBtnWhatsTexto: { fontSize: 12.5, fontWeight: '800', color: '#0A1626' }, // contraste-ok: sobre c.whatsapp #25D366 (9.16:1)
  visitaVazioTexto: { ...Typography.body, color: c.onSurfaceVariant, marginTop: 10 },

  radarLinha: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: 1, borderTopColor: c.outline, paddingTop: Spacing.sm },
  radarNome: { ...Typography.bodySmall, color: c.onSurface, fontWeight: '700' },
  radarMeta: { ...Typography.caption, color: c.onSurfaceVariant, marginTop: 1 },
  radarBtn: { width: 30, height: 30, borderRadius: BorderRadius.full, backgroundColor: c.whatsapp, alignItems: 'center', justifyContent: 'center' },

  // OS por técnico
  tecnicoLinha: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: 1, borderTopColor: c.outline, paddingTop: Spacing.sm, marginTop: 0 },
  tecnicoAvatar: { width: 32, height: 32, borderRadius: BorderRadius.full, backgroundColor: c.accentContainer, alignItems: 'center', justifyContent: 'center' },
  tecnicoNome: { ...Typography.bodySmall, color: c.onSurface, fontWeight: '700', flex: 1 },
  tecnicoContagem: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  tecnicoContagemTexto: { ...Typography.h4, color: c.accentLight },
  tecnicoContagemLabel: { ...Typography.caption, color: c.onSurfaceMuted },

  // status de OS (badge inline no dashboard do técnico)
  osBadge: { alignSelf: 'flex-start', borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 3 },
  osBadgeTexto: { fontSize: 11.5, fontWeight: '800' },

  // gate PRO
  gateCartao: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.strokeGlow, padding: Spacing.lg, marginBottom: Spacing.lg },
  gateIcone: { width: 40, height: 40, borderRadius: BorderRadius.md, backgroundColor: c.accentContainer, alignItems: 'center', justifyContent: 'center' },
  gateTitulo: { ...Typography.h4, color: c.onSurface },
  gateSub: { ...Typography.caption, color: c.onSurfaceVariant, marginTop: 2 },
  gateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 5 },
  gateBadgeTexto: { fontSize: 11, fontWeight: '900', color: textoSobre(c.accentLight), letterSpacing: 0.5 },

  // estados vazios
  vazioCartao: { alignItems: 'center', gap: 6, paddingVertical: Spacing.xl },
  vazioTitulo: { ...Typography.h4, color: c.onSurface, marginTop: 4 },
  vazioSub: { ...Typography.caption, color: c.onSurfaceVariant, textAlign: 'center' },

  secaoTabela: { gap: Spacing.sm, marginBottom: Spacing.lg },
  secaoTabelaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  secaoTabelaTitulo: { ...Typography.h4, color: c.onSurface },
  verTodos: { ...Typography.bodySmall, color: c.accentLight, fontWeight: '700' },

  celulaTexto: { ...Typography.bodySmall, color: c.onSurface },
  celulaValor: { ...Typography.bodySmall, color: c.accentLight, fontWeight: '700' },
});
