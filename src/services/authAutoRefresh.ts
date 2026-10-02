import { AppState, type AppStateStatus, Platform } from 'react-native';
import { supabase } from './supabase';

let iniciado = false;
/** O ticker do auth-js está rodando? (evita religar a cada 'active' repetido). */
let ligado = false;

/**
 * Mantem a renovacao da sessao ativa apenas enquanto o aplicativo esta em
 * primeiro plano. O sistema operacional pode suspender timers no background;
 * ao voltar, religamos o refresh antes de o JWT vencer e parecer um logout.
 *
 * Fica num modulo exclusivamente nativo porque o painel Vite substitui
 * `react-native` por um stub intencional e nao deve carregar AppState.
 *
 * Ritmo do refresh (rejeicao da Play, 02/10/2026): o ticker do auth-js roda a
 * cada 30 s e so renova perto do vencimento. O que garante o piso de 30 s entre
 * renovacoes mesmo com o relogio do celular errado esta no storage da sessao
 * (services/sessaoRelogio.ts: prazo no relogio do aparelho + piso de leitura) e
 * no fetch do cliente (services/refreshResiliente.ts: falha passageira espera
 * >= 30 s e nunca vira logout). Aqui so evitamos religar o ticker a cada evento
 * 'active' repetido — `startAutoRefresh` dispara um tick imediato a cada chamada,
 * e o Android emite 'active' de novo ao fechar dialogos de permissao.
 */
export function iniciarAuthAutoRefreshNativo(): () => void {
  if (!supabase || Platform.OS === 'web' || iniciado) return () => {};

  iniciado = true;
  const cliente = supabase;
  const ajustarRefresh = (estado: AppStateStatus) => {
    const ativo = estado === 'active';
    if (ativo === ligado) return;
    ligado = ativo;
    if (estado === 'active') cliente.auth.startAutoRefresh();
    else cliente.auth.stopAutoRefresh();
  };

  ajustarRefresh(AppState.currentState);
  const assinatura = AppState.addEventListener('change', ajustarRefresh);

  return () => {
    assinatura.remove();
    cliente.auth.stopAutoRefresh();
    ligado = false;
    iniciado = false;
  };
}
