/**
 * O que o app faz com a resposta de `ativar_assinatura_ical` / `revogar_assinatura_ical`.
 * Puro: quem chama passa o RPC do Supabase (celular ou painel). Não guarda o token.
 */

import { urlsAssinaturaIcal } from './icsAgenda.ts';

export type EscopoIcal = 'propria' | 'equipe';

export type ResultadoAtivarIcal =
  | { estado: 'pronto'; https: string; webcal: string; escopo: EscopoIcal; token: string }
  | { estado: 'indisponivel' }
  | { estado: 'sem_acesso' }
  | { estado: 'sem_sessao' }
  | { estado: 'erro' };

export interface ErroRpc {
  message?: string;
  code?: string;
}

export interface ClienteRpcIcal {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: ErroRpc | null }>;
}

export function classificarErroAssinatura(message: string, code?: string): Exclude<ResultadoAtivarIcal, { estado: 'pronto' }>['estado'] {
  const texto = message || '';
  if (
    code === 'PGRST202' ||
    /ativar_assinatura_ical|revogar_assinatura_ical|schema cache|Could not find the function|does not exist/i.test(texto)
  ) {
    return 'indisponivel';
  }
  if (texto.includes('sem_acesso')) return 'sem_acesso';
  if (texto.includes('sem_sessao')) return 'sem_sessao';
  return 'erro';
}

export function lerRespostaAssinatura(data: unknown): { token: string; escopo: EscopoIcal } | null {
  if (!data || typeof data !== 'object') return null;
  const token = (data as { token?: unknown }).token;
  const escopo = (data as { escopo?: unknown }).escopo;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  if (escopo !== 'propria' && escopo !== 'equipe') return null;
  return { token, escopo };
}

/**
 * Pede (ou reaproveita) o link. `baseHttps` é a origem do worker de links,
 * sempre https. O token só volta para quem chamou, para montar a URL na tela.
 */
export async function ativarAssinaturaIcal(
  cliente: ClienteRpcIcal,
  baseHttps: string,
  escopo?: EscopoIcal,
): Promise<ResultadoAtivarIcal> {
  const args: Record<string, unknown> = {};
  if (escopo) args.p_escopo = escopo;
  let data: unknown;
  let error: ErroRpc | null;
  try {
    const resposta = await cliente.rpc('ativar_assinatura_ical', args);
    data = resposta.data;
    error = resposta.error;
  } catch {
    return { estado: 'erro' };
  }
  if (error) return { estado: classificarErroAssinatura(error.message ?? '', error.code) };
  const lido = lerRespostaAssinatura(data);
  if (!lido) return { estado: 'erro' };
  const urls = urlsAssinaturaIcal(baseHttps, lido.token);
  if (!urls) return { estado: 'erro' };
  return { estado: 'pronto', ...urls, escopo: lido.escopo, token: lido.token };
}

export async function revogarAssinaturaIcal(
  cliente: ClienteRpcIcal,
  escopo: EscopoIcal,
): Promise<'ok' | 'indisponivel' | 'sem_sessao' | 'erro'> {
  let error: ErroRpc | null;
  let data: unknown;
  try {
    const resposta = await cliente.rpc('revogar_assinatura_ical', { p_escopo: escopo });
    data = resposta.data;
    error = resposta.error;
  } catch {
    return 'erro';
  }
  if (error) {
    const classe = classificarErroAssinatura(error.message ?? '', error.code);
    return classe === 'sem_acesso' ? 'erro' : classe;
  }
  if (!data || typeof data !== 'object' || (data as { revogado?: unknown }).revogado !== true) return 'erro';
  return 'ok';
}
