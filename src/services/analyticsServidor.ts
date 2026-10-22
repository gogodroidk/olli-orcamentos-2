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

let fila: Item[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function enfileirarEventoServidor(evento: string, props?: Record<string, unknown>): void {
  try {
    if (!supabase) return;
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
  try {
    const user = await getCurrentUser();
    if (!user?.id) return; // sem sessão não há dono: descarta
    const { Platform } = require('react-native');
    const plataforma = ['web', 'ios', 'android'].includes(Platform.OS) ? Platform.OS : 'unknown';
    const { error } = await supabase.rpc('registrar_eventos_app', { p_eventos: lote, p_plataforma: plataforma });
    // falha de rede: devolve até um teto, sem crescer sem limite
    if (error && fila.length < 200) fila.unshift(...lote);
  } catch {
    // best-effort
  }
}

/** Logout: não deixa eventos de uma conta vazarem para a próxima. */
export function limparFilaEventosServidor(): void {
  fila = [];
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
