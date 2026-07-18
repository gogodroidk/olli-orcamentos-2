import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, sombrasDe, comAlfa, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { TabelaDados, Coluna } from '../../components/web/TabelaDados';
import { BarraBusca, normalizarBusca } from '../../components/web/BarraBusca';
import { ChipsFiltro, ItemChipFiltro } from '../../components/web/ChipsFiltro';
import { EmptyState } from '../../components/EmptyState';
import { PressableWebState } from '../../components/web/pressableWebState';
import {
  getItensNaLixeira, restaurarItem, excluirDefinitivo, esvaziarLixeira,
  diasRestantes, DIAS_RETENCAO_LIXEIRA, TIPO_LIXEIRA_META,
  ItemLixeira, TipoLixeira,
} from '../../services/lixeira';
import {
  deleteCliente, deleteServico, deleteProduto, deleteOrcamento,
  deleteRecibo, deleteModelo, deleteDepoimento, deleteOrdemServico,
} from '../../database/database';
import { deleteAgendamento } from '../../services/agenda';
import { removerEquipamento } from '../../services/equipamentos';
import { onSyncAplicado } from '../../services/cloudSync';
import { formatDate } from '../../utils/date';
import { avisar, confirmar } from './dialogo';

/** Linha da tabela: `id` é a CHAVE COMPOSTA (tipo:id) exigida pelo contrato da
 * TabelaDados (T extends { id }) — famílias diferentes podem colidir em id
 * cru, então `itemId` guarda o id real usado nas chamadas de serviço. */
type LinhaLixeira = ItemLixeira & { id: string; itemId: string };

/** Cor de destaque por tipo — mesma paleta da LixeiraScreen mobile (o mapa de
 * lá é local/não-exportado, então replicado aqui só na camada de apresentação;
 * nenhuma regra de negócio é redefinida). */
function criarCorTipo(c: Cores): Record<TipoLixeira, string> {
  return {
    cliente: c.accent,
    servico: c.primaryLight,
    produto: '#A78BFA',
    orcamento: c.primary,
    recibo: c.success,
    modelo: c.warning,
    depoimento: '#F7B23B',
    agendamento: '#A78BFA',
    ordem_servico: c.accentLight,
    equipamento: c.accent,
  };
}

/** DESFAZER de um "restaurar": manda o item de volta pra lixeira (mesmo soft
 * delete que a tela mobile de cada entidade usa pra excluir — reaproveitado
 * diretamente, sem reimplementar a escrita). */
const DESFAZER_RESTAURAR: Record<TipoLixeira, (id: string) => Promise<void>> = {
  cliente: deleteCliente,
  servico: deleteServico,
  produto: deleteProduto,
  orcamento: deleteOrcamento,
  recibo: deleteRecibo,
  modelo: deleteModelo,
  depoimento: deleteDepoimento,
  agendamento: deleteAgendamento,
  ordem_servico: deleteOrdemServico,
  equipamento: removerEquipamento,
};

/** Badge do prazo restante até o expurgo — verde (folga) → âmbar (perto) →
 * vermelho (vencido). Mesma leitura da PrazoBadge mobile, com o terceiro tom
 * (verde) explícito para a densidade da tabela desktop. */
function PrazoBadge({ excluidoEm }: { excluidoEm: string }) {
  const styles = useEstilos(criarEstilos);
  const dias = diasRestantes(excluidoEm);
  const cor = useCores();
  const tom = dias <= 0 ? cor.danger : dias <= 5 ? cor.warning : cor.success;
  const label = dias <= 0 ? 'Expira em breve' : `Expira em ${dias} dia${dias === 1 ? '' : 's'}`;
  return (
    <View style={[styles.prazoBadge, { borderColor: comAlfa(tom, 0.35), backgroundColor: comAlfa(tom, 0.14) }]}>
      <MaterialCommunityIcons name="timer-sand" size={12} color={tom} />
      <Text style={[styles.prazoTexto, { color: tom }]}>{label}</Text>
    </View>
  );
}

/**
 * Lixeira desktop (v4) — tabela única (sem as seções por tipo do mobile,
 * substituídas por chips de filtro), ordenada por padrão pelo que expira
 * primeiro. Reaproveita 100% da camada de serviço da LixeiraScreen mobile
 * (services/lixeira.ts) para listar/restaurar/excluir/esvaziar — o "desfazer"
 * do toast é o único acréscimo, e reaproveita o soft-delete de cada entidade
 * (o mesmo que a tela mobile de cada uma já usa para excluir).
 */
