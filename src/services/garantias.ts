/**
 * GARANTIA QUE SE CUIDA SOZINHA — a parte do app (Onda I3, jogada 12).
 *
 * Regras puras em `utils/garantiaServico.ts`. Aqui: leitura local (OS concluídas +
 * garantia do orçamento de origem), o "Feito" por item, o aviso local "a garantia
 * vence em 7 dias" e o chamado de garantia da etiqueta QR virando OS ligada.
 *
 * Erro nunca vira vazio: `carregarGarantias` devolve `{ estado:'erro' }` quando
 * não consegue ler, e a tela diz isso (nunca "nenhuma garantia para cuidar").
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getEmpresa, getOrcamento, getOrdensServico, getOrdensServicoDoEquipamento } from '../database/database';
import { acessoRecursoAgora } from './planos';
import { verticaisEfetivos } from './verticalSegmento';
import { GARANTIA_FEITOS_KEY, GARANTIA_NOTIF_KEY } from './storageKeys';
import { hojeLocal } from '../utils/historicoEquipamento';
import {
  avisosFuturosDeGarantia,
  garantiaDaOS,
  garantiasParaCuidar,
  type GarantiaDaOS,
  type ItemGarantia,
} from '../utils/garantiaServico';
import type { OrdemServico, PedidoOrcamentoQr } from '../types';

export type LeituraGarantias =
  | { estado: 'ok'; itens: ItemGarantia[]; vigentes: GarantiaDaOS[]; nomePrestador: string | null }
  | { estado: 'erro' };

async function lerFeitos(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(GARANTIA_FEITOS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

/** Teto de orçamentos lidos para achar a garantia das OS antigas (sem prazo próprio). */
const TETO_ORCAMENTOS_LIDOS = 60;

/**
 * Texto de garantia dos orçamentos de origem SÓ das OS concluídas que não têm
 * prazo próprio (as OS novas já herdam o prazo). Lê um a um, com teto, em vez de
 * carregar todos os orçamentos a cada abertura do Hoje. Um orçamento ilegível só
 * tira a garantia daquela OS.
 */
async function garantiasDosOrcamentos(ordens: OrdemServico[]): Promise<Map<string, string | undefined>> {
  const ids = [...new Set(
    ordens
      .filter((o) => o.status === 'concluida' && !o.excluidoEm && !o.garantia?.trim() && o.orcamentoId)
      .sort((a, b) => (b.concluidoEm || b.atualizadoEm || '').localeCompare(a.concluidoEm || a.atualizadoEm || ''))
      .map((o) => o.orcamentoId as string),
  )].slice(0, TETO_ORCAMENTOS_LIDOS);
  const mapa = new Map<string, string | undefined>();
  await Promise.all(ids.map(async (id) => {
    try {
      mapa.set(id, (await getOrcamento(id))?.garantia);
    } catch {
      // sem este orçamento, sem a garantia dele
    }
  }));
  return mapa;
}

/** Todas as garantias (de OS concluídas) que o OLLI conhece neste aparelho. */
async function todasAsGarantias(): Promise<GarantiaDaOS[]> {
  const ordens = await getOrdensServico();
  const garantiaPorOrc = await garantiasDosOrcamentos(ordens);
  const out: GarantiaDaOS[] = [];
  for (const os of ordens) {
    const g = garantiaDaOS(os, os.orcamentoId ? garantiaPorOrc.get(os.orcamentoId) : undefined);
    if (g) out.push(g);
  }
  return out;
}

/** O que cuidar hoje + as garantias vigentes. Lê só o banco local (funciona offline). */
export async function carregarGarantias(): Promise<LeituraGarantias> {
  try {
    const [garantias, empresa, feitos] = await Promise.all([
      todasAsGarantias(),
      getEmpresa().catch(() => null),
      lerFeitos(),
    ]);
    const hoje = hojeLocal();
    const itens = garantiasParaCuidar({
      garantias,
      hoje,
      verticais: verticaisEfetivos(empresa),
      feitos: Object.keys(feitos),
    });
    const vigentes = garantias
      .filter((g) => g.ate && g.ate >= hoje)
      .sort((a, b) => (a.ate ?? '').localeCompare(b.ate ?? ''));
    return { estado: 'ok', itens, vigentes, nomePrestador: empresa?.nomePrestador || empresa?.nome || null };
  } catch {
    return { estado: 'erro' };
  }
}

/** Marca o item como cuidado ("Feito"): some da lista e do aviso. */
export async function marcarGarantiaCuidada(chave: string): Promise<void> {
  const feitos = await lerFeitos();
  feitos[chave] = new Date().toISOString();
  await AsyncStorage.setItem(GARANTIA_FEITOS_KEY, JSON.stringify(feitos));
  void reagendarAvisosGarantia().catch(() => {});
}

// ─── Aviso local "a garantia vence em 7 dias" ───────────────────────────────

const CANAL_ANDROID = 'garantia';
const HORA_AVISO = 9;

