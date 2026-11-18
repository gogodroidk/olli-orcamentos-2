/**
 * NFS-e (Fase 1) — cliente do worker (`/nfse/*`). O app nunca fala com o provedor: quem emite é o servidor, e só com a
 * flag NFSE_ENABLED=1 lá. Nada aqui lança: `null`/`falha` = indisponível. Detalhe: worker/src/nfse.js e docs/NFSE.md.
 */
import { PAGAMENTOS_URL } from '../config';
import { supabase } from './supabase';
import type { PedidoNfse } from './nfseRegras';

export interface NotaFiscalApp {
  orcamentoId: string;
  status: 'processando' | 'autorizada' | 'erro';
  numero: string | null;
  chave: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  erro: string | null;
  ambiente: 'simulado' | 'homologacao' | 'producao' | null;
}

export type ResultadoEmissao =
  | { ok: true; nota: NotaFiscalApp }
  | { ok: false; erro: 'plano_insuficiente' | 'perfil_fiscal_incompleto' | 'pedido_invalido' | 'desligada' | 'falha'; campos?: string[] };

async function getToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function chamar(caminho: string, init: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(`${PAGAMENTOS_URL}${caminho}`, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

const VALIDADE_FLAG_MS = 10 * 60 * 1000;
let cacheFlag: { valor: boolean; em: number } | null = null;

/** O servidor confirmou que a NFS-e está ligada? Falha de rede = false (sem confirmação, sem botão). Cache de 10 min. */
export async function nfseDisponivel(): Promise<boolean> {
  if (!PAGAMENTOS_URL) return false;
  if (cacheFlag && Date.now() - cacheFlag.em < VALIDADE_FLAG_MS) return cacheFlag.valor;
  try {
    const r = await chamar('/nfse/config', {}, 8000);
    const d = r.ok ? await r.json() : null;
    const valor = d?.ok === true && d?.nfse === true;
    cacheFlag = { valor, em: Date.now() };
    return valor;
  } catch {
    return false; // não guarda no cache: tenta de novo na próxima tela
  }
}

function lerNota(d: unknown): NotaFiscalApp | null {
  const n = d as Partial<NotaFiscalApp> | null;
  if (!n || typeof n.orcamentoId !== 'string' || !['processando', 'autorizada', 'erro'].includes(String(n.status))) return null;
  const url = (v: unknown) => (typeof v === 'string' && v.startsWith('https://') ? v : null);
  return {
    orcamentoId: n.orcamentoId,
    status: n.status as NotaFiscalApp['status'],
    numero: typeof n.numero === 'string' ? n.numero : null,
    chave: typeof n.chave === 'string' ? n.chave : null,
    pdfUrl: url(n.pdfUrl),
    xmlUrl: url(n.xmlUrl),
    erro: typeof n.erro === 'string' ? n.erro : null,
    ambiente: n.ambiente ?? null,
  };
}

export async function emitirNfse(pedido: PedidoNfse): Promise<ResultadoEmissao> {
  const token = await getToken();
  if (!PAGAMENTOS_URL || !token) return { ok: false, erro: 'falha' };
  try {
    const r = await chamar('/nfse/emitir', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(pedido) });
    const d = await r.json().catch(() => null);
    const nota = d?.ok === true ? lerNota(d.nota) : null;
    if (nota) return { ok: true, nota };
    if (d?.erro === 'plano_insuficiente') return { ok: false, erro: 'plano_insuficiente' };
    if (d?.erro === 'perfil_fiscal_incompleto') return { ok: false, erro: 'perfil_fiscal_incompleto', campos: Array.isArray(d.campos) ? d.campos.map(String) : [] };
    if (d?.erro === 'pedido_invalido') return { ok: false, erro: 'pedido_invalido', campos: Array.isArray(d.campos) ? d.campos.map(String) : [] };
    if (d?.erro === 'nfse_desligada') return { ok: false, erro: 'desligada' };
    return { ok: false, erro: 'falha' };
  } catch {
    return { ok: false, erro: 'falha' };
  }
}

export async function statusNfse(orcamentoId: string): Promise<NotaFiscalApp | null> {
  const token = await getToken();
  if (!PAGAMENTOS_URL || !token) return null;
  try {
    const r = await chamar(`/nfse/status?orcamento=${encodeURIComponent(orcamentoId)}`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json().catch(() => null);
    return d?.ok === true ? lerNota(d.nota) : null;
  } catch {
    return null;
  }
}
