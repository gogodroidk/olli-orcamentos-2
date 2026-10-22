import { limparProps, nomeEventoSeguro } from './analyticsScrub';
import { getCurrentUser, supabase } from './supabase';

/**
 * Espelho dos eventos de `track()` no NOSSO banco (tabela `app_eventos`).
 * Sem terceiro: é o que mede o app enquanto a chave do PostHog não existir.
 * Props passam pela mesma faxina de PII do remoto. Em lote (a cada 10 s ou 20
 * eventos) para não abrir uma requisição por toque. NUNCA lança.
 */
const LOTE_MAX = 20;
const INTERVALO_MS = 10_000;

type Item = { e: string; p: Record<string, unknown> };

/**
 * TRAVA DE LIBERAÇÃO: nasce DESLIGADO. Só liga com EXPO_PUBLIC_TELEMETRIA_SERVIDOR=1,
 * depois que a política de privacidade (Dr. Paulo) disser que o uso do app vai ao
 * servidor. Desligado, nada sai do aparelho (o SQLite local segue igual).
 */
export function telemetriaServidorLigada(): boolean {
  return process.env.EXPO_PUBLIC_TELEMETRIA_SERVIDOR === '1';
}

let fila: Item[] = [];
// Sobe a cada logout: lote em voo de uma conta nunca é gravado na sessão da próxima.
let geracao = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export function enfileirarEventoServidor(evento: string, props?: Record<string, unknown>): void {
  try {
    if (!supabase || !telemetriaServidorLigada()) return;
    fila.push({ e: nomeEventoSeguro(evento), p: limparProps(props) });
    if (fila.length >= LOTE_MAX) {
      void descarregarEventosServidor();
    } else if (!timer) {
      timer = setTimeout(() => void descarregarEventosServidor(), INTERVALO_MS);
    }
  } catch {
    // analytics jamais quebra a UX
  }
}

export async function descarregarEventosServidor(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const lote = fila.splice(0, 50);
  if (lote.length === 0 || !supabase) return;
  const minha = geracao;
  try {
    const user = await getCurrentUser();
    if (!user?.id || minha !== geracao) return; // sem dono, ou a conta mudou: descarta
    const { Platform } = require('react-native');
    const plataforma = ['web', 'ios', 'android'].includes(Platform.OS) ? Platform.OS : 'unknown';
    if (minha !== geracao) return;
    const { error } = await supabase.rpc('registrar_eventos_app', { p_eventos: lote, p_plataforma: plataforma });
    // falha de rede: devolve até um teto, sem crescer sem limite (e só na mesma conta)
    if (error && minha === geracao && fila.length < 200) fila.unshift(...lote);
  } catch {
    // best-effort
  }
}

/** Logout: não deixa eventos de uma conta vazarem para a próxima. */
export function limparFilaEventosServidor(): void {
  geracao += 1;
  fila = [];
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
