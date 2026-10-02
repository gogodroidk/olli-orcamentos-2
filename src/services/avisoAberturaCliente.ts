/**
 * avisoAberturaCliente.ts — "Cliente abriu seu orçamento agora".
 *
 * Com o app ABERTO e a conta logada, escuta (Supabase Realtime, plano gratuito)
 * os sinais novos dos links do dono em `orcamento_eventos` (migration
 * 20261003102000). A cada evento:
 *  - avisa as telas abertas (lista e detalhe releem o termômetro) — `emitirSinalDoCliente`;
 *  - se for uma ABERTURA recente de proposta esperando resposta, e o plano libera
 *    o termômetro (Pro), dispara a notificação local na hora — uma por orçamento a
 *    cada 30 min (regra pura `decidirAvisoAbertura`, testada).
 *
 * HONESTIDADE: não é push do servidor. Com o app fechado ou no bolso por muito
 * tempo, nada chega (a conexão do Realtime só existe com o app ativo) — e nenhum
 * texto promete "aviso na hora" fora do app. O app no segundo plano desliga a
 * escuta; ao voltar, liga de novo.
 *
 * O payload do Realtime é usado só para saber QUAL orçamento e QUE tipo; o resto
 * (nome, número, valor) vem do banco LOCAL. A RLS do Realtime garante que cada
 * dono recebe só as linhas dele. Sem a migration, a inscrição não recebe nada.
 */
import { AppState, Platform, type AppStateStatus } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { acessoRecursoAgora } from './planos';
import { getOrcamento } from '../database/database';
import { emitirSinalDoCliente } from './termometro';
import { decidirAvisoAbertura } from './termometroRegra';

let ultimosAvisos: Record<string, number> = {};

async function tratarEvento(linha: Record<string, unknown> | null | undefined): Promise<void> {
  try {
    const orcamentoId = typeof linha?.orcamento_id === 'string' ? linha.orcamento_id : '';
    const tipo = typeof linha?.tipo === 'string' ? linha.tipo : '';
    const em = typeof linha?.criado_em === 'string' ? linha.criado_em : '';
    if (!orcamentoId) return;
    emitirSinalDoCliente(orcamentoId);
    if (tipo !== 'abertura') return;
    if ((await acessoRecursoAgora('termometro_orcamento')) !== 'liberado') return;
    const orc = await getOrcamento(orcamentoId).catch(() => null);
    const { aviso, ultimosAvisos: novos } = decidirAvisoAbertura({ orcamentoId, tipo, em }, orc, ultimosAvisos, new Date());
    ultimosAvisos = novos;
    if (!aviso) return;
    // Import tardio: expo-notifications só no nativo, e o módulo de follow-up
    // tem a fila e o canal Android de "respostas do cliente".
    const { avisarAberturaAgora } = await import('./followUpLembretes');
    await avisarAberturaAgora(aviso.titulo, aviso.corpo, orcamentoId);
  } catch {
    // aviso é best-effort: nunca derruba o app
  }
}

/**
 * Liga a escuta. Chamado uma vez no boot (App.tsx). Devolve o cancelamento.
 * Só no nativo (no navegador não há notificação local).
 */
export function iniciarAvisoAberturaCliente(): () => void {
  const cliente = supabase;
  if (!cliente || Platform.OS === 'web') return () => {};

  let userId: string | null = null;
  let ativo = AppState.currentState === 'active';
  let canal: RealtimeChannel | null = null;
  let canalDe: string | null = null;

  const desligar = () => {
    if (!canal) return;
    const c = canal;
    canal = null;
    canalDe = null;
    cliente.removeChannel(c).catch(() => {});
  };

  const ajustar = () => {
    try {
      if (!userId || !ativo) {
        desligar();
        return;
      }
      if (canal && canalDe === userId) return;
      desligar();
      canalDe = userId;
      canal = cliente
        .channel(`orcamento-eventos-${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'orcamento_eventos', filter: `user_id=eq.${userId}` },
          (payload) => { void tratarEvento(payload?.new as Record<string, unknown>); },
        )
        .subscribe();
    } catch {
      canal = null;
      canalDe = null;
    }
  };

  cliente.auth.getSession()
    .then(({ data }) => {
      userId = data.session?.user?.id ?? null;
      ajustar();
    })
    .catch(() => {});

  const { data: auth } = cliente.auth.onAuthStateChange((evento, sessao) => {
    const novo = sessao?.user?.id ?? null;
    if (evento === 'SIGNED_OUT' || novo !== userId) ultimosAvisos = {};
    userId = novo;
    // Nada de chamar o auth DENTRO do callback do auth: só agenda o ajuste.
    setTimeout(ajustar, 0);
  });

  const appState = AppState.addEventListener('change', (estado: AppStateStatus) => {
    ativo = estado === 'active';
    ajustar();
  });

  return () => {
    appState.remove();
    auth.subscription.unsubscribe();
    desligar();
  };
}
