/**
 * CONFIRMAÇÃO DE VÉSPERA — a parte do app (Onda I3, jogada 5).
 *
 * Regras puras em `utils/confirmacaoVisita.ts`; página pública em
 * `worker/src/confirmacaoVisita.js`; banco na migration 20261003103000.
 *
 *  - `pedirLinkConfirmacao(visita)` → RPC `pedir_confirmacao_visita` (o servidor
 *    confere sessão, tenant e plano) → link /v/<token> para a mensagem do WhatsApp.
 *  - `lerConfirmacoes(de, ate)` → status das visitas do período, em TRÊS estados:
 *    ok (lista, pode ser vazia de verdade) / indisponível (sem migration ou sem
 *    nuvem — a tela diz "ainda não disponível") / erro (a tela diz que não leu).
 *  - Um "store" em memória com inscrição alimenta o SELO na Agenda e no Hoje sem
 *    cada cartão fazer a própria consulta (`useConfirmacoesVisitas`).
 *  - `reagendarAvisoVespera()` agenda o aviso das 18h ("Confirmar visitas de
 *    amanhã") — só com o recurso do Pro liberado e a permissão já dada.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase, getCurrentUser } from './supabase';
import { LINK_BASE_URL } from '../config';
import { acessoRecursoAgora } from './planos';
import { VESPERA_AVISO_DIA_KEY, VESPERA_ENVIADOS_KEY, VESPERA_NOTIF_KEY } from './storageKeys';
import { diaNoBrasil, hojeNoBrasil, somarDias } from '../utils/contratoRecorrente';
import { limitesDoDiaLocal } from '../utils/agendaDia';
import {
  chaveConfirmacao,
  avisoVesperaJaSaiu,
  conteudoAvisoVespera,
  diaDaVisita,
  diaLocalDoAparelho,
  horarioAvisoVespera,
  idBaseDaVisita,
  linhaParaConfirmacao,
  linkConfirmacao,
  mapaDeConfirmacoes,
  montarFilaVespera,
  resumoFila,
  type ConfirmacaoVisita,
  type VisitaConfirmavel,
} from '../utils/confirmacaoVisita';

export type LeituraConfirmacoes =
  | { estado: 'ok'; lista: ConfirmacaoVisita[] }
  | { estado: 'indisponivel' }
  | { estado: 'erro' };

const COLUNAS = 'agendamento_id,ocorrencia_dia,inicio,status,respondido_em,expira_em,revogado_em';

function semMigration(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === '42703' || error?.code === 'PGRST204' || error?.code === 'PGRST202';
}

/** Status das visitas entre dois dias (YYYY-MM-DD, inclusive). */
export async function lerConfirmacoes(de: string, ate: string): Promise<LeituraConfirmacoes> {
  if (!supabase) return { estado: 'indisponivel' };
  try {
    const { data, error } = await supabase
      .from('agendamentos_confirmacao')
      .select(COLUNAS)
      .gte('ocorrencia_dia', de)
      .lte('ocorrencia_dia', ate)
      .is('revogado_em', null)
      .limit(500);
    if (error) return semMigration(error) ? { estado: 'indisponivel' } : { estado: 'erro' };
    if (!Array.isArray(data)) return { estado: 'erro' };
    const lista = (data as Record<string, unknown>[])
      .map(linhaParaConfirmacao)
      .filter((c): c is ConfirmacaoVisita => c !== null);
    return { estado: 'ok', lista };
  } catch {
    return { estado: 'erro' };
  }
}

export type ResultadoPedido =
  | { ok: true; link: string; confirmacao: ConfirmacaoVisita }
  | { ok: false; motivo: 'indisponivel' | 'recurso_pro' | 'sem_acesso' | 'visita_passada' | 'sem_sessao' | 'erro'; mensagem: string };

/** Mensagem da tela para cada recusa (texto curto, sem jargão). */
const MENSAGEM_RECUSA: Record<Exclude<ResultadoPedido, { ok: true }>['motivo'], string> = {
  indisponivel: 'A confirmação por link ainda não está disponível nesta conta. A mensagem vai sem o link.',
  recurso_pro: 'A confirmação com 1 toque é do plano Pro.',
  sem_acesso: 'Você não tem acesso a esta agenda.',
  visita_passada: 'Esta visita já passou.',
  sem_sessao: 'Entre na sua conta para pedir a confirmação.',
  erro: 'Não consegui gerar o link agora. Confira a internet e tente de novo.',
};

/** Dono da agenda (tenant): o dono da equipe para o técnico, o próprio usuário no resto. */
async function donoDaAgenda(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user?.id) return null;
  try {
    const [{ garantirContextoEquipe }, { resolverTenantEquipe }] = await Promise.all([
      import('./cloudSync'),
      import('./contextoEquipe'),
    ]);
    return resolverTenantEquipe(await garantirContextoEquipe(), user.id);
  } catch {
    return null;
  }
}