async function cancelarAvisosAnteriores(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(GARANTIA_NOTIF_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id === 'string') await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      }
    }
    await AsyncStorage.removeItem(GARANTIA_NOTIF_KEY);
  } catch {
    // best-effort
  }
}

/**
 * (Re)agenda até 5 avisos "a garantia de X vence em 7 dias" às 9h do dia em que
 * cada garantia entra na última semana. Cancela-e-recria; silêncio sem o recurso
 * do Pro, sem permissão ou sem garantia legível. NUNCA lança e nunca pede permissão.
 */
export async function reagendarAvisosGarantia(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const acesso = await acessoRecursoAgora('vespera_garantia');
    if (acesso === 'indeterminado') return;
    // Leitura ANTES de cancelar: falha de leitura deixa os avisos como estão.
    let garantias: GarantiaDaOS[];
    try {
      garantias = await todasAsGarantias();
    } catch {
      return;
    }
    await cancelarAvisosAnteriores();
    if (acesso !== 'liberado') return;
    const { temPermissaoNotificacao } = await import('./agenda');
    if (!(await temPermissaoNotificacao())) return;
    const feitos = Object.keys(await lerFeitos());
    const avisos = avisosFuturosDeGarantia({ garantias, hoje: hojeLocal(), feitos, limite: 5 });
    if (avisos.length === 0) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
        name: 'Garantias',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      }).catch(() => {});
    }
    const ids: string[] = [];
    for (const a of avisos) {
      const [ano, mes, dia] = a.dia.split('-').map(Number);
      const quando = new Date(ano, mes - 1, dia, HORA_AVISO, 0, 0, 0);
      if (quando.getTime() <= Date.now()) continue;
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Garantia vencendo em 7 dias',
            body: `${a.garantia.clienteNome || 'Cliente'} · ${a.garantia.titulo}. Pergunte se está tudo certo antes de vencer.`,
            data: { garantia: true },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: quando, channelId: CANAL_ANDROID },
        });
        ids.push(id);
      } catch {
        // pula este aviso
      }
    }
    if (ids.length) await AsyncStorage.setItem(GARANTIA_NOTIF_KEY, JSON.stringify(ids));
  } catch {
    // best-effort
  }
}

// ─── Chamado de garantia pela etiqueta QR → OS ligada ───────────────────────

/**
 * A OS original do chamado: a concluída mais recente DO EQUIPAMENTO com garantia
 * ainda valendo. null = nenhuma (o chamado vira OS sem vínculo de garantia, e a
 * tela diz isso — nunca inventa a garantia).
 */
export async function osEmGarantiaDoEquipamento(equipamentoId: string): Promise<{ os: OrdemServico; garantia: GarantiaDaOS } | null> {
  const ordens = await getOrdensServicoDoEquipamento(equipamentoId);
  const garantiaPorOrc = await garantiasDosOrcamentos(ordens);
  const hoje = hojeLocal();
  let melhor: { os: OrdemServico; garantia: GarantiaDaOS } | null = null;
  for (const os of ordens) {
    const g = garantiaDaOS(os, os.orcamentoId ? garantiaPorOrc.get(os.orcamentoId) : undefined);
    if (!g?.ate || g.ate < hoje) continue;
    if (!melhor || g.desde > melhor.garantia.desde) melhor = { os, garantia: g };
  }
  return melhor;
}

/**
 * Transforma o chamado de garantia da etiqueta numa OS de RETORNO DE GARANTIA
 * ligada ao equipamento e à OS original, e marca o pedido como atendido. Lança se
 * não conseguir criar a OS. Se só a marcação falhar, a OS fica criada e
 * `pedidoMarcado` diz que o pedido segue como "novo".
 */
export async function abrirOSDeGarantia(
  pedido: PedidoOrcamentoQr,
): Promise<{ os: OrdemServico; vinculada: boolean; pedidoMarcado: boolean }> {
  const [{ criarOSManual }, { marcarPedidoQrAtendido }] = await Promise.all([
    import('./ordemServico'),
    import('./pedidosQr'),
  ]);
  const original = await osEmGarantiaDoEquipamento(pedido.equipamentoId).catch(() => null);
  const contato = `${pedido.nome} · ${pedido.telefone}`;
  const os = await criarOSManual({
    clienteId: original?.os.clienteId,
    clienteNome: original?.os.clienteNome || pedido.nome,
    titulo: original ? `Retorno de garantia · ${original.os.titulo}`.slice(0, 120) : 'Chamado de garantia',
    descricao: pedido.mensagem
      ? `Chamado pela etiqueta do equipamento: "${pedido.mensagem}"`
      : 'Chamado de garantia pela etiqueta do equipamento.',
    observacoes: `Quem chamou: ${contato}`,
    equipamentoId: pedido.equipamentoId,
    garantiaDeOsId: original?.os.id,
  });
  let pedidoMarcado = true;
  try {
    await marcarPedidoQrAtendido(pedido.id);
  } catch {
    pedidoMarcado = false;
  }
  return { os, vinculada: !!original, pedidoMarcado };
}
