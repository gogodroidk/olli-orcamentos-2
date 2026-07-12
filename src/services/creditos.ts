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
