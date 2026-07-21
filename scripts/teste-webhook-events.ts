/**
 * Teste da idempotência de webhook (DoD do item O2-17):
 * "Evento persistido antes de processado; event_id único."
 *
 *     node scripts/teste-webhook-events.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Exercita `reivindicarEvento` REAL (worker/src/webhookEvents.js) contra um
 * Supabase FALSO (fetch trocado), encenando o que o PostgREST responde: 201 no
 * insert novo, 409 no índice único `(origem,event_id)`, 5xx quando o banco cai.
 *
 * O que está em jogo: este código decide se uma assinatura PAGA liga ou não.
 * Tratar "já reivindicado" como "já processado" faria um evento que morreu no
 * meio nunca mais rodar — o cliente pagaria e não receberia o plano, calado.
 */
// @ts-expect-error — o worker é JS puro, sem tipos; o teste roda por type stripping.
import { reivindicarEvento } from '../worker/src/webhookEvents.js';

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

const env = { SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso' };
const EVENTO = { origem: 'stripe', eventId: 'evt_123', tipo: 'checkout.session.completed', payload: {} };

/** Troca o fetch global: `insert` = resposta do POST; `status` = o que o GET acha. */
function fingirBanco(insert: number, status?: string | null) {
  (globalThis as any).fetch = async (_url: string, init?: { method?: string }) => {
    const metodo = init?.method ?? 'GET';
    if (metodo === 'POST') return { ok: insert < 300, status: insert } as Response;
    // GET do estadoDoEvento
    if (status === undefined) return { ok: false, status: 500 } as Response;
    return {
      ok: true,
      status: 200,
      json: async () => (status === null ? [] : [{ status }]),
    } as unknown as Response;
  };
}

console.log('\n1) evento novo: insere e processa');
fingirBanco(201);
checar('201 => é seu, processa', await reivindicarEvento(env, EVENTO), { ok: true, duplicado: false });

console.log('\n2) A ARMADILHA: 409 não é "já processado"');
fingirBanco(409, 'processado');
checar('409 + status=processado => PULA (duplicado real)', await reivindicarEvento(env, EVENTO), {
  ok: true,
  duplicado: true,
});
fingirBanco(409, 'recebido');
checar('409 + status=recebido (morreu no meio) => REPROCESSA', await reivindicarEvento(env, EVENTO), {
  ok: true,
  duplicado: false,
  retentativa: true,
});
fingirBanco(409, 'falhou');
checar('409 + status=falhou => REPROCESSA', await reivindicarEvento(env, EVENTO), {
  ok: true,
  duplicado: false,
  retentativa: true,
});

console.log('\n3) 3 estados: "não sei" nunca vira "pode pular"');
fingirBanco(500);
checar('banco fora no insert => ok:false (chamador devolve 5xx p/ reenviar)',
  await reivindicarEvento(env, EVENTO), { ok: false, duplicado: false });
fingirBanco(409, undefined);
checar('409 mas o GET falhou => ok:false, NUNCA duplicado',
  await reivindicarEvento(env, EVENTO), { ok: false, duplicado: false });
fingirBanco(409, null);
checar('409 mas a linha sumiu => ok:false', await reivindicarEvento(env, EVENTO), {
  ok: false,
  duplicado: false,
});

console.log('\n4) sem env/ids não inventa idempotência');
checar('sem service_role => ok:false', await reivindicarEvento({} as any, EVENTO), {
  ok: false,
  duplicado: false,
});
fingirBanco(201);
checar('sem eventId => ok:false', await reivindicarEvento(env, { ...EVENTO, eventId: '' }), {
  ok: false,
  duplicado: false,
});

console.log('\n5) o dano que a armadilha causaria, encenado');
// Cenário real: 1ª tentativa insere (recebido) e MORRE antes de processar.
// A Stripe reenvia. Se o 409 fosse lido como "duplicado", devolveríamos 200 e a
// assinatura PAGA nunca ligaria — perda silenciosa e permanente.
fingirBanco(409, 'recebido');
const reenvio = await reivindicarEvento(env, EVENTO);
checar('reenvio de evento que morreu no meio NÃO é pulado', (reenvio as any).duplicado, false);
checar('e é explicitamente uma retentativa', (reenvio as any).retentativa, true);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