/**
 * Pede (ou reaproveita) o link de confirmação de UMA visita. Mesma visita no
 * mesmo horário = mesmo link (reenviar não invalida o que o cliente já tem).
 */
export async function pedirLinkConfirmacao(visita: VisitaConfirmavel & { titulo?: string }): Promise<ResultadoPedido> {
  const falha = (motivo: Exclude<ResultadoPedido, { ok: true }>['motivo']): ResultadoPedido =>
    ({ ok: false, motivo, mensagem: MENSAGEM_RECUSA[motivo] });
  if (!supabase) return falha('indisponivel');
  const dono = await donoDaAgenda();
  if (!dono) return falha('sem_sessao');
  const agendamentoId = idBaseDaVisita(visita);
  const dia = diaDaVisita(visita);
  try {
    const { data, error } = await supabase.rpc('pedir_confirmacao_visita', {
      p_dono: dono,
      p_agendamento_id: agendamentoId,
      p_dia: dia,
      p_inicio: visita.inicio,
      p_servico: visita.titulo ? visita.titulo.slice(0, 80) : null,
    });
    if (error) {
      if (semMigration(error)) return falha('indisponivel');
      const msg = String(error.message || '');
      if (msg.includes('recurso_pro')) return falha('recurso_pro');
      if (msg.includes('sem_acesso')) return falha('sem_acesso');
      if (msg.includes('visita_passada')) return falha('visita_passada');
      if (msg.includes('sem_sessao')) return falha('sem_sessao');
      return falha('erro');
    }
    const r = (data ?? {}) as Record<string, unknown>;
    if (typeof r.token !== 'string' || !/^[a-f0-9]{64}$/.test(r.token)) return falha('erro');
    const confirmacao: ConfirmacaoVisita = {
      agendamentoId,
      dia,
      inicio: visita.inicio,
      status: r.status === 'confirmada' || r.status === 'remarcar' ? r.status : 'pendente',
      respondidoEm: typeof r.respondido_em === 'string' ? r.respondido_em : undefined,
      expiraEm: typeof r.expira_em === 'string' ? r.expira_em : undefined,
    };
    aplicarNoStore(confirmacao);
    return { ok: true, link: linkConfirmacao(r.token, LINK_BASE_URL), confirmacao };
  } catch {
    return falha('erro');
  }
}

// ─── Registro local de "mandei o pedido" ────────────────────────────────────

