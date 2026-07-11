import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { TabelaDados, Coluna } from '../../components/web/TabelaDados';
import { BarraBusca, normalizarBusca } from '../../components/web/BarraBusca';
import { ChipsFiltro, ItemChipFiltro } from '../../components/web/ChipsFiltro';
import { EmptyState } from '../../components/EmptyState';
import { PressableWebState } from '../../components/web/pressableWebState';
import { PainelOS } from './PainelOS';
import { PainelNovaOS } from './PainelNovaOS';
import { useTipoConta } from '../../hooks/useTipoConta';
import { usePermissao } from '../../hooks/usePermissao';
// Contrato da ONDA 4 — mesmas funções de serviço da OrdemServicoScreen mobile.
import { getOrdens, getMinhasOrdens } from '../../services/ordemServico';
import { getCurrentUser } from '../../services/supabase';
import { onSyncAplicado } from '../../services/cloudSync';
import { formatDateTime } from '../../utils/date';
import { STATUS_OS_LABELS, STATUS_OS_CORES } from '../../types';
import type { OrdemServico, StatusOS } from '../../types';

/** Ordem de exibição dos status — mesma ordem lógica do fluxo usada na mobile. */
const STATUS_OS_ORDEM: StatusOS[] = ['aberta', 'agendada', 'em_execucao', 'pausada', 'concluida', 'cancelada'];

type FiltroStatus = StatusOS | 'todas';

/** Valor numérico → "R$ 1.234,56". */
function formatarValor(v?: number): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Agendada no passado com status ainda aberto (não concluída/cancelada/em andamento fechada). */
function estaAtrasada(o: OrdemServico): boolean {
  if (!o.dataAgendada) return false;
  if (o.status !== 'aberta' && o.status !== 'agendada') return false;
  const t = new Date(o.dataAgendada).getTime();
  return Number.isFinite(t) && t < Date.now();
}

/**
 * Ordens de serviço desktop (v4) — tabela densa com chips de status e painel
 * lateral de detalhe/edição (PainelOS), no mesmo idioma de ClientesDesktopScreen.
 * Reaproveita getOrdens/getMinhasOrdens (mesma regra role-aware da mobile:
 * técnico só vê a própria fila) — nenhuma regra de negócio é duplicada aqui.
 */
