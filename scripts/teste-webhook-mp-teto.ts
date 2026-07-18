/**
 * Teto de AMPLIFICAÇÃO do POST /mp/webhook.
 *
 *     node scripts/teste-webhook-mp-teto.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * A FALHA QUE ESTE TESTE TRAVA. Enquanto `MP_WEBHOOK_SECRET` não está no cofre
 * (o estado real de produção hoje), /mp/webhook é PÚBLICO e não tinha teto
 * nenhum: cada POST `?data.id=<qualquer>&type=payment` fazia o worker chamar
 * `GET api.mercadopago.com/v1/payments/<qualquer>` com o MP_ACCESS_TOKEN de
 * produção. Um estranho sem credencial nenhuma dispara chamadas ilimitadas à API
 * do MP em nome do dono; quando o MP passa a recusar aquele token, o GET-confirm
 * falha e o Pix PAGO do cliente deixa de virar crédito. Isto não é gasto de
 * terceiro — é o caminho de confirmação de pagamento sendo derrubado de fora.
 *
 * As quatro propriedades exercidas contra o `handleMercadoPago` REAL
 * (worker/src/mercadopago.js), com fetch trocado — mesmo padrão de
 * teste-webhook-mp-assinatura.ts:
 *
 *   1. limiter NEGA  → 429 e ZERO chamadas ao MP  (o teto existe de verdade)
 *   2. limiter FORA  → passa e confirma no MP     (fail-open: limiter fora não
 *                                                  pode perder webhook de dinheiro)
 *   3. limiter PERMITE → passa e confirma no MP   (não quebrou o caminho feliz)
 *   4. com secret + assinatura VÁLIDA → o limiter NEM É CONSULTADO
 *                                                  (tráfego assinado não é o alvo)
 *
 * Mais a assertiva de FONTE: a checagem tem que vir ANTES do `mpGet`. Um teto
 * conferido depois da chamada paga não é teto — e é uma regressão que passaria
 * em qualquer teste só de comportamento com o limiter permitindo.
 */
import { readFileSync } from 'node:fs';
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

function ler(caminho: string): string {
  return readFileSync(new URL(caminho, import.meta.url), 'utf8');
}

/**
 * Tira comentários antes de buscar no fonte. Aqui isso é obrigatório: o bloco
 * que este teste protege é quase todo prosa explicando POR QUE o teto existe, e
 * ela cita `mpGet`, `MPHOOK_RL` e `checarLimite` em português. Sem remover, as
 * buscas abaixo casariam com o comentário e o teste atestaria a explicação em
 * vez do código. Mesmo helper de scripts/teste-denuncia-ia.ts.
 */
function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ── (A) FONTE: o teto roda ANTES da chamada paga ao MP ───────────────────────
const mpSrc = semComentarios(ler('../worker/src/mercadopago.js'));

const iWebhook = mpSrc.indexOf('async function webhook(');
const corpoWebhook = mpSrc.slice(iWebhook, mpSrc.indexOf('\n}', iWebhook));

const iLimite = corpoWebhook.indexOf('checarLimite(env.MPHOOK_RL');
const iMpGet = corpoWebhook.indexOf('await mpGet(');

console.log('A) fonte — ordem das barreiras');
checar('webhook() consulta o MPHOOK_RL', iLimite >= 0, true);
checar('webhook() chama o mpGet', iMpGet >= 0, true);
checar('o teto vem ANTES do mpGet', iLimite >= 0 && iMpGet >= 0 && iLimite < iMpGet, true);
// fail-open explícito: `sensivel:false`. Se alguém trocar para fail-closed, um
// limiter fora do ar passa a ENGOLIR webhook de pagamento — o oposto do que
// rateLimit.js manda para rota de dinheiro que já é idempotente por resultado.
checar('o teto é fail-open (sensivel:false)', /sensivel:\s*false/.test(corpoWebhook.slice(iLimite, iLimite + 400)), true);
// o binding tem que existir no wrangler, senão `env.MPHOOK_RL` é undefined
// para sempre e o teto é decorativo (checarLimite devolve 'indisponivel').
const wrangler = ler('../worker/wrangler.jsonc');
checar('MPHOOK_RL declarado no wrangler.jsonc', wrangler.includes('"MPHOOK_RL"'), true);

// ── falsos ───────────────────────────────────────────────────────────────────
const PAGAMENTO_MP = {
  id: 987654321,
  status: 'approved',
  external_reference: 'olli:cr:user-mp-teto:pedido-1:c10',
  date_approved: new Date().toISOString(),
};

