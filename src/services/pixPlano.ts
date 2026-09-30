import { supabase } from './supabase';
import { PAGAMENTOS_URL } from '../config';

/**
 * pixPlano.ts — pagar PERÍODO de plano (Pro/Empresa) por Pix, via AbacatePay.
 *
 * O app nunca fala com a AbacatePay nem vê a chave: fala com o worker
 * (`/abacate/*`, ver worker/src/abacate.js) com o JWT do Supabase. Quem libera o
 * plano é o SERVIDOR, depois de ler a cobrança paga na AbacatePay — o app nunca
 * libera otimista. Pix não renova sozinho: é avulso, 1 ou 12 meses.
 *
 * Nada aqui lança. `null` = indisponível (sem sessão, rede, worker) — o chamador
 * nunca confunde isso com "não pago".
 */

/** Chaves que o worker aceita (catálogo PLANO_PIX em worker/src/mercadopago.js). */
export type PlanoPixKey = 'pro_mensal' | 'pro_anual' | 'empresa_mensal' | 'empresa_anual';

export interface CobrancaPixPlano {
  id: string;
  /** Pix copia-e-cola (BR Code EMV). */
  brCode: string;
  /** PNG data URI do QR gerado pela AbacatePay ('' se não veio). */
  brCodeBase64: string;
  expiresAt: string | null;
  plano: { id: PlanoPixKey; nome: string; meses: number; valor: number };
}

export interface StatusPixPlano {
  pago: boolean;
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

async function fetchComTimeout(url: string, opts: RequestInit = {}, ms = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export function chavePixPlano(plano: 'pro' | 'empresa', periodo: 'mensal' | 'anual'): PlanoPixKey {
  return `${plano}_${periodo}` as PlanoPixKey;
}

/**
 * O Pix está ligado de verdade? `false` quando o worker diz que está desligado
 * (sem chave, ou chave de teste em produção) — nesse caso o app não mostra o botão.
 * `false` também em falha de rede: sem confirmação, não oferece caminho de dinheiro.
 */
export async function pixPlanoDisponivel(): Promise<boolean> {
  if (!PAGAMENTOS_URL) return false;
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/abacate/config`);
    if (!r.ok) return false;
    const d = await r.json();
    return d?.ok === true && d?.pix === true;
  } catch {
    return false;
  }
}

export async function criarPixPlano(plano: PlanoPixKey): Promise<CobrancaPixPlano | null> {
  if (!PAGAMENTOS_URL) return null;
  const token = await getToken();
  if (!token) return null;
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/abacate/plano/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plano }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (d?.ok !== true || typeof d.id !== 'string' || typeof d.brCode !== 'string' || !d.brCode) return null;
    if (!d.plano || typeof d.plano.valor !== 'number' || typeof d.plano.meses !== 'number') return null;
    return {
      id: d.id,
      brCode: d.brCode,
      brCodeBase64: typeof d.brCodeBase64 === 'string' ? d.brCodeBase64 : '',
      expiresAt: typeof d.expiresAt === 'string' ? d.expiresAt : null,
      plano: d.plano,
    };
  } catch {
    return null;
  }
}

/** Polling de UX. `pago:true` = o servidor JÁ liberou o plano. */
export async function checarPixPlano(id: string): Promise<StatusPixPlano | null> {
  if (!PAGAMENTOS_URL || !id) return null;
  const token = await getToken();
  if (!token) return null;
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/abacate/status?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (d?.ok !== true) return null;
    return { pago: d.pago === true };
  } catch {
    return null;
  }
}