export async function lerEnviados(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(VESPERA_ENVIADOS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export async function registrarEnviado(visita: VisitaConfirmavel): Promise<void> {
  try {
    const mapa = await lerEnviados();
    mapa[chaveConfirmacao(idBaseDaVisita(visita), diaDaVisita(visita))] = new Date().toISOString();
    // Poda: só os últimos 14 dias interessam.
    const corte = somarDias(hojeNoBrasil(), -14);
    for (const k of Object.keys(mapa)) {
      const dia = k.split('|')[1] ?? '';
      if (dia < corte) delete mapa[k];
    }
    await AsyncStorage.setItem(VESPERA_ENVIADOS_KEY, JSON.stringify(mapa));
  } catch {
    // best-effort
  }
}

// ─── Store do selo (Agenda e Hoje) ──────────────────────────────────────────

export interface EstadoConfirmacoes {
  estado: 'carregando' | 'ok' | 'indisponivel' | 'erro';
  mapa: ReadonlyMap<string, ConfirmacaoVisita>;
  lidoEm?: number;
}

let store: EstadoConfirmacoes = { estado: 'carregando', mapa: new Map() };
const ouvintes = new Set<(e: EstadoConfirmacoes) => void>();
let lendo: Promise<void> | null = null;
const VALIDADE_MS = 60_000;

function publicar(novo: EstadoConfirmacoes): void {
  store = novo;
  for (const fn of ouvintes) {
    try { fn(store); } catch { /* ouvinte quebrado não derruba os outros */ }
  }
}

function aplicarNoStore(c: ConfirmacaoVisita): void {
  // O RPC acabou de responder: a linha existe na nuvem, mesmo que a última
  // leitura da lista tenha falhado. Entra no mapa sem mudar o estado da leitura.
  const mapa = new Map(store.mapa);
  mapa.set(chaveConfirmacao(c.agendamentoId, c.dia), c);
  publicar({ ...store, mapa });
}

/** Relê a janela de ontem a +14 dias. Sem `forcar`, respeita 60 s de validade. */
export async function atualizarConfirmacoes(forcar = false): Promise<void> {
  if (!forcar && store.lidoEm && Date.now() - store.lidoEm < VALIDADE_MS) return;
  if (lendo) return lendo;
  lendo = (async () => {
    const hoje = hojeNoBrasil();
    const r = await lerConfirmacoes(somarDias(hoje, -1), somarDias(hoje, 14));
    if (r.estado === 'ok') publicar({ estado: 'ok', mapa: mapaDeConfirmacoes(r.lista), lidoEm: Date.now() });
    // Erro/indisponível não apagam o que já foi lido: o selo antigo é melhor que
    // nenhum, e "não li" nunca vira "ninguém confirmou".
    else publicar({ estado: r.estado, mapa: store.mapa, lidoEm: Date.now() });
  })().finally(() => { lendo = null; });
  return lendo;
}

/** Hook do selo: estado atual + releitura no foco e a cada sync aplicado. */
export function useConfirmacoesVisitas(): EstadoConfirmacoes {
  const [estado, setEstado] = useState<EstadoConfirmacoes>(store);
  useEffect(() => {
    ouvintes.add(setEstado);
    void atualizarConfirmacoes();
    let desligar: (() => void) | undefined;
    void import('./cloudSync')
      .then((m) => { desligar = m.onSyncAplicado(() => { void atualizarConfirmacoes(true); }); })
      .catch(() => {});
    return () => {
      ouvintes.delete(setEstado);
      desligar?.();
    };
  }, []);
  return estado;
}

// ─── Aviso das 18h ──────────────────────────────────────────────────────────

const CANAL_ANDROID = 'confirmacao-vespera';

async function cancelarAvisoAnterior(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(VESPERA_NOTIF_KEY);
    if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await AsyncStorage.removeItem(VESPERA_NOTIF_KEY);
  } catch {
    // best-effort
  }
}

/**
 * (Re)agenda "Confirmar visitas de amanhã" para as 18h de hoje. Cancela-e-recria
 * (idempotente). Silêncio quando: recurso não liberado, sem permissão, nada
 * marcado amanhã ou todas já pedidas. NUNCA lança e NUNCA pede permissão sozinho.
 */
export async function reagendarAvisoVespera(agora: Date = new Date()): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const acesso = await acessoRecursoAgora('vespera_garantia');
    if (acesso === 'indeterminado') return; // plano ilegível: não mexe em nada
    await cancelarAvisoAnterior();
    if (acesso !== 'liberado') return;
    const { temPermissaoNotificacao, getAgendamentosExpandidos } = await import('./agenda');
    if (!(await temPermissaoNotificacao())) return;
    const quando = horarioAvisoVespera(agora);
    if (!quando) return;
    // Um aviso por dia: o das 18h já saiu (ou o "em instantes" de uma volta
    // anterior ao app) → não repete a cada volta ao primeiro plano.
    let ultimo: unknown = null;
    try {
      const raw = await AsyncStorage.getItem(VESPERA_AVISO_DIA_KEY);
      ultimo = raw ? JSON.parse(raw) : null;
    } catch {
      ultimo = null;
    }
    if (avisoVesperaJaSaiu(ultimo, agora)) return;

    const amanhaLocal = new Date(agora.getTime() + 86_400_000);
    const { inicio, fim } = limitesDoDiaLocal(amanhaLocal);
    const { getClientes } = await import('../database/database');
    const [visitas, clientes, leitura] = await Promise.all([
      getAgendamentosExpandidos(inicio.toISOString(), fim.toISOString()),
      getClientes(),
      lerConfirmacoes(diaNoBrasil(inicio.toISOString()), diaNoBrasil(fim.toISOString())),
    ]);
    const diaAlvo = diaNoBrasil(amanhaLocal.toISOString());
    const fila = montarFilaVespera({
      visitas,
      clientes,
      confirmacoes: leitura.estado === 'ok' ? mapaDeConfirmacoes(leitura.lista) : new Map(),
      dia: diaAlvo,
    });
    const r = resumoFila(fila);
    let conteudo = conteudoAvisoVespera(r);
    // Sem conseguir ler as respostas, não afirma quantas faltam: só lembra.
    if (leitura.estado !== 'ok' && r.total > 0) {
      conteudo = {
        titulo: 'Confirmar visitas de amanhã',
        corpo: `Amanhã você tem ${r.total === 1 ? '1 visita' : `${r.total} visitas`}. Toque para pedir a confirmação.`,
      };
    }
    if (!conteudo) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
        name: 'Confirmação de véspera',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      }).catch(() => {});
    }
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: conteudo.titulo, body: conteudo.corpo, data: { vespera: true } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: quando, channelId: CANAL_ANDROID },
    });
    await AsyncStorage.setItem(VESPERA_NOTIF_KEY, id);
    await AsyncStorage.setItem(VESPERA_AVISO_DIA_KEY, JSON.stringify({ dia: diaLocalDoAparelho(quando), em: quando.getTime() }));
  } catch {
    // best-effort: lembrete nunca trava o sync
  }
}