let chamadasMp = 0;
let limiteEstado: 'permitido' | 'negado' | 'fora' = 'permitido';
let limiteConsultas = 0;

const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  const u = String(url);
  if (u.includes('api.mercadopago.com')) {
    chamadasMp++;
    return new Response(JSON.stringify(PAGAMENTO_MP), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (u.includes('/rest/v1/credit_ledger')) {
    return new Response('', { status: 201 });
  }
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as any;

function envCom(estado: typeof limiteEstado, secret?: string): any {
  limiteEstado = estado;
  const base: any = {
    SUPABASE_URL: 'https://falso.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso',
    MP_ACCESS_TOKEN: 'mp-token-falso',
  };
  if (secret) base.MP_WEBHOOK_SECRET = secret;
  // 'fora' = binding ausente (o que acontece antes do deploy com o namespace novo).
  if (estado !== 'fora') {
    base.MPHOOK_RL = {
      limit: async () => {
        limiteConsultas++;
        return { success: estado === 'permitido' };
      },
    };
  }
  return base;
}

async function chamarWebhook(env: any, extraHeaders: Record<string, string> = {}) {
  chamadasMp = 0;
  limiteConsultas = 0;
  const url = new URL('https://olli.example/mp/webhook?data.id=987654321&type=payment');
  const req = new Request(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', ...extraHeaders },
    body: JSON.stringify({ type: 'payment', data: { id: '987654321' } }),
  });
  const resp = await handleMercadoPago(req, env, url);
  return { status: resp.status, corpo: await resp.json().catch(() => null) };
}

console.log('\nB) comportamento');

// 1. limiter NEGA → 429 e nenhuma chamada ao MP.
const negado = await chamarWebhook(envCom('negado'));
checar('limiter nega → 429', negado.status, 429);
checar('limiter nega → ZERO chamadas ao MP', chamadasMp, 0);

// 2. limiter FORA (binding ausente) → passa. Um limiter indisponível não pode
//    engolir webhook de pagamento: o evento se perderia calado.
const fora = await chamarWebhook(envCom('fora'));
checar('limiter fora → não bloqueia (200)', fora.status, 200);
checar('limiter fora → confirma no MP', chamadasMp, 1);

// 3. caminho feliz.
const permitido = await chamarWebhook(envCom('permitido'));
checar('limiter permite → 200', permitido.status, 200);
checar('limiter permite → confirma no MP', chamadasMp, 1);

// 4. assinatura INVÁLIDA morre em 401 ANTES de qualquer chamada ao MP.
const comSecret = await chamarWebhook(envCom('negado', 'segredo-mp'), { 'x-signature': 'ts=1,v1=deadbeef' });
checar('secret + assinatura inválida → 401', comSecret.status, 401);
checar('assinatura inválida → ZERO chamadas ao MP', chamadasMp, 0);

// 5. tráfego ASSINADO (assinatura VÁLIDA) NÃO passa pelo teto.
//    Este caso é o que prova o `if (!assinado)`, e ele precisa de uma assinatura
//    de verdade: com assinatura inválida o 401 acontece ANTES do teto, então
//    aquele caso não distingue "teto pulado" de "teto aplicado" — foi o furo que
//    o mutation check pegou (a mutação que aplicava o teto a TODO tráfego
//    sobrevivia). Com o secret configurado, quem entrega é o MP; deixar o
//    legítimo competir por balde de IP com o abuso é como se perde pagamento.
const SEGREDO = 'segredo-mp';
const TS = '1770000000';
const REQ_ID = 'req-olli-1';
const manifest = `id:987654321;request-id:${REQ_ID};ts:${TS};`;
const chaveHmac = await crypto.subtle.importKey(
  'raw', new TextEncoder().encode(SEGREDO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
);
const macBuf = await crypto.subtle.sign('HMAC', chaveHmac, new TextEncoder().encode(manifest));
const v1 = [...new Uint8Array(macBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const assinadoOk = await chamarWebhook(envCom('negado', SEGREDO), {
  'x-signature': `ts=${TS},v1=${v1}`,
  'x-request-id': REQ_ID,
});
checar('assinatura válida → 200 mesmo com o limiter NEGANDO', assinadoOk.status, 200);
checar('assinatura válida → limiter nem consultado', limiteConsultas, 0);
checar('assinatura válida → confirma no MP', chamadasMp, 1);

globalThis.fetch = fetchOriginal;

console.log(`\n${passes} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
