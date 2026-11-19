import { track, Eventos } from './analytics';
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
  /** Cupom de influenciador aplicado: o desconto ESCRITO e o valor cobrado (`por`). Ausente = sem cupom. */
  desconto?: { codigo: string; pct: number; de: number; por: number; texto: string };
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

/**
 * `cupom` (opcional) pede o desconto de influenciador. Recusado (esgotado, expirado, já usou, indicação…),
 * o servidor NÃO gera Pix: `aoRecusa` recebe o motivo em palavras e o retorno é null (nunca cobra cheio escondido).
 */
export async function criarPixPlano(plano: PlanoPixKey, cupom?: string | null, aoRecusa?: (texto: string) => void): Promise<CobrancaPixPlano | null> {
  if (!PAGAMENTOS_URL) return null;
  const token = await getToken();
  if (!token) return null;
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/abacate/plano/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(cupom ? { plano, cupom } : { plano }),
    });
    if (!r.ok) {
      if (cupom && r.status === 409) {
        const e: any = await r.json().catch(() => null);
        if (e?.erro === 'cupom_recusado' && typeof e.texto === 'string') aoRecusa?.(e.texto);
      }
      return null;
    }
    const d = await r.json();
    if (d?.ok !== true || typeof d.id !== 'string' || typeof d.brCode !== 'string' || !d.brCode) return null;
    if (!d.plano || typeof d.plano.valor !== 'number' || typeof d.plano.meses !== 'number') return null;
    track(Eventos.pixGerado); // funil: só o nome do evento (sem plano, valor ou id)
    return {
      id: d.id,
      brCode: d.brCode,
      brCodeBase64: typeof d.brCodeBase64 === 'string' ? d.brCodeBase64 : '',
      expiresAt: typeof d.expiresAt === 'string' ? d.expiresAt : null,
      plano: d.plano,
      ...(d.desconto && typeof d.desconto.por === 'number' && typeof d.desconto.texto === 'string' ? { desconto: d.desconto } : {}),
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

/* ─────────────  PIX AUTOMÁTICO (renova sozinho) — Pro mensal  ─────────────
 * Assinatura recorrente no Pix, via AbacatePay (rotas `/abacate/assinatura/*` do worker, ver
 * worker/src/abacatePixAutomatico.js). Como o Pix avulso: o app nunca fala com a AbacatePay e quem libera o plano
 * é o SERVIDOR. A autorização acontece numa PÁGINA da AbacatePay (QR que vale 1 h, lido no app do banco): `criar`
 * devolve a URL. Nada aqui lança: `null` = indisponível — nunca confundir com "não ativa". DESLIGADO por padrão no
 * servidor: `pixAutomaticoDisponivel()` só é true quando o worker confirma a flag.
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
