/**
 * Teste do webhook de ASSINATURA RECORRENTE do Mercado Pago (preapproval):
 * "evento que não prova o suficiente NÃO reduz direito — responde 200 e não
 * escreve. Nunca tirar plano de quem pagou por causa de um evento ambíguo."
 *
 *     node scripts/teste-webhook-mp-assinatura.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Exercita `handleMercadoPago` REAL (worker/src/mercadopago.js), a rota
 * POST /mp/webhook inteira, contra um Mercado Pago e um Supabase FALSOS (fetch
 * trocado) — mesmo padrão de teste-webhook-events.ts / teste-creditos-voz.ts.
 *
 * O QUE ESTAVA ERRADO (e por que este teste existe): o código antigo tratava
 * QUALQUER status != 'authorized' como "assinatura encerrada" e gravava
 * status:'canceled' + current_period_end:null. Só que `criarAssinatura` cria a
 * preapproval com status 'pending' — e o MP notifica essa criação. Bastava um
 * usuário com Pro pago por Pix TOCAR em "assinar" para perder na hora o plano
 * que já tinha pago, sem ter pago nada de novo.
 */
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { handleMercadoPago } from '../worker/src/mercadopago.js';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const env: any = {
  SUPABASE_URL: 'https://falso.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso',
  MP_ACCESS_TOKEN: 'mp-token-falso',
  // MP_WEBHOOK_SECRET ausente de propósito: sem ele a validação de assinatura é
  // pulada e o GET-confirm (que este teste encena) é a barreira — que é
  // exatamente o estado de produção hoje (ver o comentário do webhook).
};

const USER = 'user-mp-1';
const DAQUI_UM_MES = new Date(Date.now() + 30 * 864e5).toISOString();
const MES_PASSADO = new Date(Date.now() - 30 * 864e5).toISOString();

// ── estado dos falsos ────────────────────────────────────────────────────
let preapprovalMp: any = null; // o que o GET /preapproval/{id} devolve
let linhaAssinatura: any = null; // null = sem linha; 'erro' = PostgREST fora
let preapprovalGravado: any = null; // valor da coluna mp_preapproval_id
let colunaExiste = true; // false emula a migration 20260728 não aplicada
let escritas: any[] = []; // todo upsert que chegou no banco

function reset(opts: {
  preapproval?: any;
  linha?: any;
  gravado?: any;
  colunaExiste?: boolean;
} = {}) {
  preapprovalMp = opts.preapproval ?? null;
  linhaAssinatura = opts.linha ?? null;
  preapprovalGravado = opts.gravado ?? null;
  colunaExiste = opts.colunaExiste !== false;
  escritas = [];
}

(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = String(url);
  const metodo = init?.method ?? 'GET';

  if (u.includes('api.mercadopago.com/preapproval/')) {
    if (!preapprovalMp) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    return { ok: true, status: 200, json: async () => preapprovalMp } as unknown as Response;
  }

  if (u.includes('/rest/v1/assinaturas')) {
    if (metodo === 'POST') { // upsert
      escritas.push(JSON.parse(init?.body || '{}'));
      return { ok: true, status: 201 } as Response;
    }
    // leitura do mp_preapproval_id (select próprio) vs. leitura da linha (stripe.js)
    if (u.includes('select=mp_preapproval_id')) {
      // PostgREST responde 400 quando a coluna não existe (schema antigo).
      if (!colunaExiste) return { ok: false, status: 400, json: async () => ({}) } as unknown as Response;
      return {
        ok: true, status: 200,
        json: async () => (linhaAssinatura && linhaAssinatura !== 'erro' ? [{ mp_preapproval_id: preapprovalGravado }] : []),
      } as unknown as Response;
    }
    if (linhaAssinatura === 'erro') return { ok: false, status: 500 } as Response;
    return {
      ok: true, status: 200,
      json: async () => (linhaAssinatura ? [linhaAssinatura] : []),
    } as unknown as Response;
  }

  throw new Error(`fetch fake não sabe responder por: ${u}`);
};

/** Dispara POST /mp/webhook como o MP dispara (id na query, tipo no corpo). */
async function notificar(dataId: string, tipo = 'subscription_preapproval') {
  const alvo = `https://diagnostico.olliorcamentos.online/mp/webhook?data.id=${encodeURIComponent(dataId)}`;
  const request = new Request(alvo, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: tipo, data: { id: dataId } }),
  });
  const resp = await handleMercadoPago(request, env, new URL(alvo));
  return { status: resp.status, body: await resp.json() };
}

const PRO_PIX_VIGENTE = { user_id: USER, plano: 'pro', status: 'active', current_period_end: DAQUI_UM_MES, stripe_subscription_id: null };

console.log('\n1) O BUG: "pending" (a própria criação da assinatura) NÃO pode apagar o plano pago');
reset({
  preapproval: { id: 'pre-1', status: 'pending', external_reference: `olli:as:${USER}:empresa` },
  linha: PRO_PIX_VIGENTE,
});
{
  const r = await notificar('pre-1');
  checar('responde 200 (MP não reenvia)', r.status, 200);
  checar('e NÃO escreveu nada — o Pro pago por Pix continua de pé', escritas.length, 0);
}

