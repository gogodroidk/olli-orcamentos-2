import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, type GestureResponderEvent } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { TabelaDados, Coluna } from '../../components/web/TabelaDados';
import { BarraBusca, normalizarBusca } from '../../components/web/BarraBusca';
import { ChipsFiltro, ItemChipFiltro } from '../../components/web/ChipsFiltro';
import { KpiCard } from '../../components/web/KpiCard';
import { EmptyState } from '../../components/EmptyState';
import { PressableWebState } from '../../components/web/pressableWebState';
import { getRecibos, getEmpresa } from '../../database/database';
import { marcarReciboComoPdfEmitido } from '../../services/pagamentos';
import { onSyncAplicado } from '../../services/cloudSync';
import { exportarHtmlComoPdf, abrirWhatsApp } from '../../utils/exportarDocumento';
import { montarHtmlRecibo } from '../../utils/reciboPdf';
import { montarMensagemPedidoAvaliacao } from '../../utils/mensagensOrcamento';
import { formatCurrency } from '../../utils/currency';
import { parseDateBR } from '../../utils/date';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { Recibo, Empresa } from '../../types';
import { avisar } from './dialogo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Periodo = 'mes' | '30dias' | 'ano' | 'tudo';

const FILTROS_PERIODO: ItemChipFiltro<Periodo>[] = [
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: '30dias', rotulo: '30 dias' },
  { chave: 'ano', rotulo: 'Este ano' },
  { chave: 'tudo', rotulo: 'Tudo' },
];

/** AAAA-MM-DD local (sem passar por UTC) — usado só para comparar períodos. */
function dataParaISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Início (inclusive) do período selecionado — null quando "Tudo" (sem corte). */
function inicioDoPeriodo(periodo: Periodo): string | null {
  const hoje = new Date();
  switch (periodo) {
    case 'mes':
      return dataParaISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    case 'ano':
      return dataParaISO(new Date(hoje.getFullYear(), 0, 1));
    case '30dias': {
      const d = new Date(hoje);
      d.setDate(d.getDate() - 30);
      return dataParaISO(d);
    }
    case 'tudo':
    default:
      return null;
  }
}

/**
 * `Recibo.dataRecebimento` é sempre DD/MM/AAAA (mesmo formato digitado na
 * EmitirReciboScreen mobile). Converte pra ISO só para comparar/ordenar; cai
 * para a data de criação (sempre ISO) se o texto vier vazio/malformado
 * (recibo legado).
 */
function dataRecebimentoISO(r: Recibo): string {
  const iso = parseDateBR(r.dataRecebimento);
  return iso || (r.criadoEm || '').slice(0, 10);
}

/**
 * Recibos desktop (v4) — faixa de KPIs (recebido no período / nº de recibos /
 * ticket médio) + chips de período + tabela com busca e total vivo no
 * rodapé. Reaproveita os mesmos dados/serviços da EmitirReciboScreen mobile
 * (getRecibos, getEmpresa, montarHtmlRecibo, exportarHtmlComoPdf,
 * marcarReciboComoPdfEmitido) — mesma regra de negócio, casca de UI nova.
 * Sem edição/exclusão aqui: a tela mobile também não oferece isso para um
 * recibo já registrado, só gerar/reenviar o PDF.
 */
