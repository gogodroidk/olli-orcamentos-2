import { AppState, type AppStateStatus, Platform } from 'react-native';
import { supabase } from './supabase';

let iniciado = false;

/**
 * Mantem a renovacao da sessao ativa apenas enquanto o aplicativo esta em
 * primeiro plano. O sistema operacional pode suspender timers no background;
 * ao voltar, religamos o refresh antes de o JWT vencer e parecer um logout.
 *
 * Fica num modulo exclusivamente nativo porque o painel Vite substitui
 * `react-native` por um stub intencional e nao deve carregar AppState.
 */
export function iniciarAuthAutoRefreshNativo(): () => void {
  if (!supabase || Platform.OS === 'web' || iniciado) return () => {};

  iniciado = true;
  const cliente = supabase;
  const ajustarRefresh = (estado: AppStateStatus) => {
    if (estado === 'active') cliente.auth.startAutoRefresh();
    else cliente.auth.stopAutoRefresh();
  };

  ajustarRefresh(AppState.currentState);
  const assinatura = AppState.addEventListener('change', ajustarRefresh);

  return () => {
    assinatura.remove();
    cliente.auth.stopAutoRefresh();
    iniciado = false;
  };
}