export default function LixeiraDesktopScreen() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const corTipo = useMemo(() => criarCorTipo(cores), [cores]);

  const [itens, setItens] = useState<ItemLixeira[]>([]);
  const [busca, setBusca] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoLixeira | 'todos'>('todos');
  const [carregando, setCarregando] = useState(true);
  const [itensErro, setItensErro] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [esvaziando, setEsvaziando] = useState(false);
  // Guarda a LINHA (não o ItemLixeira cru): precisa do `itemId` real pra o
  // desfazer não repetir o bug da chave composta (ver DESFAZER_RESTAURAR).
  const [toast, setToast] = useState<LinhaLixeira | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    setItensErro(false);
    try {
      const lista = await getItensNaLixeira();
      setItens(lista);
    } catch {
      // erro de verdade (leitura falhou) — NUNCA vira lista vazia silenciosa.
      setItensErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => onSyncAplicado(carregar), [carregar]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function mostrarToastRestaurado(item: LinhaLixeira) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(item);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  async function handleRestaurar(linha: LinhaLixeira) {
    setBusyId(linha.id);
    try {
      await restaurarItem(linha.tipo, linha.itemId);
      await carregar();
      mostrarToastRestaurado(linha);
    } catch {
      avisar('Erro', 'Não foi possível restaurar agora. Tente novamente.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleExcluirDefinitivo(linha: LinhaLixeira) {
    if (!(await confirmar('Excluir definitivamente', `"${linha.titulo}" será apagado para sempre. Esta ação não pode ser desfeita.`))) return;
    setBusyId(linha.id);
    try {
      await excluirDefinitivo(linha.tipo, linha.itemId);
      await carregar();
    } catch {
      avisar('Erro', 'Não foi possível excluir agora. Tente novamente.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleEsvaziar() {
    if (!itens.length) return;
    if (!(await confirmar('Esvaziar lixeira', `Todos os ${itens.length} item${itens.length === 1 ? '' : 's'} serão apagados para sempre. Esta ação não pode ser desfeita.`))) return;
    setEsvaziando(true);
    try {
      await esvaziarLixeira();
      await carregar();
    } catch {
      avisar('Erro', 'Não foi possível esvaziar a lixeira agora. Tente novamente.');
    } finally {
      setEsvaziando(false);
    }
  }

  async function handleDesfazer() {
    if (!toast) return;
    const item = toast;
    setToast(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    try {
      // `item.itemId` é o id real da linha — `item.id` é a chave composta
      // "tipo:id" (contrato da TabelaDados) e NUNCA bate no banco.
      await DESFAZER_RESTAURAR[item.tipo](item.itemId);
      await carregar();
    } catch {
      avisar('Erro', 'Não foi possível desfazer agora.');
    }
  }

  // Contagem por tipo — só entram nos chips os tipos com item na lixeira
  // agora (evita poluir a barra com categorias vazias).
  const tiposPresentes = useMemo(() => {
    const contagem = new Map<TipoLixeira, number>();
    for (const item of itens) contagem.set(item.tipo, (contagem.get(item.tipo) ?? 0) + 1);
    return (Object.keys(TIPO_LIXEIRA_META) as TipoLixeira[])
      .filter((t) => (contagem.get(t) ?? 0) > 0)
      .map((t) => ({ tipo: t, contagem: contagem.get(t) ?? 0 }));
  }, [itens]);

  const expirandoEmBreve = useMemo(
    () => itens.filter((i) => diasRestantes(i.excluidoEm) <= 5).length,
    [itens],
  );

  // Itens do ChipsFiltro compartilhado (primitiva do kit desktop v4) — "Todos"
  // fixo na frente + um chip por tipo presente na lixeira agora.
  const itensChips: ItemChipFiltro<TipoLixeira | 'todos'>[] = useMemo(() => [
    { chave: 'todos', rotulo: 'Todos', contagem: itens.length },
    ...tiposPresentes.map(({ tipo, contagem }) => ({
      chave: tipo,
      rotulo: TIPO_LIXEIRA_META[tipo].plural,
      cor: corTipo[tipo],
      contagem,
    })),
  ], [itens.length, tiposPresentes, corTipo]);

  const linhas: LinhaLixeira[] = useMemo(() => {
    let r: ItemLixeira[] = itens;
    if (tipoFiltro !== 'todos') r = r.filter((i) => i.tipo === tipoFiltro);
    if (busca.trim()) {
      const q = normalizarBusca(busca);
      r = r.filter((i) => normalizarBusca(i.titulo).includes(q) || normalizarBusca(i.subtitulo ?? '').includes(q));
    }
    return r.map((i) => ({ ...i, id: `${i.tipo}:${i.id}`, itemId: i.id }));
  }, [itens, tipoFiltro, busca]);

  const colunas: Coluna<LinhaLixeira>[] = useMemo(() => [
    {
      chave: 'tipo',
      titulo: 'Tipo',
      largura: 190,
      ordenavel: true,
      valorOrdenacao: (l) => TIPO_LIXEIRA_META[l.tipo].singular,
      render: (l) => {
        const cor = corTipo[l.tipo];
        return (
          <View style={styles.tipoCelula}>
            <View style={[styles.iconBubble, { backgroundColor: comAlfa(cor, 0.16), borderColor: comAlfa(cor, 0.34) }]}>
              <MaterialCommunityIcons name={TIPO_LIXEIRA_META[l.tipo].icone as any} size={15} color={cor} />
            </View>
            <Text style={styles.celulaTexto} numberOfLines={1}>{TIPO_LIXEIRA_META[l.tipo].singular}</Text>
          </View>
        );
      },
    },
    {
      chave: 'item',
      titulo: 'Item',
      largura: '28%',
      ordenavel: true,
      valorOrdenacao: (l) => l.titulo,
      render: (l) => <Text style={styles.celulaTexto} numberOfLines={1}>{l.titulo}</Text>,
      tituloCompleto: (l) => (l.subtitulo ? `${l.titulo} · ${l.subtitulo}` : l.titulo),
    },
    {
      chave: 'excluidoEm',
      titulo: 'Excluído em',
      largura: 130,
      ordenavel: true,
      valorOrdenacao: (l) => l.excluidoEm,
      render: (l) => <Text style={styles.celulaTexto}>{l.excluidoEm ? formatDate(l.excluidoEm) : '—'}</Text>,
    },
    {
      chave: 'expiraEm',
      titulo: 'Expira em',
      largura: 170,
      ordenavel: true,
      valorOrdenacao: (l) => diasRestantes(l.excluidoEm),
      render: (l) => <PrazoBadge excluidoEm={l.excluidoEm} />,
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: 140,
      render: (l) => {
        const ocupado = busyId === l.id;
        return (
          <View style={styles.acoesLinha}>
            {ocupado ? (
              <ActivityIndicator size="small" color={cores.accentLight} />
            ) : (
              <>
                <AcaoIcone icone="restore" rotulo={`Restaurar ${l.titulo}`} onPress={() => handleRestaurar(l)} />
                <AcaoIcone icone="delete-forever-outline" rotulo={`Excluir ${l.titulo} definitivamente`} onPress={() => handleExcluirDefinitivo(l)} tom="danger" />
              </>
            )}
          </View>
        );
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [styles, corTipo, busyId, cores]);

  return (
    <LayoutDesktop
      titulo="Lixeira"
      subtitulo={
        itens.length
          ? `${itens.length} item${itens.length === 1 ? '' : 's'} recuperável${itens.length === 1 ? '' : 'is'}${expirandoEmBreve ? ` · ${expirandoEmBreve} expira${expirandoEmBreve === 1 ? '' : 'm'} em breve` : ''}`
          : 'Vazia'
      }
      acoes={
        <>
          <BarraBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome…" />
          {itens.length > 0 && (
            <Pressable
              onPress={handleEsvaziar}
              disabled={esvaziando}
              accessibilityRole="button"
              accessibilityLabel="Esvaziar lixeira"
              style={({ hovered, focused }: PressableWebState) => [styles.botaoEsvaziar, hovered && styles.botaoEsvaziarHover, focused && styles.focoVisivel]}
            >
              {esvaziando
                ? <ActivityIndicator size="small" color={cores.danger} />
                : <MaterialCommunityIcons name="delete-sweep-outline" size={18} color={cores.danger} />}
              <Text style={styles.botaoEsvaziarLabel}>Esvaziar lixeira</Text>
            </Pressable>
          )}
        </>
      }
    >
      <View style={styles.infoRow}>
        <MaterialCommunityIcons name="information-outline" size={15} color={cores.accentLight} />
        <Text style={styles.infoText}>
          Itens excluídos ficam aqui por {DIAS_RETENCAO_LIXEIRA} dias e depois são apagados automaticamente.
        </Text>
      </View>

      {tiposPresentes.length > 0 && (
        <ChipsFiltro<TipoLixeira | 'todos'>
          itens={itensChips}
          selecionado={tipoFiltro}
          aoSelecionar={setTipoFiltro}
        />
      )}

      <TabelaDados<LinhaLixeira>
        colunas={colunas}
        dados={linhas}
        carregando={carregando}
        ordenacaoInicial={{ chave: 'expiraEm', direcao: 'asc' }}
        vazio={
          itensErro ? (
            <EmptyState
              icon="alert-circle-outline"
              title="Não deu para carregar"
              subtitle="Não conseguimos buscar sua lixeira agora. Verifique a conexão e tente de novo."
              actionLabel="Tentar de novo"
              onAction={carregar}
            />
          ) : (
            <EmptyState
              icon="delete-empty-outline"
              title="Lixeira vazia"
              subtitle="Nada foi excluído por aqui. O que você apagar aparece nesta tela e pode ser restaurado."
            />
          )
        }
      />

      {toast && (
        <View style={styles.toastWrap} pointerEvents="box-none">
          <View style={styles.toastCard}>
            <MaterialCommunityIcons name="check-circle-outline" size={18} color={cores.success} />
            <Text style={styles.toastTexto} numberOfLines={1}>Restaurado: {toast.titulo}</Text>
            <Pressable
              onPress={handleDesfazer}
              accessibilityRole="button"
              accessibilityLabel="Desfazer restauração"
              style={({ hovered, focused }: PressableWebState) => [styles.toastDesfazerBtn, hovered && styles.toastDesfazerBtnHover, focused && styles.focoVisivel]}
            >
              <Text style={styles.toastDesfazerLabel}>Desfazer</Text>
            </Pressable>
          </View>
        </View>
      )}
    </LayoutDesktop>
  );
}

function AcaoIcone({ icone, rotulo, onPress, tom }: {
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  rotulo: string;
  onPress: () => void;
  tom?: 'danger';
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ hovered, focused }: PressableWebState) => [styles.acaoIcone, hovered && styles.acaoIconeHover, focused && styles.focoVisivel]}
    >
      <MaterialCommunityIcons name={icone} size={17} color={tom === 'danger' ? cores.danger : cores.onSurfaceVariant} />
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

  botaoEsvaziar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: comAlfa(c.danger, 0.10),
    borderWidth: 1,
    borderColor: comAlfa(c.danger, 0.32),
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  botaoEsvaziarHover: {
    backgroundColor: comAlfa(c.danger, 0.18),
  },
  botaoEsvaziarLabel: {
    ...Typography.button,
    color: c.danger,
    fontSize: 13,
  },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: comAlfa(c.accent, 0.10), borderWidth: 1, borderColor: comAlfa(c.accent, 0.24),
    borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 9, marginBottom: Spacing.lg,
  },
  infoText: { flex: 1, fontSize: 12, color: c.onSurfaceVariant, fontWeight: '600', lineHeight: 16 },

  tipoCelula: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minWidth: 0,
  },
  iconBubble: {
    width: 28, height: 28, borderRadius: BorderRadius.sm,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  celulaTexto: {
    ...Typography.bodySmall,
    color: c.onSurface,
    flexShrink: 1,
  },

  prazoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  prazoTexto: { fontSize: 11, fontWeight: '800' },

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

  // `position: 'fixed'` não é tipado pelo RN (só existe via react-native-web
  // no alvo web) — arquivo desktop-only, nunca compartilhado com o nativo.
  toastWrap: {
    position: 'fixed',
    bottom: Spacing.xl,
    right: Spacing.xl,
    zIndex: 50,
  } as any,
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    maxWidth: 360,
    ...sombrasDe(c).lg,
  },
  toastTexto: {
    ...Typography.bodySmall,
    color: c.onSurface,
    flexShrink: 1,
  },
  toastDesfazerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: comAlfa(c.accent, 0.14),
  },
  toastDesfazerBtnHover: {
    backgroundColor: comAlfa(c.accent, 0.24),
  },
  toastDesfazerLabel: {
    ...Typography.button,
    fontSize: Typography.caption.fontSize,
    color: c.accentLight,
  },
});
