import { supabase } from './supabase';
import { PAGAMENTOS_URL } from '../config';

/**
 * pixCreditos.ts — compra de CRÉDITOS OLLI por Pix (gateway Mercado Pago), app-side.
 *
 * O app NUNCA fala direto com o Mercado Pago nem vê o token: fala com o worker
 * (mesmo de pagamentos, /mp/*) usando o JWT do Supabase — igual ao Stripe.
 * O worker cria a cobrança, e o CRÉDITO só é concedido pelo WEBHOOK após o
 * pagamento confirmar (o app nunca credita otimista). Aqui só: listar pacotes,
 * criar a cobrança (recebe QR + copia-e-cola) e consultar o status (polling de
 * UX — a fonte de verdade é o saldo, que o webhook atualiza). Nada lança.
 */

export interface PacotePix {
  id: string;
  nome: string;
  creditos: number;
  /** Preço em centavos. */
  amount: number;
}

export interface CobrancaPix {
  id: string;
  /** Pix copia-e-cola (BR Code EMV). */
  brCode: string;
  /** PNG data URI do QR (fallback; o app renderiza o QR localmente do brCode). */
  brCodeBase64: string;
  status: string;
  expiresAt: string | null;
  pacote: PacotePix;
}

export interface StatusPix {
  status: string;
  pago: boolean;
}

/** Token de acesso da sessão atual (ou null se deslogado / sem client). */
async function getToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** fetch com timeout (rede móvel instável pendura a Promise pra sempre sem isto).
 *  O abort vira exceção → cai no catch de cada função (que devolve null/[]). */
async function fetchComTimeout(url: string, opts: RequestInit = {}, ms = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function pacoteValido(p: any): p is PacotePix {
  return (
    p && typeof p.id === 'string' &&
    typeof p.nome === 'string' &&
    typeof p.creditos === 'number' &&
    typeof p.amount === 'number'
  );
}

/** Catálogo de pacotes (fonte única no worker). [] em qualquer falha. */
export async function getPacotesPix(): Promise<PacotePix[]> {
  if (!PAGAMENTOS_URL) return [];
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/mp/pacotes`);
    if (!r.ok) return [];
    const d = await r.json();
    if (!d || d.ok !== true || !Array.isArray(d.pacotes)) return [];
    return d.pacotes.filter(pacoteValido);
  } catch {
    return [];
  }
}

/** Cria a cobrança Pix de um pacote. null em falha (sem token, rede, worker). */
export async function criarCobrancaPix(pacoteId: string): Promise<CobrancaPix | null> {
  if (!PAGAMENTOS_URL) return null;
  const token = await getToken();
  if (!token) return null;
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/mp/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pacote: pacoteId }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || d.ok !== true || typeof d.brCode !== 'string' || !d.brCode || !pacoteValido(d.pacote)) {
      return null;
    }
    return {
      id: typeof d.id === 'string' ? d.id : '',
      brCode: d.brCode,
      brCodeBase64: typeof d.brCodeBase64 === 'string' ? d.brCodeBase64 : '',
      status: typeof d.status === 'string' ? d.status : 'PENDING',
      expiresAt: typeof d.expiresAt === 'string' ? d.expiresAt : null,
      pacote: d.pacote,
    };
  } catch {
    return null;
  }
}

/**
 * Status de uma cobrança (polling de UX). null = indisponível (não confundir com
 * "não pago": o chamador continua o polling em vez de concluir).
 */
export async function checarStatusPix(id: string): Promise<StatusPix | null> {
  if (!PAGAMENTOS_URL || !id) return null;
  const token = await getToken();
  if (!token) return null;
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/mp/status?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || d.ok !== true) return null;
    return { status: typeof d.status === 'string' ? d.status : 'PENDING', pago: d.pago === true };
  } catch {
    return null;
  }
}

/** "R$ 24,90" a partir de centavos. */
export function formatarPrecoCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