console.log('\n2) "paused" é estado de trânsito (pode voltar a authorized): não reduz');
reset({
  preapproval: { id: 'pre-1', status: 'paused', external_reference: `olli:as:${USER}:pro` },
  linha: PRO_PIX_VIGENTE,
  gravado: 'pre-1',
});
{
  const r = await notificar('pre-1');
  checar('200', r.status, 200);
  checar('não escreveu', escritas.length, 0);
}

console.log('\n3) "cancelled" de OUTRA preapproval (não é a que sustenta o plano): não reduz');
reset({
  preapproval: { id: 'pre-velha', status: 'cancelled', external_reference: `olli:as:${USER}:pro` },
  linha: PRO_PIX_VIGENTE,
  gravado: 'pre-atual',
});
{
  const r = await notificar('pre-velha');
  checar('200', r.status, 200);
  checar('não escreveu (o plano vigente veio de outra origem)', escritas.length, 0);
}

console.log('\n4) "cancelled" sem a coluna gravada (migration 20260728 pendente): não reduz às cegas');
reset({
  preapproval: { id: 'pre-1', status: 'cancelled', external_reference: `olli:as:${USER}:pro` },
  linha: PRO_PIX_VIGENTE,
  colunaExiste: false,
});
{
  const r = await notificar('pre-1');
  checar('200', r.status, 200);
  checar('não escreveu (sem prova de vínculo)', escritas.length, 0);
}

console.log('\n5) "cancelled" DA assinatura vigente, com período pago ainda correndo: mantém até o fim');
reset({
  preapproval: { id: 'pre-1', status: 'cancelled', external_reference: `olli:as:${USER}:pro` },
  linha: { ...PRO_PIX_VIGENTE, current_period_end: DAQUI_UM_MES },
  gravado: 'pre-1',
});
{
  const r = await notificar('pre-1');
  checar('200 com mantido_ate_fim', r.body.mantido_ate_fim, true);
  checar('não escreveu: a vigência expira sozinha e o usuário usa o que pagou', escritas.length, 0);
}

console.log('\n6) "cancelled" da vigente com período JÁ vencido: registra o encerramento sem tirar nada');
reset({
  preapproval: { id: 'pre-1', status: 'cancelled', external_reference: `olli:as:${USER}:pro` },
  linha: { ...PRO_PIX_VIGENTE, current_period_end: MES_PASSADO },
  gravado: 'pre-1',
});
{
  const r = await notificar('pre-1');
  checar('200', r.status, 200);
  checar('escreveu 1x', escritas.length, 1);
  checar('status canceled', escritas[0]?.status, 'canceled');
  checar('e NÃO zerou current_period_end (histórico do que foi pago)', 'current_period_end' in (escritas[0] || {}), false);
}

console.log('\n7) leitura da assinatura fora do ar num evento de término: 503, sem escrever');
reset({
  preapproval: { id: 'pre-1', status: 'cancelled', external_reference: `olli:as:${USER}:pro` },
  linha: 'erro',
});
{
  const r = await notificar('pre-1');
  checar('503 (MP reenvia depois)', r.status, 503);
  checar('não decidiu no escuro', escritas.length, 0);
}

console.log('\n8) "authorized": concede o plano E guarda o mp_preapproval_id (é o que permite cancelar depois)');
reset({
  preapproval: { id: 'pre-nova', status: 'authorized', next_payment_date: DAQUI_UM_MES, external_reference: `olli:as:${USER}:pro` },
  linha: null,
});
{
  const r = await notificar('pre-nova');
  checar('200', r.status, 200);
  checar('escreveu 1x', escritas.length, 1);
  checar('plano pro ativo', `${escritas[0]?.plano}/${escritas[0]?.status}`, 'pro/active');
  checar('com o id da preapproval gravado', escritas[0]?.mp_preapproval_id, 'pre-nova');
}

console.log('\n9) "authorized" de nível MENOR não rebaixa um Empresa vigente (guard preservado)');
reset({
  preapproval: { id: 'pre-nova', status: 'authorized', next_payment_date: DAQUI_UM_MES, external_reference: `olli:as:${USER}:pro` },
  linha: { user_id: USER, plano: 'empresa', status: 'active', current_period_end: new Date(Date.now() + 300 * 864e5).toISOString() },
});
{
  await notificar('pre-nova');
  checar('preserva o nível maior', escritas[0]?.plano, 'empresa');
  checar('e a vigência maior', escritas[0]?.current_period_end, linhaAssinatura.current_period_end);
}

console.log('\n10) external_reference que não é nosso: 200 sem efeito');
reset({ preapproval: { id: 'pre-x', status: 'cancelled', external_reference: 'outra:coisa' }, linha: PRO_PIX_VIGENTE });
{
  const r = await notificar('pre-x');
  checar('sem_vinculo', r.body.sem_vinculo, true);
  checar('não escreveu', escritas.length, 0);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
// `process.exitCode` (não `process.exit()`) — mesma razão do teste-creditos-voz.ts:
// matar o processo com o undici ainda fechando handles já deu crash de libuv aqui.
process.exitCode = falhas === 0 ? 0 : 1;
