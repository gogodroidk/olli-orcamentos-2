/**
 * Indicação "colega indica colega" — cliente do worker (/indicacao/*, JWT).
 * A regra inteira mora no servidor (worker/src/indicacao.js + RPCs do Postgres);
 * aqui só se pede o link, se avisa o cartão visto/compartilhado e se pergunta se
 * já dá para pagar a recompensa. Nunca lança: falha vira `null`/`0`.
 */
import { supabase } from './supabase';
import { PAGAMENTOS_URL } from '../config';
import { INDICACAO_TETO_PREMIADAS } from './limitesComerciais.ts';

export type MomentoIndicacao = 'apos_envio' | 'apos_aprovacao' | 'painel';
export type CanalIndicacao = 'whatsapp' | 'copiar' | 'qr';

export interface MeuLinkIndicacao {
  codigo: string;
  link: string;
  /** 0 = recompensa desligada no servidor: não prometer nada. */
  /** Meses de Pro por lado; 0 = recompensa desligada. */
  meses: number;
  teto: number;
  resumo: { recompensadas: number; teto: number } | null;
}

async function chamar(caminho: string, metodo: 'GET' | 'POST', corpo?: unknown): Promise<any | null> {
  if (!PAGAMENTOS_URL || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const r = await fetch(`${PAGAMENTOS_URL}${caminho}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const j: any = await r.json().catch(() => null);
    return r.ok && j?.ok === true ? j : null;
  } catch {
    return null;
  }
}

/** Código + link do prestador (o servidor cria na 1ª vez). `null` = não sei. */
export async function obterMeuLinkIndicacao(): Promise<MeuLinkIndicacao | null> {
  const j = await chamar('/indicacao/meu', 'GET');
  if (!j || typeof j.codigo !== 'string' || typeof j.link !== 'string') return null;
  return { codigo: j.codigo, link: j.link, meses: Number(j.meses) > 0 ? Number(j.meses) : 0, teto: Number(j.teto) > 0 ? Number(j.teto) : INDICACAO_TETO_PREMIADAS, resumo: j.resumo ?? null };
}

export async function registrarEventoIndicacao(evento: 'cartao_visto' | 'compartilhada', momento: MomentoIndicacao, canal?: CanalIndicacao): Promise<void> {
  await chamar('/indicacao/evento', 'POST', { evento, momento, canal: canal ?? null });
}

/**
 * Pede ao servidor para decidir a recompensa do usuário logado (se ele veio por
 * indicação e já fez o 1º orçamento real). Idempotente e seguro de chamar à toa.
 * Devolve os meses de Pro ganhos agora (0 se nada).
 */
export async function verificarRecompensaIndicacao(): Promise<number> {
  const j = await chamar('/indicacao/verificar', 'POST', {});
  return j?.status === 'recompensado' && Number(j.meses) > 0 ? Number(j.meses) : 0;
}

const INTERVALO_VERIFICACAO_MS = 10 * 60 * 1000;
let ultimaVerificacao = 0;

/**
 * Versão para chamar de gatilhos frequentes (sync aplicado): no máximo 1 ida ao
 * servidor a cada 10 min por sessão do app. O orçamento só conta quando já está
 * na nuvem; por isso o gatilho natural é "sync aplicado", não "orçamento salvo".
 */
export async function verificarRecompensaIndicacaoThrottle(agora = Date.now()): Promise<number> {
  if (agora - ultimaVerificacao < INTERVALO_VERIFICACAO_MS) return 0;
  ultimaVerificacao = agora;
  return verificarRecompensaIndicacao();
}