export default function RecibosDesktopScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [carregando, setCarregando] = useState(true);
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [lista, emp] = await Promise.all([getRecibos(), getEmpresa()]);
    setRecibos(lista);
    setEmpresa(emp);
    setCarregando(false);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => onSyncAplicado(carregar), [carregar]);

  // Recibos dentro do período selecionado — base dos KPIs. Não sofre a busca:
  // "quanto entrou este mês" não deve variar enquanto o usuário digita.
  const recibosNoPeriodo = useMemo(() => {
    const inicio = inicioDoPeriodo(periodo);
    if (!inicio) return recibos;
    return recibos.filter((r) => dataRecebimentoISO(r) >= inicio);
  }, [recibos, periodo]);

  // Linhas da tabela: período + busca — é o que o rodapé "total vivo" soma.
  const linhas = useMemo(() => {
    let r = recibosNoPeriodo;
    if (busca.trim()) {
      const q = normalizarBusca(busca);
      const qDigits = busca.replace(/\D/g, '');
      r = r.filter((x) =>
        normalizarBusca(x.clienteNome).includes(q) ||
        x.numero.toLowerCase().includes(q) ||
        (x.orcamentoNumero ?? '').toLowerCase().includes(q) ||
        (qDigits.length > 0 && x.clienteTelefone.replace(/\D/g, '').includes(qDigits))
      );
    }
    return r;
  }, [recibosNoPeriodo, busca]);

  const totalPeriodo = useMemo(() => recibosNoPeriodo.reduce((s, r) => s + r.valorRecebido, 0), [recibosNoPeriodo]);
  const ticketMedio = recibosNoPeriodo.length ? totalPeriodo / recibosNoPeriodo.length : 0;
  const totalFiltrado = useMemo(() => linhas.reduce((s, r) => s + r.valorRecebido, 0), [linhas]);
  const pendentes = useMemo(() => recibos.filter((r) => r.pdfEmitido === false).length, [recibos]);

  const buildHtml = useCallback(async (r: Recibo): Promise<string> => {
    if (!empresa) return '';
    // Delega ao util compartilhado (mesmo HTML da EmitirReciboScreen mobile e
    // da prévia de Modelos de documento): segue a cor de marca e o modelo
    // escolhido pela empresa.
    return montarHtmlRecibo(r, empresa, { modelo: empresa.modeloReciboPadrao, corMarca: empresa.corMarca });
  }, [empresa]);

  // Gera/reenvia o PDF do recibo — mesma função para os dois estados
  // (pdfEmitido false ou true), igual à handleReenviar da tela mobile: só o
  // rótulo do botão muda. Na 1ª emissão (pdfEmitido ainda false), marca o
  // recibo como emitido ao concluir — mesmo efeito colateral da mobile.
  const handleGerarOuReenviar = useCallback(async (r: Recibo) => {
    if (!empresa) {
      avisar('Cadastre sua empresa antes', 'Para emitir recibos, cadastre os dados da sua empresa em Meu Negócio.');
      return;
    }
    if (processandoId) return;
    const primeiraEmissao = r.pdfEmitido === false;
    setProcessandoId(r.id);
    try {
      const html = await buildHtml(r);
      await exportarHtmlComoPdf(html, `Recibo-${r.numero}`, { dialogTitle: `Recibo ${r.numero}` });
      if (primeiraEmissao) {
        await marcarReciboComoPdfEmitido(r);
        await carregar();
      }
    } catch (e: any) {
      avisar('Erro', e?.message || 'Não foi possível gerar o PDF deste recibo agora.');
    } finally {
      setProcessandoId(null);
    }
  }, [empresa, processandoId, buildHtml, carregar]);

  // Pedir avaliação no Google pós-serviço (mestre 1.4): mesma regra da tela
  // mobile — reusa o abrirWhatsApp já existente, só aparece com o link
  // cadastrado em Meu Negócio (Empresa.linkGoogleAvaliacoes).
  const linkAvaliacao = empresa?.linkGoogleAvaliacoes?.trim();
  const handlePedirAvaliacao = useCallback(async (r: Recibo) => {
    if (!linkAvaliacao) return;
    if (!r.clienteTelefone?.trim()) {
      avisar('WhatsApp', 'Cliente sem telefone cadastrado.');
      return;
    }
    const msg = montarMensagemPedidoAvaliacao(r.clienteNome, linkAvaliacao, empresa);
    try {
      await abrirWhatsApp(r.clienteTelefone, msg);
    } catch {
      avisar('Erro', 'Não foi possível abrir o WhatsApp.');
    }
  }, [linkAvaliacao, empresa]);

  const verOrcamento = useCallback((r: Recibo) => {
    if (!r.orcamentoId) return;
    nav.navigate('VisualizarOrcamento', { orcamentoId: r.orcamentoId });
  }, [nav]);

  const novoRecibo = useCallback(() => {
    nav.navigate('EmitirRecibo', {});
  }, [nav]);

  const colunas: Coluna<Recibo>[] = useMemo(() => [
    {
      chave: 'numero',
      titulo: 'Nº',
      largura: 150,
      ordenavel: true,
      valorOrdenacao: (r) => r.numero,
      render: (r) => (
        <View style={styles.numeroWrap}>
          <Text style={styles.celulaForte}>{r.numero}</Text>
          {r.pdfEmitido === false && (
            <View style={styles.pillPendente}>
              <Text style={styles.pillPendenteTexto}>PDF não emitido</Text>
            </View>
          )}
        </View>
      ),
    },
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: '20%',
      ordenavel: true,
      valorOrdenacao: (r) => r.clienteNome,
      render: (r) => <Text style={styles.celulaTexto} numberOfLines={1}>{r.clienteNome}</Text>,
      tituloCompleto: (r) => r.clienteNome,
    },
    {
      chave: 'origem',
      titulo: 'Origem',
      largura: 120,
      ordenavel: true,
      valorOrdenacao: (r) => r.orcamentoNumero ?? '',
      render: (r) => (
        <Text style={[styles.celulaTexto, !r.orcamentoNumero && styles.celulaMuted]} numberOfLines={1}>
          {r.orcamentoNumero ? `Nº ${r.orcamentoNumero}` : 'Avulso'}
        </Text>
      ),
    },
    {
      chave: 'forma',
      titulo: 'Forma de pagamento',
      largura: 170,
      ordenavel: true,
      valorOrdenacao: (r) => r.formaPagamento,
      render: (r) => <Text style={styles.celulaTexto} numberOfLines={1}>{r.formaPagamento || '—'}</Text>,
    },
    {
      chave: 'recebidoEm',
      titulo: 'Recebido em',
      largura: 130,
      ordenavel: true,
      valorOrdenacao: (r) => dataRecebimentoISO(r),
      render: (r) => <Text style={styles.celulaTexto}>{r.dataRecebimento || '—'}</Text>,
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: 140,
      alinhamento: 'direita',
      ordenavel: true,
      valorOrdenacao: (r) => r.valorRecebido,
      render: (r) => <Text style={styles.celulaValor}>{formatCurrency(r.valorRecebido)}</Text>,
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: 180,
      render: (r) => (
        <View style={styles.acoesLinha}>
          <AcaoIcone
            icone={r.pdfEmitido === false ? 'file-pdf-box' : 'share-variant'}
            rotulo={r.pdfEmitido === false ? 'Gerar e compartilhar PDF' : 'Reenviar / compartilhar'}
            onPress={() => handleGerarOuReenviar(r)}
            carregando={processandoId === r.id}
          />
          {r.orcamentoId && (
            <AcaoIcone icone="file-document-outline" rotulo="Ver orçamento" onPress={() => verOrcamento(r)} />
          )}
          {!!linkAvaliacao && (
            <AcaoIcone icone="google-maps" rotulo="Pedir avaliação" onPress={() => handlePedirAvaliacao(r)} />
          )}
        </View>
      ),
    },
  ], [styles, handleGerarOuReenviar, verOrcamento, processandoId, linkAvaliacao, handlePedirAvaliacao]);

  return (
    <LayoutDesktop
      titulo="Recibos"
      subtitulo={`${recibos.length} recibo${recibos.length === 1 ? '' : 's'}${pendentes > 0 ? ` · ${pendentes} PDF pendente${pendentes === 1 ? '' : 's'}` : ''}`}
      acoes={
        <>
          <BarraBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por cliente, nº ou orçamento…" />
          <Pressable
            onPress={novoRecibo}
            accessibilityRole="button"
            accessibilityLabel="Novo recibo"
            style={({ hovered, focused }: PressableWebState) => [styles.botaoNovo, hovered && styles.botaoNovoHover, focused && styles.focoVisivel]}
          >
            <MaterialCommunityIcons name="plus" size={18} color={cores.onPrimary} />
            <Text style={styles.botaoNovoLabel}>Novo recibo</Text>
          </Pressable>
        </>
      }
    >
      <View style={styles.kpis}>
        <KpiCard titulo="Recebido no período" valor={formatCurrency(totalPeriodo)} icone="cash-multiple" corIcone={cores.success} />
        <KpiCard titulo="Nº de recibos" valor={String(recibosNoPeriodo.length)} icone="receipt" corIcone={cores.primary} />
        <KpiCard titulo="Ticket médio" valor={formatCurrency(ticketMedio)} icone="chart-line" corIcone={cores.accent} />
      </View>

      <ChipsFiltro<Periodo> itens={FILTROS_PERIODO} selecionado={periodo} aoSelecionar={setPeriodo} />

      <TabelaDados<Recibo>
        colunas={colunas}
        dados={linhas}
        carregando={carregando}
        aoClicarLinha={(r) => handleGerarOuReenviar(r)}
        ordenacaoInicial={{ chave: 'recebidoEm', direcao: 'desc' }}
        vazio={
          <EmptyState
            icon="receipt"
            title={busca || periodo !== 'tudo' ? 'Nenhum recibo encontrado' : 'Nenhum recibo emitido'}
            subtitle={busca ? 'Nenhum resultado para sua busca.' : 'Os recibos que você gerar aparecem aqui para reenvio.'}
            actionLabel={!busca ? 'Novo recibo' : undefined}
            onAction={!busca ? novoRecibo : undefined}
          />
        }
      />

      {!carregando && linhas.length > 0 && (
        <View style={styles.rodapeTotal}>
          <Text style={styles.rodapeTotalTexto}>
            {linhas.length} recibo{linhas.length === 1 ? '' : 's'} · {formatCurrency(totalFiltrado)}
          </Text>
        </View>
      )}
    </LayoutDesktop>
  );
}