export default function OrdensDesktopScreen() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { org, carregando: carregandoConta } = useTipoConta();
  const { papel, pode, carregando: carregandoPapel } = usePermissao();
  const ehTecnico = papel === 'tecnico';
  // Mesma derivação da OrdemServicoScreen mobile (DetalheOS): PainelOS agora
  // exige os dois papéis explicitamente, em vez de inferir sozinho. Fail-closed
  // enquanto o papel não resolveu (1ª leitura em voo, ou offline sem cache —
  // ver usePermissao): trata como NÃO-gestão, senão `undefined !== 'tecnico'`
  // dá true e um técnico vê "Nova OS"/"Atribuir técnico"/"Cancelar OS" antes
  // da leitura terminar (mesmo padrão de OrdemServicoScreen.tsx:221/222).
  const ehGestao = !carregandoPapel && papel !== 'tecnico';
  const podeAtribuir = ehGestao && pode('ver_agenda_equipe');

  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todas');
  const [userId, setUserId] = useState<string | null>(null);

  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [detalheVisivel, setDetalheVisivel] = useState(false);
  const [detalheFoco, setDetalheFoco] = useState<'tecnico' | 'agenda' | undefined>(undefined);
  const [novaVisivel, setNovaVisivel] = useState(false);

  useEffect(() => {
    let ativo = true;
    getCurrentUser().then((u) => { if (ativo) setUserId(u?.id ?? null); }).catch(() => {});
    return () => { ativo = false; };
  }, []);

  const carregar = useCallback(async () => {
    try {
      const lista = ehTecnico ? (userId ? await getMinhasOrdens(userId) : []) : await getOrdens();
      lista.sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''));
      setOrdens(lista);
    } catch {
      setOrdens([]);
    } finally {
      setCarregando(false);
    }
  }, [ehTecnico, userId]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => onSyncAplicado(carregar), [carregar]);
  useEffect(() => { if (ehTecnico && userId) carregar(); }, [ehTecnico, userId, carregar]);

  // Busca aplicada antes do filtro de status — as contagens dos chips refletem
  // o que a busca atual encontrou (mesmo princípio do "total vivo" de Recibos).
  const buscadas = useMemo(() => {
    const q = busca.trim();
    if (!q) return ordens;
    const nq = normalizarBusca(q);
    return ordens.filter((o) =>
      normalizarBusca(o.clienteNome || '').includes(nq) ||
      normalizarBusca(o.titulo || '').includes(nq) ||
      normalizarBusca(o.numero || '').includes(nq),
    );
  }, [ordens, busca]);

  const contagensPorStatus = useMemo(() => {
    const mapa = new Map<StatusOS, number>();
    for (const o of buscadas) mapa.set(o.status, (mapa.get(o.status) ?? 0) + 1);
    return mapa;
  }, [buscadas]);

  const itensChips: ItemChipFiltro<FiltroStatus>[] = useMemo(() => [
    { chave: 'todas', rotulo: 'Todas', contagem: buscadas.length },
    ...STATUS_OS_ORDEM.map((s) => ({
      chave: s as FiltroStatus,
      rotulo: STATUS_OS_LABELS[s],
      cor: STATUS_OS_CORES[s],
      contagem: contagensPorStatus.get(s) ?? 0,
    })),
  ], [buscadas.length, contagensPorStatus]);

  const linhas = useMemo(() => {
    if (!ehGestao || filtroStatus === 'todas') return buscadas;
    return buscadas.filter((o) => o.status === filtroStatus);
  }, [buscadas, filtroStatus, ehGestao]);

  const atrasadasCount = useMemo(() => ordens.filter(estaAtrasada).length, [ordens]);

  function abrirDetalhe(id: string, foco?: 'tecnico' | 'agenda') {
    setDetalheId(id);
    setDetalheFoco(foco);
    setDetalheVisivel(true);
  }

  const colunas: Coluna<OrdemServico>[] = useMemo(() => [
    {
      chave: 'numero',
      titulo: 'Nº',
      largura: 88,
      ordenavel: true,
      valorOrdenacao: (o) => o.numero ?? '',
      render: (o) => <Text style={styles.celulaTexto}>{o.numero}</Text>,
    },
    {
      chave: 'os',
      titulo: 'OS',
      largura: '24%',
      ordenavel: true,
      valorOrdenacao: (o) => o.titulo ?? '',
      render: (o) => (
        <View style={{ minWidth: 0 }}>
          <Text style={styles.celulaTitulo} numberOfLines={1}>{o.titulo || 'Ordem de serviço'}</Text>
          <Text style={styles.celulaSub} numberOfLines={1}>{o.clienteNome || 'Sem cliente'}</Text>
        </View>
      ),
      tituloCompleto: (o) => `${o.titulo || 'Ordem de serviço'} — ${o.clienteNome || 'Sem cliente'}`,
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: 130,
      ordenavel: true,
      valorOrdenacao: (o) => STATUS_OS_ORDEM.indexOf(o.status),
      render: (o) => <StatusChipTabela status={o.status} />,
    },
    {
      chave: 'tecnico',
      titulo: 'Técnico',
      largura: 170,
      ordenavel: true,
      valorOrdenacao: (o) => o.tecnicoNome ?? '',
      render: (o) => o.tecnicoNome ? (
        <View style={styles.tecnicoCel}>
          <View style={styles.avatarMini}>
            <Text style={styles.avatarMiniTexto}>{o.tecnicoNome.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.celulaTexto} numberOfLines={1}>{o.tecnicoNome}</Text>
        </View>
      ) : <Text style={styles.celulaTextoMuted}>—</Text>,
      tituloCompleto: (o) => o.tecnicoNome,
    },
    {
      chave: 'agenda',
      titulo: 'Agendada para',
      largura: 175,
      ordenavel: true,
      valorOrdenacao: (o) => o.dataAgendada ?? '',
      render: (o) => {
        if (!o.dataAgendada) return <Text style={styles.celulaTextoMuted}>—</Text>;
        const atrasada = estaAtrasada(o);
        return (
          <View style={styles.agendaCel}>
            {atrasada && <MaterialCommunityIcons name="alert-circle" size={14} color={cores.danger} />}
            <Text style={[styles.celulaTexto, atrasada && styles.textoAtrasado]} numberOfLines={1}>
              {formatDateTime(o.dataAgendada)}
            </Text>
          </View>
        );
      },
    },
    {
      chave: 'checklist',
      titulo: 'Checklist',
      largura: 120,
      ordenavel: true,
      valorOrdenacao: (o) => (o.checklist?.length ? o.checklist.filter((c) => c.feito).length / o.checklist.length : -1),
      render: (o) => {
        const total = o.checklist?.length ?? 0;
        if (total === 0) return <Text style={styles.celulaTextoMuted}>—</Text>;
        const feitos = o.checklist.filter((c) => c.feito).length;
        const pct = Math.round((feitos / total) * 100);
        return (
          <View style={{ gap: 4, minWidth: 70 }}>
            <Text style={styles.celulaTexto}>{feitos}/{total}</Text>
            <View style={styles.barraFundo}>
              <View style={[styles.barraPreenchida, { width: `${pct}%` as `${number}%` }, feitos === total && { backgroundColor: cores.success }]} />
            </View>
          </View>
        );
      },
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: 116,
      alinhamento: 'direita',
      ordenavel: true,
      valorOrdenacao: (o) => o.valor ?? 0,
      render: (o) => <Text style={styles.celulaValor}>{typeof o.valor === 'number' ? formatarValor(o.valor) : '—'}</Text>,
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: 130,
      render: (o) => (
        <View style={styles.acoesLinha}>
          <AcaoIcone icone="eye-outline" rotulo="Abrir OS" onPress={() => abrirDetalhe(o.id)} />
          {ehGestao && (
            <AcaoIcone icone="account-arrow-right-outline" rotulo="Atribuir técnico" onPress={() => abrirDetalhe(o.id, 'tecnico')} />
          )}
          {ehGestao && (
            <AcaoIcone icone="calendar-clock-outline" rotulo="Agendar" onPress={() => abrirDetalhe(o.id, 'agenda')} />
          )}
        </View>
      ),
    },
  ], [styles, cores, ehGestao]);

  const totalOrdens = ordens.length;
  const subtitulo = ehTecnico
    ? 'Suas ordens em campo'
    : `${totalOrdens} ${totalOrdens === 1 ? 'ordem' : 'ordens'}${atrasadasCount > 0 ? ` · ${atrasadasCount} atrasada${atrasadasCount === 1 ? '' : 's'}` : ''}`;

  return (
    <LayoutDesktop
      titulo={ehTecnico ? 'Minhas OS' : 'Ordens de serviço'}
      subtitulo={subtitulo}
      acoes={
        <>
          <BarraBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por cliente, título ou nº…" />
          {ehGestao && (
            <Pressable
              onPress={() => setNovaVisivel(true)}
              accessibilityRole="button"
              accessibilityLabel="Nova ordem de serviço"
              style={({ hovered, focused }: PressableWebState) => [styles.botaoNovo, hovered && styles.botaoNovoHover, focused && styles.focoVisivel]}
            >
              <MaterialCommunityIcons name="plus" size={18} color={cores.onPrimary} />
              <Text style={styles.botaoNovoLabel}>Nova OS</Text>
            </Pressable>
          )}
        </>
      }
    >
      {ehGestao && (
        <ChipsFiltro<FiltroStatus> itens={itensChips} selecionado={filtroStatus} aoSelecionar={setFiltroStatus} />
      )}

      <TabelaDados<OrdemServico>
        colunas={colunas}
        dados={linhas}
        carregando={carregando || carregandoConta}
        aoClicarLinha={(o) => abrirDetalhe(o.id)}
        vazio={
          <EmptyState
            icon="clipboard-check-outline"
            title={ehTecnico ? 'Nenhuma OS para você' : 'Nenhuma ordem de serviço'}
            subtitle={
              busca
                ? 'Nenhum resultado para sua busca.'
                : ehTecnico
                ? 'Quando o escritório te atribuir uma ordem, ela aparece aqui.'
                : 'Crie a primeira ordem a partir de um orçamento aprovado ou manualmente.'
            }
            actionLabel={ehGestao && !busca ? 'Nova OS' : undefined}
            onAction={ehGestao && !busca ? () => setNovaVisivel(true) : undefined}
          />
        }
      />

      <PainelOS
        ordemId={detalheId}
        orgId={org?.id}
        ehGestao={ehGestao}
        podeAtribuir={podeAtribuir}
        visivel={detalheVisivel}
        focoInicial={detalheFoco}
        aoFechar={() => setDetalheVisivel(false)}
        aoMudou={carregar}
      />

      {ehGestao && (
        <PainelNovaOS
          visivel={novaVisivel}
          aoFechar={() => setNovaVisivel(false)}
          aoCriada={(id) => {
            setNovaVisivel(false);
            carregar();
            abrirDetalhe(id);
          }}
        />
      )}
    </LayoutDesktop>
  );
}

