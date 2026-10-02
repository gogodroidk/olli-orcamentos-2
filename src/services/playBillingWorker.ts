import { supabase } from './supabase';
import { PAGAMENTOS_URL } from '../config';
import {
  interpretarConfigPlay,
  interpretarVerificacaoPlay,
  type ConfigPlay,
  type ResultadoVerificacaoPlay,
} from './playBillingRegras';

/**
 * playBillingWorker.ts — a conversa do app com o WORKER sobre a Google Play.
 *
 * O app nunca fala com a Google Play Developer API nem vê a conta de serviço: fala
 * com o worker (`/play/*`, ver worker/src/play.js) com o JWT do Supabase. Quem
 * libera o plano é o SERVIDOR, depois de conferir o token da compra na Google — o
 * app nunca libera otimista (mesmo desenho de `pixPlano.ts`).
 *
 *  - `GET  /play/config`    → `{ ligado }`: o kill switch `PLAY_BILLING_MODE` do
 *                             servidor. Sem `ligado: true`, a tela não vende.
 *  - `POST /play/verificar` → `{ purchaseToken, productId, basePlanId }` com o JWT;
 *                             200 `{ ok, plano, vigenteAte }` | 409 `token_de_outra_conta`.
 *
 * Nada aqui lança. Falha de rede/servidor vira 'erro' ("não sei"), nunca "não
 * pago" nem "desligado" — ver `interpretarConfigPlay`/`interpretarVerificacaoPlay`.
 */

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

async function lerJson(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

/** A venda pela Google Play está ligada no servidor? 'erro' = não deu para saber. */
export async function consultarConfigPlay(): Promise<ConfigPlay> {
  if (!PAGAMENTOS_URL) return 'erro';
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/play/config`, {}, 10000);
    return interpretarConfigPlay(r.status, await lerJson(r));
  } catch {
    return 'erro';
  }
}

export interface CompraParaVerificar {
  purchaseToken: string;
  /** SKU da assinatura (`olli_pro`). */
  productId: string;
  /** Plano básico (`mensal`/`anual`), quando se sabe. O servidor confere na API do Google. */
  basePlanId: string | null;
}

/**
 * Pede ao worker para conferir a compra na Google e gravar o plano. Só depois de
 * 'ok' o app chama `finishTransaction` — sem isso a Play estorna em 3 dias, o que
 * é o certo quando o plano não foi entregue.
 */
export async function verificarCompraPlay(compra: CompraParaVerificar): Promise<ResultadoVerificacaoPlay> {
  if (!PAGAMENTOS_URL) return { estado: 'erro' };
  const token = await getToken();
  if (!token) return { estado: 'sem_login' };
  try {
    const r = await fetchComTimeout(`${PAGAMENTOS_URL}/play/verificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        purchaseToken: compra.purchaseToken,
        productId: compra.productId,
        basePlanId: compra.basePlanId,
      }),
    });
    return interpretarVerificacaoPlay(r.status, await lerJson(r));
  } catch {
    return { estado: 'erro' };
  }
}