function AcaoIcone({ icone, rotulo, onPress, carregando }: { icone: keyof typeof MaterialCommunityIcons.glyphMap; rotulo: string; onPress: () => void; carregando?: boolean }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <Pressable
      // Para a linha inteira também abrir o handler de gerar/reenviar (aoClicarLinha
      // da TabelaDados): sem stopPropagation, o clique num ícone de ação (ex.: "Ver
      // orçamento") também disparava o clique da linha — gerando/marcando o PDF do
      // recibo como emitido sem o usuário pedir.
      onPress={(e: GestureResponderEvent) => { e.stopPropagation(); onPress(); }}
      disabled={carregando}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ hovered, focused }: PressableWebState) => [styles.acaoIcone, hovered && styles.acaoIconeHover, focused && styles.focoVisivel]}
    >
      {carregando ? (
        <ActivityIndicator size="small" color={cores.onSurfaceVariant} />
      ) : (
        <MaterialCommunityIcons name={icone} size={17} color={cores.onSurfaceVariant} />
      )}
    </Pressable>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  focoVisivel: {
    outlineWidth: 2,
    outlineColor: c.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  } as any,
  botaoNovo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: c.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  botaoNovoHover: {
    backgroundColor: c.primaryLight,
  },
  botaoNovoLabel: {
    ...Typography.button,
    color: c.onPrimary,
    fontSize: 13,
  },
  kpis: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  numeroWrap: {
    gap: Spacing.xs,
  },
  celulaTexto: {
    ...Typography.bodySmall,
    color: c.onSurface,
  },
  celulaMuted: {
    color: c.onSurfaceMuted,
    fontStyle: 'italic',
  },
  celulaForte: {
    ...Typography.bodySmall,
    color: c.onSurface,
    fontWeight: '800',
  },
  celulaValor: {
    ...Typography.bodySmall,
    color: c.success,
    fontWeight: '800',
  },
  pillPendente: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: c.warningLight,
  },
  pillPendenteTexto: {
    fontSize: 10,
    fontWeight: '800',
    color: c.warning,
  },
  acoesLinha: {
    flexDirection: 'row',
    gap: 2,
  },
  acaoIcone: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acaoIconeHover: {
    backgroundColor: c.surfacePressed,
  },
  rodapeTotal: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  rodapeTotalTexto: {
    ...Typography.bodySmall,
    color: c.onSurfaceVariant,
    fontWeight: '700',
  },
});
