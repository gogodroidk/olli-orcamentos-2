/**
 * Rastreio de telas com tempo de permanência.
 *
 * Alimenta `public.user_tela_log` (ver migration 20261022100000). Só manda o NOME da
 * rota (sem params, ids ou texto) e a duração. Acumula e descarrega em lote para não
 * gerar uma chamada por navegação. Best-effort: nunca lança nem bloqueia a UX.
 *
 * Desligado por padrão: só roda com `EXPO_PUBLIC_RASTREIO_TELAS=1` (a migration precisa
 * estar aplicada antes; sem ela o RPC falha e o lote é descartado em silêncio).
 */
import { Platform } from 'react-native';
import { getCurrentUser, supabase } from './supabase';

const LIGADO = process.env.EXPO_PUBLIC_RASTREIO_TELAS === '1';
const LOTE_MAX = 20;
const TELA_VALIDA = /^[A-Za-z0-9_]{1,40}$/;
const DURACAO_MAX_MS = 4 * 60 * 60 * 1000;

interface Item {
  tela: string;
  acao?: string;
  duracao_ms: number;
}

let fila: Item[] = [];
let telaAtual: string | null = null;
let entrouEm = 0;
let descarregando = false;

function plataforma(): string {
  return ['web', 'ios', 'android'].includes(Platform.OS) ? Platform.OS : 'unknown';
}

async function descarregar(): Promise<void> {
  if (descarregando || fila.length === 0 || !supabase) return;
  descarregando = true;
  const lote = fila.splice(0, LOTE_MAX);
  try {
    if (!(await getCurrentUser())) return; // deslogado: descarta, nada a ligar a ninguém.
    await supabase.rpc('registrar_telas_usuario', { p_itens: lote, p_plataforma: plataforma() });
  } catch {
    // best-effort.
  } finally {
    descarregando = false;
  }
}

function fecharTelaAtual(agora: number): void {
  if (!telaAtual) return;
  const duracao_ms = Math.min(Math.max(agora - entrouEm, 0), DURACAO_MAX_MS);
  fila.push({ tela: telaAtual, duracao_ms });
  telaAtual = null;
}

/** Chame a cada mudança de rota com o NOME da rota (nunca a URL). */
export function telaMudou(nome: string | undefined): void {
  if (!LIGADO || !nome || !TELA_VALIDA.test(nome) || nome === telaAtual) return;
  const agora = Date.now();
  fecharTelaAtual(agora);
  telaAtual = nome;
  entrouEm = agora;
  if (fila.length >= LOTE_MAX / 2) void descarregar();
}

/** Toque relevante dentro da tela atual (ex.: 'salvar_orcamento'). Sem conteúdo. */
export function toqueRegistrado(acao: string): void {
  if (!LIGADO || !telaAtual || !/^[a-z0-9_]{1,40}$/.test(acao)) return;
  fila.push({ tela: telaAtual, acao, duracao_ms: 0 });
  if (fila.length >= LOTE_MAX) void descarregar();
}

/** App foi para segundo plano: fecha a tela, grava e descarrega. */
export function appEmSegundoPlano(): void {
  if (!LIGADO) return;
  const nome = telaAtual;
  fecharTelaAtual(Date.now());
  void descarregar().finally(() => {
    // ao voltar, a mesma tela recomeça a contar.
    if (nome) {
      telaAtual = nome;
      entrouEm = Date.now();
    }
  });
}

/** Logout: descarta o que não foi enviado (não pode vazar para o próximo usuário). */
export function resetarRastreioTelas(): void {
  fila = [];
  telaAtual = null;
}
