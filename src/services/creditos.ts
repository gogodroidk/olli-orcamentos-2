/**
 * creditos.ts — saldo de Créditos OLLI, app-side (F2 da estratégia).
 *
 * O saldo é derivado do ledger imutável (public.credit_ledger, migration 20260720)
 * via a função RPC `meu_saldo_creditos()` (SECURITY INVOKER — a RLS do ledger já
 * restringe o usuário às próprias linhas; soma só de auth.uid()).
 * O app SÓ LÊ — a concessão/consumo é sempre do worker (service_role); o usuário
 * nunca escreve no ledger (senão se daria créditos de graça).
 *
 * 3 ESTADOS (regra "erro vira vazio"): `getMeuSaldo` devolve o número, ou `null`
 * em indisponibilidade (offline/erro/sem nuvem) — NUNCA 0, porque 0 é um saldo
 * confirmado (zerado), diferente de "não sei". Nunca lança.
 */
import { supabase } from './supabase';

/** Saldo de créditos do usuário. `null` = indisponível (não confundir com 0). */
export async function getMeuSaldo(): Promise<number | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('meu_saldo_creditos');
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

/** "1.234 créditos" / "1 crédito" / "0 créditos". */
export function formatarCreditos(n: number): string {
  return `${n.toLocaleString('pt-BR')} crédito${n === 1 ? '' : 's'}`;
}

/** Uma linha do extrato de créditos (o app SÓ LÊ; a RLS restringe ao próprio usuário). */
export interface LancamentoCredito {
  delta: number;
  origem: string;
  descricao: string;
  criadoEm: string;
}

/** Rótulo amigável da origem de um lançamento (para o extrato). */
export function rotuloOrigemCredito(origem: string): string {
  switch (origem) {
    case 'stripe': return 'Recarga (cartão)';
    case 'pix': return 'Recarga (Pix)';
    case 'iap': return 'Recarga (app)';
    case 'promo': return 'Bônus';
    case 'referral': return 'Indicação';
    case 'mesada': return 'Créditos do plano';
    case 'consumo': return 'Uso';
    case 'ajuste': return 'Ajuste';
    default: return origem;
  }
}

/**
 * Extrato de créditos do usuário (mais novo primeiro, até `limite`). `null` =
 * indisponível (offline/erro/sem nuvem) — não confundir com "extrato vazio" ([]).
 * Nunca lança. Lê direto o ledger; a policy `credit_ledger_select_own` garante que
 * o usuário só vê as PRÓPRIAS linhas.
 */
export async function getMeuExtrato(limite = 50): Promise<LancamentoCredito[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('credit_ledger')
      .select('delta, origem, descricao, criado_em')
      .order('criado_em', { ascending: false })
      .limit(limite);
    if (error || !Array.isArray(data)) return null;
    return data.map((r: any) => ({
      delta: typeof r.delta === 'number' ? r.delta : 0,
      origem: typeof r.origem === 'string' ? r.origem : 'ajuste',
      descricao: typeof r.descricao === 'string' ? r.descricao : '',
      criadoEm: typeof r.criado_em === 'string' ? r.criado_em : '',
    }));
  } catch {
    return null;
  }
}
