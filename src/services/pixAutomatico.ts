import { supabase } from './supabase';
import { PAGAMENTOS_URL } from '../config';

/**
 * pixAutomatico.ts — Pix Automático (assinatura recorrente no Pix) do Pro mensal, via AbacatePay.
 * Rotas `/abacate/assinatura/*` do worker (ver worker/src/abacatePixAutomatico.js). Como o Pix avulso
 * (pixPlano.ts): o app nunca fala com a AbacatePay e quem libera o plano é o SERVIDOR.
 *
 * A autorização acontece numa PÁGINA da AbacatePay (QR que vale 1 h, lido no app do banco): `criar` devolve a URL.
 * Nada aqui lança: `null` = indisponível (sem sessão, rede, worker) — nunca confundir com "não ativa".
 * Desligado por padrão no servidor: `pixAutomaticoDisponivel()` só é true quando o worker confirma a flag.
 */

export interface CheckoutPixAutomatico {
  checkoutId: string;
  url: string;
}
export type ErroPixAutomatico = 'plano_ainda_ativo' | 'assinatura_ja_ativa' | 'desligado' | 'falha';
export interface EstadoPixAutomatico {
  ativa: boolean;
  /** ISO: até quando o período já pago vale. */
  pagoAte: string | null;
}

async function getToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function fetchComTimeout(url: string, opts: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** O servidor confirmou que a venda do Pix Automático está ligada? Falha de rede = não (sem confirmação, sem botão). */
export async function pixAutomaticoDisponivel(): Promise<boolean> {
  if (!PAGAMENTOS_URL) return false;
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/abacate/config`);
    if (!r.ok) return false;
    const d = await r.json();
    return d?.ok === true && d?.pixAutomatico === true;
  } catch {
    return false;
  }
}

export async function criarPixAutomatico(): Promise<{ ok: true; checkout: CheckoutPixAutomatico } | { ok: false; erro: ErroPixAutomatico; ate?: string }> {
  if (!PAGAMENTOS_URL) return { ok: false, erro: 'falha' };
  const token = await getToken();
  if (!token) return { ok: false, erro: 'falha' };
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/abacate/assinatura/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plano: 'pro_mensal' }),
    });
    const d = await r.json().catch(() => null);
    if (r.ok && d?.ok === true && typeof d.checkoutId === 'string' && typeof d.url === 'string' && d.url.startsWith('https://')) {
      return { ok: true, checkout: { checkoutId: d.checkoutId, url: d.url } };
    }
    if (d?.erro === 'plano_ainda_ativo' || d?.erro === 'assinatura_ja_ativa') return { ok: false, erro: d.erro, ate: typeof d.ate === 'string' ? d.ate : undefined };
    if (d?.erro === 'pix_automatico_desligado') return { ok: false, erro: 'desligado' };
    return { ok: false, erro: 'falha' };
  } catch {
    return { ok: false, erro: 'falha' };
  }
}

/** Polling de UX depois de abrir a página de autorização. `ativa:true` = o servidor JÁ liberou o Pro. */
export async function checarPixAutomatico(checkoutId: string): Promise<{ ativa: boolean } | null> {
  if (!PAGAMENTOS_URL || !checkoutId) return null;
  const token = await getToken();
  if (!token) return null;
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/abacate/assinatura/status?checkout=${encodeURIComponent(checkoutId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.ok === true ? { ativa: d.ativa === true } : null;
  } catch {
    return null;
  }
}

export async function estadoPixAutomatico(): Promise<EstadoPixAutomatico | null> {
  if (!PAGAMENTOS_URL) return null;
  const token = await getToken();
  if (!token) return null;
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/abacate/assinatura/estado`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const d = await r.json();
    if (d?.ok !== true) return null;
    return { ativa: d.ativa === true, pagoAte: typeof d.pagoAte === 'string' ? d.pagoAte : null };
  } catch {
    return null;
  }
}

/** Cancela a renovação automática (revoga a autorização no banco). `ate` = até quando o Pro segue valendo. */
export async function cancelarPixAutomatico(): Promise<{ ate: string | null } | null> {
  if (!PAGAMENTOS_URL) return null;
  const token = await getToken();
  if (!token) return null;
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/abacate/assinatura/cancelar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.ok === true ? { ate: typeof d.ate === 'string' ? d.ate : null } : null;
  } catch {
    return null;
  }
}
