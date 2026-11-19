import { supabase } from './supabase';
import { PAGAMENTOS_URL } from '../config';

/**
 * Cupom de influenciador — cliente do worker (/cupom/*). A regra inteira mora no servidor
 * (worker/src/cupom.js + RPCs cupom_* do Postgres). Aqui só se pergunta se o recurso está ligado e
 * se o código vale para esta conta, SEM gravar nada. Nunca lança: falha vira `null`.
 */
export interface ConsultaCupom {
  valido: boolean;
  status: string;
  /** Frase pronta do servidor: o desconto escrito, ou o motivo da recusa. */
  texto: string;
  codigo?: string;
  pct?: number;
  de?: number | null;
  por?: number | null;
}

/** O campo de cupom só aparece quando o servidor diz que o recurso está ligado. */
export async function cupomAtivo(): Promise<boolean> {
  if (!PAGAMENTOS_URL) return false;
  try {
    const r = await fetch(`${PAGAMENTOS_URL}/cupom/config`);
    const j: any = await r.json().catch(() => null);
    return r.ok && j?.ok === true && j.ativo === true;
  } catch {
    return false;
  }
}

export async function consultarCupom(codigo: string, plano?: string): Promise<ConsultaCupom | null> {
  if (!PAGAMENTOS_URL || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const r = await fetch(`${PAGAMENTOS_URL}/cupom/consultar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo, plano }),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || j?.ok !== true || typeof j.texto !== 'string') return null;
    return {
      valido: j.valido === true,
      status: String(j.status ?? ''),
      texto: j.texto,
      codigo: typeof j.codigo === 'string' ? j.codigo : undefined,
      pct: typeof j.pct === 'number' ? j.pct : undefined,
      de: typeof j.de === 'number' ? j.de : null,
      por: typeof j.por === 'number' ? j.por : null,
    };
  } catch {
    return null;
  }
}