/** Chip de status da linha — mesmos tokens (STATUS_OS_CORES/LABELS) da OS mobile. */
function StatusChipTabela({ status }: { status: StatusOS }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const cor = STATUS_OS_CORES[status] ?? cores.onSurfaceVariant;
  return (
    <View style={[styles.statusChip, { backgroundColor: `${cor}22`, borderColor: `${cor}66` }]}>
      <Text style={[styles.statusChipTexto, { color: cor }]} numberOfLines={1}>{STATUS_OS_LABELS[status] ?? status}</Text>
    </View>
  );
}

function AcaoIcone({ icone, rotulo, onPress }: { icone: keyof typeof MaterialCommunityIcons.glyphMap; rotulo: string; onPress: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <Pressable
      // Para a linha inteira também abrir a OS ao clicar (aoClicarLinha da TabelaDados):
      // sem stopPropagation, o clique num ícone de ação também dispara o clique da
      // linha, e uma ação como "Atribuir técnico" perderia o foco pro handler genérico.
      onPress={(e: GestureResponderEvent) => { e.stopPropagation(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ hovered, focused }: PressableWebState) => [styles.acaoIcone, hovered && styles.acaoIconeHover, focused && styles.focoVisivel]}
    >
      <MaterialCommunityIcons name={icone} size={16} color={cores.onSurfaceVariant} />
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
  celulaTexto: {
    ...Typography.bodySmall,
    color: c.onSurface,
  },
  celulaTextoMuted: {
    ...Typography.bodySmall,
    color: c.onSurfaceMuted,
  },
  celulaTitulo: {
    ...Typography.bodySmall,
    fontWeight: '700' as const,
    color: c.onSurface,
  },
  celulaSub: {
    ...Typography.caption,
    color: c.onSurfaceVariant,
    marginTop: 1,
  },
  celulaValor: {
    ...Typography.bodySmall,
    fontWeight: '700' as const,
    color: c.onSurface,
  },

  statusChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  statusChipTexto: {
    fontSize: 11,
    fontWeight: '800' as const,
  },

  tecnicoCel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarMini: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: c.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMiniTexto: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: c.accentLight,
  },

  agendaCel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  textoAtrasado: {
    color: c.danger,
    fontWeight: '700' as const,
  },

  barraFundo: {
    width: 64,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.surfaceVariant,
    overflow: 'hidden',
  },
  barraPreenchida: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: c.accent,
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
});
